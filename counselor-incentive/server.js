// Counselor Commission — static file server + a small JSON API.
//
// Source of truth for *who* to show is the sibling "student-details" app's data.json
// (read directly off disk — same machine, no network hop needed). A student surfaces
// here automatically the moment their APPLICATION STATUS is set to "Visa Issued" over
// there, grouped under the same sheet/tab name (the "intake"). Incentive-specific
// numbers (Enrollment, Enrollment from University, New Partnership, Direct Student,
// Flywire, Loan) live only in this app's own commissions.json, keyed by the student's
// stable _id. Each intake's Previous Advance figure lives in advances.json, keyed by
// intake name. Flywire Incentive is auto-derived from Flywire Fee Payment (0.2% of the
// GBP amount, converted to NPR at the day's rate) — that rate is fetched from a public
// API and cached in exchange-rate-cache.json, refreshed at most once per day.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
// This app may be mounted at a sub-path (e.g. https://host/incentive) rather than a
// domain's root — some hosts (this one included) pass the full original path through
// without stripping that prefix, so we strip it ourselves. Set BASE_PATH to whatever
// path was used in "Application URL" (e.g. "/incentive"); leave unset for a root mount.
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
// These let a host's persistent disk (mounted anywhere) hold the data files instead of
// the app folders themselves — unset locally, so local sibling-folder behavior is unchanged.
const DATA_DIR = process.env.COUNSELOR_DATA_DIR || ROOT;
fs.mkdirSync(DATA_DIR, { recursive: true });
const STUDENT_DETAILS_DATA = process.env.STUDENT_DETAILS_DATA_DIR
  ? path.join(process.env.STUDENT_DETAILS_DATA_DIR, 'data.json')
  : path.join(ROOT, '..', 'student-details', 'data.json');
const COMMISSIONS_FILE = path.join(DATA_DIR, 'commissions.json');
const ADVANCES_FILE = path.join(DATA_DIR, 'advances.json');
const EXCHANGE_RATE_FILE = path.join(DATA_DIR, 'exchange-rate-cache.json');
const EXCHANGE_RATE_URL = 'https://api.exchangerate-api.com/v4/latest/GBP';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

// Shared-password protection — only active when both env vars are set (so local dev,
// where they're unset, is unaffected). On a host, set APP_USERNAME/APP_PASSWORD as
// environment variables for this app.
const AUTH_USER = process.env.APP_USERNAME;
const AUTH_PASS = process.env.APP_PASSWORD;

function checkAuth(req) {
  if (!AUTH_USER || !AUTH_PASS) return true; // auth disabled (e.g. local dev)
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  return decoded.slice(0, sep) === AUTH_USER && decoded.slice(sep + 1) === AUTH_PASS;
}

function requireAuth(req, res) {
  if (checkAuth(req)) return true;
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="UK Student NIEC", charset="UTF-8"',
    'Content-Type': 'text/plain',
  });
  res.end('Authentication required.');
  return false;
}

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(ROOT, decodeURIComponent(filePath.split('?')[0]));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(filePath);
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

function readCommissions() {
  try {
    return JSON.parse(fs.readFileSync(COMMISSIONS_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function writeCommissions(data) {
  if (fs.existsSync(COMMISSIONS_FILE)) {
    try { fs.copyFileSync(COMMISSIONS_FILE, path.join(DATA_DIR, 'commissions.backup.json')); } catch (e) { /* non-fatal */ }
  }
  fs.writeFileSync(COMMISSIONS_FILE, JSON.stringify(data, null, 2));
}

function readAdvances() {
  try {
    return JSON.parse(fs.readFileSync(ADVANCES_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function writeAdvances(data) {
  if (fs.existsSync(ADVANCES_FILE)) {
    try { fs.copyFileSync(ADVANCES_FILE, path.join(DATA_DIR, 'advances.backup.json')); } catch (e) { /* non-fatal */ }
  }
  fs.writeFileSync(ADVANCES_FILE, JSON.stringify(data, null, 2));
}

// Student Details -> the fields Counselor Commission cares about. Everything else
// (visa lodge dates, language test, tuition figures, etc.) stays over there — this
// app only needs enough to identify the student and show read-only context alongside
// the incentive fields.
function normalizeStudent(row, intake) {
  return {
    id: row._id,
    intake,
    name: [row['FIRST NAME'], row['LAST NAME']].filter(Boolean).join(' ').trim(),
    course: row['COURSE NAME'] || '',
    university: row['UNIVERSITY NAME'] || '',
    studentId: row['STUDENT ID'] || '',
    visaIssuedDate: row['VISA RECEIVED DATE'] || '',
  };
}

// Reads the Student Details workbook and reshapes it into { intakes, byIntake }, where
// byIntake[sheetName] only ever contains students whose APPLICATION STATUS is exactly
// "Visa Issued" right now. Every sheet becomes an intake tab here, even if it currently
// has zero visa-issued students — the tab should exist and just look empty until one
// shows up, mirroring the sheets over in Student Details 1:1.
function readSync() {
  let raw;
  try {
    raw = fs.readFileSync(STUDENT_DETAILS_DATA, 'utf-8');
  } catch (e) {
    return { ok: false, error: 'Could not find the Student Details data file at ' + STUDENT_DETAILS_DATA, intakes: [], byIntake: {} };
  }
  let workbook;
  try {
    workbook = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'Student Details data file is not valid JSON right now (it may be mid-save) — try again.', intakes: [], byIntake: {} };
  }
  const sheets = Array.isArray(workbook.sheets) ? workbook.sheets : [];
  const intakes = sheets.map((s) => s.name);
  const byIntake = {};
  sheets.forEach((sheet) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    byIntake[sheet.name] = rows
      .filter((r) => r['APPLICATION STATUS'] === 'Visa Issued' && r._id)
      .map((r) => normalizeStudent(r, sheet.name));
  });
  return { ok: true, intakes, byIntake };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function num(v, fallback) {
  const n = parseFloat(v);
  return isNaN(n) ? (fallback || 0) : n;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function readExchangeCache() {
  try {
    return JSON.parse(fs.readFileSync(EXCHANGE_RATE_FILE, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// GBP -> NPR, refetched at most once per day (cached to disk) so entering a Flywire
// Fee Payment doesn't hit the external API on every keystroke.
async function getGbpToNprRate() {
  const today = todayISO();
  const cache = readExchangeCache();
  if (cache && cache.date === today && typeof cache.rate === 'number') {
    return { ok: true, rate: cache.rate, date: cache.date, cached: true };
  }
  try {
    const res = await fetch(EXCHANGE_RATE_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const rate = data && data.rates && data.rates.NPR;
    if (typeof rate !== 'number') throw new Error('NPR rate missing from exchange rate response');
    const record = { date: data.date || today, rate, fetchedAt: new Date().toISOString() };
    fs.writeFileSync(EXCHANGE_RATE_FILE, JSON.stringify(record, null, 2));
    return { ok: true, rate, date: record.date, cached: false };
  } catch (e) {
    // Fall back to a stale cached rate rather than failing outright, if we have one.
    if (cache && typeof cache.rate === 'number') {
      return { ok: true, rate: cache.rate, date: cache.date, stale: true, error: e.message };
    }
    return { ok: false, error: e.message };
  }
}

const server = http.createServer(async (req, res) => {
  if (BASE_PATH && req.url.startsWith(BASE_PATH)) {
    req.url = req.url.slice(BASE_PATH.length) || '/';
  }
  if (!requireAuth(req, res)) return;
  const urlPath = req.url.split('?')[0];

  try {
    if (urlPath === '/api/sync' && req.method === 'GET') {
      return sendJSON(res, 200, readSync());
    }

    if (urlPath === '/api/commissions' && req.method === 'GET') {
      return sendJSON(res, 200, readCommissions());
    }

    const commMatch = urlPath.match(/^\/api\/commissions\/([^/]+)$/);
    if (commMatch && req.method === 'PUT') {
      const id = decodeURIComponent(commMatch[1]);
      const body = await readBody(req);
      const all = readCommissions();
      const existing = all[id] || {};
      all[id] = {
        enrollmentCommission: num(body.enrollmentCommission, existing.enrollmentCommission),
        enrollmentCommissionUni: num(body.enrollmentCommissionUni, existing.enrollmentCommissionUni),
        flywireFeePayment: num(body.flywireFeePayment, existing.flywireFeePayment),
        flywireCommission: num(body.flywireCommission, existing.flywireCommission),
        loanCommission: num(body.loanCommission, existing.loanCommission),
        newPartnershipCommission: num(body.newPartnershipCommission, existing.newPartnershipCommission),
        selfStudentCommission: num(body.selfStudentCommission, existing.selfStudentCommission),
        updatedAt: new Date().toISOString(),
      };
      writeCommissions(all);
      return sendJSON(res, 200, all[id]);
    }

    if (urlPath === '/api/advances' && req.method === 'GET') {
      return sendJSON(res, 200, readAdvances());
    }

    const advMatch = urlPath.match(/^\/api\/advances\/([^/]+)$/);
    if (advMatch && req.method === 'PUT') {
      const intake = decodeURIComponent(advMatch[1]);
      const body = await readBody(req);
      const all = readAdvances();
      all[intake] = {
        previousAdvance: num(body.previousAdvance, 0),
        updatedAt: new Date().toISOString(),
      };
      writeAdvances(all);
      return sendJSON(res, 200, all[intake]);
    }

    if (urlPath === '/api/exchange-rate' && req.method === 'GET') {
      const result = await getGbpToNprRate();
      return sendJSON(res, result.ok ? 200 : 502, result);
    }

    if (urlPath.startsWith('/api/')) {
      return sendJSON(res, 404, { error: 'Not found' });
    }

    serveStatic(req, res);
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`Incentive running at http://localhost:${PORT}`);
  console.log(`Reading student data from ${STUDENT_DETAILS_DATA}`);
});

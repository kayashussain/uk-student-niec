// Incentive — static file server + a small JSON API.
//
// Source of truth for *who* to show is the sibling "student-details" app's data.json
// (read directly off disk — same machine, no network hop needed). A student surfaces
// here automatically the moment their APPLICATION STATUS is set to "Visa Issued" over
// there, grouped under the same sheet/tab name (the "intake"). Incentive-specific
// numbers (Enrollment, Enrollment from University, New Partnership, Direct Student,
// Flywire, Loan) live only in this app's own commissions.json, keyed by the student's
// stable _id. Each intake's Previous Advance figure lives in advances.json, keyed by
// the sheet's id, so renaming a sheet keeps it (see advances.js). Flywire Incentive is
// auto-derived from Flywire Fee Payment (0.2% of the GBP amount, converted to NPR at the
// day's rate) — that rate is fetched from a public
// API and cached in exchange-rate-cache.json, refreshed at most once per day.

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  send, sendJSON, createAuth, createStaticServer, readJSONBody, writeFileAtomic, snapshotDaily, localDate,
} = require('../shared/server-utils');
const { advancesByName, setAdvance } = require('./advances');

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
const MAX_BODY_BYTES = 1024 * 1024;
// Names that would change the stored object's prototype instead of adding an entry.
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Only these files are served. The data files next to them and the server code stay private.
const serveStatic = createStaticServer(ROOT, {
  '/index.html': 'text/html; charset=utf-8',
  '/calc.js': 'text/javascript; charset=utf-8',
  '/favicon.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
});

// Shared-password protection — only active when both env vars are set (so local dev,
// where they're unset, is unaffected). On a host, set APP_USERNAME/APP_PASSWORD as
// environment variables for this app.
const requireAuth = createAuth({ username: process.env.APP_USERNAME, password: process.env.APP_PASSWORD });

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSONAtomic(file, data) {
  writeFileAtomic(file, JSON.stringify(data, null, 2));
}

// Keeps a daily snapshot plus a rolling copy of the previous version before replacing the file.
function writeWithBackup(file, backupName, data) {
  snapshotDaily(file, DATA_DIR, path.basename(file, '.json'));
  if (fs.existsSync(file)) {
    try { fs.copyFileSync(file, path.join(DATA_DIR, backupName)); } catch (e) { /* non-fatal */ }
  }
  writeJSONAtomic(file, data);
}

// Student Details -> the fields Incentive cares about. Everything else (visa lodge dates,
// language test, tuition figures, etc.) stays over there — this app only needs enough to
// identify the student and show read-only context alongside the incentive fields.
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
// has zero visa-issued students — mirroring the sheets over in Student Details 1:1.
// The Student Details sheets as [{ id, name }] (empty if the file can't be read right now).
function readSheetList() {
  try {
    const workbook = JSON.parse(fs.readFileSync(STUDENT_DETAILS_DATA, 'utf-8'));
    return (Array.isArray(workbook.sheets) ? workbook.sheets : [])
      .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
      .map((s) => ({ id: s.id, name: s.name }));
  } catch (e) {
    return [];
  }
}

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
    return { ok: false, error: 'Student Details data file is not valid JSON right now — try again.', intakes: [], byIntake: {} };
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

function num(v, fallback) {
  const n = parseFloat(v);
  return isNaN(n) ? (fallback || 0) : n;
}

// GBP -> NPR, refetched at most once per day (cached to disk) so entering a Flywire
// Fee Payment doesn't hit the external API on every edit.
async function getGbpToNprRate() {
  // fetchedOn is our own calendar day; `date` is the rate's own date from the API, which can lag a day.
  const today = localDate();
  const cache = readJSON(EXCHANGE_RATE_FILE, null);
  if (cache && cache.fetchedOn === today && typeof cache.rate === 'number') {
    return { ok: true, rate: cache.rate, date: cache.date, cached: true };
  }
  try {
    const res = await fetch(EXCHANGE_RATE_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const rate = data && data.rates && data.rates.NPR;
    if (typeof rate !== 'number') throw new Error('NPR rate missing from exchange rate response');
    const record = { date: data.date || today, rate, fetchedOn: today, fetchedAt: new Date().toISOString() };
    writeJSONAtomic(EXCHANGE_RATE_FILE, record);
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
  try {
    const rest = BASE_PATH && req.url.startsWith(BASE_PATH) ? req.url.slice(BASE_PATH.length) : null;
    if (rest !== null && (rest === '' || rest[0] === '/' || rest[0] === '?')) {
      // /incentive -> /incentive/, so the page's relative links (calc.js, favicon) resolve inside this app.
      if (rest === '' || rest.startsWith('?')) {
        return send(res, 301, '', { Location: BASE_PATH + '/' + rest });
      }
      req.url = rest;
    }
    if (!requireAuth(req, res)) return;
    const urlPath = req.url.split('?')[0];

    if (urlPath === '/api/sync' && req.method === 'GET') {
      return sendJSON(res, 200, readSync());
    }

    if (urlPath === '/api/commissions' && req.method === 'GET') {
      return sendJSON(res, 200, readJSON(COMMISSIONS_FILE, {}));
    }

    const commMatch = urlPath.match(/^\/api\/commissions\/([^/]+)$/);
    if (commMatch && req.method === 'PUT') {
      const id = decodeURIComponent(commMatch[1]);
      if (RESERVED_KEYS.has(id)) return sendJSON(res, 400, { error: 'invalid id' });
      const body = await readJSONBody(req, MAX_BODY_BYTES);
      const all = readJSON(COMMISSIONS_FILE, {});
      const existing = all[id] || {};
      // Only the fields in the body change; the rest keep their saved values, so two people editing
      // different fields of the same student don't undo each other.
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
      writeWithBackup(COMMISSIONS_FILE, 'commissions.backup.json', all);
      return sendJSON(res, 200, all[id]);
    }

    if (urlPath === '/api/advances' && req.method === 'GET') {
      return sendJSON(res, 200, advancesByName(readJSON(ADVANCES_FILE, {}), readSheetList()));
    }

    const advMatch = urlPath.match(/^\/api\/advances\/([^/]+)$/);
    if (advMatch && req.method === 'PUT') {
      const intake = decodeURIComponent(advMatch[1]);
      if (RESERVED_KEYS.has(intake)) return sendJSON(res, 400, { error: 'invalid intake' });
      const body = await readJSONBody(req, MAX_BODY_BYTES);
      const entry = { previousAdvance: num(body.previousAdvance, 0), updatedAt: new Date().toISOString() };
      const all = setAdvance(readJSON(ADVANCES_FILE, {}), readSheetList(), intake, entry);
      writeWithBackup(ADVANCES_FILE, 'advances.backup.json', all);
      return sendJSON(res, 200, entry);
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
    const status = e.statusCode || (e instanceof URIError ? 400 : 500);
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJSON(res, status, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`Incentive running at http://localhost:${PORT}`);
  console.log(`Reading student data from ${STUDENT_DETAILS_DATA}`);
});

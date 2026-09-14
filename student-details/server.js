const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
// DATA_DIR lets a host's persistent disk (mounted anywhere) hold data.json instead of
// the app folder itself — unset locally, so local behavior is unchanged.
const DATA_DIR = process.env.STUDENT_DETAILS_DATA_DIR || ROOT;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_FILE = path.join(DATA_DIR, 'data.backup.json');
const MAX_BODY_BYTES = 20 * 1024 * 1024;
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_COLUMNS = [
  'APPLICATION STATUS', 'FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER',
  'UNIVERSITY NAME', 'COURSE NAME', 'RECEVING PARTNER', 'UNIVERSITY PARTNER',
  'LANGUAGE TEST DATE', 'STUDENT ID', 'GROSS FEE', 'SCHOLARSHIP', 'FEE AFTER SCHOLARSHIP',
  'EARLY BIRD DISCOUNT', 'ADDITIONAL DISCOUNT', 'TUITION FEE DEPOSIT(1st Installment)',
  'TUITION FEE DEPOSIT(2nd Installment)', 'REMANING TUITION FEE', 'PRE CAS INTERVIEW',
  'NOC', 'NOC NUMBER', 'MEDICAL REPORT', 'PAYMENT DATE', 'CAS REQUESTED DATE',
  'CAS RECEIVED DATE', 'VISA LODGE DATE', 'VFS ATTENDED DATE', 'VISA RECEIVED DATE',
  'E-VISA', 'UK CONTACT NUMBER',
];

// Only these files are served. data.json, its backups and this server's own code stay private.
const PUBLIC_FILES = {
  '/index.html': 'text/html; charset=utf-8',
  '/app.js': 'text/javascript; charset=utf-8',
  '/style.css': 'text/css; charset=utf-8',
  '/favicon.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
}

// Shared-password protection — only active when both env vars are set (so local dev,
// where they're unset, is unaffected). On a host, set APP_USERNAME/APP_PASSWORD as
// environment variables for this app.
const AUTH_USER = process.env.APP_USERNAME;
const AUTH_PASS = process.env.APP_PASSWORD;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function checkAuth(req) {
  if (!AUTH_USER || !AUTH_PASS) return true; // auth disabled (e.g. local dev)
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  return safeEqual(decoded.slice(0, sep), AUTH_USER) && safeEqual(decoded.slice(sep + 1), AUTH_PASS);
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
  const urlPath = req.url.split('?')[0];
  const name = urlPath === '/' ? '/index.html' : urlPath;
  const type = PUBLIC_FILES[name];
  if (!type) return send(res, 404, 'Not found');
  fs.readFile(path.join(ROOT, name.slice(1)), (err, data) => {
    if (err) return send(res, 404, 'Not found');
    // no-cache: the browser checks for a newer copy every time, so a deploy shows up on a normal reload.
    send(res, 200, data, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  });
}

// Writes to a temporary file and renames it into place, so a crash mid-write, or the Incentive app
// reading the file at that moment, never sees half a file.
function writeFileAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// Once a day, before the first save of that day, copies the file into backups/<prefix>-YYYY-MM-DD.json
// and keeps the latest 60. The rolling data.backup.json only holds the version before the last save,
// so these are what you restore from if something went wrong earlier in the day or week.
function snapshotDaily(file, prefix) {
  try {
    if (!fs.existsSync(file)) return;
    const dir = path.join(DATA_DIR, 'backups');
    const target = path.join(dir, `${prefix}-${new Date().toISOString().slice(0, 10)}.json`);
    if (fs.existsSync(target)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, target);
    fs.readdirSync(dir)
      .filter((f) => f.startsWith(prefix + '-') && f.endsWith('.json'))
      .sort()
      .slice(0, -60)
      .forEach((f) => fs.unlinkSync(path.join(dir, f)));
  } catch (e) {
    console.error('[backup]', e.message); // never block a save over a backup problem
  }
}

function makeRowId() {
  return 'row-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Every row needs a stable _id so other apps (e.g. Incentive) can link to a specific
// student across renames/edits. Assigns one to any row that lacks it.
function ensureRowIds(workbook) {
  (workbook.sheets || []).forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      if (!row._id) row._id = makeRowId();
    });
  });
  return workbook;
}

// Upgrades the legacy single-sheet {columns, rows} shape into {sheets, activeSheetId}, and makes sure
// there's a revision number. Already-migrated files come back unchanged.
function migrateWorkbook(parsed) {
  const workbook = parsed && Array.isArray(parsed.sheets)
    ? parsed
    : {
      sheets: [{ id: 'sheet-1', name: 'Sheet1', columns: (parsed && parsed.columns) || [], rows: (parsed && parsed.rows) || [] }],
      activeSheetId: 'sheet-1',
    };
  if (!Number.isInteger(workbook.revision)) workbook.revision = 0;
  return ensureRowIds(workbook);
}

// Reads data.json, creating a blank workbook on a fresh disk. Throws if the file exists but can't be read.
function readWorkbook() {
  let text;
  try {
    text = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const fresh = {
      revision: 0,
      sheets: [{ id: 'sheet-1', name: 'Sheet1', columns: DEFAULT_COLUMNS, rows: [] }],
      activeSheetId: 'sheet-1',
    };
    writeFileAtomic(DATA_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  const workbook = migrateWorkbook(JSON.parse(text));
  const json = JSON.stringify(workbook, null, 2);
  // Persist the migration once so future reads/writes are already in the new shape.
  if (json !== text) {
    try { writeFileAtomic(DATA_FILE, json); } catch (e) { /* non-fatal */ }
  }
  return workbook;
}

function isValidWorkbook(parsed) {
  return parsed
    && Array.isArray(parsed.sheets)
    && typeof parsed.activeSheetId === 'string'
    && parsed.sheets.every((s) => s && typeof s.id === 'string' && Array.isArray(s.columns) && Array.isArray(s.rows));
}

// Every save says which revision it was based on. If the file has moved on since (another tab or device
// saved first), the save is refused with 409 rather than silently overwriting that work.
function handleSave(req, res) {
  const chunks = [];
  let size = 0;
  let tooBig = false;
  req.on('data', (chunk) => {
    if (tooBig) return;
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      tooBig = true;
      sendJSON(res, 413, { error: 'payload too large' });
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooBig) return;
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      return sendJSON(res, 400, { error: 'invalid JSON' });
    }
    if (!isValidWorkbook(parsed)) return sendJSON(res, 400, { error: 'invalid payload' });
    try {
      let currentRevision;
      try {
        currentRevision = readWorkbook().revision;
      } catch (e) {
        // The file on disk is unreadable: let this save replace it.
        currentRevision = Number.isInteger(parsed.baseRevision) ? parsed.baseRevision : 0;
      }
      if (parsed.baseRevision !== currentRevision) {
        return sendJSON(res, 409, { error: 'conflict', revision: currentRevision });
      }
      const next = ensureRowIds({ revision: currentRevision + 1, sheets: parsed.sheets, activeSheetId: parsed.activeSheetId });
      snapshotDaily(DATA_FILE, 'data');
      if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE); // rolling backup of the previous version
      writeFileAtomic(DATA_FILE, JSON.stringify(next, null, 2));
      sendJSON(res, 200, { ok: true, revision: next.revision });
    } catch (e) {
      console.error('[save]', e);
      sendJSON(res, 500, { error: 'save failed' });
    }
  });
}

const server = http.createServer((req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const urlPath = req.url.split('?')[0];
    if (urlPath === '/api/data' || urlPath === '/api/revision') {
      if (req.method === 'GET') {
        let workbook;
        try {
          workbook = readWorkbook();
        } catch (e) {
          console.error('[read]', e);
          return sendJSON(res, 500, { error: 'Could not read the data file' });
        }
        return sendJSON(res, 200, urlPath === '/api/revision' ? { revision: workbook.revision } : workbook);
      }
      if (req.method === 'POST' && urlPath === '/api/data') return handleSave(req, res);
      return send(res, 405, 'Method not allowed');
    }
    serveStatic(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
});

server.listen(PORT, () => {
  console.log(`UK Student NIEC running at http://localhost:${PORT}`);
});

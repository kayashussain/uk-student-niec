const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
// DATA_DIR lets a host's persistent disk (mounted anywhere) hold data.json instead of
// the app folder itself — unset locally, so local behavior is unchanged.
const DATA_DIR = process.env.STUDENT_DETAILS_DATA_DIR || ROOT;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
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

// Upgrades the legacy single-sheet {columns, rows} shape into {sheets, activeSheetId}.
// Already-migrated files are returned unchanged.
function migrateWorkbook(parsed) {
  if (parsed && Array.isArray(parsed.sheets)) return ensureRowIds(parsed);
  const columns = (parsed && parsed.columns) || [];
  const rows = (parsed && parsed.rows) || [];
  return ensureRowIds({
    sheets: [{ id: 'sheet-1', name: 'Sheet1', columns, rows }],
    activeSheetId: 'sheet-1',
  });
}

function makeRowId() {
  return 'row-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Every row needs a stable _id so other apps (e.g. Counselor Commission) can link to
// a specific student across renames/edits. Assigns one to any row that lacks it —
// a no-op for already-migrated data.
function ensureRowIds(workbook) {
  (workbook.sheets || []).forEach((sheet) => {
    (sheet.rows || []).forEach((row) => {
      if (!row._id) row._id = makeRowId();
    });
  });
  return workbook;
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/data')) {
    if (req.method === 'GET') {
      fs.readFile(DATA_FILE, (err, data) => {
        if (err) {
          if (err.code !== 'ENOENT') {
            return send(res, 500, JSON.stringify({ error: 'read failed' }), { 'Content-Type': 'application/json' });
          }
          // Fresh disk (e.g. first boot on a new host) — seed a blank workbook instead of erroring.
          const fresh = { sheets: [{ id: 'sheet-1', name: 'Sheet1', columns: DEFAULT_COLUMNS, rows: [] }], activeSheetId: 'sheet-1' };
          const json = JSON.stringify(fresh, null, 2);
          try { fs.writeFileSync(DATA_FILE, json); } catch (e) { /* non-fatal */ }
          return send(res, 200, json, { 'Content-Type': 'application/json' });
        }
        let workbook;
        try {
          workbook = migrateWorkbook(JSON.parse(data));
        } catch (e) {
          return send(res, 500, JSON.stringify({ error: 'corrupt data file' }), { 'Content-Type': 'application/json' });
        }
        const json = JSON.stringify(workbook, null, 2);
        // Persist the migration once so future reads/writes are already in the new shape.
        if (json !== data.toString('utf8')) {
          try { fs.writeFileSync(DATA_FILE, json); } catch (e) { /* non-fatal */ }
        }
        send(res, 200, json, { 'Content-Type': 'application/json' });
      });
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (!parsed || !Array.isArray(parsed.sheets) || typeof parsed.activeSheetId !== 'string') {
            throw new Error('bad shape');
          }
          for (const sheet of parsed.sheets) {
            if (!sheet || typeof sheet.id !== 'string' || !Array.isArray(sheet.columns) || !Array.isArray(sheet.rows)) {
              throw new Error('bad sheet shape');
            }
          }
          // keep a rolling backup before overwriting
          if (fs.existsSync(DATA_FILE)) {
            fs.copyFileSync(DATA_FILE, path.join(DATA_DIR, 'data.backup.json'));
          }
          fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
          send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json' });
        } catch (e) {
          send(res, 400, JSON.stringify({ error: 'invalid payload' }), { 'Content-Type': 'application/json' });
        }
      });
      return;
    }
    return send(res, 405, 'Method not allowed');
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`UK Student NIEC running at http://localhost:${PORT}`);
});

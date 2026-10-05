const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  sendJSON, send, createAuth, createStaticServer, readJSONBody, writeFileAtomic, snapshotDaily,
} = require('../shared/server-utils');
const {
  blankWorkbook, ensureRowIds, migrateWorkbook, isValidWorkbook, mergeWorkbooks, createHistory,
} = require('./workbook');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
// DATA_DIR lets a host's persistent disk (mounted anywhere) hold data.json instead of
// the app folder itself — unset locally, so local behavior is unchanged.
const DATA_DIR = process.env.STUDENT_DETAILS_DATA_DIR || ROOT;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_FILE = path.join(DATA_DIR, 'data.backup.json');
const MAX_BODY_BYTES = 20 * 1024 * 1024;
fs.mkdirSync(DATA_DIR, { recursive: true });

// Only these files are served. data.json, its backups and this server's own code stay private.
const serveStatic = createStaticServer(ROOT, {
  '/index.html': 'text/html; charset=utf-8',
  '/app.js': 'text/javascript; charset=utf-8',
  '/calc.js': 'text/javascript; charset=utf-8',
  '/style.css': 'text/css; charset=utf-8',
  '/favicon.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
});

// Shared-password protection — only active when both env vars are set (so local dev,
// where they're unset, is unaffected). On a host, set APP_USERNAME/APP_PASSWORD as
// environment variables for this app.
const requireAuth = createAuth({ username: process.env.APP_USERNAME, password: process.env.APP_PASSWORD });

// Recent revisions, so a save based on one of them can be merged instead of refused.
const history = createHistory();

// Reads data.json, creating a blank workbook on a fresh disk. Throws if the file exists but can't be read.
function readWorkbook() {
  let text;
  try {
    text = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const fresh = blankWorkbook();
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

function writeWorkbook(workbook) {
  snapshotDaily(DATA_FILE, DATA_DIR, 'data');
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE); // rolling backup of the previous version
  writeFileAtomic(DATA_FILE, JSON.stringify(workbook, null, 2));
  history.remember(workbook);
}

// Every save says which revision it was based on. If someone else saved since (another tab or device),
// the two are merged cell by cell against that revision and the merged workbook is sent back. Only if
// that revision is no longer remembered (e.g. after a restart) is the save refused with 409.
async function handleSave(req, res) {
  let parsed;
  try {
    parsed = await readJSONBody(req, MAX_BODY_BYTES);
  } catch (e) {
    return sendJSON(res, e.statusCode || 400, { error: e.message });
  }
  if (!isValidWorkbook(parsed)) return sendJSON(res, 400, { error: 'invalid payload' });
  // A tab opened before a column rename still sends the old names.
  const mine = migrateWorkbook({ sheets: parsed.sheets, activeSheetId: parsed.activeSheetId });
  try {
    let current;
    try {
      current = readWorkbook();
    } catch (e) {
      // The file on disk is unreadable: let this save replace it.
      current = null;
    }
    if (!current || parsed.baseRevision === current.revision) {
      const revision = (current ? current.revision : num(parsed.baseRevision)) + 1;
      writeWorkbook(ensureRowIds({ revision, sheets: mine.sheets, activeSheetId: mine.activeSheetId }));
      return sendJSON(res, 200, { ok: true, revision });
    }
    const base = history.get(parsed.baseRevision);
    if (!base) return sendJSON(res, 409, { error: 'conflict', revision: current.revision });
    const merged = { revision: current.revision + 1, ...mergeWorkbooks(base, current, mine) };
    writeWorkbook(merged);
    return sendJSON(res, 200, { ok: true, revision: merged.revision, merged: true, workbook: merged });
  } catch (e) {
    console.error('[save]', e);
    return sendJSON(res, 500, { error: 'save failed' });
  }
}

// Who is looking at which cell. Everyone shares one login, so people are told apart by a per-tab id
// the page makes up, and shown as "User N" with a colour — never by the login name. Kept in memory
// only: a peer that stops reporting for PRESENCE_TTL_MS simply disappears.
const PRESENCE_TTL_MS = 15000;
const PEER_COLORS = ['#e8710a', '#188038', '#9334e6', '#d93025', '#0b8a8a', '#c2185b', '#7b5e00', '#1a73e8'];
const peers = new Map(); // id -> { n, seen, sheetId, rowId, col, editing }
let nextPeerNumber = 1;

function recordPresence(body) {
  const id = typeof body.id === 'string' ? body.id.slice(0, 40) : '';
  if (!id) return;
  const now = Date.now();
  peers.forEach((p, key) => { if (now - p.seen > PRESENCE_TTL_MS) peers.delete(key); });
  const peer = peers.get(id) || { n: nextPeerNumber++ };
  Object.assign(peer, {
    seen: now,
    sheetId: typeof body.sheetId === 'string' ? body.sheetId : null,
    rowId: typeof body.rowId === 'string' ? body.rowId : null,
    col: typeof body.col === 'string' ? body.col : null,
    editing: Boolean(body.editing),
  });
  peers.set(id, peer);
}

function othersThan(id) {
  const out = [];
  peers.forEach((p, key) => {
    if (key === id) return;
    out.push({
      id: key, name: 'User ' + p.n, color: PEER_COLORS[(p.n - 1) % PEER_COLORS.length],
      sheetId: p.sheetId, rowId: p.rowId, col: p.col, editing: p.editing,
    });
  });
  return out;
}

async function handlePresence(req, res) {
  let body;
  try {
    body = await readJSONBody(req, 4096);
  } catch (e) {
    return sendJSON(res, e.statusCode || 400, { error: e.message });
  }
  recordPresence(body);
  let revision = null;
  try { revision = readWorkbook().revision; } catch (e) { /* the page just won't see a new revision yet */ }
  return sendJSON(res, 200, { revision, peers: othersThan(body.id) });
}

function num(v) {
  return Number.isInteger(v) ? v : 0;
}

try {
  history.remember(readWorkbook());
} catch (e) {
  console.error('[startup] could not read', DATA_FILE, '-', e.message);
}

const server = http.createServer((req, res) => {
  try {
    if (!requireAuth(req, res)) return;
    const urlPath = req.url.split('?')[0];
    if (urlPath === '/api/presence') {
      if (req.method === 'POST') return handlePresence(req, res);
      return send(res, 405, 'Method not allowed');
    }
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

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  sendJSON, send, SECURITY_HEADERS, createActivityLog, createStaticServer, readJSONBody, writeFileAtomic, snapshotDaily,
} = require('../shared/server-utils');
const { createAccounts } = require('../shared/accounts');
const { makePatch, applyPatch } = require('../shared/patch');
const { teamOf, viewFor, teamChanges } = require('../shared/teams');
const {
  blankWorkbook, ensureRowIds, migrateWorkbook, isValidWorkbook, mergeWorkbooks, createHistory, describeChanges,
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
  '/activity.js': 'text/javascript; charset=utf-8',
  '/admin.html': 'text/html; charset=utf-8',
  '/admin.js': 'text/javascript; charset=utf-8',
  '/calc.js': 'text/javascript; charset=utf-8',
  '/style.css': 'text/css; charset=utf-8',
  '/favicon.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
});

// Files shared with the other app: the "Do you really want to make this change?" box, the login
// session helper and the login page (this app answers /login for both, as it sits at the site's root).
const serveShared = createStaticServer(path.join(__dirname, '..', 'shared'), {
  '/edit-guard.js': 'text/javascript; charset=utf-8',
  '/session.js': 'text/javascript; charset=utf-8',
  '/patch.js': 'text/javascript; charset=utf-8',
  '/teams.js': 'text/javascript; charset=utf-8',
  '/login.html': 'text/html; charset=utf-8',
});

// Every login, logout and change, for "Check activity" (Admin only). Kept next to the data, where
// the Incentive app adds its changes too.
const activity = createActivityLog(DATA_DIR);

// One account per person (see shared/accounts.js). Everything except the login page needs a login.
// The account files live next to the data, where the Incentive app reads them too.
const accounts = createAccounts({ dir: DATA_DIR, activity });
const { requireAuth } = accounts;

function recordChanges(req, before, after) {
  const changes = describeChanges(before, after);
  if (changes.length) activity.record(req, req.user, 'Changed', { app: 'Student Details', changes });
}

// Recent revisions, so a save based on one of them can be merged instead of refused.
const history = createHistory();

// The workbook lives in memory: read from data.json once at start, and every save writes it back
// (the file is what survives a restart, and what the Incentive app reads). Nothing re-reads the file
// per request. null if data.json exists but can't be read; the next save then replaces it.
let current = null;

// Reads data.json, creating a blank workbook on a fresh disk. Throws if the file exists but can't be read.
function loadWorkbook() {
  let text;
  try {
    text = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const fresh = blankWorkbook();
    writeFileAtomic(DATA_FILE, JSON.stringify(fresh));
    return fresh;
  }
  const workbook = migrateWorkbook(JSON.parse(text));
  const json = JSON.stringify(workbook);
  // Persist the migration once so future reads/writes are already in the new shape.
  if (json !== text) {
    try { writeFileAtomic(DATA_FILE, json); } catch (e) { /* non-fatal */ }
  }
  return workbook;
}

function writeWorkbook(workbook) {
  snapshotDaily(DATA_FILE, DATA_DIR, 'data');
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE); // rolling backup of the previous version
  writeFileAtomic(DATA_FILE, JSON.stringify(workbook));
  current = workbook;
  served.clear();
  patches.clear();
  history.remember(workbook);
  broadcast();
}

// What each account sees: Admin the whole workbook, a team only its students (shared/teams.js).
const viewKey = (role) => (teamOf(role) ? role : 'admin');

// What GET /api/data sends, made once per revision and view (as text and gzip-compressed), not per request.
const served = new Map(); // view -> { json, gz }
function servedWorkbook(role) {
  const key = viewKey(role);
  if (!served.has(key)) {
    const json = JSON.stringify(viewFor(role, current));
    served.set(key, { json, gz: zlib.gzipSync(json, { level: 6 }) });
  }
  return served.get(key);
}

// Just the changes since an earlier revision, for screens that already have that one. After a save,
// every open screen asks for the same thing, so each answer is made once. null if that revision is
// no longer remembered (the screen then gets the whole workbook).
const patches = new Map(); // "view:since" -> { json, gz }
function servedPatch(role, since) {
  const key = `${viewKey(role)}:${since}`;
  if (patches.has(key)) return patches.get(key);
  const base = since === current.revision ? current : history.get(since);
  if (!base) return null;
  const patch = makePatch(viewFor(role, base), viewFor(role, current));
  if (!patch) return null;
  const json = JSON.stringify({ revision: current.revision, patch });
  const entry = { json, gz: json.length > 1024 ? zlib.gzipSync(json) : null };
  patches.set(key, entry);
  return entry;
}

const CALCULATED_COLUMNS = ['FEE AFTER SCHOLARSHIP', 'REMAINING TUITION FEE'];

// A team's save: its copy only holds its own students, so instead of merging whole workbooks, each
// cell it changed is checked against its rules and written onto the current workbook. Anything
// outside the rules refuses the whole save (the page never offers it, so that means tampering or a
// stale page).
function handleTeamSave(req, res, parsed) {
  const base = current && (parsed.baseRevision === current.revision ? current : history.get(parsed.baseRevision));
  if (!base) return sendJSON(res, 409, { error: 'conflict', revision: current ? current.revision : 0 });
  const baseView = viewFor(req.user.role, base);
  let mineView;
  try {
    mineView = parsed.patch ? applyPatch(baseView, parsed.patch) : { sheets: parsed.sheets };
  } catch (e) {
    return sendJSON(res, 409, { error: 'conflict', revision: current.revision });
  }
  if (!mineView || !Array.isArray(mineView.sheets)) return sendJSON(res, 400, { error: 'invalid payload' });
  const { changes, adds, errors } = teamChanges(req.user.role, baseView, mineView, CALCULATED_COLUMNS);
  if (errors.length) {
    activity.record(req, req.user, 'Change refused', { app: 'Student Details', changes: errors });
    return sendJSON(res, 403, { error: errors.join(' ') });
  }
  if (!changes.length && !adds.length) return sendJSON(res, 200, { ok: true, revision: current.revision });
  // Every changed student must still be one this team sees now (someone may have moved them meanwhile).
  const rowsNow = new Map();
  current.sheets.forEach((s) => s.rows.forEach((r) => rowsNow.set(`${s.id}\u0000${r._id}`, r)));
  const updates = new Map(); // "sheet\0row" -> { col: value }
  for (const c of changes) {
    const key = `${c.sheetId}\u0000${c.rowId}`;
    const row = rowsNow.get(key);
    if (!row || !viewFor(req.user.role, { sheets: [{ rows: [row] }] }).sheets[0].rows.length) {
      return sendJSON(res, 409, { error: 'conflict', revision: current.revision });
    }
    updates.set(key, { ...(updates.get(key) || {}), [c.col]: c.value });
  }
  // New students go at the end of their (visible) sheet, with an id no other student has.
  const allIds = new Set(current.sheets.flatMap((s) => s.rows.map((r) => r._id)));
  const added = new Map(); // sheet id -> [rows]
  for (const a of adds) {
    const sheet = current.sheets.find((s) => s.id === a.sheetId);
    if (!sheet || sheet.hidden || allIds.has(a.row._id) || !/^[\w-]{1,64}$/.test(a.row._id || '')) {
      return sendJSON(res, 409, { error: 'conflict', revision: current.revision });
    }
    allIds.add(a.row._id);
    added.set(a.sheetId, [...(added.get(a.sheetId) || []), a.row]);
  }
  const before = current;
  const next = {
    ...current,
    revision: current.revision + 1,
    sheets: current.sheets.map((s) => ({
      ...s,
      rows: [
        ...s.rows.map((r) => {
          const u = updates.get(`${s.id}\u0000${r._id}`);
          return u ? { ...r, ...u } : r;
        }),
        ...(added.get(s.id) || []),
      ],
    })),
  };
  writeWorkbook(next);
  recordChanges(req, before, next);
  // A student moved to another stage leaves this team's view, and a new one is stored as the server
  // checked it: either way the page fetches its fresh view.
  const reload = adds.length > 0 || changes.some((c) => c.col === 'APPLICATION STATUS');
  return sendJSON(res, 200, { ok: true, revision: next.revision, reload });
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

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
  if (teamOf(req.user.role)) return handleTeamSave(req, res, parsed || {});
  // Usually just the changes since the revision the page has; rebuilt into the whole workbook here.
  // If that revision is gone (e.g. after a restart) the page is told to send the whole workbook.
  if (parsed && parsed.patch && current) {
    const base = parsed.baseRevision === current.revision ? current : history.get(parsed.baseRevision);
    let full = null;
    try {
      full = base && applyPatch(base, parsed.patch);
    } catch (e) { /* doesn't fit: ask for the whole workbook */ }
    if (!full) return sendJSON(res, 412, { error: 'send-full' });
    parsed = { sheets: full.sheets, activeSheetId: full.activeSheetId, baseRevision: parsed.baseRevision };
  }
  if (!isValidWorkbook(parsed)) return sendJSON(res, 400, { error: 'invalid payload' });
  // A tab opened before a column rename still sends the old names.
  const mine = migrateWorkbook({ sheets: parsed.sheets, activeSheetId: parsed.activeSheetId });
  try {
    if (!current || parsed.baseRevision === current.revision) {
      const before = current;
      const revision = (current ? current.revision : num(parsed.baseRevision)) + 1;
      const next = ensureRowIds({ revision, sheets: mine.sheets, activeSheetId: mine.activeSheetId });
      writeWorkbook(next);
      recordChanges(req, before, next);
      return sendJSON(res, 200, { ok: true, revision });
    }
    const base = history.get(parsed.baseRevision);
    if (!base) return sendJSON(res, 409, { error: 'conflict', revision: current.revision });
    const before = current;
    const merged = { revision: current.revision + 1, ...mergeWorkbooks(base, current, mine) };
    writeWorkbook(merged);
    recordChanges(req, before, merged);
    return sendJSON(res, 200, { ok: true, revision: merged.revision, merged: true, workbook: merged });
  } catch (e) {
    console.error('[save]', e);
    return sendJSON(res, 500, { error: 'save failed' });
  }
}

// Who is looking at which cell, shown by their name and a colour (each browser tab has its own id the
// page makes up). Kept in memory only: a peer that stops reporting for PRESENCE_TTL_MS disappears.
const PRESENCE_TTL_MS = 15000;
const PEER_COLORS = ['#e8710a', '#188038', '#9334e6', '#d93025', '#0b8a8a', '#c2185b', '#7b5e00', '#1a73e8'];
const peers = new Map(); // id -> { n, seen, sheetId, rowId, col, editing }
let nextPeerNumber = 1;

function recordPresence(body, user) {
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
    name: user ? user.name : null,
  });
  peers.set(id, peer);
}

function othersThan(id) {
  const out = [];
  peers.forEach((p, key) => {
    if (key === id) return;
    out.push({
      id: key, name: p.name || 'User ' + p.n, color: PEER_COLORS[(p.n - 1) % PEER_COLORS.length],
      sheetId: p.sheetId, rowId: p.rowId, col: p.col, editing: p.editing,
    });
  });
  return out;
}

// Server-sent events: each open tab holds a connection and is pushed the state the moment anything
// changes (someone moves their cursor, someone saves), instead of asking over and over.
const streams = new Map(); // id -> res

function stateFor(id) {
  return { revision: current ? current.revision : null, peers: othersThan(id) };
}

function broadcast() {
  streams.forEach((res, id) => {
    try { res.write('data: ' + JSON.stringify(stateFor(id)) + '\n\n'); } catch (e) { /* closed; cleaned up below */ }
  });
}

function handleEvents(req, res) {
  const id = (new URL(req.url, 'http://x').searchParams.get('id') || '').slice(0, 40);
  if (!id) return send(res, 400, 'id required');
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1000\n\n');
  const old = streams.get(id);
  if (old) try { old.end(); } catch (e) { /* already gone */ }
  streams.set(id, res);
  res.write('data: ' + JSON.stringify(stateFor(id)) + '\n\n');
  req.on('close', () => {
    if (streams.get(id) !== res) return;
    streams.delete(id);
    peers.delete(id); // closed tab: its box vanishes at once
    broadcast();
  });
}
setInterval(() => streams.forEach((res) => { try { res.write(': ping\n\n'); } catch (e) { /* ignore */ } }), 15000).unref();

// Password for "View hidden sheet". Checked here rather than in the page, so it can't be read from
// the page's code. Admin changes it on the Users page (see accounts.hiddenPasswordMatches).
async function handleUnlockHidden(req, res) {
  let body;
  try {
    body = await readJSONBody(req, 1024);
  } catch (e) {
    return sendJSON(res, e.statusCode || 400, { error: e.message });
  }
  if (!accounts.hasHiddenPassword()) {
    return sendJSON(res, 409, { error: "Admin hasn't set a hidden-sheet password yet (Users page)." });
  }
  if (accounts.hiddenPasswordMatches(body && body.password)) {
    activity.record(req, req.user, 'Opened hidden sheets', { app: 'Student Details' });
    return sendJSON(res, 200, { ok: true });
  }
  activity.record(req, req.user, 'Wrong hidden-sheet password', { app: 'Student Details' });
  // A short pause on a wrong guess makes trying many passwords slow.
  setTimeout(() => sendJSON(res, 403, { ok: false }), 800);
}

async function handlePresence(req, res) {
  let body;
  try {
    body = await readJSONBody(req, 4096);
  } catch (e) {
    return sendJSON(res, e.statusCode || 400, { error: e.message });
  }
  recordPresence(body, req.user);
  broadcast();
  return sendJSON(res, 200, stateFor(body.id));
}

function num(v) {
  return Number.isInteger(v) ? v : 0;
}

try {
  current = loadWorkbook();
  history.remember(current);
} catch (e) {
  console.error('[startup] could not read', DATA_FILE, '-', e.message);
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = req.url.split('?')[0];
    if (urlPath === '/login' && req.method === 'GET') {
      req.url = '/login.html';
      return serveShared(req, res);
    }
    if (urlPath === '/favicon.png') return serveStatic(req, res);
    // Logging in, the login steps, /api/me, and Admin's people/devices/settings.
    if (await accounts.handleApi(req, res, urlPath)) return;
    if (!requireAuth(req, res)) return;
    if (urlPath === '/admin' && req.method === 'GET') {
      if (req.user.role !== 'admin') return send(res, 302, '', { Location: '/' });
      req.url = '/admin.html';
      return serveStatic(req, res);
    }
    if (urlPath === '/api/activity' && req.method === 'GET') {
      if (req.user.role !== 'admin') return sendJSON(res, 403, { error: 'Only Admin can see the activity.' });
      return sendJSON(res, 200, activity.latest());
    }
    if (urlPath === '/api/events' && req.method === 'GET') return handleEvents(req, res);
    if (urlPath === '/api/presence') {
      if (req.method === 'POST') return handlePresence(req, res);
      return send(res, 405, 'Method not allowed');
    }
    if (urlPath === '/api/unlock-hidden') {
      if (teamOf(req.user.role)) return sendJSON(res, 403, { error: 'Only Admin can open hidden sheets.' });
      if (req.method === 'POST') return handleUnlockHidden(req, res);
      return send(res, 405, 'Method not allowed');
    }
    if (urlPath === '/api/data' || urlPath === '/api/revision') {
      if (req.method === 'GET') {
        if (!current) return sendJSON(res, 500, { error: 'Could not read the data file' });
        if (urlPath === '/api/revision') return sendJSON(res, 200, { revision: current.revision });
        const since = Number(new URL(req.url, 'http://x').searchParams.get('since'));
        const patch = Number.isInteger(since) && since > 0 ? servedPatch(req.user.role, since) : null;
        if (patch) return send(res, 200, patch.json, JSON_HEADERS, patch.gz);
        const full = servedWorkbook(req.user.role);
        return send(res, 200, full.json, JSON_HEADERS, full.gz);
      }
      if (req.method === 'POST' && urlPath === '/api/data') return handleSave(req, res);
      return send(res, 405, 'Method not allowed');
    }
    if (urlPath === '/edit-guard.js' || urlPath === '/session.js' || urlPath === '/patch.js'
      || urlPath === '/teams.js') return serveShared(req, res);
    serveStatic(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
});

server.listen(PORT, () => {
  console.log(`UK Student NIEC running at http://localhost:${PORT}`);
});

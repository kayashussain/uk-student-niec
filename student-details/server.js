const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  sendJSON, send, SECURITY_HEADERS, createActivityLog, createStaticServer, SHARED_FILES, PUBLIC_SHARED, readJSONBody,
  writeFileAtomic, snapshotDaily, localDate,
} = require('../shared/server-utils');
const { createAccounts } = require('../shared/accounts');
const { makePatch, applyPatch } = require('../shared/patch');
const {
  isAdmin, isManager, isReadOnly, kindOf, teamOf, viewKey, viewFor, teamChanges, canEdit, canColor, canDelete, checkMove, newestSheet, STATUS,
} = require('../shared/teams');
const { buildDashboard } = require('./dashboard-stats');
const { createFacts, viewFacts } = require('./facts');
const { createDirect, viewDirect, MAX_FILE_BYTES } = require('./direct');
const { createBackups, ID: BACKUP_ID, HOUR: BACKUP_HOUR, KEEP_DAYS } = require('./backups');
const { createAdvisorMcp } = require('./advisor-mcp');
const { advancesByName } = require('../counselor-incentive/advances');
const { uniqueNames } = require('../counselor-incentive/incentive-data');
const { createIncentive } = require('../counselor-incentive/incentive');
const { createIncentiveLock } = require('../shared/incentive-lock');
const {
  blankWorkbook, ensureRowIds, migrateWorkbook, isValidWorkbook, mergeWorkbooks, createHistory, describeChanges,
} = require('./workbook');
const { createCards } = require('./cards');
const { createMessages } = require('./messages');
const { createCourseLinks } = require('./course-index');
const { createCourseFinder } = require('./course-finder');
const { createCourseWatch } = require('./course-watch');
const { createPlanning } = require('./planning');
const { createSourceOptions } = require('./source-options');
const CardFields = require('./card-fields');
const { createB2b } = require('./b2b');
const { createPortalApi } = require('./portal-api');
const { partnerAccess, shapeDirect } = require('./partner-access');
const { createUserMail } = require('./user-mail');
const { buildInsights } = require('./insights-engine');
const { createFinder } = require('./finder');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
// DATA_DIR lets a host's persistent disk (mounted anywhere) hold data.json instead of
// the app folder itself. Unset locally, so local behavior is unchanged.
const DATA_DIR = process.env.STUDENT_DETAILS_DATA_DIR || ROOT;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const BACKUP_FILE = path.join(DATA_DIR, 'data.backup.json');
const MAX_BODY_BYTES = 20 * 1024 * 1024;
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 }); // the students' data is private to the account running the server

// Only these files are served. data.json, its backups and this server's own code stay private.
const serveStatic = createStaticServer(ROOT, {
  '/index.html': 'text/html; charset=utf-8',
  '/app.js': 'text/javascript; charset=utf-8',
  '/users.html': 'text/html; charset=utf-8',
  '/users.js': 'text/javascript; charset=utf-8',
  '/activity.html': 'text/html; charset=utf-8',
  '/activity.js': 'text/javascript; charset=utf-8',
  '/dashboard.html': 'text/html; charset=utf-8',
  '/events.html': 'text/html; charset=utf-8',
  '/today.html': 'text/html; charset=utf-8',
  '/today-page.js': 'text/javascript; charset=utf-8',
  '/my-dashboard.html': 'text/html; charset=utf-8',
  '/my-email.html': 'text/html; charset=utf-8',
  '/my-email-page.js': 'text/javascript; charset=utf-8',
  '/my-dashboard-page.js': 'text/javascript; charset=utf-8',
  '/events-page.js': 'text/javascript; charset=utf-8',
  '/dashboard.js': 'text/javascript; charset=utf-8',
  '/dashboard.css': 'text/css; charset=utf-8',
  '/admin.css': 'text/css; charset=utf-8',
  '/fact-file.html': 'text/html; charset=utf-8',
  '/fact-university.html': 'text/html; charset=utf-8',
  '/fact-file.js': 'text/javascript; charset=utf-8',
  '/fact-university.js': 'text/javascript; charset=utf-8',
  '/fact-file.css': 'text/css; charset=utf-8',
  '/direct.html': 'text/html; charset=utf-8',
  '/backup-bar.js': 'text/javascript; charset=utf-8',
  '/direct-page.js': 'text/javascript; charset=utf-8',
  '/calc.js': 'text/javascript; charset=utf-8',
  '/suggest.js': 'text/javascript; charset=utf-8',
  // The portal pages around the sheet: the student card, the compose page, message templates, B2B partners, the decision pages.
  '/card-fields.js': 'text/javascript; charset=utf-8',
  '/portal.css': 'text/css; charset=utf-8',
  '/portal-ui.js': 'text/javascript; charset=utf-8',
  '/student.html': 'text/html; charset=utf-8',
  '/compose.html': 'text/html; charset=utf-8',
  '/bulk.html': 'text/html; charset=utf-8',
  '/bulk-add.html': 'text/html; charset=utf-8',
  '/bulk-add-page.js': 'text/javascript; charset=utf-8',
  '/student-file.js': 'text/javascript; charset=utf-8',
  '/bulk-page.js': 'text/javascript; charset=utf-8',
  '/compose-page.js': 'text/javascript; charset=utf-8',
  '/student-page.js': 'text/javascript; charset=utf-8',
  '/card-drawer.js': 'text/javascript; charset=utf-8',
  '/new-student.js': 'text/javascript; charset=utf-8',
  '/source-picker.js': 'text/javascript; charset=utf-8',
  '/templates.html': 'text/html; charset=utf-8',
  '/templates-page.js': 'text/javascript; charset=utf-8',
  '/b2b.html': 'text/html; charset=utf-8',
  '/agents.html': 'text/html; charset=utf-8',
  '/b2b-page.js': 'text/javascript; charset=utf-8',
  '/dashboard-insights.js': 'text/javascript; charset=utf-8',
  '/fact-finder.js': 'text/javascript; charset=utf-8',
  '/style.css': 'text/css; charset=utf-8',
  '/favicon.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
});

// Files shared with the other app (header, login page, logo, ...). This app answers /login for both,
// as it sits at the site's root.
const serveShared = createStaticServer(path.join(__dirname, '..', 'shared'), SHARED_FILES);

// Every login, logout and change, for Activity page (Admin only). Kept next to the data, where
// the Incentive page adds its changes too.
const activity = createActivityLog(DATA_DIR);

// One account per person (see shared/accounts.js). Everything except the login page needs a login.
// The account files live next to the data.
const accounts = createAccounts({ dir: DATA_DIR, activity });
const { requireAuth } = accounts;
const facts = createFacts(DATA_DIR);
// Partner Universities: Admin only, kept out of the Advisor connector and every other account's reach.
const direct = createDirect(DATA_DIR);
// The student cards (what is known about a student besides the sheet), the message templates, the links typed for single
// courses, the B2B partners and the management records of the Dashboard. Each is a file of its own in the data folder.
const cards = createCards(DATA_DIR);
const messages = createMessages(DATA_DIR);
const courseLinks = createCourseLinks(DATA_DIR);
const sourceOptions = createSourceOptions(DATA_DIR);
const b2b = createB2b(DATA_DIR);
const agents = createB2b(DATA_DIR, { file: 'agents.json', filesFolder: 'agent-files', what: 'agent' });
const planning = createPlanning(DATA_DIR);
// Daily backups (6 p.m., kept 30 days) and Admin's restore (see backups.js). `current` is the students, held in memory below.
const backups = createBackups(DATA_DIR, () => ({
  students: current, facts: facts.all(), partners: direct.all(),
  cards: cards.all(), b2b: b2b.all(), agents: agents.all(), planning: planning.all(), templates: messages.stored(), sourceOptions: sourceOptions.stored(),
}));
setInterval(() => backups.tick(), 5 * 60 * 1000).unref();

// The Incentive page's saved figures (commissions, advances, exchange rate), read-only, so the same Claude connector can also answer
// questions about incentives. They live in the Incentive page's data folder: COUNSELOR_DATA_DIR, or (as on cPanel and with
// deploy.sh) the folder next to this app's data. If it cannot be found, the incentive tools say so instead of showing zeros.
const INCENTIVE_DIR = process.env.COUNSELOR_DATA_DIR || path.join(DATA_DIR, '..', 'counselor-incentive');
function readIncentiveFile(name, fallback) {
  if (!fs.existsSync(INCENTIVE_DIR)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(INCENTIVE_DIR, name), 'utf8'));
  } catch (e) {
    return e.code === 'ENOENT' ? fallback : null; // not saved yet: nothing entered; unreadable: unknown
  }
}

// Read-only door for the Claude Strategy Advisor project. Off unless NIEC_ADVISOR_TOKEN is set (see advisor-mcp.js).
const advisor = createAdvisorMcp({
  token: process.env.NIEC_ADVISOR_TOKEN,
  getWorkbook: () => current,
  getDashboard: (intake) => buildDashboard(current, { sheetId: intake, includeHidden: true }),
  facts,
  incentive: {
    getCommissions: () => readIncentiveFile('commissions.json', {}),
    // Same intake names as the Incentive page (two sheets called "Sep" become "Sep" and "Sep (2)").
    getAdvances: (sheets) => { const names = uniqueNames(sheets); return advancesByName(readIncentiveFile('advances.json', {}) || {}, sheets.map((x, i) => ({ id: x.id, name: names[i] }))); },
    getRate: () => { const c = readIncentiveFile('exchange-rate-cache.json', null); return c && typeof c.rate === 'number' ? { rate: c.rate, date: c.date, fetchedAt: c.fetchedAt || null } : null; },
  },
  memoryDir: path.join(DATA_DIR, 'advisor-memory'),
});

// The Incentive page lives here, at /incentive: Admin only, and behind its own password (INCENTIVE_PASSWORD) on top of the
// login. The Claude connector above does not go through any of this: it reads the same data folder with its own secret address.
const incentiveLock = createIncentiveLock();
const PAGE_PATHS = new Set(['/', '/students', '/dashboard', '/users', '/activity', '/partner-universities', '/fact-file', '/admin',
  '/student', '/compose', '/bulk', '/bulk-add', '/today', '/my-dashboard', '/my-email', '/message-templates', '/b2b-partners', '/agents', '/events']);
const incentive = createIncentive({ dataDir: INCENTIVE_DIR, studentDataFile: DATA_FILE, getWorkbook: () => current, activity });

async function handleIncentive(req, res, urlPath) {
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const inner = urlPath.slice('/incentive'.length);
  if (inner === '') return send(res, 301, '', { Location: '/incentive/' + query }); // so the page's relative links resolve here
  req.url = inner + query;
  if (SHARED_FILES[inner]) return serveShared(req, res); // header, styles, logo: nothing private in them
  const api = inner.startsWith('/api/');
  if (inner === '/api/lock' && req.method === 'POST') { // sent by the Incentive page as it is closed, reloaded or left
    incentiveLock.lock(req.sessionId);
    return sendJSON(res, 200, { ok: true });
  }
  if (!isAdmin(req.user)) {
    if (api) return sendJSON(res, 403, { error: 'Only Admin can see the Incentive page.' });
    return send(res, 302, '', { Location: '/' });
  }
  if (inner === '/api/unlock' && req.method === 'POST') {
    let body;
    try {
      body = await readJSONBody(req, 2048);
    } catch (e) {
      return sendJSON(res, e.statusCode || 400, { error: e.message });
    }
    const result = incentiveLock.unlock(req, body && body.password);
    if (result.ok) {
      activity.record(req, req.user, 'Opened Incentive', { changes: ['Entered the Incentive password'] });
      return sendJSON(res, 200, { ok: true });
    }
    if (result.wrong) activity.record(req, req.user, 'Wrong Incentive password', { changes: ['Typed a wrong Incentive password'] });
    return sendJSON(res, result.status, { error: result.error });
  }
  if (!incentiveLock.isUnlocked(req)) {
    if (api) return sendJSON(res, 403, { error: 'Enter the Incentive password first.', locked: true });
    if (inner === '/' || inner === '/index.html') return incentive.serveLocked(req, res);
    return send(res, 302, '', { Location: '/incentive/' });
  }
  return incentive.handle(req, res, inner);
}

function recordChanges(req, before, after) {
  const changes = describeChanges(before, after);
  if (changes.length) activity.record(req, req.user, 'Changed', { app: 'Student Details', changes });
}

// Recent revisions, so a save based on one of them can be merged instead of refused.
const history = createHistory();

// The workbook lives in memory: read from data.json once at start, and every save writes it back
// (the file is what survives a restart, and what the Incentive page reads). Nothing re-reads the file
// per request. null if data.json exists but can't be read; the next save then replaces it.
let current = null;

// Reads data.json, creating a blank workbook on a fresh disk. Throws if the file exists but can't be read.
function loadWorkbook() {
  let text;
  try {
    text = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // A missing data.json with surviving backups (remounted disk, moved file) is recovered, never silently replaced by a blank workbook.
    const rec = recoverWorkbook();
    if (rec) {
      console.error('[startup] data.json is missing; recovered from', rec.from);
      writeFileAtomic(DATA_FILE, JSON.stringify(rec.workbook));
      return rec.workbook;
    }
    const fresh = blankWorkbook();
    writeFileAtomic(DATA_FILE, JSON.stringify(fresh));
    return fresh;
  }
  let workbook;
  try {
    workbook = migrateWorkbook(looksLikeWorkbook(JSON.parse(text)));
    if (!isValidWorkbook(workbook)) throw new Error('not a workbook');
  } catch (e) {
    // A damaged data.json (a crash mid-write, a bad copy): set it aside and carry on from the newest copy that reads.
    const recovered = recoverWorkbook();
    if (!recovered) throw e;
    const aside = path.join(DATA_DIR, `data.corrupt-${Date.now()}.json`);
    try { fs.renameSync(DATA_FILE, aside); } catch (e2) { /* keep going */ }
    console.error(`[startup] ${DATA_FILE} could not be read (${e.message}); set aside as ${aside}, carried on from ${recovered.from}`);
    writeFileAtomic(DATA_FILE, JSON.stringify(recovered.workbook));
    return recovered.workbook;
  }
  const json = JSON.stringify(workbook);
  // Persist the migration once so future reads/writes are already in the new shape.
  if (json !== text) {
    try { writeFileAtomic(DATA_FILE, json); } catch (e) { /* non-fatal */ }
  }
  return workbook;
}

// The old upgrade step turns anything without sheets (null, {}, a wrong file) into an empty sheet, which would then be saved
// over the students. Only a workbook, or the old single-sheet shape, counts as one; anything else is treated as damaged.
function looksLikeWorkbook(raw) {
  const ok = raw && typeof raw === 'object' && !Array.isArray(raw)
    && (Array.isArray(raw.sheets) || (Array.isArray(raw.columns) && Array.isArray(raw.rows)));
  if (!ok) throw new Error('not a workbook');
  return raw;
}

// The newest backup that reads as a workbook: the rolling one, then the daily copies, newest first.
function recoverWorkbook() {
  let daily = [];
  try {
    daily = fs.readdirSync(path.join(DATA_DIR, 'backups')).filter((f) => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
      .map((f) => path.join(DATA_DIR, 'backups', f));
  } catch (e) { /* none */ }
  for (const file of [BACKUP_FILE, ...daily]) {
    try {
      const workbook = migrateWorkbook(looksLikeWorkbook(JSON.parse(fs.readFileSync(file, 'utf8'))));
      if (isValidWorkbook(workbook)) return { workbook, from: file };
    } catch (e) { /* try the next one */ }
  }
  // Last, the 6 p.m. (and manual) copies in daily-backups, newest first.
  let gz = [];
  try {
    const dir = path.join(DATA_DIR, 'daily-backups');
    gz = fs.readdirSync(dir).filter((f) => /^niec-.*\.json\.gz$/.test(f)).map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch (e) { /* none */ }
  for (const file of gz) {
    try {
      const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
      const workbook = migrateWorkbook(looksLikeWorkbook(snap && snap.students));
      if (isValidWorkbook(workbook)) return { workbook, from: file };
    } catch (e) { /* try the next one */ }
  }
  return null;
}

function writeWorkbook(workbook) {
  // Only a file that was read fine is copied into the backups, so a damaged one never replaces a good copy.
  if (current && fs.existsSync(DATA_FILE)) {
    snapshotDaily(DATA_FILE, DATA_DIR, 'data');
    writeFileAtomic(BACKUP_FILE, fs.readFileSync(DATA_FILE)); // rolling backup of the previous version (whole or not at all)
  } else if (!current && fs.existsSync(DATA_FILE)) {
    try { fs.renameSync(DATA_FILE, path.join(DATA_DIR, `data.corrupt-${Date.now()}.json`)); } catch (e) { /* replaced below */ }
  }
  const json = JSON.stringify(workbook);
  writeFileAtomic(DATA_FILE, json);
  current = workbook;
  served.clear();
  patches.clear();
  history.remember(workbook, json);
  broadcast();
}

// What each account sees: Admin the whole workbook, the Manager every sheet (view only), staff the current intake and
// only their departments' students in it (shared/teams.js). Accounts with the same access share one view.

// What GET /api/data sends, made once per revision and view (as text and gzip-compressed), not per request.
const served = new Map(); // view -> { json, gz }
function servedWorkbook(user) {
  const key = viewKey(user);
  if (!served.has(key)) {
    const json = JSON.stringify(viewFor(user, current));
    served.set(key, { json, gz: zlib.gzipSync(json, { level: 6 }) });
  }
  return served.get(key);
}

// Just the changes since an earlier revision, for screens that already have that one. After a save,
// every open screen asks for the same thing, so each answer is made once. null if that revision is
// no longer remembered (the screen then gets the whole workbook).
const patches = new Map(); // "view:since" -> { json, gz }
function servedPatch(user, since) {
  const key = `${viewKey(user)}:${since}`;
  if (patches.has(key)) return patches.get(key);
  const base = since === current.revision ? current : history.get(since);
  if (!base) return null;
  const patch = makePatch(viewFor(user, base), viewFor(user, current));
  if (!patch) return null;
  const json = JSON.stringify({ revision: current.revision, patch });
  const entry = { json, gz: json.length > 1024 ? zlib.gzipSync(json) : null };
  patches.set(key, entry);
  return entry;
}

// The dashboard numbers, made once per revision, view and intake (they are the same for everyone with
// the same access, and cheap to hold).
const dashboards = new Map();
function servedDashboard(user, intake) {
  const key = `all:${intake}`; // Admin and the Manager see the same numbers, earlier intakes included
  const hit = dashboards.get(key);
  if (hit && hit.revision === current.revision && Date.now() - hit.at < 60000) return hit.json;
  if (dashboards.size > 200) dashboards.clear();
  const json = JSON.stringify(buildDashboard(current, { sheetId: intake, includeHidden: true }));
  dashboards.set(key, { revision: current.revision, at: Date.now(), json });
  return json;
}

const CALCULATED_COLUMNS = ['FEE AFTER SCHOLARSHIP', 'REMAINING TUITION FEE'];
const MAX_CELL_CHARS = 5000;

// A team's cells are plain text (or a number or yes/no), not too long, and in a column the sheet has.
function cellValueError(cells, sheet, user) {
  const columns = new Set((sheet && sheet.columns) || []);
  for (const { col, value } of cells) {
    if (col.startsWith('_')) continue;
    if (!columns.has(col)) return `There is no column called ${col.slice(0, 60)} on this sheet.`;
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) return 'A cell can only hold text.';
    if (col === 'STUDENT SOURCE' && String(value ?? '').trim()) {
      // Only a source the portal offers; a branch is only given by a branch team (it decides who sees the student).
      const v = String(value).trim();
      const known = CardFields.STORED_SOURCES.find((x) => x.toLowerCase() === v.toLowerCase());
      if (!known) return 'Please choose the Student Source from the list.';
      if (CardFields.isBranchValue(known) && user && kindOf(user) !== 'branch') return 'Only a branch can add a student under its own branch.';
    }
    if (String(value ?? '').length > MAX_CELL_CHARS) return `A cell can hold up to ${MAX_CELL_CHARS} characters.`;
  }
  return null;
}

// A team's save: its copy only holds its own students, so instead of merging whole workbooks, each
// cell it changed is checked against its rules and written onto the current workbook. Anything
// outside the rules refuses the whole save (the page never offers it, so that means tampering or a
// stale page).
function teamSave(req, parsed) {
  const base = current && (parsed.baseRevision === current.revision ? current : history.get(parsed.baseRevision));
  if (!base) return { status: 409, body: { error: 'conflict', revision: current ? current.revision : 0 } };
  const baseView = viewFor(req.user, base);
  let mineView;
  try {
    mineView = parsed.patch ? applyPatch(baseView, parsed.patch) : { sheets: parsed.sheets };
  } catch (e) {
    return { status: 409, body: { error: 'conflict', revision: current.revision } };
  }
  if (!mineView || !Array.isArray(mineView.sheets)
    || !mineView.sheets.every((s) => s && typeof s.id === 'string' && Array.isArray(s.rows)
      && s.rows.every((r) => r && typeof r === 'object' && !Array.isArray(r)))) return { status: 400, body: { error: 'invalid payload' } };
  const { changes, adds, deletes, errors } = teamChanges(req.user, baseView, mineView, CALCULATED_COLUMNS);
  if (errors.length) {
    activity.record(req, req.user, 'Change refused', { app: 'Student Details', changes: errors });
    return { status: 403, body: { error: errors.join(' ') } };
  }
  if (!changes.length && !adds.length && !deletes.length) return { status: 200, body: { ok: true, revision: current.revision } };
  if (adds.length > 50) { // a person adds students one or a few at a time; thousands in one save is a mistake or an attack
    activity.record(req, req.user, 'Change refused', { app: 'Student Details', changes: [`Tried to add ${adds.length} students in one save`] });
    return { status: 403, body: { error: 'You can add up to 50 students in one save.' } };
  }
  const conflict = () => ({ status: 409, body: { error: 'conflict', revision: current.revision } });
  // Teams work in the current intake only, as it is now: a page still holding an earlier intake (a newer one was
  // started meanwhile) is sent the fresh view instead of changing the earlier one.
  const intake = newestSheet(current.sheets.filter((s) => !s.hidden));
  const inIntake = (sheetId) => Boolean(intake) && sheetId === intake.id;
  const cellError = cellValueError(changes.map((c) => ({ col: c.col, value: c.value }))
    .concat(adds.flatMap((a) => Object.keys(a.row).map((col) => ({ col, value: a.row[col] })))), intake, req.user);
  if (cellError) return { status: 400, body: { error: cellError } };
  // The rules were checked against the revision the page had, which may be older. Each change is checked again
  // against the student as the server has them now (someone may have moved them on, or changed their source,
  // meanwhile), so an old page can never change what the rules no longer allow.
  const rowsNow = new Map();
  current.sheets.forEach((s) => s.rows.forEach((r) => rowsNow.set(`${s.id}\u0000${r._id}`, r)));
  const seesNow = (row) => viewFor(req.user, { sheets: [{ rows: [row] }] }).sheets[0].rows.length > 0;
  const updates = new Map(); // "sheet\0row" -> { col: value }
  for (const c of changes) {
    const key = `${c.sheetId}\u0000${c.rowId}`;
    const row = rowsNow.get(key);
    if (!row || !inIntake(c.sheetId) || !seesNow(row)) return conflict();
    // The row colour has its own rule (canColor); every other cell except the stage follows the normal edit rule.
    if (c.col === '_color' ? !canColor(req.user, row) : c.col !== STATUS && !canEdit(req.user, c.col, row)) return conflict();
    // A stage is stored without stray spaces ("Application Stage " would not match the rules and the dashboard).
    updates.set(key, { ...(updates.get(key) || {}), [c.col]: c.col === STATUS ? String(c.value ?? '').trim() : c.value });
  }
  for (const c of changes) {
    if (c.col !== STATUS) continue;
    const key = `${c.sheetId}\u0000${c.rowId}`;
    const row = rowsNow.get(key);
    // The move from the stage the student is at now, with their details as they will be saved.
    const from = String(row[STATUS] ?? '').trim();
    const to = String(c.value ?? '').trim();
    if (from === to) continue; // someone already moved them there
    const check = checkMove(req.user, { ...row, ...updates.get(key), 'STUDENT SOURCE': row['STUDENT SOURCE'] }, to, from);
    if (!check.ok) return conflict();
  }
  // A student deleted by the team must still exist and still be one this team may delete.
  const removed = new Set();
  for (const d of deletes) {
    const key = `${d.sheetId}\u0000${d.rowId}`;
    const row = rowsNow.get(key);
    if (!row || !inIntake(d.sheetId) || !seesNow(row) || !canDelete(req.user, row)) return conflict();
    removed.add(key);
  }
  if (adds.some((a) => !inIntake(a.sheetId))) return conflict();
  // New students go at the end of their (visible) sheet, with an id no other student has.
  const allIds = new Set(current.sheets.flatMap((s) => s.rows.map((r) => r._id)));
  const added = new Map(); // sheet id -> [rows]
  for (const a of adds) {
    const sheet = current.sheets.find((s) => s.id === a.sheetId);
    if (!sheet || sheet.hidden || allIds.has(a.row._id) || !/^[\w-]{1,64}$/.test(a.row._id || '')) {
      return { status: 409, body: { error: 'conflict', revision: current.revision } };
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
        ...s.rows.filter((r) => !removed.has(`${s.id}\u0000${r._id}`)).map((r) => {
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
  const reload = adds.length > 0 || deletes.length > 0 || changes.some((c) => c.col === 'APPLICATION STATUS');
  return { status: 200, body: { ok: true, revision: next.revision, reload } };
}

// Answers a team's save (see teamSave, which does the work and is also used when a team adds a student from the card form).
function handleTeamSave(req, res, parsed) {
  const out = teamSave(req, parsed);
  return sendJSON(res, out.status, out.body);
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
  if (isReadOnly(req.user)) return sendJSON(res, 403, { error: 'Your account can only view students.' });
  if (teamOf(req.user)) return handleTeamSave(req, res, parsed || {});
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
const peers = new Map(); // "account:tab" -> { n, tab, seen, sheetId, rowId, col, editing, name }
let nextPeerNumber = 1;
const MAX_STREAMS_PER_ACCOUNT = 20;
// Each tab is known by its account and the id the page made up, so nobody can take over (or close) someone else's.
const tabKey = (user, tab) => `${user ? user.id : '-'}:${tab}`;
const tabOf = (v) => (typeof v === 'string' ? v.slice(0, 40) : '');

function recordPresence(body, user) {
  const tab = tabOf(body.id);
  if (!tab) return;
  const now = Date.now();
  peers.forEach((p, key) => { if (now - p.seen > PRESENCE_TTL_MS) peers.delete(key); });
  const key = tabKey(user, tab);
  const peer = peers.get(key) || { n: nextPeerNumber++, tab };
  Object.assign(peer, {
    seen: now,
    sheetId: typeof body.sheetId === 'string' ? body.sheetId.slice(0, 80) : null,
    rowId: typeof body.rowId === 'string' ? body.rowId.slice(0, 80) : null,
    col: typeof body.col === 'string' ? body.col.slice(0, 80) : null,
    editing: Boolean(body.editing),
    name: user ? user.name : null,
  });
  peers.set(key, peer);
}

// The students each view holds, for showing only the cursors that sit on them (made once per revision and view).
const visibleCells = new Map(); // view -> { revision, set of "sheet\0row" }
function visibleTo(user) {
  const key = viewKey(user);
  const hit = visibleCells.get(key);
  if (hit && current && hit.revision === current.revision) return hit.set;
  const set = new Set();
  if (current) viewFor(user, current).sheets.forEach((sh) => sh.rows.forEach((r) => set.add(`${sh.id}\u0000${r._id}`)));
  visibleCells.set(key, { revision: current ? current.revision : null, set });
  return set;
}

// Everyone else's tabs. Someone who doesn't see a student isn't told who is looking at that student, or where.
function othersThan(key, user) {
  const out = [];
  const seeAll = !user || isAdmin(user);
  const seen = seeAll ? null : visibleTo(user);
  peers.forEach((p, k) => {
    if (k === key) return;
    const shown = seeAll || (p.sheetId && p.rowId && seen.has(`${p.sheetId}\u0000${p.rowId}`));
    if (!shown) return;
    out.push({
      id: p.tab, name: p.name || 'User ' + p.n, color: PEER_COLORS[(p.n - 1) % PEER_COLORS.length],
      sheetId: p.sheetId, rowId: p.rowId, col: p.col, editing: p.editing,
    });
  });
  return out;
}

// Server-sent events: each open tab holds a connection and is pushed the state the moment anything
// changes (someone moves their cursor, someone saves), instead of asking over and over.
const streams = new Map(); // "account:tab" -> { res, user, sessionKey }

// A stream whose login has ended (logged out, removed, disabled) is closed; one whose role or teams changed sees what the
// account sees now. Returns false when the stream was closed.
function refreshStream(entry, key) {
  const user = accounts.userForSessionKey(entry.sessionKey);
  if (!user) {
    streams.delete(key);
    peers.delete(key);
    try { entry.res.end(); } catch (e) { /* already gone */ }
    return false;
  }
  entry.user = user;
  return true;
}

function stateFor(key, user) {
  return { revision: current ? current.revision : null, peers: othersThan(key, user) };
}

function broadcast() {
  streams.forEach((entry, key) => {
    if (!refreshStream(entry, key)) return;
    try { entry.res.write('data: ' + JSON.stringify(stateFor(key, entry.user)) + '\n\n'); } catch (e) { /* closed; cleaned up below */ }
  });
}

function handleEvents(req, res) {
  const tab = tabOf(new URL(req.url, 'http://x').searchParams.get('id') || '');
  if (!tab) return send(res, 400, 'id required');
  const key = tabKey(req.user, tab);
  const prefix = tabKey(req.user, '');
  if (!streams.has(key) && [...streams.keys()].filter((k) => k.startsWith(prefix)).length >= MAX_STREAMS_PER_ACCOUNT) {
    return send(res, 429, 'Too many open tabs.');
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1000\n\n');
  const old = streams.get(key);
  if (old) try { old.res.end(); } catch (e) { /* already gone */ }
  streams.set(key, { res, user: req.user, sessionKey: req.sessionKey });
  res.write('data: ' + JSON.stringify(stateFor(key, req.user)) + '\n\n');
  req.on('close', () => {
    const now = streams.get(key);
    if (!now || now.res !== res) return;
    streams.delete(key);
    peers.delete(key); // closed tab: its box vanishes at once
    broadcast();
  });
}
setInterval(() => streams.forEach((entry, key) => {
  if (!refreshStream(entry, key)) return;
  try { entry.res.write(': ping\n\n'); } catch (e) { /* ignore */ }
}), 15000).unref();

async function handlePresence(req, res) {
  let body;
  try {
    body = await readJSONBody(req, 4096);
  } catch (e) {
    return sendJSON(res, e.statusCode || 400, { error: e.message });
  }
  recordPresence(body, req.user);
  broadcast();
  return sendJSON(res, 200, stateFor(tabKey(req.user, tabOf(body.id)), req.user));
}

// The Fact File: everyone reads it, only Admin changes it.
async function handleFacts(req, res, urlPath) {
  const id = (urlPath.match(/^\/api\/facts\/([a-f0-9]{12})/) || [])[1];
  if (req.method === 'GET') {
    if (!id) return sendJSON(res, 200, facts.list((new URL(req.url, 'http://x').searchParams.get('q') || '').slice(0, 100)));
    const uni = facts.get(id);
    return uni ? sendJSON(res, 200, uni) : sendJSON(res, 404, { error: 'No such university.' });
  }
  if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
  if (!isAdmin(req.user)) return sendJSON(res, 403, { error: 'Only Admin can change the Fact File.' });
  let body;
  try {
    body = await readJSONBody(req, 1024 * 1024);
  } catch (e) {
    return sendJSON(res, e.statusCode || 400, { error: e.message });
  }
  if (!id) {
    const made = facts.create(body && body.name, req.user.label);
    if (made.error) return sendJSON(res, 400, { error: made.error });
    activity.record(req, req.user, 'Edited fact file', { app: 'Student Details', changes: [`Added ${made.university.name} to the Fact File`] });
    return sendJSON(res, 200, made.university);
  }
  if (urlPath.endsWith('/delete')) {
    const gone = facts.remove(id);
    if (gone.error) return sendJSON(res, 404, { error: gone.error });
    activity.record(req, req.user, 'Edited fact file', { app: 'Student Details', changes: [`Removed ${gone.removed.name} from the Fact File`] });
    return sendJSON(res, 200, { ok: true });
  }
  const saved = facts.update(id, body || {}, req.user.label);
  if (saved.error) return sendJSON(res, 400, { error: saved.error });
  activity.record(req, req.user, 'Edited fact file', { app: 'Student Details', changes: [`Updated the Fact File page for ${saved.university.name}`] });
  return sendJSON(res, 200, saved.university);
}

// The request body as it is (an uploaded file), refused past maxBytes.
function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) { failed = true; const err = new Error('Payload too large'); err.statusCode = 413; reject(err); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

// Partner Universities (campuses, commission slabs, agreement details): Admin only, for reading as well as changing.
async function handleDirect(req, res, urlPath) {
  // Admin changes the list; the Manager, the Application and Mock Teams and the branches look at it, each seeing only what
  // partner-access.js allows (no commission and no portal login for a team).
  const level = partnerAccess(req.user).direct;
  if (!level) return sendJSON(res, 403, { error: 'Partner Universities is not open to your account.' });
  if (level !== 'full' && !(req.method === 'GET' && !/\/delete$/.test(urlPath))) return sendJSON(res, 403, { error: 'Only Admin changes Partner Universities.' });
  const id = (urlPath.match(/^\/api\/direct\/([a-f0-9]{12})/) || [])[1];
  // Agreement files: upload (the file itself is the request body), download, remove.
  const fileMatch = urlPath.match(/^\/api\/direct\/[a-f0-9]{12}\/files(?:\/([a-f0-9]{12})(\/delete)?)?$/);
  if (fileMatch) {
    const fid = fileMatch[1];
    if (req.method === 'GET' && fid && !fileMatch[2]) {
      if (level === 'team') return sendJSON(res, 403, { error: 'The agreement files are not open to your account.' });
      const file = direct.agreementFile(id, fid);
      if (!file) return sendJSON(res, 404, { error: 'No such file.' });
      activity.record(req, req.user, 'Downloaded agreement', { app: 'Student Details', changes: [`Downloaded ${file.name}`] });
      return send(res, 200, fs.readFileSync(file.path), {
        'Content-Type': file.type, 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'",
        'Content-Disposition': `attachment; filename="agreement${path.extname(file.path)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      });
    }
    if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
    if (!fid) {
      const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
      let bytes;
      try {
        bytes = await readRawBody(req, MAX_FILE_BYTES);
      } catch (e) {
        return sendJSON(res, e.statusCode || 400, { error: e.statusCode === 413 ? 'That file is too large (the limit is 10 MB).' : e.message });
      }
      const added = direct.addAgreement(id, name, bytes, req.user.label);
      if (added.error) return sendJSON(res, 400, { error: added.error });
      activity.record(req, req.user, 'Edited partner universities', { app: 'Student Details', changes: [`Uploaded the agreement ${added.agreement.name} for ${added.university.name}`] });
      return sendJSON(res, 200, added.university);
    }
    const gone = direct.removeAgreement(id, fid, req.user.label);
    if (gone.error) return sendJSON(res, 404, { error: gone.error });
    activity.record(req, req.user, 'Edited partner universities', { app: 'Student Details', changes: [`Removed the agreement ${gone.removed.name} from ${gone.university.name}`] });
    return sendJSON(res, 200, gone.university);
  }
  if (req.method === 'GET') {
    if (!id) return send(res, 200, JSON.stringify(direct.list().map((u) => shapeDirect(u, level))), JSON_HEADERS);
    const uni = direct.get(id);
    return uni ? send(res, 200, JSON.stringify(shapeDirect(uni, level)), JSON_HEADERS) : sendJSON(res, 404, { error: 'No such university.' });
  }
  if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
  let body;
  try {
    body = await readJSONBody(req, 1024 * 1024);
  } catch (e) {
    return sendJSON(res, e.statusCode || 400, { error: e.message });
  }
  if (!id) {
    const made = direct.create(body && body.name, req.user.label);
    if (made.error) return sendJSON(res, 400, { error: made.error });
    activity.record(req, req.user, 'Edited partner universities', { app: 'Student Details', changes: [`Added ${made.university.name} to Partner Universities`] });
    return sendJSON(res, 200, made.university);
  }
  if (urlPath.endsWith('/delete')) {
    const gone = direct.remove(id);
    if (gone.error) return sendJSON(res, 404, { error: gone.error });
    activity.record(req, req.user, 'Edited partner universities', { app: 'Student Details', changes: [`Removed ${gone.removed.name} from Partner Universities`] });
    return sendJSON(res, 200, { ok: true });
  }
  const saved = direct.update(id, body || {}, req.user.label);
  if (saved.error) return sendJSON(res, 400, { error: saved.error });
  activity.record(req, req.user, 'Edited partner universities', { app: 'Student Details', changes: [`Updated ${saved.university.name} in Partner Universities`] });
  return sendJSON(res, 200, saved.university);
}

function num(v) {
  return Number.isInteger(v) ? v : 0;
}

// The Dashboard's decision figures, made once per version of the students, the cards and the management records (and at
// most 30 seconds old, as the partner lists are read fresh). Admin's version also holds the partner agreements.
const insightsCache = new Map();
function servedInsights(user, intake) {
  const admin = isAdmin(user);
  const key = `${admin ? 'admin' : 'manager'}:${intake}`;
  const hit = insightsCache.get(key);
  const cardsNow = cards.all();
  const planNow = planning.all();
  if (hit && hit.wb === current && hit.cards === cardsNow && hit.plan === planNow && Date.now() - hit.at < 30000) return hit.json;
  if (insightsCache.size > 200) insightsCache.clear();
  const data = buildInsights({
    workbook: current, cards: cardsNow, planning: planNow, sheetId: intake, admin,
    partners: admin ? direct.all() : [], b2b: admin ? b2b.all() : [],
  });
  const json = JSON.stringify(data);
  insightsCache.set(key, { wb: current, cards: cardsNow, plan: planNow, at: Date.now(), json });
  return json;
}

const courseFinder = createCourseFinder();
let portalRef = null;
const courseWatch = createCourseWatch({ dir: DATA_DIR, getIndex: () => (portalRef ? portalRef.courseIndex() : []), facts, finder: courseFinder, courseLinks });
// Each person's own mailbox for emailing students (My email); the office mailbox stays Admin's (see user-mail.js).
const userMail = createUserMail(DATA_DIR);
const portal = createPortalApi({
  getWorkbook: () => current, writeWorkbook, recordChanges, teamSave,
  cards, messages, courseLinks, sourceOptions, courseLinker: courseFinder, courseWatch: () => courseWatch, facts, direct, b2b, agents, planning, accounts, activity,
  insights: servedInsights, finder: createFinder(), calculated: CALCULATED_COLUMNS,
  userMail, officeMailSettings: () => require('../shared/mailer').loadConfig(DATA_DIR),
});

try {
  current = loadWorkbook();
  history.remember(current);
} catch (e) {
  console.error('[startup] could not read', DATA_FILE, '-', e.message);
}

// Admin's restore: the backups on the server, a copy made right now, and putting one back (students, Fact File and
// Partner Universities, each on its own). The data as it is now is saved first, so a restore can be undone.
async function handleRestore(req, res, urlPath) {
  if (!isAdmin(req.user)) return sendJSON(res, 403, { error: 'Only Admin can restore data.' });
  if (urlPath === '/api/restore/backups' && req.method === 'GET') {
    return sendJSON(res, 200, {
      backups: backups.list(), keepDays: KEEP_DAYS, hour: BACKUP_HOUR, nextDue: backups.dueDay(),
      now: { students: current ? current.sheets.reduce((n, s) => n + s.rows.length, 0) : null, facts: facts.list().length, partners: direct.list().length },
    });
  }
  if (urlPath === '/api/restore/compare' && req.method === 'GET') {
    const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
    if (!BACKUP_ID.test(id)) return sendJSON(res, 400, { error: 'Choose a backup to compare.' });
    const snap = backups.read(id);
    if (!snap) return sendJSON(res, 404, { error: 'That backup could not be read.' });
    return sendJSON(res, 200, backups.compare(snap, { students: current, facts: facts.all(), partners: direct.all() }));
  }
  // Look at a backup (read only): the real pages (Student Details, Fact File, Partner Universities) are opened on the
  // backup's data with ?backup=ID and ask for it here, in the same shape the live data has.
  const snapMatch = urlPath.match(/^\/api\/restore\/snapshot\/([a-z0-9-]+)\/(data|facts|partners)(?:\/([a-f0-9]{12}))?$/);
  if (snapMatch && req.method === 'GET') {
    const [, id, part, itemId] = snapMatch;
    if (!BACKUP_ID.test(id)) return sendJSON(res, 400, { error: 'Choose a backup to look at.' });
    const snap = backups.read(id);
    if (!snap) return sendJSON(res, 404, { error: 'That backup could not be read.' });
    const noStore = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (part === 'data') {
      if (!snap.students || !Array.isArray(snap.students.sheets)) return sendJSON(res, 404, { error: 'That backup has no students.' });
      activity.record(req, req.user, 'Viewed backup', { app: 'Student Details', changes: [`Opened the students in the backup ${id}`] });
      const mine = migrateWorkbook({ sheets: JSON.parse(JSON.stringify(snap.students.sheets)), activeSheetId: snap.students.activeSheetId });
      return send(res, 200, JSON.stringify({ revision: 0, sheets: mine.sheets, activeSheetId: mine.activeSheetId }), noStore);
    }
    const items = snap[part === 'facts' ? 'facts' : 'partners'];
    if (!Array.isArray(items)) return sendJSON(res, 404, { error: 'That backup does not hold this part.' });
    const view = part === 'facts' ? viewFacts(items) : viewDirect(items);
    if (!itemId) return send(res, 200, JSON.stringify(view.list(new URL(req.url, 'http://x').searchParams.get('q') || '')), noStore);
    const one = view.get(itemId);
    return one ? send(res, 200, JSON.stringify(one), noStore) : sendJSON(res, 404, { error: 'No such university in that backup.' });
  }
  if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
  let body;
  try {
    body = await readJSONBody(req, 4096);
  } catch (e) {
    return sendJSON(res, e.statusCode || 400, { error: e.message });
  }
  if (urlPath === '/api/restore/backup-now') {
    if (!current) return sendJSON(res, 500, { error: 'Could not read the data file' });
    const id = backups.create('manual');
    activity.record(req, req.user, 'Backup made', { app: 'Student Details', changes: [`Saved a backup copy now (${id})`] });
    return sendJSON(res, 200, { id });
  }
  if (urlPath !== '/api/restore') return send(res, 404, 'Not found');
  const id = String(body.id || '');
  const parts = (Array.isArray(body.parts) ? body.parts : []).filter((p) => ['students', 'facts', 'partners', 'cards', 'records'].includes(p));
  if (!BACKUP_ID.test(id)) return sendJSON(res, 400, { error: 'Choose a backup to restore.' });
  if (!parts.length) return sendJSON(res, 400, { error: 'Choose what to restore.' });
  const snap = backups.read(id);
  if (!snap) return sendJSON(res, 404, { error: 'That backup could not be read.' });
  // Check everything before changing anything.
  if (parts.includes('students') && !isValidWorkbook(snap.students)) return sendJSON(res, 400, { error: 'The students in that backup could not be read, so nothing was restored.' });
  if (parts.includes('facts') && !Array.isArray(snap.facts)) return sendJSON(res, 400, { error: 'That backup has no Fact File, so nothing was restored.' });
  if (parts.includes('partners') && !Array.isArray(snap.partners)) return sendJSON(res, 400, { error: 'That backup has no Partner Universities, so nothing was restored.' });
  if (parts.includes('cards') && (!snap.cards || typeof snap.cards !== 'object')) return sendJSON(res, 400, { error: 'That backup has no student cards, so nothing was restored.' });
  if (parts.includes('records') && !snap.planning && !Array.isArray(snap.b2b) && !snap.templates) return sendJSON(res, 400, { error: 'That backup has no B2B partners or Dashboard records, so nothing was restored.' });
  const safety = backups.create('before-restore');
  const done = [];
  if (parts.includes('students')) {
    const mine = migrateWorkbook({ sheets: snap.students.sheets, activeSheetId: snap.students.activeSheetId });
    // Also when data.json could not be read: then this is exactly what the restore is for. The revision moves past both, so
    // no open page mistakes the restored students for a version it already has.
    const revision = Math.max(current ? current.revision : 0, Number(snap.students.revision) || 0) + 1;
    writeWorkbook(ensureRowIds({ revision, sheets: mine.sheets, activeSheetId: mine.activeSheetId }));
    done.push('the students');
  }
  if (parts.includes('facts')) { facts.restoreAll(snap.facts); done.push('the Fact File'); }
  if (parts.includes('partners')) { direct.restoreAll(snap.partners); done.push('the Partner Universities'); }
  if (parts.includes('cards')) { cards.restoreAll(snap.cards); done.push('the student cards'); }
  if (parts.includes('records')) {
    if (Array.isArray(snap.b2b)) b2b.restoreAll(snap.b2b);
    if (Array.isArray(snap.agents)) agents.restoreAll(snap.agents);
    if (snap.planning) planning.restoreAll(snap.planning);
    if (snap.templates) messages.restoreAll(snap.templates);
    if (snap.sourceOptions) sourceOptions.restoreAll(snap.sourceOptions);
    done.push('the B2B partners, the Dashboard records and the message templates');
  }
  activity.record(req, req.user, 'Restored data', { app: 'Student Details', changes: [`Restored ${done.join(', ')} from the backup ${id}. The data as it was before is saved as ${safety}`] });
  return sendJSON(res, 200, { ok: true, restored: done, safety });
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = req.url.split('?')[0];
    backups.tick(); // the day's 6 p.m. copy, if it is due and missing (the host may have put the server to sleep)
    if (urlPath === '/login' && req.method === 'GET') {
      req.url = '/login.html';
      return serveShared(req, res);
    }
    // For an uptime monitor: answers without a login and says nothing about the data.
    if (urlPath === '/healthz' && req.method === 'GET') return sendJSON(res, 200, { ok: true });
    // The product name and the company name, for the login page and the menu: nothing private.
    if (urlPath === '/api/brand' && req.method === 'GET') {
      const sig = messages.signature();
      return sendJSON(res, 200, { product: 'ISR', company: sig.company, short: sig.short });
    }
    // The consultancy's logo, for the menu and the login page (nothing private): the consultancy's own brand-logo.png in the data
    // folder wins; the file shipped in shared/ is only the first installation's starting logo.
    if (urlPath === '/brand-logo.png' && req.method === 'GET') {
      let logo = null;
      for (const f of [path.join(DATA_DIR, 'brand-logo.png'), path.join(ROOT, '..', 'shared', 'brand-logo.png')]) { try { logo = fs.readFileSync(f); break; } catch (e) { /* the next one */ } }
      return logo ? send(res, 200, logo, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }) : send(res, 404, 'Not found');
    }
    if (urlPath === '/favicon.png') return serveStatic(req, res);
    if (PUBLIC_SHARED.has(urlPath)) return serveShared(req, res); // the logo, for the login page
    // The Advisor connector checks its own secret in the address, so it answers before the login.
    if (await advisor.handle(req, res, urlPath)) return;
    // Logging in, the login steps, /api/me, and Admin's people/devices/settings.
    if (await accounts.handleApi(req, res, urlPath)) return;
    if (!requireAuth(req, res)) return;

    // Going to any other page of the site locks Incentive again, so its password is asked every time.
    if (req.method === 'GET' && PAGE_PATHS.has(urlPath)) incentiveLock.lock(req.sessionId);
    if (urlPath === '/commission' || urlPath.startsWith('/commission/')) return send(res, 301, '', { Location: '/incentive/' }); // the old address of Incentive
    if (urlPath === '/incentive' || urlPath.startsWith('/incentive/')) return await handleIncentive(req, res, urlPath);

    // The pages. The Manager lands on the dashboard; Admin-only pages send anyone else back home.
    const home = '/today';
    if (req.method === 'GET') {
      const page = {
        '/students': 'index.html', '/dashboard': 'dashboard.html', '/users': 'users.html', '/activity': 'activity.html', '/partner-universities': 'direct.html',
        '/student': 'student.html', '/compose': 'compose.html', '/bulk': 'bulk.html', '/bulk-add': 'bulk-add.html', '/today': 'today.html', '/my-dashboard': 'my-dashboard.html', '/my-email': 'my-email.html', '/message-templates': 'templates.html', '/b2b-partners': 'b2b.html', '/agents': 'agents.html', '/events': 'events.html',
      }[urlPath];
      if (urlPath === '/') return send(res, 302, '', { Location: '/today' });
      if (urlPath === '/fact-file') { // the list, or one university's page (?u=...); every account may read
        req.url = new URL(req.url, 'http://x').searchParams.get('u') ? '/fact-university.html' : '/fact-file.html';
        return serveStatic(req, res);
      }
      if (urlPath === '/admin') return send(res, 302, '', { Location: isAdmin(req.user) ? '/users' : home }); // the old address
      // A team's Dashboard is its own page (My dashboard); Admin and the Manager keep the full one.
      const fullDashboard = isAdmin(req.user) || (isManager(req.user) && isReadOnly(req.user));
      if (urlPath === '/dashboard' && !fullDashboard && !isManager(req.user)) return send(res, 302, '', { Location: '/my-dashboard' });
      if (urlPath === '/my-dashboard' && fullDashboard) return send(res, 302, '', { Location: '/dashboard' });
      if (page) {
        // Every account opens the sheet, a student card and the compose page (each shows only the students the account sees);
        // the Dashboard is for Admin and the Manager; the partner pages and Message templates as partner-access.js says; the rest is Admin's.
        const access = partnerAccess(req.user);
        const shared = { '/partner-universities': access.direct, '/b2b-partners': access.b2b, '/agents': access.agents, '/message-templates': access.templates }[urlPath];
        const allowed = Boolean(shared) || ['/students', '/student', '/today', '/my-dashboard', '/my-email'].includes(urlPath) || (['/compose', '/bulk', '/bulk-add'].includes(urlPath) && !isReadOnly(req.user)) || (['/dashboard', '/events'].includes(urlPath) ? (isAdmin(req.user) || isManager(req.user)) : isAdmin(req.user));
        if (!allowed) return send(res, 302, '', { Location: home + (String(home).includes('?') ? '&' : '?') + 'notice=admin' });
        req.url = '/' + page;
        return serveStatic(req, res);
      }
    }
    if (urlPath === '/api/demo' && req.method === 'GET') return sendJSON(res, 200, { demo: process.env.ISR_DEMO === '1' });
    // What this account sees of the partner pages and Message templates (the pages hide what is not theirs to change).
    if (urlPath === '/api/partner-access' && req.method === 'GET') return sendJSON(res, 200, partnerAccess(req.user));
    if (urlPath === '/api/dashboard' && req.method === 'GET') {
      if (!isAdmin(req.user) && !isManager(req.user)) return sendJSON(res, 403, { error: 'The dashboard is for Admin and the Manager.' });
      if (!current) return sendJSON(res, 500, { error: 'Could not read the data file' });
      const intake = new URL(req.url, 'http://x').searchParams.get('intake') || '';
      return send(res, 200, servedDashboard(req.user, intake), JSON_HEADERS);
    }
    if (urlPath === '/api/activity' && req.method === 'GET') {
      if (!isAdmin(req.user)) return sendJSON(res, 403, { error: 'Only Admin can see the activity.' });
      const q = new URL(req.url, 'http://x').searchParams;
      const num = (name, fallback) => (Number.isInteger(Number(q.get(name))) && q.get(name) !== null ? Number(q.get(name)) : fallback);
      return sendJSON(res, 200, activity.query({
        account: q.get('account') || '', category: q.get('category') || '', from: q.get('from') || '', to: q.get('to') || '',
        q: (q.get('q') || '').slice(0, 100), limit: Math.min(Math.max(num('limit', 100), 1), 500), offset: Math.max(num('offset', 0), 0),
      }));
    }
    if (urlPath === '/api/activity/clear' && req.method === 'POST') {
      if (!isAdmin(req.user)) return sendJSON(res, 403, { error: 'Only Admin can clear the activity.' });
      activity.clear();
      activity.record(req, req.user, 'Cleared activity', { changes: ['Deleted the saved activity; the record starts again from here'] });
      return sendJSON(res, 200, { ok: true });
    }
    // Admin's backups: a copy of all students or of the Fact File to keep, and what the server has copied by itself.
    const backupMatch = urlPath.match(/^\/api\/backup\/(students|fact-file)\.json$/);
    if (backupMatch && req.method === 'GET') {
      if (!isAdmin(req.user)) return sendJSON(res, 403, { error: 'Only Admin can make backups.' });
      const which = backupMatch[1];
      if (which === 'students' && !current) return sendJSON(res, 500, { error: 'Could not read the data file' });
      const data = which === 'students' ? current : { universities: facts.all() };
      activity.record(req, req.user, 'Downloaded backup', { changes: [which === 'students' ? 'Downloaded a copy of all students' : 'Downloaded a copy of the Fact File'] });
      return send(res, 200, JSON.stringify(data, null, 1), {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="uk-student-niec-${which}-${localDate()}.json"`,
      });
    }
    if (urlPath === '/api/facts' || /^\/api\/facts\/[a-f0-9]{12}(\/delete)?$/.test(urlPath)) return await handleFacts(req, res, urlPath);
    // The student cards and the pages around them (portal-api.js).
    if (await portal.handle(req, res, urlPath)) return;
    if (urlPath === '/api/direct' || /^\/api\/direct\/[a-f0-9]{12}(\/delete|\/files(\/[a-f0-9]{12}(\/delete)?)?)?$/.test(urlPath)) return await handleDirect(req, res, urlPath);
    if (urlPath === '/api/restore' || urlPath.startsWith('/api/restore/')) return await handleRestore(req, res, urlPath);
    if (urlPath === '/api/events' && req.method === 'GET') return handleEvents(req, res);
    if (urlPath === '/api/presence') {
      if (req.method === 'POST') return await handlePresence(req, res);
      return send(res, 405, 'Method not allowed');
    }
    if (urlPath === '/api/data' || urlPath === '/api/revision') {
      if (req.method === 'GET') {
        if (!current) return sendJSON(res, 500, { error: 'Could not read the data file' });
        if (urlPath === '/api/revision') return sendJSON(res, 200, { revision: current.revision });
        const since = Number(new URL(req.url, 'http://x').searchParams.get('since'));
        const patch = Number.isInteger(since) && since > 0 ? servedPatch(req.user, since) : null;
        if (patch) return send(res, 200, patch.json, JSON_HEADERS, patch.gz);
        const full = servedWorkbook(req.user);
        return send(res, 200, full.json, JSON_HEADERS, full.gz);
      }
      if (req.method === 'POST' && urlPath === '/api/data') return await handleSave(req, res);
      return send(res, 405, 'Method not allowed');
    }
    if (SHARED_FILES[urlPath]) return serveShared(req, res);
    // The page files of the Admin-only pages are Admin-only too (their data was already refused; now their shells are as well).
    const pageAccess = partnerAccess(req.user);
    const sharedPage = { '/direct.html': pageAccess.direct, '/b2b.html': pageAccess.b2b, '/agents.html': pageAccess.agents, '/templates.html': pageAccess.templates }[urlPath];
    if (['/users.html', '/activity.html', '/direct.html', '/dashboard.html', '/templates.html', '/b2b.html', '/agents.html', '/events.html'].includes(urlPath) && !isAdmin(req.user) && !sharedPage
      && !(['/dashboard.html', '/events.html'].includes(urlPath) && isManager(req.user))) return send(res, 302, '', { Location: home + (String(home).includes('?') ? '&' : '?') + 'notice=admin' });
    serveStatic(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
});

// One bad request must never stop the app for everyone: a failure nobody caught is written to the log and the
// server keeps running (a request that failed this way is answered with a server error by the handler above).
process.on('unhandledRejection', (err) => console.error('[unhandled]', err));
process.on('uncaughtException', (err) => console.error('[uncaught]', err));

// A connection that sends its request very slowly is closed instead of being held for minutes.
server.headersTimeout = 15000;
server.requestTimeout = 60000;

server.listen(PORT, () => {
  console.log(`ISR running at http://localhost:${PORT}`);
});

// The weekly check of the course pages (course-watch.js): a slice of the courses every six hours, so each is visited about once a week.
// The first one starts ten minutes after the server does. COURSE_WATCH=off switches it off.
portalRef = portal;
if (process.env.COURSE_WATCH !== 'off') {
  const tick = () => courseWatch.run().then((r) => { if (r && r.checked) console.log(`Course pages checked: ${r.checked}`); }).catch((e) => console.log(`Course page check stopped: ${e.message}`));
  setTimeout(tick, 10 * 60 * 1000).unref();
  setInterval(tick, 6 * 60 * 60 * 1000).unref();
}

// A restart (pm2, cPanel) lets requests in progress finish, closes the live streams and then exits. Saves are written whole
// before they are answered, so nothing is half written. A forced exit follows after 5 seconds if something hangs on.
function shutDown() {
  streams.forEach(({ res }) => { try { res.end(); } catch (e) { /* already closed */ } });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

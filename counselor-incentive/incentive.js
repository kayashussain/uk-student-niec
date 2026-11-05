// Incentive: the page, its JSON API and its live updates. It runs inside the main app (student-details/server.js) at
// /incentive, after the login, the Admin-only check and the Incentive password (see shared/incentive-lock.js), so
// everything here can assume the person is allowed. There is no separate app any more.
//
// Source of truth for *who* to show is the sibling "student-details" app's data.json
// (read directly off disk, same machine, no network hop needed). A student surfaces
// here automatically the moment their APPLICATION STATUS is set to "Visa Issued" over
// there, grouped under the same sheet/tab name (the "intake"). Incentive-specific
// numbers (Enrollment, Enrollment from University, New Partnership,
// Flywire, Loan) live only in this app's own commissions.json, keyed by the student's
// stable _id. Each intake's Previous Advance (and basic salary / salary months for the
// earnings comparison) lives in advances.json, keyed by
// the sheet's id, so renaming a sheet keeps it (see advances.js). Flywire Incentive is
// auto-derived from Flywire Fee Payment (0.2% of the GBP amount, converted to NPR at the
// day's rate): that rate is fetched from a public
// API and cached in exchange-rate-cache.json, refreshed at most once per day.

const fs = require('fs');
const path = require('path');
const {
  send, sendJSON, createStaticServer, SHARED_FILES, readJSONBody, writeFileAtomic, snapshotDaily,
  localDate,
} = require('../shared/server-utils');
const { advancesByName, setAdvance } = require('./advances');
const { syncFromWorkbook } = require('./incentive-data');

const EXCHANGE_RATE_URL = 'https://api.exchangerate-api.com/v4/latest/GBP';
const MAX_BODY_BYTES = 1024 * 1024;
const RATE_MAX_AGE_MS = 60 * 60 * 1000; // the exchange rate is refreshed every hour
// Names that would change the stored object's prototype instead of adding an entry.
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Only these files are served. The data files next to them and the code stay private.
const serveStatic = createStaticServer(__dirname, {
  '/index.html': 'text/html; charset=utf-8',
  '/unlock.html': 'text/html; charset=utf-8',
  '/calc.js': 'text/javascript; charset=utf-8',
  '/favicon.png': 'image/png',
  '/apple-touch-icon.png': 'image/png',
});

// Files shared with the other pages (header, logo, session helper, ...).
const serveShared = createStaticServer(path.join(__dirname, '..', 'shared'), SHARED_FILES);

// studentDataFile: the Student Details data.json; getWorkbook (optional) gives the same data from memory, so a page
// never shows a version older than the one just saved. dataDir: where commissions, advances and the exchange rate live.
function createIncentive({ dataDir, studentDataFile, getWorkbook, activity }) {
  const DATA_DIR = dataDir; // created when something is first saved, never just by looking (the connector treats a missing folder as "not found", not as zeros)
  const STUDENT_DETAILS_DATA = studentDataFile;
  const COMMISSIONS_FILE = path.join(DATA_DIR, 'commissions.json');
  const ADVANCES_FILE = path.join(DATA_DIR, 'advances.json');
  const EXCHANGE_RATE_FILE = path.join(DATA_DIR, 'exchange-rate-cache.json');

  // One line per field that changed, e.g. "Ram Thapa › Enrollment Commission: 100 → 150".
  function recordChanges(req, what, before, after, fields) {
    // These are all amounts, and an amount never typed in is saved as 0, so blank and 0 count as the same.
    const show = (v) => (v === undefined || v === null || v === '' || v === 0 ? '0' : String(v));
    const label = (f) => f.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    // The unit of an incentive is saved as 0, 1 or 2; the record says it in words.
    const UNIT_WORDS = ['rupees', 'pounds', 'percent'];
    const shown = (f, v) => (f.endsWith('Unit') ? UNIT_WORDS[Number(v) || 0] : show(v));
    const changes = fields
      .filter((f) => shown(f, before[f]) !== shown(f, after[f]))
      .map((f) => `${what} › ${label(f)}: ${shown(f, before[f])} → ${shown(f, after[f])}`);
    if (changes.length) activity.record(req, req.user, 'Changed', { app: 'Incentive', changes });
  }

  // The list of part payments as saved: each { id, date (YYYY-MM-DD), amount (rupees, above 0), note }. null if it is not a list
  // of those. Ids the page did not give are made here.
  function cleanPayments(list) {
    if (!Array.isArray(list) || list.length > 1000) return null;
    const out = [];
    const seen = new Set();
    for (const p of list) {
      if (!p || typeof p !== 'object') return null;
      const amount = Math.round(Number(p.amount) * 100) / 100;
      const date = String(p.date || '');
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return null;
      let id = String(p.id || '').replace(/[^\w-]/g, '').slice(0, 40);
      if (!id || seen.has(id)) id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      seen.add(id);
      out.push({ id, date, amount, note: String(p.note || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80) });
    }
    return out;
  }

  // The Student Details workbook, parsed once per change of the file instead of once per request: every open
  // Incentive tab asks again the moment anyone saves a student, and the file is a few megabytes.
  // Throws like reading the file would (missing or not valid JSON right now).
  let workbookCache = null; // { mtimeMs, size, workbook }
  function readWorkbook() {
    if (getWorkbook) {
      const live = getWorkbook();
      if (live) return live;
    }
    const stat = fs.statSync(STUDENT_DETAILS_DATA);
    if (workbookCache && workbookCache.mtimeMs === stat.mtimeMs && workbookCache.size === stat.size) return workbookCache.workbook;
    const workbook = JSON.parse(fs.readFileSync(STUDENT_DETAILS_DATA, 'utf-8'));
    workbookCache = { mtimeMs: stat.mtimeMs, size: stat.size, workbook };
    return workbook;
  }

  // The student's name for a Student Details row id, for the activity record.
  function studentName(rowId) {
    try {
      const workbook = readWorkbook();
      for (const sheet of workbook.sheets || []) {
        const row = (sheet.rows || []).find((r) => r._id === rowId);
        const name = [row && row['FIRST NAME'], row && row['LAST NAME']].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
        if (row) return `${sheet.name} › ${name || 'a student with no name'}`;
      }
    } catch (e) { /* fall back to the id */ }
    return `Student ${rowId}`;
  }

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
    fs.mkdirSync(DATA_DIR, { recursive: true });
    snapshotDaily(file, DATA_DIR, path.basename(file, '.json'));
    if (fs.existsSync(file)) {
      try { fs.copyFileSync(file, path.join(DATA_DIR, backupName)); } catch (e) { /* non-fatal */ }
    }
    writeJSONAtomic(file, data);
  }

  // Reads the Student Details workbook and reshapes it into { intakes, byIntake }, where
  // byIntake[sheetName] only ever contains students whose APPLICATION STATUS is exactly
  // "Visa Issued" right now. Every sheet becomes an intake tab here, even if it currently
  // has zero visa-issued students, mirroring the sheets over in Student Details 1:1.
  // The Student Details sheets as [{ id, name }] (empty if the file can't be read right now).
  function readSheetList() {
    try {
      const workbook = readWorkbook();
      return (Array.isArray(workbook.sheets) ? workbook.sheets : [])
        .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
        .map((s) => ({ id: s.id, name: s.name }));
    } catch (e) {
      return [];
    }
  }

  function readSync() {
    if (!getWorkbook && !fs.existsSync(STUDENT_DETAILS_DATA)) {
      return { ok: false, error: 'Could not find the Student Details data file at ' + STUDENT_DETAILS_DATA, intakes: [], byIntake: {} };
    }
    let workbook;
    try {
      workbook = readWorkbook();
    } catch (e) {
      return { ok: false, error: 'Student Details data file is not valid JSON right now. Try again.', intakes: [], byIntake: {} };
    }
    return syncFromWorkbook(workbook);
  }

  // 0 rupees, 1 pounds or 2 percent; anything else keeps what was saved (rupees if nothing was).
  function unitOf(v, fallback) {
    const n = Number(v);
    return v !== undefined && [0, 1, 2].includes(n) ? n : (Number(fallback) || 0);
  }

  function num(v, fallback) {
    const n = parseFloat(v);
    return isNaN(n) ? (fallback || 0) : n;
  }

  // GBP -> NPR, refetched at most once per day (cached to disk) so entering a Flywire
  // Fee Payment doesn't hit the external API on every edit.
  async function getGbpToNprRate() {
    // fetchedOn is our own calendar day; `date` is the rate's own date from the API, which can lag a day.
    // The rate is fetched again once the saved one is an hour old.
    const today = localDate();
    const cache = readJSON(EXCHANGE_RATE_FILE, null);
    const age = cache && cache.fetchedAt ? Date.now() - Date.parse(cache.fetchedAt) : Infinity;
    if (cache && typeof cache.rate === 'number' && age >= 0 && age < RATE_MAX_AGE_MS) {
      return { ok: true, rate: cache.rate, date: cache.date, fetchedAt: cache.fetchedAt || null, cached: true };
    }
    try {
      const res = await fetch(EXCHANGE_RATE_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const rate = data && data.rates && data.rates.NPR;
      if (typeof rate !== 'number') throw new Error('NPR rate missing from exchange rate response');
      const record = { date: data.date || today, rate, fetchedOn: today, fetchedAt: new Date().toISOString() };
      writeJSONAtomic(EXCHANGE_RATE_FILE, record);
      return { ok: true, rate, date: record.date, fetchedAt: record.fetchedAt, cached: false };
    } catch (e) {
      // Fall back to a stale cached rate rather than failing outright, if we have one.
      if (cache && typeof cache.rate === 'number') {
        return { ok: true, rate: cache.rate, date: cache.date, fetchedAt: cache.fetchedAt || null, stale: true, error: e.message };
      }
      return { ok: false, error: e.message };
    }
  }

  // Live updates: each open Incentive tab holds a server-sent-events connection and is told the moment
  // Student Details' data.json (or this app's own commissions/advances) changes, so it reloads at once
  // instead of waiting for its next poll.
  const liveStreams = new Set();
  let liveTimer = null;
  function notifyLive() {
    clearTimeout(liveTimer); // a save can touch the file more than once: send one notice for the burst
    liveTimer = setTimeout(() => {
      liveStreams.forEach((res) => { try { res.write('data: changed\n\n'); } catch (e) { /* closed */ } });
    }, 10);
  }

  function handleLive(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    res.write('retry: 1000\n\n');
    liveStreams.add(res);
    req.on('close', () => liveStreams.delete(res));
  }
  setInterval(() => liveStreams.forEach((res) => { try { res.write(': ping\n\n'); } catch (e) { /* ignore */ } }), 15000).unref();

  // Saves replace data.json with a rename, so the folder is watched rather than the file itself.
  // Where watching isn't available, the file is checked every half second instead.
  function watchDataFile(file) {
    const dir = path.dirname(file);
    const name = path.basename(file);
    try {
      fs.watch(dir, (event, changed) => { if (!changed || changed === name) notifyLive(); });
    } catch (e) {
      fs.watchFile(file, { interval: 500 }, notifyLive);
    }
  }
  watchDataFile(STUDENT_DETAILS_DATA);


  // Answers one request for the Incentive page or its API. req.url is the address inside the page ("/", "/api/sync", ...).
  async function handle(req, res, urlPath) {
    try {
      if (urlPath === '/api/live' && req.method === 'GET') return handleLive(req, res);

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
          enrollmentCommissionUnit: unitOf(body.enrollmentCommissionUnit, existing.enrollmentCommissionUnit),
          enrollmentCommissionUni: num(body.enrollmentCommissionUni, existing.enrollmentCommissionUni),
          enrollmentCommissionUniUnit: unitOf(body.enrollmentCommissionUniUnit, existing.enrollmentCommissionUniUnit),
          flywireFeePayment: num(body.flywireFeePayment, existing.flywireFeePayment),
          flywireCommission: num(body.flywireCommission, existing.flywireCommission),
          loanCommission: num(body.loanCommission, existing.loanCommission),
          newPartnershipCommission: num(body.newPartnershipCommission, existing.newPartnershipCommission),
          newPartnershipCommissionUnit: unitOf(body.newPartnershipCommissionUnit, existing.newPartnershipCommissionUnit),
          selfStudentCommission: num(body.selfStudentCommission, existing.selfStudentCommission),
          uniCommissionRate: num(body.uniCommissionRate, existing.uniCommissionRate),
          updatedAt: new Date().toISOString(),
        };
        writeWithBackup(COMMISSIONS_FILE, 'commissions.backup.json', all);
        recordChanges(req, studentName(id), existing, all[id], Object.keys(all[id]).filter((f) => f !== 'updatedAt'));
        notifyLive();
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
        const stored = readJSON(ADVANCES_FILE, {});
        const sheets = readSheetList();
        const existing = advancesByName(stored, sheets)[intake] || stored[intake] || {};
        // Fields left out of the body keep their saved values. Salary settings are only stored once set.
        const entry = { ...existing, previousAdvance: num(body.previousAdvance, existing.previousAdvance) };
        ['basicSalary', 'salaryMonths'].forEach((f) => {
          if (f in body) entry[f] = num(body[f], existing[f]);
        });
        // The pound rate typed in from OANDA for this intake. Once a payment fixes the rate, the fixed rate is what counts
        // (the page does not allow changing it then); the typed one is kept for if every payment is removed.
        const manualLines = [];
        if ('manualRate' in body) {
          const r = body.manualRate === null || body.manualRate === '' ? 0 : Number(body.manualRate);
          if (!Number.isFinite(r) || r < 0 || r >= 100000) return sendJSON(res, 400, { error: 'manualRate must be a rate above 0' });
          const had = existing.manualRate && existing.manualRate.rate > 0 ? existing.manualRate.rate : 0;
          const rate = Math.round(r * 10000) / 10000;
          if (rate !== had) {
            if (rate > 0) entry.manualRate = { rate, enteredAt: new Date().toISOString() };
            else delete entry.manualRate;
            manualLines.push(rate > 0 ? `${intake} › Exchange rate typed in from OANDA: £1 = Rs ${rate}` : `${intake} › Typed-in exchange rate removed, the live rate is used`);
          }
        }
        // Part payments received (date + amount). The page sends the whole list; it replaces the saved one.
        let paymentLines = [];
        if ('payments' in body) {
          const list = cleanPayments(body.payments);
          if (!list) return sendJSON(res, 400, { error: 'payments must be a list of { date, amount }' });
          entry.payments = list;
          // The pound rate is fixed from the first payment on, so the amounts owed stay the same for the accounts. It is
          // the rate the page was showing when the payment was added (or the latest one if the page did not say), kept
          // until every payment is removed again.
          if (!list.length) {
            delete entry.lockedRate;
          } else {
            const sent = body.lockedRate;
            const prevLock = existing.lockedRate && existing.lockedRate.rate > 0 ? existing.lockedRate : null;
            let locked = null;
            if (sent && Number.isFinite(Number(sent.rate)) && Number(sent.rate) > 0 && Number(sent.rate) < 100000) {
              // The page says which rate it is showing; the same rate as already fixed keeps its original date.
              locked = prevLock && Number(sent.rate) === prevLock.rate ? { ...prevLock }
                : { rate: Number(sent.rate), date: String(sent.date || '').slice(0, 10), fetchedAt: String(sent.fetchedAt || '').slice(0, 40) || null, source: sent.source === 'manual' ? 'manual' : 'live' };
            } else if (prevLock) {
              locked = { ...prevLock };
            } else if (entry.manualRate && entry.manualRate.rate > 0) {
              locked = { rate: entry.manualRate.rate, date: '', fetchedAt: null, source: 'manual' };
            } else {
              const live = await getGbpToNprRate();
              if (live.ok) locked = { rate: live.rate, date: live.date, fetchedAt: live.fetchedAt || null, source: 'live' };
            }
            if (locked) {
              const isNew = !prevLock || prevLock.rate !== locked.rate;
              locked.lockedAt = isNew ? new Date().toISOString() : (prevLock.lockedAt || new Date().toISOString());
              entry.lockedRate = locked;
              if (isNew) paymentLines.push(`${intake} › Exchange rate fixed at £1 = Rs ${locked.rate}${locked.source === 'manual' ? ' (typed in from OANDA)' : ''} from the first payment`);
            }
          }
          const had = new Set((existing.payments || []).map((p) => p.id));
          const has = new Set(list.map((p) => p.id));
          list.filter((p) => !had.has(p.id)).forEach((p) => paymentLines.push(`${intake} › Payment received: ${p.date} · Rs ${p.amount}${p.note ? ' · ' + p.note : ''}`));
          (existing.payments || []).filter((p) => !has.has(p.id)).forEach((p) => paymentLines.push(`${intake} › Payment removed: ${p.date} · Rs ${p.amount}`));
        }
        entry.updatedAt = new Date().toISOString();
        const all = setAdvance(stored, sheets, intake, entry);
        writeWithBackup(ADVANCES_FILE, 'advances.backup.json', all);
        recordChanges(req, `${intake} advances`, existing, entry, ['previousAdvance', 'basicSalary', 'salaryMonths']);
        if (paymentLines.length || manualLines.length) activity.record(req, req.user, 'Changed', { app: 'Incentive', changes: manualLines.concat(paymentLines) });
        notifyLive();
        return sendJSON(res, 200, entry);
      }

      if (urlPath === '/api/exchange-rate' && req.method === 'GET') {
        const result = await getGbpToNprRate();
        return sendJSON(res, result.ok ? 200 : 502, result);
      }

      if (urlPath.startsWith('/api/')) {
        return sendJSON(res, 404, { error: 'Not found' });
      }

      if (SHARED_FILES[urlPath]) return serveShared(req, res);
      return serveStatic(req, res);
    } catch (e) {
      const status = e.statusCode || (e instanceof URIError ? 400 : 500);
      if (status === 500) console.error(e);
      if (!res.headersSent) sendJSON(res, status, { error: e.message });
    }
  }

  // The page people see until the Incentive password has been typed.
  function serveLocked(req, res) {
    req.url = '/unlock.html';
    return serveStatic(req, res);
  }

  return { handle, notifyLive, serveLocked };
}

module.exports = { createIncentive };

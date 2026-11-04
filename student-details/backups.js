// Daily backups and restore (Admin only, see server.js).
//
// Every day after 6 p.m. (office time) a copy of the students, the Fact File and the Partner Universities is saved as
// one compressed file in the data folder (daily-backups/). Copies older than 30 days are deleted. Every restore first
// saves a "before restore" copy, so a restore can itself be undone. Accounts and passwords are never part of a backup
// (restoring an old copy must not bring back a person who has since been removed).
//
// The server may be put to sleep by the host overnight, so a timer alone is not enough: `tick()` runs at the start of
// every request too, and makes the copy for the most recent 6 p.m. if it is missing. Nothing changes in the data
// without a request, so that copy is still exactly the data as it was at 6 p.m.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { writeFileAtomic, TIME_ZONE, localDate } = require('../shared/server-utils');

const HOUR = 18; // 6 p.m.
const KEEP_DAYS = 30;
const ID = /^(daily|manual|before-restore)-\d{4}-\d{2}-\d{2}(-\d{4})?$/;

const localHour = (date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(date));
const localHHMM = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).replace(':', '');
const dayNumber = (ymd) => Math.floor(Date.parse(ymd + 'T00:00:00Z') / 86400000);

function createBackups(dir, collect, { now = () => new Date() } = {}) {
  const folder = path.join(dir, 'daily-backups');
  const fileOf = (id) => path.join(folder, `niec-${id}.json.gz`);
  const counts = new Map(); // id -> { mtimeMs, counts }
  let ensuredFor = '';

  // The date the newest 6 p.m. belongs to: today after 6 p.m., otherwise yesterday.
  function dueDay(date = now()) {
    const today = localDate(date);
    if (localHour(date) >= HOUR) return today;
    return localDate(new Date(date.getTime() - 86400000));
  }

  function prune(date = now()) {
    try {
      const today = dayNumber(localDate(date));
      fs.readdirSync(folder).forEach((name) => {
        const m = /^niec-(?:daily|manual|before-restore)-(\d{4}-\d{2}-\d{2})/.exec(name);
        if (m && today - dayNumber(m[1]) >= KEEP_DAYS) fs.rmSync(path.join(folder, name), { force: true });
      });
    } catch (e) { /* nothing to prune yet */ }
  }

  // Saves a copy now. kind: daily | manual | before-restore. Returns its id.
  function create(kind, date = now()) {
    const day = kind === 'daily' ? dueDay(date) : localDate(date);
    const id = kind === 'daily' ? `daily-${day}` : `${kind}-${day}-${localHHMM(date)}`;
    const data = collect();
    const body = { app: 'UK Student NIEC', createdAt: date.toISOString(), kind, ...data };
    fs.mkdirSync(folder, { recursive: true });
    writeFileAtomic(fileOf(id), zlib.gzipSync(JSON.stringify(body), { level: 9 }));
    prune(date);
    return id;
  }

  // Makes the daily copy if the newest 6 p.m. has none yet. Cheap: one comparison unless a copy is due.
  function tick(date = now()) {
    try {
      const day = dueDay(date);
      if (ensuredFor === day) return;
      if (!fs.existsSync(fileOf(`daily-${day}`))) create('daily', date);
      ensuredFor = day;
    } catch (e) {
      console.error('[daily backup]', e.message); // never block anything over a backup problem
    }
  }

  function read(id) {
    if (!ID.test(id) || !fs.existsSync(fileOf(id))) return null;
    try {
      return JSON.parse(zlib.gunzipSync(fs.readFileSync(fileOf(id))).toString('utf8'));
    } catch (e) { return null; }
  }

  // What each copy holds, for the list (read once per file, then remembered).
  function summarise(id, stat) {
    const hit = counts.get(id);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.counts;
    const snap = read(id);
    const c = snap ? {
      students: snap.students && Array.isArray(snap.students.sheets) ? snap.students.sheets.reduce((n, s) => n + s.rows.length, 0) : null,
      facts: snap.facts ? snap.facts.length : null,
      partners: snap.partners ? snap.partners.length : null,
    } : null;
    counts.set(id, { mtimeMs: stat.mtimeMs, counts: c });
    return c;
  }

  function list() {
    let names = [];
    try { names = fs.readdirSync(folder); } catch (e) { return []; }
    return names.map((name) => {
      const m = /^niec-(.+)\.json\.gz$/.exec(name);
      if (!m || !ID.test(m[1])) return null;
      const stat = fs.statSync(path.join(folder, name));
      return { id: m[1], kind: m[1].split('-')[0] === 'before' ? 'before-restore' : m[1].split('-')[0], bytes: stat.size, createdAt: stat.mtime.toISOString(), counts: summarise(m[1], stat) };
    }).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return { create, tick, read, list, prune, dueDay, folder, HOUR, KEEP_DAYS };
}

module.exports = { createBackups, ID, HOUR, KEEP_DAYS };

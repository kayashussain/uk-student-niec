// Daily backups: one copy after 6 p.m. office time, kept 30 days, restore for Admin only (with a safety copy first).
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createBackups } = require('../student-details/backups');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-backups-'));
// Office time is Asia/Kathmandu (UTC+5:45): 6 p.m. there is 12:15 UTC.
const at = (iso) => new Date(iso);

test('the copy due is yesterday\'s before 6 p.m. office time and today\'s from 6 p.m.', () => {
  const b = createBackups(tmp(), () => ({}));
  assert.strictEqual(b.dueDay(at('2026-11-04T12:14:00Z')), '2026-11-03', '17:59');
  assert.strictEqual(b.dueDay(at('2026-11-04T12:15:00Z')), '2026-11-04', '18:00');
  assert.strictEqual(b.dueDay(at('2026-11-04T18:00:00Z')), '2026-11-04', '23:45');
  assert.strictEqual(b.dueDay(at('2026-11-04T18:15:00Z')), '2026-11-04', 'just after midnight it is still the evening copy that is the newest');
});

test('the daily copy is made once per day, holds the data as it was, and is not repeated', () => {
  const dir = tmp();
  let data = { students: { sheets: [{ id: 's', rows: [{ _id: 'a' }, { _id: 'b' }] }] }, facts: [{ id: 'f' }], partners: [] };
  const b = createBackups(dir, () => data);
  b.tick(at('2026-11-04T12:20:00Z')); // 18:05
  assert.deepStrictEqual(b.list().map((x) => x.id), ['daily-2026-11-04']);
  data = { students: { sheets: [{ id: 's', rows: [] }] }, facts: [], partners: [] }; // changed later the same evening
  b.tick(at('2026-11-04T14:00:00Z'));
  const [only] = b.list();
  assert.deepStrictEqual(only.counts, { students: 2, facts: 1, partners: 0 }, 'still the 6 p.m. data, not made again');
  assert.strictEqual(b.read('daily-2026-11-04').students.sheets[0].rows.length, 2);
});

test('a server asleep at 6 p.m. still makes that day\'s copy at its first request, and nothing for a day nobody used', () => {
  const dir = tmp();
  const b = createBackups(dir, () => ({ students: { sheets: [] }, facts: [], partners: [] }));
  b.tick(at('2026-11-05T04:30:00Z')); // 10:15 next morning
  assert.deepStrictEqual(b.list().map((x) => x.id), ['daily-2026-11-04']);
});

test('copies older than 30 days are deleted, the newest 30 days are kept', () => {
  const dir = tmp();
  const b = createBackups(dir, () => ({ students: { sheets: [] }, facts: [], partners: [] }));
  for (let day = 1; day <= 31; day += 1) {
    const d = new Date(Date.UTC(2026, 9, day, 12, 30)); // 18:15 Kathmandu on 1 to 31 October
    b.create('daily', d);
  }
  b.create('daily', at('2026-11-01T12:30:00Z'));
  const ids = b.list().map((x) => x.id).sort();
  assert.strictEqual(ids.length, 30, 'exactly 30 days are kept');
  assert.strictEqual(ids[0], 'daily-2026-10-03');
  assert.strictEqual(ids[ids.length - 1], 'daily-2026-11-01');
  assert.ok(!ids.includes('daily-2026-10-02'));
});

test('a backup cannot be read by a made-up id', () => {
  const b = createBackups(tmp(), () => ({}));
  assert.strictEqual(b.read('../../etc/passwd'), null);
  assert.strictEqual(b.read('daily-2026-11-04/../../x'), null);
});

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Admin can back up and restore; nobody else can; a restore saves the data as it was first', { timeout: 120000 }, async (t) => {
  const dir = tmp();
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'), env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir }, stdio: 'ignore',
  });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const person = () => {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, { method, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
      return { status: res.status, json };
    };
  };
  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' });
  await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' });

  // The first request already made today's (or yesterday's) 6 p.m. copy.
  const first = (await admin('GET', '/api/restore/backups')).json;
  assert.strictEqual(first.keepDays, 30);
  assert.strictEqual(first.hour, 18);
  assert.ok(first.backups.some((b) => b.kind === 'daily'), 'the daily copy was made without anyone asking');

  // A copy now, then a change, then restore the Fact File from the copy.
  const manual = (await admin('POST', '/api/restore/backup-now', {})).json.id;
  assert.match(manual, /^manual-/);
  const added = (await admin('POST', '/api/facts', { name: 'Temporary Mistake University' })).json;
  const factsBefore = (await admin('GET', '/api/facts')).json.length;
  assert.ok((await admin('GET', '/api/facts')).json.some((u) => u.id === added.id));
  const bad = await admin('POST', '/api/restore', { id: manual, parts: [] });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await admin('POST', '/api/restore', { id: '../../etc/passwd', parts: ['facts'] })).status, 400);
  const done = await admin('POST', '/api/restore', { id: manual, parts: ['facts'] });
  assert.strictEqual(done.status, 200);
  assert.match(done.json.safety, /^before-restore-/);
  const factsAfter = (await admin('GET', '/api/facts')).json;
  assert.strictEqual(factsAfter.length, factsBefore - 1);
  assert.ok(!factsAfter.some((u) => u.id === added.id), 'the page added after the backup is gone');
  // ...and the safety copy still has it, so the restore can be undone.
  const undo = await admin('POST', '/api/restore', { id: done.json.safety, parts: ['facts'] });
  assert.strictEqual(undo.status, 200);
  assert.ok((await admin('GET', '/api/facts')).json.some((u) => u.id === added.id), 'undone');
  // The students: add one after the backup, then restore the backup and the student is gone.
  const wb = (await admin('GET', '/api/data')).json;
  const rowsOf = (w) => w.sheets.reduce((n, sh) => n + sh.rows.length, 0);
  const rowsBefore = rowsOf(wb);
  const edited = JSON.parse(JSON.stringify(wb));
  edited.sheets[0].rows.push({ _id: 'zz-added-later', 'FIRST NAME': 'Added', 'LAST NAME': 'Later' });
  const saved = await admin('POST', '/api/data', { sheets: edited.sheets, activeSheetId: edited.activeSheetId, baseRevision: wb.revision });
  assert.strictEqual(saved.status, 200);
  assert.strictEqual(rowsOf((await admin('GET', '/api/data')).json), rowsBefore + 1);
  const back = await admin('POST', '/api/restore', { id: manual, parts: ['students', 'partners'] });
  assert.strictEqual(back.status, 200);
  const after = (await admin('GET', '/api/data')).json;
  assert.strictEqual(rowsOf(after), rowsBefore, 'the student added after the backup is gone');
  assert.ok(after.revision > saved.json.revision, 'open screens see a newer revision and refresh');

  // Nobody else.
  const made = await admin('POST', '/api/users', { name: 'Sita', username: 'sita', role: 'staff', departments: ['application'] });
  const sita = person();
  await sita('POST', '/api/login', { username: 'sita', password: made.json.temporaryPassword });
  await sita('POST', '/api/login/new-password', { password: 'Another-Long-Pass-2026' });
  assert.strictEqual((await sita('GET', '/api/restore/backups')).status, 403);
  assert.strictEqual((await sita('POST', '/api/restore/backup-now', {})).status, 403);
  assert.strictEqual((await sita('POST', '/api/restore', { id: manual, parts: ['facts'] })).status, 403);
  const nobody = person();
  assert.notStrictEqual((await nobody('GET', '/api/restore/backups')).status, 200);
  assert.notStrictEqual((await nobody('POST', '/api/restore', { id: manual, parts: ['facts'] })).status, 200);

  // Accounts are not in a backup.
  const kinds = fs.readdirSync(path.join(dir, 'daily-backups')).filter((f) => f.endsWith('.json.gz'));
  assert.ok(kinds.length >= 3);
  const snap = require('node:zlib').gunzipSync(fs.readFileSync(path.join(dir, 'daily-backups', kinds[0]))).toString();
  assert.ok(!/passwordHash|scrypt\$/.test(snap), 'no passwords in a backup');
});

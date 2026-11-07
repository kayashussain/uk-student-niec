// Fixes from the six-team review of 2026-11-07, each kept from coming back: a data file that is not a workbook is never
// replaced by an empty sheet, the 6 p.m. backups can bring the students back, a malformed team save is a 400 (not a crash),
// and a live update stream closes as soon as its login ends.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Starts the server on a data folder (a new one unless given); returns a way to stop it.
async function boot(t, dir) {
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'), env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir, COUNSELOR_DATA_DIR: path.join(dir, 'incentive'), INCENTIVE_PASSWORD: 'Test Gate Pass 1' }, stdio: 'ignore',
  });
  const stopped = new Promise((r) => server.on('exit', r));
  const stop = async () => { server.kill(); await stopped; };
  t.after(stop);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  return { base, stop };
}

function client(baseRef) {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(baseRef.base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
    return { status: res.status, json };
  };
  call.cookie = () => cookie;
  return call;
}

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-six-'));
  const ref = await boot(t, dir);
  const admin = client(ref);
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  assert.strictEqual((await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' })).status, 200);
  assert.strictEqual((await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' })).status, 200);
  const wb = (await admin('GET', '/api/data')).json;
  const sheet = wb.sheets[0];
  const row = { _id: 'keep1', ...Object.fromEntries(sheet.columns.map((c) => [c, ''])), 'FIRST NAME': 'Keep', 'APPLICATION STATUS': 'Application Stage' };
  sheet.rows = [row];
  assert.strictEqual((await admin('POST', '/api/data', { sheets: wb.sheets, activeSheetId: wb.activeSheetId, baseRevision: wb.revision })).status, 200);
  return { dir, ref, admin };
}

test('a data.json that is valid JSON but not a workbook is set aside, never saved over as an empty sheet', { timeout: 120000 }, async (t) => {
  const { dir, ref, admin } = await setup(t);
  // a second save, so data.backup.json holds the student too
  const wb = (await admin('GET', '/api/data')).json;
  wb.sheets[0].rows[0]['LAST NAME'] = 'Safe';
  assert.strictEqual((await admin('POST', '/api/data', { sheets: wb.sheets, activeSheetId: wb.activeSheetId, baseRevision: wb.revision })).status, 200);
  await ref.stop();
  fs.writeFileSync(path.join(dir, 'data.json'), '{"universities":[]}');
  Object.assign(ref, await boot(t, dir));
  const back = (await admin('GET', '/api/data')).json;
  assert.strictEqual(back.sheets[0].rows.length, 1, 'the student is still there');
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('data.corrupt-')), 'the wrong file was set aside');
});

test('when data.json and the rolling copies are lost, the students come back from the 6 p.m. or manual backup', { timeout: 120000 }, async (t) => {
  const { dir, ref, admin } = await setup(t);
  assert.strictEqual((await admin('POST', '/api/restore/backup-now', {})).status, 200);
  await ref.stop();
  fs.writeFileSync(path.join(dir, 'data.json'), 'not json at all');
  fs.rmSync(path.join(dir, 'data.backup.json'), { force: true });
  fs.rmSync(path.join(dir, 'backups'), { recursive: true, force: true });
  Object.assign(ref, await boot(t, dir));
  const back = await admin('GET', '/api/data');
  assert.strictEqual(back.status, 200);
  assert.strictEqual(back.json.sheets[0].rows[0]['FIRST NAME'], 'Keep');
});

test('a malformed team save is refused with 400, and a live stream closes when the login ends', { timeout: 120000 }, async (t) => {
  const { ref, admin } = await setup(t);
  const made = await admin('POST', '/api/users', { username: 'asha', name: 'Asha', email: '', departments: ['application'] });
  assert.strictEqual(made.status, 200);
  const staff = client(ref);
  assert.strictEqual((await staff('POST', '/api/login', { username: 'asha', password: made.json.temporaryPassword })).status, 200);
  assert.strictEqual((await staff('POST', '/api/login/new-password', { password: 'Team-Strong-2026' })).status, 200);
  const mine = (await staff('GET', '/api/data')).json;
  for (const sheets of [[null], [{ id: mine.sheets[0].id }], [{ ...mine.sheets[0], rows: [null] }]]) {
    assert.strictEqual((await staff('POST', '/api/data', { sheets, activeSheetId: mine.activeSheetId, baseRevision: mine.revision })).status, 400);
  }

  // The live stream of a person who is logged out everywhere stops at once (it used to keep showing who works on what).
  const stream = await fetch(ref.base + '/api/events?id=tab1', { headers: { cookie: staff.cookie() } });
  assert.strictEqual(stream.status, 200);
  const reader = stream.body.getReader();
  await reader.read();
  const users = (await admin('GET', '/api/users')).json;
  const asha = (users.users || users).find((u) => u.username === 'asha');
  assert.strictEqual((await admin('POST', '/api/users/' + asha.id, { action: 'logout-everywhere' })).status, 200);
  const wb = (await admin('GET', '/api/data')).json;
  wb.sheets[0].rows[0]['LAST NAME'] = 'Again';
  assert.strictEqual((await admin('POST', '/api/data', { sheets: wb.sheets, activeSheetId: wb.activeSheetId, baseRevision: wb.revision })).status, 200);
  const ended = await Promise.race([
    (async () => { for (;;) { const { done } = await reader.read(); if (done) return true; } })(),
    wait(8000).then(() => false),
  ]);
  assert.ok(ended, 'the stream closed after the login ended');
  try { await reader.cancel(); } catch (e) { /* closed */ }
});

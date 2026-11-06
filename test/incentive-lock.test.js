// The Incentive page: Admin only, behind its own password, and the Claude connector never asks for it.
// (Every password in this file is a made-up test value. The real one is only ever set on the server.)
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createIncentiveLock } = require('../shared/incentive-lock');

const GATE = 'Test Gate Pass 1';
const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('the lock: no password set means closed; an unlock belongs to one login only and lapses when idle', () => {
  const none = createIncentiveLock({ password: '' });
  assert.strictEqual(none.configured, false);
  assert.strictEqual(none.unlock({ user: { id: 'a' }, sessionId: 's1' }, 'x').status, 503);

  let clock = 1000;
  const lock = createIncentiveLock({ password: GATE, now: () => clock });
  const req = (sessionId) => ({ user: { id: 'u1' }, sessionId });
  assert.strictEqual(lock.unlock(req('s1'), 'wrong').status, 403, 'a wrong password is a 403, never a 401 (a 401 sends people to the login page)');
  assert.strictEqual(lock.isUnlocked(req('s1')), false);
  assert.ok(lock.unlock(req('s1'), ` ${GATE} `).ok, 'surrounding spaces do not matter');
  assert.strictEqual(lock.isUnlocked(req('s1')), true);
  assert.strictEqual(lock.isUnlocked(req('s2')), false, 'another login does not inherit the unlock');
  lock.lock('s1');
  assert.strictEqual(lock.isUnlocked(req('s1')), false, 'locked again once the person leaves');
  lock.unlock(req('s1'), GATE);
  clock += 19 * 60 * 1000;
  assert.strictEqual(lock.isUnlocked(req('s1')), true, 'still open while in use (this keeps it open another 20 minutes)');
  clock += 19 * 60 * 1000;
  assert.strictEqual(lock.isUnlocked(req('s1')), true);
  clock += 21 * 60 * 1000;
  assert.strictEqual(lock.isUnlocked(req('s1')), false, 'an untouched page locks itself after 20 minutes');
});

test('the lock: five wrong passwords in a row make the person wait', () => {
  const lock = createIncentiveLock({ password: GATE });
  const r = { user: { id: 'u9' }, sessionId: 's' };
  for (let i = 0; i < 5; i += 1) assert.strictEqual(lock.unlock(r, 'no').status, 403);
  assert.strictEqual(lock.unlock(r, GATE).status, 429, 'even the right password waits');
});

test('Incentive in the real app: Admin only, password first, and the connector needs no password', { timeout: 60000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-inc-'));
  const incentiveDir = path.join(dir, 'counselor-incentive');
  fs.mkdirSync(incentiveDir, { recursive: true });
  fs.writeFileSync(path.join(incentiveDir, 'commissions.json'), '{}');
  const port = await freePort();
  const token = 'x'.repeat(40);
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'),
    env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir, COUNSELOR_DATA_DIR: incentiveDir, INCENTIVE_PASSWORD: GATE, NIEC_ADVISOR_TOKEN: token },
    stdio: 'ignore',
  });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }

  // A tiny cookie jar over fetch.
  const person = () => {
    const jar = {};
    const call = async (url, opts = {}) => {
      const res = await fetch(base + url, { redirect: 'manual', ...opts, headers: { 'Content-Type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) } });
      res.headers.getSetCookie().forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); });
      return res;
    };
    return { call, post: (url, data) => call(url, { method: 'POST', body: JSON.stringify(data) }) };
  };

  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  assert.ok((await admin.post('/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' })).ok);
  assert.ok((await admin.post('/api/login/new-password', { password: 'Strong-Pass-2026' })).ok);
  const made = await (await admin.post('/api/users', { username: 'asha', name: 'Asha', email: '', departments: ['application'] })).json();
  const asha = person();
  assert.ok((await asha.post('/api/login', { username: 'asha', password: made.temporaryPassword })).ok);
  assert.ok((await asha.post('/api/login/new-password', { password: 'Team-Strong-2026' })).ok);

  await t.test('a team member cannot open Incentive, with or without the password', async () => {
    assert.strictEqual((await asha.call('/incentive/')).status, 302);
    assert.strictEqual((await asha.call('/incentive/api/sync')).status, 403);
    assert.strictEqual((await asha.post('/incentive/api/unlock', { password: GATE })).status, 403);
    assert.strictEqual((await asha.call('/incentive/api/sync')).status, 403);
  });

  await t.test('Admin sees only the password page, then the figures once it is typed', async () => {
    const locked = await admin.call('/incentive/');
    assert.strictEqual(locked.status, 200);
    const html = await locked.text();
    assert.match(html, /id="pw"/);
    assert.ok(!/id="rows"/.test(html), 'no figures on the password page');
    assert.strictEqual((await admin.call('/incentive/api/commissions')).status, 403);
    assert.strictEqual((await admin.post('/incentive/api/unlock', { password: 'nope' })).status, 403);
    assert.strictEqual((await admin.post('/incentive/api/unlock', { password: GATE })).status, 200);
    assert.strictEqual((await admin.call('/incentive/api/commissions')).status, 200);
    assert.match(await (await admin.call('/incentive/')).text(), /id="rows"/);
  });

  await t.test('the password is asked every time: going to another page, or leaving Incentive, locks it again', async () => {
    assert.strictEqual((await admin.post('/incentive/api/unlock', { password: GATE })).status, 200);
    assert.strictEqual((await admin.call('/incentive/api/commissions')).status, 200, 'open after the password');
    // Behind-the-scenes calls that every page makes do not lock it.
    assert.strictEqual((await admin.call('/api/me')).status, 200);
    assert.strictEqual((await admin.call('/incentive/api/commissions')).status, 200, 'still open after /api/me');
    // Going to Student Details (a page) does.
    assert.strictEqual((await admin.call('/students')).status, 200);
    assert.strictEqual((await admin.call('/incentive/api/commissions')).status, 403, 'locked after visiting Student Details');
    assert.match(await (await admin.call('/incentive/')).text(), /id="pw"/, 'the password page is shown again');
    // The page locks itself as it is left or closed.
    assert.strictEqual((await admin.post('/incentive/api/unlock', { password: GATE })).status, 200);
    assert.strictEqual((await admin.post('/incentive/api/lock', {})).status, 200);
    assert.strictEqual((await admin.call('/incentive/api/commissions')).status, 403, 'locked after leaving Incentive');
  });

  await t.test('the Claude connector reads incentives without any password', async () => {
    const res = await fetch(`${base}/advisor-mcp/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_incentive_overview', arguments: {} } }),
    });
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(!/password/i.test(text), 'no password asked of the connector');
    assert.match(text, /"result"/);
  });

  await t.test('the old /commission address goes to /incentive/', async () => {
    const r = await admin.call('/commission/');
    assert.strictEqual(r.status, 301);
    assert.strictEqual(r.headers.get('location'), '/incentive/');
  });
});

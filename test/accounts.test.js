const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const {
  createAccounts, hashPassword, verifyPassword, passwordProblem, base32Encode, base32Decode, totpAt, matchTotp,
} = require('../shared/accounts');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-accounts-'));

// A browser: keeps the session cookie between requests, like the real one.
function browser(accounts, { ip = '203.0.113.5', ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0' } = {}) {
  let cookie = '';
  async function call(method, url, body) {
    const req = new PassThrough();
    req.method = method;
    req.url = url;
    req.headers = { cookie, 'user-agent': ua, accept: 'application/json', 'content-type': 'application/json' };
    req.socket = { remoteAddress: ip };
    req.end(body === undefined ? '' : JSON.stringify(body));
    const res = {
      status: null, headers: {}, body: '',
      setHeader(k, v) { this.headers[k] = v; },
      writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
      end(b) { this.body = String(b || ''); },
    };
    const handled = await accounts.handleApi(req, res, url);
    if (!handled) {
      res.allowed = accounts.requireAuth(req, res);
      res.user = req.user;
    }
    const set = res.headers['Set-Cookie'];
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    res.json = res.body ? JSON.parse(res.body) : null;
    return res;
  }
  return { call, get cookie() { return cookie; } };
}

// The code an authenticator app would show right now for a secret.
const codeFor = (secret, t) => totpAt(base32Decode(secret), Math.floor(t / 30000));

// The one-time code the server saved next to the data.
const setupCodeIn = (dir) => fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();

async function setUpAdmin(accounts, clock, dir) {
  const b = browser(accounts);
  let r = await b.call('POST', '/api/login/first-admin', { setupCode: setupCodeIn(dir).toLowerCase(), name: 'Kayas', username: 'kayas' });
  assert.strictEqual(r.status, 200, r.body);
  r = await b.call('POST', '/api/login/new-password', { password: 'a long admin password' });
  assert.strictEqual(r.json.stage, 'authenticator');
  r = await b.call('POST', '/api/login/authenticator', {});
  const { secret } = r.json;
  r = await b.call('POST', '/api/login/authenticator', { code: codeFor(secret, clock.t) });
  assert.strictEqual(r.json.stage, 'done');
  return { b, secret };
}

test('authenticator codes match the RFC 6238 test vector and survive base32', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.strictEqual(totpAt(secret, Math.floor(59 / 30), 8), '94287082');
  assert.strictEqual(totpAt(secret, Math.floor(1111111109 / 30), 8), '07081804');
  assert.deepStrictEqual(base32Decode(base32Encode(secret)), secret);
});

test('a code is accepted once, within a step either side, and never again', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const t = 1111111109 * 1000;
  const code = codeFor(secret, t);
  const step = matchTotp(secret, code, t);
  assert.ok(step > 0);
  assert.strictEqual(matchTotp(secret, code, t + 30000), step); // phone a little behind
  assert.strictEqual(matchTotp(secret, code, t, step), -1); // used already
  assert.strictEqual(matchTotp(secret, code, t + 120000), -1); // too old
  assert.strictEqual(matchTotp(secret, 'abc', t), -1);
});

test('passwords are salted and checked; weak ones are refused', () => {
  const a = hashPassword('correct horse battery');
  assert.notStrictEqual(a, hashPassword('correct horse battery'));
  assert.ok(verifyPassword('correct horse battery', a));
  assert.ok(!verifyPassword('wrong', a));
  assert.ok(passwordProblem('short', 'sita'));
  assert.ok(passwordProblem('sita12345678', 'sita'));
  assert.strictEqual(passwordProblem('blue mango river', 'sita'), null);
});

test('the first Admin is created with the server\'s one-time setup code, only while no accounts exist', async () => {
  const clock = { t: Date.parse('2026-10-28T09:00:00Z') };
  const dir = tmpDir();
  const accounts = createAccounts({ dir, now: () => clock.t });
  const code = setupCodeIn(dir);
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  // The Incentive app (read-only) never makes its own code.
  assert.strictEqual(fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim(), code);
  const stranger = browser(accounts);
  assert.strictEqual((await stranger.call('GET', '/api/login/state')).json.stage, 'first-admin');
  assert.strictEqual((await stranger.call('POST', '/api/login/first-admin', { setupCode: 'AAAA-BBBB-CCCC', name: 'X', username: 'xx1' })).status, 401);
  const { b } = await setUpAdmin(accounts, clock, dir);
  assert.ok(!fs.existsSync(path.join(dir, 'first-admin-code.txt'))); // used up
  const me = await b.call('GET', '/api/me');
  assert.strictEqual(me.json.role, 'admin');
  assert.strictEqual(me.json.label, 'Kayas (Admin)');
  // Now it's closed for good.
  const again = await stranger.call('POST', '/api/login/first-admin', { setupCode: code, name: 'Y', username: 'yy1' });
  assert.strictEqual(again.status, 409);
});

test('a new person sets their own password and authenticator, then logs in with password + code', async () => {
  const clock = { t: Date.parse('2026-10-28T09:00:00Z') };
  const dir = tmpDir();
  const accounts = createAccounts({ dir, now: () => clock.t });
  const { b: admin } = await setUpAdmin(accounts, clock, dir);
  const added = await admin.call('POST', '/api/users', { name: 'Sita', username: 'sita', role: 'mock' });
  const temp = added.json.temporaryPassword;
  assert.ok(temp.length >= 12);

  const phone = browser(accounts, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' });
  let r = await phone.call('POST', '/api/login', { username: 'Sita', password: temp });
  assert.strictEqual(r.json.stage, 'new-password');
  // Not logged in yet: the sheet refuses.
  assert.strictEqual((await phone.call('GET', '/api/data')).allowed, false);
  assert.strictEqual((await phone.call('POST', '/api/login/new-password', { password: temp })).status, 400);
  await phone.call('POST', '/api/login/new-password', { password: 'my own long password' });
  const { secret } = (await phone.call('POST', '/api/login/authenticator', {})).json;
  assert.strictEqual((await phone.call('POST', '/api/login/authenticator', { code: '000000' })).status, 400);
  r = await phone.call('POST', '/api/login/authenticator', { code: codeFor(secret, clock.t) });
  assert.strictEqual(r.json.stage, 'done');
  r = await phone.call('GET', '/api/data');
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.user.label, 'Sita (Mock Team)');
  // Not Admin: can't see people.
  assert.strictEqual((await phone.call('GET', '/api/users')).status, 403);

  // Next day: password alone isn't enough.
  clock.t += 13 * 60 * 60 * 1000;
  assert.strictEqual((await phone.call('GET', '/api/data')).allowed, false); // the 12-hour login ran out
  const laptop = browser(accounts);
  r = await laptop.call('POST', '/api/login', { username: 'sita', password: 'my own long password' });
  assert.strictEqual(r.json.stage, 'code');
  assert.strictEqual((await laptop.call('GET', '/api/data')).allowed, false);
  assert.strictEqual((await laptop.call('POST', '/api/login/code', { code: '123456' })).status, 401);
  const code = codeFor(secret, clock.t);
  assert.strictEqual((await laptop.call('POST', '/api/login/code', { code })).json.stage, 'done');
  assert.strictEqual((await laptop.call('GET', '/api/data')).allowed, true);
  // The same code can't be used again on another device.
  const other = browser(accounts);
  await other.call('POST', '/api/login', { username: 'sita', password: 'my own long password' });
  assert.strictEqual((await other.call('POST', '/api/login/code', { code })).status, 401);
});

test('disabling someone logs them out everywhere and stops them logging in', async () => {
  const clock = { t: Date.parse('2026-10-28T09:00:00Z') };
  const dir = tmpDir();
  const accounts = createAccounts({ dir, now: () => clock.t });
  const incentive = createAccounts({ dir, now: () => clock.t, writable: false }); // the other app
  const { b: admin } = await setUpAdmin(accounts, clock, dir);
  const { user, temporaryPassword } = (await admin.call('POST', '/api/users', { name: 'Ram', username: 'ram', role: 'followup' })).json;
  const ram = browser(accounts);
  await ram.call('POST', '/api/login', { username: 'ram', password: temporaryPassword });
  await ram.call('POST', '/api/login/new-password', { password: 'blue mango river' });
  const { secret } = (await ram.call('POST', '/api/login/authenticator', {})).json;
  await ram.call('POST', '/api/login/authenticator', { code: codeFor(secret, clock.t) });
  assert.strictEqual((await ram.call('GET', '/api/data')).allowed, true);
  const ramOnIncentive = browser(incentive);
  Object.defineProperty(ramOnIncentive, 'cookie', { value: ram.cookie });

  assert.strictEqual((await admin.call('POST', `/api/users/${user.id}`, { action: 'disable' })).status, 200);
  assert.strictEqual((await ram.call('GET', '/api/data')).allowed, false);
  // The Incentive app sees it too (it reads the same files).
  const req = { method: 'GET', url: '/api/sync', headers: { cookie: ram.cookie }, socket: { remoteAddress: '1.1.1.1' } };
  const res = { setHeader() {}, writeHead(s) { this.status = s; }, end() {} };
  assert.strictEqual(incentive.requireAuth(req, res), false);
  const again = browser(accounts);
  assert.strictEqual((await again.call('POST', '/api/login', { username: 'ram', password: 'blue mango river' })).status, 401);
  // Admin can't lock themselves out.
  const me = (await admin.call('GET', '/api/me')).json;
  assert.strictEqual((await admin.call('POST', `/api/users/${me.id}`, { action: 'disable' })).status, 400);
});

test('too many wrong passwords lock the account for a while, even with the right password', async () => {
  const clock = { t: Date.parse('2026-10-28T09:00:00Z') };
  const dir = tmpDir();
  const accounts = createAccounts({ dir, now: () => clock.t, maxUserFailures: 3 });
  await setUpAdmin(accounts, clock, dir);
  for (let i = 0; i < 3; i += 1) {
    const r = await browser(accounts, { ip: `198.51.100.${i}` }).call('POST', '/api/login', { username: 'kayas', password: 'guess' + i });
    assert.strictEqual(r.status, 401);
  }
  const locked = await browser(accounts).call('POST', '/api/login', { username: 'kayas', password: 'a long admin password' });
  assert.strictEqual(locked.status, 429);
  clock.t += 16 * 60 * 1000;
  const later = await browser(accounts).call('POST', '/api/login', { username: 'kayas', password: 'a long admin password' });
  assert.strictEqual(later.json.stage, 'code');
});

test('requests made from another website are refused', async () => {
  const clock = { t: Date.parse('2026-10-28T09:00:00Z') };
  const dir = tmpDir();
  const accounts = createAccounts({ dir, now: () => clock.t });
  const { b } = await setUpAdmin(accounts, clock, dir);
  const req = { method: 'POST', url: '/api/data', headers: { cookie: b.cookie, 'sec-fetch-site': 'cross-site' }, socket: {} };
  const res = { setHeader() {}, writeHead(s) { this.status = s; }, end() {} };
  assert.strictEqual(accounts.requireAuth(req, res), false);
  assert.strictEqual(res.status, 403);
});

test('hidden sheets stay shut until Admin sets their password', async () => {
  const clock = { t: Date.parse('2026-10-28T09:00:00Z') };
  const dir = tmpDir();
  const accounts = createAccounts({ dir, now: () => clock.t });
  assert.strictEqual(accounts.hasHiddenPassword(), false);
  assert.ok(!accounts.hiddenPasswordMatches(''));
  const { b } = await setUpAdmin(accounts, clock, dir);
  await b.call('POST', '/api/settings/hidden-password', { password: 'test hidden pw' });
  assert.ok(accounts.hiddenPasswordMatches(' test hidden pw '));
  assert.ok(!accounts.hiddenPasswordMatches('something else'));
});

test('the account files never hold a password or cookie in plain text', async () => {
  const clock = { t: Date.parse('2026-10-28T09:00:00Z') };
  const dir = tmpDir();
  const accounts = createAccounts({ dir, now: () => clock.t });
  const { b } = await setUpAdmin(accounts, clock, dir);
  const files = ['users.json', 'sessions.json'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  assert.ok(!files.includes('a long admin password'));
  assert.ok(!files.includes(b.cookie.split('=')[1]));
});

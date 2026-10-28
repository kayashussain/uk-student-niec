const test = require('node:test');
const assert = require('node:assert');
const { createAuth, clientIp, localDate, safeEqual } = require('../shared/server-utils');

function fakeReq({ user, pass, ip = '203.0.113.5', forwardedFor } = {}) {
  const headers = {};
  if (user !== undefined) headers.authorization = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
  return { headers, socket: { remoteAddress: ip } };
}

function fakeRes() {
  return { status: null, headers: null, writeHead(status, headers) { this.status = status; this.headers = headers; }, end() {} };
}

test('safeEqual compares values of any length', () => {
  assert.ok(safeEqual('secret', 'secret'));
  assert.ok(!safeEqual('secret', 'secret2'));
  assert.ok(!safeEqual('', 'x'));
});

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const crypto = require('node:crypto');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-auth-'));
const hashOf = (pw) => crypto.scryptSync(pw, 'niec-login-v1', 32).toString('hex');
const authFor = (opts = {}) => createAuth({
  secretDir: tmpDir(),
  accounts: [{ id: 'admin', label: 'Admin', hash: hashOf('pw') }, { id: 'mock', label: 'Mock Team', hash: hashOf('m') }],
  ...opts,
});

// A login POST, as the login page sends it.
function loginReq(body, ip = '203.0.113.5') {
  const req = new PassThrough();
  req.headers = { 'content-type': 'application/json' };
  req.socket = { remoteAddress: ip };
  req.method = 'POST';
  req.end(JSON.stringify(body));
  return req;
}

function captureRes() {
  return {
    status: null, headers: null, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = String(body || ''); },
  };
}

function cookieFrom(res) {
  return res.headers['Set-Cookie'].split(';')[0];
}

test('an account with its own password logs in, and the cookie then says who it is', async () => {
  const logins = [];
  const auth = authFor({ onLogin: (req, user) => logins.push(user.label) });
  const res = captureRes();
  await auth.handleLogin(loginReq({ account: 'mock', password: 'm' }), res);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers['Set-Cookie'], /HttpOnly/);
  const req = { headers: { cookie: 'other=1; ' + cookieFrom(res) }, method: 'GET', url: '/' };
  assert.strictEqual(auth.requireAuth(req, captureRes()), true);
  assert.deepStrictEqual(req.user, { id: 'mock', label: 'Mock Team' });
  assert.deepStrictEqual(logins, ['Mock Team']);
  // Another account's password doesn't work for this one, and an unknown account is refused.
  const wrong = captureRes();
  await auth.handleLogin(loginReq({ account: 'mock', password: 'pw' }), wrong);
  assert.strictEqual(wrong.status, 401);
  const unknown = captureRes();
  await auth.handleLogin(loginReq({ account: 'boss', password: 'pw' }), unknown);
  assert.strictEqual(unknown.status, 400);
});

test('a cookie edited to name another account is refused', async () => {
  const auth = authFor();
  const res = captureRes();
  await auth.handleLogin(loginReq({ account: 'mock', password: 'm' }), res);
  const forged = cookieFrom(res).replace('=mock.', '=admin.');
  assert.strictEqual(auth.requireAuth({ headers: { cookie: forged }, method: 'GET', url: '/' }, captureRes()), false);
});

test('without a login, a page visit goes to the login page and anything else gets a 401', () => {
  const auth = authFor({ homePath: () => '/commission/' });
  const page = captureRes();
  assert.strictEqual(auth.requireAuth({ headers: { accept: 'text/html' }, method: 'GET', url: '/x' }, page), false);
  assert.strictEqual(page.status, 302);
  assert.strictEqual(page.headers.Location, '/login?next=%2Fcommission%2F');
  const api = captureRes();
  assert.strictEqual(auth.requireAuth({ headers: {}, method: 'GET', url: '/api/data' }, api), false);
  assert.strictEqual(api.status, 401);
});

test('a forged, expired or other-server cookie is refused', async () => {
  let t = 1000;
  const dir = tmpDir();
  const auth = authFor({ secretDir: dir, now: () => t });
  const res = captureRes();
  await auth.handleLogin(loginReq({ account: 'admin', password: 'pw' }), res);
  const cookie = cookieFrom(res);
  const visit = (c) => auth.requireAuth({ headers: { cookie: c }, method: 'GET', url: '/' }, captureRes());
  assert.strictEqual(visit(cookie), true);
  const [name, value] = cookie.split('=');
  const [id, expires, mac] = value.split('.');
  assert.strictEqual(visit(`${name}=${id}.${Number(expires) + 1}.${mac}`), false); // stretched expiry
  assert.strictEqual(authFor().requireAuth({ headers: { cookie }, method: 'GET', url: '/' }, captureRes()), false);
  // The other app reading the same key folder accepts it.
  assert.strictEqual(authFor({ secretDir: dir, now: () => t }).requireAuth({ headers: { cookie }, method: 'GET', url: '/' }, captureRes()), true);
  t = Number(expires) + 1;
  assert.strictEqual(visit(cookie), false);
});

test('login locks an address out after too many wrong passwords, even for the right one', async () => {
  let t = 0;
  const auth = authFor({ maxFailures: 3, windowMs: 1000, now: () => t });
  for (let i = 0; i < 3; i += 1) {
    const res = captureRes();
    await auth.handleLogin(loginReq({ account: 'admin', password: 'nope' }), res);
    assert.strictEqual(res.status, 401);
  }
  const locked = captureRes();
  await auth.handleLogin(loginReq({ account: 'admin', password: 'pw' }), locked);
  assert.strictEqual(locked.status, 429);
  // Another address isn't affected.
  const other = captureRes();
  await auth.handleLogin(loginReq({ account: 'admin', password: 'pw' }, '198.51.100.7'), other);
  assert.strictEqual(other.status, 200);
  // After the window the right password works again.
  t = 1001;
  const later = captureRes();
  await auth.handleLogin(loginReq({ account: 'admin', password: 'pw' }), later);
  assert.strictEqual(later.status, 200);
});

test('logging out clears the cookie', () => {
  const res = captureRes();
  authFor().handleLogout({ headers: {} }, res);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
});

test('X-Forwarded-For is only trusted from a private proxy, and only its last entry', () => {
  assert.strictEqual(clientIp(fakeReq({ ip: '10.0.0.3', forwardedFor: '1.1.1.1, 203.0.113.9' })), '203.0.113.9');
  assert.strictEqual(clientIp(fakeReq({ ip: '::ffff:127.0.0.1', forwardedFor: '203.0.113.9' })), '203.0.113.9');
  assert.strictEqual(clientIp(fakeReq({ ip: '198.51.100.1', forwardedFor: '1.1.1.1' })), '198.51.100.1');
});

test('localDate uses the office time zone, not UTC', () => {
  // 20:00 UTC on 1 Jan is already 2 Jan in Kathmandu (UTC+5:45).
  assert.strictEqual(localDate(new Date('2026-01-01T20:00:00Z'), 'Asia/Kathmandu'), '2026-01-02');
  assert.strictEqual(localDate(new Date('2026-01-01T20:00:00Z'), 'UTC'), '2026-01-01');
});

test('every response carries the security headers', () => {
  const res = fakeRes();
  authFor().requireAuth({ headers: {}, method: 'GET', url: '/' }, res);
  assert.strictEqual(res.headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.strictEqual(res.headers['X-Content-Type-Options'], 'nosniff');
});

test('the activity record keeps every entry, newest first, with the device', () => {
  const { createActivityLog } = require('../shared/server-utils');
  const log = createActivityLog(tmpDir());
  const req = { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36' }, socket: { remoteAddress: '203.0.113.5' } };
  log.record(req, { id: 'mock', label: 'Mock Team' }, 'Logged in');
  log.record(req, { id: 'mock', label: 'Mock Team' }, 'Changed', { changes: ['x'] });
  const list = log.latest();
  assert.deepStrictEqual(list.map((e) => e.action), ['Changed', 'Logged in']);
  assert.strictEqual(list[1].account, 'Mock Team');
  assert.strictEqual(list[1].device, 'Chrome on Windows');
});

test('describeDevice names common phones and computers', () => {
  const { describeDevice } = require('../shared/server-utils');
  assert.strictEqual(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1'), 'Safari on iPhone');
  assert.strictEqual(describeDevice('Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36'), 'Chrome on Android');
  assert.strictEqual(describeDevice('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Edg/120.0'), 'Edge on Windows');
  assert.strictEqual(describeDevice(''), 'Unknown device');
});

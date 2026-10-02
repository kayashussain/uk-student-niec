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

test('auth locks an address out after too many wrong passwords, even for the right one', () => {
  let t = 0;
  const auth = createAuth({ username: 'admin', password: 'pw', maxFailures: 3, windowMs: 1000, now: () => t });
  for (let i = 0; i < 3; i += 1) {
    const res = fakeRes();
    assert.strictEqual(auth(fakeReq({ user: 'admin', pass: 'nope' }), res), false);
    assert.strictEqual(res.status, 401);
  }
  const locked = fakeRes();
  assert.strictEqual(auth(fakeReq({ user: 'admin', pass: 'pw' }), locked), false);
  assert.strictEqual(locked.status, 429);
  // Another address isn't affected.
  assert.strictEqual(auth(fakeReq({ user: 'admin', pass: 'pw', ip: '198.51.100.7' }), fakeRes()), true);
  // After the window the right password works again.
  t = 1001;
  assert.strictEqual(auth(fakeReq({ user: 'admin', pass: 'pw' }), fakeRes()), true);
});

test('a first visit with no password is not counted as a wrong guess', () => {
  const auth = createAuth({ username: 'admin', password: 'pw', maxFailures: 1 });
  auth(fakeReq(), fakeRes());
  auth(fakeReq(), fakeRes());
  assert.strictEqual(auth(fakeReq({ user: 'admin', pass: 'pw' }), fakeRes()), true);
});

test('auth is off when no username/password is configured', () => {
  assert.strictEqual(createAuth({ failClosed: false })(fakeReq(), fakeRes()), true);
});

test('with REQUIRE_PASSWORD on, a missing username/password locks everything instead of opening it', () => {
  const res = fakeRes();
  assert.strictEqual(createAuth({ failClosed: true })(fakeReq(), res), false);
  assert.strictEqual(res.status, 503);
  const half = fakeRes();
  assert.strictEqual(createAuth({ username: 'admin', failClosed: true })(fakeReq({ user: 'admin', pass: 'x' }), half), false);
  assert.strictEqual(half.status, 503);
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
  createAuth({ username: 'admin', password: 'pw' })(fakeReq(), res);
  assert.strictEqual(res.headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.strictEqual(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(res.headers['WWW-Authenticate']);
});

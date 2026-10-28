const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { clientIp, localDate, safeEqual, send } = require('../shared/server-utils');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-utils-'));

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
  send(res, 200, 'x');
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

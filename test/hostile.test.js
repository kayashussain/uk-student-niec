// Sends odd and hostile requests to the real Student Details server (as a logged-in Admin and as nobody) and checks
// that none is answered with a server error and the server is still up afterwards. A JSON `null` sent to the
// presence endpoint once stopped the whole app, so this walks the endpoints with bodies of every awkward kind.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('hostile requests never cause a server error or stop the server', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-hostile-'));
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'), env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir }, stdio: 'ignore',
  });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }

  let cookie = '';
  const call = async (method, url, body, withCookie = true) => {
    const res = await fetch(base + url, {
      method, redirect: 'manual', body: body === undefined ? undefined : body,
      headers: { 'content-type': 'application/json', ...(withCookie && cookie ? { cookie } : {}) },
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    await res.arrayBuffer();
    return res.status;
  };
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  assert.strictEqual(await call('POST', '/api/login/first-admin', JSON.stringify({ setupCode: code, username: 'owner', name: 'Owner' })), 200);
  assert.strictEqual(await call('POST', '/api/login/new-password', JSON.stringify({ password: 'Strong-Pass-2026' })), 200);

  const bodies = [undefined, '', 'null', '[]', '{}', '"text"', '123', '{"a":', '{"sheets":"x"}', '{"sheets":[]}',
    '{"sheets":[{"id":1,"columns":"x","rows":{}}],"activeSheetId":"a"}', '{"patch":{"sheetOrder":[],"sheets":null},"baseRevision":"x"}',
    '{"name":{"toString":1}}', '{"username":["a"],"password":{"x":1},"departments":[{"a":1}]}', '{"id":{},"sheetId":[],"rowId":5,"col":{}}',
    '{"baseRevision":1e308,"sheets":[{"id":"s","columns":[],"rows":[{"_id":null}]}],"activeSheetId":"s"}'];
  const targets = [['POST', '/api/data'], ['POST', '/api/presence'], ['POST', '/api/facts'], ['POST', '/api/users'], ['POST', '/api/users/0123456789abcdef'],
    ['POST', '/api/login'], ['POST', '/api/login/code'], ['POST', '/api/login/new-password'], ['POST', '/api/sessions/end-others']];
  const problems = [];
  for (const [method, url] of targets) {
    for (const body of bodies) {
      const status = await call(method, url, body);
      if (status >= 500) problems.push(`${method} ${url} body=${String(body).slice(0, 40)} -> ${status}`);
    }
  }
  for (const url of ['/api/data?since=abc', '/api/data?since=-1', '/api/dashboard?intake=%00', '/api/activity?limit=abc&offset=-9&from=zzz', '/api/facts?q=' + 'a'.repeat(500), '/%', '/..%2fserver.js', '/api/nope']) {
    const status = await call('GET', url);
    if (status >= 500) problems.push(`GET ${url} -> ${status}`);
  }
  for (const file of ['/data.json', '/users.json', '/sessions.json', '/first-admin-code.txt', '/server.js', '/fact-seed-sheet.json']) {
    const status = await call('GET', file);
    assert.notStrictEqual(status, 200, `${file} must not be served`);
  }
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(await call('GET', '/login', undefined, false), 200, 'the server is still up');
  assert.strictEqual(await call('GET', '/healthz', undefined, false), 200, 'the health check answers without a login');
});

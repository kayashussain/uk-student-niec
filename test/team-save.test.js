// A team's save is checked against the students as the server has them now, not only against the (possibly older)
// revision the page had: an old page can't change a student who has moved on to another stage, can't edit an
// earlier intake after a newer one was started, and can only put plain text into columns the sheet has.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = 'APPLICATION STATUS';

test('team saves from an old page are checked against the students as they are now', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-teamsave-'));
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'), env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir }, stdio: 'ignore',
  });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const client = () => {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    };
  };
  const admin = client();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  assert.strictEqual((await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' })).status, 200);
  assert.strictEqual((await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' })).status, 200);
  const person = async (username, role, departments) => {
    const made = await admin('POST', '/api/users', { username, name: username + ' Test', role, departments });
    assert.strictEqual(made.status, 200, JSON.stringify(made.json));
    const c = client();
    assert.strictEqual((await c('POST', '/api/login', { username, password: made.json.temporaryPassword })).status, 200);
    assert.strictEqual((await c('POST', '/api/login/new-password', { password: 'Team-Strong-2026!' })).status, 200);
    return c;
  };

  let wb = (await admin('GET', '/api/data')).json;
  const sheet = wb.sheets[0];
  const blank = Object.fromEntries(sheet.columns.map((c) => [c, '']));
  sheet.rows = [{ ...blank, _id: 'r1', 'FIRST NAME': 'Asha', [S]: 'Application Stage' }];
  assert.strictEqual((await admin('POST', '/api/data', { sheets: wb.sheets, activeSheetId: wb.activeSheetId, baseRevision: wb.revision })).status, 200);

  const manager = await person('chief', 'manager', ['application']);
  const old = (await manager('GET', '/api/data')).json; // the Manager's page, while the student is at Application Stage

  // Admin moves the student on to Visa Stage.
  wb = (await admin('GET', '/api/data')).json;
  wb.sheets[0].rows[0][S] = 'Visa Stage';
  assert.strictEqual((await admin('POST', '/api/data', { sheets: wb.sheets, activeSheetId: wb.activeSheetId, baseRevision: wb.revision })).status, 200);

  // The Manager's old page sends the student back to Mock Stage and renames the university: refused.
  const edited = JSON.parse(JSON.stringify(old));
  Object.assign(edited.sheets[0].rows[0], { [S]: 'Mock Stage', 'UNIVERSITY NAME': 'Hacked' });
  const r = await manager('POST', '/api/data', { sheets: edited.sheets, activeSheetId: edited.activeSheetId, baseRevision: old.revision });
  assert.strictEqual(r.status, 409);
  let now = (await admin('GET', '/api/data')).json.sheets[0].rows[0];
  assert.strictEqual(now[S], 'Visa Stage');
  assert.strictEqual(now['UNIVERSITY NAME'], '');

  // Staff on the current intake: an object in a cell, or a column the sheet doesn't have, is refused.
  wb = (await admin('GET', '/api/data')).json;
  wb.sheets[0].rows.push({ ...blank, _id: 'r2', 'FIRST NAME': 'Bina', [S]: 'Application Stage' });
  assert.strictEqual((await admin('POST', '/api/data', { sheets: wb.sheets, activeSheetId: wb.activeSheetId, baseRevision: wb.revision })).status, 200);
  const staff = await person('asha', 'staff', ['application']);
  const view = (await staff('GET', '/api/data')).json;
  const bad = JSON.parse(JSON.stringify(view));
  bad.sheets[0].rows[0]['COURSE NAME'] = { big: 'x' };
  assert.strictEqual((await staff('POST', '/api/data', { sheets: bad.sheets, activeSheetId: bad.activeSheetId, baseRevision: view.revision })).status, 400);

  // A newer intake is started; the staff page still holding the earlier one can't change it.
  wb = (await admin('GET', '/api/data')).json;
  wb.sheets.push({ ...wb.sheets[0], id: 'sheet-' + Date.now().toString(36) + 'zzzzz', name: 'Next intake', rows: [] });
  assert.strictEqual((await admin('POST', '/api/data', { sheets: wb.sheets, activeSheetId: wb.activeSheetId, baseRevision: wb.revision })).status, 200);
  const late = JSON.parse(JSON.stringify(view));
  late.sheets[0].rows[0]['UNIVERSITY NAME'] = 'Too late';
  assert.strictEqual((await staff('POST', '/api/data', { sheets: late.sheets, activeSheetId: late.activeSheetId, baseRevision: view.revision })).status, 409);
  now = (await admin('GET', '/api/data')).json.sheets[0].rows.find((x) => x._id === 'r2');
  assert.strictEqual(now['UNIVERSITY NAME'], '');
});

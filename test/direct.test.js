// The University Partners page is for Admin only: the store keeps what Admin enters as plain text, and the real server
// refuses everyone else (logged out, staff, Manager) for the page and the data.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createDirect, STARTERS } = require('../student-details/direct');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-direct-'));

test('the list starts empty and keeps campuses, slabs and contacts as plain text within the known fields', () => {
  const dir = tmp();
  const direct = createDirect(dir, { starters: [] });
  assert.deepStrictEqual(direct.list(), []);
  const { university } = direct.create('  Bangor University ', 'Kayas');
  assert.strictEqual(university.name, 'Bangor University');
  const saved = direct.update(university.id, {
    name: 'Bangor University', status: 'Active', country: 'United Kingdom',
    campuses: [{ name: 'Main Campus', city: 'Bangor, Wales' }, { name: '', city: '' }],
    slabs: [{ level: 'UG', students: '1 to 10', commission: '15%' }, { level: '', students: '', commission: '', note: '' }],
    contacts: [{ name: 'Braj Jha', role: 'Regional Manager', email: 'b.jha@bangor.ac.uk' }],
    paymentTerms: 'Within 60 days\r\nof census', evil: '<script>', status2: 'x',
  }, 'Kayas');
  assert.strictEqual(saved.university.campuses.length, 1, 'blank rows are dropped');
  assert.strictEqual(saved.university.slabs.length, 1);
  assert.strictEqual(saved.university.paymentTerms, 'Within 60 days\nof census');
  assert.strictEqual(saved.university.evil, undefined);
  assert.deepStrictEqual(direct.list()[0].campuses, ['Main Campus, Bangor, Wales']);
  assert.strictEqual(direct.list()[0].slabCount, 1);
  // survives a restart
  assert.strictEqual(createDirect(dir, { starters: [] }).get(university.id).contacts[0].name, 'Braj Jha');
  // a made-up status is not kept
  assert.strictEqual(direct.update(university.id, { status: 'Whatever' }, 'Kayas').university.status, 'Active');
});

test('a new list starts with the five direct universities, once, and a removed one is not added back', () => {
  const dir = tmp();
  const direct = createDirect(dir);
  assert.deepStrictEqual(direct.list().map((u) => u.name).sort(), STARTERS.map((u) => u.name).sort());
  assert.deepStrictEqual(STARTERS.map((u) => u.name), ['Ulster University (QA)', 'Northumbria University London (QA)', 'University of West London', 'Bangor University', 'Middlesex University']);
  assert.ok(direct.list().every((u) => u.campuses.length > 0 && u.slabCount === 0), 'campuses filled in, no commission invented');
  const mid = direct.list().find((u) => u.name === 'Middlesex University');
  direct.remove(mid.id);
  assert.strictEqual(createDirect(dir).list().length, 4);
});

test('duplicate and empty names are refused, and a university can be removed', () => {
  const direct = createDirect(tmp(), { starters: [] });
  const a = direct.create('Aston University', 'Kayas').university;
  assert.ok(direct.create('aston university', 'Kayas').error);
  assert.ok(direct.create('   ', 'Kayas').error);
  const b = direct.create('Bangor University', 'Kayas').university;
  assert.ok(direct.update(b.id, { name: 'ASTON UNIVERSITY' }, 'Kayas').error);
  assert.ok(direct.remove(a.id).removed);
  assert.ok(direct.remove(a.id).error);
  assert.strictEqual(direct.get(a.id), null);
});

test('a damaged list file is set aside, not overwritten', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'direct-universities.json'), '{ nope');
  assert.deepStrictEqual(createDirect(dir).list(), []);
  assert.strictEqual(fs.readdirSync(dir).filter((f) => f.startsWith('direct-universities.damaged-')).length, 1);
});

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('only Admin can open the page or read and change the list on the real server', { timeout: 120000 }, async (t) => {
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
      return { status: res.status, json, location: res.headers.get('location') };
    };
  };
  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' });
  await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' });

  // Admin: the page and the full cycle.
  assert.strictEqual((await admin('GET', '/university-partners')).status, 200);
  const made = await admin('POST', '/api/direct', { name: 'Aston University' });
  assert.strictEqual(made.status, 200);
  const id = made.json.id;
  assert.strictEqual((await admin('POST', `/api/direct/${id}`, { name: 'Aston University', slabs: [{ level: 'UG', students: '1 to 5', commission: '12%' }] })).status, 200);
  assert.strictEqual((await admin('GET', `/api/direct/${id}`)).json.slabs[0].commission, '12%');
  assert.strictEqual((await admin('GET', '/api/direct')).json.length, 6, 'the five starters and the one just added');

  // Not logged in: nothing.
  const nobody = person();
  assert.notStrictEqual((await nobody('GET', '/university-partners')).status, 200);
  assert.notStrictEqual((await nobody('GET', '/api/direct')).status, 200);
  assert.notStrictEqual((await nobody('GET', `/api/direct/${id}`)).status, 200);
  assert.notStrictEqual((await nobody('POST', '/api/direct', { name: 'X University' })).status, 200);

  // Staff and Manager: refused for the page (sent home) and for every call.
  for (const [username, role, extra] of [['sita', 'staff', { departments: ['application'] }], ['chief', 'manager', {}]]) {
    const made2 = await admin('POST', '/api/users', { name: username, username, role, ...extra });
    assert.strictEqual(made2.status, 200, `${username} created`);
    const them = person();
    assert.strictEqual((await them('POST', '/api/login', { username, password: made2.json.temporaryPassword })).json.stage, 'new-password');
    await them('POST', '/api/login/new-password', { password: 'Another-Long-Pass-2026' });
    const page = await them('GET', '/university-partners');
    assert.strictEqual(page.status, 302, `${role} is sent away from the page`);
    assert.ok(/^\/(students|dashboard)/.test(page.location), `${role} goes home`);
    assert.strictEqual((await them('GET', '/api/direct')).status, 403, `${role} cannot read the list`);
    assert.strictEqual((await them('GET', `/api/direct/${id}`)).status, 403);
    assert.strictEqual((await them('POST', '/api/direct', { name: 'Y University' })).status, 403);
    assert.strictEqual((await them('POST', `/api/direct/${id}`, { name: 'Bangor University', notes: 'hacked' })).status, 403);
    assert.strictEqual((await them('POST', `/api/direct/${id}/delete`, {})).status, 403);
  }
  assert.strictEqual((await admin('GET', `/api/direct/${id}`)).json.notes, '', 'nothing was changed by the others');

  // Admin removes it.
  assert.strictEqual((await admin('POST', `/api/direct/${id}/delete`, {})).status, 200);
  assert.strictEqual((await admin('GET', '/api/direct')).json.length, 5);
});

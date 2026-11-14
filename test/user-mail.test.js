// Each person's own mailbox (student-details/user-mail.js): the password is kept encrypted and never sent to a page; a team member
// emails from their own address, signed with their own name; without one they cannot email. All names and addresses are made up.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const { createUserMail } = require('../student-details/user-mail');
const mailer = require('../shared/mailer');

test('a mailbox is kept with its password encrypted, and a page only learns that one is saved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-usermail-'));
  const store = createUserMail(dir);
  assert.ok(store.clean({ from: 'not an address', password: 'x' }, { host: 'mail.example.org', port: 465 }, mailer.isAddress).error);
  assert.ok(store.clean({ from: 'asha@example.org', password: '' }, { host: 'mail.example.org', port: 465 }, mailer.isAddress).error);
  const made = store.clean({ from: 'Asha@Example.org', password: 'Mailbox-Secret-1', phone: '+977 9800000001' }, { host: 'mail.example.org', port: 465, security: 'ssl' }, mailer.isAddress);
  assert.deepStrictEqual([made.box.from, made.box.host, made.box.port, made.box.security], ['asha@example.org', 'mail.example.org', 465, 'ssl']);
  store.save('u1', made.box);
  const raw = fs.readFileSync(path.join(dir, 'user-mail.json'), 'utf8');
  assert.ok(!raw.includes('Mailbox-Secret-1'), 'the password is not in the file as typed');
  assert.ok(!JSON.stringify(store.info('u1')).includes('Mailbox-Secret-1'), 'nor in what a page is told');
  assert.strictEqual(store.info('u1').set, true);
  assert.strictEqual(createUserMail(dir).config('u1').pass, 'Mailbox-Secret-1', 'the server can still use it after a restart');
  assert.strictEqual(store.config('nobody'), null);
  assert.strictEqual(store.remove('u1'), true);
  assert.strictEqual(store.info('u1').set, false);
});

test('a team member emails from their own mailbox, signed with their own name, and cannot email without one', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-mymail-'));
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir };
  delete env.ANTHROPIC_API_KEY;
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', 'student-details'), env, stdio: 'ignore' });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const person = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const tx = await res.text(); let json = null; try { json = JSON.parse(tx); } catch (e) { /* not JSON */ }
    return { status: res.status, json };
  }; };
  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' });
  await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' });
  const made = (await admin('POST', '/api/users', { username: 'asha', name: 'Asha Example', email: '', departments: ['application'] })).json;
  const asha = person(); await asha('POST', '/api/login', { username: 'asha', password: made.temporaryPassword }); await asha('POST', '/api/login/new-password', { password: 'Team-Strong-2026' });
  const id = (await admin('POST', '/api/students/new', { stage: 'Application Stage', fields: { 'FIRST NAME': 'Mina', 'LAST NAME': 'Example', EMAIL: 'mina@example.org' } })).json.id;

  assert.strictEqual((await asha('GET', '/my-email')).status, 200, 'every account opens My email');
  assert.strictEqual((await asha('GET', '/api/my-mail')).json.set, false);
  let pre = (await asha('POST', `/api/cards/${id}/messages/preview`, { template: 'custom', subject: 'Hello', body: 'Dear {first_name},' })).json;
  assert.deepStrictEqual([pre.mail.ready, pre.mail.own], [false, true], 'without a mailbox of their own, a team member cannot email');
  const sent = (await asha('POST', `/api/cards/${id}/messages/send`, { channel: 'email', template: 'custom', subject: 'Hello', body: 'Dear {first_name},' })).json;
  assert.deepStrictEqual([sent.status, sent.ownMailNeeded], ['not-configured', true], 'nothing leaves');

  // A mailbox that does not work is not saved.
  const bad = await asha('POST', '/api/my-mail', { from: 'asha@example.org', password: 'wrong', host: 'mail.example.invalid', port: 465 });
  assert.strictEqual(bad.status, 400);
  assert.match(bad.json.error, /nothing was saved/);
  assert.strictEqual((await asha('GET', '/api/my-mail')).json.set, false);

  // With a mailbox (saved here directly, as no real mail server is reached in a test), the email goes from it, signed by Asha.
  const ashaId = (await admin('GET', '/api/users')).json.find((u) => u.username === 'asha').id;
  const store = createUserMail(dir);
  store.save(ashaId, store.clean({ from: 'asha@example.org', password: 'Mailbox-Secret-1', phone: '+977 9800000001' }, { host: 'mail.example.org', port: 465 }, mailer.isAddress).box);
  const info = (await asha('GET', '/api/my-mail')).json;
  assert.deepStrictEqual([info.set, info.from], [true, 'asha@example.org']);
  assert.ok(!JSON.stringify(info).includes('Mailbox-Secret-1'), 'the password never comes back');
  pre = (await asha('POST', `/api/cards/${id}/messages/preview`, { template: 'custom', subject: 'Hello', body: 'Dear {first_name},' })).json;
  assert.deepStrictEqual([pre.mail.ready, pre.mail.from], [true, 'asha@example.org']);
  assert.match(pre.text, /Asha Example\nApplication Team/, 'signed with her own name and team');
  assert.match(pre.text, /Email: asha@example\.org/);
  assert.strictEqual((await admin('POST', `/api/cards/${id}/messages/preview`, { template: 'custom', subject: 'Hello', body: 'Dear {first_name},' })).json.mail.from, '', 'Admin is not given Asha\'s mailbox');
  assert.strictEqual((await asha('POST', '/api/my-mail/delete', {})).status, 200);
  assert.strictEqual((await asha('GET', '/api/my-mail')).json.set, false);
});

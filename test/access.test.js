const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { createAccounts, totpAt, base32Decode } = require('../shared/accounts');
const { sendMail, setupEmail, buildMessage } = require('../shared/mailer');
const { createActivityLog } = require('../shared/server-utils');
const Teams = require('../shared/teams');
const { buildDashboard } = require('../student-details/dashboard-stats');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-access-'));
const codeFor = (secret, t) => totpAt(base32Decode(secret), Math.floor(t / 30000));

// A browser that keeps its session cookie, talking straight to the accounts module.
function browser(accounts, { host = 'niec.example.org' } = {}) {
  let cookie = '';
  async function call(method, url, body) {
    const req = new PassThrough();
    Object.assign(req, { method, url, socket: { remoteAddress: '203.0.113.9' } });
    req.headers = { cookie, host, 'user-agent': 'Chrome/120 Windows', accept: 'application/json', 'content-type': 'application/json', 'x-forwarded-proto': 'https' };
    req.end(body === undefined ? '' : JSON.stringify(body));
    const res = { status: null, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, writeHead(s, h) { this.status = s; Object.assign(this.headers, h); }, end(b) { this.body = String(b || ''); } };
    if (!(await accounts.handleApi(req, res, url))) { res.allowed = accounts.requireAuth(req, res); res.user = req.user; }
    const set = res.headers['Set-Cookie'];
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    res.json = res.body ? JSON.parse(res.body) : null;
    return res;
  }
  return { call };
}

// A mailer that records what would have been sent (or fails on request).
function fakeMailer({ fail = null } = {}) {
  const sent = [];
  return {
    sent,
    isAddress: require('../shared/mailer').isAddress,
    setupEmail,
    testEmail: require('../shared/mailer').testEmail,
    async sendMail(cfg, message) { if (fail) throw new Error(fail); sent.push({ cfg, ...message }); return {}; },
  };
}

async function setUp({ mailer = fakeMailer(), clock = { t: Date.parse('2026-10-28T09:00:00Z') } } = {}) {
  const dir = tmpDir();
  const accounts = createAccounts({ dir, now: () => clock.t, mailer, activity: createActivityLog(dir) });
  const b = browser(accounts);
  await b.call('POST', '/api/login/first-admin', { setupCode: fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8'), name: 'Kayas', username: 'KAYAS' });
  await b.call('POST', '/api/login/new-password', { password: 'a long admin password' });
  const { secret } = (await b.call('POST', '/api/login/authenticator', {})).json;
  await b.call('POST', '/api/login/authenticator', { code: codeFor(secret, clock.t) });
  return { dir, accounts, admin: b, mailer, clock };
}

// ---- access: departments, Manager, never Admin ----

test('one person can work in several teams, and Admin can never be given', async () => {
  const { admin } = await setUp();
  const both = await admin.call('POST', '/api/users', { name: 'Sita', username: 'sita', role: 'staff', departments: ['application', 'followup'] });
  assert.strictEqual(both.status, 200, both.body);
  assert.deepStrictEqual(both.json.user.departments, ['application', 'followup']);
  assert.strictEqual(both.json.user.accessLabel, 'Application Team + Follow-up Team');
  assert.strictEqual((await admin.call('POST', '/api/users', { name: 'X', username: 'xxx', role: 'admin' })).status, 400);
  assert.strictEqual((await admin.call('POST', '/api/users', { name: 'X', username: 'xxx', role: 'staff', departments: [] })).status, 400);
  assert.strictEqual((await admin.call('POST', '/api/users', { name: 'X', username: 'xxx', role: 'staff', departments: ['finance'] })).status, 400);
  const manager = await admin.call('POST', '/api/users', { name: 'Chief', username: 'chief', role: 'manager' });
  assert.strictEqual(manager.json.user.accessLabel, 'Manager');
  assert.deepStrictEqual(manager.json.user.departments, []);
});

test('access can be changed later, never to Admin, and the Admin account itself is untouchable', async () => {
  const { admin } = await setUp();
  const { user } = (await admin.call('POST', '/api/users', { name: 'Sita', username: 'sita', role: 'staff', departments: ['mock'] })).json;
  let r = await admin.call('POST', `/api/users/${user.id}`, { action: 'update-person', role: 'staff', departments: ['mock', 'followup'] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await admin.call('GET', '/api/users')).json.find((u) => u.id === user.id).accessLabel, 'Mock Team + Follow-up Team');
  r = await admin.call('POST', `/api/users/${user.id}`, { action: 'update-person', role: 'admin' });
  assert.strictEqual(r.status, 400);
  const me = (await admin.call('GET', '/api/me')).json;
  r = await admin.call('POST', `/api/users/${me.id}`, { action: 'update-person', role: 'staff', departments: ['mock'] });
  assert.strictEqual(r.status, 400);
});

test('accounts saved with one team as their role become staff in that team', async () => {
  const { dir, accounts, admin } = await setUp();
  const file = path.join(dir, 'users.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.users.push({ id: 'abcdef0123456789', username: 'old', name: 'Old Mock', role: 'mock', passwordHash: 'x', disabled: false });
  fs.writeFileSync(file, JSON.stringify(data));
  const list = (await admin.call('GET', '/api/users')).json;
  const old = list.find((u) => u.username === 'old');
  assert.strictEqual(old.role, 'staff');
  assert.deepStrictEqual(old.departments, ['mock']);
  void accounts;
});

test('usernames are not case sensitive, when adding and when logging in', async () => {
  const { accounts, admin, clock } = await setUp();
  assert.strictEqual((await admin.call('POST', '/api/users', { name: 'Pema', username: 'PEMA.Lama', role: 'manager' })).json.user.username, 'pema.lama');
  assert.strictEqual((await admin.call('POST', '/api/users', { name: 'Dup', username: 'pema.LAMA', role: 'manager' })).status, 409);
  const again = browser(accounts);
  assert.strictEqual((await again.call('POST', '/api/login', { username: ' KAYAS ', password: 'a long admin password' })).json.stage, 'code');
  void clock;
});

// ---- setup emails ----

// The mail server settings live on the server (mail.json in the data folder), not on a page.
const saveMail = (dir, cfg = {}) => fs.writeFileSync(path.join(dir, 'mail.json'), JSON.stringify({
  host: 'smtp.example.org', port: 465, security: 'ssl', user: 'mailer', pass: 'secret pw', from: 'system@niecedu.com.np', fromName: 'UK Student NIEC', ...cfg,
}));

test('adding a person emails their login details, and the password is not shown to Admin', async () => {
  const { admin, mailer, accounts, dir } = await setUp();
  saveMail(dir);
  const r = await admin.call('POST', '/api/users', { name: 'Sita Sharma', username: 'sita', email: 'Sita@NIECedu.com.np', role: 'staff', departments: ['application', 'followup'] });
  assert.strictEqual(r.json.email.status, 'sent');
  assert.strictEqual(r.json.temporaryPassword, undefined);
  assert.strictEqual(mailer.sent.length, 1);
  const mail = mailer.sent[0];
  assert.strictEqual(mail.to, 'sita@niecedu.com.np');
  assert.match(mail.subject, /Set up your UK Student NIEC account/);
  assert.match(mail.text, /Username: sita/);
  assert.match(mail.text, /Application Team \+ Follow-up Team/);
  assert.match(mail.text, /https:\/\/niec\.example\.org\/login/);
  const temp = /Temporary password: (\S+)/.exec(mail.text)[1];
  // The emailed temporary password really logs her in (first step of her setup).
  const sita = browser(accounts);
  assert.strictEqual((await sita.call('POST', '/api/login', { username: 'SITA', password: temp })).json.stage, 'new-password');
  assert.ok(!/\u2014/.test(mail.text + mail.html), 'no em dashes in the email');
});

test('when the email cannot be sent, Admin gets the temporary password and the reason', async () => {
  const failing = fakeMailer({ fail: 'The mail server refused the username or password.' });
  const { admin, dir } = await setUp({ mailer: failing });
  let r = await admin.call('POST', '/api/users', { name: 'A', username: 'aaa', email: 'a@x.org', role: 'manager' });
  assert.strictEqual(r.json.email.status, 'not-configured'); // no mail server saved yet
  assert.ok(r.json.temporaryPassword);
  saveMail(dir, { port: 587, security: 'starttls', pass: 'hunter2 hunter2' });
  r = await admin.call('POST', '/api/users', { name: 'B', username: 'bbb', email: 'b@x.org', role: 'manager' });
  assert.strictEqual(r.json.email.status, 'failed');
  assert.match(r.json.email.error, /refused the username/);
  assert.ok(r.json.temporaryPassword);
  r = await admin.call('POST', '/api/users', { name: 'C', username: 'ccc', role: 'manager' });
  assert.strictEqual(r.json.email.status, 'no-address');
  // The mail password never reaches a page or the activity record, and no page can change the settings.
  assert.notStrictEqual((await admin.call('GET', '/api/settings/email')).status, 200);
  assert.notStrictEqual((await admin.call('POST', '/api/settings/email', { host: 'evil.example', port: 25, security: 'ssl', from: 'a@b.co' })).status, 200);
  assert.ok(!fs.readFileSync(path.join(dir, 'activity.jsonl'), 'utf8').includes('hunter2'));
});

test('resetting a password emails the new temporary one', async () => {
  const { admin, mailer, dir } = await setUp();
  saveMail(dir);
  const { user } = (await admin.call('POST', '/api/users', { name: 'Ram', username: 'ram', email: 'ram@x.org', role: 'staff', departments: ['mock'] })).json;
  const r = await admin.call('POST', `/api/users/${user.id}`, { action: 'reset-password' });
  assert.strictEqual(r.json.email.status, 'sent');
  assert.match(mailer.sent[1].subject, /password was reset/);
});

// ---- the mail client, against a small SMTP server on this machine ----

function smtpServer(handler) {
  const received = { commands: [], data: '' };
  const server = net.createServer((socket) => {
    let inData = false;
    let buf = '';
    socket.write('220 test ESMTP\r\n');
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; socket.write('250 queued\r\n'); } else received.data += line + '\n';
          continue;
        }
        received.commands.push(line.startsWith('AUTH PLAIN') ? 'AUTH PLAIN <hidden>' : line);
        if (/^EHLO/.test(line)) socket.write('250-test\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH PLAIN/.test(line)) socket.write(handler.authOk(line) ? '235 ok\r\n' : '535 bad credentials\r\n');
        else if (/^DATA/.test(line)) { inData = true; socket.write('354 go\r\n'); } else if (/^QUIT/.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received })));
}

test('the mail client logs in, sends a UTF-8 message and dot-stuffs it', async () => {
  const want = Buffer.from('\0mailer\0pw').toString('base64');
  const { server, port, received } = await smtpServer({ authOk: (l) => l === `AUTH PLAIN ${want}` });
  try {
    const mail = setupEmail({ name: 'Sita र', username: 'sita', temporaryPassword: 'abc', access: 'Manager', siteUrl: 'https://x.org' });
    await sendMail({ host: '127.0.0.1', port, security: 'none', user: 'mailer', pass: 'pw', from: 'system@niecedu.com.np', fromName: 'UK Student NIEC' }, { to: 'sita@x.org', ...mail });
    assert.deepStrictEqual(received.commands.slice(0, 5), ['EHLO niecedu.com.np', 'AUTH PLAIN <hidden>', 'MAIL FROM:<system@niecedu.com.np>', 'RCPT TO:<sita@x.org>', 'DATA']);
    assert.match(received.data, /Subject: Set up your UK Student NIEC account/);
    assert.match(received.data, /multipart\/alternative/);
    const body = buildMessage({ from: 'a@b.co', to: 'c@d.co', subject: 'Hi', text: 'x\n.\nline starting with a dot', html: '<p>x</p>' });
    assert.ok(!/\r\n\.\r\n/.test(body), 'the text part is base64, so a lone dot can never end the message');
  } finally { server.close(); }
});

test('the mail client explains a wrong password and an unreachable server', async () => {
  const { server, port } = await smtpServer({ authOk: () => false });
  try {
    await assert.rejects(sendMail({ host: '127.0.0.1', port, security: 'none', user: 'mailer', pass: 'wrong', from: 'a@b.co' }, { to: 'c@d.co', subject: 's', text: 't', html: 'h' }), /refused the username or password/);
  } finally { server.close(); }
  await assert.rejects(sendMail({ host: '127.0.0.1', port: 1, security: 'none', from: 'a@b.co' }, { to: 'c@d.co', subject: 's', text: 't', html: 'h' }), /refused the connection/);
  await assert.rejects(sendMail({ host: '127.0.0.1', port: 25, security: 'none', from: 'a@b.co' }, { to: 'not an address', subject: 's', text: 't', html: 'h' }), /valid email/);
});

// ---- what each account sees ----

const S = 'APPLICATION STATUS';
const book = () => ({ sheets: [
  { id: 'a', name: 'Jan', columns: [], rows: [
    { _id: '1', [S]: 'Application Stage' }, { _id: '2', [S]: 'Mock Stage' }, { _id: '3', [S]: 'Inquiry' }, { _id: '4', [S]: 'Visa Issued' },
  ] },
  { id: 'h', name: 'Hidden', hidden: true, columns: [], rows: [{ _id: '5', [S]: 'Application Stage' }] },
] });
const ids = (wb) => wb.sheets.flatMap((s) => s.rows.map((r) => r._id));

test('someone in two teams sees both teams students and may use both teams moves', () => {
  const both = { role: 'staff', departments: ['application', 'mock'] };
  assert.deepStrictEqual(ids(Teams.viewFor(both, book())), ['1', '2']);
  assert.deepStrictEqual(ids(Teams.viewFor({ role: 'staff', departments: ['application', 'followup'] }, book())), ['1', '3']);
  assert.deepStrictEqual(Teams.statusChoices(both, 'Application Stage', []), ['Application Stage', 'Mock Stage']);
  assert.deepStrictEqual(Teams.statusChoices(both, 'Mock Stage', []), ['Mock Stage', 'Payment Stage']);
  assert.ok(Teams.canEdit(both, 'STUDENT ID') && Teams.canEdit(both, 'MOCK SCHEDULE 1') && !Teams.canEdit(both, 'GROSS FEE'));
  assert.strictEqual(Teams.viewKey({ role: 'staff', departments: ['mock', 'application'] }), Teams.viewKey(both));
});

test('the Manager sees every student on every sheet, hidden or earlier, and can change nothing', () => {
  const manager = { role: 'manager', departments: [] };
  assert.deepStrictEqual(ids(Teams.viewFor(manager, book())), ['1', '2', '3', '4', '5']);
  assert.ok(Teams.viewFor(manager, book()).sheets.every((s) => !s.hidden), 'no sheet is hidden from the Manager');
  assert.ok(!Teams.canEdit(manager, 'REMARKS'));
  assert.deepStrictEqual(Teams.statusChoices(manager, 'Mock Stage', []), ['Mock Stage']);
  assert.ok(!Teams.checkMove(manager, { [S]: 'Mock Stage' }, 'Payment Stage').ok);
  const view = Teams.viewFor(manager, book());
  const edited = JSON.parse(JSON.stringify(view));
  edited.sheets[0].rows[0].REMARKS = 'x';
  assert.match(Teams.teamChanges(manager, view, edited).errors[0], /only view/);
});

test('a person in several teams says which team a new student is for', () => {
  const both = { role: 'staff', departments: ['application', 'followup'] };
  const base = Teams.viewFor(both, book());
  const mine = JSON.parse(JSON.stringify(base));
  mine.sheets[0].rows.push({ _id: 'n1', [S]: 'Inquiry', _addedByTeam: 'followup', 'FIRST NAME': 'Nabin' });
  mine.sheets[0].rows.push({ _id: 'n2', [S]: 'Application Stage' });
  const out = Teams.teamChanges(both, base, mine);
  assert.deepStrictEqual(out.errors, ['Choose which team the new student is for.']); // n2 named no team
  assert.deepStrictEqual(out.adds.map((a) => [a.row._id, a.row[S], a.row._addedByTeam]), [['n1', 'Inquiry', 'followup']]);
  assert.deepStrictEqual(Teams.addableDepartments(both), ['application', 'followup']);
  assert.strictEqual(Teams.newStudentStatus(both, 'application'), 'Application Stage');
});

// ---- dashboard numbers ----

test('the dashboard counts students, milestones, months and groups', () => {
  const row = (o) => ({ 'FIRST NAME': 'S', ...o });
  const wb = { sheets: [
    { id: 'a', name: 'Jan', rows: [
      row({ [S]: 'Visa Issued', 'STUDENT SOURCE': 'Agents', 'UNIVERSITY PARTNER': 'Navitas', 'APPLICATION SUBMISSION DATE': '2026-08-02', 'PAYMENT DATE': '9/5/2026', 'VISA RECEIVED DATE': '2026-10-01', 'TUITION FEE DEPOSIT(1st Installment)': '1,500', 'MOCK SCHEDULE 1': '2026-08-20', 'PRE CAS INTERVIEW': 'Passed' }),
      row({ [S]: 'Mock Stage', 'STUDENT SOURCE': 'Visitor', 'UNIVERSITY PARTNER': 'Navitas', 'APPLICATION SUBMISSION DATE': '2026-09-02' }),
      row({ [S]: 'Defer', 'LAST NAME': '' }),
      { _id: 'blank' }, // no name: not a student
    ] },
    { id: 'h', name: 'Hidden', hidden: true, rows: [row({ [S]: 'Inquiry' })] },
  ] };
  const today = new Date('2026-10-28T00:00:00');
  const d = buildDashboard(wb, { today });
  assert.strictEqual(d.kpis.students, 3);
  assert.strictEqual(d.kpis.applicationsSubmitted, 2);
  assert.strictEqual(d.kpis.paymentsMade, 1);
  assert.deepStrictEqual([d.paidInFull, d.partlyPaid], [0, 0]); // no Gross Fee entered, so nothing to compare the deposit with
  assert.strictEqual(d.kpis.visaIssued, 1);
  assert.strictEqual(d.kpis.conversionRate, 33.3);
  assert.deepStrictEqual(d.attention.map((a) => [a.key, a.count]), [['mockUnscheduled', 1]]);
  assert.deepStrictEqual(d.stages.find((s) => s.label === 'Mock Stage'), { label: 'Mock Stage', count: 1 });
  assert.strictEqual(d.left.find((s) => s.label === 'Defer').count, 1);
  assert.deepStrictEqual(d.monthly.months.slice(-3), ['2026-08', '2026-09', '2026-10']);
  assert.deepStrictEqual(d.monthly.series[0].values.slice(-3), [1, 1, 0]); // applications
  assert.deepStrictEqual(d.monthly.series[1].values.slice(-3), [0, 1, 0]); // payments, entered as 9/5/2026 (month first)
  assert.strictEqual(d.partners[0].label, 'Navitas');
  assert.strictEqual(d.partners[0].visas, 1);
  assert.deepStrictEqual(d.intakes.map((i) => i.id), ['a']); // hidden sheets are left out unless asked for
  assert.strictEqual(buildDashboard(wb, { today, includeHidden: true, sheetId: 'h' }).kpis.students, 1);
  assert.strictEqual(buildDashboard(wb, { today, sheetId: 'zzz' }).selected, 'a'); // no such intake: the newest one
});

test('the dashboard never shows a visa without the steps before it, and says how many were filled in this way', () => {
  const row = (extra) => ({ _id: Math.random().toString(36), 'FIRST NAME': 'A', 'LAST NAME': 'B', ...extra });
  const wb = { sheets: [
    { id: 'sep', name: 'Sep Intake 2026', hidden: true, rows: [
      // built before the columns were tracked: only the status was entered
      ...Array.from({ length: 5 }, () => row({ [S]: 'Visa Issued' })),
      row({ [S]: 'Visa Rejected' }), row({ [S]: 'Payment Stage' }), row({ [S]: 'Withdrawn' }),
    ] },
    { id: 'jan', name: 'Jan Intake 2027', rows: [row({ [S]: 'Application Stage', 'APPLICATION SUBMISSION DATE': '2026-10-01' }), row({ [S]: 'Inquiry' })] },
  ] };
  const d = buildDashboard(wb, { includeHidden: true, sheetId: 'sep', today: new Date('2026-10-28T00:00:00') });
  const by = Object.fromEntries(d.milestones.map((m) => [m.key, m.count]));
  assert.deepStrictEqual([by.students, by.applied, by.offer, by.mock, by.paid, by.cas, by.lodged, by.visa], [8, 7, 7, 7, 7, 6, 6, 5]);
  d.milestones.forEach((m, i) => { if (i) assert.ok(m.count <= d.milestones[i - 1].count, `${m.label} is no more than the step before`); });
  assert.strictEqual(d.quality.filledFromStage, 7);
  assert.strictEqual(d.kpis.visaSuccessRate, 83.3); // 5 issued, 1 rejected
  assert.deepStrictEqual(d.intakes.map((i) => i.name), ['Sep Intake 2026', 'Jan Intake 2027']);
  assert.strictEqual(buildDashboard(wb, { includeHidden: true }).selected, 'jan'); // starts on the newest intake
  assert.strictEqual(d.forecast, undefined);
  assert.strictEqual(buildDashboard(wb, { includeHidden: true }).kpis.students, 2);
});

// ---- the activity record ----

test('the activity record filters by person, type, dates and words, and counts today', () => {
  const dir = tmpDir();
  const log = createActivityLog(dir);
  const req = { headers: { 'user-agent': 'Chrome/120 Windows' }, socket: { remoteAddress: '203.0.113.5' } };
  const sita = { id: 's', label: 'Sita (Mock Team)' };
  const ram = { id: 'r', label: 'Ram (Follow-up Team)' };
  log.record(req, sita, 'Logged in');
  log.record(req, sita, 'Changed', { app: 'Student Details', changes: ['Jan Intake > Asha Rai > Remarks: "a" to "b"'] });
  log.record(req, ram, 'Failed login', { note: 'right password, wrong authenticator code' });
  log.record(req, null, 'Failed login', { note: 'wrong username or password' });
  const all = log.query({});
  assert.strictEqual(all.total, 4);
  assert.strictEqual(all.events[0].action, 'Failed login'); // newest first
  assert.strictEqual(log.query({ account: 'Sita (Mock Team)' }).total, 2);
  assert.strictEqual(log.query({ category: 'security' }).total, 2);
  assert.strictEqual(log.query({ category: 'changes' }).total, 1);
  assert.strictEqual(log.query({ q: 'asha rai' }).total, 1);
  assert.strictEqual(log.query({ from: new Date(Date.now() + 3600e3).toISOString() }).total, 0);
  assert.strictEqual(log.query({ limit: 2, offset: 3 }).events.length, 1);
  assert.deepStrictEqual(all.summary.today, { logins: 1, failedLogins: 2, changes: 1, people: 2 });
  assert.deepStrictEqual(all.people, ['Ram (Follow-up Team)', 'Sita (Mock Team)']);
});

// ---- removing a person, the older CEO role, clearing the activity ----

test('removing a person deletes their login: they are logged out and cannot log in again', async () => {
  const { admin, accounts, clock } = await setUp();
  const made = await admin.call('POST', '/api/users', { name: 'Leaver', username: 'leaver', role: 'staff', departments: ['mock'] });
  const temp = made.json.temporaryPassword;
  const her = browser(accounts);
  await her.call('POST', '/api/login', { username: 'leaver', password: temp });
  await her.call('POST', '/api/login/new-password', { password: 'my own long password' });
  const { secret } = (await her.call('POST', '/api/login/authenticator', {})).json;
  await her.call('POST', '/api/login/authenticator', { code: codeFor(secret, clock.t) });
  assert.strictEqual((await her.call('GET', '/api/me')).status, 200);

  const id = made.json.user.id;
  assert.strictEqual((await admin.call('POST', `/api/users/${id}`, { action: 'remove' })).status, 200);
  assert.notStrictEqual((await her.call('GET', '/api/me')).status, 200, 'her open session is ended');
  const again = await browser(accounts).call('POST', '/api/login', { username: 'leaver', password: 'my own long password' });
  assert.strictEqual(again.status, 401);
  assert.ok(!(await admin.call('GET', '/api/users')).json.some((u) => u.username === 'leaver'));
  // The Admin account and one's own account cannot be removed.
  const people = (await admin.call('GET', '/api/users')).json;
  const owner = people.find((u) => u.role === 'admin');
  assert.strictEqual((await admin.call('POST', `/api/users/${owner.id}`, { action: 'remove' })).status, 400);
});

test('an account saved with the older CEO role is a Manager now', async () => {
  const { admin, dir, accounts } = await setUp();
  const made = await admin.call('POST', '/api/users', { name: 'Old', username: 'oldceo', role: 'manager' });
  const file = path.join(dir, 'users.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.users.find((u) => u.username === 'oldceo').role = 'ceo';
  fs.writeFileSync(file, JSON.stringify(saved));
  const fresh = createAccounts({ dir, activity: createActivityLog(dir) });
  const b = browser(fresh);
  await b.call('POST', '/api/login', { username: 'kayas', password: 'a long admin password' }); // reads the file anew
  assert.strictEqual(made.json.user.roleLabel, 'Manager');
  assert.strictEqual(Teams.teamOf({ role: 'ceo' }).role, 'manager');
});

test('clearing the activity empties the record, and failed logins by unknown names are not a person to filter by', () => {
  const dir = tmpDir();
  const log = createActivityLog(dir);
  const req = { headers: { 'user-agent': 'Chrome/120 Windows' }, socket: { remoteAddress: '203.0.113.9' } };
  log.record(req, null, 'Failed login', { note: 'wrong username or password' });
  log.record(req, { id: 'a', label: 'Ram (Mock Team)' }, 'Logged in');
  const before = log.query({});
  assert.strictEqual(before.total, 2);
  assert.deepStrictEqual(before.people, ['Ram (Mock Team)']);
  log.clear();
  assert.strictEqual(log.query({}).total, 0);
  log.record(req, { id: 'a', label: 'Ram (Mock Team)' }, 'Logged in');
  assert.strictEqual(log.query({}).total, 1);
});

test('teams only see the newest intake, and an older one drops away when a newer sheet is made', () => {
  const rows = (id) => [{ _id: id, [S]: 'Application Stage' }];
  const book2 = () => ({ sheets: [
    { id: 'sheet-1', name: 'Sep Intake 2026', hidden: true, columns: [], rows: rows('old') },
    { id: 'sheet-mjzzzzzzaaaaa', name: 'Jan Intake 2027', columns: [], rows: rows('jan') },
  ] });
  const staff = { role: 'staff', departments: ['application'] };
  assert.deepStrictEqual(ids(Teams.viewFor(staff, book2())), ['jan']);
  const later = book2();
  later.sheets.push({ id: 'sheet-mk000000bbbbb', name: 'May Intake 2027', columns: [], rows: rows('may') });
  assert.deepStrictEqual(ids(Teams.viewFor(staff, later)), ['may']);
  assert.deepStrictEqual(ids(Teams.viewFor({ role: 'manager' }, later)), ['old', 'jan', 'may']);
  assert.deepStrictEqual(ids(Teams.viewFor({ role: 'admin' }, later)), ['old', 'jan', 'may']);
});

test('the 3rd installment is taken off the remaining tuition fee, and old sheets get the column', () => {
  const { remainingTuitionFee } = require('../student-details/calc');
  const row = { 'FEE AFTER SCHOLARSHIP': '10000', 'TUITION FEE DEPOSIT(1st Installment)': '3000', 'TUITION FEE DEPOSIT(2nd Installment)': '2000', 'TUITION FEE DEPOSIT(3rd Installment)': '1500' };
  assert.strictEqual(remainingTuitionFee(row), 3500);
  const { migrateWorkbook } = require('../student-details/workbook');
  const wb = migrateWorkbook({ revision: 1, activeSheetId: 's', sheets: [{ id: 's', name: 'Old', columns: ['FIRST NAME', 'TUITION FEE DEPOSIT(2nd Installment)', 'REMAINING TUITION FEE'], rows: [] }] });
  assert.deepStrictEqual(wb.sheets[0].columns.slice(-3), ['TUITION FEE DEPOSIT(2nd Installment)', 'TUITION FEE DEPOSIT(3rd Installment)', 'REMAINING TUITION FEE']);
});

// ---- Manager together with teams ----

test('a Manager can also be ticked for teams, and then changes only those teams students in the current intake', async () => {
  const { admin } = await setUp();
  const r = await admin.call('POST', '/api/users', { name: 'Boss', username: 'boss', manager: true, departments: ['application'] });
  assert.strictEqual(r.status, 200, r.body);
  assert.strictEqual(r.json.user.role, 'manager');
  assert.deepStrictEqual(r.json.user.departments, ['application']);
  assert.strictEqual(r.json.user.accessLabel, 'Manager + Application Team');
  assert.strictEqual((await admin.call('POST', '/api/users', { name: 'X', username: 'xxx', manager: false, departments: [] })).status, 400);
  assert.strictEqual((await admin.call('POST', '/api/users', { name: 'Y', username: 'yyy', manager: true, role: 'admin' })).status, 400);

  const both = { role: 'manager', departments: ['application'] };
  const wb = () => ({ sheets: [
    { id: 'sheet-1', name: 'Old', columns: [], rows: [{ _id: 'o', [S]: 'Application Stage', REMARKS: '' }] },
    { id: 'sheet-mjzzzzzzaaaaa', name: 'New', columns: [], rows: [
      { _id: 'a', [S]: 'Application Stage', REMARKS: '' }, { _id: 'm', [S]: 'Mock Stage', REMARKS: '' },
    ] },
  ] });
  assert.deepStrictEqual(ids(Teams.viewFor(both, wb())), ['o', 'a', 'm']); // sees every student and intake
  assert.ok(!Teams.isReadOnly(both) && Teams.isManager(both));
  const base = Teams.viewFor(both, wb());
  const edit = (sheet, id, col, value) => { const m = JSON.parse(JSON.stringify(base)); m.sheets[sheet].rows.find((x) => x._id === id)[col] = value; return Teams.teamChanges(both, base, m); };
  assert.deepStrictEqual(edit(1, 'a', 'REMARKS', 'ok').errors, []);                      // their team's student, current intake
  assert.ok(edit(1, 'm', 'REMARKS', 'no').errors.length);                                 // a Mock Stage student: view only
  assert.match(edit(0, 'o', 'REMARKS', 'no').errors.join(' '), /current intake/);       // an earlier intake: view only
  assert.ok(Teams.isReadOnly({ role: 'manager', departments: [] }));
});

test('the dashboard says how many paying students have paid in full and how many part', () => {
  const row = (extra) => ({ _id: Math.random().toString(36), 'FIRST NAME': 'A', 'LAST NAME': 'B', 'APPLICATION STATUS': 'CAS Stage', 'GROSS FEE': '10000', ...extra });
  const wb = { sheets: [{ id: 'a', name: 'Jan', rows: [
    row({ 'TUITION FEE DEPOSIT(1st Installment)': '6000', 'TUITION FEE DEPOSIT(2nd Installment)': '4000' }), // whole fee
    row({ 'TUITION FEE DEPOSIT(1st Installment)': '3000' }),                                               // part
    row({ 'TUITION FEE DEPOSIT(1st Installment)': '2000', 'TUITION FEE DEPOSIT(2nd Installment)': '3000', 'TUITION FEE DEPOSIT(3rd Installment)': '5000' }), // three installments
  ] }] };
  const d = buildDashboard(wb, { today: new Date('2026-10-28T00:00:00') });
  assert.deepStrictEqual([d.paidInFull, d.partlyPaid], [2, 1]);
  assert.ok(!JSON.stringify(d).includes('depositsGbp'), 'no deposit totals on the dashboard');
});

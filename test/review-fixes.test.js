// Fixes from the second independent review, each kept from coming back: Incentive saves (ranges, real dates, a fixed rate that
// stays fixed, duplicate sheet names), team rules (a Manager's Student Source, a branch's stages, a cap on added students),
// backups that never overwrite each other, a login record that never holds a typed password, private data files.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Teams = require('../shared/teams');
const { syncFromWorkbook, uniqueNames } = require('../counselor-incentive/incentive-data');
const calc = require('../counselor-incentive/calc');

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const S = 'APPLICATION STATUS';

test('two sheets with the same name become two intakes, not one', () => {
  const wb = { sheets: [
    { id: 'a', name: 'Jan', rows: [{ _id: '1', 'FIRST NAME': 'A', [S]: 'Visa Issued' }] },
    { id: 'b', name: 'Jan', rows: [{ _id: '2', 'FIRST NAME': 'B', [S]: 'Visa Issued' }] },
    { id: 'c', name: 'Jan', rows: [] },
  ] };
  assert.deepStrictEqual(uniqueNames(wb.sheets), ['Jan', 'Jan (2)', 'Jan (3)']);
  const sync = syncFromWorkbook(wb);
  assert.deepStrictEqual(sync.intakes, ['Jan', 'Jan (2)', 'Jan (3)']);
  assert.strictEqual(sync.byIntake.Jan.length, 1);
  assert.strictEqual(sync.byIntake['Jan (2)'].length, 1, 'the second sheet keeps its own students');
});

test('incentive numbers: a comma only separates thousands (also in lakhs), never a decimal point; no 1e3 or 0x10', () => {
  const p = (t) => calc.parseIncentiveInput(t, 0);
  assert.strictEqual(p('1,500').value, 1500);
  assert.strictEqual(p('12,50,000').value, 1250000, 'Nepali lakh grouping');
  assert.strictEqual(p('1,5'), null);
  assert.strictEqual(p('15,5%'), null);
  assert.strictEqual(p('1.500,50'), null);
  assert.strictEqual(p('1e3'), null);
  assert.strictEqual(p('0x10'), null);
  assert.strictEqual(calc.num('12,50,000'), 1250000);
  assert.ok(calc.isBranchSource('Chitwan Branch') && calc.isBranchSource('BRANCH'));
  assert.ok(!calc.isBranchSource('Head Branch Office') && !calc.isBranchSource('Branch Referral'));
});

test('a Manager in a team cannot set Student Source outside their stages, and a branch can only move students to real stages', () => {
  const mgr = { role: 'manager', departments: ['application'] };
  const blank = { _id: 'x', [S]: 'Payment Stage', 'STUDENT SOURCE': '', _addedByTeam: 'application' };
  assert.ok(!Teams.canEdit(mgr, 'STUDENT SOURCE', blank), 'Payment Stage is not their stage');
  assert.ok(Teams.canEdit(mgr, 'STUDENT SOURCE', { ...blank, [S]: 'Application Stage' }), 'their own stage still works');
  const branch = { role: 'staff', departments: ['chitwan'] };
  const mine = { _id: 'y', [S]: 'Inquiry', 'STUDENT SOURCE': 'Chitwan Branch' };
  assert.ok(Teams.checkMove(branch, mine, 'Mock Stage').ok);
  assert.ok(!Teams.checkMove(branch, mine, 'Anything').ok);
  assert.ok(!Teams.checkMove(branch, mine, '').ok);
});

async function startServer(t, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-fixes-'));
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'), env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir, INCENTIVE_PASSWORD: 'Test Gate Pass 1', ...extraEnv }, stdio: 'ignore',
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
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
      return { status: res.status, json, text };
    };
  };
  const admin = client();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  assert.strictEqual((await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' })).status, 200);
  assert.strictEqual((await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' })).status, 200);
  return { dir, base, admin, client };
}

test('Incentive saves: nonsense amounts and impossible dates are refused, a fixed rate stays fixed', { timeout: 120000 }, async (t) => {
  const { admin } = await startServer(t);
  assert.strictEqual((await admin('POST', '/incentive/api/unlock', { password: 'Test Gate Pass 1' })).status, 200);
  const put = (intake, body) => admin('PUT', '/incentive/api/advances/' + encodeURIComponent(intake), body);
  assert.strictEqual((await put('Jan', { basicSalary: 1e15 })).status, 400, 'a salary of 1e15 is refused, not saved as 0');
  assert.strictEqual((await put('Jan', { salaryMonths: -3 })).status, 400);
  assert.strictEqual((await put('Jan', { salaryMonths: 99 })).status, 400);
  assert.strictEqual((await put('Jan', { previousAdvance: -5 })).status, 400);
  assert.strictEqual((await put('Jan', { basicSalary: 70000, salaryMonths: 4 })).status, 200);
  assert.strictEqual((await put('Jan', { payments: [{ date: '2026-02-31', amount: 100 }] })).status, 400, '31 February is not a day');
  const first = await put('Jan', { payments: [{ date: '2026-10-12', amount: 1000, id: 'p1' }], lockedRate: { rate: 150, source: 'manual' } });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.json.lockedRate.rate, 150);
  const stale = await put('Jan', { payments: [{ date: '2026-10-12', amount: 1000, id: 'p1' }, { date: '2026-10-13', amount: 500, id: 'p2' }], lockedRate: { rate: 999, source: 'manual' } });
  assert.strictEqual(stale.json.lockedRate.rate, 150, 'an older page cannot change a rate that a payment already fixed');
});

test('team saves: at most 50 students are added at once, and a stage is stored without stray spaces', { timeout: 120000 }, async (t) => {
  const { admin, client } = await startServer(t);
  const wb = (await admin('GET', '/api/data')).json;
  const sheet = wb.sheets[0];
  const blank = Object.fromEntries(sheet.columns.map((c) => [c, '']));
  sheet.rows = [{ ...blank, _id: 'm1', 'FIRST NAME': 'Mo', [S]: 'Mock Stage', 'MOCK SCHEDULE 1': 'x', 'FEEDBACK 1': 'x', 'MOCK SCHEDULE 2': 'x', 'FEEDBACK 2': 'x', 'MOCK SCHEDULE 3': 'x', 'FEEDBACK 3': 'x', 'MOCK SCHEDULE 4': 'x', 'FEEDBACK 4': 'x', 'PRE CAS INTERVIEW': 'Passed' }];
  assert.strictEqual((await admin('POST', '/api/data', { sheets: wb.sheets, activeSheetId: wb.activeSheetId, baseRevision: wb.revision })).status, 200);
  const made = (await admin('POST', '/api/users', { username: 'appstaff', name: 'App', role: 'staff', departments: ['application', 'mock'] })).json;
  const staff = client();
  assert.strictEqual((await staff('POST', '/api/login', { username: 'appstaff', password: made.temporaryPassword })).status, 200);
  assert.strictEqual((await staff('POST', '/api/login/new-password', { password: 'Team-Strong-2026!' })).status, 200);
  const view = (await staff('GET', '/api/data')).json;
  const many = JSON.parse(JSON.stringify(view));
  for (let i = 0; i < 60; i += 1) many.sheets[0].rows.push({ _id: 'n' + i, 'FIRST NAME': 'S' + i, [S]: 'Application Stage' });
  assert.strictEqual((await staff('POST', '/api/data', { sheets: many.sheets, activeSheetId: many.activeSheetId, baseRevision: view.revision })).status, 403, '60 new students in one save');
  const moved = JSON.parse(JSON.stringify(view));
  moved.sheets[0].rows.find((r) => r._id === 'm1')[S] = 'Payment Stage ';
  const ok = await staff('POST', '/api/data', { sheets: moved.sheets, activeSheetId: moved.activeSheetId, baseRevision: view.revision });
  assert.strictEqual(ok.status, 200, ok.text);
  assert.strictEqual((await admin('GET', '/api/data')).json.sheets[0].rows.find((r) => r._id === 'm1')[S], 'Payment Stage', 'stored without the trailing space');
});

test('backups made within the same minute never overwrite each other', { timeout: 60000 }, async (t) => {
  const { admin, dir } = await startServer(t);
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await admin('POST', '/api/restore/backup-now', {});
    assert.strictEqual(r.status, 200, r.text);
    ids.push(r.json.id || JSON.stringify(r.json));
  }
  assert.strictEqual(new Set(ids).size, 3, 'three different names: ' + ids.join(', '));
  const files = fs.readdirSync(path.join(dir, 'daily-backups')).filter((f) => /^niec-manual-/.test(f));
  assert.strictEqual(files.length, 3);
});

test('a password typed into the username box is not written to the login record, and data files are private', { timeout: 60000 }, async (t) => {
  const { admin, client, dir } = await startServer(t);
  const stranger = client();
  await stranger('POST', '/api/login', { username: 'myrealpassword2026', password: 'x' });
  await stranger('POST', '/api/login', { username: 'owner', password: 'wrong password here' });
  const log = fs.readFileSync(path.join(dir, 'activity.jsonl'), 'utf8');
  assert.ok(!log.includes('myrealpassword2026'), 'the typed name of an unknown account is not recorded');
  assert.match(log, /wrong username or password/);
  assert.match(log, /wrong password/);
  const modeOf = (f) => (fs.statSync(path.join(dir, f)).mode & 0o777).toString(8);
  assert.strictEqual(modeOf('data.json'), '600');
  assert.strictEqual(modeOf('activity.jsonl'), '600');
  assert.strictEqual((fs.statSync(dir).mode & 0o777).toString(8), '700');
  await admin('GET', '/api/me');
});

test('the Advisor notebook also refuses Devanagari digits, full-width emails, 8-digit passport numbers and non-text titles', () => {
  const { createAdvisorMcp } = require('../student-details/advisor-mcp');
  const { createFacts } = require('../student-details/facts');
  const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-mem-'));
  const m = createAdvisorMcp({ token: 'x'.repeat(40), memoryDir, getWorkbook: () => ({ sheets: [] }), getDashboard: () => ({}), facts: createFacts(fs.mkdtempSync(path.join(os.tmpdir(), 'niec-f-'))), log: () => {} });
  const save = (args) => m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'save_memory', arguments: args } }).result;
  assert.ok(save({ section: 'Notes', text: 'call ९८४१२३४५६७' }).isError, 'Devanagari phone number');
  assert.ok(save({ section: 'Notes', text: 'mail ram＠gmail.com' }).isError, 'full-width @');
  assert.ok(save({ section: 'Notes', text: 'passport 12345678' }).isError, '8 digits');
  assert.ok(save({ section: { a: 1 }, text: 'x' }).isError, 'a section title that is not text');
  assert.ok(!save({ section: 'Targets', text: 'Intakes 2025 2026 2027 are the plan' }).isError, 'years are fine');
});

test('the Dashboard ignores impossible dates (2026-02-30, 30/10/2026) in the month charts', () => {
  const { buildDashboard } = require('../student-details/dashboard-stats');
  const row = (extra) => ({ _id: Math.random().toString(36), 'FIRST NAME': 'A', 'LAST NAME': 'B', [S]: 'Application Stage', ...extra });
  const wb = { sheets: [{ id: 'a', name: 'Jan', rows: [row({ 'APPLICATION SUBMISSION DATE': '2026-02-30' }), row({ 'APPLICATION SUBMISSION DATE': '30/10/2026' }), row({ 'APPLICATION SUBMISSION DATE': '2026-10-05' })] }] };
  const d = buildDashboard(wb, { today: new Date('2026-11-05T00:00:00Z') });
  const apps = d.monthly.series.find((x) => x.key === 'applications').values;
  const at = (month) => apps[d.monthly.months.indexOf(month)];
  assert.strictEqual(at('2026-10'), 1, 'only the real October date is counted (not 30/10/2026 read as month 30)');
  assert.strictEqual(at('2026-02'), 0, 'the 30th of February is not a day');
  assert.strictEqual(d.quality.applicationsWithoutDate, 2, 'both impossible dates count as "no valid date"');
});

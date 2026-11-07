// The Incentive tools of the Claude connector. They are part of the SAME connector as the Student Details tools (one
// address, one secret), read-only, and show the same students and money as the Incentive page.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createAdvisorMcp } = require('../student-details/advisor-mcp');
const { createFacts } = require('../student-details/facts');

const TOKEN = 'i'.repeat(40);
const row = (id, first, last, university, partner, fee, status = 'Visa Issued', source = '') => ({
  _id: id, 'STUDENT SOURCE': source, 'FIRST NAME': first, 'LAST NAME': last, 'COURSE NAME': 'MSc', 'UNIVERSITY NAME': university, 'UNIVERSITY PARTNER': partner,
  'GROSS FEE': String(fee), 'APPLICATION STATUS': status, 'STUDENT ID': 'S' + id, 'VISA RECEIVED DATE': '2026-09-23',
});
const WORKBOOK = {
  revision: 3,
  sheets: [
    { id: 'sheet-1', name: 'Sep Intake 2026', columns: ['FIRST NAME'], rows: [
      row('a', 'Sita', 'Sharma', 'Bangor University', 'Real Dreams', 10000, 'Visa Issued', 'Visitor'),
      row('b', 'Ram', 'Thapa', 'Bangor University', 'Adventus', 12000),
      row('c', 'Maya', 'Gurung', 'Ulster University', 'Real Dreams', 8000, 'Visa Issued', 'Pokhara Branch'),
      row('d', 'Not', 'Yet', 'Ulster University', 'Nobody', 9000, 'Inquiry'),
    ] },
    { id: 'sheet-2', name: 'Jan Intake 2027', columns: ['FIRST NAME'], rows: [row('e', 'Jan', 'Student', 'UWL', 'Real Dreams', 5000, 'Inquiry')] },
  ],
};
const COMMISSIONS = {
  a: { uniCommissionRate: 15, enrollmentCommission: 10000, flywireCommission: 500, loanCommission: 1000 },
  b: { uniCommissionRate: 10, enrollmentCommission: 5000 },
};
const ADVANCES = { 'sheet-1': { previousAdvance: 2000, basicSalary: 70000, salaryMonths: 4, payments: [{ id: 'p1', date: '2026-10-20', amount: 3000, note: 'first' }] } };
const { advancesByName } = require('../counselor-incentive/advances');
const make = (extra = {}) => createAdvisorMcp({
  token: TOKEN, memoryDir: fs.mkdtempSync(path.join(os.tmpdir(), 'niec-imem-')), log: () => {},
  getWorkbook: () => WORKBOOK, getDashboard: (i) => ({ intake: i }), facts: createFacts(fs.mkdtempSync(path.join(os.tmpdir(), 'niec-iadv-facts-'))),
  incentive: { getCommissions: () => COMMISSIONS, getAdvances: (sheets) => advancesByName(ADVANCES, sheets), getRate: () => ({ rate: 180, date: '2026-11-04', fetchedAt: '2026-11-04T10:30:00.000Z' }) },
  ...extra,
});
const call = (m, name, args) => JSON.parse(m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result.content[0].text);
const raw = (m, name, args) => m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result;

test('one connector offers the student tools and the incentive tools, and nothing can write but the notebook', () => {
  const tools = make().rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.map((t) => t.name);
  assert.deepStrictEqual([...tools].sort(), ['count_by', 'forget_memory', 'get_dashboard', 'get_fact_file', 'get_incentive_overview', 'get_incentives', 'get_overview',
    'get_payment_summary', 'get_students', 'read_memory', 'save_memory', 'summarize_incentives_by']);
  const without = make({ incentive: undefined }).rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.map((t) => t.name);
  assert.ok(!without.includes('get_incentives'), 'without the incentive data the incentive tools are not offered');
  assert.match(make().rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }).result.instructions, /Incentive/);
});

test('overview lists the intakes with their visa-issued students and the exchange rate', () => {
  const o = call(make(), 'get_incentive_overview', {});
  // Each intake says the rate its own figures use (here none is fixed or typed in, so the live rate).
  assert.deepStrictEqual(o.intakes, [{ name: 'Sep Intake 2026', visaIssuedStudents: 3, exchangeRateGbpToNpr: 180, rateSource: 'live rate' }, { name: 'Jan Intake 2027', visaIssuedStudents: 0, exchangeRateGbpToNpr: 180, rateSource: 'live rate' }]);
  assert.match(o.exchangeRateNote, /live rate/);
  assert.strictEqual(o.exchangeRate.gbpToNpr, 180);
});

test('get_incentives shows the University Partner (agent), the worked-out commission and the incentives entered', () => {
  const m = make();
  const all = call(m, 'get_incentives', {});
  assert.strictEqual(all.matched, 3, 'only the Visa Issued students');
  const sita = all.students.find((s) => s.student === 'Sita Sharma');
  assert.strictEqual(sita.universityPartner, 'Real Dreams');
  assert.strictEqual(sita.studentSource, 'Visitor', 'the Student Source column of the sheet');
  assert.strictEqual(sita.tuitionFeeGbp, 10000);
  assert.strictEqual(sita.uniCommissionAmountGbp, 1500, '15% of 10,000');
  assert.strictEqual(sita.totalIncentivesNpr, 10500, 'enrollment 10,000 + flywire 500; the loan is not part of the total');
  assert.strictEqual(sita._record, undefined, 'internal fields are not sent');
  assert.deepStrictEqual(call(m, 'get_incentives', { partner: 'real dreams' }).students.map((s) => s.student), ['Sita Sharma', 'Maya Gurung']);
  assert.deepStrictEqual(call(m, 'get_incentives', { university: 'ulster' }).students.map((s) => s.student), ['Maya Gurung']);
  assert.deepStrictEqual(call(m, 'get_incentives', { source: 'pokhara' }).students.map((x) => x.student), ['Maya Gurung']);
  assert.strictEqual(call(m, 'get_incentives', { intake: 'Jan Intake 2027' }).matched, 0);
  assert.strictEqual(call(m, 'get_incentives', { limit: 1, offset: 1 }).returned, 1);
  const unknown = raw(m, 'get_incentives', { intake: 'Nope' });
  assert.strictEqual(unknown.isError, true);
  assert.match(unknown.content[0].text, /No intake "Nope"\. Intakes: Sep Intake 2026, Jan Intake 2027/);
});

test('the payment summary and company earnings are worked out like the Incentive page does', () => {
  const { intakes } = call(make(), 'get_payment_summary', { intake: 'Sep Intake 2026' });
  const sep = intakes[0];
  // incentives: a = 10,000 + 500, b = 5,000 -> 15,500; loan 1,000 -> net 14,500; TDS 15% = 2,175; advance 2,000
  // a payment of 3,000 was received on 2026-10-20, so what is still to pay is 14,500 - 2,175 - 2,000 - 3,000
  assert.deepStrictEqual(sep.paymentSummaryNpr, { totalIncentives: 15500, loanIncentiveToShare: 1000, netIncentives: 14500, tds15Percent: 2175, previousAdvance: 2000, paymentsReceived: 3000, netPayable: 7325,
    working: { incentivesEnteredInRupeesNpr: 15500, incentivesInPoundsGbp: 0, exchangeRateGbpToNpr: 180, exchangeRateFetchedAt: '2026-11-04T10:30:00.000Z', rateFixedFromFirstPayment: false, rateSource: 'live rate', poundIncentivesConvertedNpr: 0 },
    paymentHistory: [{ date: '2026-10-20', amountNpr: 3000, note: 'first' }] });
  assert.strictEqual(call(make(), 'get_payment_summary', {}).exchangeRate.fetchedAt, '2026-11-04T10:30:00.000Z', 'the time the rate was fetched is given');
  // commission: 1,500 + 1,200 + 0 = 2,700 GBP, x 180 = 486,000 NPR; salary 70,000 x 4 = 280,000; counselor total 280,000 + 14,500
  assert.strictEqual(sep.companyEarnings.universityCommissionGbp, 2700);
  assert.strictEqual(sep.companyEarnings.universityCommissionNpr, 486000);
  assert.strictEqual(sep.companyEarnings.counselorSalaryForPeriodNpr, 280000);
  assert.strictEqual(sep.companyEarnings.counselorTotalNpr, 294500);
  assert.strictEqual(call(make(), 'get_payment_summary', {}).intakes.length, 2, 'every intake when none is named');
});

test('summarize_incentives_by groups by University Partner, University Name or Intake', () => {
  const m = make();
  const byPartner = call(m, 'summarize_incentives_by', { by: 'universityPartner' });
  assert.deepStrictEqual(byPartner.groups.map((g) => [g['University Partner'], g.students]), [['Real Dreams', 2], ['Adventus', 1]]);
  assert.strictEqual(byPartner.groups[0].tuitionFeesGbp, 18000);
  assert.strictEqual(byPartner.groups[0].incentivesEnteredNpr, 10500);
  assert.deepStrictEqual(call(m, 'summarize_incentives_by', { by: 'university' }).groups.map((g) => [g['University Name'], g.students]), [['Bangor University', 2], ['Ulster University', 1]]);
  assert.strictEqual(call(m, 'summarize_incentives_by', { by: 'intake' }).total, 3);
  assert.deepStrictEqual(call(m, 'summarize_incentives_by', { by: 'studentSource' }).groups.map((g) => [g['Student Source'], g.students]).sort(), [['(empty)', 1], ['Pokhara Branch', 1], ['Visitor', 1]]);
});

test('a student with no University Partner is grouped as (empty); missing incentive data is explained, never shown as zeros; unknown tools are refused', () => {
  const wb = { revision: 1, sheets: [{ id: 's', name: 'X', columns: [], rows: [row('z', 'No', 'Agent', 'UWL', '', 100)] }] };
  const m = make({ getWorkbook: () => wb });
  assert.strictEqual(call(m, 'summarize_incentives_by', { by: 'universityPartner' }).groups[0]['University Partner'], '(empty)');
  const missing = raw(make({ incentive: { getCommissions: () => null, getAdvances: () => ({}), getRate: () => null } }), 'get_incentives', {});
  assert.strictEqual(missing.isError, true);
  assert.match(missing.content[0].text, /COUNSELOR_DATA_DIR/);
  assert.strictEqual(make().rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_everything', arguments: {} } }).error.code, -32602);
  assert.strictEqual(raw(make({ getWorkbook: () => null }), 'get_incentives', {}).isError, true);
});

test('the incentive tools do not change the workbook or the incentive figures', () => {
  const before = JSON.stringify([WORKBOOK, COMMISSIONS, ADVANCES]);
  const m = make();
  ['get_incentive_overview', 'get_incentives', 'get_payment_summary'].forEach((n) => call(m, n, {}));
  call(m, 'summarize_incentives_by', { by: 'intake' });
  assert.strictEqual(JSON.stringify([WORKBOOK, COMMISSIONS, ADVANCES]), before);
});

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('on the real Student Details app the SAME address answers student and incentive questions, from the live files', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-iadv-'));
  const incentiveDir = path.join(dir, 'counselor-incentive');
  fs.mkdirSync(incentiveDir);
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ revision: 1, activeSheetId: 'sheet-1', sheets: [{ id: 'sheet-1', name: 'Sep Intake 2026', columns: [], rows: [
    row('row-1', 'Sita', 'Sharma', 'Bangor University', 'Real Dreams', 10000), row('row-2', 'Not', 'Yet', 'X', 'Nobody', 1, 'Inquiry'),
  ] }] }));
  fs.writeFileSync(path.join(incentiveDir, 'commissions.json'), JSON.stringify({ 'row-1': { uniCommissionRate: 20, enrollmentCommission: 7000 } }));
  const port = await freePort();
  // The Incentive data folder is found next to this app's data folder when COUNSELOR_DATA_DIR is not set (as on cPanel).
  const studentDir = path.join(dir, 'student-details');
  fs.mkdirSync(studentDir);
  fs.renameSync(path.join(dir, 'data.json'), path.join(studentDir, 'data.json'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'),
    env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: studentDir, NIEC_ADVISOR_TOKEN: TOKEN, COUNSELOR_DATA_DIR: '' }, stdio: 'ignore',
  });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { await wait(250); } }
  const ask = async (name, args) => {
    const res = await fetch(`${base}/advisor-mcp/${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    return (await res.json()).result;
  };
  const list = await (await fetch(`${base}/advisor-mcp/${TOKEN}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).json();
  const names = list.result.tools.map((x) => x.name);
  assert.ok(names.includes('get_students') && names.includes('get_incentives') && names.includes('get_payment_summary'), 'both sets in one connector');
  const students = JSON.parse((await ask('count_by', { group_by: ['APPLICATION STATUS'] })).content[0].text);
  assert.strictEqual(students.total, 2, 'the student tools still work');
  const inc = JSON.parse((await ask('get_incentives', {})).content[0].text);
  assert.strictEqual(inc.matched, 1, 'only the Visa Issued student');
  assert.strictEqual(inc.students[0].universityPartner, 'Real Dreams');
  assert.strictEqual(inc.students[0].uniCommissionAmountGbp, 2000, '20% of 10,000, from the Incentive data folder next to this app');
  assert.strictEqual(inc.students[0].enrollmentIncentiveNpr, 7000);
  // Changing the incentive file shows at once (live).
  fs.writeFileSync(path.join(incentiveDir, 'commissions.json'), JSON.stringify({ 'row-1': { uniCommissionRate: 20, enrollmentCommission: 9000 } }));
  assert.strictEqual(JSON.parse((await ask('get_incentives', {})).content[0].text).students[0].enrollmentIncentiveNpr, 9000);
  // Wrong secret and the normal pages are as before.
  assert.strictEqual((await fetch(`${base}/advisor-mcp/wrong`, { method: 'POST', body: '{}' })).status, 404);
  assert.notStrictEqual((await fetch(`${base}/api/data`, { redirect: 'manual' })).status, 200);
});

test('when the Incentive data folder cannot be found, the incentive tools say so and the student tools still work', { timeout: 60000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-iadv-none-'));
  const studentDir = path.join(dir, 'student-details');
  fs.mkdirSync(studentDir);
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'), env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: studentDir, NIEC_ADVISOR_TOKEN: TOKEN, COUNSELOR_DATA_DIR: '' }, stdio: 'ignore',
  });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { await wait(250); } }
  const ask = async (name) => (await (await fetch(`${base}/advisor-mcp/${TOKEN}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }) })).json()).result;
  const r = await ask('get_incentives');
  assert.strictEqual(r.isError, true);
  assert.match(r.content[0].text, /could not be found/);
  assert.strictEqual((await ask('get_overview')).isError, undefined);
});

test('the connector knows incentives entered in pounds or percent, and that a branch student earns the head office only 30%', () => {
  const commissions = {
    a: { uniCommissionRate: 15, enrollmentCommission: 100, enrollmentCommissionUnit: 1, enrollmentCommissionUni: 10, enrollmentCommissionUniUnit: 2, newPartnershipCommission: 2000 },
    b: { uniCommissionRate: 10 },
    c: { uniCommissionRate: 10 }, // Maya Gurung, Pokhara Branch, £8,000 of tuition: £800 of commission
  };
  const m = make({ incentive: { getCommissions: () => commissions, getAdvances: (sheets) => advancesByName({}, sheets), getRate: () => ({ rate: 180, date: '2026-11-04', fetchedAt: '2026-11-04T10:30:00.000Z' }) } });
  const rows = call(m, 'get_incentives', { intake: 'Sep Intake 2026' }).students;
  const sita = rows.find((r) => r.student === 'Sita Sharma');
  assert.strictEqual(sita.uniCommissionAmountGbp, 1500);
  assert.strictEqual(sita.enrollmentIncentiveEntered, '£100.00');
  assert.strictEqual(sita.enrollmentIncentiveNpr, 18000, '£100 at 180');
  assert.strictEqual(sita.enrollmentIncentiveFromUniversityEntered, '10%');
  assert.strictEqual(sita.enrollmentIncentiveFromUniversityNpr, 27000, '10% of £1,500 = £150, at 180');
  assert.strictEqual(sita.newPartnershipIncentiveEntered, 'Rs 2,000.00');
  assert.strictEqual(sita.totalIncentivesNpr, 18000 + 27000 + 2000);
  assert.strictEqual(rows.find((r) => r.student === 'Maya Gurung').isBranchStudent, true);
  assert.strictEqual(sita.isBranchStudent, false);

  const e = call(m, 'get_payment_summary', { intake: 'Sep Intake 2026' }).intakes[0].companyEarnings;
  assert.strictEqual(e.universityCommissionGbp, 1500 + 1200 + 800);
  assert.strictEqual(e.branchSharePercent, 70);
  assert.strictEqual(e.branchShareGbp, 560, '70% of the branch student\'s £800');
  assert.strictEqual(e.headOfficeCommissionGbp, 3500 - 560);
  assert.deepStrictEqual(e.branchDeductions, [{ student: 'Maya Gurung', branch: 'Pokhara Branch', universityCommissionGbp: 800, branchShareGbp: 560 }], 'the connector lists who the branch took from, and how much');
  assert.strictEqual(e.companyEarningsNpr, (3500 - 560) * 180, 'Company Earnings come from the head office part only');

  // Without an exchange rate, a pound or percent incentive is flagged and left out, never guessed.
  const noRate = make({ incentive: { getCommissions: () => commissions, getAdvances: (sheets) => advancesByName({}, sheets), getRate: () => null } });
  const flagged = call(noRate, 'get_incentives', { intake: 'Sep Intake 2026' }).students.find((r) => r.student === 'Sita Sharma');
  assert.strictEqual(flagged.needsExchangeRate, true);
  assert.strictEqual(flagged.enrollmentIncentiveNpr, null);
  assert.strictEqual(flagged.newPartnershipIncentiveNpr, 2000, 'rupees need no rate');
});

test('an intake with a payment keeps the exchange rate it had at the first payment', () => {
  const commissions = { a: { enrollmentCommission: 100, enrollmentCommissionUnit: 1 } }; // £100
  const advances = (lock) => ({ 'sheet-1': { payments: [{ id: 'p1', date: '2026-10-20', amount: 1000 }], ...(lock ? { lockedRate: { rate: 150, date: '2026-10-20', fetchedAt: '2026-10-20T09:00:00.000Z' } } : {}) } });
  const build = (lock) => make({ incentive: { getCommissions: () => commissions, getAdvances: (sheets) => advancesByName(advances(lock), sheets), getRate: () => ({ rate: 180, date: '2026-11-04' }) } });
  const fixed = call(build(true), 'get_payment_summary', { intake: 'Sep Intake 2026' }).intakes[0].paymentSummaryNpr;
  assert.strictEqual(fixed.totalIncentives, 15000, '£100 at the fixed Rs 150, not at the live Rs 180');
  assert.strictEqual(fixed.working.exchangeRateGbpToNpr, 150);
  assert.strictEqual(fixed.working.rateFixedFromFirstPayment, true);
  const live = call(build(false), 'get_payment_summary', { intake: 'Sep Intake 2026' }).intakes[0].paymentSummaryNpr;
  assert.strictEqual(live.totalIncentives, 18000, 'with no fixed rate the live Rs 180 is used');
  assert.strictEqual(live.working.rateFixedFromFirstPayment, false);
  // The student rows follow the same rule.
  const rows = call(build(true), 'get_incentives', { intake: 'Sep Intake 2026' });
  assert.ok(JSON.stringify(rows).includes('15000'), 'student rows use the fixed rate too');
});

test('an intake uses the OANDA rate the owner typed in, until a payment fixes a rate', () => {
  const commissions = { a: { enrollmentCommission: 100, enrollmentCommissionUnit: 1 } }; // £100
  const build = (advance) => make({ incentive: { getCommissions: () => commissions, getAdvances: (sheets) => advancesByName({ 'sheet-1': advance }, sheets), getRate: () => ({ rate: 180, date: '2026-11-04' }) } });
  const typed = call(build({ manualRate: { rate: 206.5 } }), 'get_payment_summary', { intake: 'Sep Intake 2026' }).intakes[0].paymentSummaryNpr;
  assert.strictEqual(typed.totalIncentives, 20650, '£100 at the typed Rs 206.5, not the live Rs 180');
  assert.strictEqual(typed.working.rateSource, 'typed in from OANDA');
  const fixed = call(build({ manualRate: { rate: 206.5 }, payments: [{ id: 'p', date: '2026-11-05', amount: 100 }], lockedRate: { rate: 206.5, source: 'manual' } }), 'get_payment_summary', { intake: 'Sep Intake 2026' }).intakes[0].paymentSummaryNpr;
  assert.strictEqual(fixed.working.rateSource, 'typed in from OANDA, fixed at the first payment');
  const live = call(build({}), 'get_payment_summary', { intake: 'Sep Intake 2026' }).intakes[0].paymentSummaryNpr;
  assert.strictEqual(live.working.rateSource, 'live rate');
});

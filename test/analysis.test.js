// The Analysis page: the figures (analysis-stats.js), the Marketing spend table (marketing-spend.js), the columns it reads
// (workbook.js, teams.js), the Advisor tools, and who may open the page and change the spend on the real server.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildAnalysis, BLANK } = require('../student-details/analysis-stats');
const { createSpend } = require('../student-details/marketing-spend');
const { createTargets } = require('../student-details/targets');
const { createDecisions } = require('../student-details/decisions');
const { migrateWorkbook, DEFAULT_COLUMNS, ANALYSIS_COLUMNS } = require('../student-details/workbook');
const { createAdvisorMcp } = require('../student-details/advisor-mcp');
const { createFacts } = require('../student-details/facts');
const Teams = require('../shared/teams');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-analysis-'));
const student = (n, more) => ({ _id: 'r' + n, 'FIRST NAME': 'Student' + n, ...more });

// Jan: 12 students. 6 from Social Media (4 TikTok, 2 with no detail), 4 from Events, 2 with no source.
function sample() {
  const jan = [];
  for (let i = 0; i < 4; i += 1) jan.push(student(i, { 'STUDENT SOURCE': 'Social Media', 'SOURCE DETAIL': 'TikTok', 'CAMPAIGN OR EVENT': 'Dashain Reel', 'APPLICATION STATUS': i < 2 ? 'Visa Issued' : 'Application Stage', 'UNIVERSITY NAME': 'UWL', 'INQUIRY DATE': '2026-03-01', 'APPLICATION SUBMISSION DATE': '2026-03-11' }));
  for (let i = 4; i < 6; i += 1) jan.push(student(i, { 'STUDENT SOURCE': 'Social Media', 'APPLICATION STATUS': 'Inquiry' }));
  for (let i = 6; i < 10; i += 1) jan.push(student(i, { 'STUDENT SOURCE': 'Events', 'SOURCE DETAIL': 'Education Fair', 'APPLICATION STATUS': i === 6 ? 'Visa Rejected' : i === 7 ? 'Withdrawn' : 'Payment Stage', 'LOST REASON': i === 6 ? 'Visa Refused: Financial' : '', 'UNIVERSITY NAME': i < 9 ? 'UWL' : 'Bangor', 'APPLICATION SUBMISSION DATE': '2026-04-02' }));
  for (let i = 10; i < 12; i += 1) jan.push(student(i, { 'APPLICATION STATUS': 'Application Stage', 'UNIVERSITY NAME': 'UWL' }));
  jan.push({ _id: 'empty' }); // a blank row is not a student
  const sep = [student(20, { 'STUDENT SOURCE': 'Reference', 'APPLICATION STATUS': 'Visa Issued', 'UNIVERSITY NAME': 'Hull' })];
  return { sheets: [{ id: 'jan', name: 'Jan Intake 2027', rows: jan }, { id: 'sep', name: 'Sep Intake 2026', rows: sep }] };
}

test('the analysis counts every channel with its details, and a blank cell is shown, not hidden', () => {
  const a = buildAnalysis(sample(), { sheetId: 'jan' });
  assert.strictEqual(a.selected, 'jan');
  assert.strictEqual(a.totals.students, 12);
  assert.strictEqual(a.totals.inquiries, 2);
  assert.strictEqual(a.totals.visas, 2);
  assert.strictEqual(a.totals.rejected, 1);
  assert.strictEqual(a.totals.lost, 2, 'the refused and the withdrawn student');
  assert.strictEqual(a.totals.visaSuccess, 66.7, 'two issued of three decided');
  const social = a.sources.find((s) => s.label === 'Social Media');
  assert.strictEqual(social.students, 6);
  assert.deepStrictEqual(social.details.map((d) => [d.label, d.students, d.visas]), [['TikTok', 4, 2], [BLANK, 2, 0]]);
  assert.strictEqual(a.sources[a.sources.length - 1].label, BLANK, 'students without a source are the last row');
  assert.strictEqual(a.sources[a.sources.length - 1].students, 2);
  assert.strictEqual(social.smallSample, true, 'six students is not yet a pattern');
  assert.deepStrictEqual(a.campaigns.map((c) => [c.label, c.students]), [['Dashain Reel', 4]]);
});

test('all intakes together is the default, every intake is compared, and an unknown intake falls back to all', () => {
  const a = buildAnalysis(sample());
  assert.strictEqual(a.selected, 'all');
  assert.strictEqual(a.totals.students, 13);
  assert.deepStrictEqual(a.intakeComparison.map((i) => [i.label, i.students, i.visas]), [['Jan Intake 2027', 12, 2], ['Sep Intake 2026', 1, 1]]);
  assert.strictEqual(buildAnalysis(sample(), { sheetId: 'nope' }).selected, 'all');
  assert.strictEqual(buildAnalysis({ sheets: [] }).totals.students, 0, 'an empty sheet makes no error');
  assert.deepStrictEqual(buildAnalysis({ sheets: [] }).findings, []);
});

test('marketing spend gives the cost per student and per visa of a channel, only for the intake it was spent on', () => {
  const spend = [
    { intake: 'jan', source: 'Social Media', detail: 'tiktok', campaign: 'Dashain Reel', amount: 40000 },
    { intake: 'jan', source: 'Social Media', detail: '', amount: 20000 },
    { intake: 'sep', source: 'Social Media', amount: 99999 },
    { intake: '', source: 'Radio', amount: 5000 },
  ];
  const a = buildAnalysis(sample(), { sheetId: 'jan', spend });
  const social = a.sources.find((s) => s.label === 'Social Media');
  assert.strictEqual(social.spend, 60000);
  assert.strictEqual(social.costPerStudent, 10000);
  assert.strictEqual(social.costPerVisa, 30000);
  const tiktok = social.details.find((d) => d.label === 'TikTok');
  assert.strictEqual(tiktok.spend, 40000, 'matched whatever the capitals');
  assert.strictEqual(tiktok.costPerVisa, 20000);
  assert.strictEqual(a.campaigns[0].spend, 40000);
  assert.strictEqual(a.spend.total, 60000, 'the other intake and the line not tied to an intake are left out');
  assert.strictEqual(a.sources.find((s) => s.label === 'Events').costPerStudent, null, 'nothing spent: no cost shown');

  const all = buildAnalysis(sample(), { spend });
  assert.strictEqual(all.spend.total, 164999);
  const radio = all.sources.find((s) => s.label === 'Radio');
  assert.strictEqual(radio.students, 0, 'a channel that was paid for but has no student is still shown');
  assert.ok(all.findings.some((f) => f.level === 'risk' && /Radio/.test(f.title)));
});

test('the findings say what is missing and what is risky, and only what the numbers prove', () => {
  const a = buildAnalysis(sample(), { sheetId: 'jan' });
  const titles = a.findings.map((f) => f.title);
  assert.ok(titles.some((t) => /4 of 12 students have no Source Detail/.test(t)), titles.join(' | '));
  assert.ok(titles.some((t) => /8 of 12 students have no Inquiry Date/.test(t)));
  assert.ok(titles.some((t) => /one university: UWL/.test(t)), 'nine of ten named universities are UWL');
  assert.ok(titles.some((t) => /No marketing spend is entered/.test(t)));
  assert.ok(titles.some((t) => /Only 12 students/.test(t)));
  assert.ok(!titles.some((t) => /No student is at Inquiry/.test(t)), 'two students are at Inquiry');
  a.findings.forEach((f) => { assert.ok(f.detail && f.action, 'every finding says what it means and what to do'); assert.ok(['risk', 'gap', 'info'].includes(f.level)); });
  assert.strictEqual(a.concentration.universities.top1Students.percent, 90);
});

test('completeness, lost reasons, busy months and speed are read from the sheet', () => {
  const a = buildAnalysis(sample(), { sheetId: 'jan' });
  const of = (column) => a.completeness.find((c) => c.column === column);
  assert.deepStrictEqual([of('STUDENT SOURCE').filled, of('STUDENT SOURCE').expected, of('STUDENT SOURCE').percent], [10, 12, 83.3]);
  assert.deepStrictEqual([of('LOST REASON').filled, of('LOST REASON').expected], [1, 2], 'expected only on lost students');
  assert.deepStrictEqual([of('CAMPAIGN OR EVENT').filled, of('CAMPAIGN OR EVENT').expected], [4, 10], 'expected only on Events and Social Media students');
  a.completeness.forEach((c) => assert.ok(c.decides, 'every column says what it lets you decide'));
  assert.deepStrictEqual(a.lostReasons, [{ label: 'Visa Refused: Financial', students: 1, rejected: 1 }, { label: BLANK, students: 1, rejected: 0 }]);
  assert.strictEqual(a.seasonality.inquiries[2], 4, 'four inquiries in March');
  assert.strictEqual(a.seasonality.applications[3], 4, 'four applications in April');
  assert.deepStrictEqual(a.speed.inquiryToApplication, { samples: 4, medianDays: 10 });
});

test('old sheets get the analysis columns in their places, and a sheet that has them is left alone', () => {
  const old = DEFAULT_COLUMNS.filter((c) => !ANALYSIS_COLUMNS.includes(c));
  const wb = migrateWorkbook({ sheets: [{ id: 's1', name: 'A', columns: old, rows: [{ _id: 'r1', 'FIRST NAME': 'Asha' }] }], activeSheetId: 's1' });
  assert.deepStrictEqual(wb.sheets[0].columns, DEFAULT_COLUMNS);
  const cols = wb.sheets[0].columns;
  assert.deepStrictEqual(cols.slice(0, 5), ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'SOURCE DETAIL', 'APPLICATION SUBMISSION DATE']);
  assert.deepStrictEqual(cols.slice(cols.indexOf('CONTACT NUMBER') + 1, cols.indexOf('CONTACT NUMBER') + 9), ['INQUIRY DATE', 'LEAD QUALITY', 'NEXT FOLLOW UP', 'CAMPAIGN OR EVENT', 'COUNSELOR', 'STUDY LEVEL', 'HOME DISTRICT', 'LOST REASON']);
  assert.ok(cols.indexOf('FIRST NAME') < 8, 'the name stays near the left');
  const first = [...DEFAULT_COLUMNS.filter((c) => c !== 'INQUIRY DATE')];
  first.splice(4, 0, 'INQUIRY DATE'); // a sheet opened by the first version of the layout (Inquiry Date in front of the name)
  assert.deepStrictEqual(migrateWorkbook({ sheets: [{ id: 's2', name: 'B', columns: first, rows: [] }], activeSheetId: 's2' }).sheets[0].columns, DEFAULT_COLUMNS, 'is put in the new order once');
  assert.deepStrictEqual(wb.sheets[0].rows[0], { _id: 'r1', 'FIRST NAME': 'Asha' }, 'no student is changed');
  cols.reverse(); // a manual reorder afterwards is left alone
  const reordered = [...cols];
  assert.deepStrictEqual(migrateWorkbook(wb).sheets[0].columns, reordered);
});

test('the Application and Follow-up Teams fill in the analysis columns; the Mock Team and the Manager do not', () => {
  const as = (departments, role = 'staff') => ({ role, departments });
  ANALYSIS_COLUMNS.forEach((col) => {
    assert.ok(Teams.canEdit(as(['application']), col), `Application Team: ${col}`);
    assert.ok(Teams.canEdit(as(['followup']), col), `Follow-up Team: ${col}`);
    assert.ok(!Teams.canEdit(as(['mock']), col), `Mock Team: ${col}`);
    assert.ok(!Teams.canEdit(as([], 'manager'), col), `Manager: ${col}`);
  });
  const move = Teams.MOVES.find((m) => m.warnIfBlank);
  assert.ok(!move.warnIfBlank.some((c) => ANALYSIS_COLUMNS.includes(c)), 'moving a student on does not warn about them');
});

test('the spend table keeps only clean lines, refuses a wrong one whole, and keeps the version before', () => {
  const dir = tmp();
  const spend = createSpend(dir);
  assert.deepStrictEqual(spend.list(), []);
  const saved = spend.replaceAll([{ month: '2026-10', intake: 'jan', source: ' Social Media ', detail: 'TikTok', campaign: 'Dashain Reel', amount: 40000.4, note: 'boost', extra: 'dropped' }], 'Kayas');
  assert.strictEqual(saved.rows.length, 1);
  assert.deepStrictEqual({ ...saved.rows[0], id: 'x' }, { id: 'x', month: '2026-10', intake: 'jan', source: 'Social Media', detail: 'TikTok', campaign: 'Dashain Reel', amount: 40000, leads: null, note: 'boost' });
  assert.strictEqual(spend.replaceAll([{ source: 'Events', amount: 5, leads: 120 }], 'Kayas').rows[0].leads, 120);
  assert.ok(spend.replaceAll([{ source: 'Events', amount: 5, leads: -2 }], 'Kayas').error);
  spend.replaceAll([{ source: 'Events', amount: 5 }], 'Kayas');
  for (const bad of [[{ source: '', amount: 5 }], [{ source: 'Events', amount: 0 }], [{ source: 'Events', amount: -5 }], [{ source: 'Events', amount: 'lots' }], [{ source: 'Events', amount: 5, month: '2026-13' }], 'nope', [{ source: 'Events', amount: 5 }, null]]) {
    assert.ok(spend.replaceAll(bad, 'Kayas').error, JSON.stringify(bad));
  }
  assert.strictEqual(spend.list().length, 1, 'a refused save changes nothing');
  assert.strictEqual(spend.replaceAll([], 'Kayas').rows.length, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'marketing-spend.backup.json'), 'utf8')).rows.length, 1, 'the version before the save is kept');
  assert.strictEqual(createSpend(dir).list().length, 0, 'read back from the file');

  fs.writeFileSync(path.join(dir, 'marketing-spend.json'), '{ nope');
  const damaged = createSpend(dir);
  assert.deepStrictEqual(damaged.list(), []);
  assert.ok(damaged.replaceAll([{ source: 'Events', amount: 5 }], 'Kayas').error, 'a file that could not be read is never saved over');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'marketing-spend.json'), 'utf8'), '{ nope');
});

test('the Advisor reads the analysis and the spend, and cannot change them', () => {
  const workbook = sample();
  const lines = [{ id: 'a'.repeat(12), month: '2026-10', intake: 'jan', source: 'Social Media', detail: 'TikTok', campaign: '', amount: 40000, leads: null, note: '' }];
  const log = [{ id: 'b'.repeat(12), date: '2026-10-01', problem: 'Few applications', decision: 'Run a TikTok campaign', expected: '15 applications by 1 December', reviewDate: '2026-12-01', actual: '', lesson: '', outcome: '' }];
  const mcp = createAdvisorMcp({
    token: 'x'.repeat(40), memoryDir: tmp(), getWorkbook: () => workbook, getDashboard: () => ({}), log: () => {}, facts: createFacts(tmp()),
    getAnalysis: (intake) => buildAnalysis(workbook, { sheetId: intake || 'all', spend: lines }), getSpend: () => lines, getDecisions: () => log,
  });
  const call = (name, args) => mcp.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result;
  const all = JSON.parse(call('get_business_analysis', {}).content[0].text);
  assert.strictEqual(all.selected, 'all');
  assert.strictEqual(all.totals.students, 13);
  const jan = JSON.parse(call('get_business_analysis', { intake: 'jan' }).content[0].text);
  assert.strictEqual(jan.sources.find((s) => s.label === 'Social Media').costPerVisa, 20000);
  assert.ok(call('get_business_analysis', { intake: 'nope' }).isError, 'an unknown tab is an error, not silently every intake');
  assert.deepStrictEqual(JSON.parse(call('get_marketing_spend', {}).content[0].text).lines, lines);
  assert.deepStrictEqual(JSON.parse(call('get_decision_log', {}).content[0].text).decisions, log);
  const tools = mcp.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.map((t) => t.name);
  assert.ok(!tools.some((t) => /spend|analysis|decision/.test(t) && /save|set|write|update|delete/.test(t)), 'no tool writes the spend');
});

test('a target is held against visas so far plus what the students in progress are likely to add at past rates', () => {
  const rows = [];
  for (let i = 0; i < 40; i += 1) rows.push(student(i, { 'APPLICATION STATUS': i < 12 ? 'Visa Issued' : i < 20 ? 'Withdrawn' : 'Application Stage', 'APPLICATION SUBMISSION DATE': i < 3 ? '2026-11-09' : i < 5 ? '2026-11-01' : '2026-09-01' }));
  const wb = { sheets: [{ id: 'jan', name: 'Jan Intake 2027', rows }, { id: 'new', name: 'May Intake 2027', rows: [student(99, { 'APPLICATION STATUS': 'Application Stage' })] }] };
  const today = new Date('2026-11-10T06:00:00Z');
  const a = buildAnalysis(wb, { targets: { jan: { visas: 30, deadline: '2026-12-22' }, gone: { visas: 9, deadline: '' } }, today });
  assert.strictEqual(a.targets.rows.length, 1, 'only intakes on the sheet that have a target');
  const r = a.targets.rows[0];
  // 20 finished students applied, 12 got a visa: 60%. 20 in progress at "applied" are likely to add 12.
  assert.deepStrictEqual([r.visas, r.inProgress, r.expectedFromInProgress, r.forecast, r.gap], [12, 20, 12, 24, 6]);
  assert.strictEqual(r.applicationsNeeded, 10, '6 more visas at 60% need 10 applications');
  assert.strictEqual(r.weeksLeft, 6);
  assert.strictEqual(r.applicationsPerWeek, 1.7);
  assert.strictEqual(r.status, 'Behind');
  assert.ok(a.findings.some((f) => f.level === 'risk' && /24 visas forecast against a target of 30/.test(f.title) && /10 more applications/.test(f.action)));
  assert.deepStrictEqual([a.week.last7Days.applications, a.week.the7DaysBefore.applications], [3, 2]);

  assert.strictEqual(buildAnalysis(wb, { targets: { jan: { visas: 12, deadline: '' } }, today }).targets.rows[0].status, 'Reached');
  assert.strictEqual(buildAnalysis(wb, { targets: { jan: { visas: 20, deadline: '' } }, today }).targets.rows[0].status, 'On track');
  assert.strictEqual(buildAnalysis(wb, { targets: { jan: { visas: 30, deadline: '2026-11-01' } }, today }).targets.rows[0].status, 'Missed');
  const thin = buildAnalysis({ sheets: [wb.sheets[1]] }, { targets: { new: { visas: 5, deadline: '' } }, today });
  assert.deepStrictEqual([thin.targets.rows[0].forecast, thin.targets.rows[0].status], [null, 'Not enough history to forecast'], 'no number is made up without history');
  assert.ok(buildAnalysis(wb, { today }).findings.some((f) => /No intake has a visa target/.test(f.title)));
});

test('the targets file keeps whole numbers and real dates, drops a target of 0, and is never saved over when damaged', () => {
  const dir = tmp();
  const targets = createTargets(dir);
  assert.deepStrictEqual(targets.all(), {});
  assert.deepStrictEqual(targets.replaceAll({ jan: { visas: 60, deadline: '2027-01-10', extra: 1 }, sep: { visas: 0, deadline: '' }, may: { visas: '', deadline: '' } }, 'Kayas').targets, { jan: { visas: 60, deadline: '2027-01-10' } });
  for (const bad of [null, [], { jan: { visas: -1 } }, { jan: { visas: 2.5 } }, { jan: { visas: 'many' } }, { jan: { visas: 5, deadline: '2027-02-30' } }]) assert.ok(targets.replaceAll(bad, 'Kayas').error, JSON.stringify(bad));
  assert.deepStrictEqual(createTargets(dir).all(), { jan: { visas: 60, deadline: '2027-01-10' } }, 'a refused save changes nothing');
  fs.writeFileSync(path.join(dir, 'targets.json'), '{ nope');
  assert.ok(createTargets(dir).replaceAll({ jan: { visas: 5 } }, 'Kayas').error);
});

test('follow-ups, lead quality, reported leads and the forecast range are worked out from what is typed', () => {
  const rows = [];
  for (let i = 0; i < 40; i += 1) rows.push(student(i, { 'STUDENT SOURCE': 'Social Media', COUNSELOR: i % 2 ? 'Asha' : '', 'LEAD QUALITY': i >= 30 && i < 34 ? 'Qualified' : i >= 34 ? 'Just Exploring' : '',
    'NEXT FOLLOW UP': i === 30 ? '2026-11-01' : i === 31 ? '2026-11-08' : i === 32 ? '2026-11-12' : '', 'APPLICATION STATUS': i < 12 ? 'Visa Issued' : i < 20 ? 'Withdrawn' : i < 30 ? 'Application Stage' : 'Inquiry' }));
  rows[5]['NEXT FOLLOW UP'] = '2026-01-01'; // a student with a visa is not chased
  const today = new Date('2026-11-10T06:00:00Z');
  const a = buildAnalysis({ sheets: [{ id: 'jan', name: 'Jan Intake 2027', rows }] }, { today, targets: { jan: { visas: 30, deadline: '' } }, spend: [{ intake: 'jan', source: 'Social Media', amount: 90000, leads: 300 }, { intake: 'jan', source: 'Social Media', amount: 10000 }] });
  assert.deepStrictEqual([a.followUps.overdue, a.followUps.dueInNext7Days, a.followUps.earlyStageWithNoDate], [2, 1, 17]);
  assert.deepStrictEqual(a.followUps.longestOverdue.map((x) => [x.name, x.daysOverdue, x.counselor]), [['Student30', 9, ''], ['Student31', 2, 'Asha']]);
  assert.deepStrictEqual(a.followUps.overdueByCounselor, [{ label: BLANK, count: 1 }, { label: 'Asha', count: 1 }]);
  assert.ok(a.findings.some((f) => /2 follow-ups are overdue/.test(f.title)));
  const social = a.sources[0];
  assert.strictEqual(social.qualified, 16, 'the 12 who are known to have applied (a visa proves it) and the 4 marked Qualified');
  assert.deepStrictEqual([social.spend, social.reportedLeads, social.costPerLead, social.leadsToStudents], [100000, 300, 333, 13.3]);
  assert.strictEqual(social.costPerQualified, 6250);
  assert.deepStrictEqual(a.leadQuality.map((q) => [q.label, q.students]), [['Just Exploring', 6], ['Qualified', 4], [BLANK, 30]]);
  const t = a.targets.rows[0];
  assert.ok(t.forecastLow < t.forecast && t.forecast < t.forecastHigh, `${t.forecastLow} < ${t.forecast} < ${t.forecastHigh}`);
  assert.strictEqual(buildAnalysis({ sheets: [{ id: 'jan', name: 'Jan', rows }] }, { today }).sources[0].reportedLeads, null, 'no leads typed: none shown');
  const due = buildAnalysis({ sheets: [] }, { today, decisions: [{ decision: 'A', reviewDate: '2026-11-01', actual: '' }, { decision: 'B', reviewDate: '2026-11-01', actual: 'done' }, { decision: 'C', reviewDate: '2026-12-01', actual: '' }] });
  assert.deepStrictEqual(due.decisions.dueForReview.map((x) => x.decision), ['A']);
});

test('the decision log keeps clean lines, refuses personal data and wrong dates, and is never saved over when damaged', () => {
  const dir = tmp();
  const log = createDecisions(dir);
  const saved = log.replaceAll([{ date: '2026-11-10', problem: 'Few applications', decision: 'Run a TikTok campaign', expected: '15 applications', reviewDate: '2026-12-10', outcome: 'Maybe', extra: 1 }], 'Kayas');
  assert.deepStrictEqual({ ...saved.rows[0], id: 'x' }, { id: 'x', date: '2026-11-10', problem: 'Few applications', decision: 'Run a TikTok campaign', expected: '15 applications', reviewDate: '2026-12-10', actual: '', lesson: '', outcome: '' });
  for (const bad of [[{ decision: '' }], [{ decision: 'x', date: '2026-02-30' }], [{ decision: 'Call asha@example.com' }], [{ decision: 'Call 9801234567' }], 'nope']) assert.ok(log.replaceAll(bad, 'Kayas').error, JSON.stringify(bad));
  assert.strictEqual(createDecisions(dir).list().length, 1, 'a refused save changes nothing');
  fs.writeFileSync(path.join(dir, 'decisions.json'), '{ nope');
  assert.ok(createDecisions(dir).replaceAll([{ decision: 'x' }], 'Kayas').error);
});

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('on the real server Admin and the Manager see the Analysis, only Admin changes the spend, staff see neither', { timeout: 120000 }, async (t) => {
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
      return { status: res.status, json, text, location: res.headers.get('location') };
    };
  };
  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' });
  await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' });

  const page = await admin('GET', '/analysis');
  assert.strictEqual(page.status, 200);
  assert.match(page.text, /<h1>Analysis<\/h1>/);
  assert.strictEqual((await admin('GET', '/analysis.js')).status, 200);
  const first = await admin('GET', '/api/analysis');
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.json.selected, 'all');
  assert.ok(Array.isArray(first.json.findings) && Array.isArray(first.json.completeness));
  assert.strictEqual((await admin('GET', '/api/analysis?intake=%00')).status, 200, 'a nonsense intake is every intake, not an error');

  assert.deepStrictEqual((await admin('GET', '/api/marketing-spend')).json, { rows: [], canEdit: true });
  const saved = await admin('POST', '/api/marketing-spend', { rows: [{ month: '2026-10', intake: '', source: 'Events', detail: 'Education Fair', campaign: 'Kathmandu Fair', amount: 150000, note: '' }] });
  assert.strictEqual(saved.status, 200, saved.text);
  assert.strictEqual((await admin('POST', '/api/marketing-spend', { rows: [{ source: 'Events', amount: -1 }] })).status, 400);
  assert.strictEqual((await admin('POST', '/api/marketing-spend', {})).status, 400);
  const after = (await admin('GET', '/api/analysis')).json;
  assert.strictEqual(after.spend.total, 150000);
  assert.strictEqual(after.sources.find((s) => s.label === 'Events').spend, 150000);
  assert.ok(!fs.readdirSync(path.join(__dirname, '..', 'student-details')).includes('marketing-spend.json'), 'the spend is kept in the data folder, never beside the code');

  const intakeId = after.intakes[0].id;
  assert.strictEqual((await admin('POST', '/api/targets', { targets: { [intakeId]: { visas: 60, deadline: '2027-01-10' } } })).status, 200);
  assert.strictEqual((await admin('POST', '/api/targets', { targets: { [intakeId]: { visas: -3 } } })).status, 400);
  assert.deepStrictEqual((await admin('GET', '/api/analysis')).json.targets.rows.map((r) => [r.id, r.target, r.deadline]), [[intakeId, 60, '2027-01-10']]);

  assert.strictEqual((await admin('POST', '/api/decisions', { rows: [{ date: '2026-11-10', decision: 'Run a TikTok campaign', expected: '15 applications', reviewDate: '2026-11-01' }] })).status, 200);
  assert.strictEqual((await admin('POST', '/api/decisions', { rows: [{ decision: '' }] })).status, 400);
  assert.strictEqual((await admin('GET', '/api/analysis')).json.decisions.dueForReview.length, 1);

  const nobody = person();
  for (const url of ['/analysis', '/analysis.html', '/api/analysis', '/api/marketing-spend', '/api/decisions', '/api/targets']) assert.notStrictEqual((await nobody('GET', url)).status, 200, `logged out: ${url}`);
  assert.notStrictEqual((await nobody('POST', '/api/marketing-spend', { rows: [] })).status, 200);
  assert.notStrictEqual((await nobody('POST', '/api/targets', { targets: {} })).status, 200);

  const join = async (username, role, extra) => {
    const made = await admin('POST', '/api/users', { name: username, username, role, ...extra });
    assert.strictEqual(made.status, 200, `${username} created`);
    const them = person();
    await them('POST', '/api/login', { username, password: made.json.temporaryPassword });
    await them('POST', '/api/login/new-password', { password: 'Another-Long-Pass-2026' });
    return them;
  };
  const manager = await join('chief', 'manager', {});
  assert.strictEqual((await manager('GET', '/analysis')).status, 200);
  assert.strictEqual((await manager('GET', '/api/analysis')).status, 200);
  assert.strictEqual((await manager('GET', '/api/marketing-spend')).json.canEdit, false);
  assert.strictEqual((await manager('POST', '/api/marketing-spend', { rows: [] })).status, 403, 'the Manager reads the spend but cannot change it');
  assert.strictEqual((await manager('POST', '/api/targets', { targets: {} })).status, 403, 'the Manager cannot change the targets');
  assert.strictEqual((await manager('GET', '/api/decisions')).json.canEdit, false);
  assert.strictEqual((await manager('POST', '/api/decisions', { rows: [] })).status, 403, 'the Manager reads the decision log but cannot change it');

  const staff = await join('sita', 'staff', { departments: ['application'] });
  assert.strictEqual((await staff('GET', '/analysis')).status, 302);
  assert.strictEqual((await staff('GET', '/analysis.html')).status, 302);
  assert.strictEqual((await staff('GET', '/api/analysis')).status, 403);
  assert.strictEqual((await staff('GET', '/api/marketing-spend')).status, 403);
  assert.strictEqual((await staff('POST', '/api/marketing-spend', { rows: [] })).status, 403);
  assert.strictEqual((await staff('POST', '/api/targets', { targets: {} })).status, 403);
  assert.strictEqual((await staff('GET', '/api/decisions')).status, 403);
  assert.strictEqual((await staff('POST', '/api/decisions', { rows: [] })).status, 403);
  const seen = await staff('GET', '/api/targets');
  assert.strictEqual(seen.status, 200, 'the team reads the target of the intake it sees, for the card on the sheet');
  assert.deepStrictEqual([seen.json.targets[intakeId].target, seen.json.targets[intakeId].deadline], [60, '2027-01-10']);
  assert.ok(!('forecast' in seen.json.targets[intakeId]), 'only the target, the count and the pace');
  assert.strictEqual((await admin('GET', '/api/analysis')).json.targets.rows[0].target, 60, 'the target was not changed by the others');
  assert.strictEqual((await admin('GET', '/api/marketing-spend')).json.rows.length, 1, 'nothing was changed by the others');
});

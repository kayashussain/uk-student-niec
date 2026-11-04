// The Incentive connector for Claude: read-only live access to the Incentive data with its own secret.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createIncentiveAdvisor } = require('../counselor-incentive/advisor-mcp');

const TOKEN = 'i'.repeat(40);
const student = (id, name, university, agent, tuition) => ({ id, name, course: 'MSc', university, agent, studentId: 'S' + id, tuitionFee: tuition, visaIssuedDate: '9/23/2026' });
const SYNC = { ok: true, intakes: ['Sep Intake 2026', 'Jan Intake 2027'], byIntake: {
  'Sep Intake 2026': [student('a', 'Sita Sharma', 'Bangor University', 'Real Dreams', 10000), student('b', 'Ram Thapa', 'Bangor University', 'Adventus', 12000), student('c', 'Maya Gurung', 'Ulster University', 'Real Dreams', 8000)],
  'Jan Intake 2027': [],
} };
const COMMISSIONS = {
  a: { uniCommissionRate: 15, enrollmentCommission: 10000, flywireCommission: 500, loanCommission: 1000 },
  b: { uniCommissionRate: 10, enrollmentCommission: 5000 },
};
const ADVANCES = { 'Sep Intake 2026': { previousAdvance: 2000, basicSalary: 70000, salaryMonths: 4 } };
const make = (token = TOKEN, extra = {}) => createIncentiveAdvisor({
  token, memoryDir: fs.mkdtempSync(path.join(os.tmpdir(), 'niec-imem-')), log: () => {},
  getSync: () => SYNC, getCommissions: () => COMMISSIONS, getAdvances: () => ADVANCES, getRate: () => ({ rate: 180, date: '2026-11-04' }), ...extra,
});
const call = (m, name, args) => JSON.parse(m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result.content[0].text);

test('off without a long enough secret, and only the notebook tools can write', () => {
  assert.strictEqual(make('').enabled, false);
  assert.strictEqual(make('short').enabled, false);
  assert.strictEqual(make().enabled, true);
  const tools = make().rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.map((t) => t.name);
  assert.deepStrictEqual([...tools].sort(), ['forget_memory', 'get_incentives', 'get_overview', 'get_payment_summary', 'read_memory', 'save_memory', 'summarize_by']);
});

test('overview lists the intakes with their visa-issued students and the exchange rate', () => {
  const o = call(make(), 'get_overview', {});
  assert.deepStrictEqual(o.intakes, [{ name: 'Sep Intake 2026', visaIssuedStudents: 3 }, { name: 'Jan Intake 2027', visaIssuedStudents: 0 }]);
  assert.strictEqual(o.exchangeRate.gbpToNpr, 180);
});

test('get_incentives shows the University Partner (agent), the worked-out commission and the incentives entered', () => {
  const m = make();
  const all = call(m, 'get_incentives', {});
  assert.strictEqual(all.matched, 3);
  const sita = all.students.find((s) => s.student === 'Sita Sharma');
  assert.strictEqual(sita.universityPartner, 'Real Dreams');
  assert.strictEqual(sita.uniCommissionAmountGbp, 1500, '15% of 10,000');
  assert.strictEqual(sita.totalIncentivesNpr, 10500, 'enrollment 10,000 + flywire 500; the loan is not part of the total');
  assert.strictEqual(sita._record, undefined, 'internal fields are not sent');
  assert.deepStrictEqual(call(m, 'get_incentives', { partner: 'real dreams' }).students.map((s) => s.student), ['Sita Sharma', 'Maya Gurung']);
  assert.deepStrictEqual(call(m, 'get_incentives', { university: 'ulster' }).students.map((s) => s.student), ['Maya Gurung']);
  assert.strictEqual(call(m, 'get_incentives', { intake: 'Jan Intake 2027' }).matched, 0);
  assert.strictEqual(call(m, 'get_incentives', { limit: 1, offset: 1 }).returned, 1);
  const unknown = m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_incentives', arguments: { intake: 'Nope' } } }).result;
  assert.strictEqual(unknown.isError, true);
  assert.match(unknown.content[0].text, /No intake "Nope"\. Intakes: Sep Intake 2026, Jan Intake 2027/);
});

test('the payment summary and company earnings are worked out like the Incentive page does', () => {
  const { intakes } = call(make(), 'get_payment_summary', { intake: 'Sep Intake 2026' });
  const sep = intakes[0];
  // incentives: a = 10,000 + 500, b = 5,000 -> 15,500; loan 1,000 -> net 14,500; TDS 15% = 2,175; advance 2,000
  assert.deepStrictEqual(sep.paymentSummaryNpr, { totalIncentives: 15500, loanIncentiveToShare: 1000, netIncentives: 14500, tds15Percent: 2175, previousAdvance: 2000, netPayable: 10325 });
  // commission: 1,500 + 1,200 + 0 = 2,700 GBP, x 180 = 486,000 NPR; salary 70,000 x 4 = 280,000; counselor total 280,000 + 14,500
  assert.strictEqual(sep.companyEarnings.universityCommissionGbp, 2700);
  assert.strictEqual(sep.companyEarnings.universityCommissionNpr, 486000);
  assert.strictEqual(sep.companyEarnings.counselorSalaryForPeriodNpr, 280000);
  assert.strictEqual(sep.companyEarnings.counselorTotalNpr, 294500);
  assert.strictEqual(call(make(), 'get_payment_summary', {}).intakes.length, 2, 'every intake when none is named');
});

test('summarize_by groups by University Partner, University Name or Intake', () => {
  const m = make();
  const byPartner = call(m, 'summarize_by', { by: 'universityPartner' });
  assert.deepStrictEqual(byPartner.groups.map((g) => [g['University Partner'], g.students]), [['Real Dreams', 2], ['Adventus', 1]]);
  const real = byPartner.groups[0];
  assert.strictEqual(real.tuitionFeesGbp, 18000);
  assert.strictEqual(real.incentivesEnteredNpr, 10500);
  assert.deepStrictEqual(call(m, 'summarize_by', { by: 'university' }).groups.map((g) => [g['University Name'], g.students]), [['Bangor University', 2], ['Ulster University', 1]]);
  assert.strictEqual(call(m, 'summarize_by', { by: 'intake' }).total, 3);
});

test('a student with no University Partner is grouped as (empty), and a failing data read is explained', () => {
  const sync = { ok: true, intakes: ['X'], byIntake: { X: [student('z', 'No Agent', 'UWL', '', 100)] } };
  const m = make(TOKEN, { getSync: () => sync });
  assert.strictEqual(call(m, 'summarize_by', { by: 'universityPartner' }).groups[0]['University Partner'], '(empty)');
  const broken = make(TOKEN, { getSync: () => ({ ok: false, error: 'Could not find the Student Details data file' }) });
  const r = broken.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_overview', arguments: {} } }).result;
  assert.strictEqual(r.isError, true);
  assert.match(r.content[0].text, /Student Details data file/);
  assert.strictEqual(make().rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_everything', arguments: {} } }).error.code, -32602, 'unknown tools are refused');
});

test('the address must carry the exact secret; otherwise it looks like a missing page', async () => {
  const m = make();
  const ask = async (urlPath, method = 'POST', body = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}') => {
    const chunks = [];
    const res = { status: 0, writeHead(s) { this.status = s; }, end(b) { chunks.push(b); } };
    const { PassThrough } = require('node:stream');
    const req = new PassThrough(); req.method = method; req.end(body);
    const handled = await m.handle(req, res, urlPath);
    return { handled, status: res.status, body: chunks.join('') };
  };
  assert.strictEqual((await ask('/somewhere-else')).handled, false);
  assert.strictEqual((await ask('/advisor-mcp/' + 'x'.repeat(40))).status, 404);
  assert.strictEqual((await ask('/advisor-mcp/')).status, 404);
  assert.strictEqual((await ask('/advisor-mcp/' + TOKEN, 'GET')).status, 405);
  const ok = await ask('/advisor-mcp/' + TOKEN);
  assert.strictEqual(ok.status, 200);
  assert.ok(JSON.parse(ok.body).result.tools.length >= 7);
  assert.strictEqual((await make('').handle(Object.assign(new (require('node:stream').PassThrough)(), { method: 'POST' }), { writeHead() {}, end() {} }, '/advisor-mcp/' + TOKEN)), true);
});

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('on the real Incentive app, mounted at /incentive: answers only with the secret, before any login, and shows live data', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-iadv-'));
  // The students: one visa-issued student with a University Partner, in the Student Details data file.
  fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ revision: 1, sheets: [{ id: 'sheet-1', name: 'Sep Intake 2026', columns: [], rows: [
    { _id: 'row-1', 'FIRST NAME': 'Sita', 'LAST NAME': 'Sharma', 'UNIVERSITY NAME': 'Bangor University', 'UNIVERSITY PARTNER': 'Real Dreams', 'GROSS FEE': '10000', 'APPLICATION STATUS': 'Visa Issued' },
    { _id: 'row-2', 'FIRST NAME': 'Not', 'LAST NAME': 'Yet', 'UNIVERSITY NAME': 'X', 'UNIVERSITY PARTNER': 'Nobody', 'APPLICATION STATUS': 'Inquiry' },
  ] }], activeSheetId: 'sheet-1' }));
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'counselor-incentive'),
    env: { ...process.env, PORT: String(port), BASE_PATH: '/incentive', COUNSELOR_DATA_DIR: path.join(dir, 'incentive'), STUDENT_DETAILS_DATA_DIR: dir, NIEC_INCENTIVE_ADVISOR_TOKEN: TOKEN }, stdio: 'ignore',
  });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { await fetch(base + '/incentive/', { redirect: 'manual' }); break; } catch (e) { await wait(250); } }
  const rpc = async (secret, method, params) => {
    const res = await fetch(`${base}/incentive/advisor-mcp/${secret}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  assert.strictEqual((await rpc('wrong-secret', 'tools/list')).status, 404);
  // Hosts that strip the /incentive prefix themselves reach the same address without it.
  assert.strictEqual((await fetch(`${base}/advisor-mcp/${TOKEN}`, { method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' })).status, 200);
  assert.strictEqual((await fetch(`${base}/advisor-mcp/wrong`, { method: 'POST', body: '{}' })).status, 404);
  const tools = await rpc(TOKEN, 'tools/list');
  assert.strictEqual(tools.status, 200, 'no login needed: the secret is the key');
  const got = await rpc(TOKEN, 'tools/call', { name: 'get_incentives', arguments: {} });
  const result = JSON.parse(got.json.result.content[0].text);
  assert.strictEqual(result.matched, 1, 'only the Visa Issued student');
  assert.strictEqual(result.students[0].universityPartner, 'Real Dreams');
  assert.strictEqual(result.students[0].tuitionFeeGbp, 10000);
  // The normal Incentive page and its data still need a login.
  assert.notStrictEqual((await fetch(`${base}/incentive/api/commissions`, { redirect: 'manual' })).status, 200);
  assert.notStrictEqual((await fetch(`${base}/incentive/api/sync`, { redirect: 'manual' })).status, 200);
});

test('without a secret set the connector does not exist on the real app', { timeout: 60000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-iadv-off-'));
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), COUNSELOR_DATA_DIR: path.join(dir, 'incentive'), STUDENT_DETAILS_DATA_DIR: dir };
  delete env.NIEC_INCENTIVE_ADVISOR_TOKEN;
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', 'counselor-incentive'), env, stdio: 'ignore' });
  t.after(() => server.kill());
  for (let i = 0; i < 60; i += 1) { try { await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' }); break; } catch (e) { await wait(250); } }
  const res = await fetch(`http://127.0.0.1:${port}/advisor-mcp/${TOKEN}`, { method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  assert.strictEqual(res.status, 404);
});

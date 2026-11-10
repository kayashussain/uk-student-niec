const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createAdvisorMcp } = require('../student-details/advisor-mcp');
const { createFacts } = require('../student-details/facts');

const TOKEN = 'x'.repeat(40);
const workbook = {
  revision: 7,
  sheets: [
    { id: 'sheet-a', name: 'Jan 2027', columns: ['APPLICATION STATUS', 'FIRST NAME', 'UNIVERSITY NAME'], rows: [
      { _id: 'r1', 'APPLICATION STATUS': 'Inquiry', 'FIRST NAME': 'Asha', 'UNIVERSITY NAME': 'UWL' },
      { _id: 'r2', 'APPLICATION STATUS': 'Offer', 'FIRST NAME': 'Binod', 'UNIVERSITY NAME': 'UWL' },
      { _id: 'r3', 'APPLICATION STATUS': 'Offer', 'FIRST NAME': 'Chandra', 'UNIVERSITY NAME': '' },
    ] },
    { id: 'sheet-b', name: 'Sep 2026', hidden: true, columns: ['APPLICATION STATUS', 'FIRST NAME'], rows: [{ _id: 'r4', 'APPLICATION STATUS': 'Visa', 'FIRST NAME': 'Dil' }] },
  ],
};
const make = (token = TOKEN, memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-mem-'))) => createAdvisorMcp({
  token, memoryDir, getWorkbook: () => workbook, getDashboard: (i) => ({ intake: i }),
  facts: createFacts(fs.mkdtempSync(path.join(os.tmpdir(), 'niec-adv-'))), log: () => {},
});
const call = (m, name, args) => JSON.parse(m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result.content[0].text);

test('off without a long enough secret', () => {
  assert.strictEqual(make('').enabled, false);
  assert.strictEqual(make('short').enabled, false);
  assert.strictEqual(make().enabled, true);
});

test('lists the read tools and only the notebook tools write', () => {
  const tools = make().rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.map((t) => t.name);
  assert.deepStrictEqual([...tools].sort(), ['count_by', 'forget_memory', 'get_business_analysis', 'get_dashboard', 'get_decision_log', 'get_fact_file', 'get_marketing_spend', 'get_overview', 'get_students', 'read_memory', 'save_memory']);
});

test('the notebook saves, appends, replaces, forgets and keeps backups', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-mem-'));
  const m = make(TOKEN, dir);
  const ask = (name, args) => m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result;
  assert.deepStrictEqual(JSON.parse(ask('read_memory', {}).content[0].text).sections, []);
  assert.ok(JSON.parse(ask('save_memory', { section: 'Preferences', text: 'Wants short steps' }).content[0].text).ok);
  ask('save_memory', { section: 'Preferences', text: 'Likes tables' });
  let sections = JSON.parse(ask('read_memory', {}).content[0].text).sections;
  assert.match(sections[0].text, /Wants short steps\n- \d{4}-\d{2}-\d{2}: Likes tables/);
  ask('save_memory', { section: 'Preferences', text: 'Short steps and tables', mode: 'replace' });
  assert.strictEqual(JSON.parse(ask('read_memory', {}).content[0].text).sections[0].text, 'Short steps and tables');
  assert.ok(fs.readdirSync(path.join(dir, 'backups')).length >= 2);
  assert.ok(ask('forget_memory', { section: 'Nope' }).isError);
  ask('forget_memory', { section: 'Preferences' });
  sections = JSON.parse(ask('read_memory', {}).content[0].text).sections;
  assert.deepStrictEqual(sections, []);
});

test('the notebook refuses personal data and oversize notes, and never touches the sheet', () => {
  const before = JSON.stringify(workbook);
  const m = make();
  const ask = (args) => m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'save_memory', arguments: args } }).result;
  assert.ok(ask({ section: 'X', text: 'Call Asha on asha@example.com' }).isError);
  assert.ok(ask({ section: 'X', text: 'Her number is +977 9812345678' }).isError);
  assert.ok(ask({ section: 'X', text: 'a'.repeat(9000) }).isError);
  assert.ok(ask({ section: '', text: 'hello' }).isError);
  assert.strictEqual(JSON.stringify(workbook), before);
});

test('overview shows every tab, hidden ones too, with columns', () => {
  const o = call(make(), 'get_overview', {});
  assert.strictEqual(o.revision, 7);
  assert.deepStrictEqual(o.sheets.map((s) => [s.id, s.hidden, s.students]), [['sheet-a', false, 3], ['sheet-b', true, 1]]);
});

test('get_students filters, picks columns, pages', () => {
  const m = make();
  const r = call(m, 'get_students', { sheet: 'Jan 2027', where: { 'APPLICATION STATUS': '=offer' }, columns: ['FIRST NAME'] });
  assert.strictEqual(r.matched, 2);
  assert.deepStrictEqual(r.students.map((s) => s['FIRST NAME']), ['Binod', 'Chandra']);
  assert.strictEqual(call(m, 'get_students', { limit: 1, offset: 1 }).students.length, 1);
  assert.strictEqual(call(m, 'get_students', { where: { 'UNIVERSITY NAME': '=' } }).matched, 2); // empty cell on sheet-a + sheet-b has no such column
});

test('count_by groups and names empty cells', () => {
  const r = call(make(), 'count_by', { group_by: ['UNIVERSITY NAME'], sheet: 'sheet-a' });
  assert.deepStrictEqual(r.groups, [{ 'UNIVERSITY NAME': 'UWL', students: 2 }, { 'UNIVERSITY NAME': '(empty)', students: 1 }]);
});

test('unknown column and unknown tab are explained, not guessed', () => {
  const m = make();
  const bad = m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'count_by', arguments: { group_by: ['NOPE'] } } }).result;
  assert.ok(bad.isError && /Unknown column/.test(bad.content[0].text));
  const tab = m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_students', arguments: { sheet: 'zzz' } } }).result;
  assert.ok(tab.isError && /No tab/.test(tab.content[0].text));
});

test('cannot write: unknown tools are refused and the workbook is unchanged', () => {
  const before = JSON.stringify(workbook);
  const r = make().rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'save_students', arguments: {} } });
  assert.ok(r.error);
  assert.strictEqual(JSON.stringify(workbook), before);
});

function fakeRes() {
  const r = { status: 0, body: '' };
  r.writeHead = (s) => { r.status = s; };
  r.end = (b) => { r.body = b || ''; };
  return r;
}
const fakeReq = (method, body) => {
  const { Readable } = require('node:stream');
  const q = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  q.method = method;
  return q;
};

test('the address must carry the exact secret; otherwise it looks like a missing page', async () => {
  const m = make();
  for (const p of ['/advisor-mcp/', '/advisor-mcp/wrong', '/advisor-mcp/%E0%A4%A', `/advisor-mcp/${TOKEN}x`]) {
    const res = fakeRes();
    assert.strictEqual(await m.handle(fakeReq('POST', '{}'), res, p), true);
    assert.strictEqual(res.status, 404, p);
  }
  const off = fakeRes();
  await make('').handle(fakeReq('POST', '{}'), off, `/advisor-mcp/${TOKEN}`);
  assert.strictEqual(off.status, 404);
  assert.strictEqual(await m.handle(fakeReq('GET'), fakeRes(), '/api/data'), false);
});

test('a correct address answers JSON-RPC; notifications get 202; GET gets 405', async () => {
  const m = make();
  const ok = fakeRes();
  await m.handle(fakeReq('POST', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })), ok, `/advisor-mcp/${TOKEN}`);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(JSON.parse(ok.body).result.serverInfo.name, 'niec-advisor');
  const note = fakeRes();
  await m.handle(fakeReq('POST', JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })), note, `/advisor-mcp/${TOKEN}`);
  assert.strictEqual(note.status, 202);
  const get = fakeRes();
  await m.handle(fakeReq('GET'), get, `/advisor-mcp/${TOKEN}`);
  assert.strictEqual(get.status, 405);
});

test('notebook: built-in names are plain titles, and personal data in a title or passport number is refused', () => {
  const m = make();
  const save = (args) => m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'save_memory', arguments: args } }).result;
  const parse = (r) => JSON.parse(r.content[0].text);
  assert.ok(parse(save({ section: 'constructor', text: 'hello' })).ok);
  assert.ok(parse(save({ section: '__proto__', text: 'also kept' })).ok);
  const read = call(m, 'read_memory', {});
  assert.deepStrictEqual(read.sections.map((x) => [x.title, x.text]).sort(), [['__proto__', 'also kept'], ['constructor', 'hello']]);
  assert.ok(m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forget_memory', arguments: { section: 'toString' } } }).result.isError, 'no such section');
  assert.ok(save({ section: 'ram@x.com 9812345678', text: 'ok note' }).isError);
  assert.ok(save({ section: 'Students', text: 'passport PA1234567' }).isError);
  assert.ok(parse(save({ section: 'Targets', text: 'Intakes 2025 2026 2027 targets' })).ok, 'years are not a phone number');
});

test('JSON-RPC: an id of null is answered, an empty or huge batch is refused, client replies are accepted', () => {
  const m = make();
  assert.deepStrictEqual(m.rpc({ jsonrpc: '2.0', id: null, method: 'ping' }), { jsonrpc: '2.0', id: null, result: {} });
  assert.strictEqual(m.rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.strictEqual(m.rpc({ jsonrpc: '2.0', id: 5, result: {} }), null);
  assert.strictEqual(m.rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }).result.protocolVersion, '2024-11-05');
  assert.strictEqual(m.rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }).result.protocolVersion, '2025-03-26');
});

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
const make = (token = TOKEN) => createAdvisorMcp({
  token, getWorkbook: () => workbook, getDashboard: (i) => ({ intake: i }),
  facts: createFacts(fs.mkdtempSync(path.join(os.tmpdir(), 'niec-adv-'))), log: () => {},
});
const call = (m, name, args) => JSON.parse(m.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result.content[0].text);

test('off without a long enough secret', () => {
  assert.strictEqual(make('').enabled, false);
  assert.strictEqual(make('short').enabled, false);
  assert.strictEqual(make().enabled, true);
});

test('lists only read tools', () => {
  const tools = make().rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.map((t) => t.name);
  assert.deepStrictEqual([...tools].sort(), ['count_by', 'get_dashboard', 'get_fact_file', 'get_overview', 'get_students']);
  assert.ok(tools.every((n) => /^(get_|count_)/.test(n)));
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

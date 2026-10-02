const test = require('node:test');
const assert = require('node:assert');
const { migrateWorkbook, mergeWorkbooks, mergeOrder, createHistory } = require('../student-details/workbook');

const clone = (x) => JSON.parse(JSON.stringify(x));

function workbook(rows, extra = {}) {
  return {
    sheets: [{ id: 's1', name: 'Jan', columns: ['FIRST NAME', 'APPLICATION STATUS'], rows, ...extra }],
    activeSheetId: 's1',
  };
}

test('migrateWorkbook renames the misspelled columns in columns and rows', () => {
  const wb = migrateWorkbook({
    sheets: [{ id: 's1', name: 'A', columns: ['RECEVING PARTNER', 'REMANING TUITION FEE'], rows: [{ _id: 'r1', 'RECEVING PARTNER': 'X', 'REMANING TUITION FEE': '10' }] }],
    activeSheetId: 's1',
  });
  assert.deepStrictEqual(wb.sheets[0].columns, ['RECEIVING PARTNER', 'REMAINING TUITION FEE']);
  assert.deepStrictEqual(wb.sheets[0].rows[0], { _id: 'r1', 'RECEIVING PARTNER': 'X', 'REMAINING TUITION FEE': '10' });
});

test('migrateWorkbook upgrades the legacy single-sheet shape and adds row ids', () => {
  const wb = migrateWorkbook({ columns: ['A'], rows: [{ A: '1' }] });
  assert.strictEqual(wb.revision, 0);
  assert.strictEqual(wb.sheets.length, 1);
  assert.ok(wb.sheets[0].rows[0]._id);
});

test('edits to different cells of the same row are both kept', () => {
  const base = workbook([{ _id: 'r1', 'FIRST NAME': 'Ana', 'APPLICATION STATUS': 'Inquiry' }]);
  const theirs = clone(base); theirs.sheets[0].rows[0]['FIRST NAME'] = 'Anna';
  const mine = clone(base); mine.sheets[0].rows[0]['APPLICATION STATUS'] = 'Visa Issued';
  const merged = mergeWorkbooks(base, theirs, mine);
  assert.deepStrictEqual(merged.sheets[0].rows[0], { _id: 'r1', 'FIRST NAME': 'Anna', 'APPLICATION STATUS': 'Visa Issued' });
});

test('the same cell edited on both sides takes this save\'s value', () => {
  const base = workbook([{ _id: 'r1', 'FIRST NAME': 'Ana' }]);
  const theirs = clone(base); theirs.sheets[0].rows[0]['FIRST NAME'] = 'Anna';
  const mine = clone(base); mine.sheets[0].rows[0]['FIRST NAME'] = 'Annie';
  assert.strictEqual(mergeWorkbooks(base, theirs, mine).sheets[0].rows[0]['FIRST NAME'], 'Annie');
});

test('rows added on both sides are all kept, in place', () => {
  const base = workbook([{ _id: 'r1' }, { _id: 'r2' }]);
  const theirs = clone(base); theirs.sheets[0].rows.splice(1, 0, { _id: 't1' });
  const mine = clone(base); mine.sheets[0].rows.push({ _id: 'm1' });
  const ids = mergeWorkbooks(base, theirs, mine).sheets[0].rows.map((r) => r._id);
  assert.deepStrictEqual(ids, ['r1', 't1', 'r2', 'm1']);
});

test('a row deleted on one side stays deleted, unless the other side edited it', () => {
  const base = workbook([{ _id: 'r1', 'FIRST NAME': 'A' }, { _id: 'r2', 'FIRST NAME': 'B' }]);
  const theirs = clone(base);
  theirs.sheets[0].rows = theirs.sheets[0].rows.filter((r) => r._id !== 'r1');
  theirs.sheets[0].rows.find((r) => r._id === 'r2')['FIRST NAME'] = 'Bee';
  const mine = clone(base);
  mine.sheets[0].rows = mine.sheets[0].rows.filter((r) => r._id !== 'r2');
  const rows = mergeWorkbooks(base, theirs, mine).sheets[0].rows;
  assert.deepStrictEqual(rows, [{ _id: 'r2', 'FIRST NAME': 'Bee' }]);
});

test('sheets added on both sides are both kept; a renamed sheet keeps its new name', () => {
  const base = workbook([]);
  const theirs = clone(base); theirs.sheets.push({ id: 's2', name: 'Feb', columns: [], rows: [] });
  const mine = clone(base); mine.sheets[0].name = 'January'; mine.sheets.push({ id: 's3', name: 'Mar', columns: [], rows: [] });
  const merged = mergeWorkbooks(base, theirs, mine);
  assert.deepStrictEqual(merged.sheets.map((s) => s.name), ['January', 'Feb', 'Mar']);
});

test('mergeOrder follows whichever side reordered', () => {
  const keep = new Set(['a', 'b', 'c']);
  assert.deepStrictEqual(mergeOrder(['a', 'b', 'c'], ['a', 'b', 'c'], ['c', 'b', 'a'], keep), ['c', 'b', 'a']);
  assert.deepStrictEqual(mergeOrder(['a', 'b', 'c'], ['b', 'a', 'c'], ['a', 'b', 'c'], keep), ['b', 'a', 'c']);
});

test('history keeps only the most recent revisions', () => {
  const h = createHistory(2);
  [1, 2, 3].forEach((revision) => h.remember({ revision, sheets: [] }));
  assert.strictEqual(h.get(1), null);
  assert.strictEqual(h.get(3).revision, 3);
});

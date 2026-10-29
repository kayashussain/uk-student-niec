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
  assert.deepStrictEqual(wb.sheets[0].columns, ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE', 'RECEIVING PARTNER', 'REMAINING TUITION FEE']);
  assert.deepStrictEqual(wb.sheets[0].rows[0], { _id: 'r1', 'RECEIVING PARTNER': 'X', 'REMAINING TUITION FEE': '10' });
});

test('migrateWorkbook puts REMARKS, STUDENT SOURCE, APPLICATION STATUS first, once', () => {
  const input = { sheets: [{ id: 's1', name: 'A', columns: ['APPLICATION STATUS', 'EMAIL', 'COURSE NAME'], rows: [] }], activeSheetId: 's1' };
  const wb = migrateWorkbook(input);
  assert.deepStrictEqual(wb.sheets[0].columns, ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE', 'EMAIL', 'COURSE NAME']);
  wb.sheets[0].columns.reverse(); // a manual reorder afterwards is left alone
  const again = migrateWorkbook(wb);
  assert.deepStrictEqual(again.sheets[0].columns, ['COURSE NAME', 'EMAIL', 'OFFER RECEIVED DATE', 'APPLICATION SUBMISSION DATE', 'APPLICATION STATUS', 'STUDENT SOURCE', 'REMARKS']);
});

test('migrateWorkbook adds the application submission and offer received dates after APPLICATION STATUS', () => {
  const wb = migrateWorkbook({
    sheets: [{ id: 's1', name: 'A', leadColumnsApplied: true, columns: ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'FIRST NAME'], rows: [] }],
    activeSheetId: 's1',
  });
  assert.deepStrictEqual(wb.sheets[0].columns, ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE', 'FIRST NAME']);
});

test('migrateWorkbook puts Student ID, NOC, the mock interviews, Pre-CAS Interview and Medical Report after the language test, once', () => {
  const columns = ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE',
    'LANGUAGE TEST DATE', 'STUDENT ID', 'GROSS FEE', 'SCHOLARSHIP', 'FEE AFTER SCHOLARSHIP', 'REMAINING TUITION FEE',
    'PRE CAS INTERVIEW', 'NOC', 'NOC NUMBER', 'MEDICAL REPORT', 'PAYMENT DATE'];
  const wb = migrateWorkbook({ sheets: [{ id: 's1', name: 'A', leadColumnsApplied: true, columns, rows: [] }], activeSheetId: 's1' });
  assert.deepStrictEqual(wb.sheets[0].columns.slice(5), ['LANGUAGE TEST DATE', 'STUDENT ID', 'NOC', 'NOC NUMBER',
    'MOCK SCHEDULE 1', 'FEEDBACK 1', 'MOCK SCHEDULE 2', 'FEEDBACK 2',
    'MOCK SCHEDULE 3', 'FEEDBACK 3', 'MOCK SCHEDULE 4', 'FEEDBACK 4', 'PRE CAS INTERVIEW',
    'MEDICAL REPORT', 'GROSS FEE', 'SCHOLARSHIP', 'FEE AFTER SCHOLARSHIP', 'REMAINING TUITION FEE', 'PAYMENT DATE']);
  wb.sheets[0].columns.reverse(); // a manual reorder afterwards is left alone
  const reordered = [...wb.sheets[0].columns];
  assert.deepStrictEqual(migrateWorkbook(wb).sheets[0].columns, reordered);
});

test('migrateWorkbook adds a Feedback column after each existing Mock Schedule column', () => {
  const wb = migrateWorkbook({
    sheets: [{ id: 's1', name: 'A', leadColumnsApplied: true, columnOrderVersion: 2, rows: [],
      columns: ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE',
        'PRE CAS INTERVIEW', 'MOCK SCHEDULE 1', 'MOCK SCHEDULE 2', 'MOCK SCHEDULE 3', 'MOCK SCHEDULE 4', 'NOC'] }],
    activeSheetId: 's1',
  });
  assert.deepStrictEqual(wb.sheets[0].columns.slice(5), ['PRE CAS INTERVIEW', 'MOCK SCHEDULE 1', 'FEEDBACK 1', 'MOCK SCHEDULE 2',
    'FEEDBACK 2', 'MOCK SCHEDULE 3', 'FEEDBACK 3', 'MOCK SCHEDULE 4', 'FEEDBACK 4', 'NOC']);
});

test('migrateWorkbook moves a sheet saved in the previous order (Pre-CAS Interview before the mocks) once', () => {
  const columns = ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE',
    'LANGUAGE TEST DATE', 'STUDENT ID', 'PRE CAS INTERVIEW', 'MOCK SCHEDULE 1', 'FEEDBACK 1', 'MOCK SCHEDULE 2', 'FEEDBACK 2',
    'MOCK SCHEDULE 3', 'FEEDBACK 3', 'MOCK SCHEDULE 4', 'FEEDBACK 4', 'NOC', 'NOC NUMBER', 'MEDICAL REPORT', 'GROSS FEE'];
  const rows = [{ _id: 'r1', NOC: 'Submitted', 'FEEDBACK 2': 'Good' }];
  const wb = migrateWorkbook({
    sheets: [{ id: 's1', name: 'A', leadColumnsApplied: true, precasColumnsApplied: true, columns, rows }], activeSheetId: 's1',
  });
  assert.deepStrictEqual(wb.sheets[0].columns.slice(5), ['LANGUAGE TEST DATE', 'STUDENT ID', 'NOC', 'NOC NUMBER',
    'MOCK SCHEDULE 1', 'FEEDBACK 1', 'MOCK SCHEDULE 2', 'FEEDBACK 2', 'MOCK SCHEDULE 3', 'FEEDBACK 3',
    'MOCK SCHEDULE 4', 'FEEDBACK 4', 'PRE CAS INTERVIEW', 'MEDICAL REPORT', 'GROSS FEE']);
  assert.deepStrictEqual(wb.sheets[0].rows, [{ _id: 'r1', NOC: 'Submitted', 'FEEDBACK 2': 'Good' }]); // data untouched
  assert.strictEqual(wb.sheets[0].columnOrderVersion, 2);
  assert.strictEqual('precasColumnsApplied' in wb.sheets[0], false);
});

test('migrateWorkbook adds missing mock columns in front of Pre-CAS Interview', () => {
  const wb = migrateWorkbook({
    sheets: [{ id: 's1', name: 'A', leadColumnsApplied: true, columnOrderVersion: 2, rows: [],
      columns: ['REMARKS', 'STUDENT SOURCE', 'APPLICATION STATUS', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE',
        'NOC NUMBER', 'PRE CAS INTERVIEW', 'MEDICAL REPORT'] }],
    activeSheetId: 's1',
  });
  assert.deepStrictEqual(wb.sheets[0].columns.slice(5), ['NOC NUMBER', 'MOCK SCHEDULE 1', 'FEEDBACK 1', 'MOCK SCHEDULE 2',
    'FEEDBACK 2', 'MOCK SCHEDULE 3', 'FEEDBACK 3', 'MOCK SCHEDULE 4', 'FEEDBACK 4', 'PRE CAS INTERVIEW', 'MEDICAL REPORT']);
});

test('migrateWorkbook keeps a new sheet in the default column order', () => {
  const { DEFAULT_COLUMNS } = require('../student-details/workbook');
  const wb = migrateWorkbook({ sheets: [{ id: 's1', name: 'A', columns: [...DEFAULT_COLUMNS], rows: [] }], activeSheetId: 's1' });
  assert.deepStrictEqual(wb.sheets[0].columns, DEFAULT_COLUMNS);
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

test('describeChanges lists cell edits, added and removed students, and sheet changes', () => {
  const { describeChanges } = require('../student-details/workbook');
  const before = { sheets: [
    { id: 's1', name: 'Jan 2026', columns: [], rows: [{ _id: 'a', 'FIRST NAME': 'Ram', STATUS: 'Inquiry' }, { _id: 'b', 'FIRST NAME': 'Sita', 'LAST NAME': 'Rai' }] },
    { id: 's2', name: 'Sep 2026', columns: [], rows: [] },
  ] };
  const after = { sheets: [
    { id: 's1', name: 'Jan 2026', columns: [], rows: [{ _id: 'a', 'FIRST NAME': 'Ram', STATUS: 'CAS Issued', _deferredInto: 'x' }, { _id: 'c', 'FIRST NAME': '' }] },
    { id: 's2', name: 'Sep Intake 2026', columns: [], rows: [], hidden: true },
  ] };
  assert.deepStrictEqual(describeChanges(before, after), [
    'Jan 2026 › Ram › STATUS: "Inquiry" → "CAS Issued"',
    'Jan 2026: added a student with no name',
    'Jan 2026: removed Sita Rai',
    'Renamed sheet "Sep 2026" to "Sep Intake 2026"',
    'Hid sheet "Sep Intake 2026"',
  ]);
  assert.deepStrictEqual(describeChanges(after, after), []);
});

test('history keeps recent revisions but never more than its memory budget', () => {
  const { createHistory } = require('../student-details/workbook');
  const wb = (revision) => ({ revision, sheets: [], pad: 'x'.repeat(1000) });
  const small = createHistory(3);
  [1, 2, 3, 4, 5].forEach((r) => small.remember(wb(r)));
  assert.strictEqual(small.get(1), null);
  assert.strictEqual(small.get(2), null);
  assert.strictEqual(small.get(3).revision, 3);
  assert.strictEqual(small.get(5).revision, 5);
  // each version is about 1 KB; a 3 KB budget keeps the newest two at least, and no more than fit
  const tight = createHistory(30, 3000);
  [1, 2, 3, 4, 5, 6].forEach((r) => tight.remember(wb(r)));
  assert.ok(tight.get(6) && tight.get(5), 'the newest two are always kept');
  assert.strictEqual(tight.get(1), null);
  assert.strictEqual(tight.get(2), null);
  // remembering a revision again replaces it instead of counting it twice
  const again = createHistory(30, 2500);
  again.remember(wb(1)); again.remember(wb(1)); again.remember(wb(1));
  assert.ok(again.get(1));
});

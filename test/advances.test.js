const test = require('node:test');
const assert = require('node:assert');
const { advancesByName, setAdvance } = require('../counselor-incentive/advances');

const sheets = [{ id: 'sheet-a', name: 'Jan Intake 2027' }, { id: 'sheet-b', name: 'Sep Intake 2026' }];

test('advances are shown under the current sheet names', () => {
  const stored = { 'sheet-a': { previousAdvance: 5000 } };
  assert.deepStrictEqual(advancesByName(stored, sheets), { 'Jan Intake 2027': { previousAdvance: 5000 } });
});

test('a renamed sheet keeps its advance', () => {
  const stored = setAdvance({}, sheets, 'Jan Intake 2027', { previousAdvance: 5000 });
  const renamed = [{ id: 'sheet-a', name: 'January 2027' }, sheets[1]];
  assert.deepStrictEqual(advancesByName(stored, renamed), { 'January 2027': { previousAdvance: 5000 } });
});

test('advances saved by name before the change are still found, and move to the id on save', () => {
  const legacy = { 'Sep Intake 2026': { previousAdvance: 1200 } };
  assert.deepStrictEqual(advancesByName(legacy, sheets), { 'Sep Intake 2026': { previousAdvance: 1200 } });
  const next = setAdvance(legacy, sheets, 'Sep Intake 2026', { previousAdvance: 1500 });
  assert.deepStrictEqual(next, { 'sheet-b': { previousAdvance: 1500 } });
});

test('an intake name no sheet has is kept under the name', () => {
  assert.deepStrictEqual(setAdvance({}, sheets, 'Old Name', { previousAdvance: 1 }), { 'Old Name': { previousAdvance: 1 } });
});

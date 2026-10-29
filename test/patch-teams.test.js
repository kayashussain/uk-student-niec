const test = require('node:test');
const assert = require('node:assert');
const { snapshot, diff, makePatch, applyPatch, isEmpty, advance } = require('../shared/patch');
const { viewFor, teamChanges, checkMove, statusChoices, canEdit, seesRow } = require('../shared/teams');

const clone = (x) => JSON.parse(JSON.stringify(x));
const S = 'APPLICATION STATUS';
const book = () => ({
  revision: 4,
  activeSheetId: 'a',
  sheets: [
    { id: 'a', name: 'Jan', columns: ['FIRST NAME', S], rows: [
      { _id: 'r1', 'FIRST NAME': 'Ram', [S]: 'Application Stage' },
      { _id: 'r2', 'FIRST NAME': 'Sita', [S]: 'Mock Stage' },
      { _id: 'r3', 'FIRST NAME': 'Hari', [S]: 'Inquiry' },
    ] },
    { id: 'b', name: 'Sep', hidden: true, columns: ['FIRST NAME', S], rows: [{ _id: 'r4', 'FIRST NAME': 'Gita', [S]: 'Application Stage' }] },
  ],
});

test('a one-cell edit becomes a patch with just that row, and applying it rebuilds the workbook', () => {
  const base = book();
  const next = clone(base);
  next.sheets[0].rows[1].REMARKS = 'called';
  const patch = makePatch(base, next);
  assert.deepStrictEqual(patch.sheets, [{ id: 'a', rows: [next.sheets[0].rows[1]] }]);
  assert.ok(JSON.stringify(patch).length < 200);
  assert.deepStrictEqual(applyPatch(base, patch), next);
});

test('patches carry added, removed and reordered rows, new sheets and sheet settings', () => {
  const base = book();
  const next = clone(base);
  next.sheets[0].rows.reverse();
  next.sheets[0].rows.splice(1, 1);
  next.sheets[0].rows.push({ _id: 'r9', 'FIRST NAME': 'New' });
  next.sheets[1].name = 'Sep 2026';
  next.sheets.push({ id: 'c', name: 'Jan 2027', columns: [], rows: [{ _id: 'x', 'FIRST NAME': 'Z' }] });
  assert.deepStrictEqual(applyPatch(base, makePatch(base, next)), next);
  const removed = clone(base);
  removed.sheets.pop();
  assert.deepStrictEqual(applyPatch(base, makePatch(base, removed)), removed);
});

test('no change makes an empty patch; duplicate or missing row ids make no patch at all', () => {
  const base = book();
  assert.ok(isEmpty(makePatch(base, clone(base)), base));
  const dup = clone(base);
  dup.sheets[0].rows[1]._id = 'r1';
  assert.strictEqual(makePatch(base, dup), null);
  assert.strictEqual(diff(snapshot(base), dup).patch, null);
});

test('a patch that does not fit the base is refused', () => {
  const base = book();
  assert.throws(() => applyPatch(base, { sheetOrder: ['a', 'zzz'], sheets: [] }));
  assert.throws(() => applyPatch(base, { sheetOrder: ['a', 'b'], sheets: [{ id: 'a', rowOrder: ['r1', 'nope'] }] }));
});

test('advance tracks what the server has after a patch', () => {
  const base = book();
  const next = clone(base);
  next.sheets[0].rows[0]['FIRST NAME'] = 'Ramesh';
  const patch = makePatch(base, next);
  const snap = advance(snapshot(base), patch);
  assert.deepStrictEqual(snap, snapshot(next));
});

test('each team sees only its students and no hidden sheets; Admin sees everything', () => {
  const base = book();
  assert.strictEqual(viewFor('admin', base), base);
  const app = viewFor('application', base);
  assert.deepStrictEqual(app.sheets.map((s) => s.id), ['a']);
  assert.deepStrictEqual(app.sheets[0].rows.map((r) => r._id), ['r1']);
  assert.deepStrictEqual(viewFor('mock', base).sheets[0].rows.map((r) => r._id), ['r2']);
  assert.deepStrictEqual(viewFor('followup', base).sheets[0].rows.map((r) => r._id), ['r3']);
  assert.ok(seesRow('followup', { [S]: 'Defer' }) && !seesRow('followup', { [S]: 'Withdrawn' }));
});

test('teams edit only their own columns and make only their own moves', () => {
  assert.ok(canEdit('application', 'NOC NUMBER') && !canEdit('application', 'MOCK SCHEDULE 1'));
  assert.ok(canEdit('mock', 'PRE CAS INTERVIEW') && !canEdit('mock', 'STUDENT ID'));
  assert.ok(canEdit('followup', 'REMARKS') && !canEdit('followup', 'FIRST NAME'));
  assert.ok(canEdit('admin', 'ANYTHING'));
  assert.deepStrictEqual(statusChoices('application', 'Application Stage', []), ['Application Stage', 'Mock Stage']);
  assert.deepStrictEqual(statusChoices('followup', 'Inquiry', []), ['Inquiry']);
});

test('Application → Mock warns about blank details; Mock → Payment is refused until the mocks are filled', () => {
  const warn = checkMove('application', { [S]: 'Application Stage', 'STUDENT ID': '' }, 'Mock Stage');
  assert.ok(warn.ok && /Student ID/.test(warn.confirm));
  const blocked = checkMove('mock', { [S]: 'Mock Stage', 'MOCK SCHEDULE 1': '2026-01-01' }, 'Payment Stage');
  assert.ok(!blocked.ok && /Mock Schedule 4/.test(blocked.message) && /Pre-CAS Interview/.test(blocked.message));
  const full = { [S]: 'Mock Stage', 'PRE CAS INTERVIEW': 'Passed' };
  [1, 2, 3, 4].forEach((n) => { full[`MOCK SCHEDULE ${n}`] = 'x'; full[`FEEDBACK ${n}`] = 'y'; });
  assert.ok(checkMove('mock', full, 'Payment Stage').ok);
  assert.ok(!checkMove('followup', { [S]: 'Inquiry' }, 'Application Stage').ok);
});

test('a team save is checked cell by cell', () => {
  const base = viewFor('application', book());
  const mine = clone(base);
  mine.sheets[0].rows[0]['NOC NUMBER'] = 'N-1';
  mine.sheets[0].rows[0]['FEE AFTER SCHOLARSHIP'] = '1.00'; // recalculated by the page: ignored
  let out = teamChanges('application', base, mine, ['FEE AFTER SCHOLARSHIP']);
  assert.deepStrictEqual(out, { changes: [{ sheetId: 'a', rowId: 'r1', col: 'NOC NUMBER', value: 'N-1' }], adds: [], errors: [] });

  const sneaky = clone(base);
  sneaky.sheets[0].rows[0]['GROSS FEE'] = '1';
  sneaky.sheets[0].rows[0][S] = 'Visa Issued';
  out = teamChanges('application', base, sneaky);
  assert.strictEqual(out.errors.length, 2);

  const deleted = clone(base);
  deleted.sheets[0].rows = [];
  assert.ok(teamChanges('application', base, deleted).errors.some((e) => /delete students/.test(e)));
  const added = clone(base);
  added.sheets[0].rows.push({ _id: 'n', 'FIRST NAME': 'x' }); // a new student: allowed (see below)
  assert.deepStrictEqual(teamChanges('application', base, added).adds.map((a) => a.row[S]), ['Application Stage']);
});

test('a team save moving a student on is checked from the status it had before', () => {
  const base = viewFor('application', book());
  const mine = clone(base);
  mine.sheets[0].rows[0][S] = 'Mock Stage';
  assert.deepStrictEqual(teamChanges('application', base, mine).errors, []);
  const mockBase = viewFor('mock', book());
  const early = clone(mockBase);
  early.sheets[0].rows[0][S] = 'Payment Stage'; // mocks not filled: refused even if the page is bypassed
  assert.ok(teamChanges('mock', mockBase, early).errors.some((e) => /can't go to Payment Stage/.test(e)));
});

test('a team can add a student at its own stage, and fill in the basics of students it added', () => {
  const base = viewFor('followup', book());
  const mine = clone(base);
  mine.sheets[0].rows.push({ _id: 'n1', [S]: '', 'FIRST NAME': 'Nabin', 'CONTACT NUMBER': '98000', REMARKS: 'walk-in', 'FEE AFTER SCHOLARSHIP': '' });
  const out = teamChanges('followup', base, mine, ['FEE AFTER SCHOLARSHIP']);
  assert.deepStrictEqual(out.errors, []);
  assert.deepStrictEqual(out.adds, [{ sheetId: 'a', row: {
    _id: 'n1', [S]: 'Inquiry', _addedByTeam: 'followup', 'FIRST NAME': 'Nabin', 'CONTACT NUMBER': '98000', REMARKS: 'walk-in',
  } }]);
  // Later: the team may fix the name of a student it added, but not of one it didn't.
  const own = { _id: 'n1', [S]: 'Inquiry', _addedByTeam: 'followup', 'FIRST NAME': 'Nabin' };
  assert.ok(canEdit('followup', 'FIRST NAME', own));
  assert.ok(!canEdit('followup', 'FIRST NAME', { ...own, _addedByTeam: undefined }));
  assert.ok(!canEdit('followup', 'GROSS FEE', own));
});

test('a team cannot add a student at another stage, with other columns, or claim another\'s student', () => {
  const base = viewFor('application', book());
  const wrongStage = clone(base);
  wrongStage.sheets[0].rows.push({ _id: 'n2', [S]: 'Visa Issued' });
  assert.ok(teamChanges('application', base, wrongStage).errors.some((e) => /starts at Application Stage/.test(e)));
  const extra = clone(base);
  extra.sheets[0].rows.push({ _id: 'n3', [S]: 'Application Stage', 'GROSS FEE': '9' });
  assert.ok(teamChanges('application', base, extra).errors.some((e) => /Gross Fee/.test(e)));
  // Sending `_addedByTeam` on an existing student doesn't unlock it: the server's copy decides.
  const fu = viewFor('followup', book());
  const claim = clone(fu);
  Object.assign(claim.sheets[0].rows[0], { _addedByTeam: 'followup', 'FIRST NAME': 'Changed' });
  assert.ok(teamChanges('followup', fu, claim).errors.some((e) => /First Name/.test(e)));
});

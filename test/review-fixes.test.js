'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readGrade } = require('../student-details/eligibility');
const { placesIn } = require('../student-details/places');
const { migrateWorkbook, isValidWorkbook } = require('../student-details/workbook');
const { createCards } = require('../student-details/cards');
const { eventFor, eventLabel } = require('../student-details/source-options');

test('a typed grade of 65 percent is read as 65, not 6', () => {
  assert.deepStrictEqual(readGrade('65'), { percent: 65 });
  assert.deepStrictEqual(readGrade('65 percent'), { percent: 65 });
  assert.deepStrictEqual(readGrade('2.9 GPA'), { gpa: 2.9 });
});

test('hyphenated place names are found', () => {
  assert.deepStrictEqual(placesIn('Stoke-on-Trent'), placesIn('Stoke on Trent'));
});

test('an older data file with missing ids and empty rows is made whole, not treated as damaged', () => {
  const wb = migrateWorkbook({ revision: 7, sheets: [{ name: 'S', columns: ['NAME'], rows: [null, { _id: 'a', NAME: 'x' }, { _id: 'a', NAME: 'y' }] }] });
  assert.ok(isValidWorkbook(wb));
  assert.strictEqual(wb.revision, 7);
  const ids = wb.sheets[0].rows.map((r) => r._id);
  assert.strictEqual(ids.length, 2);
  assert.strictEqual(new Set(ids).size, 2);
});

test('cards carry on after a damaged cards.json (and keep them next time)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-'));
  const c = createCards(dir, { now: () => new Date('2026-11-11T05:00:00Z') });
  c.addNote('row-a', { text: 'hello' }, 'me');
  c.addNote('row-a', { text: 'again' }, 'me'); // the daily copy is made on the second write
  fs.writeFileSync(path.join(dir, 'cards.json'), '{broken');
  const c2 = createCards(dir, { now: () => new Date('2026-11-11T05:00:00Z') });
  assert.deepStrictEqual(Object.keys(c2.all()), ['row-a']);
  assert.deepStrictEqual(Object.keys(c2.all()), ['row-a']);
});

test('two events with the same name on different days are told apart', () => {
  const events = [{ id: 1, name: 'School visit', date: '2026-10-01' }, { id: 2, name: 'School visit', date: '2026-11-01' }];
  assert.strictEqual(eventFor(events, eventLabel('School visit', '2026-11-01')).id, 2);
  assert.strictEqual(eventFor(events, 'School visit').id, 1);
});

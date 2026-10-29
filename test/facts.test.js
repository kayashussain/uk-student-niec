const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createFacts, STARTER_UNIVERSITIES } = require('../student-details/facts');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-facts-'));

test('the Fact File starts with a list of universities, each with the usual application steps', () => {
  const facts = createFacts(tmp());
  const list = facts.list();
  assert.deepStrictEqual(list.map((u) => u.name), [...STARTER_UNIVERSITIES].sort());
  const uni = facts.get(list[0].id);
  assert.deepStrictEqual(uni.process.slice(0, 3).map((s) => s.title), ['Application submitted', 'Offer letter received', 'Pre-CAS interview']);
});

test('a university page keeps what Admin enters, per intake, and only the known fields as plain text', () => {
  const dir = tmp();
  const facts = createFacts(dir);
  const id = facts.list()[0].id;
  const saved = facts.update(id, {
    name: 'Bangor University', city: 'Bangor', website: 'https://www.bangor.ac.uk', entryRequirements: '- 60% in Class 12\r\n- No more than 2 years gap',
    languageTests: 'IELTS 6.0 overall', courses: 'MBA\nMSc Computing',
    intakes: [
      { name: 'September 2026', requirements: 'Standard', deadline: '31 July' },
      { name: 'January 2027', requirements: 'Needs a Moodle test', courses: 'MBA only' },
      { name: '   ' }, // no name: dropped
    ],
    process: [{ title: 'Application submitted', detail: 'Upload the documents' }, { title: '' }],
    isAdmin: true, __proto__: { evil: 1 }, id: 'ffffffffffff',
  }, 'Kayas');
  assert.ok(!saved.error);
  const u = facts.get(id);
  assert.strictEqual(u.id, id, 'the id cannot be changed');
  assert.strictEqual(u.name, 'Bangor University');
  assert.strictEqual(u.entryRequirements, '- 60% in Class 12\n- No more than 2 years gap');
  assert.deepStrictEqual(u.intakes.map((i) => i.name), ['September 2026', 'January 2027']);
  assert.strictEqual(u.intakes[1].courses, 'MBA only');
  assert.deepStrictEqual(u.process.map((s) => s.title), ['Application submitted']);
  assert.strictEqual(u.updatedBy, 'Kayas');
  assert.strictEqual(u.isAdmin, undefined);
  // it survives a restart
  assert.strictEqual(createFacts(dir).get(id).city, 'Bangor');
});

test('adding and removing universities, with no duplicates', () => {
  const facts = createFacts(tmp());
  const made = facts.create('  University of Essex ', 'Kayas');
  assert.strictEqual(made.university.name, 'University of Essex');
  assert.ok(made.university.process.length > 0);
  assert.ok(facts.create('university of essex', 'x').error);
  assert.ok(facts.create('   ', 'x').error);
  assert.ok(facts.update(facts.list()[0].id, { name: 'University of Essex' }, 'x').error);
  assert.ok(!facts.remove(made.university.id).error);
  assert.strictEqual(facts.get(made.university.id), null);
  assert.ok(facts.remove('nope').error);
});

test('University of West London starts with its fact file details filled in', () => {
  const facts = createFacts(tmp());
  const uwl = facts.get(facts.list().find((u) => u.name === 'University of West London').id);
  assert.deepStrictEqual(uwl.programs.map((p) => p.name), ['UG', 'PG', 'Enhanced Extended PG', 'PG Placement Year']);
  assert.strictEqual(uwl.programs[0].tuition, '£16,750');
  assert.strictEqual(uwl.process.length, 7);
  assert.deepStrictEqual(uwl.intakes.map((i) => i.name), ['February 2027']);
  assert.match(uwl.intakes[0].courses, /BSc Computer Science/);
  // the other starter universities are still just names
  const other = facts.get(facts.list().find((u) => u.name === 'Bangor University').id);
  assert.strictEqual(other.programs.length, 0);
});

test('an existing, still empty UWL page is filled in once; an edited one is left alone', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'fact-file.json'), JSON.stringify({ universities: [
    { id: 'aaaaaaaaaaaa', name: 'University of West London', city: '', intakes: [], process: [{ title: 'Application submitted', detail: '' }, { title: 'Offer letter received', detail: '' }, { title: 'Pre-CAS interview', detail: '' }, { title: 'Tuition deposit paid', detail: '' }, { title: 'CAS issued', detail: '' }, { title: 'Visa application', detail: '' }], updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: '' },
    { id: 'bbbbbbbbbbbb', name: 'Bangor University', city: 'Bangor', intakes: [], process: [], updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'Kayas' },
  ] }));
  const facts = createFacts(dir);
  assert.strictEqual(facts.get('aaaaaaaaaaaa').programs.length, 4);
  assert.strictEqual(facts.get('bbbbbbbbbbbb').programs.length, 0);
  // Admin edits it afterwards: a later load keeps their version
  facts.update('aaaaaaaaaaaa', { name: 'University of West London', overview: 'Edited', programs: [] }, 'Kayas');
  assert.strictEqual(createFacts(dir).get('aaaaaaaaaaaa').overview, 'Edited');
  assert.strictEqual(createFacts(dir).get('aaaaaaaaaaaa').programs.length, 0);
});

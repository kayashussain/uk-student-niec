const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { mergeEntry, newReport, courseKey, numbersIn, unifyCourses, dedupeCourses } = require('../student-details/fact-merge');
const { createFacts, clean } = require('../student-details/facts');

const page = () => ({
  name: 'Test University', notes: '', courses: '',
  programs: [{ name: 'Undergraduate', duration: '', academic: '12th Grade: GPA 2.75\n- Gap: up to 2 years', english: 'IELTS: 6.0 overall / 5.5 in each band', tuition: '£17,628', scholarship: '', deposit: '£10,500 CAS deposit' }],
  intakes: [{ name: 'January 2027', deadline: '', requirements: '', courses: '## Undergraduate\nBSc (Hons) Accounting', notes: '' }],
});

test('courses and numbers are compared by what they say, not how they are written', () => {
  assert.strictEqual(courseKey('Accounting & Finance BA (Hons)'), courseKey('BA (Hons) Accounting and Finance'));
  assert.notStrictEqual(courseKey('MSc Project Management'), courseKey('MSc Project Management with Industry Year'));
  assert.deepStrictEqual([...numbersIn('IELTS 6 and PTE 59, fees £16,950, 5 Years, 1st year')].sort(), ['16950', '59', '6']);
  assert.ok(numbersIn('6.0').has('6') && numbersIn('6').has('6'));
});

test('merging fills what is empty and never overwrites what is there', () => {
  const p = page();
  const before = JSON.stringify(p.programs[0]);
  const report = mergeEntry(p, { programs: [{ name: 'Undergraduate', academic: 'Grade 12, GPA 3.5 or above', english: 'IELTS: 6.0 overall / 5.5 in each band', gap: 'Up to 4 Years', refusal: 'Not accepted', tuition: '£17,628', scholarship: 'GPA 3.0 and above: £4,000', deposit: '£10,500 CAS deposit' }] }, newReport());
  const u = p.programs[0];
  assert.ok(u.academic.startsWith('12th Grade: GPA 2.75'), 'the page keeps its own academic text');
  assert.strictEqual(u.scholarship, 'GPA 3.0 and above: £4,000', 'an empty field is filled');
  assert.match(u.academic, /Previous UK visa refusal: Not accepted/, 'a missing fact (the refusal rule) is added');
  assert.doesNotMatch(u.academic, /Gap: Up to 4/, 'the gap was already there, so it is not added a second way');
  assert.ok(report.conflicts.some((c) => c.field === 'gap'), 'a different number for the same fact is reported, not written');
  assert.strictEqual(u.tuition, '£17,628');
  assert.notStrictEqual(JSON.stringify(u), before);
});

test('the same facts merged twice are added once', () => {
  const entry = { programs: [{ name: 'Postgraduate', academic: '55% bachelors', english: 'IELTS 6.5', gap: '5 years', refusal: 'Not accepted', tuition: '£18,980', scholarship: '£2,500', deposit: '£8,000' }],
    intakes: { 'January 2027': { deadline: 'Standard CAS request by 4 Dec 2026', keyDates: ['Postgraduate: starts 18 Jan 2027, latest enrolment 28 Jan 2027'] } },
    courses: [{ intake: 'January 2027', heading: 'Postgraduate', course: 'MSc Cyber Security' }, { intake: 'January 2027', heading: 'Postgraduate', course: 'Cyber Security MSc (Hons)' }],
    notes: ['English waiver: B in 12th English'] };
  const p = page();
  mergeEntry(p, entry, newReport());
  const once = JSON.stringify(p);
  const again = mergeEntry(p, entry, newReport());
  assert.strictEqual(JSON.stringify(p), once, 'a second merge changes nothing');
  assert.deepStrictEqual([again.added.length, again.addedPrograms.length], [0, 0]);
  assert.strictEqual(p.programs.length, 2, 'the new level was added as a row');
  assert.strictEqual((p.intakes[0].courses.match(/Cyber Security/g) || []).length, 1, 'one course, worded two ways, is listed once');
  assert.match(p.intakes[0].notes, /Key dates and CAS deadlines/);
  assert.strictEqual(p.intakes[0].deadline, 'Standard CAS request by 4 Dec 2026');
});

test('a combined row (a pathway undergraduate row) receives each stage with its stage named', () => {
  const p = { name: 'College', notes: '', courses: '', intakes: [], programs: [{ name: 'Undergraduate', academic: 'HSC 50%', english: 'IELTS 5.5', tuition: '£17,000', scholarship: '£5,000', deposit: '' }] };
  mergeEntry(p, { programs: [{ name: 'International Year One', academic: 'HSC 55%', english: 'IELTS 5.5', tuition: '£17,000', scholarship: '£5,000', deposit: '£4,500 and full fees after visa' }] }, newReport());
  assert.strictEqual(p.programs.length, 1, 'no second undergraduate row');
  assert.match(p.programs[0].deposit, /International Year One: £4,500/);
  assert.match(p.programs[0].academic, /International Year One: HSC 55%/);
});

test('one course list per page: intake lists are joined and a course in one intake only says so', () => {
  const p = { name: 'UWL', courses: '', programs: [], intakes: [
    { name: 'February 2027', courses: '## Undergraduate\nBA Business Studies\nBSc Nutrition and Food Management with Placement\n## Enhanced Extended\nMSc Cyber Security' },
    { name: 'January 2027', courses: '## Undergraduate - London\nBA (Hons) Business Studies\n## ENHANCED EXTENDED MASTERS - London\nEnhanced Extended MSc Cyber Security\nEnhanced Extended MA International Tourism and Aviation\nManagement Enhanced Extended MSc Digital Marketing' },
  ] };
  unifyCourses(p);
  assert.strictEqual((p.courses.match(/Business Studies/g) || []).length, 1);
  assert.strictEqual((p.courses.match(/Cyber Security/g) || []).length, 1, 'the level word does not make it a different course');
  assert.match(p.courses, /Nutrition and Food Management with Placement \(February 2027 intake only\)/);
  assert.match(p.courses, /Digital Marketing/);
  assert.doesNotMatch(p.courses, /Aviation\nManagement Enhanced/, 'a name that wrapped in the source is put back together');
  assert.deepStrictEqual(p.intakes.map((i) => i.courses), ['', '']);
  const d = dedupeCourses({ courses: '', intakes: [{ name: 'a', courses: '## X\nMSc A\nMSc A\n## Y\nMSc A' }] });
  assert.strictEqual(d.intakes[0].courses, '## X\nMSc A\n## Y\nMSc A', 'twice under one heading is once; under two stages stays');
});

test('the Fact File starts with the OIEG universities, one page each, nothing repeated, and within the page limits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-oieg-'));
  const facts = createFacts(dir);
  const names = facts.list().map((u) => u.name);
  assert.ok(names.includes('Lincoln Bishop University') && names.includes('Sheffield Hallam University'), 'the new universities are added');
  assert.strictEqual(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'no university twice');
  const uwl = facts.get(facts.list().find((u) => u.name === 'University of West London').id);
  assert.deepStrictEqual(uwl.programs.map((p) => p.name), ['UG', 'PG', 'Enhanced Extended PG', 'PG Placement Year', 'Extended Nursing Studies - Top Up']);
  assert.ok(uwl.intakes.every((i) => !i.requirements && !i.courses), 'the intakes do not repeat the requirements or the course lists');
  assert.match(uwl.courses, /intake only\)/);
  assert.match(uwl.programs[0].academic, /GAP: 2023 onwards/, 'a fact only the January sheet had is in the table');
  const lincoln = facts.get(facts.list().find((u) => u.name === 'Lincoln Bishop University').id);
  assert.deepStrictEqual(lincoln.programs.map((p) => p.name).sort(), ['Postgraduate', 'Undergraduate']);
  assert.match(lincoln.intakes[0].notes, /CAS deadlines/);
  facts.all().forEach((u) => {
    assert.ok(u.programs.length <= 12, u.name);
    [u.courses, u.notes, ...u.intakes.flatMap((i) => [i.courses, i.notes, i.requirements])].forEach((t) => assert.ok(t.length <= 12000, `${u.name} text too long`));
    assert.deepStrictEqual(clean(u, u).programs.length, u.programs.length, `${u.name}: nothing is lost when the page is saved`);
  });
});

test('a page an Admin already edited keeps their text; the new facts are added to it once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-oieg-edit-'));
  createFacts(dir).list(); // builds the starting file
  const file = path.join(dir, 'fact-file.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete data.oiegApplied;
  const target = data.universities.find((u) => u.name === 'University of Roehampton');
  target.updatedBy = 'owner';
  target.programs[0].academic = 'MY OWN WORDING: 12th Grade 2.75 GPA';
  target.programs = target.programs.filter((p) => !/Business and Management/.test(p.name)); // as if the Admin had never had this row
  fs.writeFileSync(file, JSON.stringify(data));
  const facts = createFacts(dir);
  const page = facts.get(target.id);
  assert.strictEqual(page.programs[0].academic.split('\n')[0], 'MY OWN WORDING: 12th Grade 2.75 GPA', 'the Admin\'s wording is never overwritten');
  assert.ok(page.programs.some((p) => /Business and Management/.test(p.name)), 'the missing row was added');
  const again = createFacts(dir).get(target.id);
  assert.strictEqual(again.programs.length, page.programs.length, 'and only once');
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).oiegApplied, true);
});

test('loading the Fact File again changes nothing: the file is not rewritten and no id changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-oieg-stable-'));
  createFacts(dir).list();
  const file = path.join(dir, 'fact-file.json');
  const first = fs.readFileSync(file, 'utf8');
  createFacts(dir).list();
  createFacts(dir).all();
  assert.strictEqual(fs.readFileSync(file, 'utf8'), first, 'a second and third load leave the file exactly as it was');
});

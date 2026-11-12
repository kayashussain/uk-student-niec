// The portal around the sheet: student cards, message templates and sending, university options from the Fact File,
// the option finder, B2B partners, the management records and the Dashboard's decision figures.
// The stores and the figures are tested on their own; the access rules are tested through the real server.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createCards, cleanProfile } = require('../student-details/cards');
const Fields = require('../student-details/card-fields');
const Messages = require('../student-details/messages');
const { buildIndex, searchCourses, pickLine, levelOf, parseCourses, createCourseLinks } = require('../student-details/course-index');
const { createPlanning } = require('../student-details/planning');
const { createB2b } = require('../student-details/b2b');
const { createFacts } = require('../student-details/facts');
const { createFinder, feeFloor } = require('../student-details/finder');
const E = require('../student-details/eligibility');
const { buildInsights, intakeSeason, workBack, NONE } = require('../student-details/insights-engine');
const { buildDemo } = require('../scripts/demo-data');
const { buildMessage } = require('../shared/mailer');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'niec-portal-'));

// ---- the student card store ----

test('a card keeps only known details, a dropdown only one of its choices, and a real date', () => {
  const p = cleanProfile({ sourceDetail: ' TikTok ', studyLevel: 'Postgraduate', inquiryDate: '2026-02-30', gapYears: '2', counselor: 'Asha', leadQuality: 'Hot', hacked: 'x', lostReason: 'Visa refused' });
  assert.deepStrictEqual(p, { sourceDetail: 'TikTok', studyLevel: 'Postgraduate', gapYears: '2', lostReason: 'Visa refused' }, 'the removed details (counselor, how promising) are no longer kept');
  assert.strictEqual(cleanProfile({ inquiryDate: '2026-11-05' }).inquiryDate, '2026-11-05');
  // What is not sent keeps its value; an empty text clears it.
  assert.deepStrictEqual(cleanProfile({ location: '' }, { location: 'Manchester', subject: 'Business' }), { subject: 'Business' });
});

test('notes and options are saved on the card and survive a restart', () => {
  const dir = tmp();
  let cards = createCards(dir, { now: () => new Date('2026-11-11T05:00:00Z') });
  assert.deepStrictEqual(cards.get('row-1').notes, []);
  assert.strictEqual(cards.addNote('row-1', { text: '' }, 'Asha').error, 'Please write the note first.');
  const added = cards.addNote('row-1', { text: 'Called, will visit on Sunday.', kind: 'call' }, 'Asha');
  assert.strictEqual(added.note.kind, 'call');
  assert.strictEqual(cards.setFollowUp, undefined, 'follow-ups are gone');
  const option = cards.addOption('row-1', { university: 'University of West London', course: 'MSc Cyber Security', fee: '£17,250', deposit: '£8,000', scholarship: '£3,500', link: 'javascript:alert(1)' }, 'Asha').option;
  assert.strictEqual(option.link, '', 'only a real web address is kept as a link');
  assert.strictEqual(option.deposit, '£8,000');
  assert.ok(cards.addOption('row-1', { university: 'University of West London', course: 'msc cyber security' }, 'Asha').duplicate, 'the same course is listed once');
  cards.updateOption('row-1', option.id, { link: 'https://www.uwl.ac.uk/course/cyber' }, 'Asha');
  // Only the writer (or Admin) removes a note.
  const second = cards.addNote('row-1', { text: 'Documents promised' }, 'Asha');
  assert.ok(cards.removeNote('row-1', added.note.id, 'Bikram').error);
  assert.ok(!cards.removeNote('row-1', second.note.id, 'Bikram', true).error);

  cards = createCards(dir);
  const card = cards.get('row-1');
  assert.strictEqual(card.notes.length, 1);
  assert.strictEqual(card.options[0].link, 'https://www.uwl.ac.uk/course/cyber');
  assert.strictEqual(card.createdBy, 'Asha');
  assert.ok(cards.addNote('../etc', { text: 'x' }, 'A').error, 'a card id is a row id, never a path');
});

test('a damaged cards file is set aside and the cards carry on from the daily copy', () => {
  const dir = tmp();
  const day1 = createCards(dir, { now: () => new Date('2026-11-10T05:00:00Z') });
  day1.addNote('row-1', { text: 'First day' }, 'Asha');
  const day2 = createCards(dir, { now: () => new Date('2026-11-11T05:00:00Z') });
  day2.addNote('row-1', { text: 'Second day' }, 'Asha'); // the first save of the day copies the file as it was
  assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((f) => /^cards-\d{4}-\d{2}-\d{2}\.json$/.test(f)));
  fs.writeFileSync(path.join(dir, 'cards.json'), '{ this is not json');
  const again = createCards(dir);
  assert.strictEqual(again.get('row-1').notes.length, 1, 'the notes of the daily copy are back');
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('cards.damaged-')), 'the damaged file is kept, not overwritten');
});

test('a WhatsApp number gets the Nepal country code unless it has one', () => {
  assert.strictEqual(Fields.whatsappNumber('9801234567'), '9779801234567');
  assert.strictEqual(Fields.whatsappNumber('+977 980-1234567'), '9779801234567');
  assert.strictEqual(Fields.whatsappNumber('+44 7700 900123'), '447700900123');
  assert.strictEqual(Fields.whatsappNumber('call later'), '');
});

// ---- messages ----

test('a template is filled in from the student, and an empty detail is named instead of leaving a hole', () => {
  const row = { 'FIRST NAME': 'Sita', 'LAST NAME': 'Sharma', 'UNIVERSITY NAME': 'Bangor University', 'COURSE NAME': 'MSc Finance', 'APPLICATION SUBMISSION DATE': '11/2/2026' };
  const values = Messages.valuesFor({ row, sheetName: 'Jan Intake 2027', card: { profile: {} }, sender: 'Owner' });
  assert.strictEqual(values.application_date, '2 November 2026', 'a month-first date of the sheet is written out in full');
  const t = Messages.DEFAULTS.find((x) => x.key === 'application_submitted');
  const mail = Messages.renderEmail({ subject: t.subject, body: t.body, values, signature: { name: 'Asha Demo', title: 'Counselor', phone: '+977 1 5550000' } });
  assert.strictEqual(mail.subject, 'Your application to Bangor University has been submitted');
  assert.match(mail.text, /your application for MSc Finance at Bangor University has been submitted on 2 November 2026\./);
  assert.match(mail.text, /Kind regards,\nAsha Demo\nCounselor\nNepal International Educational Consultancy\nPhone: \+977 1 5550000/);
  assert.deepStrictEqual(mail.missing, []);
  assert.match(mail.html, /<li style="margin:4px 0">Keep your phone and email active/);
  const empty = Messages.renderEmail({ subject: t.subject, body: t.body, values: Messages.valuesFor({ row: { 'FIRST NAME': 'Ram' } }), signature: {} });
  assert.deepStrictEqual(empty.missing, ['University name', 'Course name']);
});

test('several university options go into one email as one table, with the documents to send', () => {
  const card = { profile: { studyLevel: 'Postgraduate' } };
  const options = [
    { university: 'University of West London', course: 'MSc Cyber Security', intake: 'January 2027', fee: '£17,250', scholarship: '£3,500', link: 'https://www.uwl.ac.uk/x' },
    { university: 'Ulster University', course: 'MSc Data Science', fee: '', scholarship: '', link: '' },
    { university: 'A <b>bold</b> name', course: 'MBA', fee: '£1', scholarship: '£2', link: '' },
  ];
  const t = Messages.DEFAULTS.find((x) => x.key === 'options');
  const lists = Messages.documentLists(card);
  const mail = Messages.renderEmail({ subject: t.subject, body: t.body, values: Messages.valuesFor({ row: { 'FIRST NAME': 'Sita' }, card }), signature: {}, options, ...lists });
  assert.strictEqual((mail.html.match(/<tr><td valign="top"/g) || []).length, 3, 'one row for each option');
  assert.match(mail.html, /<a href="https:\/\/www\.uwl\.ac\.uk\/x"/);
  assert.match(mail.html, /To be confirmed/);
  assert.ok(!mail.html.includes('<b>bold</b>'), 'what was typed is shown as text, never run as HTML');
  assert.match(mail.text, /1\. University of West London: MSc Cyber Security \(January 2027\)\n {3}Tuition fee: £17,250\n {3}Scholarship: £3,500\n {3}Course page: https:\/\/www\.uwl\.ac\.uk\/x/);
  assert.ok(lists.documents.some((d) => d.startsWith('Bachelor transcript')), 'a postgraduate is asked for the Bachelor documents');
  assert.ok(lists.documents.every((d) => !/CAS|visa application|TB test|bank statement/i.test(d)), 'only the documents to apply, not the CAS or visa ones');
  assert.ok(!Messages.documentLists({ profile: {} }).documents.some((d) => d.startsWith('Bachelor transcript')), 'with no level known, only what every student needs');
  const wa = Messages.renderWhatsApp({ body: t.whatsapp, values: Messages.valuesFor({ row: { 'FIRST NAME': 'Sita' }, sender: 'Asha' }), options, ...lists });
  assert.match(wa.text, /^Namaste Sita, here are your UK university options from NIEC:\n\n1\. University of West London: MSc Cyber Security/);
});

test('Admin edits a template, adds one, and a built-in one can be put back', () => {
  const dir = tmp();
  const m = createMessages(dir);
  assert.ok(m.list().length === 6 && m.list().every((t) => t.builtIn && !t.edited));
  assert.ok(m.saveTemplate('offer_received', { name: 'Offer', subject: 'Your offer', body: 'Dear {first_name},\n\nWell done.', whatsapp: 'Well done {first_name}' }, 'Owner').template);
  assert.strictEqual(m.get('offer_received').subject, 'Your offer');
  assert.ok(m.get('offer_received').edited);
  const own = m.addTemplate({ name: 'Scholarship deadline', subject: 'Deadline', body: 'Dear {first_name}', stages: ['Inquiry'] }, 'Owner').template;
  assert.match(own.key, /^own_/);
  assert.ok(m.addTemplate({ name: 'scholarship deadline', subject: 's', body: 'b' }, 'Owner').error);
  assert.strictEqual(m.removeTemplate('offer_received').reset, true);
  assert.match(createMessages(dir).get('offer_received').subject, /^Good news/);
  m.saveSignature({ name: 'Head of UK Recruitment', phone: '+977 1 5550000', copyToOffice: false });
  assert.strictEqual(createMessages(dir).signature().copyToOffice, false);
  assert.strictEqual(createMessages(dir).signature().company, 'Nepal International Educational Consultancy');
});
const { createMessages } = Messages;

test('a message to a student is a personal letter: no machine-written mark, and the office can get a copy', () => {
  const personal = buildMessage({ from: 'office@example.org', fromName: 'NIEC', to: 'sita@example.com', subject: 'Hello', text: 'Hi', html: '<p>Hi</p>', auto: false });
  assert.ok(!/Auto-Submitted/.test(personal));
  assert.ok(/Auto-Submitted: auto-generated/.test(buildMessage({ from: 'office@example.org', to: 'x@example.com', subject: 's', text: 't', html: 'h' })), 'the account emails keep their mark');
});

// ---- the Fact File as a list of courses ----

test('the level and the fee of a course are read from the Fact File as written', () => {
  assert.strictEqual(levelOf('Postgraduate (MBA, MSc, LLM, MFA)'), 'Postgraduate');
  assert.strictEqual(levelOf('MBA Healthcare Management'), 'MBA');
  assert.strictEqual(levelOf('BSc (Hons) Nursing - Adult'), 'Undergraduate');
  assert.strictEqual(levelOf('BSc Nursing Studies - Top Up'), 'Top-up (final year)');
  assert.strictEqual(pickLine('£17,250\n\nMBA: £19,000', 'MSc Cyber Security'), '£17,250');
  assert.strictEqual(pickLine('£17,250\n\nMBA: £19,000', 'MBA'), 'MBA: £19,000');
  assert.strictEqual(pickLine('MSc AI and Data Science : £18,500\nOther MSc Courses: £17,450', 'MSc Business Management'), 'Other MSc Courses: £17,450');
  assert.strictEqual(pickLine('LONDON\nMBA: £16,750\nMSc: £16,200\nBIRMINGHAM & MANCHESTER\nMBA: £15,100\nMSc: £14,550', 'MSc Data Science'), 'London: MSc: £16,200; Birmingham & Manchester: MSc: £14,550');
  assert.deepStrictEqual(parseCourses('## Postgraduate - Leeds\nMSc Computer Science\n- MBA\nThe course list is under the January 2027 intake below.'),
    [{ course: 'MSc Computer Science', group: 'Postgraduate - Leeds' }, { course: 'MBA', group: 'Postgraduate - Leeds' }]);
});

test('every course of the starting Fact File can be found with its fee, and a typed link is remembered', () => {
  const dir = tmp();
  const facts = createFacts(dir);
  const links = createCourseLinks(dir);
  let index = buildIndex(facts.all(), links.all());
  assert.ok(index.length > 1500, `${index.length} courses`);
  const found = searchCourses(index, { q: 'cyber security', level: 'Postgraduate' });
  assert.ok(found.total >= 20);
  const uwl = found.options.find((o) => o.university === 'University of West London' && o.fee === '£17,250');
  assert.ok(uwl, 'the plain postgraduate fee of UWL');
  assert.strictEqual(uwl.scholarship, '£3,500');
  assert.ok(index.every((o) => !/^university name$/i.test(o.course)), 'a list of other universities is not a course list');
  assert.strictEqual(links.remember(uwl.universityId, uwl.course, 'not a link'), false);
  assert.ok(links.remember(uwl.universityId, uwl.course, 'https://www.uwl.ac.uk/course/postgraduate/cyber-security'));
  index = buildIndex(facts.all(), createCourseLinks(dir).all());
  const again = index.find((o) => o.universityId === uwl.universityId && o.course === uwl.course);
  assert.strictEqual(again.link, 'https://www.uwl.ac.uk/course/postgraduate/cyber-security');
  assert.ok(again.linkIsCourse);
});

// ---- the option finder ----

test('the Fact File assistant reads a description of the student and judges it against the entry rules', async () => {
  const dir = tmp();
  const universities = createFacts(dir).all();
  const index = buildIndex(universities, {});
  assert.strictEqual(feeFloor('From £18,792 - £19,854'), 18792);
  const read = E.readStudent('Student with 2.4 GPA and a 6 year gap, IELTS 5.5 (5.5 each band), wants a business course in London under 16,000 pounds for the January 2027 intake');
  assert.deepStrictEqual([read.gpa, read.gapYears, read.ielts, read.ieltsBand, read.budget, read.intake], [2.4, 6, 5.5, 5.5, 16000, 'January 2027']);
  assert.strictEqual(E.readStudent('62% in bachelor, no IELTS, MOI, visa refusal before, PTE 55').noEnglish, true);
  assert.strictEqual(E.readStudent('62% in bachelor').level, '', 'a bachelor already studied is not the level wanted');

  // The rules as the Fact File writes them.
  assert.deepStrictEqual(E.englishRules('IELTS: 6.0 overall / 5.5 in each band; PTE: 59 overall / 59 in each band; English waiver: N/A'), { ielts: { overall: 6, band: 5.5 }, pte: { overall: 59, band: 59 }, waiver: false });
  assert.deepStrictEqual(E.academicRules('12th Grade: 60% or above / GPA 2.75 or above'), { gpa: [2.75], percent: [60] });
  assert.deepStrictEqual(E.gapRule('Gap: Upto 2 Years of GAP Accepted'), { years: 2, since: null, text: 'Gap: Upto 2 Years of GAP Accepted' });
  assert.strictEqual(E.gapRule('- GAP: 2023 onwards').since, 2023);
  const course = { academic: '12th Grade: 60% or above / GPA 2.75 or above; Gap: Upto 2 Years of GAP Accepted', english: 'IELTS: 6.0 overall / 5.5 in each band; PTE: 59 overall / 59 in each band' };
  const weak = E.judge(E.readStudent('2.4 gpa 6 year gap ielts 5.5'), course);
  assert.strictEqual(weak.status, 'not');
  assert.strictEqual(weak.fails.length, 3, 'the grade, the gap and the English score each rule it out');
  assert.strictEqual(E.judge(E.readStudent('2.9 gpa 1 year gap ielts 6.5'), course).status, 'eligible');
  const partial = E.judge(E.readStudent('2.9 gpa ielts 6.5'), course);
  assert.deepStrictEqual([partial.status, partial.missing], ['likely', ['the study gap']]);
  assert.strictEqual(E.judge(E.readStudent('2.9 gpa 1 year gap'), { ...course, english: 'IELTS: 6.0 overall / 5.5 in each band; English waiver: MOI accepted' }).status, 'likely', 'no test, but a waiver exists');
  assert.strictEqual(E.judge(E.readStudent('2.9 gpa'), { academic: '', english: '' }).status, 'unstated', 'a course with no readable rule gets no made-up verdict');

  const find = createFinder();
  assert.ok((await find({ body: {}, index })).error);
  const answer = await find({ body: { request: '2.9 GPA, 1 year gap, IELTS 6.5, wants MSc cyber security' }, index });
  assert.ok(answer.understood.includes('GPA 2.9') && answer.understood.includes('IELTS 6.5'), 'it says what it understood');
  assert.ok(answer.results.length >= 5);
  assert.ok(answer.results.every((r) => r.fit !== 'Not eligible' && r.fee !== undefined && r.why));
  assert.ok(answer.notEligible.every((r) => r.fit === 'Not eligible' && r.why), 'the ruled-out courses say why');
  assert.match(answer.summary, /can be offered/);
  const hopeless = await find({ body: { request: '1.8 GPA, 12 year gap, IELTS 4.5, wants an MBA' }, index });
  assert.ok(hopeless.results.every((r) => r.fit === 'Entry rules not in the Fact File'), 'with these details only courses whose rules the Fact File does not state remain, and they are marked so');
  assert.ok(hopeless.notEligible.length >= 5 && hopeless.notEligible.every((r) => r.why));
  // The student's own card fills what the words leave out.
  const fromCard = await find({ body: { request: 'cyber security' }, index, card: { profile: { studyLevel: 'Postgraduate', grade: '2.9 GPA', englishTest: 'IELTS Academic', englishScore: '6.5', passedYear: '2025' } } });
  assert.ok(fromCard.understood.includes('GPA 2.9') && fromCard.understood.includes('IELTS 6.5'));
});

// ---- management records ----

test('targets, spend, events and decisions are checked before they are kept', () => {
  const dir = tmp();
  const p = createPlanning(dir);
  assert.ok(p.save('spend', { month: '2026-13', amount: 5000 }, 'Owner').error);
  const line = p.save('spend', { month: '2026-10', source: 'Social Media', detail: 'TikTok', amount: '25,000', leads: '40' }, 'Owner').entry;
  assert.strictEqual(line.amount, 25000);
  assert.strictEqual(p.save('spend', { id: line.id, month: '2026-10', source: 'Social Media', amount: 30000 }, 'Owner').entry.amount, 30000);
  assert.ok(p.save('events', { name: 'Fair' }, 'Owner').error, 'an event needs a date');
  p.save('events', { name: 'UK Fair', date: '2026-08-08', cost: 100000, registered: 200, attended: 120, type: 'Education fair' }, 'Owner');
  p.setTarget('sheet-1', { visas: 40, byDate: '2027-01-10' }, 'Owner');
  assert.strictEqual(createPlanning(dir).all().targets['sheet-1'].visas, 40);
  p.setTarget('sheet-1', {}, 'Owner');
  assert.strictEqual(createPlanning(dir).all().targets['sheet-1'], undefined, 'an empty target is taken away');
  assert.strictEqual(p.remove('spend', line.id).removed.amount, 30000);
  assert.strictEqual(createPlanning(dir).all().spend.length, 0);
  assert.strictEqual(p.saveSettings({ valuePerVisa: '150000' }).settings.valuePerVisa, 150000);
});

test('B2B partners keep their kind, terms and contacts apart from the Partner Universities', () => {
  const dir = tmp();
  const b = createB2b(dir);
  assert.deepStrictEqual(b.list(), []);
  const made = b.create('Himal Education Hub', 'Owner').university;
  const saved = b.update(made.id, { city: 'Pokhara', terms: [{ item: 'Student with a visa', terms: 'Rs 40,000' }, {}], contacts: [{ name: 'Hari', phone: '9800000001' }], agreementEnd: '2026-12-31' }, 'Owner').university;
  assert.deepStrictEqual(saved.terms, [{ item: 'Student with a visa', terms: 'Rs 40,000' }]);
  assert.strictEqual(b.list()[0].name, 'Himal Education Hub');
  assert.ok(fs.existsSync(path.join(dir, 'b2b-partners.json')) && !fs.existsSync(path.join(dir, 'direct-universities.json')));
  assert.strictEqual(b.create('himal education hub', 'Owner').error, 'That partner is already in the list.');
});

// ---- the decision figures ----

const demo = buildDemo({ today: '2026-11-11' });
const figures = (extra = {}) => buildInsights({ workbook: demo.workbook, cards: demo.cards, planning: demo.planning, b2b: demo.b2b, today: '2026-11-11', admin: true, ...extra });

test('the sample data is made up: no real email or phone number', () => {
  const rows = demo.workbook.sheets.flatMap((s) => s.rows);
  assert.ok(rows.length > 200);
  assert.ok(rows.every((r) => r.EMAIL.endsWith('@example.com') && r['CONTACT NUMBER'].startsWith('98000')));
});

test('every student is counted once in each table, and a blank detail is shown as not recorded', () => {
  const r = figures();
  assert.strictEqual(r.scope, 'Jan Intake 2027');
  const n = r.summary.students;
  assert.strictEqual(r.channels.sources.filter((s) => !s.spendOnly).reduce((sum, s) => sum + s.students, 0), n);
  assert.strictEqual(r.team, undefined, 'there is no counselor table any more');
  assert.strictEqual(r.campaigns, undefined);
  assert.strictEqual(r.seasonality, undefined);
  assert.ok(r.plan.needs.length && r.plan.needs.every((x) => x.left === null || x.left === Math.max(0, x.need - x.have)), 'the plan shows what is needed, what is held and what is still to find');
  r.channels.sources.filter((s) => s.details.length).forEach((s) => assert.strictEqual(s.details.reduce((sum, d) => sum + d.students, 0), s.students, s.label));
  assert.ok(r.summary.applied <= n && r.summary.visas <= r.summary.paid, 'a later step never has more students than an earlier one');
  const all = figures({ sheetId: 'all' });
  assert.strictEqual(all.summary.students, demo.workbook.sheets.reduce((sum, s) => sum + s.rows.length, 0));
});

test('cost per student, application and visa come from the spend lines of the same source and intake', () => {
  const r = figures({ sheetId: 'all' });
  const social = r.channels.sources.find((s) => s.label === 'Social Media');
  const spent = demo.planning.spend.filter((l) => l.source === 'Social Media').reduce((sum, l) => sum + l.amount, 0);
  assert.strictEqual(social.spend, spent);
  assert.strictEqual(social.costPerVisa, Math.round(spent / social.visas));
  assert.strictEqual(r.channels.sources.find((s) => s.label === 'Reference').costPerVisa, null, 'no spend, no cost figure');
  const one = figures();
  const here = demo.planning.spend.filter((l) => l.intake === demo.workbook.sheets[2].id).reduce((sum, l) => sum + l.amount, 0);
  assert.strictEqual(one.channels.spendTotal, here, 'an intake only carries its own spend');
});

test('the forecast counts each student in progress at the chance of students who got that far before', () => {
  const r = figures();
  assert.strictEqual(r.target.visas, 45);
  assert.strictEqual(r.target.visasNow, r.summary.visas);
  assert.ok(r.target.forecast.expected > 0 && r.target.forecast.low <= r.target.forecast.expected && r.target.forecast.high >= r.target.forecast.expected);
  assert.ok(['on-track', 'behind'].includes(r.target.status));
  // A finished intake has no forecast: what it has is what it got.
  const old = figures({ sheetId: demo.workbook.sheets[1].id });
  assert.strictEqual(old.target.forecast, null);
  assert.ok(['reached', 'missed'].includes(old.target.status));
  // With almost no history there is no forecast, and nothing is made up in its place.
  const few = buildInsights({ workbook: { sheets: [{ id: 's', name: 'Jan Intake 2027', rows: demo.workbook.sheets[2].rows.slice(0, 6) }] }, cards: {}, planning: { targets: { s: { visas: 10 } } }, today: '2026-11-11' });
  assert.strictEqual(few.target.forecast, null);
  assert.strictEqual(few.target.status, 'unknown');
});

test('the plan works back from the visas wanted to the applications and inquiries needed', () => {
  assert.deepStrictEqual(intakeSeason('Jan Intake 2027'), { month: 0, year: 2027 });
  assert.strictEqual(intakeSeason('Sheet1'), null);
  const rates = { paymentToVisa: { value: 0.9 }, offerToPayment: { value: 0.8 }, applicationToOffer: { value: 0.9 }, applicationToVisa: { value: 0.65 }, inquiryToApplication: { value: 0.5 } };
  assert.deepStrictEqual(workBack(45, rates), { visas: 45, paid: 50, offers: 63, applications: 70, inquiries: 140 });
  const none = { paymentToVisa: { value: null }, offerToPayment: { value: null }, applicationToOffer: { value: null }, applicationToVisa: { value: null }, inquiryToApplication: { value: null } };
  assert.deepStrictEqual(workBack(45, none), { visas: 45, paid: null, offers: null, applications: null, inquiries: null }, 'no history: no made-up numbers');
  const r = figures();
  assert.strictEqual(r.plan.comparable.label, 'Jan Intake 2026', 'a January intake is compared with the January before');
  assert.ok(r.plan.scenarios.some((s) => s.name === 'Your target' && s.visas === 45 && s.applications > 45));
  const apply = r.plan.timeline.find((t) => t.key === 'apply');
  assert.strictEqual(apply.from, '2026-11-11', 'ten weeks before 20 January 2027');
});

test('each finding carries its numbers, the reason and the decision, most urgent first', () => {
  const r = figures();
  assert.ok(r.findings.length >= 4);
  r.findings.forEach((f) => { assert.ok(f.title && f.evidence.length && f.why && f.decision && f.measure && ['P1', 'P2', 'P3'].includes(f.priority), f.title); });
  const order = r.findings.map((f) => Number(f.priority.slice(1)));
  assert.deepStrictEqual(order, [...order].sort((a, b) => a - b), 'P1 before P2 before P3');
  assert.ok(!r.findings.some((f) => /follow-up/i.test(f.title)), 'no finding about follow-ups any more');
  assert.ok(r.findings.some((f) => f.area === 'Partners' && /agreement/.test(f.title)), 'Admin is told about an agreement that is ending');
  const manager = figures({ admin: false });
  assert.ok(!manager.findings.some((f) => /agreement/.test(f.title)) && manager.partners.agreements.length === 0, 'the partner agreements are Admin only');
  // An empty system says what to do first instead of showing nothing.
  const empty = buildInsights({ workbook: { sheets: [{ id: 's', name: 'Jan Intake 2027', rows: [] }] }, cards: {}, planning: {}, today: '2026-11-11' });
  assert.strictEqual(empty.findings[0].title, 'There are no students in this intake yet');
});

// ---- through the real server: who may see and change what ----

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('on the real server: cards follow the rules of the sheet, messages are recorded, Admin pages stay Admin', { timeout: 120000 }, async (t) => {
  const dir = tmp();
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir };
  delete env.ANTHROPIC_API_KEY;
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', 'student-details'), env, stdio: 'ignore' });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const person = () => {
    let cookie = '';
    return async (method, url, body) => {
      const res = await fetch(base + url, { method, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
      return { status: res.status, json, location: res.headers.get('location') };
    };
  };
  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' });
  await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' });
  const login = async (username, access) => {
    const made = (await admin('POST', '/api/users', { username, name: username[0].toUpperCase() + username.slice(1), email: '', ...access })).json;
    const p = person();
    await p('POST', '/api/login', { username, password: made.temporaryPassword });
    await p('POST', '/api/login/new-password', { password: 'Team-Strong-2026' });
    return p;
  };
  const app = await login('asha', { departments: ['application'] });
  const follow = await login('bikram', { departments: ['followup'] });
  const manager = await login('chief', { role: 'manager' });

  // Admin adds a student with the form: the student goes on the sheet, the details on the card.
  const made = await admin('POST', '/api/students/new', {
    stage: 'Application Stage',
    fields: { 'FIRST NAME': 'Sita', 'LAST NAME': 'Sharma', EMAIL: 'Sita.Sharma@Example.com', 'CONTACT NUMBER': '9800000001', 'STUDENT SOURCE': 'Social Media', 'UNIVERSITY NAME': 'Bangor University', 'GROSS FEE': '999' },
    profile: { sourceDetail: 'TikTok', studyLevel: 'Postgraduate', inquiryDate: '2026-11-01' }, note: 'Came with her brother.',
  });
  assert.strictEqual(made.status, 200, JSON.stringify(made.json));
  const sitaId = made.json.id;
  let wb = (await admin('GET', '/api/data')).json;
  const sita = wb.sheets[0].rows.find((r) => r._id === sitaId);
  assert.strictEqual(sita['APPLICATION STATUS'], 'Application Stage');
  assert.strictEqual(sita.EMAIL, 'sita.sharma@example.com');
  assert.strictEqual(sita['GROSS FEE'], '', 'the form only fills the columns it shows');
  assert.strictEqual((await admin('POST', '/api/students/new', { fields: { EMAIL: 'a@example.com' } })).status, 400, 'a student needs a name');
  let card = (await admin('GET', `/api/cards/${sitaId}`)).json;
  assert.strictEqual(card.card.profile.sourceDetail, 'TikTok');
  assert.strictEqual(card.card.followUp, undefined, 'there are no follow-ups any more');
  assert.strictEqual(card.card.notes[0].text, 'Came with her brother.');
  assert.strictEqual(card.student.name, 'Sita Sharma');
  assert.ok(card.can.edit);
  assert.strictEqual(card.mail.ready, false);

  // A team adds its own student: at the team's stage, with only what the team may fill in.
  const hari = await follow('POST', '/api/students/new', { stage: 'Visa Issued', fields: { 'FIRST NAME': 'Hari', 'CONTACT NUMBER': '9800000002', 'UNIVERSITY NAME': 'Bangor University' }, profile: { sourceDetail: 'Walk in' } });
  assert.strictEqual(hari.status, 200, JSON.stringify(hari.json));
  wb = (await admin('GET', '/api/data')).json;
  const hariRow = wb.sheets[0].rows.find((r) => r._id === hari.json.id);
  assert.strictEqual(hariRow['APPLICATION STATUS'], 'Inquiry', "the Follow-up Team's students start at Inquiry, whatever was sent");
  assert.strictEqual(hariRow._addedByTeam, 'followup');
  assert.ok(!hariRow['UNIVERSITY NAME'], 'a column the team may not fill in is left out');
  assert.strictEqual((await manager('POST', '/api/students/new', { fields: { 'FIRST NAME': 'X' } })).status, 403, 'the Manager only views');

  // Who sees which card: the same students as on the sheet.
  assert.strictEqual((await app('GET', `/api/cards/${sitaId}`)).status, 200, 'the Application Team sees a student at Application Stage');
  assert.strictEqual((await follow('GET', `/api/cards/${sitaId}`)).status, 404, 'the Follow-up Team does not');
  assert.strictEqual((await app('GET', `/api/cards/${hari.json.id}`)).status, 404);
  assert.strictEqual((await follow('GET', `/api/cards/${hari.json.id}`)).status, 200);
  assert.strictEqual((await manager('GET', `/api/cards/${sitaId}`)).json.can.edit, false, 'the Manager sees every card, view only');
  assert.strictEqual((await manager('POST', `/api/cards/${sitaId}/notes`, { text: 'x' })).status, 403);
  assert.strictEqual((await app('GET', '/api/cards/no-such-row')).status, 404);
  assert.deepStrictEqual((await follow('GET', '/api/students/search?q=sita')).json.students, [], 'search only finds the students the account sees');
  assert.strictEqual((await app('GET', '/api/students/search?q=9800000001')).json.students[0].name, 'Sita Sharma');

  // The Student Source is chosen on the card (it is no longer a column of the sheet), with the rules of the sheet.
  assert.strictEqual((await app('POST', `/api/cards/${sitaId}/source`, { source: 'Events' })).status, 403, 'a team cannot change the source of a student it did not add');
  assert.strictEqual((await admin('POST', `/api/cards/${sitaId}/source`, { source: 'Made up' })).status, 400);
  assert.strictEqual((await admin('POST', `/api/cards/${sitaId}/source`, { source: 'Events' })).status, 200);
  assert.strictEqual((await admin('GET', `/api/cards/${sitaId}`)).json.student.source, 'Events');
  assert.strictEqual((await follow('POST', `/api/cards/${hari.json.id}/source`, { source: 'Visitor' })).status, 200, 'a team sets the source of a student it added, while it is blank');
  assert.strictEqual((await follow('POST', `/api/cards/${hari.json.id}/source`, { source: 'Events' })).status, 403, 'and only once');
  await admin('POST', `/api/cards/${sitaId}/source`, { source: 'Social Media' });

  // Notes.
  const noted = await app('POST', `/api/cards/${sitaId}/notes`, { text: 'Documents received.', kind: 'call' });
  assert.strictEqual(noted.status, 200);
  assert.strictEqual(noted.json.note.by, 'Asha');
  assert.strictEqual((await app('GET', '/api/follow-ups')).status, 404, 'the Follow-ups page and its API are gone');

  // University options from the Fact File, and one email with all of them.
  const courses = (await app('GET', '/api/courses?q=cyber%20security&level=Postgraduate')).json;
  assert.ok(courses.total >= 20 && courses.options[0].university);
  const pick = courses.options.find((o) => o.fee);
  for (const o of [pick, courses.options.find((x) => x.universityId !== pick.universityId)]) {
    const added = await app('POST', `/api/cards/${sitaId}/options`, { universityId: o.universityId, university: o.university, course: o.course, level: o.level, intake: o.intake, fee: o.fee, scholarship: o.scholarship, link: 'https://example.org/course' });
    assert.strictEqual(added.status, 200, JSON.stringify(added.json));
  }
  const preview = (await app('POST', `/api/cards/${sitaId}/messages/preview`, { template: 'options' })).json;
  assert.strictEqual(preview.subject, 'Your UK university options from NIEC');
  assert.strictEqual(preview.to, 'sita.sharma@example.com');
  assert.strictEqual(preview.options, 2);
  assert.strictEqual((preview.html.match(/<tr><td valign="top"/g) || []).length, 2, 'both options in the one email');
  assert.strictEqual(preview.whatsapp.number, '9779800000001');
  // Email is not set up on this test server: nothing leaves, and the card keeps the message as a preview.
  const sent = (await app('POST', `/api/cards/${sitaId}/messages/send`, { channel: 'email', template: 'options' })).json;
  assert.strictEqual(sent.status, 'not-configured');
  assert.strictEqual(sent.card.messages[0].status, 'preview');
  assert.strictEqual(sent.card.messages[0].options, 2);
  const words = (await app('GET', `/api/cards/${sitaId}/messages/${sent.message.id}`)).json;
  assert.match(words.text, /Dear Sita,/);
  assert.strictEqual((await follow('GET', `/api/cards/${sitaId}/messages/${sent.message.id}`)).status, 404);
  const wa = (await app('POST', `/api/cards/${sitaId}/messages/send`, { channel: 'whatsapp', template: 'offer_received' })).json;
  assert.strictEqual(wa.status, 'opened');
  assert.strictEqual((await app('POST', `/api/cards/${sitaId}/messages/send`, { channel: 'email', template: 'offer_received', to: 'not an address' })).status, 400);
  // The link typed for the course is remembered for the next student.
  assert.ok((await app('GET', `/api/courses?q=${encodeURIComponent(pick.course)}`)).json.options.some((o) => o.linkIsCourse && o.link === 'https://example.org/course'));

  // The Fact File assistant, with the details of the student's card.
  const found = await app('POST', '/api/finder', { request: 'nursing top up', studentId: sitaId });
  assert.strictEqual(found.status, 200);
  assert.ok(found.json.results.length > 0 && found.json.understood.length > 0);

  // Templates: everyone reads, Admin changes.
  assert.ok((await app('GET', '/api/templates')).json.templates.length === 6);
  assert.strictEqual((await app('POST', '/api/templates/offer_received', { name: 'x', subject: 'y', body: 'z' })).status, 403);
  assert.strictEqual((await admin('POST', '/api/templates/signature', { name: 'Head of UK Recruitment', phone: '+977 1 5550000' })).status, 200);
  assert.match((await app('POST', `/api/cards/${sitaId}/messages/preview`, { template: 'offer_received' })).json.text, /Head of UK Recruitment\n/);

  // Admin-only and Manager pages.
  for (const url of ['/api/b2b', '/message-templates', '/b2b-partners']) {
    const res = await app('GET', url);
    assert.ok(res.status === 403 || res.status === 302, `${url} is not for a team (${res.status})`);
  }
  assert.strictEqual((await manager('GET', '/api/b2b')).status, 403);
  const partner = (await admin('POST', '/api/b2b', { name: 'Himal Education Hub' })).json;
  assert.strictEqual(partner.name, 'Himal Education Hub');
  assert.deepStrictEqual((await app('GET', '/api/card-lists')).json.partners, ['Himal Education Hub'], 'a team gets the names of the B2B partners, nothing else');
  assert.strictEqual((await app('GET', '/api/insights')).status, 403);
  assert.strictEqual((await app('GET', '/api/planning')).status, 403);
  const figuresNow = (await manager('GET', '/api/insights')).json;
  assert.strictEqual(figuresNow.summary.students, 2);
  assert.strictEqual((await manager('POST', '/api/planning/targets/' + wb.sheets[0].id, { visas: 30 })).status, 403, 'the Manager reads the planning records, Admin writes them');
  assert.strictEqual((await admin('POST', '/api/planning/targets/' + wb.sheets[0].id, { visas: 30, byDate: '2027-01-10' })).status, 200);
  assert.strictEqual((await manager('GET', '/api/insights')).json.target.visas, 30, 'a new target shows at once');
  assert.strictEqual((await admin('POST', '/api/planning/spend', { month: '2026-10', source: 'Social Media', amount: 20000 })).status, 200);
  assert.strictEqual((await manager('GET', '/api/planning')).json.settings.valuePerVisa, undefined, 'the value of a visa is for Admin only');
  for (const page of ['/student', '/compose']) assert.strictEqual((await follow('GET', page)).status, 200, `${page} opens for every account`);
  assert.strictEqual((await follow('GET', '/follow-ups')).status, 404, 'the Follow-ups page is gone');

  // Everything is written to the Activity record, and the backup holds the cards.
  const activity = (await admin('GET', '/api/activity?limit=200')).json.events;
  assert.ok(activity.some((e) => e.action === 'Edited student card' && e.changes.some((c) => /added a note/.test(c))));
  assert.ok(activity.some((e) => e.action === 'Sent message'));
  const copy = (await admin('POST', '/api/restore/backup-now', {})).json.id;
  await app('POST', `/api/cards/${sitaId}/notes`, { text: 'Written after the backup.' });
  assert.strictEqual((await admin('GET', `/api/cards/${sitaId}`)).json.card.notes.length, 3);
  assert.strictEqual((await admin('POST', '/api/restore', { id: copy, parts: ['cards'] })).status, 200);
  assert.strictEqual((await admin('GET', `/api/cards/${sitaId}`)).json.card.notes.length, 2, 'the cards are back as they were in the backup');
});

// ---- the map of the UK and the assistant's remarks ----

test('the assistant reads a place, a number of universities and the deposit from the remarks, and shows only universities near the place', async () => {
  const P = require('../student-details/places');
  assert.ok(P.readWhere('student wants to study near Manchester'), 'a place is understood');
  assert.strictEqual(P.readWhere('nothing about a place here'), null);
  const { createFacts } = require('../student-details/facts');
  const { buildIndex } = require('../student-details/course-index');
  const { createFinder } = require('../student-details/finder');
  const index = buildIndex(createFacts(tmp()).all(), {});
  const out = await createFinder()({ body: { request: 'wants 3 universities near Manchester, show the minimum cash deposit and the full tuition fee', level: 'Postgraduate', subject: 'business', grade: '2.9 GPA', englishTest: 'IELTS Academic', englishScore: '6.5' }, index });
  assert.ok(out.results.length > 0 && out.results.length <= 3, 'at most the 3 universities asked for');
  assert.strictEqual(new Set(out.results.map((r) => r.universityId)).size, out.results.length, 'one course for each university');
  assert.ok(out.results.every((r) => r.showDeposit && r.showFullFee));
  assert.ok(out.understood.some((x) => /Manchester/.test(x)) && out.understood.some((x) => /3 universities/.test(x)) && out.understood.some((x) => /deposit/.test(x)));
});

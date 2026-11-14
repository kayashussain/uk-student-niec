// The students of an event or a campaign come from the list Admin uploads for it (Excel or CSV), not from what was picked when a
// student was added. Through the real server: a student added earlier is found and tagged (not added twice), new ones go in at
// Inquiry, lines that cannot be matched are skipped, the same list twice changes nothing, a student of another event is not moved,
// only Admin uploads, and every account gets the "Came from" tags of the students it sees.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('uploading an event list: found and tagged, added at Inquiry, skipped, nothing twice, other events kept, Admin only', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-evup-'));
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
      const res = await fetch(base + url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
      const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
      const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
      return { status: res.status, json };
    };
  };
  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' });
  await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' });
  const made = (await admin('POST', '/api/users', { username: 'bikram', name: 'Bikram', email: '', departments: ['followup'] })).json;
  const follow = person();
  await follow('POST', '/api/login', { username: 'bikram', password: made.temporaryPassword });
  await follow('POST', '/api/login/new-password', { password: 'Team-Strong-2026' });

  // The team adds a student before the campaign is entered, as Social Media / Facebook page.
  const early = (await admin('POST', '/api/students/new', { stage: 'Inquiry', fields: { 'FIRST NAME': 'Early', 'LAST NAME': 'Person', 'CONTACT NUMBER': '+977 980-0099999', 'STUDENT SOURCE': 'Social Media' }, profile: { sourceDetail: 'Facebook page' } })).json.id;
  // Two events: the campaign, and a fair that already has one student.
  await admin('POST', '/api/planning/events', { name: 'Fair', channel: 'Another venue (hall or hotel)', date: '2026-10-01', cost: '50000' });
  await admin('POST', '/api/planning/events', { name: 'ABC event', channel: 'Social media', date: '2026-11-05', endDate: '2026-11-20', cost: '20000' });
  const acts = () => admin('GET', '/api/activities').then((r) => r.json);
  const ids = Object.fromEntries((await acts()).activities.map((a) => [a.name, a.id]));
  const fairOnly = (await admin('POST', `/api/activities/${ids.Fair}/students`, { rows: [{ first: 'Fair', last: 'Student', phone: '9811100000' }] })).json;
  assert.strictEqual(fairOnly.added, 1);

  const list = [
    { first: 'Early', last: 'Person', phone: '9800099999' }, // the same number written differently
    { first: 'New', last: 'One', phone: '9811122233' },
    { first: 'New', last: 'Two', email: 'new.two@example.com' },
    { first: 'No', last: 'Contact' },
    { first: 'New', last: 'One', phone: '9811122233' },
    { first: 'Fair', last: 'Student', phone: '9811100000' },
  ];
  // Only Admin uploads; the follow-up team cannot.
  assert.strictEqual((await follow('POST', `/api/activities/${ids['ABC event']}/students`, { rows: list })).status, 403);
  // The review changes nothing.
  const pre = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: list, preview: true })).json;
  assert.deepStrictEqual(pre.counts, { new: 2, link: 1, update: 0, already: 0, other: 1, check: 0, joined: 1, removed: 0, problem: 1, missing: 0 });
  assert.strictEqual((await acts()).activities.find((a) => a.name === 'ABC event').leads, 0, 'the review saved nothing');
  // Carried out.
  const done = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: list })).json;
  assert.deepStrictEqual([done.added, done.linked, done.failed.length], [2, 1, 0]);
  const abc = (await acts()).activities.find((a) => a.name === 'ABC event');
  assert.deepStrictEqual([abc.leads, abc.costPerLead], [3, 6667], 'three students share the Rs 20,000');
  const card = (await admin('GET', `/api/cards/${early}`)).json;
  assert.strictEqual(card.student.source, 'Social Media', 'a campaign on social media is a Social Media source (the owner, 14 Nov 2026)');
  assert.match(card.card.profile.sourceDetail, /^ABC event/);
  assert.match(card.card.profile.sourceRemarks, /Previous source: Social Media: Facebook page/, 'the earlier source is kept');
  assert.match(card.card.notes.at(-1).text, /Linked to ABC event from its enquiry list/);
  const wb = (await admin('GET', '/api/data')).json;
  const all = wb.sheets.flatMap((s) => s.rows);
  assert.strictEqual(all.filter((r) => r['FIRST NAME'] === 'Early').length, 1, 'not added twice');
  assert.ok(all.filter((r) => r['FIRST NAME'] === 'New').every((r) => r['APPLICATION STATUS'] === 'Inquiry' && r['STUDENT SOURCE'] === 'Social Media'));
  assert.strictEqual((await acts()).activities.find((a) => a.name === 'Fair').leads, 1, 'the student of another event was not moved');
  // The same list again changes nothing.
  const again = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: list, preview: true })).json;
  assert.deepStrictEqual([again.counts.new, again.counts.link, again.counts.already], [0, 0, 3]);
  // An updated, longer list later (the owner, 14 Nov 2026: 85 leads first, 150 later): only the new people are added; everyone already
  // tagged stays as they are.
  const longer = [...list, { first: 'Later', last: 'Lead', phone: '9811144455' }];
  const update = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: longer })).json;
  assert.deepStrictEqual([update.added, update.linked, update.counts.already], [1, 0, 3], 'only the new lead is added');
  // A later list that dropped someone: they are named as missing, and nothing changes for them.
  const shorter = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: longer.slice(1), preview: true })).json;
  assert.deepStrictEqual(shorter.missing.map((m) => m.name), ['Early Person'], 'the student not on this list is named');
  // The same leads again, now with more in the list (the owner, 14 Nov 2026: an updated file with the inquiry day and time, an email,
  // a comment column): never stopped because they are already there. What is new is added, nothing is replaced, and the same file a
  // third time has nothing new.
  const richer = [
    { first: 'Early', last: 'Person', phone: '9800099999', inquiryDate: '2026-11-06', extra: 'Enquired 6 Nov 2026 at 9:21 pm. Comment: wants nursing' },
    { first: 'New', last: 'Two', email: 'new.two@example.com', phone: '9811155566' },
    { first: 'New', last: 'One', phone: '9811122233', email: 'new.one@example.com' },
  ];
  const rich = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: richer, preview: true })).json;
  assert.deepStrictEqual([rich.counts.update, rich.counts.already], [3, 0], 'every lead has something new');
  assert.match(rich.rows.find((r) => r.first === 'Early').note, /Will add: inquiry day, inquiry time, more details in a note/);
  const richDone = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: richer })).json;
  assert.strictEqual(richDone.updated, 3);
  const earlyRich = (await admin('GET', `/api/cards/${early}`)).json;
  assert.strictEqual(earlyRich.card.profile.inquiryDate, '2026-11-06', 'the earlier inquiry day replaces the day the student was added');
  assert.ok((await admin('GET', '/api/data')).json.sheets.flatMap((x) => x.rows).some((r) => r.EMAIL === 'new.one@example.com'), 'a blank email is filled in');
  assert.match(earlyRich.card.notes.at(-1).text, /Enquired 6 Nov 2026 at 9:21 pm\. Comment: wants nursing/);
  const twoRow = (await admin('GET', '/api/data')).json.sheets.flatMap((x) => x.rows).find((r) => r.EMAIL === 'new.two@example.com');
  assert.strictEqual(twoRow['CONTACT NUMBER'], '9811155566', 'a blank phone is filled in');
  const third = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: richer, preview: true })).json;
  assert.deepStrictEqual([third.counts.update, third.counts.already], [0, 3], 'the same file again: nothing new');
  const later = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: [{ first: 'Early', last: 'Person', phone: '9800099999', inquiryDate: '2026-11-09' }], preview: true })).json;
  assert.strictEqual(later.rows[0].action, 'already', 'a later inquiry day never replaces an earlier one');
  // Re-uploading safely (the owner, 14 Nov 2026): a student removed from the sheet is never brought back by a list; the same person twice
  // in one file is one student with the details of both lines; a lead that fits two different students changes neither.
  const delWb = (await admin('GET', '/api/data')).json;
  const victim = delWb.sheets.flatMap((x) => x.rows).find((r) => r['FIRST NAME'] === 'Later');
  const cut = delWb.sheets.map((sh) => ({ ...sh, rows: sh.rows.filter((r) => r._id !== victim._id) }));
  assert.strictEqual((await admin('POST', '/api/data', { sheets: cut, activeSheetId: delWb.activeSheetId, baseRevision: delWb.revision })).status, 200);
  const back = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: [{ first: 'Later', last: 'Lead', phone: '9811144455' }] })).json;
  assert.deepStrictEqual([back.rows[0].action, back.added], ['removed', 0], 'the removed student is not added back');
  const twice = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: [
    { first: 'Twin', last: 'Line', phone: '9811188899' },
    { first: 'Twin', last: 'Line', phone: '9811188899', email: 'twin@example.com', inquiryDate: '2026-11-07', extra: 'Comment: call after 5 pm' },
  ] })).json;
  assert.deepStrictEqual([twice.added, twice.counts.joined], [1, 1]);
  const twin = (await admin('GET', '/api/data')).json.sheets.flatMap((x) => x.rows).find((r) => r['FIRST NAME'] === 'Twin');
  assert.strictEqual(twin.EMAIL, 'twin@example.com', 'the second line\'s email is kept');
  const twinCard = (await admin('GET', `/api/cards/${twin._id}`)).json.card;
  assert.strictEqual(twinCard.profile.inquiryDate, '2026-11-07');
  assert.match(twinCard.notes.map((n) => n.text).join(' '), /call after 5 pm/);
  const mixed = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: [{ first: 'Twin', last: 'Line', phone: '9811122233', email: 'twin@example.com' }], preview: true })).json;
  assert.strictEqual(mixed.rows[0].action, 'check', 'the phone is one student\'s and the email another\'s: nothing is changed');
  // Its students, with the latest note, and the Came from tags (the follow-up team sees the tags of the students it sees).
  const people = (await admin('GET', `/api/activities/${ids['ABC event']}/students`)).json.students;
  assert.strictEqual(people.length, 4);
  assert.ok(people.every((s) => s.lastNote));
  const tags = (await follow('GET', '/api/event-tags')).json;
  assert.ok(Object.values(tags.rows).every((label) => typeof label === 'string'));
  assert.ok(!JSON.stringify(tags).includes('20000'), 'no cost in the tags');
  // The Source filter of All Students: each student's source and exactly which, and the sources with how many students each.
  const sources = (await admin('GET', '/api/event-tags')).json;
  assert.strictEqual(sources.sources[early][0], 'Social Media');
  assert.match(sources.sources[early][1], /^ABC event/);
  const social = sources.groups.find((g) => g.group === 'Social Media');
  assert.ok(social && social.count >= 3 && social.details.some((d) => /^ABC event/.test(d.detail)), 'the campaign is under Social Media');
  assert.ok(sources.groups.some((g) => g.group === 'Events' && g.details.some((d) => /^Fair/.test(d.detail))), 'the fair is under Events');

  // A lead list as Meta gives it (the owner, 14 Nov 2026): the intake asked for picks the intake tab, the programme becomes the study
  // level, the enquiry date the first inquiry day, the rest goes into the first note; names and Nepal numbers are tidied. Made-up people.
  const wb0 = (await admin('GET', '/api/data')).json;
  const jan = wb0.sheets.find((x) => /jan/i.test(x.name) && /2027/.test(x.name));
  const leads = [{ first: '#anil', last: 'example', phone: '+9779811177788', level: 'Postgraduate', intake: 'January 2027', inquiryDate: '2026-11-10', extra: "Programme: Master's Degree. Intended UK Study Intake: January 2027" }];
  const pre2 = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: leads, sheetId: wb0.sheets[0].id, preview: true })).json;
  assert.strictEqual(pre2.rows[0].name, 'Anil Example', 'the name is tidied');
  assert.strictEqual(pre2.rows[0].phone, '9811177788', 'a Nepal number is kept as 98XXXXXXXX');
  assert.strictEqual(pre2.rows[0].intakeName, (jan || wb0.sheets[0]).name, 'the intake asked for, when there is such a tab');
  await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: leads, sheetId: wb0.sheets[0].id });
  const wb1 = (await admin('GET', '/api/data')).json;
  const anil = wb1.sheets.find((x) => x.id === (jan || wb0.sheets[0]).id).rows.find((r) => r['FIRST NAME'] === 'Anil');
  assert.ok(anil, 'added to the intake they asked for');
  const anilCard = (await admin('GET', `/api/cards/${anil._id}`)).json.card;
  assert.deepStrictEqual([anilCard.profile.studyLevel, anilCard.profile.inquiryDate], ['Postgraduate', '2026-11-10']);
  assert.match(anilCard.notes[0].text, /Intended UK Study Intake: January 2027/);

  // Adding a student who is already in ISR (same phone): nobody is added twice; who it is is said, and "fill in what is missing"
  // fills only blanks, keeps what is there, and puts a different email in a note (the owner, 14 Nov 2026).
  const again2 = await admin('POST', '/api/students/new', { stage: 'Inquiry', fields: { 'FIRST NAME': 'Early', 'CONTACT NUMBER': '9800099999', EMAIL: 'early@example.com' } });
  assert.strictEqual(again2.status, 409);
  assert.strictEqual(again2.json.duplicate.id, early, 'the student already in ISR is named');
  // The same phone under a clearly different first name (a brother or sister on the family phone, the owner, 14 Nov 2026): said so,
  // and added once the person says it is someone else. Never with the same email, and never without being asked.
  const sibling = await admin('POST', '/api/students/new', { stage: 'Inquiry', fields: { 'FIRST NAME': 'Maya', 'CONTACT NUMBER': '9800099999' } });
  assert.deepStrictEqual([sibling.status, sibling.json.duplicate.maybeOther], [409, true]);
  assert.strictEqual((await admin('POST', '/api/students/new', { stage: 'Inquiry', allowDuplicate: true, fields: { 'FIRST NAME': 'Early', 'CONTACT NUMBER': '9800099999' } })).status, 409, 'the same first name is the same student, even when asked');
  assert.strictEqual((await admin('POST', '/api/students/new', { stage: 'Inquiry', allowDuplicate: true, fields: { 'FIRST NAME': 'Maya', 'CONTACT NUMBER': '9800099999' } })).status, 200, 'added as a different person');
  const sib = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { preview: true, rows: [{ first: 'Ramesh', last: 'X', phone: '9800099999' }], sheetId: wb0.sheets[0].id })).json;
  assert.deepStrictEqual([sib.rows[0].action, sib.counts.check], ['check', 1], 'an event list: the same phone under another name is to be checked, never linked');
  const filled = (await admin('POST', '/api/students/merge', { id: early, fields: { EMAIL: 'early@example.com' }, profile: { dob: '2003-04-05' } })).json;
  assert.deepStrictEqual(filled.filled.sort(), ['EMAIL', 'dob'], 'the blank email and date of birth are filled in');
  const kept = (await admin('POST', '/api/students/merge', { id: early, fields: { EMAIL: 'other@example.com' } })).json;
  assert.deepStrictEqual([kept.filled.length, kept.differs.length], [0, 1], 'the email on the sheet is kept, the other one noted');
  const earlyNow = (await admin('GET', `/api/cards/${early}`)).json;
  assert.strictEqual(earlyNow.student.email, 'early@example.com');
  assert.match(earlyNow.card.notes.at(-1).text, /other@example\.com/);

  // The Dashboard's figures over time: every intake side by side, and the days of each step.
  const tr = (await admin('GET', '/api/trends')).json;
  assert.ok(Array.isArray(tr.intakes) && tr.intakes.length >= 1 && 'visas' in tr.intakes[0], 'every intake, as quarters');
  assert.ok(Array.isArray(tr.payments) && Array.isArray(tr.visas) && Array.isArray(tr.cas), 'payments, CAS and visas by day');
  assert.strictEqual((await follow('GET', '/api/trends')).status, 403, 'for Admin and the Manager');

  // A cost in rupees is kept as typed; one in dollars needs today's rate (the test has no internet, so it is refused, nothing saved).
  const usd = await admin('POST', '/api/planning/events', { id: ids.Fair, name: 'Fair', channel: 'Another venue (hall or hotel)', date: '2026-10-01', costAmount: '500', costCurrency: 'USD' });
  if (usd.status === 200) assert.ok(usd.json.entry.cost > 500 && usd.json.entry.costCurrency === 'USD' && usd.json.entry.costRate > 1);
  else assert.match(usd.json.error, /rate could not be found/);
  const rs = await admin('POST', '/api/planning/events', { id: ids.Fair, name: 'Fair', channel: 'Another venue (hall or hotel)', date: '2026-10-01', costAmount: 'Rs 45,000', costCurrency: 'NPR' });
  assert.deepStrictEqual([rs.json.entry.cost, rs.json.entry.costCurrency], [45000, 'NPR']);
});

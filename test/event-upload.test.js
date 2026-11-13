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
  assert.deepStrictEqual(pre.counts, { new: 2, link: 1, already: 0, other: 1, problem: 2 });
  assert.strictEqual((await acts()).activities.find((a) => a.name === 'ABC event').leads, 0, 'the review saved nothing');
  // Carried out.
  const done = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: list })).json;
  assert.deepStrictEqual([done.added, done.linked, done.failed.length], [2, 1, 0]);
  const abc = (await acts()).activities.find((a) => a.name === 'ABC event');
  assert.deepStrictEqual([abc.leads, abc.costPerLead], [3, 6667], 'three students share the Rs 20,000');
  const card = (await admin('GET', `/api/cards/${early}`)).json;
  assert.strictEqual(card.student.source, 'Events');
  assert.match(card.card.profile.sourceDetail, /^ABC event/);
  assert.match(card.card.profile.sourceRemarks, /Before: Social Media: Facebook page/, 'the earlier source is kept');
  assert.match(card.card.notes.at(-1).text, /Tagged with ABC event/);
  const wb = (await admin('GET', '/api/data')).json;
  const all = wb.sheets.flatMap((s) => s.rows);
  assert.strictEqual(all.filter((r) => r['FIRST NAME'] === 'Early').length, 1, 'not added twice');
  assert.ok(all.filter((r) => r['FIRST NAME'] === 'New').every((r) => r['APPLICATION STATUS'] === 'Inquiry' && r['STUDENT SOURCE'] === 'Events'));
  assert.strictEqual((await acts()).activities.find((a) => a.name === 'Fair').leads, 1, 'the student of another event was not moved');
  // The same list again changes nothing.
  const again = (await admin('POST', `/api/activities/${ids['ABC event']}/students`, { rows: list, preview: true })).json;
  assert.deepStrictEqual([again.counts.new, again.counts.link, again.counts.already], [0, 0, 3]);
  // Its students, with the latest note, and the Came from tags (the follow-up team sees the tags of the students it sees).
  const people = (await admin('GET', `/api/activities/${ids['ABC event']}/students`)).json.students;
  assert.strictEqual(people.length, 3);
  assert.ok(people.every((s) => s.lastNote));
  const tags = (await follow('GET', '/api/event-tags')).json;
  assert.ok(Object.values(tags.rows).every((label) => typeof label === 'string'));
  assert.ok(!JSON.stringify(tags).includes('20000'), 'no cost in the tags');
});

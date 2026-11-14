// Who sees what of Partner Universities, B2B Partners, Agents and Message templates (student-details/partner-access.js), and a
// branch giving the Application and Mock Teams tasks about its own students. All names and details here are made up.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('partners: the Manager sees the commission, the teams and branches do not, the Follow-up Team not at all; branches give tasks', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-access-'));
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir };
  delete env.ANTHROPIC_API_KEY;
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', 'student-details'), env, stdio: 'ignore' });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const person = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const tx = await res.text(); let json = null; try { json = JSON.parse(tx); } catch (e) { /* not JSON */ }
    return { status: res.status, json, location: res.headers.get('location') };
  }; };
  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' });
  await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' });
  const login = async (username, departments, manager = false) => {
    const made = (await admin('POST', '/api/users', { username, name: username, email: '', departments, ...(manager ? { manager: true } : {}) })).json;
    const p = person(); await p('POST', '/api/login', { username, password: made.temporaryPassword }); await p('POST', '/api/login/new-password', { password: 'Team-Strong-2026' }); return p;
  };
  const asha = await login('asha', ['application']);
  const bikram = await login('bikram', ['mock']);
  const chitwan = await login('chitwan', ['chitwan']);
  const sunita = await login('sunita', ['followup']);
  const chief = await login('chief', [], true);

  // A partner university and a B2B partner with a commission, a login and notes (made up).
  const uni = (await admin('POST', '/api/direct', { name: 'Example University' })).json;
  assert.strictEqual((await admin('POST', `/api/direct/${uni.id}`, { name: 'Example University', apply: 'https://apply.example.org', applyUser: 'nieclogin', applyPassword: 'secret-pass', slabs: [{ level: 'PG', students: '1 to 5', commission: '15%' }], paymentTerms: 'Paid in March', notes: 'Bonus 2%', contacts: [{ name: 'Ann Example', email: 'ann@example.org' }] })).status, 200);
  const partner = (await admin('POST', '/api/b2b', { name: 'Example Partner' })).json;
  assert.strictEqual((await admin('POST', `/api/b2b/${partner.id}`, { name: 'Example Partner', apply: 'https://portal.example.org', applyUser: 'u1', applyPassword: 'p1', commissions: [{ intake: 'Jan Intake 2027', link: 'https://example.org/commission' }], notes: 'Rate 10%' })).status, 200);

  const SECRET = /15%|Paid in March|Bonus 2%|secret-pass|nieclogin|Rate 10%|example\.org\/commission|"p1"|"u1"/;
  const NO_LOGIN_SECRET = /15%|Paid in March|Bonus 2%|Rate 10%|example\.org\/commission/; // what even the Application Team never gets
  for (const [who, p] of [['asha', asha], ['bikram', bikram], ['chitwan', chitwan]]) {
    const list = await p('GET', '/api/direct');
    assert.strictEqual(list.status, 200, `${who} opens Partner Universities`);
    const one = await p('GET', `/api/direct/${uni.id}`);
    // The portal login is for Admin and the Application Team only (the owner, 14 Nov 2026).
    const seen = JSON.stringify(list.json) + JSON.stringify(one.json);
    if (who === 'asha') assert.ok(!NO_LOGIN_SECRET.test(seen) && one.json.applyPassword === 'secret-pass' && one.json.applyUser === 'nieclogin', 'the Application Team gets the login, still no commission or notes');
    else assert.ok(!SECRET.test(seen), `${who} gets no commission, notes or login`);
    assert.strictEqual(one.json.applyPortal, 'https://apply.example.org/', `${who} sees where to submit`);
    assert.strictEqual(one.json.contacts[0].name, 'Ann Example', `${who} sees the contacts`);
    assert.strictEqual((await p('POST', `/api/direct/${uni.id}`, { name: 'Changed' })).status, 403, `${who} cannot change it`);
    assert.strictEqual((await p('GET', '/partner-universities')).status, 200);
    assert.strictEqual((await p('GET', '/message-templates')).status, 200, `${who} reads the templates`);
  }
  for (const [who, p] of [['asha', asha], ['bikram', bikram]]) {
    const b = await p('GET', '/api/b2b');
    assert.strictEqual(b.json.access, 'team');
    const seenB = JSON.stringify(b.json) + JSON.stringify((await p('GET', `/api/b2b/${partner.id}`)).json);
    if (who === 'asha') assert.ok(!NO_LOGIN_SECRET.test(seenB) && /"applyPassword":"p1"/.test(seenB), 'the Application Team gets the B2B login, not the commission');
    else assert.ok(!SECRET.test(seenB), `${who} gets no B2B commission or login`);
    assert.strictEqual((await p('GET', '/api/agents')).status, 200);
    assert.strictEqual((await p('POST', '/api/b2b', { name: 'X' })).status, 403);
  }
  assert.strictEqual((await chitwan('GET', '/api/b2b')).status, 403, 'a branch has no B2B Partners');
  assert.strictEqual((await chitwan('GET', '/api/agents')).status, 403, 'a branch has no Agents');
  assert.strictEqual((await chitwan('GET', '/b2b-partners')).status, 302);
  assert.strictEqual((await sunita('GET', '/api/direct')).status, 403, 'the Follow-up Team has no Partner Universities');
  assert.strictEqual((await sunita('GET', '/partner-universities')).status, 302);
  assert.strictEqual((await sunita('GET', '/message-templates')).status, 302);
  const mgr = (await chief('GET', `/api/direct/${uni.id}`)).json;
  assert.deepStrictEqual([mgr.slabs[0].commission, mgr.paymentTerms, mgr.applyPassword], ['15%', 'Paid in March', undefined], 'the Manager sees the commission, not the login');
  assert.strictEqual((await chief('GET', `/api/b2b/${partner.id}`)).json.commissions[0].intake, 'Jan Intake 2027');
  assert.strictEqual((await chief('POST', `/api/direct/${uni.id}`, { name: 'Changed' })).status, 403, 'the Manager only looks');
  assert.strictEqual((await admin('GET', `/api/direct/${uni.id}`)).json.applyPassword, 'secret-pass', 'Admin sees everything');

  // A partner address that is not one partner's id is "not found" (it used to answer with the whole list, and the page broke).
  assert.strictEqual((await admin('GET', '/api/agents/not-an-id')).status, 404);
  assert.strictEqual((await asha('GET', '/api/b2b/ag0000000000')).status, 404);
  // The visa target can be due before teaching starts (that is normal), so saving it is not refused.
  const sheetId = (await admin('GET', '/api/data')).json.sheets[0].id;
  assert.strictEqual((await admin('POST', `/api/planning/targets/${sheetId}`, { visas: 40, byDate: '2027-01-10', startDate: '2027-01-20' })).status, 200);

  // A branch gives its own student a task for the Application or the Mock Team, or for Admin (no other team), and removes only its own tasks.
  const id = (await admin('POST', '/api/students/new', { stage: 'Application Stage', fields: { 'FIRST NAME': 'Mina', 'LAST NAME': 'Example', 'CONTACT NUMBER': '9800000002', 'STUDENT SOURCE': 'Chitwan Branch' } })).json.id;
  const card = (await chitwan('GET', `/api/cards/${id}`)).json;
  assert.deepStrictEqual(card.assignTeams.map((x) => x.id), ['application', 'mock', 'head']);
  assert.strictEqual((await chitwan('POST', `/api/cards/${id}/tasks`, { team: 'followup', text: 'x' })).status, 400);
  const given = await chitwan('POST', `/api/cards/${id}/tasks`, { team: 'application', text: 'Submit to Example University' });
  assert.strictEqual(given.status, 200);
  const taskId = given.json.card.tasks[0].id;
  assert.ok((await asha('GET', '/api/tasks')).json.tasks.some((x) => x.text === 'Submit to Example University'), 'the Application Team sees it on Today');
  assert.ok((await chitwan('GET', '/api/tasks')).json.tasks.some((x) => x.given && x.text === 'Submit to Example University'), 'the branch sees the task it gave');
  assert.strictEqual((await chitwan('POST', `/api/cards/${id}/tasks/${taskId}`, { done: true })).status, 403, 'the team ticks it, not the branch');
  assert.strictEqual((await asha('POST', `/api/cards/${id}/tasks/${taskId}`, { done: true })).status, 200);
  assert.strictEqual((await asha('POST', `/api/cards/${id}/tasks/${taskId}/delete`, {})).status, 403);
  assert.strictEqual((await chitwan('POST', `/api/cards/${id}/tasks/${taskId}/delete`, {})).status, 200, 'the branch removes the task it gave');
});

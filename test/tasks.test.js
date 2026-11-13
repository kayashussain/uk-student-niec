// Tasks: Admin or the Manager gives a team a task about a student; only that team (or Admin and the Manager) marks it complete or
// not; the team sees the student while the task is open, other teams do not; nobody else gives or removes tasks.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('tasks: given by Admin, seen and ticked by that team only, listed for Admin with who did it', { timeout: 120000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-tasks-'));
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir };
  delete env.ANTHROPIC_API_KEY;
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', 'student-details'), env, stdio: 'ignore' });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }
  const person = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) } });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const tx = await res.text(); let json = null; try { json = JSON.parse(tx); } catch (e) { /* not JSON */ }
    return { status: res.status, json };
  }; };
  const admin = person();
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  await admin('POST', '/api/login/first-admin', { setupCode: code, username: 'owner', name: 'Owner' });
  await admin('POST', '/api/login/new-password', { password: 'Strong-Pass-2026' });
  const login = async (username, departments) => {
    const made = (await admin('POST', '/api/users', { username, name: username, email: '', departments })).json;
    const p = person(); await p('POST', '/api/login', { username, password: made.temporaryPassword }); await p('POST', '/api/login/new-password', { password: 'Team-Strong-2026' }); return p;
  };
  const mock = await login('bikram', ['mock']);
  const app = await login('asha', ['application']);
  const id = (await admin('POST', '/api/students/new', { stage: 'Inquiry', fields: { 'FIRST NAME': 'Sita', 'LAST NAME': 'Rai', 'CONTACT NUMBER': '9800000001' } })).json.id;
  assert.strictEqual((await mock('GET', `/api/cards/${id}`)).status, 404, 'the mock team does not see an Inquiry student');
  assert.strictEqual((await mock('POST', `/api/cards/${id}/tasks`, { team: 'mock', text: 'x' })).status, 404, 'a team cannot give tasks');
  assert.strictEqual((await admin('POST', `/api/cards/${id}/tasks`, { team: 'nobody', text: 'x' })).status, 400);
  const given = await admin('POST', `/api/cards/${id}/tasks`, { team: 'mock', text: 'Book the mock interview', due: '2026-11-20' });
  assert.strictEqual(given.status, 200);
  const taskId = given.json.card.tasks[0].id;
  assert.strictEqual((await mock('GET', `/api/cards/${id}`)).status, 200, 'the mock team sees the student while the task is open');
  assert.strictEqual((await app('GET', `/api/cards/${id}`)).status, 404, 'another team does not');
  const mine = (await mock('GET', '/api/tasks')).json.tasks;
  assert.deepStrictEqual(mine.map((x) => x.text), ['Book the mock interview']);
  assert.strictEqual((await app('GET', '/api/tasks')).json.tasks.length, 0);
  assert.strictEqual((await mock('POST', `/api/cards/${id}/tasks/${taskId}/delete`, {})).status, 403, 'a team cannot remove a task');
  assert.strictEqual((await mock('POST', `/api/cards/${id}/tasks/${taskId}`, { done: true })).status, 200);
  const all = (await admin('GET', '/api/tasks')).json.tasks;
  assert.deepStrictEqual([all[0].done, all[0].doneBy, all[0].teamLabel], [true, 'bikram', 'Mock Team']);
  assert.strictEqual((await mock('POST', `/api/cards/${id}/tasks/${taskId}`, { done: false })).status, 200, 'marked not complete again');
  assert.strictEqual((await admin('POST', `/api/cards/${id}/tasks/${taskId}/delete`, {})).status, 200);
  assert.strictEqual((await admin('GET', `/api/cards/${id}`)).json.card.tasks.length, 0);
});

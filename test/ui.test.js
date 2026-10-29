// Browser tests of the screens people actually use: log in, edit, delete with a confirmation, search, team rules.
// They start the real Student Details server on a spare port with its own empty data folder, and drive it in
// Chromium. Where Playwright (or its browser) isn't installed, as on a production server, they skip themselves,
// so `npm test` in deploy.sh is not held up.
const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

let playwright = null;
try { playwright = require('playwright'); } catch (e) { /* not installed: skipped below */ }
let axeSource = null; // the accessibility checker, if installed (npm i -D axe-core)
try { axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch (e) { /* the accessibility check skips itself */ }

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('screens: log in, edit, delete, search, team rules, Fact File', { timeout: 180000, skip: !playwright && 'Playwright is not installed' }, async (t) => {
  let browser;
  try { browser = await playwright.chromium.launch(); } catch (e) { t.skip('no Chromium browser available'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'niec-ui-'));
  const port = await freePort();
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..', 'student-details'), env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir }, stdio: 'ignore',
  });
  t.after(async () => { server.kill(); await browser.close(); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(base + '/login')).ok) break; } catch (e) { /* not up yet */ } await wait(250); }

  // ---- an Admin, a team member and some students, made through the same API the login page uses ----
  const admin = await browser.newContext({ baseURL: base });
  const code = fs.readFileSync(path.join(dir, 'first-admin-code.txt'), 'utf8').trim();
  assert.ok((await admin.request.post('/api/login/first-admin', { data: { setupCode: code, username: 'owner', name: 'Owner Test' } })).ok());
  assert.ok((await admin.request.post('/api/login/new-password', { data: { password: 'Strong-Pass-2026' } })).ok());
  const current = await (await admin.request.get('/api/data')).json();
  const sheet = current.sheets[0];
  sheet.rows = Array.from({ length: 12 }, (_, i) => {
    const row = { _id: 'row-ui' + i };
    sheet.columns.forEach((c) => { row[c] = ''; });
    Object.assign(row, { 'FIRST NAME': 'Student' + i, 'LAST NAME': 'Test', 'APPLICATION STATUS': i < 4 ? 'Application Stage' : 'Mock Stage', 'STUDENT SOURCE': 'Visitor', 'GROSS FEE': '16000' });
    return row;
  });
  assert.ok((await admin.request.post('/api/data', { data: { sheets: current.sheets, activeSheetId: current.activeSheetId, baseRevision: current.revision } })).ok());
  const made = await admin.request.post('/api/users', { data: { username: 'asha', name: 'Asha Team', email: '', departments: ['application'] } });
  const temp = (await made.json()).temporaryPassword;
  const team = await browser.newContext({ baseURL: base });
  assert.ok((await team.request.post('/api/login', { data: { username: 'asha', password: temp } })).ok());
  assert.ok((await team.request.post('/api/login/new-password', { data: { password: 'Team-Strong-2026' } })).ok());
  const rowCount = async () => (await (await admin.request.get('/api/data')).json()).sheets[0].rows.length;
  const open = async (ctx, url) => {
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
    await page.goto(url);
    return page;
  };

  await t.test('the login page shows or hides the password and explains a wrong one', async () => {
    const page = await (await browser.newContext({ baseURL: base })).newPage();
    await page.goto('/login');
    await page.fill('#username', 'owner');
    await page.fill('#password', 'not-the-password');
    await page.click('.pw-toggle');
    assert.strictEqual(await page.getAttribute('#password', 'type'), 'text');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#error:not([hidden])');
    assert.match(await page.textContent('#error'), /Wrong username or password/);
    await page.close();
  });

  await t.test('Student Details lists students and has no script errors', async () => {
    const page = await open(admin, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    assert.match(await page.textContent('#rowCount'), /^12 of 12 rows/);
    assert.deepStrictEqual(page.errors, []);
    await page.close();
  });

  await t.test('a search with no match shows a friendly note, and clearing it brings the students back', async () => {
    const page = await open(admin, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    await page.fill('#search', 'zzzzzz');
    await page.waitForSelector('#sheetEmpty:not([hidden])');
    await page.click('#clearFilters');
    await page.waitForSelector('#sheetEmpty', { state: 'hidden' });
    assert.match(await page.textContent('#rowCount'), /^12 of 12/);
    await page.close();
  });

  await t.test('deleting a student asks first, Cancel keeps them, Delete removes them', async () => {
    const page = await open(admin, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    await page.click('#body tr:nth-child(3) td.col-idx');
    await page.click('#delRow');
    await page.waitForSelector('dialog.ui-dialog[open]');
    assert.match(await page.textContent('.ui-dialog h2'), /Delete this student/);
    await page.click('.ui-dialog button:has-text("Cancel")');
    await wait(500);
    assert.strictEqual(await rowCount(), 12, 'cancelled: nothing deleted');
    await page.click('#delRow');
    await page.waitForSelector('dialog.ui-dialog[open]');
    await page.click('.ui-dialog .ui-ok');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('All changes saved'), null, { timeout: 10000 });
    assert.strictEqual(await rowCount(), 11, 'confirmed: one student removed');
    assert.deepStrictEqual(page.errors, []);
    await page.close();
  });

  await t.test('an edit is confirmed, saved and still there after a reload', async () => {
    const page = await open(admin, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    await page.locator('#body tr:not(.pad-row)').nth(1).locator('td').nth(1).click();
    await page.keyboard.type('Bank statement is missing');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.eg-box');
    await page.click('.eg-ok');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('All changes saved'), null, { timeout: 10000 });
    await page.reload();
    await page.waitForSelector('#body tr:not(.pad-row)');
    assert.strictEqual(await page.locator('#body tr:not(.pad-row)').nth(1).locator('td').nth(1).textContent(), 'Bank statement is missing');
    await page.close();
  });

  await t.test('a team member sees only their stage and is asked before moving a student on', async () => {
    const page = await open(team, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    const shown = await page.textContent('#rowCount');
    assert.match(shown, /^(3|4) of (3|4) rows/, 'only the Application Stage students');
    const select = page.locator('#body tr:not(.pad-row)').first().locator('select.status-select').nth(1);
    await select.focus();
    await select.selectOption('Mock Stage');
    await page.waitForSelector('dialog.ui-dialog[open]');
    assert.match(await page.textContent('.ui-dialog h2'), /Move this student on/);
    await page.click('.ui-dialog .ui-ok');
    await page.waitForFunction(() => /rows/.test(document.querySelector('#rowCount').textContent) && !/^4 of/.test(document.querySelector('#rowCount').textContent), null, { timeout: 10000 });
    assert.deepStrictEqual(page.errors, []);
    await page.close();
  });

  await t.test('the Fact File finds a course, and an unsaved edit is guarded', async () => {
    const page = await open(admin, '/fact-file');
    await page.waitForSelector('.uni-card:not(.skeleton)');
    await page.fill('#search', 'cyber security');
    await page.waitForSelector('.matches');
    assert.ok((await page.locator('.uni-card').count()) > 5, 'many universities teach it');
    assert.match(await page.textContent('#count'), /universities match/);
    await page.locator('.uni-card').first().click();
    await page.waitForSelector('.doc');
    await page.click('text=Edit');
    await page.waitForSelector('.editor');
    await page.fill('.editor textarea >> nth=0', 'A change that is not saved');
    await page.click('.sticky-actions button:has-text("Cancel")');
    await page.waitForSelector('dialog.ui-dialog[open]');
    assert.match(await page.textContent('.ui-dialog h2'), /Leave without saving/);
    await page.click('.ui-dialog button:has-text("Keep editing")');
    assert.ok(await page.isVisible('.editor'), 'still editing');
    assert.deepStrictEqual(page.errors, []);
    await page.close();
  });

  await t.test('every page opens for Admin without script errors', async () => {
    for (const url of ['/dashboard', '/users', '/activity', '/fact-file']) {
      const page = await open(admin, url);
      await page.waitForLoadState('networkidle');
      assert.deepStrictEqual(page.errors, [], url);
      await page.close();
    }
  });

  await t.test('no accessibility violations on the main pages, in light and dark', { skip: !axeSource && 'axe-core is not installed' }, async () => {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ baseURL: base, storageState: await admin.storageState(), colorScheme: scheme, viewport: { width: 1440, height: 900 } });
      for (const url of ['/students', '/dashboard', '/users', '/activity', '/fact-file']) {
        const page = await ctx.newPage();
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await page.evaluate(axeSource);
        const result = await page.evaluate(() => axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] } }));
        const found = result.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target.join(' ')}`);
        assert.deepStrictEqual(found, [], `${scheme} ${url}`);
        await page.close();
      }
      await ctx.close();
    }
  });
});

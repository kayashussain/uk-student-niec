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
    cwd: path.join(__dirname, '..', 'student-details'),
    env: { ...process.env, PORT: String(port), STUDENT_DETAILS_DATA_DIR: dir, COUNSELOR_DATA_DIR: path.join(dir, 'incentive'), INCENTIVE_PASSWORD: 'Test Gate Pass 1' }, stdio: 'ignore',
  });
  t.after(async () => { server.kill(); await browser.close(); });
  const base = `http://127.0.0.1:${port}`;
  const incentiveBase = base + '/incentive'; // inside the same app, behind Admin and the Incentive password
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
    Object.assign(row, { 'FIRST NAME': 'Student' + i, 'LAST NAME': 'Test', 'APPLICATION STATUS': i === 11 ? 'Visa Issued' : i < 4 ? 'Application Stage' : 'Mock Stage', 'STUDENT SOURCE': 'Visitor', 'GROSS FEE': '16000' });
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

  await t.test('Incentive asks for its password every time: after visiting Student Details, and after a reload', async () => {
    const pass = 'Test Gate Pass 1';
    assert.ok((await admin.request.post(incentiveBase + '/api/unlock', { data: { password: pass } })).ok());
    const page = await open(admin, incentiveBase + '/');
    await page.waitForSelector('#rows tr');
    await page.goto('/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    await page.goto(incentiveBase + '/');
    await page.waitForSelector('#pw', { timeout: 10000 }); // back to Incentive after Student Details: asked again
    assert.strictEqual(await page.locator('#rows').count(), 0, 'no figures before the password');
    await page.fill('#pw', pass);
    await page.click('#go');
    await page.waitForSelector('#rows tr');
    await page.reload();
    await page.waitForSelector('#pw', { timeout: 10000 }); // a reload asks again too
    await page.close();
  });

  await t.test('a date cell looks the same before it is touched, while the mouse is over it and after it is clicked', async () => {
    const page = await open(admin, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    const col = await page.$$eval('#headerRow th', (ths) => ths.findIndex((th) => th.dataset.col === 'APPLICATION SUBMISSION DATE'));
    const td = page.locator('#body tr:not(.pad-row)').first().locator('td').nth(col);
    const look = () => td.evaluate((el) => ({ icon: getComputedStyle(el).backgroundImage.startsWith('url('), height: Math.round(el.getBoundingClientRect().height), padding: getComputedStyle(el).padding }));
    const before = await look();
    assert.ok(before.icon, 'a date cell shows its calendar icon');
    await page.mouse.move(5, 5);
    await td.hover();
    assert.deepStrictEqual(await look(), before, 'hovering the row changes nothing about the cell');
    await td.click({ position: { x: 20, y: 10 } });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    assert.deepStrictEqual(await look(), before, 'clicking the cell by mistake changes nothing about how it looks');
    assert.deepStrictEqual(await page.evaluate(() => (window.__rowsChanged || 0)), 0);
    await page.close();
  });

  await t.test('Student Source offers Language Classes, and the Dashboard counts students who came from them', async () => {
    const fresh = await (await admin.request.get('/api/data')).json();
    fresh.sheets[0].rows[1]['STUDENT SOURCE'] = 'Language Classes';
    assert.ok((await admin.request.post('/api/data', { data: { sheets: fresh.sheets, activeSheetId: fresh.activeSheetId, baseRevision: fresh.revision } })).ok());
    const page = await open(admin, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    const col = await page.$$eval('#headerRow th', (ths) => ths.findIndex((th) => th.dataset.col === 'STUDENT SOURCE'));
    const select = page.locator('#body tr:not(.pad-row)').first().locator('td').nth(col).locator('select');
    await select.focus();
    await page.waitForTimeout(300);
    assert.ok((await select.locator('option').allTextContents()).includes('Language Classes'), 'Language Classes is one of the choices');
    await page.close();
    const dash = await (await admin.request.get('/api/dashboard')).json();
    assert.ok(JSON.stringify(dash).includes('Language Classes'), 'the Dashboard counts students whose source is Language Classes');
  });

  await t.test('columns fit what is in them: a very long email is shown in full, and nothing else in the first rows is cut off', async () => {
    const fresh = await (await admin.request.get('/api/data')).json();
    fresh.sheets[0].rows[0].EMAIL = 'a.very.long.student.email.address.for.testing@gmail.com';
    assert.ok((await admin.request.post('/api/data', { data: { sheets: fresh.sheets, activeSheetId: fresh.activeSheetId, baseRevision: fresh.revision } })).ok());
    const page = await open(admin, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    const cut = await page.$$eval('#body tr:not(.pad-row) td.text', (cells) => cells.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent));
    assert.deepStrictEqual(cut, [], 'no text is cut off');
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
    // The box closes a moment before the change is made, so wait for the server to have it (not just for "saved").
    for (let i = 0; i < 50 && (await rowCount()) !== 11; i += 1) await wait(200);
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

  await t.test('if the login runs out with unsaved changes, the page stays and saves once the login is back', async () => {
    const page = await open(admin, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    let loginEnded = true;
    await page.route('**/api/data', (route) => (route.request().method() === 'POST' && loginEnded
      ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Please log in again.' }) })
      : route.continue()));
    await page.locator('#body tr:not(.pad-row)').nth(3).locator('td').nth(1).click();
    await page.keyboard.type('Typed while the login had ended');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.eg-box');
    await page.click('.eg-ok');
    await page.waitForFunction(() => /login ended/i.test(document.querySelector('#status').textContent), null, { timeout: 10000 });
    assert.match(new URL(page.url()).pathname, /\/students/, 'not sent to the login page');
    assert.ok(await page.isVisible('.ui-toast.error'), 'the person is told what to do');
    loginEnded = false; // logged in again in another tab
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('All changes saved'), null, { timeout: 15000 });
    const saved = await (await admin.request.get('/api/data')).json();
    assert.ok(saved.sheets[0].rows.some((r) => r['REMARKS'] === 'Typed while the login had ended'), 'the change was kept and saved');
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
    await admin.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('button:has-text("Copy summary")');
    await page.waitForSelector('.ui-toast.success');
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^\*.+\*[\s\S]*Nepal International Educational Consultancy$/, 'a WhatsApp-ready summary was copied');
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

  await t.test('Incentive: a visa-issued student appears, an incentive is confirmed, saved and added up with TDS', async () => {
    // Admin is asked for the Incentive password (and nothing else) before the page opens.
    const gate = await open(admin, incentiveBase + '/');
    await gate.waitForSelector('#pw');
    assert.strictEqual(await gate.locator('#rows').count(), 0, 'the figures are not on the page before the password');
    await gate.fill('#pw', 'not the password');
    await gate.click('#go');
    await gate.waitForFunction(() => document.querySelector('#err').textContent.length > 0);
    assert.match(await gate.textContent('#err'), /not right/);
    await gate.fill('#pw', 'Test Gate Pass 1');
    await gate.click('#go');
    await gate.waitForSelector('#rows tr');
    assert.deepStrictEqual(gate.errors.filter((e) => !/40[13]/.test(e)), []);
    const page = gate; // closing the page would lock Incentive again (that is the point), so carry on in it
    await page.waitForSelector('#rows tr');
    assert.strictEqual(await page.locator('#rows tr').count(), 1, 'only the Visa Issued student is listed');
    // The Incentive page has the shared NIEC header, a Student Source column, and no (i) on University Partner.
    assert.strictEqual(await page.locator('.niec-header').count(), 1, 'the shared NIEC header is on the Incentive page');
    const heads = await page.locator('#headRow th').allTextContents();
    assert.ok(heads.some((h) => h.trim() === 'University Partner'), 'University Partner has no (i) button');
    assert.deepStrictEqual(heads.slice(0, 5).map((h) => h.trim()), ['S.N', 'Student Source', 'Student Name', 'Course Name', 'University Name'], 'Student Source comes first, right after S.N');
    assert.match(await page.textContent('#rows tr'), /Student11/);
    // The Enrollment Incentive (NPR) cell, found by its column heading so adding a synced column does not break this.
    const headings = await page.locator('#headRow th').allTextContents();
    const enrollmentCol = headings.findIndex((h) => h.replace(/\s*ⓘ\s*$/, '').trim() === 'Enrollment Incentive') - 1; // minus the S.N column
    assert.ok(enrollmentCol > 0, 'the Enrollment Incentive column is there');
    await page.locator(`#rows tr td[data-ci="${enrollmentCol}"]`).first().click();
    await page.keyboard.type('10000');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.eg-box');
    await page.click('.eg-ok');
    await page.waitForFunction(() => document.querySelector('#sumTotalCommissions').textContent === '10,000.00', null, { timeout: 8000 });
    assert.strictEqual(await page.textContent('#sumTds'), '1,500.00', 'TDS is 15% of the net incentives');
    assert.strictEqual(await page.textContent('#sumNetPayable'), '8,500.00');
    for (let i = 0; i < 50; i += 1) {
      const saved = await (await admin.request.get(incentiveBase + '/api/commissions')).json();
      if (Object.values(saved).some((c) => c.enrollmentCommission === 10000)) break;
      await wait(200);
    }
    const saved = await (await admin.request.get(incentiveBase + '/api/commissions')).json();
    assert.ok(Object.values(saved).some((c) => c.enrollmentCommission === 10000), 'saved on the server');
    assert.deepStrictEqual(page.errors.filter((e) => !/exchange|Failed to load resource|net::/i.test(e)), []);
    await page.close();
  });

  await t.test('Incentive: pounds and percent in the three incentive columns, and a branch student leaves the head office 30%', async () => {
    // A known exchange rate for today (the test has no internet): £1 = Rs 200.
    const { localDate } = require('../shared/server-utils');
    fs.mkdirSync(path.join(dir, 'incentive'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'incentive', 'exchange-rate-cache.json'), JSON.stringify({ date: localDate(), rate: 200, fetchedOn: localDate(), fetchedAt: new Date().toISOString() }));
    assert.ok((await admin.request.post(incentiveBase + '/api/unlock', { data: { password: 'Test Gate Pass 1' } })).ok());
    const page = await open(admin, incentiveBase + '/');
    await page.waitForSelector('#rows tr');
    const heads = (await page.locator('#headRow th').allTextContents()).map((h) => h.replace(/\s*ⓘ\s*$/, '').trim());
    const col = (label) => heads.indexOf(label) - 1; // minus the S.N column
    const cell = (label) => page.locator(`#rows tr td[data-ci="${col(label)}"]`).first();
    const enter = async (label, text) => {
      await cell(label).click();
      await page.keyboard.press('F2'); // start editing, then replace what is in the cell (the test tool types a pound sign as text, not as a key)
      await page.keyboard.press('Control+A');
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await page.waitForSelector('.eg-box');
      await page.click('.eg-ok');
      await page.waitForTimeout(250);
    };
    await enter('Commission %', '10'); // 10% of the £16,000 tuition: a £1,600 commission
    await enter('Enrollment Incentive', '£100'); // was Rs 10,000 from the earlier test: now pounds
    const unit = (label) => cell(label).locator('select.unit-select').inputValue();
    const amount = async (label) => (await cell(label).locator('.amount').textContent()).trim();
    assert.strictEqual(await unit('Enrollment Incentive'), '1', 'typing a pound sign sets the dropdown to pounds');
    assert.strictEqual(await amount('Enrollment Incentive'), '100.00');
    await enter('Enrollment Incentive from University', '10%'); // 10% of £1,600 = £160
    assert.strictEqual(await unit('Enrollment Incentive from University'), '2', 'percent');
    assert.strictEqual(await amount('Enrollment Incentive from University'), '10');
    await enter('New Partnership Incentive', '5000'); // a plain number in a fresh cell is rupees
    assert.strictEqual(await unit('New Partnership Incentive'), '0', 'rupees');
    assert.strictEqual(await amount('New Partnership Incentive'), '5,000.00');
    // £100 x 200 + 10% of £1,600 (£160) x 200 + Rs 5,000
    await page.waitForFunction(() => document.querySelector('#sumTotalCommissions').textContent === '57,000.00', null, { timeout: 8000 });
    assert.match(await cell('Enrollment Incentive').getAttribute('title'), /20,000\.00/, 'hovering says what it comes to in rupees');

    // A plain number keeps the unit: 600 in the pounds cell is £600.
    await enter('Enrollment Incentive', '600');
    assert.strictEqual(await unit('Enrollment Incentive'), '1');
    assert.strictEqual(await amount('Enrollment Incentive'), '600.00');

    // The unit can also be picked from the dropdown, without typing a symbol: Rs 600 instead of £600.
    await cell('Enrollment Incentive').locator('select.unit-select').selectOption('0');
    await page.waitForSelector('.eg-box');
    await page.click('.eg-ok');
    await page.waitForFunction(() => document.querySelector('#sumTotalCommissions').textContent === '37,600.00', null, { timeout: 8000 }); // Rs 600 + 10% of £1,600 at 200 (32,000) + Rs 5,000
    assert.strictEqual(await unit('Enrollment Incentive'), '0', 'the dropdown now says rupees');
    await cell('Enrollment Incentive').locator('select.unit-select').selectOption('1'); // and back to pounds
    await page.waitForSelector('.eg-box');
    await page.click('.eg-ok');
    await page.waitForFunction(() => document.querySelector('#sumTotalCommissions').textContent === '157,000.00', null, { timeout: 8000 }); // £600 at 200 = 120,000 + 32,000 + 5,000
    // Cancelling the question puts the dropdown back to what is saved, and the total does not move.
    await cell('Enrollment Incentive').locator('select.unit-select').selectOption('2');
    await page.waitForSelector('.eg-box');
    await page.click('.eg-cancel');
    await page.waitForFunction(() => !document.querySelector('.eg-box'));
    assert.strictEqual(await unit('Enrollment Incentive'), '1', 'back to pounds after Cancel');
    assert.strictEqual((await page.textContent('#sumTotalCommissions')).trim(), '157,000.00');

    // The saved record has the units.
    const saved = Object.values(await (await admin.request.get(incentiveBase + '/api/commissions')).json())[0];
    assert.strictEqual(saved.enrollmentCommissionUnit, 1);
    assert.strictEqual(saved.enrollmentCommissionUniUnit, 2);
    assert.ok(!saved.newPartnershipCommissionUnit, 'rupees is the default and is not saved as a unit');

    // Company Earnings: Student Source Visitor keeps all of the commission ...
    assert.strictEqual((await page.textContent('#earnGbp')).trim(), '£1,600.00');
    assert.strictEqual((await page.textContent('#earnBranch')).trim(), '£0.00');
    assert.strictEqual((await page.textContent('#earnHead')).trim(), '£1,600.00');
    await page.close();

    // ... and a student who came through a branch leaves the head office 30%.
    const fresh = await (await admin.request.get('/api/data')).json();
    const visa = fresh.sheets[0].rows.find((r) => r['APPLICATION STATUS'] === 'Visa Issued');
    visa['STUDENT SOURCE'] = 'Pokhara Branch';
    assert.ok((await admin.request.post('/api/data', { data: { sheets: fresh.sheets, activeSheetId: fresh.activeSheetId, baseRevision: fresh.revision } })).ok());
    assert.ok((await admin.request.post(incentiveBase + '/api/unlock', { data: { password: 'Test Gate Pass 1' } })).ok());
    const again = await open(admin, incentiveBase + '/');
    await again.waitForSelector('#rows tr');
    await again.waitForFunction(() => document.querySelector('#earnBranch').textContent.trim() === '£1,120.00', null, { timeout: 8000 });
    assert.strictEqual((await again.textContent('#earnGbp')).trim(), '£1,600.00', 'the total commission is shown as it was');
    assert.strictEqual((await again.textContent('#earnHead')).trim(), '£480.00', '30% of £1,600');
    assert.match(await again.textContent('#earnNpr'), /96,000\.00/, '£480 at Rs 200');
    // The list: who the branch took commission from, which branch, and how much.
    const list = (await again.locator('[data-branch-row]').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
    assert.ok(list.some((t) => /Taken by the branches/.test(t)), 'the list has a heading');
    assert.ok(list.some((t) => /Pokhara Branch/.test(t) && /commission £1,600\.00/.test(t) && /£1,120\.00/.test(t)), 'the student, the branch, the commission and the 70%: ' + list.join(' | '));
    assert.match(await again.textContent('#earnBranchRow'), /Total Branch Share Deducted/);
    // Company Earnings end in pounds, with the time the rate was fetched beside the rupee figure.
    assert.match(await again.textContent('#earnRateHint'), /£1 = 200 NPR, fetched /);

    // Payment Summary: the live rate with the time it was fetched, then the working.
    assert.match(await again.textContent('#sumRate'), /£1 = Rs 200/);
    assert.match(await again.textContent('#sumRateTime'), /fetched .*\d{4}/);
    assert.strictEqual((await again.textContent('#sumNprEntered')).trim(), '5,000.00');
    assert.strictEqual((await again.textContent('#sumGbpEntered')).trim(), '£760.00', '£600 typed in pounds + 10% of £1,600');
    assert.strictEqual((await again.textContent('#sumGbpConverted')).trim(), '152,000.00', '£760 at Rs 200');
    assert.strictEqual((await again.textContent('#sumTotalCommissions')).trim(), '157,000.00', '5,000 + 152,000');
    assert.strictEqual((await again.textContent('#sumNetPayable')).trim(), '133,450.00', '157,000 less 15% TDS (23,550)');

    // Part payments: add one, it is listed and Net Payable follows; add the rest and it reaches zero; remove one and it comes back.
    const addPayment = async (date, amount, note) => {
      await again.fill('#payDate', date);
      await again.fill('#payAmount', String(amount));
      await again.fill('#payNote', note || '');
      await again.click('#payAdd');
      await again.waitForSelector('.eg-box');
      await again.click('.eg-ok');
    };
    await addPayment('2026-10-20', 10000, 'first instalment');
    await again.waitForFunction(() => document.querySelector('#sumNetPayable').textContent.trim() === '123,450.00', null, { timeout: 8000 });
    assert.strictEqual((await again.textContent('#sumPayments')).trim(), '10,000.00');
    assert.match(await again.textContent('#payList'), /20 Oct 2026.*first instalment.*10,000\.00/s);
    await addPayment('2026-11-02', 123450);
    await again.waitForFunction(() => document.querySelector('#sumNetPayable').textContent.trim() === '0.00', null, { timeout: 8000 });
    assert.strictEqual(await again.locator('.pay-item').count(), 2);
    // The page saves a moment after the change; wait until the server has both payments.
    let savedPay = {};
    for (let i = 0; i < 40; i++) {
      savedPay = await (await admin.request.get(incentiveBase + '/api/advances')).json();
      if (Object.values(savedPay).some((e) => e.payments && e.payments.length === 2)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const entry = Object.values(savedPay).find((e) => e.payments && e.payments.length);
    assert.deepStrictEqual(entry.payments.map((p) => [p.date, p.amount]), [['2026-10-20', 10000], ['2026-11-02', 123450]], 'saved on the server with their dates');
    await again.locator('.pay-item').first().locator('[data-remove]').click();
    await again.waitForSelector('.eg-box');
    await again.click('.eg-ok');
    await again.waitForFunction(() => document.querySelector('#sumNetPayable').textContent.trim() === '10,000.00', null, { timeout: 8000 });
    assert.strictEqual(await again.locator('.pay-item').count(), 1);
    // A payment that is not a positive amount is refused by the server.
    const bad = await admin.request.put(incentiveBase + '/api/advances/' + encodeURIComponent(Object.keys(savedPay)[0] || 'x'), { data: { payments: [{ date: 'nope', amount: -5 }] } });
    assert.strictEqual(bad.status(), 400);
    await again.close();
  });

  await t.test('a team member colours a student row and Admin sees the colour', async () => {
    const page = await open(team, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    await page.click('#colorRow');
    assert.ok(!(await page.isVisible('.color-menu')), 'asks to pick a row first');
    const row = page.locator('#body tr:not(.pad-row)').first();
    await row.locator('td.col-idx').click();
    await page.click('#colorRow');
    await page.click('.color-menu .sheet-menu-item:has-text("Green")');
    assert.match(await page.locator('#body tr:not(.pad-row)').first().getAttribute('class'), /rc-green/);
    const bg = await page.locator('#body tr:not(.pad-row)').first().locator('td').nth(2).evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.notStrictEqual(bg, 'rgba(0, 0, 0, 0)');
    await wait(1500);
    const saved = (await (await admin.request.get('/api/data')).json()).sheets[0].rows.filter((r) => r._color === 'green');
    assert.strictEqual(saved.length, 1, 'saved on the server');
    const adminPage = await open(admin, '/students');
    await adminPage.waitForSelector('#body tr.rc-green');
    await adminPage.close();
    // and a colour outside the list is refused by the server
    const cur = await (await team.request.get('/api/data')).json();
    cur.sheets[0].rows[1]._color = 'hotpink';
    assert.strictEqual((await team.request.post('/api/data', { data: { sheets: cur.sheets, activeSheetId: cur.activeSheetId, baseRevision: cur.revision } })).status(), 403);
    await page.close();
  });

  await t.test('the Manager sees every student but can change nothing, and goes to the Dashboard', async () => {
    const made = await admin.request.post('/api/users', { data: { username: 'mgr', name: 'Manager Test', email: '', manager: true, departments: [] } });
    const manager = await browser.newContext({ baseURL: base });
    assert.ok((await manager.request.post('/api/login', { data: { username: 'mgr', password: (await made.json()).temporaryPassword } })).ok());
    assert.ok((await manager.request.post('/api/login/new-password', { data: { password: 'Manager-Strong-2026' } })).ok());
    const landing = await open(manager, '/');
    await landing.waitForURL('**/dashboard');
    await landing.close();
    const page = await open(manager, '/students');
    await page.waitForSelector('#body tr:not(.pad-row)');
    assert.ok(await page.isVisible('#viewOnly'), 'marked as view only');
    assert.ok(!(await page.isVisible('#addRow')), 'no Add student');
    assert.ok(!(await page.isVisible('#delRow')), 'no Delete rows');
    assert.match(await page.textContent('#rowCount'), /^\d+ of \d+ rows/);
    const cell = page.locator('#body tr:not(.pad-row)').first().locator('td').nth(1);
    const before = await cell.textContent();
    await cell.click();
    await page.keyboard.type('should not stick');
    await page.keyboard.press('Enter');
    await wait(900);
    assert.strictEqual(await cell.textContent(), before, 'the cell did not change');
    assert.strictEqual((await manager.request.post('/api/data', { data: { sheets: [], activeSheetId: 'x', baseRevision: 0 } })).status(), 403, 'the server refuses a save');
    assert.deepStrictEqual(page.errors, []);
    await page.close();
  });

  await t.test('Admin can download a backup of the students and the Fact File; a team member cannot', async () => {
    const students = await admin.request.get('/api/backup/students.json');
    assert.ok(students.ok());
    assert.match(students.headers()['content-disposition'], /attachment; filename="uk-student-niec-students-\d{4}-\d{2}-\d{2}\.json"/);
    assert.ok(Array.isArray((await students.json()).sheets), 'the whole workbook is in the file');
    const facts = await (await admin.request.get('/api/backup/fact-file.json')).json();
    assert.ok(facts.universities.length > 50);
    assert.strictEqual((await team.request.get('/api/backup/students.json')).status(), 403);
    const log = await (await admin.request.get('/api/activity?q=backup')).json();
    assert.ok(log.events.some((e) => e.action === 'Downloaded backup'), 'each download is in the Activity record');
    const page = await open(admin, '/activity#restore');
    await page.waitForSelector('#panel-restore:not([hidden])');
    assert.ok(await page.isVisible('#dlStudents'));
    assert.ok(await page.isVisible('#dlFacts'));
    await page.waitForSelector('#restoreNow:not(:empty)');
    assert.match(await page.textContent('#restoreNow'), /\d+ students?/);
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
      for (const url of ['/students', '/dashboard', '/users', '/activity', '/fact-file', incentiveBase + '/']) {
        if (url === incentiveBase + '/') await ctx.request.post('/incentive/api/unlock', { data: { password: 'Test Gate Pass 1' } }); // every other page locks it again
        const page = await ctx.newPage();
        await page.goto(url);
        if (url === incentiveBase + '/') await page.waitForSelector('#rows tr'); // it keeps a live connection open, so the network is never idle
        else await page.waitForLoadState('networkidle');
        await page.waitForTimeout(300);
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

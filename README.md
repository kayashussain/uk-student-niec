# UK Student NIEC

The student visa tracker and counsellor incentive tracker for Nepal International Educational Consultancy.
One login for everyone; each person sees only what their account allows.

| Part | What it is |
|---|---|
| **Student Details** (`student-details/`) | The sheet of students by intake, with live co-editing, the Dashboard, the Users and Activity pages (Admin), and the **Fact File** (one page per university: fees, entry requirements, English tests, courses, intakes and the application process, searchable by course). |
| **Student card** (`student.html`, `student-page.js`, `cards.js`, `portal-api.js`) | Opens from a double-click on a student's name or row number, from **Open card**, from Follow-ups and from the Fact File. Three tabs: **Details** (where the student came from exactly, the counselor, what the student has studied, notes and the next follow-up day), **University options** (the options prepared for the student, the Fact File assistant and a search of every course) and **Send a message** (a template for each step, with the history of what was sent). The sheet starts at Application Status: Remarks and Student Source are no longer columns of it (their data stays in the file); the source is chosen on the card and the notes replace Remarks. **+ Add student** is a form. Same visibility rules as the sheet (`shared/teams.js`). |
| **Messages** (`messages.js`, `templates.html`) | A ready-made email and WhatsApp text for each step (first reply, options, documents, offer, mock interview, payment, CAS, visa ...), filled in from the student, with the signature. The options email carries every option in one table and the checklist of documents to apply. Email goes from the office mailbox set up in `mail.json`; **Open in my email program** and **Copy email text** work without it; WhatsApp opens `wa.me` with the text. Nothing reads replies. Admin edits the templates and the signature. |
| **University options and the Fact File assistant** (`course-index.js`, `eligibility.js`, `finder.js`, `fact-finder.js`) | Every course of the Fact File as one searchable list with its fee, scholarship and link. The **Fact File assistant** (top of the Fact File page, and on a student card) takes a description of the student ("2.4 GPA, 6 year gap, IELTS 5.5, wants business in London under 16,000 pounds"), reads the grade, gap, English score, budget, level, city and intake from it, judges every course against the entry rules written in the Fact File, and lists who is eligible, likely eligible, or ruled out, each with the reason, the fee, the scholarship and the link. It runs inside the server: no outside service, no key, nothing leaves the system. It only judges rules the Fact File states; a course with no readable rule is marked so. Tick several options (or press **Send to a student** on a university page) and one email carries them all. |
| **B2B Partners** (`b2b.js`, `b2b.html`) | Admin only: the businesses NIEC works with, with terms, contacts, agreement dates and files, and the students and visas each has brought. Partner Universities also say whether the agreement is direct or through a B2B partner. |
| **Dashboard decision pages** (`insights-engine.js`, `planning.js`, `dashboard-insights.js`) | Beside the existing Numbers: **Decisions** (the business at a glance, the journey as a funnel, the weekly pace, target and forecast, what stands out with the evidence, reason, decision and measure, the Decision log), **Channels and events** (cost per student, application and visa by source and by where exactly, marketing spend, events, adverts, the busy months), **Universities and partners** (concentration risk, speed, agreements ending), **Team and students lost** (follow-ups, workload, why students leave, how complete the records are) and **Intake plan** (what each choice needs in applications and inquiries, the calendar, market notes and a printable intake proposal). Each page is for one intake, chosen at the top (a new sheet is a new intake). Admin writes the targets, spend, events, decisions and notes; the Manager reads. A rate from fewer than 10 students is starred and never used in a finding. |
| **Partner Universities** (`student-details/direct.js`, `direct-page.js`) | Admin only: the universities NIEC works with directly, with campus locations, commission slabs, payment terms, agreement dates and contacts. Agreement files (PDF, Word, image, up to 10 MB) can be uploaded per university. Stored in `direct-universities.json` and `direct-files/` in the data folder (never in git, never served as pages); not in the Advisor connector, and the Backup tab does not include them. |
| **Incentive** (`counselor-incentive/`) | Counsellor incentives and company earnings per intake. Runs inside the main app at `/incentive`: Admin only, behind its own password (`INCENTIVE_PASSWORD`). Reads the students from Student Details. |
| **Shared** (`shared/`) | Accounts and login, the header, the team access rules, notices and confirmation boxes, the server helpers. |
| **Gateway** (`gateway/`) | Just starts the one app on the port a host expects (Render, VPS). |

## Run it on your computer

```bash
npm start            # the site on http://localhost:8080 (Incentive at /incentive, set INCENTIVE_PASSWORD to open it)
```

The first time, the server writes a one-time setup code to `first-admin-code.txt` in its data folder (and prints it
in the log). Open `/login`, enter it, and create the owner (Admin) account. Needs Node 18 or newer; there is nothing
to install.

## Try it on your computer first

```bash
node scripts/local-demo.js     # made-up students and data, at http://localhost:8080 (log in as owner, password Demo-Password-2026)
```

Nothing real is in it and nothing leaves the computer (no email is sent). `--keep` starts it again on the demo folder as you left it.
Details and the other demo logins are at the top of `scripts/local-demo.js`.

## Tests

```bash
npm test
```

The rules, data and security checks run anywhere. The browser tests (`test/ui.test.js`: log in, edit, delete, search,
team and Manager rules, Fact File, Incentive, accessibility) run where Playwright and Chromium are installed
(`npm i -D playwright axe-core`) and skip themselves otherwise.

## Deploying and running it

- `CPANEL_DEPLOY.md`: Nest Nepal cPanel (the live setup).
- `DEPLOY.md`: Render or any server with `deploy.sh`.

Both explain accounts, backups, email and what is stored where. Data lives outside the code folder, so an update
never touches it. `/healthz` answers `{"ok":true}` for an uptime monitor.

## Claude Strategy Advisor connector (read-only)

Lets a Claude Project read the live sheet (every tab, row and column), the Dashboard numbers and the Fact File. It cannot
change any student or the Fact File. The only thing it can write is the Advisor's own notebook (`advisor-memory/` in the data
folder: preferences, how NIEC works, lessons; notes with emails or phone numbers are refused, and every save keeps a backup). It is off until you set `NIEC_ADVISOR_TOKEN` (a random secret of 32 or more characters) in the host
settings and restart. Then add this address in claude.ai (Settings, Connectors, Add custom connector):

```
https://<your-site>/advisor-mcp/<NIEC_ADVISOR_TOKEN>
```

Anyone with that address can read all students, so keep it private. To cut access off, remove or change the variable and restart.
Make a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### Incentive questions through the same connector

The connector above also answers questions about the **Incentive page**, with no second connector and no new address. After the
Student Details app restarts, Claude gets four more read-only tools: `get_incentive_overview`, `get_incentives` (every visa-issued
student with their **University Partner** (the agent), tuition fee, university commission and the incentives entered),
`get_payment_summary` (Payment Summary and Company Earnings of an intake) and `summarize_incentives_by` (totals by University
Partner, university or intake). They cannot change anything. Claude may need the connector refreshed in claude.ai to list them.

The Student Details server reads the Incentive page's saved figures (`commissions.json`, `advances.json`, `exchange-rate-cache.json`)
straight from the Incentive data folder. It finds that folder next to its own data folder (`.../niec_data/counselor-incentive`, the
layout in `CPANEL_DEPLOY.md` and `deploy.sh`), or set `COUNSELOR_DATA_DIR` on the Student Details app to the same value the
Incentive page uses. If the folder cannot be found, the incentive tools say so instead of showing zeros. Because it is one connector,
**the one secret opens both the students and the commissions**: keep the address private. Both connectors' shared code is in
`shared/mcp-core.js`.

## Daily backups and restore (Admin only)

Every day after 6 p.m. (office time, `APP_TIMEZONE`, default Asia/Kathmandu) the Student Details server saves one compressed
backup of the students, the Fact File and the Partner Universities in `daily-backups/` in the data folder, and deletes copies
older than 30 days. If the host has put the server to sleep, the copy is made at the first request instead. Accounts and passwords
are never in a backup. Admin restores from **Activity → Restore data** (students, Fact File and Partner Universities each on
their own); a restore first saves the current data as a "before restore" backup. **View** opens the real Student Details, Fact File and Partner Universities pages on that backup (`?backup=ID`, read only, nothing saved or polled), with a bar to switch between them and restore. Uploaded agreement files are not in the backup.

## Where things are

- `student-details/app.js`: the sheet. `facts.js` and `fact-*.js`: the Fact File. `fact-seed-*.js(on)`: the starting
  Fact File content (an unedited university page is refreshed from it; one that has been saved by Admin is never touched).
- `shared/teams.js`: who sees and changes what (used by the page and the server alike).
- `shared/accounts.js`: login, sessions, people.

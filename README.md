# UK Student NIEC

The student visa tracker and counsellor incentive tracker for Nepal International Educational Consultancy.
One login for everyone; each person sees only what their account allows.

| Part | What it is |
|---|---|
| **Student Details** (`student-details/`) | The sheet of students by intake, with live co-editing, the Dashboard, the Users and Activity pages (Admin), and the **Fact File** (one page per university: fees, entry requirements, English tests, courses, intakes and the application process, searchable by course). |
| **Student card** (`student.html`, `student-page.js`, `cards.js`, `portal-api.js`) | Opens from **Open card** (or a double-click on a row number) on the sheet, from Follow-ups and from the Fact File. Everything about one student besides the sheet: where they came from exactly (platform, event, B2B partner, who referred), counselor, lead quality, study level, grades and English test, notes, the next follow-up day, documents received, the university options prepared for them and every message sent. The sheet keeps exactly its columns; **+ Add student** is now a form that fills the sheet's columns and the card. Same visibility rules as the sheet (`shared/teams.js`). |
| **Messages** (`messages.js`, `templates.html`) | A ready-made email and WhatsApp text for each step (first reply, options, documents, offer, mock interview, payment, CAS, visa ...), filled in from the student, with the signature. Email goes from the office mailbox set up in `mail.json`; WhatsApp opens `wa.me` with the text. Nothing reads replies. Admin edits the templates and the signature. Without mail settings (as on a test computer) a send only keeps a preview on the card. |
| **University options** (`course-index.js`, `finder.js`, `fact-finder.js`) | Every course of the Fact File as one searchable list with its fee, scholarship and link. A counselor ticks several courses (from a student's card, or **Send to a student** on a Fact File page) and one email carries them all with the documents needed. The **option finder** on the Fact File page answers an unusual request (low grade, long gap, budget, city). With `ANTHROPIC_API_KEY` set (and `npm install` run) Claude judges eligibility from the Fact File only and may not invent an option; without it the finder matches by subject, level, intake, city and budget and shows the entry rule beside each option. No student name or contact detail is ever sent. |
| **B2B Partners** (`b2b.js`, `b2b.html`) | Admin only: sub-agents (who send students) and B2B platforms (NIEC applies through them), with terms, contacts, agreement dates and files, and the students and visas each has brought. Partner Universities now also say whether the agreement is direct or through a B2B partner. |
| **Dashboard decision pages** (`insights-engine.js`, `planning.js`, `dashboard-insights.js`) | Beside the existing Numbers: **Decisions** (target, forecast, findings with evidence, reason, decision and measure, the weekly pace, Ask the analyst, Decision log), **Channels and events** (cost per student, application and visa by source and by where exactly, marketing spend, events, adverts, the busy months), **Universities and partners** (concentration risk, speed, agreements ending), **Team and students lost** (follow-ups, workload, why students leave, how complete the records are) and **Intake plan** (what each choice needs in applications and inquiries, the calendar, market notes and a printable intake proposal). Admin writes the targets, spend, events, decisions and notes; the Manager reads. A rate from fewer than 10 students is starred and never used in a finding. |
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

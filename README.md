# International Student Recruitment (ISR)

ISR is a recruitment portal that any education consultancy can use: the student sheet, student cards, messages, university Fact File, partners and agents, and a Dashboard. The name of the consultancy is a setting. This first installation is for Nepal International Educational Consultancy.
One login for everyone; each person sees only what their account allows.

| Part | What it is |
|---|---|
| **Student Details** (`student-details/`) | The sheet of students by intake, with live co-editing, the Dashboard, the Users and Activity pages (Admin), and the **Fact File** (one page per university: fees, entry requirements, English tests, courses, intakes and the application process, searchable by course). |
| **Today** (`today.html`, `today-page.js`) | The first screen after login for every account. A greeting, the numbers that matter, and five cards of what needs a person now (inquiries to follow up, applications to submit, mock interviews to schedule, offers waiting for the deposit, CAS received with the visa not lodged), each student a click from their card. Only the students the account may see are shown. |
| **Student card** (`student.html`, `student-page.js`, `cards.js`, `portal-api.js`) | Opens from a double-click on a student's name or row number, and from the Fact File. Three tabs: **Notes**, **University options** (one box: what the student wants and has, plus remarks, then the Fact File assistant; the options chosen for the student and a search of every course) and **Send a message** (six templates, each opening on the full-page composer). **+ Add student** asks only for the sheet columns, where the student came from (a source and a tagged platform or event, with a way to add a missing one) and an optional first note. Remarks and Student Source are not columns of the sheet any more (their data stays in the file).
| **Messages** (`messages.js`, `templates.html`, `compose.html`) | Every email ends with the office signature picture (sent inside the email). A consultancy puts its own `email-signature.png` in the data folder (`STUDENT_DETAILS_DATA_DIR`) and that picture is used; `student-details/email-signature.png` is only the first installation's starting picture. Six templates, and **Other** to write your own words: university options and documents, documents needed, application submitted, offer received, mock interview, deferred. Each opens on a full page (`/compose`): the email at full size, editable words, files to attach (read in the browser, sent once and never stored on the server), then Send, Open in my email program, Copy or WhatsApp (`wa.me`). The options email can carry a minimum cash deposit column. Email goes from the office mailbox set up in `mail.json`. Admin edits the templates and the signature.
| **University options and the Fact File assistant** (`course-index.js`, `eligibility.js`, `places.js`, `finder.js`, `fact-finder.js`) | Every course of the Fact File as one searchable list. The assistant lives only on the student card (University options). It reads the student's grade, gap, English score, budget, level, subject, place ("near Manchester", "in Scotland", "within 20 miles of Leeds"; a built-in map of UK cities) and remarks ("5 universities", "show the minimum cash deposit and the full tuition fee"), judges every course against the entry rules written in the Fact File and lists who is eligible, likely eligible or ruled out, with fee, deposit, scholarship and link. It runs inside the server with no outside AI and no key.
| **Course pages and the weekly check** (`university-websites.js`, `course-finder.js`, `course-watch.js`) | The official website of each university is listed in `university-websites.js` (or written in the Fact File). Only those websites are searched or opened. A course with no page written down is searched for; every course page is opened about once a week (a slice every six hours, the first ten minutes after the server starts; `COURSE_WATCH=off` stops it). A page that is gone, no longer about the course, or whose fees or intake months changed becomes a **warning** on the Fact File (a line on the Fact File page, a list on the university's page) for a person to confirm. The check never edits the Fact File itself. Results are in `course-watch.json` in the data folder. |
| **Events and marketing** (`events.html`, `events-page.js`, `planning.js`) | Admin adds, the Manager reads. Every event or piece of marketing (a fair, a seminar, a Facebook advert, a signboard ...) has a name, the days it ran, its cost and a note. Each is a tag: choose it as the Student source on a student (one by one with Add student, or many with **Add many**), and it shows on the student card with its dates. The page shows days run, cost, students brought (leads), applications, visas and cost per lead. |
| **B2B Partners and Agents** (`b2b.js`, `b2b.html`, `agents.html`, `b2b-page.js`) | Admin only, two separate lists of the same kind. **B2B Partners** are the businesses NIEC sends applications to (they hold the direct agreement with a university). **Agents** are the businesses that send NIEC their students (chosen as Student Source "Agent" on a card). Each has a status, the day the agreement ends, a contact person and number, the commission structure of each intake (a link, and PDF files to upload) and the visas it has brought, by intake. Kept in `b2b-partners.json` and `agents.json` (files in `b2b-files/` and `agent-files/`), never in git.
| **Dashboard decision pages** (`insights-engine.js`, `planning.js`, `dashboard-insights.js`) | Beside the existing Numbers, all by intake: **Decisions** (business at a glance, journey funnel, weekly pace with dated weeks, target and forecast, what stands out with evidence, reason, decision and measure, Decision log), **Channels and events** (marketing cost per student, application and visa by source and platform, spend, events), **Universities and partners**, **Students lost and records** (why students leave, what lost students wanted that NIEC could not offer, read from their cards, and how complete the records are) and **Intake plan** (what the target needs, what you have, what is still to find, weekly pace, where the inquiries should come from and the budget, calendar back from the start day, printable proposal, market notes). Cost figures are marketing cost only, and "earned per rupee spent" compares the value you set for a visa with the marketing spend.
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

## ISR: what changed in round 11

- **Name:** the portal is called International Student Recruitment, ISR for short, shown as plain text (no logo picture). The consultancy's own name is still a setting. The browser-tab and phone icons are a plain blue tile with the letters ISR.
- **Student Source:** one **Branch** choice with a second dropdown for which branch (the list is `BRANCHES` in `student-details/card-fields.js`; add a branch there and it becomes a branch team, a Users page choice and a source everywhere). The sheet keeps "<name> Branch", so the incentive sums and the branch accounts work as before. Agent shows the agents, Events the events that were held, Language Classes the classes, Reference and Visitor their own lists, and Social Media asks for the platform and a remarks box (the campaign name). All forms use one component, `source-picker.js`.
- **Add many students:** from an Excel or CSV file only (the paste box is gone). Bad lines and students already on the sheet are skipped, with the reason.
- **Events and marketing:** new types for Meta (Facebook or Instagram) campaigns, campaigns on a partner page, and campus or college campaigns that are not schools.
- **B2B Partners and Agents:** a Commission column shows the current intake's commission as a PDF or link that opens when clicked, or a "Missing for this intake" button. Each intake's commission is set in the editor (PDF upload or link).
- **Fact File:** every course is a link to its own page, or shows "Find the course page".
- **Dashboard:** rebuilt from zero (Overview: headline cards that compare with the intake before, target ring, funnel, week by week, sources, universities, partners, speed, losses, intake against intake, money). The other four tabs (Decisions, Marketing and sources, Universities and partners, Intake plan) are unchanged.
- **Workspaces:** Admin, Manager, Application Team, Mock Team, Follow-up Team and each Branch have their own Today (own tiles, own work lists, own buttons) and menu, and a team sees its own sheet columns highlighted (`Teams.kindOf` in `shared/teams.js`).

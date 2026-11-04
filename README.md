# UK Student NIEC

The student visa tracker and counsellor incentive tracker for Nepal International Education Consultancy.
One login for everyone; each person sees only what their account allows.

| Part | What it is |
|---|---|
| **Student Details** (`student-details/`) | The sheet of students by intake, with live co-editing, the Dashboard, the Users and Activity pages (Admin), and the **Fact File** (one page per university: fees, entry requirements, English tests, courses, intakes and the application process, searchable by course). |
| **Partner Universities** (`student-details/direct.js`, `direct-page.js`) | Admin only: the universities NIEC works with directly, with campus locations, commission slabs, payment terms, agreement dates and contacts. Agreement files (PDF, Word, image, up to 10 MB) can be uploaded per university. Stored in `direct-universities.json` and `direct-files/` in the data folder (never in git, never served as pages); not in the Advisor connector, and the Backup tab does not include them. |
| **Incentive** (`counselor-incentive/`) | Counsellor incentives and company earnings per intake (Admin only). Reads the students from Student Details. |
| **Shared** (`shared/`) | Accounts and login, the header, the team access rules, notices and confirmation boxes, the server helpers. |
| **Gateway** (`gateway/`) | Runs both apps behind one address (used by the Render and VPS setups; cPanel runs the two apps separately). |

## Run it on your computer

```bash
npm start            # both apps on http://localhost:8080
```

The first time, the server writes a one-time setup code to `first-admin-code.txt` in its data folder (and prints it
in the log). Open `/login`, enter it, and create the owner (Admin) account. Needs Node 18 or newer; there is nothing
to install.

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

## Daily backups and restore (Admin only)

Every day after 6 p.m. (office time, `APP_TIMEZONE`, default Asia/Kathmandu) the Student Details server saves one compressed
backup of the students, the Fact File and the Partner Universities in `daily-backups/` in the data folder, and deletes copies
older than 30 days. If the host has put the server to sleep, the copy is made at the first request instead. Accounts and passwords
are never in a backup. Admin restores from **Activity → Restore data** (students, Fact File and Partner Universities each on
their own); a restore first saves the current data as a "before restore" backup. Uploaded agreement files are not in the backup.

## Where things are

- `student-details/app.js`: the sheet. `facts.js` and `fact-*.js`: the Fact File. `fact-seed-*.js(on)`: the starting
  Fact File content (an unedited university page is refreshed from it; one that has been saved by Admin is never touched).
- `shared/teams.js`: who sees and changes what (used by the page and the server alike).
- `shared/accounts.js`: login, sessions, people.

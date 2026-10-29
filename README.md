# UK Student NIEC

The student visa tracker and counsellor incentive tracker for Nepal International Education Consultancy.
One login for everyone; each person sees only what their account allows.

| Part | What it is |
|---|---|
| **Student Details** (`student-details/`) | The sheet of students by intake, with live co-editing, the Dashboard, the Users and Activity pages (Admin), and the **Fact File** (one page per university: fees, entry requirements, English tests, courses, intakes and the application process, searchable by course). |
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

## Where things are

- `student-details/app.js`: the sheet. `facts.js` and `fact-*.js`: the Fact File. `fact-seed-*.js(on)`: the starting
  Fact File content (an unedited university page is refreshed from it; one that has been saved by Admin is never touched).
- `shared/teams.js`: who sees and changes what (used by the page and the server alike).
- `shared/accounts.js`: login, sessions, people.

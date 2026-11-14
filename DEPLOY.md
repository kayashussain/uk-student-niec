# Deploying UK Student NIEC online (Render)

There are two supported ways to host this: **Render** (this file) or **cPanel / Nest Nepal** (see
`CPANEL_DEPLOY.md`). Pick one; you don't need both.

It is **one app**: `student-details/` (the visa application tracker, Fact File, Dashboard, Users and Activity), with the
Incentive page from `counselor-incentive/` running inside it at `/incentive`. Incentive is Admin only and behind its own
password: set the `INCENTIVE_PASSWORD` environment variable on the service. `npm start` (the `gateway/` file) just starts
that one app on the port the host expects.

## One-time setup: Render

1. **Create a free Render account** at https://render.com (sign in with GitHub is easiest).
2. In the Render dashboard, click **New → Blueprint**, and connect the `uk-student-niec`
   GitHub repo. Render will read `render.yaml` in this repo and pre-fill almost everything:
   a web service, a 1GB persistent disk mounted at `/data`, and the two data-directory
   environment variables.
3. Click **Apply** / **Create**. The first deploy takes a minute or two.
4. Once it's live, Render gives you a URL like `https://uk-student-niec.onrender.com`.
   Opening it shows the login page (see **The login** below).

## The login

Everyone has **their own account**; there are no shared logins. Logging in takes the person's
password (at least 10 characters), with no second step (no authenticator app or codes). A login lasts 12 hours, and
wrong passwords lock the account for 15 minutes.

- **First start:** while there are no accounts, the server makes a one-time **setup code**, prints it
  in the app's log and saves it in `first-admin-code.txt` in the Student Details data folder. The
  login page asks for it to create the first Admin account; you then choose your own password and
  and the code is deleted. Do this straight after deploying.
- **Intakes:** Admin and the Manager see every intake sheet. The Application, Mock and Follow-up teams see only the newest sheet, so when you start a new intake the earlier one leaves their screens by itself. There is no sheet password.
- **Adding people:** Admin → **Users** → *Add a person*: name, username (not case sensitive), email, and
  what they can do. Tick any mix of Application, Mock, Follow-up, Chitwan Branch, Pokhara Branch and Manager (a Manager who also ticks a team can change that team's students in the current intake). They are emailed a link and a temporary
  password (see **Email** below); at their first login they choose their own password and link their
  phone. Admin is the owner account: nobody else can ever be made Admin.
- **When someone leaves:** Users → **Remove**. Their login is deleted and they're logged out of every device at once; they can't
  log in again. **Disable** pauses a login without deleting it.
- **Forgotten password:** Admin uses *Reset password* (the new
  temporary password is emailed to the person).
  If no Admin can log in, run on the server
  `STUDENT_DETAILS_DATA_DIR=<the data folder> node scripts/reset-login.js <username>`.

The accounts (`users.json`, passwords stored only as salted scrypt hashes), logged-in devices
(`sessions.json`) and settings live in the Student Details data folder, never in git and never
served. Every login, failed login, logout and change is recorded in `activity.jsonl` there; Admin sees
it on the **Activity** page, which can be filtered by person, type, dates and words. After 20 wrong tries from one address, or 8 for one account, within 15
minutes, further tries are refused until the 15 minutes are up. No environment variables are needed.

**What each account sees** (rules in `shared/teams.js`, enforced by the server; the server only ever
sends an account its own students). A person can work in **several teams at once**: they get the
students, columns and moves of every team they hold.

| Account | Sees | Can change |
|---|---|---|
| Admin (the owner) | everything, all pages | everything |
| Manager | the **Dashboard** and every student on every sheet, earlier intakes too, view only | nothing; can use Export Excel; no Incentive page |
| Application Team | students at *Application Stage*, in the newest intake only | columns up to NOC Number; can move a student to *Mock Stage* (warned about anything still blank) |
| Mock Team | students at *Mock Stage* | Remarks and the mock columns up to Pre-CAS Interview; can move to *Payment Stage* only once those are all filled |
| Follow-up Team | *Inquiry* and *Defer* students | Remarks only |
| Each branch (Chitwan, Pokhara, Palpa, Butwal) | the students whose *Student Source* is that branch, at any stage (current intake) | every column of those students, any stage move; can add students (tagged with the branch) |

**Partner pages and Message templates** (rules in `student-details/partner-access.js`; the server strips what an account may
not see before sending anything): Admin sees and changes everything. The **Manager** looks at Partner Universities, B2B Partners
and Agents **with the commission** (no portal login), and at Events and marketing and Message templates. The **Application and
Mock Teams** look at Partner Universities, B2B Partners and Agents **without the commission** (no commission slabs, payment terms,
commission lists, agreement files, notes or portal login), and read Message templates. **Branches** look at Partner Universities
the same way (without the commission) and read Message templates. The **Follow-up Team** has none of these pages. A **branch** can
give a task about its own student to the Application Team or the Mock Team (Assign a task on the student card), sees on Today
whether it is done, and removes only the tasks it gave.

Every team can add a new student with **+ Add student**: it starts at the team's own stage (Application Stage,
Mock Stage or Inquiry), and the team can also fill in its name, email, contact number and student
source (on students it added itself). Deleting students and sheets, and the
Incentive page, are Admin only. Export Excel is for Admin and the Manager.


## Seeding your existing data (one time)

Copy your current `student-details/data.json` into the disk's `/data/student-details` folder **before the app's first start**
(or stop the app, copy it, and start it again). The app reads it from there. (Uploading through the
site isn't possible any more, since uploads need a login.)

After that, the live site is the one source of truth. Every edit there saves straight to
the Render disk and survives redeploys.

## Using it day to day

- Visa tracker: `https://your-app.onrender.com/`
- Incentive (Admin only, asks for the Incentive password): `https://your-app.onrender.com/incentive/`

Both are behind the same login. Everyone has their own account (made by Admin on the Users page) and
sees only what their access allows, as described above, so there is no shared password to pass around.

After 20 wrong passwords from the same address within 15 minutes, that address is locked out for
the rest of the 15 minutes (even with the right password), to stop anyone guessing it. A single account
is locked after 8 wrong passwords in 15 minutes.

## Email (setup details for new people)

Email is set up on the server, not on a web page. Run these in the project folder (use the same
`STUDENT_DETAILS_DATA_DIR` as the app if you set one):

```
node scripts/email.js setup
node scripts/email.js test someone@example.com
```

`setup` asks for the mailbox (for example `kayas@niecedu.com.np`) and its password, and saves them in
`mail.json` in the Student Details data folder (never in git, never served, private to the server user).
The mail server defaults to `mail.niecedu.com.np` on port 465 with SSL; change it when asked (587 means
STARTTLS). `test` sends a message and says what went wrong if it fails. From then on, adding a person (or
resetting a password) emails them their link, username and temporary password. If email is not set up, or a
message cannot be sent, the temporary password is shown to Admin instead so it can be given in person.
The web server must be allowed to reach the mail server on that port. You can also use the environment
variables `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURITY`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`,
`MAIL_FROM_NAME` and `SITE_URL` instead of the file.

## Fact File

Every account has a **Fact File** page: a list of universities, and for each one a page with its entry
requirements, language test, courses, location, intakes (with their own requirements and courses) and the
application process step by step. Anyone can read it and use **Print or save as PDF** to get a clean A4
copy. Only Admin can add, edit or delete a university. It is stored in `fact-file.json` in the Student
Details data folder (never in git; back it up with the rest of the data folder).

## Dashboard

Each team (Application, Mock, Follow-up, each branch) has its own **Dashboard** of its work (see README, My dashboard). Admin and the Manager have a **Dashboard** made for planning intakes: the student journey from inquiry to
visa with the share that goes on at each step, money (deposits received, still to collect, average fee),
visa success, a forecast of visas, payments and deposits still to come, how many days each step takes,
every intake side by side, month by month trends, who needs chasing, and breakdowns by source, university
partner, university and course. A step is counted from its own date or from any later stage (a student at
Visa Issued has applied, had an offer and paid), and a note under the page says how many were counted that
way. It can be filtered by intake and updates itself every 30 seconds.

Daily backups and "today's" exchange rate follow Nepal time. To use a different time zone, set
`APP_TIMEZONE` (e.g. `Europe/London`).

## Student cards, messages, B2B Partners and the decision pages

New in the same app, no new setup needed: the data goes in new files of the Student Details data folder (`cards.json`, `message-log.jsonl`, `message-templates.json`, `course-links.json`, `b2b-partners.json` with `b2b-files/`, `planning.json`), never in git. They are in the 6 p.m. backup (restore them from Activity, Restore data) and the first save of each day also copies them into `backups/`.

- **Email to students** goes from **each person's own mailbox** (the owner, 14 Nov 2026). Everyone sets theirs up once: account menu, **My email and WhatsApp**, type the address and its password, **Check and save** (a test email is sent first; it is saved only if it works). The password is kept encrypted in `user-mail.json` with its key in `mail-key`, both in the Student Details data folder, never in git, never in the daily backups, never shown on a page. A team member without their own mailbox cannot email (Send email keeps a preview). Admin sends from their own mailbox if set, else from the office mailbox (`node scripts/email.js setup`, see Email above). A team member's email is signed with their name, team, address and phone; a copy goes to their own mailbox and to the office mailbox unless Admin switches copies off on **Message templates**.
- **WhatsApp** always opens in the sender's own WhatsApp (phone, WhatsApp Web or WhatsApp Desktop linked to their phone); nothing to set up on the server.
- **The Fact File assistant needs nothing set up:** it runs inside the server and reads the entry rules in the Fact File. No key, no outside service.

## Updating the code later

Push to the GitHub repo's default branch and Render redeploys automatically
(`autoDeploy: true` in `render.yaml`). Your data isn't touched by a redeploy. It lives on
the persistent disk, separate from the code.

## Tests

`npm test` runs the checks (they also run during `deploy.sh`). Most are quick tests of the rules and data. `test/ui.test.js` drives the real screens in a browser (log in, edit, delete, search, team rules, Fact File); it runs only where Playwright and Chromium are installed (add `npm i -D axe-core` to include the accessibility check) and skips itself on a normal server, so it never blocks a deploy.

## Checking that it is running

`/healthz` answers `{"ok":true}` without a login (it shows nothing about the data), so an uptime monitor such as UptimeRobot can watch it.

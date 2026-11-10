# Deploying to Nest Nepal (cPanel) with niec.duckdns.org

This is one of two supported ways to host the apps; the other is Render (`DEPLOY.md`). Pick one.

cPanel's "Setup Node.js App" runs the site as **one app**: Student Details, with the **Incentive** page
inside it at `/incentive` (Admin only, behind its own password). There is no separate Incentive app any more.

- `student-details` → `https://niec.duckdns.org/` (and `https://niec.duckdns.org/incentive/`)

## 1. Get the code onto the server

If your plan has **Terminal/SSH** (check cPanel for a "Terminal" icon):

```bash
cd ~
git clone https://github.com/kayashussain/uk-student-niec.git
```

That plain URL only works while the repo is **public**. No student data is ever in git, but if you'd
rather keep the code private, make the repo private on GitHub and clone with a read-only token
instead: create a fine-grained personal access token (GitHub → Settings → Developer settings) with
read access to just this repo, then
`git clone https://YOUR_GITHUB_USERNAME:YOUR_TOKEN@github.com/kayashussain/uk-student-niec.git`.
Treat the token like a password.

No terminal? Download the repo as a ZIP from GitHub (**Code → Download ZIP**) and upload
+ extract it into your home directory via cPanel's **File Manager** instead. Either way,
you should end up with `~/uk-student-niec/student-details` and
`~/uk-student-niec/counselor-incentive`.

Also create one more folder, outside both app folders, to hold the actual data so it
survives re-deploys:

```bash
mkdir -p ~/niec_data/student-details ~/niec_data/counselor-incentive
```

## 2. Create the first app: student-details

In cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | Latest available (18+) |
| Application mode | Production |
| Application root | `uk-student-niec/student-details` |
| Application URL | `niec.duckdns.org` (leave the path blank, this is the root) |
| Application startup file | `server.js` |

Click **Create**. Then scroll to **Environment Variables** on the same page and add:

| Name | Value |
|---|---|
| `STUDENT_DETAILS_DATA_DIR` | `/home/YOUR_CPANEL_USERNAME/niec_data/student-details` |

Click **Save**, then **Run NPM Install**, then **Restart**.

## 3. The Incentive page (no second app)

If you used to have a separate **counselor-incentive** app in cPanel, **delete that app** (Setup Node.js App → the app's
Delete button). Keep its **data folder** `~/niec_data/counselor-incentive`: your commissions and advances live there, and
the main app reads it from the same place. (`COUNSELOR_DATA_DIR` is only needed if the folder is anywhere else.)

Add this to the **student-details** app's Environment Variables, then **Restart**:

| Name | Value |
|---|---|
| `INCENTIVE_PASSWORD` | the password Admin types to open Incentive |

How Incentive works now:

- Only the **Admin** account can open it (account menu → **Incentive**). Nobody else can, whatever they know.
- Admin types **only that password** (no username). It is asked **every time**: going to any other page (Student Details,
  Dashboard ...), reloading Incentive or closing it locks it again, and an Incentive page left untouched for 20 minutes
  locks itself. Five wrong tries in a row make the person wait 15 minutes. Changing `INCENTIVE_PASSWORD` and restarting
  locks it again everywhere.
- If `INCENTIVE_PASSWORD` is not set, Incentive stays locked and says so. The password is never in the code or in git.
- The old address `/commission` forwards to `/incentive/`.
- The **Claude connector** (`/advisor-mcp/<token>`) reads the same data folder directly with its own secret address,
  so it never asks for this password. It is unchanged.

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
| Manager | the **Dashboard**, the **Analysis** page and every student on every sheet, earlier intakes too, view only | nothing; can use Export Excel; no Incentive page |
| Application Team | students at *Application Stage*, in the newest intake only | columns up to NOC Number; can move a student to *Mock Stage* (warned about anything still blank) |
| Mock Team | students at *Mock Stage* | Remarks and the mock columns up to Pre-CAS Interview; can move to *Payment Stage* only once those are all filled |
| Follow-up Team | *Inquiry* and *Defer* students | Remarks only |
| Chitwan Branch, Pokhara Branch | the students whose *Student Source* is that branch, at any stage (current intake) | every column of those students, any stage move; can add students (tagged with the branch) |

Every team can add a new student with **+ Add student**: it starts at the team's own stage (Application Stage,
Mock Stage or Inquiry), and the team can also fill in its name, email, contact number and student
source (on students it added itself). Deleting students and sheets, and the
Incentive page, are Admin only. Export Excel is for Admin and the Manager.

The Incentive page uses the same accounts and login as the rest of the site (it runs inside the same app). `APP_USERNAME`,
`APP_PASSWORD` and `REQUIRE_PASSWORD` are no longer used; you can delete them.

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

Admin and the Manager have a **Dashboard** made for planning intakes: the student journey from inquiry to
visa with the share that goes on at each step, money (deposits received, still to collect, average fee),
visa success, a forecast of visas, payments and deposits still to come, how many days each step takes,
every intake side by side, month by month trends, who needs chasing, and breakdowns by source, university
partner, university and course. A step is counted from its own date or from any later stage (a student at
Visa Issued has applied, had an offer and paid), and a note under the page says how many were counted that
way. It can be filtered by intake and updates itself every 30 seconds.

Optional: `APP_TIMEZONE` (default `Asia/Kathmandu`) sets which calendar day daily
backups and "today's" exchange rate follow.

After 20 wrong passwords from one address within 15 minutes, that address is locked out for the
rest of the 15 minutes. This relies on the host passing the visitor's address in
`X-Forwarded-For`; if it doesn't, a lockout applies to everyone at once until it runs out.

(Replace `YOUR_CPANEL_USERNAME` with your actual cPanel username, visible at the top of
the Node.js App screen or in "Application root" once created, cPanel shows the full
absolute path there.)

## Analysis

Admin and the Manager also have an **Analysis** page, made for business decisions rather than daily work. For one intake
or all intakes together it shows: what stands out (risks, missing data and patterns, each with the step to take); every
Student Source with its Source Details and what each cost; campaigns and events; the busy months of the year; every
intake side by side; how much rests on each university and partner; courses; why students are lost; counselors; the kind
of student; and how complete each column is, with the decision that column allows. Nothing is guessed: a rate from fewer
than 10 students is starred, and a blank cell is shown as "(not filled in)".

It reads seven columns of the sheet that the Application and Follow-up Teams fill in: Source Detail (a dropdown that
follows the Student Source), Campaign or Event, Inquiry Date, Counselor, Study Level, Home District and Lost Reason.
Sheets saved before these columns existed get them, empty, when the app starts.

Admin sets a **visa target** and a date for each intake in the Targets table at the top of the page (kept in `targets.json`
in the data folder, with `targets.backup.json` beside it). The page then shows visas so far, what the students in progress
are likely to add (each counted at the share of finished students at the same step, in every intake, who got a visa), the
forecast, how many visas short it is, the new applications needed and the applications needed each week, and what was
dated in the last 7 days against the 7 days before. With fewer than 10 finished students there is no forecast, and the
page says so.

Admin enters the **Marketing spend** at the bottom of the page (month, intake, source, detail, campaign or event,
amount in NPR); the Manager can read it. It is kept in `marketing-spend.json` in the data folder, with the version before
each save beside it as `marketing-spend.backup.json`. The **Download for Excel or Power BI** button saves every table of
the page as one CSV file.

## 4. Seed your existing data

Copy your current `student-details/data.json` into `~/niec_data/student-details` (cPanel **File Manager** → Upload) **before the app's first start**
(or stop the app, copy it, and start it again). The app reads it from there. (Uploading through the
site isn't possible any more, since uploads need a login.)

## 5. Check it

- `https://niec.duckdns.org/` should show the login page, then the tracker
- `https://niec.duckdns.org/incentive/` should (as Admin) ask for the Incentive password, then show the incentive page

## Updating the code later

```bash
cd ~/uk-student-niec
git pull
```

Then in cPanel's Node.js App screen, hit **Restart** on the app (and
**Run NPM Install** again if `package.json` changed).

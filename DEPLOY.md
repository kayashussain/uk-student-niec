# Deploying UK Student NIEC online (Render)

There are two supported ways to host this: **Render** (this file: one service, with the `gateway/`
in front of both apps) or **cPanel / Nest Nepal** (see `CPANEL_DEPLOY.md`: two separate cPanel apps,
no gateway). Pick one; you don't need both.

This repo runs **two apps together** behind one gateway, both behind the same login page:

- `student-details/`: the visa application tracker
- `counselor-incentive/`: the commission tracker (reads `student-details`'s data directly off disk)
- `gateway/`: the one public entry point: routes each request to whichever app owns it

Locally, nothing changes. Keep running each app the way you always have
(`node server.js` inside each folder, on ports 4173 and 5173). The gateway is only used
by the hosted deployment.

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
password (at least 10 characters). There is no second step by default. To also ask for the 6-digit code from
an authenticator app (Google or Microsoft Authenticator), set the environment variable `REQUIRE_AUTHENTICATOR=1`
on both apps and restart; people then link their phone at their next login. A login lasts 12 hours, and
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
- **Lost phone / forgotten password:** Admin uses *Reset password* (and *Reset authenticator* when codes are required) (the new
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
| Follow-up Team | *Inquiry*, *Defer* and *Withdrawn* students | Remarks only |
| Chitwan Branch, Pokhara Branch | the students whose *Student Source* is that branch, at any stage (current intake) | every column of those students, any stage move; can add students (tagged with the branch) |

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
- Commission tracker: `https://your-app.onrender.com/commission`

Both are behind the same login. Anyone you give the URL and password to can view and edit
everything, so only share the password with people who should have full access.

After 20 wrong passwords from the same address within 15 minutes, that address is locked out for
the rest of the 15 minutes (even with the right password), to stop anyone guessing it.

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

Daily backups and "today's" exchange rate follow Nepal time. To use a different time zone, set
`APP_TIMEZONE` (e.g. `Europe/London`).

## Updating the code later

Push to the GitHub repo's default branch and Render redeploys automatically
(`autoDeploy: true` in `render.yaml`). Your data isn't touched by a redeploy. It lives on
the persistent disk, separate from the code.

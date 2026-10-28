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
password **and** the 6-digit code from the authenticator app on their own phone (Google or Microsoft
Authenticator), so a password alone, or one someone shared, isn't enough. A login lasts 12 hours.

- **First start:** while there are no accounts, the server makes a one-time **setup code**, prints it
  in the app's log and saves it in `first-admin-code.txt` in the Student Details data folder. The
  login page asks for it to create the first Admin account; you then choose your own password and
  link your phone, and the code is deleted. Do this straight after deploying.
- **Hidden sheets** can't be opened until Admin sets the hidden-sheet password (Users → Settings).
- **Adding people:** Admin → **Users** → *Add a person*: name, username (not case sensitive), email, and
  what they can do. Tick one or more teams, or choose CEO. They are emailed a link and a temporary
  password (see **Email** below); at their first login they choose their own password and link their
  phone. Admin is the owner account: nobody else can ever be made Admin.
- **When someone leaves:** Users → **Disable**. They're logged out of every device at once and can't
  log in again. Change the hidden-sheet password there too if they knew it.
- **Lost phone / forgotten password:** Admin uses *Reset authenticator* or *Reset password* (the new
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
| CEO | the **Dashboard** and every student on the visible sheets, view only | nothing; no Incentive page |
| Application Team | students at *Application Stage* | columns up to NOC Number; can move a student to *Mock Stage* (warned about anything still blank) |
| Mock Team | students at *Mock Stage* | Remarks and the mock columns up to Pre-CAS Interview; can move to *Payment Stage* only once those are all filled |
| Follow-up Team | *Inquiry*, *Defer* and *Withdrawn* students | Remarks only |

Every team can add a new student with **+ Add student**: it starts at the team's own stage (Application Stage,
Mock Stage or Inquiry), and the team can also fill in its name, email, contact number and student
source (on students it added itself). Deleting students, sheets, hidden sheets, Export Excel and the
Incentive page are Admin only.


## Seeding your existing data (one time)

Copy your current `student-details/data.json` into the disk's `/data/student-details` folder **before the app's first start**
(or stop the app, copy it, and start it again). The app reads it from there. (Uploading through the
site isn't possible any more, since every login needs a code from a phone.)

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

Open **Users → Settings → Email** and fill in your outgoing mail server (SMTP): server name, port
(465 with SSL, or 587 with STARTTLS), the mailbox login and password, the address to send from, and
the website address people should open. Press **Send test email** to check it. From then on, adding a
person (or resetting a password) emails them their link, username and temporary password. If email is
not set up, or a message cannot be sent, the temporary password is shown to Admin instead so it can be
given in person. The mail password is saved only in `settings.json` in the Student Details data
folder (never in git) and is never shown on a page again. The web server must be allowed to reach your
mail server on that port; if it is blocked, the test email says so.

## Dashboard

Admin and the CEO have a **Dashboard** with the totals: students, applications submitted, offers
received, mock interviews, payments and visas, a funnel of how far students have got, month by month
trends, and breakdowns by source, university partner and university. It can be filtered by intake and
updates itself every 30 seconds. The CEO's numbers leave out hidden sheets.

Daily backups and "today's" exchange rate follow Nepal time. To use a different time zone, set
`APP_TIMEZONE` (e.g. `Europe/London`).

## Updating the code later

Push to the GitHub repo's default branch and Render redeploys automatically
(`autoDeploy: true` in `render.yaml`). Your data isn't touched by a redeploy. It lives on
the persistent disk, separate from the code.

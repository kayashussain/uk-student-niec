# Deploying to Nest Nepal (cPanel) with niec.duckdns.org

This is one of two supported ways to host the apps; the other is Render (`DEPLOY.md`). Pick one.

cPanel's "Setup Node.js App" runs each app as its own independent process (via
Passenger), so — unlike the Render setup — **each app is created separately in cPanel**,
both under the same domain, at different URL paths. No custom gateway needed here.

- `student-details` → `https://niec.duckdns.org/`
- `counselor-incentive` → `https://niec.duckdns.org/commission`

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
| Application URL | `niec.duckdns.org` (leave the path blank — this is the root) |
| Application startup file | `server.js` |

Click **Create**. Then scroll to **Environment Variables** on the same page and add:

| Name | Value |
|---|---|
| `STUDENT_DETAILS_DATA_DIR` | `/home/YOUR_CPANEL_USERNAME/niec_data/student-details` |

Click **Save**, then **Run NPM Install**, then **Restart**.

## 3. Create the second app: counselor-incentive

Same screen, **Create Application** again:

| Field | Value |
|---|---|
| Node.js version | same as above |
| Application mode | Production |
| Application root | `uk-student-niec/counselor-incentive` |
| Application URL | `niec.duckdns.org` with path `/commission` (any path works — just match it below) |
| Application startup file | `server.js` |

Environment variables for this one:

| Name | Value |
|---|---|
| `COUNSELOR_DATA_DIR` | `/home/YOUR_CPANEL_USERNAME/niec_data/counselor-incentive` |
| `STUDENT_DETAILS_DATA_DIR` | **exact same value** as in step 2 — this is how it finds the student data |
| `BASE_PATH` | **must exactly match the path above**, e.g. `/commission` (or `/incentive` if that's what you used) |

`BASE_PATH` matters: this host doesn't strip the sub-path prefix before handing the
request to the app, so the app needs to be told what its own mount path is (both server
and client-side routing account for it — but only if this env var matches what you put
in Application URL above).

Save → **Run NPM Install** → **Restart**.

Everyone has **their own account**; there are no shared logins. Logging in takes the person's
password **and** the 6-digit code from the authenticator app on their own phone (Google or Microsoft
Authenticator), so a password alone, or one someone shared, isn't enough. A login lasts 12 hours.

- **First start:** while there are no accounts, the server makes a one-time **setup code**, prints it
  in the app's log and saves it in `first-admin-code.txt` in the Student Details data folder. The
  login page asks for it to create the first Admin account; you then choose your own password and
  link your phone, and the code is deleted. Do this straight after deploying.
- **Hidden sheets** can't be opened until Admin sets the hidden-sheet password on the Users page.
- **Adding people:** Admin → **Users** (top of Student Details) → *Add a person*. They get a temporary
  password, shown once; at their first login they choose their own password and link their phone.
- **When someone leaves:** Users → **Disable**. They're logged out of every device at once and can't
  log in again. Change the hidden-sheet password there too if they knew it.
- **Lost phone / forgotten password:** another Admin uses *Reset authenticator* or *Reset password*.
  If no Admin can log in, run on the server
  `STUDENT_DETAILS_DATA_DIR=<the data folder> node scripts/reset-login.js <username>`.

The accounts (`users.json`, passwords stored only as salted scrypt hashes), logged-in devices
(`sessions.json`) and settings live in the Student Details data folder, never in git and never
served. Every login, failed login, logout and change is recorded in `activity.jsonl` there; Admin sees
it with **Check activity**. After 20 wrong tries from one address, or 8 for one account, within 15
minutes, further tries are refused until the 15 minutes are up. No environment variables are needed.

**What each team sees** (rules in `shared/teams.js`, enforced by the server; the server only ever
sends a team its own students):

| Account | Sees | Can change |
|---|---|---|
| Admin | everything, both pages | everything |
| Application Team | students at *Application Stage* | columns up to NOC Number; can move a student to *Mock Stage* (warned about anything still blank) |
| Mock Team | students at *Mock Stage* | Remarks and the mock columns up to Pre-CAS Interview; can move to *Payment Stage* only once those are all filled |
| Follow-up Team | *Inquiry*, *Defer* and *Withdrawn* students | Remarks only |

Every team can add a new student with **+ Row**: it starts at the team's own stage (Application Stage,
Mock Stage or Inquiry), and the team can also fill in its name, email, contact number and student
source (on students it added itself). Deleting students, sheets, hidden sheets, Export Excel and the
Incentive page are Admin only.

The Incentive app sends people to Student Details' `/login` page and reads the accounts and logins from the
Student Details data folder, which is why its `STUDENT_DETAILS_DATA_DIR` must match. `APP_USERNAME`,
`APP_PASSWORD` and `REQUIRE_PASSWORD` are no longer used; you can delete them from both apps.

Optional for both apps: `APP_TIMEZONE` (default `Asia/Kathmandu`) sets which calendar day daily
backups and "today's" exchange rate follow.

After 20 wrong passwords from one address within 15 minutes, that address is locked out for the
rest of the 15 minutes. This relies on the host passing the visitor's address in
`X-Forwarded-For`; if it doesn't, a lockout applies to everyone at once until it runs out.

(Replace `YOUR_CPANEL_USERNAME` with your actual cPanel username, visible at the top of
the Node.js App screen or in "Application root" once created — cPanel shows the full
absolute path there.)

## 4. Seed your existing data

Copy your current `student-details/data.json` into `~/niec_data/student-details` (cPanel **File Manager** → Upload) **before the app's first start**
(or stop the app, copy it, and start it again). The app reads it from there. (Uploading through the
site isn't possible any more, since every login needs a code from a phone.)

## 5. Check it

- `https://niec.duckdns.org/` should show the login page, then the tracker
- `https://niec.duckdns.org/commission` should do the same (or go straight in if you're already logged in), showing the commission tracker

## Updating the code later

```bash
cd ~/uk-student-niec
git pull
```

Then in cPanel's Node.js App screen, hit **Restart** on whichever app changed (and
**Run NPM Install** again if `package.json` changed).

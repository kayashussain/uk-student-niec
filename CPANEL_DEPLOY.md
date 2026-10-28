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

Both apps load shared code from the repo's `shared/` folder, so keep the whole repo on the server
(as cloned above), not just the two app folders.

Both apps always open a **login page** (`/login`) that asks you to pick your account and enter its password. There are
four accounts (Admin, Application Team, Mock Team, Follow-up Team), each with its
own password, set in `shared/server-utils.js` (`ACCOUNTS`; only a scrambled copy of each password is
kept there, and the comment shows how to make a new one). After logging in
you stay logged in on that device for 30 days, or until **Log out** (top right). No environment
variables are needed for it.

Every login (account, device, time) and every change is recorded in `activity.jsonl` in the Student
Details data folder. Admin sees it with **Check activity** at the top of Student Details.

The Incentive app sends people to Student Details' `/login` page and reads the login key from the
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

The new data folder starts empty. From your own machine, upload your current
`student-details/data.json`. The first command logs in and keeps the login in `cookies.txt`; the
second uploads with it:

```bash
curl -c cookies.txt -X POST https://niec.duckdns.org/api/login \
  -H "Content-Type: application/json" -d '{"account":"admin","password":"ADMIN_PASSWORD"}'
```

```bash
node -e "const d=require('./data.json'); d.baseRevision=0; process.stdout.write(JSON.stringify(d))" \
  | curl -X POST https://niec.duckdns.org/api/data \
    -b cookies.txt \
    -H "Content-Type: application/json" \
    --data-binary @-
```

(`baseRevision: 0` tells the server this save is based on the blank tracker the new folder starts
with. Without it, the server refuses the upload as a conflict.)

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

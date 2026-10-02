# Deploying UK Student NIEC online (Render)

There are two supported ways to host this: **Render** (this file — one service, with the `gateway/`
in front of both apps) or **cPanel / Nest Nepal** (see `CPANEL_DEPLOY.md` — two separate cPanel apps,
no gateway). Pick one; you don't need both.

This repo runs **two apps together** behind one password-protected gateway:

- `student-details/` — the visa application tracker
- `counselor-incentive/` — the commission tracker (reads `student-details`'s data directly off disk)
- `gateway/` — the one public entry point: checks a shared username/password, then routes
  each request to whichever app owns it

Locally, nothing changes — keep running each app the way you always have
(`node server.js` inside each folder, on ports 4173 and 5173). The gateway is only used
by the hosted deployment.

## One-time setup: Render

1. **Create a free Render account** at https://render.com (sign in with GitHub is easiest).
2. In the Render dashboard, click **New → Blueprint**, and connect the `uk-student-niec`
   GitHub repo. Render will read `render.yaml` in this repo and pre-fill almost everything:
   a web service, a 1GB persistent disk mounted at `/data`, and the two data-directory
   environment variables.
3. Render will ask you to fill in two values it deliberately left blank (so they're never
   stored in the repo):
   - `APP_USERNAME` — pick anything, e.g. `admin`
   - `APP_PASSWORD` — pick a strong password; this is what protects **all** your student
     and financial data once this is public. Don't reuse a password from elsewhere.
4. Click **Apply** / **Create**. The first deploy takes a minute or two.
5. Once it's live, Render gives you a URL like `https://uk-student-niec.onrender.com`.
   Opening it will prompt for the username/password from step 3 — that's the gateway's
   Basic Auth login.

## Seeding your existing data (one time)

The disk starts empty, so the live site starts with a blank tracker. To copy your current
local data up to it, run this once from the `student-details` folder on your machine
(replace the URL, username, and password):

```bash
node -e "const d=require('./data.json'); d.baseRevision=0; process.stdout.write(JSON.stringify(d))" \
  | curl -X POST https://uk-student-niec.onrender.com/api/data \
    -u admin:YOUR_PASSWORD \
    -H "Content-Type: application/json" \
    --data-binary @-
```

(`baseRevision: 0` tells the server this save is based on the blank tracker the new disk starts
with. Without it, the server refuses the upload as a conflict.)

After that, the live site is the one source of truth — every edit there saves straight to
the Render disk and survives redeploys.

## Using it day to day

- Visa tracker: `https://your-app.onrender.com/`
- Commission tracker: `https://your-app.onrender.com/commission`

Both are behind the same login. Anyone you give the URL and password to can view and edit
everything, so only share the password with people who should have full access.

After 20 wrong passwords from the same address within 15 minutes, that address is locked out for
the rest of the 15 minutes (even with the right password), to stop anyone guessing it.

Daily backups and "today's" exchange rate follow Nepal time. To use a different time zone, set
`APP_TIMEZONE` (e.g. `Europe/London`).

## Updating the code later

Push to the GitHub repo's default branch and Render redeploys automatically
(`autoDeploy: true` in `render.yaml`). Your data isn't touched by a redeploy — it lives on
the persistent disk, separate from the code.

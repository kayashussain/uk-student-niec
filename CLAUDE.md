# Standing rules for this project

## Rule 1: every CSS change is marked, logged and announced (the owner asked for this, and it must never be skipped)

The owner is not a developer and wants to see every change to how the site looks. Whenever you change **any CSS**
(in `shared/theme.css`, `student-details/*.css`, a `<style>` block in any `.html` file, or a style set from JavaScript),
you must do **all three** of these, every time, even for a one-line change:

1. **Mark it in the code.** Put a comment directly above the change, in exactly this form:

   ```css
   /* 🔴 CSS CHANGED (2026-11-04): <what> | from: <old value or look> | to: <new value or look> */
   ```

   Several related changes in one block can share one comment. Never change CSS without this comment.

2. **Log it.** Add a line to `CSS-CHANGES.md` (newest at the top): date, file, what changed, from, to, and why.

3. **Tell the owner in your reply, at the top, before anything else.** Start the reply with a heading like
   `🔴 CSS CHANGED` followed by a short list: which file, what it looked like before, what it looks like now. If no CSS
   was changed in the turn, say so in one line (`CSS changed: none`). Do not bury it, do not summarise it away, and do
   not leave it out because the change was small or because it was a bug fix.

Text cannot be coloured in a terminal or in a code comment, so the red circle `🔴` is the "red" marker. Use it as above.

## Rule 2: there is one version of the code, on `master`, and no other branch (the owner asked for this)

The owner does not want old versions, copies or rewrites lying around, because a later reviewer could pick one up by mistake.

- **Work on `master` only.** Start every session and every review from the latest `master` (`git fetch origin`, then
  `git checkout master`, `git reset --hard origin/master`). Commit and push to `master`.
- **Never create another branch, tag, copy or "backup".** No `backup`, `old`, `v2`, `new` or dated branch, folder or file in
  git. Change a file in place; do not write a second version beside it.
- **If the tool you run in forces a branch on you** (some cloud sessions start on an automatic `claude/...` branch), merge it
  into `master` before you finish, say so at the top of the reply, and name the branch so the owner can delete it. Never
  leave work only on a branch. Finish with `git ls-remote --heads origin`: only `master` should be listed.
- **Backups are not code.** The owner's server takes a backup every day at 6 PM, and the server keeps its own rolling copies
  next to the data (`data.backup.json`, the `backups/` folder). They are never in git. Anything that is a backup must say so in
  its name, and nobody edits a backup: only the main code is changed.
- **Everything is updated together.** When a rule, a formula, a figure or a sentence changes, change it everywhere it
  appears (code, comments, pages, emails, documents, tests), so nothing says the old thing.

## Rule 3: the owner's real data is on the live server, and the data in a preview is made up (the owner insisted on this, strictly)

- The live server holds the real students, intakes, partners and Fact File. The students, intakes and figures in any preview, demo, screenshot
  or test run (`scripts/local-demo.js`, `scripts/demo-data.js`) are **made up by Claude** and must always be called that. Never present
  them as real, and never let the owner think a number from them is real.
- The owner wants to see and work with the real data before pushing to the live server. Claude cannot reach the live server or the owner's
  browser, so the way is `scripts/local-live.js`: the owner downloads a backup from the live server (Admin, Restore, or the daily backup)
  and runs `node scripts/local-live.js <the file>` on their own computer. When the owner asks again for live data, give these steps again,
  say plainly what Claude cannot do, and do not invent data.
- Real data never goes in git, in code, in tests or in screenshots sent anywhere. `live-data/` and the daily backups are ignored by git.
- Every change must work with the data that already exists on the live server: stored values keep their meaning (for example a
  student's Student Source stays "Chitwan Branch"), and new fields are optional.

## Other standing decisions (the owner's wishes)

- **No em dashes and no en dashes anywhere** (pages, emails, documents, code comments, this file). Use a comma, a colon, a
  full stop, a plain hyphen or a vertical bar instead. `test/no-em-dashes.test.js` fails the whole test run if one appears.
- **Always run the complete test suite (`npm test`) before pushing**, not just the browser tests, because rules like the one
  above live in other tests.

- The product is called **International Student Recruitment**, short name **ISR** (titles, emails and tabs say ISR; the login page and the big logo say the full name). It is built so that any consultancy can use it: the consultancy's own name is a setting (Admin, Message templates, signature: Company name and Short name), never written into pages or code. The first installation is Nepal International Educational Consultancy ("Educational", never "Education"), and that is only its starting setting.
- There is **one look only: a light theme, no dark mode and no alternative themes** (the owner asked). It must be easy on older eyes: no pure white panels (soft off-white on a soft grey canvas), strong dark text, larger type and larger buttons.
- The login page must not mention incentives or commissions. Incentive is Admin-only and behind its own password.
- Do not change colours, fonts or layout the owner did not ask about. When a change is needed for a bug fix, say so (Rule 1).
- One sans-serif font everywhere (`--font` in `shared/theme.css`); the serif is only for page titles and big numbers.
- Never put the real Incentive password, tokens or personal data in code, tests or git. It is the `INCENTIVE_PASSWORD`
  setting on the server only.

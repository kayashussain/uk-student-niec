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

## Other standing decisions (the owner's wishes)

- **No em dashes and no en dashes anywhere** (pages, emails, documents, code comments, this file). Use a comma, a colon, a
  full stop, a plain hyphen or a vertical bar instead. `test/no-em-dashes.test.js` fails the whole test run if one appears.
- **Always run the complete test suite (`npm test`) before pushing**, not just the browser tests, because rules like the one
  above live in other tests.

- Company name: **Nepal International Educational Consultancy** ("Educational", never "Education").
- The login page must not mention incentives or commissions. Incentive is Admin-only and behind its own password.
- Do not change colours, fonts or layout the owner did not ask about. When a change is needed for a bug fix, say so (Rule 1).
- One sans-serif font everywhere (`--font` in `shared/theme.css`); the serif is only for page titles and big numbers.
- Never put the real Incentive password, tokens or personal data in code, tests or git. It is the `INCENTIVE_PASSWORD`
  setting on the server only.

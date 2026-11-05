# CSS change log

Every time the look of the site is changed through CSS, a line is added here (newest first), the change is marked in the
code with a comment that starts with `🔴 CSS CHANGED`, and the owner is told at the top of the reply. See `CLAUDE.md`.

To find every marked change in the code, search the project for `CSS CHANGED`.

Format: **date · file · what · from → to · why**

---

## 2026-11-05 · `student-details/app.js` · dropdown columns in the sheet a little wider

- **What:** the width of the columns that hold a dropdown (Student Source, Application Status, Pre CAS Interview and so on) is worked out in the script.
- **From:** the longest choice measured in the small bold font (600 11px) plus 64 → **to:** measured in the font the chip really uses (500 12px) plus 66. The Student Source column grows a few pixels, so "Language Classes" is no longer cut off with "...".
- **In the code:** marked with `🔴 CSS CHANGED` above that line in `student-details/app.js`.

---

## 2026-11-05 · `shared/theme.css` and `shared/login.html` · the whole site in the calmer "Mist" off-white

- **What:** the bright white of the pages, sheet cells, cards, headers, menus and question boxes was replaced by a soft cool off-white, chosen by the owner (option 3, "Mist") so that long days on screen are easier on the eyes. Dark mode is not touched.
- **Colours, from → to:**
  - page background `#f5f6f8` → `#e7eaef`
  - panels, cells, cards, headings `#fdfdfe` → `#f2f4f7`
  - borders `#e4e8ed` → `#d8dde4`; strong borders `#d0d7df` → `#c3cad3`
  - quiet fill (hover, open menu, tags) `#eef1f5` → `#e6e9ee`
  - alternate row stripe `#f7f9fb` → `#ecf0f3`; row hover `#eff4f9` → `#e2e9f1`
  - typing cell `#f8fafc` → `#f7f9fb`; blue tints `#ecf4fb` → `#e6eff8` and `#d3e7f6` → `#cfe2f2`
  - confirm dialogs and messages `#ffffff` → the panel colour
  - login page: page `#f5f6f8` → `#e7eaef`, panel `#fdfdfe` → `#f2f4f7`, left side gradient `#fdfdfe`/`#f0f5fa` → `#f2f4f7`/`#e6ecf2`
- **Not changed:** text colours (text contrast stays about 13 to 1), brand blue and orange, fonts, layout, the QR code box (stays white so it can be scanned) and printing.
- **In the code:** marked with `🔴 CSS CHANGED` in `shared/theme.css` (three places) and in `shared/login.html`.

---

## 2026-11-05 · `student-details/dashboard.css` · Dashboard number cards a little narrower

- **What:** the row of number cards (Applications submitted, Offers received, Mock interviews held, Payments made, Visas issued and the new Head office students).
- **From:** each card at least `150px` wide → **to:** at least `124px` wide, so all six sit in one row on a normal screen. On a narrow screen they wrap onto more rows, as before.
- **Also (not CSS):** the Head office students card says "70% of students" only.
- **In the code:** marked with `🔴 CSS CHANGED` above the `.kpis` rule in `student-details/dashboard.css`.

---

## 2026-11-05 · `counselor-incentive/index.html` · exchange rate box in the "Add a payment" form

- **What:** a new box "£1 = Rs (OANDA)" in the form where a payment is added, so the rate is typed together with the first payment.
- **From:** nothing → **to:** a 160px wide box, same look as the amount box (rounded, 13px text), before the date box. It disappears once the rate is fixed.
- **In the code:** marked with `🔴 CSS CHANGED` at the end of the `<style>` block of `counselor-incentive/index.html`.

---

## 2026-11-04 · `counselor-incentive/index.html` · Company Earnings: branch table taken out, simple rows instead

- **What:** the "Taken by the branches" table was removed at the owner's request.
- **From:** a table with a header row (Student, Branch, University commission, Branch keeps 70%, Head office keeps 30%), branch subtotal rows and a shaded "All branches" row → **to:** one ordinary row per branch student, like the other rows in the card: "Manisha Kawas - Chitwan Branch", with the university commission and "branch keeps 70%" in small grey text, and the amount the branch keeps on the right. No subtotals.
- **Order of the card:** Students Enrolled, Total Commission from Universities, the branch student rows, Total Branch Share Deducted (-), Total Company Earnings (£).
- **Why:** the owner only wants to see which student came from which branch and how much was taken from the head office commission.
- **In the code:** marked with `🔴 CSS CHANGED` in the `<style>` block of `counselor-incentive/index.html` (where the table styles used to be).

---

## 2026-11-04 · `counselor-incentive/index.html` · Payments Received card: exchange rate note

- **What:** a small explanation line at the top of the Payments Received card, saying whether the exchange rate is live (updated every hour) or fixed from the first payment.
- **From:** nothing → **to:** 12px grey text (same grey as the other hints), 12px 16px padding, a thin line under it.
- **Also (not CSS):** the "Previous Advance" row and box were removed from the Payment Summary, so that row's look is gone.
- **In the code:** marked with `🔴 CSS CHANGED` at the end of the `<style>` block of `counselor-incentive/index.html`.

---

## 2026-11-04 · `counselor-incentive/index.html` · Company Earnings: branch list shown as a table

- **What:** the "Taken by the branches" list under Total Commission from Universities.
- **From:** a plain list of rows (student name, amount) with bold subtotal lines → **to:** a proper table with a header row (Student, Branch, University commission, Branch keeps 70%, Head office keeps 30%), no vertical lines between columns, numbers right-aligned, a light grey subtotal row for each branch with more than one student, and a shaded total row "All branches".
- **Fonts and colours:** the same as the rest of the page (13px text, grey 11px headings, the existing soft shaded total colour).
- **Why:** easier to read and check at a glance.
- **In the code:** marked with `🔴 CSS CHANGED` at the end of the `<style>` block of `counselor-incentive/index.html`.

---

## 2026-11-04 · `counselor-incentive/index.html` · Payments Received card and exchange rate row (Incentive page)

- **What:** the new "Payments Received" card under the Payment Summary, and the exchange rate row at the top of the Payment Summary.
- **Add form:** from nothing → to a date box, an amount box and a note box in one row (wraps on small screens), with a navy `#17324d` "Add payment" button (white text, 6px rounded, same size text as the rest, 13px).
- **History rows:** from nothing → to the date (and note) on the left, the amount and a small underlined grey "Remove" link on the right (turns red when hovered). Same row look as the Payment Summary.
- **Exchange rate row:** bold value, with the date and time it was fetched in small grey text after it.
- **Why:** so part payments can be added with a date and listed as a history, and the rate used is visible at the top.
- **In the code:** marked with `🔴 CSS CHANGED` at the end of the `<style>` block of `counselor-incentive/index.html`.

---

## 2026-11-04 · `counselor-incentive/index.html` · unit dropdown in the three flexible incentive cells

- **What:** a small Rs / £ / % dropdown inside each cell of Enrollment Incentive, Enrollment Incentive from University and New Partnership Incentive.
- **Cell layout:** from a plain right-aligned number → to the dropdown at the left and the number at the right (`td.flex-cell`: `padding-left: 78px`, width `200px` for the heading and the cells (they were fixed at `132px`, like every number column), the dropdown `position: absolute; left: 8px`, `width: 62px`, `min-height: 28px`, `font-size: 12px`, fully rounded).
- **Why:** so the unit can be picked from a list instead of typing a symbol every time.
- **In the code:** marked with `🔴 CSS CHANGED` at the end of the `<style>` block of `counselor-incentive/index.html`.

---

## 2026-11-04 · `shared/login.html` · login page headline put back to the earlier size

- **What:** the size of "Welcome back to your team's workspace." was put back, because the larger size looked too huge. The sentence and the three points under it also came back (text, not CSS).
- **font-size:** from `clamp(44px, 5.2vw, 96px)` → to `clamp(30px, 3.4vw, 46px)`
- **max-width:** from `16ch` → to `14ch`
- **line-height:** from `1.08` → to `1.1`
- **In the code:** marked with `🔴 CSS CHANGED` above the `.hero h2` rule.

---

## 2026-11-04 · `shared/login.html` · login page headline (only the headline)

- **What:** the size of "Welcome back to your team's workspace." on the left of the login page. Nothing else on the page changed.
- **font-size:** from `clamp(30px, 3.4vw, 46px)` → to `clamp(44px, 5.2vw, 96px)` (grows with the screen: about 75px on a 1440px screen)
- **max-width:** from `14ch` → to `16ch` (three even lines: "Welcome back to / your team's / workspace.")
- **line-height:** from `1.1` → to `1.08`
- **Why:** with only the headline on that side, the old size looked small and odd on a normal or large screen.
- **In the code:** marked with `🔴 CSS CHANGED` above the `.hero h2` rule.

---

## 2026-11-04 · the rule itself

- Nothing about the look changed. This log and the marking rule were created.
- Earlier CSS changes in the redesign (white/off-white theme, equal status boxes, date cells, filter menu, dropdowns and so
  on) are not marked line by line, because the rule did not exist yet. Their full history is in git:
  `git log -p -- shared/theme.css student-details/style.css`
- The main place where the site's look is controlled is `shared/theme.css`, loaded last on every page.

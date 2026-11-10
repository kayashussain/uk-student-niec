# CSS change log

Every time the look of the site is changed through CSS, a line is added here (newest first), the change is marked in the
code with a comment that starts with `🔴 CSS CHANGED`, and the owner is told at the top of the reply. See `CLAUDE.md`.

To find every marked change in the code, search the project for `CSS CHANGED`.

Format: **date · file · what · from → to · why**

---

## 2026-11-07 · `shared/theme.css` · fee cells in coloured rows, hovering a selected row, four-digit row numbers

- **What, from, to:**
  - The two worked-out fee cells (Fee After Scholarship, Remaining Tuition Fee): **from** white in coloured, striped and red (Defer warning) rows, which left two white holes in the row, **to** the row's own colour, stripe or red, like every other cell.
  - Hovering a selected row: **from** the hover grey replaced the blue, so a picked row looked unpicked under the mouse, **to** a selected row stays blue under the mouse. Other rows still turn grey on hover.
  - S.N cell: **from** 13px side padding, so row numbers 1000 and up were cut off, **to** 4px side padding (what `student-details/style.css` always meant), so four-digit numbers fit. The column width is unchanged.
- **Not changed:** colours, fonts, layout.
- **Why:** bugs found by the independent review of the sheet, each measured in a real browser.
- **In the code:** two `🔴 CSS CHANGED (2026-11-07)` comments in `shared/theme.css`, one above the hover rules and one below the coloured-row rules.

---

## 2026-11-07 · `shared/theme.css` · a coloured row shows its colour straight away, and no box on the first cell

- **What:** Student Details rows coloured with **Colour rows**, while they are still selected.
- **From:** after picking a row from its S.N and choosing a colour, only the S.N cell turned the colour; the rest of the row stayed light blue (the selection) until you clicked another row. Picking a row from its S.N also drew a blue box round its first cell.
- **To:** the whole row shows its colour at once. A picked coloured row keeps a thin blue line along its top and bottom and a blue S.N cell, so you can still see it is picked. No box is drawn on the first cell while whole rows are picked (the box still shows when you click a single cell, as before). Rows without a colour look exactly as before.
- **Why:** bug reported by the owner. The selection colour was painted over the row colour on every cell; only the S.N cell had a stronger rule.
- **In the code:** marked with `🔴 CSS CHANGED (2026-11-07)` below the `.rc-grey td.col-idx` rule in `shared/theme.css`.

---

## 2026-11-06 · `shared/theme.css`, `shared/header.css`, `student-details/dashboard.css`, `student-details/admin.css`, `student-details/style.css` · the smallest texts on Student Details, the Dashboard, Users and Activity, and two keyboard fixes

- **What and from, to:**
  - Status cards on Student Details (Total Students, Inquiry, Application Stage ...): label 9.5px to 11px, and a long word breaks onto the next line instead of being cut off ("APPLICATIO" on a phone).
  - Card group title 10.5px to 12px; the "All changes saved" text, the "Shortcuts" button, the bottom bar, the sheet list heading and the filter arrow 11px or 9px to 12px; the "Expired / Expiring" and Defer warning flags 10px to 12px.
  - Dashboard table headings and Users and Activity table headings 11px to 12px; the Activity action badge 11px to 12px; the small note under Dashboard bars about 10.4px to 12px; the top bar arrow 10px to 12px.
  - Dashboard bar rows: keyboard focus was only a faint background change; now it also has a 2px blue outline (hover is unchanged).
  - Defer warning rows (red): the red now only colours the background, so the calendar icon in date cells stays visible (it used to disappear, which made the cells look uneditable).
- **Not changed:** colours, fonts, the status badges and dropdown text inside the sheet cells (so the column widths do not move), the layout.
- **Why:** the owner wants no hard-to-read small text; the independent design review measured each of these in a real browser.
- **In the code:** each is marked with `🔴 CSS CHANGED (2026-11-06)` in the file named above.

---

## 2026-11-06 · `counselor-incentive/index.html` · the smallest texts on the Incentive table

- **What:** the green "SYNCED" badge in the Visa Issue Date cells, the Rs / £ / % dropdown in the three incentive columns, and the table column headings (Incentive page only; the Student Details sheet is not touched).
- **From:** badge 9px, dropdown 12px, headings 12.5px. **To:** badge 11px, dropdown 13px, headings 13px. Same colours; the number columns keep their widths.
- **Why:** the owner asked for no hard-to-read small text on the Incentive page (found by the independent review).
- **In the code:** marked with `🔴 CSS CHANGED (2026-11-06)` above `.synced-badge` in the page's style block.

---

## 2026-11-06 · `shared/theme.css`, `shared/header.css` · Incentive page and Company Earnings: readable and more premium

- **What:** the grey notes beside the labels on the Incentive page (for example "15% of Net Incentives", "fixed since the first payment", "university commission £2,362.50, branch keeps 70%", the exchange rate note), the table footer, the "synced" text, the "Remove" links, and the key totals. Also the two smallest texts in the top bar on every page.
- **From:** notes 10.5px and 11px; footer and "synced" 11px; "Remove" 12px; summary rows 15px labels at 13px, padding 10px 16px (14px 22px in the theme), totals 22px; top bar company name and account role 11px.
- **To:** every note and footer 13px (never smaller); summary rows with 15px labels, 16px figures and 17px 26px padding; a soft row highlight on hover; the key totals (Net Payable, Total received, Total Company Earnings, My Share) have a thin orange mark at the left edge and larger serif figures (26px, My Share 30px); top bar company name and role 12px.
- **Not changed:** colours (still the Mist palette), fonts (same sans-serif and serif), the table columns and their widths, the layout order of the cards.
- **Why:** the owner found the small text hard to read and wants a calm, premium, luxurious feel.
- **In the code:** marked with `🔴 CSS CHANGED (2026-11-06)` in `shared/theme.css` (below `.grid-footer`) and in `shared/header.css` (above `.niec-brand-sub`).

---

## 2026-11-05 · `student-details/style.css` · "Clear all filters" bar in Student Details

- **What:** a new slim bar under the status cards. It appears only while a search or a column filter is on, says what is filtering and how many students are shown ("Filtered by Application Status. Showing 7 of 12 students."), and has a **Clear all filters** button.
- **From:** nothing (the only clear button was inside the "No students match" message) → **to:** a pale blue bar with rounded corners, 13px text and the button on the right.
- **Why:** filters are now remembered after a refresh, so there must always be a visible way to remove them.
- **Not changed:** the filter menu itself. It lists what is in the column, exactly as before.
- **In the code:** marked with `🔴 CSS CHANGED` above the `.filter-bar` rule at the end of `student-details/style.css`.

---

## 2026-11-05 · `shared/theme.css` · dropdown lists show every choice

- **What:** the list that opens under a dropdown cell (Application Status, Student Source, Pre CAS Interview and so on).
- **From:** the list was at most `340px` tall and each choice had `8px` padding, so Application Status stopped after "Visa Rejected" and Defer, Hold and Withdrawn were hidden below with nothing to show they were there → **to:** up to `480px` tall (never taller than the window), choices with `6px` padding, so all of the choices fit, and the list opens **above** the cell when there is no room below.
- **Why:** it looked as if statuses (CAS Stage, Visa Issued and others) had been removed. They were never removed from the list; they were cut off.
- **In the code:** marked with `🔴 CSS CHANGED` above the `select::picker(select)` rule in `shared/theme.css`.

---

## 2026-11-05 · `shared/edit-guard.js`, `shared/ui.css`, `student-details/dashboard.css` · the pieces of white the first Mist pass missed

- **What:** a second, stricter check (every page, every menu, dialog and message, every element at any size) found three places that still had their own pure white or light shimmer.
- **"Do you really want to make this change?" box and its Cancel button** (`shared/edit-guard.js`): background `#fff` → the page panel colour `#f2f4f7`.
- **Grey loading bars** (`shared/ui.css` and `student-details/dashboard.css`): `#eaeef3` / `#f6f8fb` → `#dde2e9` / `#eceff3`.
- **Left white on purpose:** the QR code box (so phones can scan it), printed pages, the emails the system sends, and the "type here" cells on the Incentive page (`#f7f9fb`, a touch lighter than the rest so people see where to type).
- **In the code:** each is marked with `🔴 CSS CHANGED` where it changed.

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
- **Also (not CSS):** the card is called "Active head office applicant" and counts head office students who are at Application Stage, Mock Stage, Payment Stage, CAS Stage, CAS Issued, Visa Lodge, Visa Issued or Visa Rejected.
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

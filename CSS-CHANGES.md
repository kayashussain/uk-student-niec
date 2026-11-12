# CSS change log

Every time the look of the site is changed through CSS, a line is added here (newest first), the change is marked in the
code with a comment that starts with `🔴 CSS CHANGED`, and the owner is told at the top of the reply. See `CLAUDE.md`.

To find every marked change in the code, search the project for `CSS CHANGED`.

Format: **date · file · what · from → to · why**

---

## 2026-11-12 · every stylesheet and `shared/login.html` · one light look, comfortable for older eyes

The owner asked for one look only, the light one, and made it comfortable for team members who find bright white hard to look at.

- **One theme:** all dark-mode rules were removed from every stylesheet and page (22 blocks), and the page now declares itself light-only, so a computer set to dark mode shows the same light portal.
- **No glare:** from pure white panels on a near-white page → to soft off-white panels (`#f7f8fa`) on a soft grey canvas (`#e9ecf0`), a slightly darker line colour so edges are easy to see, and softer shadows. Text boxes are a gentle off-white (`#fbfcfd`).
- **Contrast:** body text is `#1a2230` (about 15 to 1 against the panels, far above the usual minimum of 4.5 to 1); secondary text is `#424c5b` (about 7 to 1); every status tag is at least 6 to 1.
- **Bigger:** body text 15px (was 14px); sheet text 15px, with roomier rows (11px padding); sheet headings 13px; buttons 42px tall (was 36px) with 14.5px text; small buttons 36px; search box 44px tall; status tags and labels 13px; status-box labels 12px. The sheet's column widths follow the larger type, so nothing is cut off with "...".
- **Colours:** the main blue is a little calmer (`#1f5fc0`, was `#0071e3`); the old bright orange became a deeper amber (`#b86a00`); the green, blue, amber and red tags are slightly deeper so their text is easy to read.
- **Menu and login:** the frosted menu and the login page use the same soft greys instead of white.

---

## 2026-11-12 · `shared/theme.css`, `student-details/portal.css`, `style.css`, `dashboard.css`, `fact-file.css`, `admin.css`, `shared/ui.css`, `shared/header.css` · the final design pass: Today screen, one design system, motion, empty states, small screens

- **Today (new first screen, `portal.css`):** a large greeting, three big numbers, and five cards (inquiries to follow up, applications to submit, mock interviews to schedule, offers waiting for the deposit, CAS received with the visa not lodged). Each student is a row with initials and a stage tag, a click away from their card. A card with nothing to do shows a green "All clear". Rounded 24px cards, soft shadows, one blue count badge.
- **One design system (`theme.css`):** a spacing scale in steps of 4px; chart colours and the orange accent now come from the same tokens; every leftover hard-coded old colour in the page stylesheets (old orange `#fc6e1f`, old blues `#0077a8`, `#066a97`, `#2a78d6`) was replaced by the new accent orange `#ff9f0a` and blue `#0058b0` / `#0071e3`.
- **Motion:** pages rise in softly (8px, 0.38s), loading boxes shimmer, messages and dialogs pop in, the dim behind a dialog is blurred. All of it stops for people who have asked their device for less motion.
- **Empty states:** an empty list shows a soft blue round mark with a short message, not a bare line.
- **Small screens:** nothing scrolls sideways at tablet or phone width (the message page stacks into one column, wide tables scroll inside their card, the top menu scrolls inside itself). Checked on desktop, tablet and phone, in light and dark mode, as Admin, a team member and the Manager.
- **Menu:** a new first item, Today (a sun icon); the logo now goes to Today.

---

## 2026-11-12 · `shared/header.js`, `shared/header.css`, `shared/login.html` · the real Fly logo in the menu and on the login page

The owner noticed the logo on screen was not the final logo. It was only the small plane square next to the typed word "Fly".

- **Menu top:** from the small plane square plus the word "Fly" in plain type → to the final logo itself: the word "Fly" in the logo's own rounded letters, the dotted path and the paper plane (170px wide). When the menu is folded, and on a phone, the small plane square is shown instead.
- **Login page:** from the small plane square plus "Fly" in plain type → to the final logo, large, at the top of the welcome side.
- The small plane square in the folded menu now uses exactly the same drawing as the logo files (before, its plane was drawn smaller).

---

## 2026-11-12 · `shared/theme.css`, `shared/header.css`, `shared/login.html` · an Apple-grade look: light, airy and precise

The owner asked for the design of a top consumer brand: premium, expensive, calm.

- **Menu:** from a black column → to a light frosted glass column (translucent white with a blur, a hairline edge). The open page is a soft blue pill with blue text. The dark mode is dark frosted glass.
- **Colours:** from a grey page with black buttons and bright electric blue → to a soft grey canvas (`#f5f5f7`), white surfaces with hairline edges and gentle depth, near-black text (`#1d1d1f`), and one calm Apple-style blue (`#0071e3`) for the main button, the open page and focus. Dark mode is soft graphite with a lighter blue.
- **Type:** from heavy bold titles and numbers (weight 800) → to refined semibold (titles 650, numbers 600) with tight spacing, on the system's own font (San Francisco on a Mac, Segoe UI on Windows).
- **Buttons:** from outlined or black pills → to soft grey pills, with the main action in solid blue.
- **Cards:** from bordered cards with an accent bar → to borderless-feeling white cards with soft layered shadows and 24px corners.
- **Sheet:** no vertical lines between columns, roomier rows, a lighter heading row.
- **Login page:** from a black welcome side → to a bright airy page with a soft blue glow, dark text and a blue Log in button.

---

## 2026-11-12 · `shared/header.js`, `shared/header.css`, `shared/login.html`, favicon, `brand/` · the final Fly logo: a paper plane on a dotted path

The owner chose the skewed two-fold paper plane (number 3 of the paper plane options, Telegram-like) as the final logo.

- **Logo:** from a three-feather wing on a blue-violet square → to a skewed two-fold paper plane (white on the blue-violet square in the menu and on the login page; blue-violet on white or black in the full logo). The full logo is the word "Fly" with a dotted path rising to the plane.
- **Browser tab and phone icon:** the same plane on the blue-violet square.
- **Documents and emails:** the Fact File page, the printed intake proposal and the account emails show the Fly logo instead of the NIEC logo. A student's email shows only the consultancy's own signature picture.
- **Login page details:** the title "Fly" is heavy sans (not serif), the card's top line and the welcome side's line are blue-to-violet (not blue-to-orange), the Log in button is black and turns blue on hover, and the focus ring is blue.
- **Logo files:** the `brand` folder holds only this logo (SVG and PNG, for light and dark backgrounds, the icon and the plane alone). The earlier options were deleted.

---

## 2026-11-12 · `shared/theme.css`, `shared/header.css`, `shared/header.js`, `shared/login.html` · a bold black-and-white brand with one electric accent

The owner found the ivory and green look dull and yellow, and asked for a brand feel like Apple, Nike or Google, built on how people respond to a screen.

- **Colours:** from warm ivory with forest green and brass → to a light grey page (`#f5f5f7`) with white cards, near-black text (`#0b0b0f`), a black menu, black main buttons and one electric blue (`#2f6bff`) for selection, focus, links and the open page. Status tags are clearer: green, blue, amber, grey, red. Dark mode is true black with the same blue.
- **Type:** from a serif for titles and big numbers → to one heavy, tight sans (titles 40px, weight 800; numbers 800 with even digits) for a confident, Apple-like look.
- **Logo:** from a leaf-like shape on a green square → to a three-feather wing in white on a blue-to-violet rounded square, with "Fly" in heavy white type. The consultancy's name is no longer shown in the menu or on the login page.
- **Login page:** black welcome side with the same mark, white card.

---

## 2026-11-12 · `shared/theme.css`, `shared/header.css`, `shared/header.js`, `shared/login.html` · ivory and forest green with brass, the Fly wing mark

The owner did not like the navy look, the logo or the colours, and chose warm ivory and forest green with a wing mark.

- **Colours:** from navy (menu, buttons, ink) with gold → to deep forest green (menu `#0c231b`, buttons `#123a2e`) with brass (`#b08a45`), on warm ivory (`#f7f4ec`) with white cards. Text is a dark green-black (`#14211b`). Selected cells and focus rings are green (`#1f6b4f`). Dark mode is deep green.
- **Logo:** from a paper plane on a navy square, with the name Fly in bold sans → to a brass wing on a forest-green rounded square, with Fly in a serif wordmark (28px) and the consultancy's name beside it.
- **Menu:** the Search button is removed (Ctrl+K still opens quick search).
- **Login page:** the same forest green, wing and wordmark.

---

## 2026-11-12 · `shared/theme.css` (rewritten from zero), `shared/header.css`, `shared/login.html`, `shared/ui.css` · the Fly design system

The owner asked to forget the earlier CSS rules and comments and design the system properly, as a luxury brand.

- **All old "CSS CHANGED" comments were removed from the code.** This file keeps the history.
- **`shared/theme.css` rewritten from zero:** from the cool blue-white look with NIEC blue → to navy, ivory and a thread of gold. Page ivory (#f6f4ef), white cards with warm hairline borders, navy text (#0c1730), gold accent (#b8924a), navy primary buttons with a soft gold ring on hover, pill-shaped buttons, rounder cards (22px), the serif only for titles and big numbers. Status colours are calmer jewel tones. Dark mode is deep navy with gold buttons. Every old colour name still exists, so no page lost its colours.
- **`shared/header.css`:** the menu mark is navy with a gold paper plane, the open page has a gold mark, the avatar is gold, the menu background is a deeper navy.
- **`shared/login.html`:** the same navy and gold.
- **`shared/ui.css`:** text selection is gold instead of blue.

---

## 2026-11-12 · `shared/header.css`, `shared/header.js`, `shared/login.html` · Fly name, quick search, premium login

- **Menu top (`shared/header.css`, `header.js`):** from the NIEC logo on a white chip with "UK Student NIEC" → to the Fly mark (a paper plane on a blue square), "Fly" in 22px bold white and, under it in small grey-blue, the name of the consultancy using it. Why: the portal is now a product called Fly that any consultancy can use.
- **Quick search (`shared/header.css`):** new. A Search button in the menu and a search box in the middle of the screen (Ctrl+K), white with a soft shadow, for jumping to a student or a page. Why: speed.
- **Login page (`shared/login.html`):** from a pale grey welcome side and a grey card → to a deep-navy welcome side with white text and a bright white card. Why: the same premium look as the portal.

---

## 2026-11-12 · `shared/header.css`, `shared/header.js`, `shared/theme.css`, `student-details/portal.css` · the whole look: a premium portal with a side menu

The owner asked for the system to be changed from zero into a premium, professional recruitment portal, keeping the Google-Sheet-style view of Student Details.

- **`shared/header.css` (rewritten) and `shared/header.js`:** from a white bar across the top with the pages in a row and a blue line under it → to a fixed deep-navy side menu on every page (252px wide, or 78px folded to icons with the Fold the menu button, remembered in the browser), with an icon for each page, the NIEC logo on a white chip, an orange mark on the open page and the account at the bottom. On a window narrower than 900px it goes back to a bar across the top. The card window of a student (a page inside a page) keeps no menu. Why: the owner wanted a real portal with a menu.
- **`shared/theme.css` colours:** from the warm grey "Mist" (page #e7eaef, panels #f2f4f7, ink #1f2933, row stripe #ecf0f3) → to a clean cool look (page #f3f5fa, panels white, ink #0e1a33, row stripe #fafbfe, borders #e4e8f0, hover #eef4ff); the dark mode follows with navy tones. Green, blue, amber and red tags are a little fresher.
- **`shared/theme.css` shape:** from corners of 10, 14 and 20px and flat shadows → to 12, 16 and 22px and soft layered shadows that lift a card off the page.
- **`student-details/portal.css`:** the initials picture on a student card is aligned to the top instead of the middle.
- Fonts are unchanged (one sans-serif everywhere, the serif only for page titles and big numbers). The Student Details sheet keeps its grid, columns and stat boxes: only their colours and corners follow the new palette.

---

## 2026-11-12 · `student-details/style.css` and `app.js` · Open button in each row removed

From: the row number plus a small blue "Open" button (column 92px wide) → to: the row number only (column 56px wide). Why: the owner does not want an Open button in each row or in the toolbar; a double-click on the student's name or row number opens the card.

---

## 2026-11-12 · `student-details/style.css` and `app.js` · Open button in each row

From: only a row number in the S.N cell (column 56px wide) → to: the row number plus a small blue "Open" button (column 92px wide) that opens the student card. Why: the owner asked for a direct way to open a card from the row.

---

## 2026-11-12 · `student-details/portal.css` (new file) · the look of the new portal pages and parts

- **What:** a new stylesheet for the student card, the card window that slides over the sheet, the Add student form, Follow-ups, Message templates, B2B Partners, the option finder in the Fact File and the new Dashboard pages (Decisions, Channels and events, Universities and partners, Team and students lost, Intake plan, and the printable intake proposal).
- **From:** these pages and parts did not exist.
- **To:** the same Mist palette, fonts, rounded cards and pill buttons as the rest of the site (every colour and the font come from `shared/theme.css`; every class starts with `p-`).
- **Existing pages:** no existing rule was changed. The sheet (`index.html`) gains one button (Open card) and the Dashboard gains a row of tabs; both use the new classes. Colours, fonts and layout of everything that existed are as before.
- **Also (2026-11-12):** the Dashboard funnel, weekly pace and "business at a glance" blocks and the Fact File assistant answer list use the same `p-` classes (new rules appended to this file, nothing existing changed).
- **Why:** the owner asked for a recruitment portal with a student card, messages, university options, partners and business analysis.

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

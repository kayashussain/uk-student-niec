# CSS change log

Every time the look of the site is changed through CSS, a line is added here (newest first), the change is marked in the
code with a comment that starts with `🔴 CSS CHANGED`, and the owner is told at the top of the reply. See `CLAUDE.md`.

To find every marked change in the code, search the project for `CSS CHANGED`.

Format: **date · file · what · from → to · why**

- **2026-11-14 · shared/theme.css, shared/ui.js · more alive, as on Apple's own pages · from: bars, rings and the cards lower down a page appeared already drawn and stood still · to: Dashboard, team dashboard and planning bars grow from the left one after another; the source ring and the target ring draw themselves round; cards lower down a page rise into place as they are scrolled to; a slow, soft glow of blue, purple and orange behind the Today greeting; nothing moves for people who ask their computer for less motion · why: the owner asked for a more dynamic, engaging portal, not only page transitions.**

- **2026-11-14 · student-details/events.html · the investment in rupees, dollars or pounds · from: one box "Investment (Rs)" · to: the amount box with a small segmented Rs, $ and £ switch beside it and a grey line saying how it is counted; an event in dollars shows "$500 at Rs 135.20 a dollar" under its rupee figure · why: the owner pays some campaigns (Facebook ads) in dollars and wants every total in rupees.**

- **2026-11-14 · shared/theme.css (portal-ui.js, today-page.js, student-page.js, header.js) · tasks: who gave them to whom, calm comments and red dots · from: chat bubbles (blue right, grey left) with a text box inside a second box that looked broken; no way to see that the other side had written · to: "From SK Kayas Hussain → Application Team · 14 Nov" under each task; comments as a calm record (a round initial, the name in bold, the time in grey, the words under it, thin lines between); one clean text box with a blue "Comment" pill; a red dot with its number on a task with something new, a red "2 new" on its comment line and its list, a thin red edge on the task, and a red badge on Today in the menu that pops when something new arrives; Today lists "For you", "Tasks you have given" and (Admin) "Given by others" · why: the owner said the comment box looked crashed, felt like a messenger, and that they did not notice when the team commented.**

- **2026-11-14 · shared/theme.css · the top bar on a phone · from: a blue "ISR" badge where the logo should be, with a stray line under it · to: the consultancy's logo, 32px high, and no line · why: the owner asked for only the logo at the top, on every page and screen.**

- **2026-11-14 · shared/theme.css, shared/ui.js · pages that feel alive · from: figure tiles and partner cards appeared all at once and stood still · to: the figure tiles (Dashboard, team dashboards, Events and marketing) and the partner cards rise in one after another, their numbers count up from zero in about 0.7s, the tiles lift a little under the mouse and press in when clicked; nothing moves for people who ask their computer for less motion · why: the owner asked for an engaging, dynamic portal that feels like playing, not working.**

- **2026-11-14 · shared/theme.css, shared/ui.js, student-details/student-page.js, events-page.js · switching inside a page · from: a student card tab, or the All, Campaigns and Events switch, swapped its content at once; opening an event replaced the list at once · to: a switch inside a page cross-fades in 0.2s; opening an event and going back glide like moving to another page, with the menu still · why: the owner said some parts felt smooth and others not finished.**

- **2026-11-14 · student-details/events.html · the Events and marketing page in the same Apple look as the rest · from: a black pill on the chosen All, Campaigns or Events; a yellow bordered warning; navy names; underlined enquiry names; enquiry columns that did not line up from row to row; a bronze arrow and bronze outline tags; a serif event title; "-" where there was no cost per visa; dates written 11/5/2026 · to: the grey segmented switch with a sliding white pill; a soft notice with an orange dot; near-black names; enquiry names that turn blue on hover; columns that line up; a grey arrow that slides right on hover; soft orange campaign tags; the title in the system font; rows that rise in one after another; "None yet" in grey; dates written 5 Nov 2026 · why: the owner said Events and marketing did not feel properly finished.**

- **2026-11-14 · shared/theme.css · tasks without dates, with a conversation on each task · from: a date pill on every task ("Due today", "Late, was due 3 days ago") with a red or amber edge; no way to talk about a task · to: no date pill; under every task a "Comment" line opens a conversation styled like Apple's Messages (your comments in blue bubbles on the right, the other side's in grey on the left, a round text box with a blue send arrow); a reply from the other side shows a blue "Reply from ..." badge and opens by itself; the conversation slides open and closed, a new comment pops in, and the tick circle springs when pressed · why: the owner asked for tasks to be only "which team and what to do", and for the team and whoever gave the task to talk it through in the task.**

- **2026-11-14 · shared/theme.css (with header.js, login.html, ui.js, portal-ui.js, today-page.js) · the second smoothness pass, from an independent review that recorded every page change frame by frame · from: during a page change the old and new page showed at once, half see-through; on Windows computers the menu and page jumped sideways by the scrollbar's width between short and long pages; on All Students the team buttons, the intake tabs and the bottom line appeared a moment late and pushed things; Escape and confirm boxes closed instantly; the first page after logging in had an empty menu for a moment; the "Done" notice sat over the red demo bar; a ticked task vanished at once and the next one jumped under the mouse · to: the old page fades away first and the new one glides in just after (no overlap); the scrollbar's space is always kept; the buttons, tabs and bottom line are right in the first picture; every pop-up closes with the same short fade and shrink; the menu is ready on the first page after logging in; notices appear below the demo bar in near-black text; a ticked task turns blue with a tick and folds away before the list redraws · why: the owner asked for Mac-like smoothness and an independent review of anything that still looked like a jump or a crash.**

- **2026-11-14 · shared/theme.css (header.js, every page's <head>) · moving between pages and opening pop-ups, made to feel like macOS · from: the whole window, menu included, faded out and back in, and the menu showed empty for a moment while it was drawn (it looked like a crash); the page area replayed its own rise on top; pop-ups rose from below · to: the menu stays perfectly still (each page waits to show its first picture until the menu is drawn, from what the tab remembers); only the page area changes: the old page fades away in 0.15s and the new one glides in with a short fade and a 12px rise on an iOS-style spring; pop-ups zoom in from 94% like a macOS window · why: the owner said the menu went numb and everything faded and reloaded when moving from the Dashboard to All Students, and asked for real Mac-like transitions.**

- **2026-11-14 · shared/theme.css · two phone layout fixes from the crash and layout review · from: two-column forms (My email, Assign a task, Add student) squeezed to half width on a 390px phone, and a task's "Given 8 Nov" note ran past its card as "Given 8 No" · to: one column on narrow screens; the due tag and the note wrap inside the card · why: found by the page-by-page review the owner asked for.**

- **2026-11-14 · shared/theme.css, student-details/dashboard.css, portal.css, style.css, admin.css, shared/header.css, shared/login.html, shared/ui.css, shared/ui.js · clean-up and the last old pieces, from two independent reviews · from: the old navy, bronze, champagne and orange colour settings still at the top of the style file (so --accent, --blue and similar stayed navy), a second copy of the colours on <body>; about 180 style rules for things no page has any more (old tiles, old Dashboard pages, the old authenticator, old menu parts) and rules fully overridden later; old underline tabs that beat the new tabs outside the student card; Users, Activity and Incentive tabs in navy with an orange underline; navy chips and counts; navy-barred tiles on Activity; orange step circles and bars on the Fact File university page; bronze note pills, a navy bar on the chosen option and black underlined links on the student card; coloured bars on task rows, the task panel and strips; champagne initials; navy filter buttons and checkboxes; a square navy "Add payment"; square confirm buttons; a navy-tinted Ctrl+K; labels of 11 to 12.5px; page titles of four sizes; coloured stubs on the Dashboard cards · to: one set of colours (the Apple ones) in one place; the dead and overridden rules deleted; every tab row a segmented control with the sliding pill; soft grey or soft blue pills; no coloured bars (the status pills say late or due); Apple blue for links, step numbers and switched-on chips; white initials; a blue pill "Add payment"; pill buttons in confirm boxes; a neutral blurred Ctrl+K; labels at least 13px; page titles 36px everywhere (Today's greeting 40px) · why: the owner asked for the code to be clean and every corner of every page reviewed and brought to the Apple look.**

- **2026-11-14 · shared/theme.css, student-details/style.css, shared/ui.js, student-details/portal-ui.js · movement and the last pieces of the Apple look · from: segmented controls that jumped; the "Show numbers" boxes with serif figures, a blue line under Total and a bronze or orange Conversion rate with a line under it; pop-ups (Add student, Assign a task, Edit details ...) with a serif title and a hard line under the header; no transition between pages; buttons without press feedback; the old "NIEC UK brand look" layer and older stat-box layers still in the file under the Apple look · to: a white pill that slides to the chosen segment (card tabs, intake tabs, Dashboard switches); "Show numbers" as calm rounded tiles that slide in, figures in the system font, Total in blue, Conversion rate in green, no lines; pop-ups as Mac-style sheets that spring open and fade away, a large clean title, a round grey close button, no header line, a blurred background; Mac-style toasts; a soft cross-fade between pages (Chrome and Edge); buttons that press in slightly; cards and rows that ease on hover; the old layers deleted; everything at once for people who ask their computer for less motion · why: the owner said Show numbers and the Add student pop-up were left in the old look, and asked for the portal to move like a Mac.**

- **2026-11-14 · shared/theme.css, shared/login.html, shared/header.js, student-details/dashboard.js (donut colours), shared/fonts (Inter) · EVERY page in the design language of Apple's website and apps (first shown on All Students and the student card, then asked for everywhere) · from: navy and bronze, a Palatino serif for titles, names and big numbers, bluish greys, outlined buttons, bordered pills, a bronze line on cards, "UK" beside the logo, a two-half login page · to: the system font first (SF Pro on Apple devices, where it is built in; Inter elsewhere); Apple's light grey canvas (#f5f5f7), off-white rounded panels (#fbfbfd, 18 to 22px corners) with soft shadows instead of borders; near-black text (#1d1d1f) and grey secondary text (#515154); main buttons as blue pills (#0071e3), the others as soft grey pills (#e8e8ed); links and focus rings in Apple blue; tabs as segmented controls; table headings in small spaced capitals; light lines between every cell on All Students; charts and the source donut in Apple's system colours (blue, orange, green, indigo, teal ...); a frosted menu with only the NIEC logo at the top; the login page as one calm centred column like Apple's sign-in page (the NIEC logo, "Sign in", tall rounded fields, a blue "Sign in" pill). Apple's images, logo and font files are not copied · why: the owner asked for the whole portal to feel like Apple's own website and portal, and for "UK" to be removed beside the logo.**

- **2026-11-14 · shared/theme.css, shared/login.html · the name beside the logo · from: the NIEC logo, then "NIEC" in bold and "International Student Recruitment" (on the login page "International Student Recruitment Portal") under it → to: only the NIEC logo with "UK" beside it in bold (24px in the menu, 30px on the login page); the line at the foot of the login picture is gone · why: the owner said the logo already says NIEC, so only UK is needed beside it.**

- **2026-11-14 · shared/theme.css (header.js) · the NIEC UK brand look on every page · from: navy (#1d2f52) and bronze (#9a7b4f), page titles and big numbers in a Palatino serif, a grey canvas (#e9ecf0), navy-tinted shadows, "ISR" in big letters at the top of the menu → to: near-black (#1d1d1f) titles and figures in the clean system display font (SF Pro on Apple, Segoe UI on Windows) with slightly tighter letters; the NIEC logo blue (#0077c8, buttons #0071bc) for buttons, links, the open tab and every small accent where bronze was; a lighter, cooler canvas (#eef0f3), soft off-white panels (#fafbfc), hairline borders (#e0e3e8), softer and wider shadows; a frosted menu with the NIEC logo, the short name (for example NIEC UK) and "International Student Recruitment" under it, the open page as a soft light pill with a blue icon · why: the owner asked for a branded NIEC UK portal that feels calm, cool and expensive, like Apple or a top global brand.**

- **2026-11-14 · shared/login.html · the login page in the NIEC UK look · from: "International Student Recruitment" in bold type at the top left, navy and bronze colours, a navy Log in button · to: the NIEC logo on a soft tile with the short name and "International Student Recruitment Portal" beside it, a large near-black welcome line in the display font, a NIEC blue Log in button, focus ring and list dots, a fine blue line near the bottom · why: the same request.**

- **2026-11-14 · shared/theme.css · light lines between the cells on All Students · from: only a faint line under each row and no line between the columns → to: a light grey line (#dde2e9) between every column and under every row, and between the column headings, so each cell reads as its own box; light, not dark · why: the owner asked for a light border in the All Students sheet so it is clear where each cell is and easier to work in.**

- **2026-11-14 · shared/theme.css (today-page.js, today.html) · Today rebuilt quiet, around the tasks · from: three number tiles, a row of buttons (Open All Students, Add many students, Follow-up, Dashboard), a plain task box and big work-list cards with up to six students each → to: a short greeting (the team's name in small bronze capitals, a large navy serif "Good morning", the date); a highlighted "Your tasks" panel (Admin and the Manager: "Tasks you have given") with a bronze edge, the tasks grouped Late, Due today, Coming up and Later, each a soft row with a round tick, the task in larger type, the student and stage under it and the due date as a tag (red when late, amber today), done ones under "Done this week"; then one calm "Needs attention" list, a line per kind of work with its count in a navy pill, opened with a click to show who · why: the owner asked for Today to show only the assigned tasks and what needs attention, highlighted and not busy, without the student, follow-up and dashboard buttons.**

- **2026-11-14 · shared/theme.css (my-dashboard.html, my-dashboard-page.js) · a Dashboard of its own for each team · from: nothing (a team that opened Dashboard was sent back to Today) → to: four figure cards in navy serif (the first with a bronze line), a slim task line (red edge when a task is late) linking to Today, then four calm cards: This week against last week, Where the students are (navy bars), Coming up in the next 7 days, Good news of the last 30 days · why: the owner asked for each team to have its own engaging dashboard.**

- **2026-11-14 · shared/theme.css (student-page.js) · tasks on the student card · from: an empty "Tasks" card with a second "Assign a task" button even when there was no task; plain task lines · to: the Tasks card shows only when the student has a task (Assign a task stays at the top), with the same rows as Today (round tick, larger task text, team tag, due tag red when late, amber today) · why: the owner said the assigned tasks and the student card felt cheap.**

- **2026-11-14 · shared/theme.css · card headings, card heads and form fields on the portal pages (student card, Follow-up, Add many students, compose, templates, partners) · from: small 16 to 18px sans card headings; a card's Edit button dropped under a long heading ("Where the student came from"); form fields 14px, 38px high, the dropdowns smaller than the text boxes · to: card headings in the navy serif at 21px like the page titles; the heading shrinks so its button stays beside it; fields and dropdowns 15px, 44px high, labels 13.5px, a soft navy ring while typing · why: the owner asked for every page to feel calmer, more professional and premium, and easy on older eyes.**

- **2026-11-14 · shared/theme.css, student-details/portal.css · the old Today and task styles removed (t-tile, t-card, t-task, t-tasks, t-clear, t-kind, p-task and the rest) · from: kept though no page used them any more · to: gone; nothing on screen changes · why: one version of the code only (CLAUDE.md Rule 2).**

- **2026-11-14 · student-details/dashboard.css (dashboard.js, dashboard.html) · Dashboard drill-down charts · from: two cards answering the same question (where applicants came from, and a long list of where students came from with a table per source), plus separate Partners and Agents tables → to: one "Where students came from" card with a switch (By source / By who received): a donut of the sources with a clickable legend; a click shows that source's events, platforms, agents or branches as bars (light bar students, dark part visas); a click on a bar lists the students, and a click on a name opens the student card; a path at the top (All sources › Events › UK Study Seminar) goes back up; Partners drills the same way (partner, its universities, the students); the Agents card is gone (agents are under By who received) · why: the owner said the two cards were the same and the page too long, and asked for an engaging click-to-go-deeper view like Power BI.**

- **2026-11-14 · student-details/dashboard.css (dashboard.js) · Dashboard: sources, partners and agents · from: a headline card "Applicants from Head Office" that repeated the list beside it; no view of the students' sources, the partners or the agents → to: headline cards Students, Applicants, Offers, Payments, Visas; "Where applicants came from" (Head Office first, each branch, each agent) beside the visa target; a full-width "Where students came from" with each Student Source as a soft block (its totals, then each event, platform, agent or branch with students, applied and visas; long names wrap); "Partners" (each partner university and B2B partner, tagged) and "Agents" as calm tables; no cost figures on the Dashboard (they are on Events and marketing) · why: the owner said the Head Office card repeated the list, and asked for sources down to each event, for partners and agents, and to keep cost per student on Events and marketing only.**

- **2026-11-14 · shared/theme.css (templates.html, templates-page.js) · Message templates rebuilt calm and premium · from: two plain columns (template boxes with the email signature form under them, and one long editor with a grid of stage tick boxes and a "Words you can use" fold-out) and a long yellow notice → to: a short soft notice; two underline tabs, Templates and Email signature; a slim list with a search on the left, each template a quiet row (name in navy, its stages, an "Edited" or "Yours" tag), the open one marked with a bronze line; the editor in calm panels (Name and stages with the stages as pills; Email with the subject, the message and the fill-in words as chips that go where you are typing; WhatsApp) and a Save bar that stays at the bottom; the signature on its own tab in three panels (Who signs, The company, How students reach you) · why: the owner asked for a better, cooler, calmer, branded Message templates page.**

- **2026-11-13 · student-details/dashboard.css, dashboard.html · the Dashboard as one calm page · from: five tabs (Overview, Decisions, Marketing and sources, Universities and partners, Intake plan), headline cards, a "Needs a decision" list, a week-by-week chart, the biggest sources, and "(not recorded)" rows in some lists → to: one page, no tabs: five headline cards in a row (Students, Applicants, Applicants from Head Office with a bronze line under it, Payments, Visas issued); "Where applicants came from" with Head Office first on a soft navy band, then each branch and each agent with applicants and visas; the visa target ring with a small box to set or change the target (Admin); the student journey; the top universities with no "not recorded" row · why: the owner asked for only what the head of a consultancy needs, the total applicants from Head Office, no Intake plan and nothing shown as not recorded.**

- **2026-11-13 · shared/theme.css (today-page.js, student-page.js) · tasks for the teams · from: nothing → to: on Today a soft panel "Today's tasks" (a team) or "Assigned tasks" (Admin and the Manager) above the work lists: one row per task with a round tick (navy with a white tick when done), the student in navy with the stage tag, the task, a small line (team, by when, from whom, done by; amber when overdue), done tasks struck through and hidden until "Show done"; a small "Your work lists" or "Needs attention" heading above the work lists; on the student card an "Assign a task" button and a Tasks panel with the same rows · why: the owner asked to give a team a task from a student card and for each team to see and tick its tasks, with Admin seeing what is done.**

- **2026-11-13 · student-details/app.js, student-details/agents.html, shared/theme.css · Receiving Partner as a dropdown, and agents named on the sheet shown on Agents · from: the Receiving Partner cell on All Students was a box to type any name; the Agents page listed only the agents added by hand → to: the Receiving Partner cell is a dropdown in the same look as the other choice columns, with two groups, "Head office and branches" (Head Office, Chitwan, Pokhara, Palpa and Butwal Branch) and "Agents"; on Agents every name in the Receiving Partner column that is not the head office or a branch shows as a dashed "Not set up" card with "Set up" and "Not an agent"; the Agents page keeps the calm card look of B2B Partners · why: the owner asked for the Receiving Partner to be picked from a list (head office, branch or agent) and for the agents named there to be listed.**

- **2026-11-13 · shared/theme.css (b2b-page.js) · B2B partners named on the sheet are shown on their own · from: the B2B Partners list was empty until each partner was added by hand, so none of the partners in the University Partner column showed → to: every name in the University Partner column that is not a university and not set up yet shows as a card with a dashed border, an amber "Not set up" tag, its students and visas, and "Set up" and "Not a partner" buttons; a quiet line at the end lists the names marked as not a partner, each with "show again" · why: the owner said every non-university name in the University Partner column is a B2B partner (Navitas excepted) and they were not showing.**

- **2026-11-13 · shared/theme.css, student-details/b2b-page.js, student-details/app.js · University Partner as a dropdown, B2B Partners without "Add from the sheet" and without the commission tile · from: the University Partner cell on All Students was a box to type any name; B2B Partners had an "Add from the sheet" button and a summary tile "Commission for Jan Intake 2027: 3 missing"; each card said "Commission, Jan Intake 2027" or "Missing for ..." → to: the University Partner cell is a dropdown (the same look as the other choice columns) with two groups, Partner Universities and B2B Partners; the button and the tile are gone; each card says "Commission list, Jan Intake 2027" with Open the link or Open the PDF, or a calm amber "Not uploaded yet" · why: the owner said partners must be added on B2B Partners first and then picked in All Students, and that a partner's commission differs by university, so one figure per intake makes no sense (the tile only counted missing commission files, which read like a figure).**

- **2026-11-13 · shared/theme.css (b2b.html, agents.html, b2b-page.js) · B2B Partners and Agents rebuilt calm and premium, with the application submission · from: three plain number tiles, one table (name, status, agreement ends, commission, contact person, number, visas) and one long editor form under it; no place for where to submit applications → to: a summary band divided by fine lines (active partners, visas through them, ready to submit, commission for the current intake in amber when some are missing); a search box; each partner as a soft card (name in navy, city and visas, status tag), on B2B Partners a navy-tinted "Application submission" box (Open portal, the username and the password, dots until Show, each with Copy, or the email with Copy and Write email), then Commission of the current intake, Contact and Agreement; the editor as its own view in numbered steps (the partner, application submission with login details, contacts, commission by intake, files, visas by intake, notes) with a Save bar that stays at the bottom; an "Add from the sheet" window that lists the partners named in the University Partner column with tick boxes · why: the owner asked for a top-brand B2B Partners page, for the partners in the University Partner column (not the universities) to be listed, and for the application email or portal login of each partner so the team knows where to send applications.**

- **2026-11-13 · shared/theme.css · one brand look on every page, for every account (Today, Dashboard, Follow-up, Add many students, Fact File, B2B Partners, Agents, Users, Activity, Message templates, and the pages already redone) · from: heavy black sans page titles and numbers, plain number tiles, grey rounded pill tabs, cards and tables that each looked a little different, plain grey initials circles → to: every page title in a large navy serif (the same as All Students and the student card) with a short dim intro; number tiles and Dashboard figures in navy serif, the first tile with a thin bronze line; tabs as underline tabs with bronze under the open one; cards with the same fine border, soft shadow and navy headings; table headings on a soft navy tint; initials circles in soft navy with a bronze ring; the Today counts in navy · why: the owner asked for the whole portal to feel professional, calm, cool and like a top, expensive brand for every team, Admin and the follow-up team alike.**

- **2026-11-13 · student-details/events.html, shared/theme.css · Events and marketing rebuilt around each event's uploaded list of students, the "Came from" filter on All Students, and the campaign question removed · from: a grid of big event cards with four separate number tiles; a required "Did this student come from a campaign?" box when Social Media was chosen; no way to show only one event's students on All Students → to: one calm summary band (Spent, Students, Visas, Cost per student, Cost per visa) divided by fine lines; every event as a row of a clean ledger with its figures in lined-up columns and an arrow; an event opens as its own view (name in a large navy serif, its figures band, a soft "Students from this event" panel to upload the list with a review of every line in coloured groups: green New, navy On the sheet, grey Already tagged, amber Other event, red Skipped, and its students with phone, stage tag, intake and the latest note); the campaign question box is gone (its styles removed); on All Students a rounded "Came from" box beside the search · why: the owner said the team may add students before the campaign is entered and may answer the question wrongly, asked for the campaign's own list of students to be uploaded and placed in All Students at Inquiry, for the follow-up team to be able to work one event's students, and said the page still did not look good.**

- **2026-11-13 · shared/theme.css, student-details/events.html (events-page.js) · no campaign student missed · from: when "Social Media" was chosen, only the platform list (Facebook, TikTok ...) and a "Campaign name or remarks" box, so a student from a paid campaign could be saved without being linked to it; the event cards showed cost per student but not cost per visa → to: a soft amber-edged box "Did this student come from a campaign? (required)" with one pill per social media campaign running now or ended in the last 45 days, and "No, not from a campaign" (the chosen pill turns navy); the form does not save until it is answered, and "Events" does not save until the event is chosen; the remarks box is now "Remarks (optional)"; every event card also shows "Cost per visa" · why: the owner asked the system to make sure no student from an event or a campaign is missed, so every rupee is matched to the students and visas it brought.**

- **2026-11-13 · student-details/events.html · Events and marketing rebuilt calm and premium · from: four plain number tiles, one wide table (name, ran, days, cost, leads, applied, visas, cost per lead), a plain list of students under it, and a form with a long "What it is" list → to: four soft number tiles with serif figures and a bronze line under "Cost per student"; an amber note when social media students are not linked to any campaign; filter pills (All, Marketing, Events); each event or marketing as a soft card (name in navy, a "where it ran" tag, dates and days, the place and note, then Cost and Cost per student in larger serif figures and Students, Applied and Visas under them, with Students and Edit buttons); the students of one in a small window; the form with "Where it ran" as one row of pills (the chosen one in navy) instead of the long list · why: the owner found the many types confusing, asked whether social media students are counted in a campaign's cost per student (they were not), and asked for a calm, strong, premium page.**

- **2026-11-13 · student-details/direct.html · Partner Universities: application submission on every card, and a shorter editor · from: the list cards showed only "Open portal" and a "Login saved" tag (the team had to open each university for the login), with a status tag, "Direct agreement" and Agreement ends; the editor had seven steps including Status, How you hold it, Agreement ends and Notes → to: on every card the campuses as soft tags under the name, then a soft navy-tinted "Application submission" box with "Open portal", the username and the password (dots until Show), each with Copy, or the email with Copy and "Write email"; then Commission, Contact and Agreement ("Since ..." and the files); the editor in five steps: 1 The university (name, agreement started, campuses), 2 Application submission (portal link or email, and "Login details" for a link), 3 Contacts, 4 Commission and payment, 5 Agreement files · why: the owner said opening each university to find where to submit was tiring, that partners are always active and never end, and asked to drop the fields they do not use.**

- **2026-11-13 · student-details/direct.html, shared/theme.css · Partner Universities rebuilt calm and roomy, one Application box with a portal login, and the login on the student card · from: a ten-column table squeezed into a 1200px box (names, phones and emails broken over several lines); one long editor form under the list with every field at once; separate Portal link and Email boxes → to: a wider page (up to 1480px) with a search box and a short "Add a partner university" line; each university as a calm card (name in navy, status tag, "Direct agreement" or "Through ...", then Application, Campuses as soft tags, Commission, Agreement ends and Contact, with "Not entered yet" in grey where empty, and "Open details"); the editor opens as its own page with a Back link, in seven numbered steps (The university, Application, Contacts, Campuses, Commission and payment, Agreement files, Notes), each in a soft panel with one line of help, roomy boxes in tidy columns, the B2B partner box only when "Through a B2B partner" is chosen, and a Save bar that stays at the bottom of the screen; one "Application (link or email)" box that says which it is, with a Portal username and a Portal password (hidden, with Show) only for a link; on the student card, under "Open portal", the username and the password (dots until Show) each in a soft box with Copy · why: the owner asked for one application box (a link or an email) with a password for portals that the team can copy, and said the Partner Universities page was confusing and squeezed into a small box, asking for a calm, clean, soft, premium page.**

- **2026-11-13 · shared/theme.css, student-details/direct.html · where to send applications · from: nothing → to: on Partner Universities a new "Application link" column ("Open portal" and the application email, each on its own line, in the link colour) and an "Application link" section in the editor (Portal link, Email); on the student card a full-width "Application link" line under the details, with "Open portal" as a small navy-outlined button with an arrow (opens in a new tab) and the email as a link beside it · why: the owner asked to save each partner university's application portal link or email so the team can see it and submit applications.**

- **2026-11-13 · student-details/portal.css, shared/theme.css (and student-details/student.html) · a bigger, spacious student card and new insides for its three tabs · from: a 600px card (a narrow strip, little room for the details), "Student card" written beside the Close button, buttons under the name, details in two columns, and the tabs (Notes, University options, Send a message) in the plain portal look: one narrow column, small grey note lines with blue dots, a crowded form, small course boxes and a long single list of message choices → to: a 920px card (about two thirds of a laptop screen, so a third of All Students stays in view; the same size at every zoom, full width only when the window is narrower than the card), only "Close" at the top, the buttons in the top right corner and the journey line and details (three columns) across the full width; Notes: "Where the student came from" in a slim left column and the notes in a wide right column, a roomy writing box, each note as a calm entry (name in navy, the kind as a fine bronze tag, the date in grey, Remove at the far right); University options: the form in three tidy columns with taller rounded boxes, each course as a refined row with the fee and scholarship in a soft strip; Send a message: a two-column grid of message tiles with an arrow · why: the owner asked to drop the words "Student card", to give the three tabs the same premium, calm front end, and to make the card much more spacious so the details can be read.**

- **2026-11-13 · shared/theme.css (and student-details/student-page.js for the journey line) · the student card, calm and clean · from: a heavy deep navy band at the top with ivory text, champagne links and a champagne button → to: a light, calm top panel (soft off-white, a fine bronze line along its top), the name in a large navy serif, the initials in a soft navy circle with a thin bronze ring, the stage as a soft navy tag and the source as a fine outlined tag, a new slim journey line under the name (8 steps from Inquiry to Visa issued: navy for steps done, bronze for where the student is now, grey for what is to come, with "Step 3 of 8: Mock interview" under it; Withdrawn, Hold, Defer and Visa Rejected show a calm amber note "Not moving at the moment"), the details as a quiet two-column list with navy links, a navy "Send a message" and an outlined "Edit details"; a "Student card" heading with a fine line under it · why: the owner did not find the card good and asked for a branded, premium, expensive, clean and calm front end.**

- **2026-11-13 · shared/theme.css, student-details/portal.css, shared/login.html, shared/edit-guard.js, counselor-incentive/index.html, student-details/dashboard-insights.js · one brand colour for the whole portal, and fixed sizes for the number boxes and the student card · from: a bright blue (#1f5fc0) for buttons, links, the open menu item, focus rings, the blue status pills and the charts, while All Students and the student card used near-black ink and bronze; a blue-to-purple account circle; cyan and orange touches on the login page; the 13 number boxes above the sheet stretched with the window and squeezed (labels on two lines) when it was narrower or zoomed in; the student card shrank with a narrow window → to: one deep navy (#1d2f52) everywhere (buttons, links, the open menu item with a bronze line on its left, the blue status pills, the first chart colour, the student card's top band), a brighter navy (#2e4c84) for focus rings so they stay easy to see, bronze (#9a7b4f) and champagne (#e6cfa3) as the accent, a navy account circle with champagne letters, the login page in navy and bronze; green, amber and red keep their meaning; every number box one fixed size (160 by 70) that wraps onto the next row at any zoom; the student card always 600px wide (full width only on a phone narrower than that) · why: the owner saw the card and boxes still change when zooming in and out and asked for a fixed small size, and asked for one consistent, premium brand colour instead of black in one place and blue in another.**

- **2026-11-13 · shared/theme.css · the student card, a premium look (the card that opens from All Students, and the same page opened on its own) · from: a light panel with a blue stripe down its left side, a small dark circle with the initials, a bright blue "Send a message" button, grey rounded tabs, plain panels, blue timeline dots and blue "Remove" links; the email broke in the middle ("example.co m") → to: a deep ink band at the top with the name in a large serif in ivory, a thin bronze ring round the initials, the stage and source as fine outlined tags, champagne email and WhatsApp links (the email on its own line, so it never breaks), a bronze "Send a message" button and an outlined "Edit details"; tabs with a bronze line under the open one; panels with fine borders and roomier spacing, ink "Add note" and similar buttons, bronze timeline dots and quiet underlined "Remove" links · why: the owner said the student card looked boring and cheap and asked for a luxury, expensive, premium and branded look. Also the page is now called All Students (menu, title, buttons and links), which is a text change, not CSS.**

- **2026-11-13 · student-details/portal.css, shared/theme.css, student-details/index.html, new-student.js · the student card and the Student Details buttons · from: the student card was a wide panel (980px, two thirds of a laptop screen and almost all of it when zoomed in) whose top kept jumping between three layouts as the zoom changed and broke emails in the middle; buttons in the order + Add student, Add many, Export Excel, Colour rows, Bulk follow-up, Delete rows → to: a smaller card (640px, full width only on a phone) with one steady layout at every zoom (name, buttons under it, details in two columns, one on a phone), emails only break when they cannot fit; buttons + Add student, Follow-up, Colour rows, Delete rows, Export Excel, and Add many students is a grey box at the top of the Add student window that opens the Add many students page · why: the owner said the card broke when zooming in and out, and asked for this order of buttons, with Add many inside Add student and "Follow-up" instead of "Bulk follow-up".**

- **2026-11-13 · shared/theme.css, student-details/index.html · the Student Details page, a calmer and more premium look (this page only) · from: the page title hidden; search, Undo, Redo and six actions scattered over two rows as plain grey words with a bright blue button; 13 separate number boxes in two uneven rows; a plain grey table heading; small grey intake tabs; on a short screen the intake tabs were squashed into the last row → to: a large serif title "Student Details" with a green "All changes saved" note beside it and the search on the right; one tidy row of outlined buttons with a deep ink "+ Add student", Delete rows in red at the end, Undo and Redo at the right; all the numbers in one soft panel divided by fine lines, with serif figures (Total and Conversion rate marked by a thin bronze line); the table in a rounded panel with darker heading text and a firm line under it; the open intake tab in dark ink with a bronze line under it; the intake tabs keep their full height · why: the owner said the Student Details page looked messy and complicated and asked for a professional, premium, expensive feel, one page at a time. The side menu and every other page are unchanged.**

- **2026-11-13 · counselor-incentive/index.html · the Incentive table on laptop screens (1600px wide and narrower) · from: a rule meant for the Users and Partner Universities tables squeezed every column into the screen, so course names, university names and dates broke into two or three letters a line and each row was very tall → to: each cell stays on one line and the table scrolls sideways inside its card, as it was built to (the number headings still wrap onto two lines) · why: a bug found while rehearsing the upgrade of the live server on data shaped like the live data; no colour, font or size was changed.**

- **2026-11-13 · shared/theme.css · an empty date box on the sheet (seen in the Language Test column) · from: the "nothing here yet" look (a round badge with a dot, big padding) was also drawn inside every empty date box, so a student with no language test date had a tall row with a stray circle and the calendar icon pushed below → to: that look is only for the "nothing here yet" panels; an empty date box is one line with the calendar icon again · why: a bug found in the same rehearsal (the live sheet has many students with no test date); no colour, font or size was changed.**

- **2026-11-13 · shared/theme.css (bar added by shared/header.js) · a warning bar on the demo preview · from: nothing, so made-up students could look real → to: a red bar across the top of every page of the demo saying the students and numbers are made up (never shown on the live server or on a copy of your real data) · why: the owner insisted the preview data is not his real data and wants that to be clear.**

- **2026-11-13 · student-details/dashboard.css · the printed proposal · from: the second page ran over to a third page → to: both pages fit one A4 sheet each · why: the owner asked for a short proposal with charts.**

- **2026-11-13 · student-details/dashboard.css · sizes of the big numbers on the Dashboard · from: the small-text rule for bold words also shrank the big numbers to 14px → to: the big numbers keep their own sizes (38px, 30px, 20px) · why: found while checking the new Dashboard.**

- **2026-11-13 · student-details/dashboard.css (and dashboard.js, dashboard-insights.js) · the Dashboard, rebuilt for decisions | from: six headline cards compared with the last intake, a ring with jargon, many lists; long cards of text on Decisions, Universities and Intake plan; a seven-page proposal with no charts → to: four headline cards, a target ring with one plain sentence, a short "needs a decision" list, a funnel, two lines for the week, the top five sources and universities; Decisions as numbered cards with one line of what is seen and one of what to do; Universities as ranked bars; Intake plan with the visa target at the top and progress bars; and a two-page A4 proposal with bar charts · why: the owner said the Dashboard showed too many statistics poorly, compared with the wrong intake, used words he could not follow, and printed as a seven-page proposal without charts.**

- **2026-11-13 · shared/theme.css, shared/header.css, shared/header.js · the menu open and close button, and the number tiles above the sheet · from: a "Fold the menu" link that shrank the menu to icons; large tiles that stretched to fill the row and were cut off when zoomed in → to: a 3-bar button at the top of the menu that closes it to a narrow strip and opens it again; small tiles of a fixed size that wrap onto a second row instead of being cut off · why: the owner asked for a 3-bar menu button and small cards that do not get cropped at 67 to 90 percent zoom.**

- **2026-11-13 · shared/theme.css · order of the phone menu bar · from: your account button dropped below the open menu list → to: it stays on the bar at the right of the Menu button, and the list opens under the bar · why: found while checking the new phone menu.**

- **2026-11-13 · shared/theme.css (also the phone menu in shared/header.js) · design polish from the designer review · from: the phone menu was a cloud of links; empty Today cards took a whole tile each; many small headings in capital letters; plain browser file and date boxes; a scroll shadow on tables that did not scroll; editor sections with no space between; a small pop-up close X; Dashboard cards of different heights and a washed-out ring; the printed Fact File top shown on screen → to: a tidy phone bar with a Menu button that opens the page list; one quiet line per empty card; sentence-case headings; pill file button and date boxes that match; no stray shadow; more space under titles and between editor sections; a 40px close button; equal Dashboard card heights; a clearer ring; the printed top only when printing · why: the owner asked for the best front end.**

- **2026-11-13 · shared/header.css, shared/header.js, shared/login.html, mailer · the name | from: "International Student Recruitment" with PORTAL under it everywhere → to: just "ISR" in the menu (tight space); the full name International Student Recruitment, without the word Portal, on the login page, in emails and on printed pages · why: the owner said to use ISR where space is short and the full name where there is room.**

- **2026-11-13 · shared/login.html · the title in the login box · from: the long name repeated ("International Student Recruitment") → to: "Staff login", because the name is already large on the left · why: the name no longer needs to be said twice.**

- **2026-11-13 · shared/header.css, shared/header.js, shared/login.html, student-details/portal.css, fact-file.css, mailer, favicons · no logo picture any more · from: a globe-and-plane logo picture in the menu, on the login page, in emails and on printed pages → to: the plain text "International Student Recruitment" with PORTAL under it (a small blue ISR tile only when the menu is folded, and as the browser-tab and phone icon) · why: the owner asked for just the name International Student Recruitment portal, with no logo.**

- **2026-11-13 · shared/theme.css · the side menu on short screens, the team note and card tabs on a phone, phone numbers in tables · from: the menu was cut off at short heights with a hidden scroll bar (Today, Incentive and Log out out of reach); the team note ran off the screen on a phone; the student card tabs were cut at the right; phone numbers broke in the middle → to: a thin visible menu scroll bar, tighter spacing on short screens, Log out stays at the bottom; the note and tabs wrap; phone numbers stay whole · why: the second zoom test.**

- **2026-11-13 · shared/theme.css · zoom fixes found by the zoom tester · (1) the Student Details sheet vanished on short screens (tiles and toolbar used all the height) → the sheet keeps room for about 8 rows, the page scrolls, and the tiles become small one-line chips on short screens; (2) the top menu hid pages below 900px → it wraps so every page shows; (3) pop-up form buttons below the visible part → they stay fixed at the bottom; (4) Events, B2B and Agents tables squeezed into one-word lines, Dashboard labels cut with dots, Fact File chips off the edge → readable width with a scroll shadow, wrapped labels and chips · why: the owner's zoom test.**

- **2026-11-13 · shared/login.html · the title in the login box · from: 24px, the longer name wrapped to two lines → to: 20px, one line · why: the portal is now called International Student Recruitment.**

- **2026-11-13 · shared/header.js, shared/login.html, shared/theme.css (logo width), brand/, favicon and app icons · the logo and the name · from: a dotted ring with a paper plane and the name "Recruitment 360" → to: a globe with a paper plane taking off from it, "ISR" in bold beside it (the menu), and "ISR" with "International Student Recruitment" under it (the login page, emails and printed Fact File) · why: the portal is now called International Student Recruitment (ISR), and the owner asked for the best logo.**

- **2026-11-13 · shared/theme.css · amber missing-commission flag, small Dashboard text, Dashboard lists on a phone · from: the flag looked like plain blue text, Dashboard chips and notes were 13px, university lists on a phone ran headings together → to: an amber pill, 14px text, and on a phone only Students and Visas columns with room to read · why: the client's second review.**
- **2026-11-13 · student-details/admin.css · Users, Partner Universities and Activity tables · from: rows turned into labelled cards only below 760px → to: below 1180px, so a zoomed-in browser never cuts the table off · why: the owner's zoom test.**

- **2026-11-13 · shared/theme.css · wide tables when zoomed in, and the Dashboard tabs on a phone · from: Users and Partner Universities tables were wider than the screen below 1100px, and the Dashboard tabs ran off the right edge → to: table cells wrap from 1280px down, and the tabs wrap onto a second line on a phone · why: the owner's zoom test and the width audit.**

- **2026-11-13 · shared/theme.css · number tiles above the sheet · from: one row that scrolled sideways inside itself, so on a zoomed-in browser the last tiles (Withdrawn, Conversion rate) were cut off → to: the tiles wrap onto a second row on narrower screens, so every tile is always visible · why: the owner saw the conversion rate cut off when zooming the browser.**

- **2026-11-13 · shared/theme.css, shared/header.js · Admin pages in the side menu · from: Users, Activity, Message templates and Incentive were only inside the account menu at the bottom → to: they are in the side menu under a small "Admin only" heading (still in the account menu too) · why: the owner could not find them.**

- **2026-11-13 · shared/header.js, shared/login.html, brand/, favicon and app icons · the Recruitment 360 logo, designed properly · from: the paper plane in a blue square with the name typed beside it → to: a dotted ring (the 360 degrees) trailing a paper plane that takes off from it, with the name "Recruitment 360" drawn as letters (so it looks the same on every computer); the folded menu, the browser tab and the phone home screen use the same ring and plane on a blue tile · why: the owner asked for the logo to be fixed first.**

- **2026-11-13 · shared/theme.css · chart text rule · from: a rule meant for chart numbers also shrank the logo text in the menu → to: the rule only applies to the Dashboard charts · why: the logo name read tiny.**

- **2026-11-13 · shared/theme.css · team workspaces (Today label, sheet team note, highlighted team columns) · from: every team saw the same Today and sheet headings → to: a small label on Today for the team, a note beside the sheet title, and the columns a team fills in with a soft blue heading · why: the owner asked for the portal to be modified for each team and for the branches.**

- **2026-11-13 · student-details/dashboard.css, dashboard.html, dashboard.js (code too) · the whole Dashboard Overview · from: the old Numbers page (a hero number, KPI row, bar charts and a table toggle) → to: a new Overview written from zero: six headline cards that compare with the intake before and show a mini trend, a visa target ring with forecast, a funnel with step-to-step rates, a week-by-week chart, a source ranking with a switch (students, visas, reach a visa, cost per student), universities and partners leaderboards, speed of each step, why students are lost as a ring, needs attention, intake against intake, and money · why: the owner asked for the dashboard to be rebuilt from zero, premium, with real statistics and not only tables and diagrams.**

- **2026-11-13 · shared/theme.css · size of the logo in the side menu · from: 170px wide, so the name was tiny → to: 212px wide · why: the new longer name "Recruitment 360" needs more room to read.**

- **2026-11-13 · shared/theme.css · course names in the Fact File · from: plain text lines → to: each course is a link to its page, with a small "Find the course page" button when the page is not known yet · why: the owner asked that a course in the Fact File opens its website page.**
- **2026-11-13 · shared/theme.css (b2b page uses existing classes) · Commission column on B2B Partners and Agents · from: no commission column → to: a column that shows the current intake's commission as a link that opens the PDF or the page, or an amber "Missing for this intake" button · why: the owner wants the updated commission list asked for every intake.**

- **2026-11-13 · shared/header.js, shared/login.html, shared/header.css (marked), brand/ · the logo in the menu, on the login page and in emails · from: the "Fly" letters with the paper plane on a dotted path → to: the paper plane icon with "Recruitment 360" beside it · why: the portal is now called Recruitment 360.**

- **2026-11-12 · shared/theme.css · long tags on the student card on a phone · from: a long event tag ran off the right edge → to: it wraps onto a second line · why: the client's last small finding.**

- **2026-11-12 · shared/theme.css · Partner Universities table at 1440px · from: the table was 40px wider than the screen, so the page scrolled sideways and the last button was cut → to: cells wrap up to 1600px wide screens, and a card scrolls inside itself if still too wide · why: the client saw the clipped button.**
- **2026-11-12 · shared/theme.css · last 13px text and a scroll hint · from: Fact File City and Intakes labels 13.5px, chart numbers and months 13px, no sign that the Fact File fees table scrolls → to: 14px, and a line above the table on narrow screens saying to scroll sideways · why: the client's last blockers.**

- **2026-11-12 · shared/theme.css · small notes on Message templates · from: 13.5px → to: 14px · why: the measured sweep found them as the last items under 14px.**

- **2026-11-12 · shared/theme.css · Fact File fees table · from: 13px text and no sign on a phone that it scrolls sideways → to: 14px text and a soft shadow on the right edge on a phone · why: the client could not tell the table scrolls. (The empty Duration and CAS deposit columns are now left out of the view, a code change.)**

- **2026-11-12 · shared/theme.css · the last items under 14px, found by measuring every page · from: small buttons 13.5px, sheet column headings 13px, row numbers 12.5px, stat tile labels 13px, dropdown options 13px, bold names 13.5px, code boxes 13px, chips 13px, university initials 12px → to: 14px, and 15px for the sheet column headings · why: the client measured these and would approve once nothing is under 14px.**

- **2026-11-12 · shared/theme.css · last small items · from: avatar initials 12px, Dashboard bar notes 12px, chart labels 11px → to: 14px, 14px, 13px · why: finishing the reading-size floor for older eyes.**

- **2026-11-12 · shared/theme.css · a reading-size floor for the whole portal · from: many labels, notes, hints, table headings, menu account line and sub-lines at 10 to 13px → to: 14px for reading text, 15px for table headings, menu names and nav labels; table headings no longer break mid-word; wide tables on a phone show a soft shadow on the right edge · why: the client's last remaining blocker was text too small for older eyes.**

- **2026-11-12 · shared/theme.css · tables at tablet width · from: wide tables on Users and Partner Universities scrolled sideways, cutting off Edit, Reset password, Remove → to: cells wrap so everything is in view · why: the client could not find the buttons on a tablet.**
- **2026-11-12 · shared/theme.css · remaining small text (menu name and role, fold button, dialog labels, messages, counts, footer) · from: 12 to 13px → to: 14px · why: the client still found it small for older eyes.**

- **2026-11-12 · shared/theme.css · small text on the portal pages · from: labels, hints, table headings, chips and captions at 12px → to: 14px for labels and hints, 13px for chips, table headings and captions · why: the client said the small grey text is hard for older eyes.**

- **2026-11-12 · shared/theme.css · "Admin only" label beside page titles · from: tiny grey text on B2B and Agents, yellow pill on Partner Universities → to: the same clear small label on all three · why: the client saw three different looks for the same thing.**

- **2026-11-12 · shared/theme.css · hidden buttons · from: some buttons stayed visible when hidden, so a view-only Manager saw Add many and Add an event → to: hidden always means hidden · why: the client found buttons that only say "not allowed" after you press them.**

- **2026-11-12 · shared/theme.css · number tiles above the sheet · from: lifted on hover like buttons → to: no hover effect · why: the client tried to click them and nothing happened.**
- **2026-11-12 · shared/ui.css and shared/edit-guard.js · OK button in pop-up questions and in "Make this change?" · from: orange → to: the same blue as the other main buttons (danger stays red) · why: the client noticed one orange button among blue ones.**

- **2026-11-12 · shared/theme.css · email page layout at laptop width · from: preview and message side by side below 1500px wide, so the email was cut off at 1366px → to: stacked (preview on top, message below) below 1500px so the whole email shows · why: the human tester saw the right edge of the email cut off on a 1366px laptop.**

---

## 2026-11-12 · `shared/theme.css` · fixes from the front-end review (round 10, part 1)

An independent researcher opened every page as Admin, a team member and the Manager at desktop, tablet and phone sizes. Fixed:
- **Column filter arrow (Student Details):** from a 12px by 18px bit of text with no keyboard access → to a real 30px button with a label, reachable with Tab, and Escape closes the filter menu (also in `app.js`).
- **Sheet toolbar on a phone:** from overflowing the screen with two-line button labels → to wrapping onto more lines with one-line labels.
- **Message templates on a phone:** from the editor pushed off the right edge → to stacked under the list (all two-column pages stack on a phone).
- **Phone menu strip:** from cut mid-word with no cue → to a soft fade at the end that shows there is more.
- **Dashboard bars:** labels such as "University of Wes..." now wrap instead of being cut.
- **File buttons:** from the plain browser grey → to a rounded soft pill.
- **Dialogs and forms:** space between fields, so "Stage" and "Note" no longer touch.
- **Messages ("Click a row number first..."):** from the bottom middle, covering the sheet tabs → to the top right.
- **Headings and tables:** every page now has the same 36px heading and 14.5px table text (Events, Templates, Bulk, Compose and Student were smaller).
- **Student card on a phone:** long pills, emails and the tab strip no longer run past the edge.

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

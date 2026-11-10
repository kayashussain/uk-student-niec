// The Analysis page (analysis.html): fetches the business figures from /api/analysis and the Marketing spend table from
// /api/marketing-spend, and draws them as tables. Names and labels come from student records and from what Admin typed,
// so they are only ever put in with textContent.
(function () {
  const $ = (id) => document.getElementById(id);
  const SOURCES = ['Visitor', 'Reference', 'Chitwan Branch', 'Pokhara Branch', 'Agent', 'Events', 'Social Media', 'Language Classes'];
  let data = null;
  let selected = (() => { try { return decodeURIComponent(location.hash.slice(1)) || 'all'; } catch (e) { return 'all'; } })();
  let loadSeq = 0;
  let spendRows = [];
  let canEditSpend = false;
  let spendDirty = false;
  let decisionRows = [];
  let decisionsDirty = false;
  let targetDraft = null; // what Admin is typing in the Targets table: { intake id: { visas, deadline } }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const num = (v) => Number(v).toLocaleString('en-US');
  const rate = (v, small) => (v === null || v === undefined ? 'n/a' : `${v}%${small ? ' *' : ''}`);
  const money = (v) => (v ? num(v) : '');
  const empty = (c, text) => c.append(el('p', 'empty', text));
  const SMALL_NOTE = '* fewer than 10 students: not yet a pattern.';

  // rows: arrays of cells; a cell is text or { text, cls }. opts.sub marks indented rows by index.
  function table(container, headers, rows, { textCols = 1, sub = new Set(), wrap = false } = {}) {
    const box = el('div', 'scroll-x');
    const t = el('table', 'data');
    const head = el('tr');
    headers.forEach((h, i) => head.append(el('th', i >= textCols ? 'num' : '', h)));
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    rows.forEach((r, n) => {
      const tr = el('tr', sub.has(n) ? 'sub' : '');
      r.forEach((cell, i) => {
        const td = el('td', i >= textCols ? 'num' : '', typeof cell === 'object' ? cell.text : cell);
        if (typeof cell === 'object' && cell.cls) td.classList.add(cell.cls);
        if (wrap) td.classList.add('wrap');
        tr.append(td);
      });
      body.append(tr);
    });
    t.append(thead, body);
    box.append(t);
    container.append(box);
  }

  const CARD_HEAD = ['Students', 'Share', 'Applied', 'Paid', 'Visas', 'Refused', 'Lost', 'Paid rate', 'Visa success'];
  const cardCells = (c) => [num(c.students), rate(c.share), num(c.applied), num(c.paid), num(c.visas), num(c.rejected), num(c.lost), rate(c.paidRate, c.smallSample), rate(c.visaSuccess, c.smallSample)];
  function scoreTable(id, first, cards, { limit = 12, nothing = 'Nothing recorded yet.', compact = true } = {}) {
    const c = $(id);
    c.replaceChildren();
    if (!cards.length) { empty(c, nothing); return; }
    // The half-width cards show the columns that fit; the download has every column.
    if (compact) table(c, [first, 'Students', 'Share', 'Paid', 'Visas', 'Paid rate', 'Visa success'], cards.slice(0, limit).map((g) => [g.label, num(g.students), rate(g.share), num(g.paid), num(g.visas), rate(g.paidRate, g.smallSample), rate(g.visaSuccess, g.smallSample)]));
    else table(c, [first, ...CARD_HEAD], cards.slice(0, limit).map((g) => [g.label, ...cardCells(g)]));
    const notes = [];
    if (cards.length > limit) notes.push(`Showing the biggest ${limit} of ${cards.length}. The download has all of them.`);
    if (cards.slice(0, limit).some((g) => g.smallSample)) notes.push(SMALL_NOTE);
    if (notes.length) c.append(el('p', 'method', notes.join(' ')));
  }

  function renderKpis(d) {
    const t = d.totals;
    const s = d.spend;
    const tiles = [
      ['Students', num(t.students), `${num(t.inquiries)} at Inquiry, ${num(t.active)} still moving`],
      ['Applied', num(t.applied), `${rate(t.appliedRate)} of students`],
      ['Paid', num(t.paid), `${rate(t.paidRate)} of students`],
      ['Visas issued', num(t.visas), `${rate(t.visaRate)} of students`],
      ['Visa success', rate(t.visaSuccess), `${num(t.rejected)} refused of ${num(t.visas + t.rejected)} decided`],
      ['Lost', num(t.lost), 'Deferred, on hold, withdrawn or refused'],
      ['Marketing spend', s.total ? `NPR ${num(s.total)}` : 'None entered', s.costPerVisa ? `NPR ${num(s.costPerVisa)} per visa, ${num(s.costPerStudent)} per student` : s.total ? 'No visa yet to divide by' : 'Enter it below to see costs'],
    ];
    $('kpis').replaceChildren(...tiles.map(([label, value, sub]) => {
      const k = el('div', 'kpi');
      k.append(el('span', 'kpi-label', label), el('span', 'kpi-value', value), el('span', 'kpi-sub', sub));
      return k;
    }));
  }

  const LEVELS = { risk: 'Risk', gap: 'Missing data', info: 'Pattern' };
  function renderFindings(d) {
    const c = $('chartFindings');
    c.replaceChildren();
    if (!d.totals.students) { empty(c, 'No students in this view yet.'); return; }
    if (!d.findings.length) { empty(c, 'Nothing stands out: the key columns are filled in and no single risk shows in the numbers.'); return; }
    table(c, ['Kind', 'What the numbers show', 'What it means', 'What to do'], d.findings.map((f) => [{ text: LEVELS[f.level] || f.level, cls: 'level' }, f.title, f.detail, f.action]), { textCols: 4, wrap: true });
  }

  function renderChannels(d) {
    const c = $('chartChannels');
    c.replaceChildren();
    if (!d.sources.length) { empty(c, 'No student has a Student Source yet.'); return; }
    const rows = [];
    const sub = new Set();
    const cells = (g) => [g.label, ...cardCells(g), num(g.qualified), money(g.spend), g.reportedLeads === null || g.reportedLeads === undefined ? '' : num(g.reportedLeads), money(g.costPerLead), money(g.costPerQualified), money(g.costPerStudent), money(g.costPerPaid), money(g.costPerVisa)];
    d.sources.forEach((s) => {
      rows.push(cells(s));
      // The detail rows are shown when at least one student of the source has a detail.
      if (s.details.some((x) => x.label !== '(not filled in)')) s.details.forEach((x) => { sub.add(rows.length); rows.push(cells(x)); });
    });
    table(c, ['Source and detail', ...CARD_HEAD, 'Qualified', 'Spend', 'Leads reported', 'Per lead', 'Per qualified', 'Per student', 'Per paid', 'Per visa'], rows, { sub });
    c.append(el('p', 'method', `${SMALL_NOTE} A cost is the spend entered for the channel divided by its students; it does not prove the spend brought them. Qualified: marked Qualified on the sheet, or already applied. Leads reported: what the platform or event said, typed in the Marketing spend table.`));
  }

  function renderCampaigns(d) {
    const c = $('chartCampaigns');
    c.replaceChildren();
    if (!d.campaigns.length) { empty(c, 'No student has a Campaign or Event yet. Type the name of the advert or event on the sheet (the same words every time) and it will be counted here.'); return; }
    table(c, ['Campaign or event', ...CARD_HEAD, 'Spend', 'Per student', 'Per visa'], d.campaigns.slice(0, 20).map((g) => [g.label, ...cardCells(g), money(g.spend), money(g.costPerStudent), money(g.costPerVisa)]));
  }

  function renderSeason(d) {
    const c = $('chartSeason');
    c.replaceChildren();
    const s = d.seasonality;
    const total = (list) => list.reduce((a, b) => a + b, 0);
    if (!total(s.inquiries) && !total(s.applications) && !total(s.payments) && !total(s.visas)) { empty(c, 'No dates are entered yet.'); return; }
    const peak = (list) => { const max = Math.max(...list); return max > 0 ? max : -1; };
    const mark = (list, i) => (list[i] === peak(list) ? { text: `${num(list[i])} (peak)` } : num(list[i]));
    table(c, ['Month', 'Inquiries', 'Applications', 'Payments', 'Visas'], s.months.map((m, i) => [m, mark(s.inquiries, i), mark(s.applications, i), mark(s.payments, i), mark(s.visas, i)]));
    const sp = d.speed;
    const days = (g, words) => (g.samples ? `${words}: ${g.medianDays} days in the middle case (${g.samples} students).` : '');
    const speed = [days(sp.inquiryToApplication, 'Inquiry to application'), days(sp.inquiryToPayment, 'Inquiry to payment'), days(sp.applicationToVisa, 'Application to visa')].filter(Boolean).join(' ');
    c.append(el('p', 'method', (total(s.inquiries) ? '' : 'No Inquiry Date is entered yet, so the Inquiries column is empty. ') + speed));
  }

  function renderRisk(id, c, word) {
    const one = c.top1Students;
    const three = c.top3Students;
    $(id).textContent = one.of ? `The biggest ${word} holds ${one.percent}% of students (${one.names[0]}); the biggest three hold ${three.percent}%. ${c.groups} in all.` : `How much rests on each ${word}`;
  }

  function renderLost(d) {
    const c = $('chartLost');
    c.replaceChildren();
    if (!d.totals.lost) { empty(c, 'No student is deferred, on hold, withdrawn or refused in this view.'); return; }
    table(c, ['Lost reason', 'Students', 'Of them refused a visa'], d.lostReasons.map((r) => [r.label, num(r.students), num(r.rejected)]));
    c.append(el('p', 'method', d.lostByStatus.filter((x) => x.students).map((x) => `${x.label}: ${num(x.students)}`).join(', ') + '.'));
  }

  function renderProfile(d) {
    const c = $('chartProfile');
    c.replaceChildren();
    const part = (title, first, cards) => {
      c.append(el('div', 'group-title', title));
      table(c, [first, 'Students', 'Paid', 'Visas', 'Paid rate'], cards.slice(0, 8).map((g) => [g.label, num(g.students), num(g.paid), num(g.visas), rate(g.paidRate, g.smallSample)]));
    };
    if (!d.totals.students) { empty(c, 'Nothing recorded yet.'); return; }
    part('Lead quality', 'Quality', d.leadQuality);
    part('Study level', 'Level', d.studyLevels);
    part('Home district', 'District', d.districts);
  }

  function renderComplete(d) {
    const c = $('chartComplete');
    c.replaceChildren();
    table(c, ['Column', 'What it lets you decide', 'Filled in', 'Of', 'Complete'], d.completeness.map((x) => [x.label, x.decides, num(x.filled), num(x.expected), x.expected ? `${x.percent}%` : 'n/a']), { textCols: 2, wrap: true });
    c.append(el('p', 'method', '"Of" is the number of students the column is expected on: every student, or only those who applied, paid, got a visa or were lost.'));
  }

  // ---- targets and the week ----
  const orDash = (v, suffix = '') => (v === null || v === undefined ? 'n/a' : `${num(v)}${suffix}`);
  function renderTargets() {
    const c = $('targets');
    const d = data;
    c.replaceChildren();
    const rows = d.targets.rows;
    const head = ['Intake', 'Target visas', 'Needed by', 'Visas so far', 'In progress', 'Likely from them', 'Forecast', 'Short by', 'New applications needed', 'Weeks left', 'Applications a week', 'Status'];
    const cells = (r) => [num(r.visas), num(r.inProgress), orDash(r.expectedFromInProgress), r.forecast === null ? 'n/a' : `${num(r.forecast)} (${num(r.forecastLow)} to ${num(r.forecastHigh)})`, orDash(r.gap), orDash(r.applicationsNeeded), orDash(r.weeksLeft), orDash(r.applicationsPerWeek), { text: r.status, cls: 'level' }];
    if (!canEditSpend) {
      if (!rows.length) empty(c, 'No intake has a target yet. Admin can set one here.');
      else table(c, head, rows.map((r) => [r.label, num(r.target), r.deadline || 'No date', ...cells(r)]));
    } else {
      // Admin: every intake is listed, with a box for the target and the date.
      if (!targetDraft) targetDraft = Object.fromEntries(d.intakes.map((i) => { const r = rows.find((x) => x.id === i.id); return [i.id, { visas: r ? r.target : '', deadline: r ? r.deadline : '' }]; }));
      const box = el('div', 'scroll-x');
      const t = el('table', 'data spend-table');
      const hr = el('tr');
      head.forEach((h, i) => hr.append(el('th', i > 2 ? 'num' : '', h)));
      const thead = el('thead');
      thead.append(hr);
      const body = el('tbody');
      d.intakes.forEach((intake) => {
        const draft = targetDraft[intake.id] || (targetDraft[intake.id] = { visas: '', deadline: '' });
        const r = rows.find((x) => x.id === intake.id);
        const tr = el('tr');
        const input = (type, key, label) => {
          const i = el('input');
          i.type = type;
          if (type === 'number') { i.min = 0; i.step = 1; }
          i.value = draft[key];
          i.setAttribute('aria-label', `${label} for ${intake.name}`);
          i.addEventListener('input', () => { draft[key] = i.value; targetDraft.dirty = true; });
          const td = el('td');
          td.append(i);
          return td;
        };
        tr.append(el('td', '', intake.name), input('number', 'visas', 'Target visas'), input('date', 'deadline', 'Needed by'));
        (r ? cells(r) : new Array(9).fill('')).forEach((cell) => { const td = el('td', 'num', typeof cell === 'object' ? cell.text : cell); if (typeof cell === 'object') td.classList.add(cell.cls); tr.append(td); });
        body.append(tr);
      });
      t.append(thead, body);
      box.append(t);
      c.append(box);
      const actions = el('div', 'spend-actions');
      const save = el('button', 'btn btn-sm', 'Save targets');
      save.type = 'button';
      save.addEventListener('click', saveTargets);
      actions.append(save, el('span', 'updated', 'Type the visas wanted and the date they are needed by (for example the last day a visa is useful for the intake). Leave the target empty for no target.'));
      c.append(actions);
    }
    const known = d.targets.visaRateByStep.filter((x) => x.visaRate !== null);
    c.append(el('p', 'method', known.length
      ? 'The forecast uses NIEC\'s own past: of finished students who reached each step, the share who got a visa. ' + known.slice(1).map((x) => `${x.step}: ${x.visaRate}% (${x.finishedStudents} students)`).join(', ') + '. The range beside the forecast is the cautious and the hopeful case. It is an estimate, not a promise.'
      : 'There is not yet enough history on the sheet to forecast: fewer than 10 students have finished their journey.'));

    c.append(el('div', 'group-title', 'The last 7 days against the 7 days before (by the dates typed on the sheet, in this view)'));
    const w = d.week;
    table(c, ['', 'Inquiries', 'Applications', 'Offers', 'Payments', 'Visas'], [['Last 7 days', w.last7Days], ['The 7 days before', w.the7DaysBefore]].map(([label, x]) => [label, num(x.inquiries), num(x.applications), num(x.offers), num(x.payments), num(x.visas)]));
  }

  async function saveTargets() {
    try {
      const { dirty, ...targets } = targetDraft || {};
      const res = await fetch('/api/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: Object.fromEntries(Object.entries(targets).map(([id, v]) => [id, { visas: v.visas === '' ? 0 : Number(v.visas), deadline: v.deadline }])) }) });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) { window.NiecUI.alert(answer.error || 'The targets could not be saved.', { title: 'Not saved' }); return; }
      targetDraft = null;
      window.NiecUI.toast('Targets saved', { type: 'success' });
      load.last = '';
      load();
    } catch (e) {
      window.NiecUI.alert('The targets could not be saved. Check the connection and try again.', { title: 'Not saved' });
    }
  }

  function renderFollow(d) {
    const c = $('chartFollow');
    const f = d.followUps;
    c.replaceChildren();
    const line = `${num(f.overdue)} overdue, ${num(f.dueInNext7Days)} due in the next 7 days, ${num(f.earlyStageWithNoDate)} at Inquiry or Application Stage with no follow-up day.`;
    if (!f.overdue) { empty(c, `No follow-up is overdue. ${line}`); return; }
    table(c, ['Student', 'Counselor', 'Stage', 'Intake', 'Days overdue'], f.longestOverdue.map((x) => [x.name || 'Unnamed student', x.counselor || '(not filled in)', x.stage, x.intake, num(x.daysOverdue)]), { textCols: 4 });
    c.append(el('p', 'method', `${line} Overdue by counselor: ${f.overdueByCounselor.map((x) => `${x.label} ${num(x.count)}`).join(', ')}.`));
  }

  // ---- the Decision log ----
  const DECISION_FIELDS = [['date', 'Date', 'date'], ['problem', 'Problem', 'text'], ['decision', 'Decision', 'text'], ['expected', 'Expected result', 'text'], ['reviewDate', 'Review on', 'date'], ['actual', 'Actual result', 'text'], ['lesson', 'Lesson', 'text']];
  function renderDecisions() {
    const c = $('decisions');
    c.replaceChildren();
    if (!canEditSpend) {
      if (!decisionRows.length) { empty(c, 'No decision is written yet. Admin can write them here.'); return; }
      table(c, [...DECISION_FIELDS.map((f) => f[1]), 'Outcome'], decisionRows.map((r) => [...DECISION_FIELDS.map((f) => r[f[0]]), r.outcome]), { textCols: 8, wrap: true });
      return;
    }
    const box = el('div', 'scroll-x');
    const t = el('table', 'data spend-table');
    const hr = el('tr');
    [...DECISION_FIELDS.map((f) => f[1]), 'Outcome', ''].forEach((h) => hr.append(el('th', '', h)));
    const thead = el('thead');
    thead.append(hr);
    const body = el('tbody');
    decisionRows.forEach((row, n) => {
      const tr = el('tr');
      DECISION_FIELDS.forEach(([key, label, type]) => {
        const i = el('input');
        i.type = type;
        if (type === 'text') i.maxLength = 500;
        i.value = row[key] || '';
        i.title = row[key] || '';
        i.setAttribute('aria-label', `${label}, line ${n + 1}`);
        i.addEventListener('input', () => { row[key] = i.value; decisionsDirty = true; });
        const td = el('td');
        td.append(i);
        tr.append(td);
      });
      const pick = el('select');
      pick.setAttribute('aria-label', `Outcome, line ${n + 1}`);
      [['', 'Not judged yet'], ['Continue', 'Continue'], ['Change', 'Change'], ['Stop', 'Stop']].forEach(([v, text]) => pick.add(new Option(text, v)));
      pick.value = row.outcome || '';
      pick.addEventListener('change', () => { row.outcome = pick.value; decisionsDirty = true; });
      const remove = el('button', 'btn btn-sm btn-danger', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove decision ${n + 1}`);
      remove.addEventListener('click', () => { decisionRows.splice(n, 1); decisionsDirty = true; renderDecisions(); });
      const a = el('td');
      a.append(pick);
      const b = el('td');
      b.append(remove);
      tr.append(a, b);
      body.append(tr);
    });
    t.append(thead, body);
    box.append(t);
    if (decisionRows.length) c.append(box); else empty(c, 'No decision is written yet. Add one each time something is decided: a campaign, a budget, a new university, a change in the team.');
    const actions = el('div', 'spend-actions');
    const addLine = el('button', 'btn btn-sm', 'Add a decision');
    addLine.type = 'button';
    addLine.addEventListener('click', () => { decisionRows.unshift({ date: data ? data.today : '', problem: '', decision: '', expected: '', reviewDate: '', actual: '', lesson: '', outcome: '' }); decisionsDirty = true; renderDecisions(); });
    const save = el('button', 'btn btn-sm', 'Save decisions');
    save.type = 'button';
    save.addEventListener('click', saveDecisions);
    actions.append(addLine, save, el('span', 'updated', 'Write the expected result as a number and a day (for example "15 applications by 20 December"), so it can be checked. No student names, emails or phone numbers.'));
    c.append(actions);
  }
  async function saveDecisions() {
    try {
      const res = await fetch('/api/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: decisionRows }) });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) { window.NiecUI.alert(answer.error || 'The decisions could not be saved.', { title: 'Not saved' }); return; }
      decisionRows = answer.rows;
      decisionsDirty = false;
      renderDecisions();
      window.NiecUI.toast('Decisions saved', { type: 'success' });
      load.last = '';
      load();
    } catch (e) {
      window.NiecUI.alert('The decisions could not be saved. Check the connection and try again.', { title: 'Not saved' });
    }
  }
  async function loadDecisions() {
    try {
      const res = await fetch('/api/decisions', { cache: 'no-store' });
      if (!res.ok || decisionsDirty) return;
      decisionRows = (await res.json()).rows;
      renderDecisions();
    } catch (e) { /* the figures above still show */ }
  }

  // ---- the management report: one page of plain text to send upward or paste into a document ----
  function report() {
    if (!data) return;
    const d = data;
    const t = d.totals;
    const view = d.selected === 'all' ? 'All intakes' : (d.intakes.find((i) => i.id === d.selected) || {}).name || 'One intake';
    const L = [];
    const title = (x) => { L.push('', x.toUpperCase(), '-'.repeat(x.length)); };
    L.push('NIEC UK RECRUITMENT: MANAGEMENT REPORT', `${view} | prepared ${d.today} from the live student sheet`);
    title('Headline');
    L.push(`Students: ${num(t.students)} (${num(t.inquiries)} at Inquiry, ${num(t.active)} in progress, ${num(t.lost)} lost)`,
      `Applied: ${num(t.applied)} (${rate(t.appliedRate)}) | Paid: ${num(t.paid)} (${rate(t.paidRate)}) | Visas issued: ${num(t.visas)} (${rate(t.visaRate)})`,
      `Visa success: ${rate(t.visaSuccess)} (${num(t.rejected)} refused of ${num(t.visas + t.rejected)} decided)`,
      d.spend.total ? `Marketing spend: NPR ${num(d.spend.total)}${d.spend.costPerStudent ? ` | per student NPR ${num(d.spend.costPerStudent)}` : ''}${d.spend.costPerVisa ? ` | per visa NPR ${num(d.spend.costPerVisa)}` : ''}` : 'Marketing spend: none entered');
    title('Targets');
    if (!d.targets.rows.length) L.push('No intake has a visa target yet.');
    d.targets.rows.forEach((r) => L.push(`${r.label}: target ${num(r.target)}${r.deadline ? ' by ' + r.deadline : ''} | issued ${num(r.visas)} | forecast ${r.forecast === null ? 'not enough history' : `${num(r.forecast)} (${num(r.forecastLow)} to ${num(r.forecastHigh)})`} | ${r.status}${r.applicationsNeeded ? ` | ${num(r.applicationsNeeded)} more applications needed${r.applicationsPerWeek !== null && r.weeksLeft ? `, ${r.applicationsPerWeek} a week` : ''}` : ''}`));
    title('Last 7 days against the 7 days before');
    ['inquiries', 'applications', 'offers', 'payments', 'visas'].forEach((k) => L.push(`${k.charAt(0).toUpperCase() + k.slice(1)}: ${num(d.week.last7Days[k])} (before: ${num(d.week.the7DaysBefore[k])})`));
    title('What stands out and what to do');
    if (!d.findings.length) L.push('Nothing stands out.');
    d.findings.forEach((f, i) => L.push(`${i + 1}. [${LEVELS[f.level] || f.level}] ${f.title}`, `   Meaning: ${f.detail}`, `   Action: ${f.action}`));
    const top = (name, list, extra = () => '') => { title(name); const named = list.filter((g) => g.students); if (!named.length) L.push('Nothing recorded yet.'); named.slice(0, 6).forEach((g) => L.push(`${g.label}: ${num(g.students)} students (${rate(g.share)}), ${num(g.paid)} paid, ${num(g.visas)} visas, paid rate ${rate(g.paidRate, g.smallSample)}${extra(g)}`)); };
    top('Channels', d.sources, (g) => (g.spend ? `, spend NPR ${num(g.spend)}${g.costPerVisa ? `, NPR ${num(g.costPerVisa)} per visa` : ''}` : ''));
    top('Universities', d.universities);
    top('Courses', d.courses);
    title('Follow-ups');
    L.push(`${num(d.followUps.overdue)} overdue, ${num(d.followUps.dueInNext7Days)} due in the next 7 days, ${num(d.followUps.earlyStageWithNoDate)} early-stage students with no follow-up day.`);
    title('How far to trust these numbers');
    d.completeness.filter((x) => x.expected && x.percent < 80).forEach((x) => L.push(`${x.label}: filled in for ${x.percent}% (${num(x.filled)} of ${num(x.expected)})`));
    L.push('* a rate from fewer than 10 students: not yet a pattern.', ...d.notes);
    const a = el('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + L.join('\r\n')], { type: 'text/plain;charset=utf-8' }));
    a.download = `niec-management-report-${view.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${d.today}.txt`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- the Marketing spend table ----
  function renderSpend() {
    const c = $('spend');
    c.replaceChildren();
    const intakes = data ? data.intakes : [];
    const intakeName = (id) => (intakes.find((i) => i.id === id) || { name: id ? 'An intake no longer on the sheet' : 'Not tied to an intake' }).name;
    if (!canEditSpend) {
      if (!spendRows.length) { empty(c, 'No spend is entered yet. Admin can enter it here.'); return; }
      table(c, ['Month', 'Intake', 'Source', 'Detail', 'Campaign or event', 'Note', 'Amount (NPR)', 'Leads reported'], spendRows.map((r) => [r.month, intakeName(r.intake), r.source, r.detail, r.campaign, r.note, num(r.amount), r.leads === null || r.leads === undefined ? '' : num(r.leads)]), { textCols: 6 });
      return;
    }
    const box = el('div', 'scroll-x');
    const t = el('table', 'data spend-table');
    const head = el('tr');
    ['Month', 'Intake', 'Source', 'Detail', 'Campaign or event', 'Amount (NPR)', 'Leads reported', 'Note', ''].forEach((h) => head.append(el('th', '', h)));
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    const field = (row, key, make) => {
      const input = make();
      input.value = row[key] === undefined || row[key] === null ? '' : row[key];
      input.addEventListener('input', () => { row[key] = input.value; spendDirty = true; });
      const td = el('td');
      td.append(input);
      return td;
    };
    const inputOf = (type, label, extra = {}) => () => { const i = el('input'); i.type = type; i.setAttribute('aria-label', label); Object.assign(i, extra); return i; };
    const selectOf = (label, options) => () => { const s = el('select'); s.setAttribute('aria-label', label); options.forEach(([value, text]) => s.add(new Option(text, value))); return s; };
    spendRows.forEach((row, n) => {
      const tr = el('tr');
      const sources = SOURCES.includes(row.source) || !row.source ? SOURCES : [...SOURCES, row.source];
      const known = intakes.some((i) => i.id === row.intake) || !row.intake ? [] : [[row.intake, intakeName(row.intake)]];
      tr.append(
        field(row, 'month', inputOf('month', 'Month')),
        field(row, 'intake', selectOf('Intake', [['', 'Not tied to an intake'], ...intakes.map((i) => [i.id, i.name]), ...known])),
        field(row, 'source', selectOf('Source', [['', 'Select'], ...sources.map((s) => [s, s])])),
        field(row, 'detail', inputOf('text', 'Source detail', { maxLength: 60, placeholder: 'e.g. TikTok' })),
        field(row, 'campaign', inputOf('text', 'Campaign or event', { maxLength: 120 })),
        field(row, 'amount', inputOf('number', 'Amount in NPR', { min: 1, step: 1 })),
        field(row, 'leads', inputOf('number', 'Leads reported by the platform or event', { min: 0, step: 1 })),
        field(row, 'note', inputOf('text', 'Note', { maxLength: 300 })),
      );
      const remove = el('button', 'btn btn-sm btn-danger', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove line ${n + 1}`);
      remove.addEventListener('click', () => { spendRows.splice(n, 1); spendDirty = true; renderSpend(); });
      const td = el('td');
      td.append(remove);
      tr.append(td);
      body.append(tr);
    });
    t.append(thead, body);
    box.append(t);
    if (spendRows.length) c.append(box); else empty(c, 'No spend is entered yet. Add a line for each payment: a month of adverts, an event, a fair.');
    const actions = el('div', 'spend-actions');
    const addLine = el('button', 'btn btn-sm', 'Add a line');
    addLine.type = 'button';
    addLine.addEventListener('click', () => { spendRows.push({ month: data ? data.today.slice(0, 7) : '', intake: selected === 'all' ? '' : selected, source: '', detail: '', campaign: '', amount: '', leads: '', note: '' }); spendDirty = true; renderSpend(); });
    const save = el('button', 'btn btn-sm', 'Save spend');
    save.type = 'button';
    save.addEventListener('click', saveSpend);
    actions.append(addLine, save, el('span', 'updated', 'Detail and Campaign must be typed exactly as on the sheet to be matched. A line not tied to an intake counts only under All intakes. Leads reported: the form fills, messages or registrations the platform or event counted (optional).'));
    c.append(actions);
  }

  async function saveSpend() {
    try {
      const res = await fetch('/api/marketing-spend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: spendRows.map((r) => ({ ...r, amount: Number(r.amount), leads: r.leads === '' || r.leads === null || r.leads === undefined ? null : Number(r.leads) })) }) });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) { window.NiecUI.alert(answer.error || 'The spend could not be saved.', { title: 'Not saved' }); return; }
      spendRows = answer.rows;
      spendDirty = false;
      window.NiecUI.toast('Spend saved', { type: 'success' });
      load.last = '';
      load();
    } catch (e) {
      window.NiecUI.alert('The spend could not be saved. Check the connection and try again.', { title: 'Not saved' });
    }
  }

  async function loadSpend() {
    try {
      const res = await fetch('/api/marketing-spend', { cache: 'no-store' });
      if (!res.ok) return;
      const answer = await res.json();
      if (spendDirty) return; // lines being typed are not thrown away
      spendRows = answer.rows;
      canEditSpend = Boolean(answer.canEdit);
      renderSpend();
      if (data) renderTargets();
      if (!decisionsDirty) renderDecisions();
    } catch (e) { /* the figures above still show */ }
  }

  function render() {
    const d = data;
    renderKpis(d);
    if (!(targetDraft && targetDraft.dirty)) { targetDraft = null; renderTargets(); } // targets being typed are not thrown away by a refresh
    renderFindings(d);
    renderFollow(d);
    renderChannels(d);
    renderCampaigns(d);
    renderSeason(d);
    scoreTable('chartIntakes', 'Intake', d.intakeComparison, { limit: 30 });
    scoreTable('chartUniversities', 'University', d.universities);
    scoreTable('chartPartners', 'Partner', d.partners);
    renderRisk('uniRisk', d.concentration.universities, 'university');
    renderRisk('partnerRisk', d.concentration.partners, 'partner');
    scoreTable('chartCourses', 'Course', d.courses);
    scoreTable('chartCounselors', 'Counselor', d.counselors);
    renderLost(d);
    renderProfile(d);
    renderComplete(d);
    $('notes').textContent = 'About these numbers: ' + d.notes.join(' ');
  }

  function fillIntakes(d) {
    const sel = $('intake');
    sel.length = 0;
    sel.add(new Option('All intakes', 'all'));
    d.intakes.forEach((i) => sel.add(new Option(i.name, i.id)));
    sel.value = d.selected;
  }

  async function load() {
    const page = $('page');
    page.classList.add('loading');
    const seq = ++loadSeq;
    try {
      const res = await fetch('/api/analysis?intake=' + encodeURIComponent(selected), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const fresh = await res.json();
      if (seq !== loadSeq) return;
      const stamp = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const { asOf, ...numbers } = fresh;
      const json = JSON.stringify(numbers);
      if (data && json === load.last) { $('updated').textContent = stamp; return; }
      load.last = json;
      data = fresh;
      selected = data.selected;
      fillIntakes(data);
      render();
      if (!spendDirty) renderSpend();
      page.classList.remove('first-load');
      $('updated').textContent = stamp;
    } catch (e) {
      $('updated').textContent = data ? 'Could not refresh. Showing the last numbers.' : 'Could not load the analysis.';
    } finally {
      if (seq === loadSeq) page.classList.remove('loading');
    }
  }

  // ---- the download: every table as one CSV file, one line per group, for Excel or Power BI ----
  function download() {
    if (!data) return;
    const d = data;
    const head = ['Table', 'Group', 'Inside', 'Students', 'Share %', 'Inquiries', 'Applied', 'Offers', 'Paid', 'Visas', 'Refused', 'Lost', 'Active', 'Applied rate %', 'Paid rate %', 'Visa rate %', 'Visa success %', 'Spend NPR', 'Cost per student NPR', 'Cost per paid NPR', 'Cost per visa NPR', 'Qualified', 'Leads reported', 'Cost per lead NPR', 'Cost per qualified NPR'];
    const lines = [head];
    const v = (x) => (x === null || x === undefined ? '' : x);
    const card = (name, g, inside = '') => lines.push([name, inside || g.label, inside ? g.label : '', g.students, v(g.share), v(g.inquiries), g.applied, v(g.offers), g.paid, g.visas, g.rejected, g.lost, v(g.active), v(g.appliedRate), v(g.paidRate), v(g.visaRate), v(g.visaSuccess), v(g.spend), v(g.costPerStudent), v(g.costPerPaid), v(g.costPerVisa), v(g.qualified), v(g.reportedLeads), v(g.costPerLead), v(g.costPerQualified)]);
    card('Total', { label: 'All students in this view', ...d.totals });
    d.sources.forEach((s) => { card('Source', s); s.details.forEach((x) => card('Source detail', x, s.label)); });
    [['Campaign or event', d.campaigns], ['Intake', d.intakeComparison], ['University', d.universities], ['Partner', d.partners], ['Course', d.courses], ['Counselor', d.counselors], ['Lead quality', d.leadQuality], ['Study level', d.studyLevels], ['Home district', d.districts]]
      .forEach(([name, list]) => list.forEach((g) => card(name, g)));
    d.lostReasons.forEach((r) => lines.push(['Lost reason', r.label, '', r.students, '', '', '', '', '', '', r.rejected, r.students]));
    d.seasonality.months.forEach((m, i) => lines.push(['Month of year', m, '', '', '', d.seasonality.inquiries[i], d.seasonality.applications[i], '', d.seasonality.payments[i], d.seasonality.visas[i]]));
    d.targets.rows.forEach((r) => lines.push(['Target', r.label, `${r.status}: target ${r.target}${r.deadline ? ' by ' + r.deadline : ''}, forecast ${v(r.forecast)}, short by ${v(r.gap)}, new applications needed ${v(r.applicationsNeeded)}`, r.inProgress, '', '', '', '', '', r.visas]));
    d.completeness.forEach((x) => lines.push(['Column completeness', x.label, `${x.filled} of ${x.expected} filled in`, x.expected, x.percent]));
    // A cell that could be read as a formula by Excel is made plain text.
    const cell = (x) => { let s = String(x); if (/^[=+\-@\t\r]/.test(s) && typeof x !== 'number') s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n');
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const view = d.selected === 'all' ? 'all-intakes' : ((d.intakes.find((i) => i.id === d.selected) || {}).name || 'intake').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.download = `niec-analysis-${view}-${d.today}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('intake').addEventListener('change', () => {
    selected = $('intake').value;
    try { history.replaceState(null, '', '#' + encodeURIComponent(selected)); } catch (e) { /* not important */ }
    load();
  });
  $('download').addEventListener('click', download);
  $('report').addEventListener('click', report);
  window.addEventListener('beforeunload', (e) => { if (spendDirty || decisionsDirty || (targetDraft && targetDraft.dirty)) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 60000);
  load().then(loadSpend).then(loadDecisions);
})();

// The Dashboard's decision pages (Decisions, Channels and events, Universities and partners, Team and students lost,
// Intake plan). Everything shown is worked out on the server (insights-engine.js): this page only draws it and, for Admin,
// edits the management records (targets, marketing spend, events, the decision log, market notes).
(function () {
  const { el, h, api, number, rupees, percent, field, dialog } = window.Portal;
  const tabsBar = document.getElementById('dashTabs');
  const numbers = document.getElementById('panel-numbers');
  const panel = document.getElementById('panel-insights');
  const headFilters = document.querySelector('.filters');
  let tab = (location.hash.match(/tab=(\w+)/) || [])[1] || 'numbers';
  let intake = '';
  let data = null;
  let plan = null;
  let timer = null;
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  const star = (g) => (g.low ? el('span', 'p-star', ' *') : '');
  const lowNote = () => el('p', 'p-muted p-small', '* Fewer than 10 students: a rate from so few is a hint, not evidence.');

  function table(headers, rows, { numCols = [] } = {}) {
    const wrap = el('div', 'p-table-wrap');
    const t = el('table', 'p-table');
    const head = el('tr');
    headers.forEach((x, i) => head.append(el('th', numCols.includes(i) ? 'num' : '', x)));
    t.append(el('thead')); t.firstChild.append(head);
    const body = el('tbody');
    rows.forEach((r) => {
      const tr = el('tr', r.sub ? 'sub' : '');
      (r.sub ? r.cells : r).forEach((c, i) => { const td = el('td', numCols.includes(i) ? 'num' : ''); if (c && c.nodeType) td.append(c); else td.textContent = c ?? ''; tr.append(td); });
      body.append(tr);
    });
    t.append(body);
    wrap.append(t);
    return wrap;
  }
  const card = (title, sub, ...children) => { const c = el('section', 'p-card'); c.append(el('h2', '', title)); if (sub) c.append(el('p', '', sub)); children.forEach((x) => x && c.append(x)); return c; };
  const kpi = (label, value, sub, cls) => { const t = el('div', `p-kpi ${cls || ''}`); t.append(el('b', '', String(value)), el('span', '', label), el('small', '', sub || '')); return t; };
  function bars(items, { quiet = false } = {}) {
    const max = Math.max(1, ...items.map((i) => i.value));
    const box = el('div', 'p-bars');
    items.forEach((i) => {
      const row = el('div', 'p-bar-row');
      const track = el('span', 'p-bar-track'); const fill = el('i', `p-bar-fill${quiet ? ' quiet' : ''}`);
      fill.style.width = Math.max(1, (i.value / max) * 100) + '%';
      track.append(fill);
      row.append(el('span', '', i.label), track, el('span', 'num', i.text ?? number(i.value)));
      box.append(row);
    });
    return box;
  }
  const admin = () => plan && plan.canEdit;

  // ---- the intake chooser shared by the decision pages ----
  function chooser() {
    const wrap = el('div', 'p-actions no-print');
    wrap.style.margin = '0 0 14px';
    const l = el('label', 'p-field'); l.style.minWidth = '260px';
    const sel = el('select');
    data.intakes.forEach((i) => sel.append(h('option', { value: i.id }, i.name)));
    sel.value = data.selected;
    sel.addEventListener('change', () => { intake = sel.value; load(); });
    l.append(el('span', 'p-label', 'Intake'), sel);
    wrap.append(l, el('span', 'p-muted p-small', `Figures as of ${data.today}. They refresh on their own.`));
    return wrap;
  }

  // ---- Decisions ----
  function targetCard() {
    const t = data.target;
    if (!t) return card('Target', 'Choose one intake above to see its target.');
    const c = card(`Visa target: ${data.scope}`, 'How many visas this intake is aiming for, what is likely, and what closing a gap needs.');
    const status = { reached: ['Reached', 'green'], 'on-track': ['On track', 'green'], behind: ['Behind', 'red'], missed: ['Missed', 'red'], unknown: ['Not enough history to forecast', 'amber'], none: ['No target set', 'amber'] }[t.status];
    const row = el('div', 'p-kpis');
    row.append(kpi('Target', t.visas || 'none', t.byDate ? `by ${t.byDate}` : ''), kpi('Visas so far', t.visasNow, `${data.summary.paid} have paid`),
      kpi('Likely to add', t.forecast ? `about ${t.forecast.expected}` : 'unknown', t.forecast ? `between ${t.forecast.low} and ${t.forecast.high}` : `${t.finishedStudents} finished students so far`),
      kpi('Expected total', t.expectedTotal === null ? 'unknown' : t.expectedTotal, '', status && status[1] === 'red' ? 'warn' : status && status[1] === 'green' ? 'good' : ''));
    c.append(row);
    const line = el('p');
    line.append(el('span', `p-pill p-pill-${status[1]}`, status[0]), ' ');
    if (t.gap) line.append(`About ${t.gap} visas short. ${t.applicationsNeeded !== null ? `That needs about ${t.applicationsNeeded} more applications${t.perWeek ? `, about ${t.perWeek} a week until ${t.applicationsClose}` : ''}.` : ''}`);
    c.append(line);
    if (admin()) {
      const f = el('div', 'p-form p-form-2 no-print');
      const v = field('Visa target', { value: t.visas ? String(t.visas) : '', max: 6 });
      const by = field('Visas needed by', { kind: 'date', value: t.byDate });
      const st = field('Teaching starts', { kind: 'date', value: t.startGuessed ? '' : t.startDate, hint: t.startGuessed && t.startDate ? `Not set: the plan assumes ${t.startDate}` : '' });
      const note = field('Note', { value: t.note, max: 300 });
      const worth = field('What one visa is worth to NIEC (Rs, average)', { value: plan.settings.valuePerVisa ? String(plan.settings.valuePerVisa) : '', max: 10, hint: 'Optional. Shows earnings and the return on marketing.' });
      f.append(v.wrap, by.wrap, st.wrap, note.wrap, worth.wrap);
      const save = h('button', { class: 'btn btn-sm btn-primary', type: 'button' }, 'Save target');
      save.addEventListener('click', async () => { try { await api('/api/planning/targets/' + data.selected, { visas: v.input.value, byDate: by.input.value, startDate: st.input.value, note: note.input.value }); await api('/api/planning/settings', { valuePerVisa: worth.input.value }); say('Saved'); load(); } catch (e) { say(e.message, true); } });
      c.append(f, el('div', 'p-bar'));
      c.lastChild.append(save);
    }
    return c;
  }
  let allFindings = false;
  function findings() {
    const box = el('div');
    box.append(el('div', 'p-card-head'));
    box.firstChild.append(el('h2', '', 'What stands out, and what to decide'));
    if (!data.findings.length) { const c = el('section', 'p-card'); c.append(el('p', '', 'Nothing stands out at the moment.')); box.append(c); return box; }
    (allFindings ? data.findings : data.findings.slice(0, 5)).forEach((f) => {
      const c = el('article', `p-finding ${f.priority.toLowerCase()}`);
      c.append(el('span', 'p-prio', f.priority));
      const head = el('div'); head.append(el('h3', '', f.title), el('span', 'p-area', `${f.area} · ${f.confidence} confidence`));
      c.append(head);
      const dl = el('dl');
      const ev = el('ul'); f.evidence.forEach((e) => ev.append(el('li', '', e)));
      [['Evidence', ev], ['Why it matters', f.why], ['Decision', f.decision], ['Measure', f.measure]].forEach(([k, v]) => { const dd = el('dd', k === 'Decision' ? 'decision' : '', v.nodeType ? undefined : v); if (v.nodeType) dd.append(v); dl.append(el('dt', '', k), dd); });
      c.append(dl);
      box.append(c);
    });
    if (data.findings.length > 5) box.append(h('button', { class: 'btn btn-sm no-print', type: 'button', onclick: () => { allFindings = !allFindings; draw(); } }, allFindings ? 'Show the first five only' : `Show all ${data.findings.length}`));
    return box;
  }
  function weeklyCard() {
    return card('This week and the week before', 'What was dated in the last 7 days against the 7 days before.', table(['', 'Last 7 days', 'The 7 before', 'Change'], data.weekly.map((w) => [w.label, number(w.last7), number(w.before7), (w.last7 - w.before7 > 0 ? '+' : '') + (w.last7 - w.before7)]), { numCols: [1, 2, 3] }));
  }
  // The business in a few sentences, and the money.
  function summaryCard() {
    const c = card('The business at a glance', 'Worked out from your own sheet, student cards and records. Nothing is estimated from outside.');
    const lead = el('div', 'p-answer');
    data.headline.forEach((t) => lead.append(el('p', '', t)));
    c.append(lead);
    if (data.money) {
      const m = data.money;
      const k = el('div', 'p-kpis');
      k.style.marginTop = '12px';
      k.append(kpi('Earned so far', rupees(m.earned), `${data.summary.visas} visas at Rs ${number(m.valuePerVisa)} each`, 'good'), kpi('Expected when the intake ends', m.expected === null ? 'unknown' : rupees(m.expected), 'from the forecast'),
        kpi('Marketing spent', rupees(m.spend), data.scope), kpi('Earned per rupee spent on marketing', m.returnOnSpend === null ? 'n/a' : 'Rs ' + String(m.returnOnSpend), 'earned per 1 rupee of marketing, so far; visas still to come are not counted', m.returnOnSpend !== null && m.returnOnSpend < 1 ? 'warn' : ''));
      c.append(k, el('p', 'p-muted p-small', 'What a visa is worth is the figure you set under the target (Admin only). It is an assumption for planning, not read from the Incentive page.'));
    } else if (admin()) c.append(el('p', 'p-muted p-small no-print', 'Set what one visa is worth to NIEC (average commission in rupees) under the target to see earnings and the return on marketing here.'));
    return c;
  }
  function funnelCard() {
    const f = data.funnel;
    const max = Math.max(1, f[0].count);
    const box = el('div', 'p-bars');
    f.forEach((x, i) => {
      const row = el('div', 'p-bar-row');
      const track = el('span', 'p-bar-track'); const fill = el('i', 'p-bar-fill'); fill.style.width = Math.max(1, (x.count / max) * 100) + '%'; track.append(fill);
      row.append(el('span', '', x.label), track, el('span', 'num', `${number(x.count)}${x.fromPrevious !== null ? `  (${x.fromPrevious}% of the step before)` : ''}`));
      box.append(row);
    });
    const weakest = f.slice(1).filter((x, i) => f[i].count >= 10).sort((a, b) => a.fromPrevious - b.fromPrevious)[0];
    return card('The journey', 'How many students reach each step, and what share of the step before goes on.', box, weakest ? el('p', 'p-muted p-small', `The weakest step is ${weakest.label.toLowerCase()}: only ${weakest.fromPrevious}% of the step before go on.`) : null);
  }
  const shortDay = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`; };
  function trendCard() {
    const t = data.trend;
    const max = Math.max(1, ...t.map((w) => Math.max(w.applied, w.paid, w.inquiry)));
    const row = el('div', 'p-months');
    row.style.gridTemplateColumns = 'repeat(12, minmax(0, 1fr))';
    t.forEach((w) => {
      const col = el('div', 'p-month');
      const pair = el('div'); pair.style.cssText = 'display:flex;gap:3px;align-items:flex-end;height:110px';
      [['applied', 'var(--s1, #2a78d6)'], ['paid', 'var(--s2, #eb6834)'], ['visa', 'var(--s3, #1baf7a)']].forEach(([k, c]) => { const bar = el('i'); bar.style.cssText = `width:9px;border-radius:4px 4px 0 0;background:${c};height:${Math.max(2, (w[k] / max) * 110)}px`; bar.title = `${w[k]} ${k}`; pair.append(bar); });
      col.append(el('b', '', String(w.applied + w.paid + w.visa)), pair, el('span', '', shortDay(w.start)));
      col.title = `Week from ${shortDay(w.start)} to ${shortDay(w.end)}`;
      row.append(col);
    });
    const key = el('p', 'p-muted p-small');
    key.append('Each column is one week, named by the day it starts (for example 5 Oct is 5 to 11 October). The number above is all the steps dated in that week. ', el('span', 'p-chip', 'blue: applications'), ' ', el('span', 'p-chip', 'orange: payments'), ' ', el('span', 'p-chip', 'green: visas'));
    return card('The pace, week by week', 'What was dated in each of the last 12 weeks. A falling pace now is the early warning of a missed target.', row, key);
  }
  function decisionLog() {
    const c = card('Decision log', 'Each decision with what was expected and what really happened. Review it on its day: that is where the lesson for the next intake comes from.');
    const items = [...plan.decisions].sort((a, b) => b.date.localeCompare(a.date));
    if (admin()) c.append(h('button', { class: 'btn btn-sm btn-primary no-print', type: 'button', onclick: () => decisionForm() }, '+ Record a decision'));
    c.append(items.length ? table(['Date', 'Decision', 'Expected', 'Review day', 'Outcome', 'Status', ''], items.map((d) => [d.date, el('b', '', d.title), d.expected, d.reviewDate, d.outcome || '(not reviewed)', d.status, admin() ? h('button', { class: 'p-link no-print', type: 'button', onclick: () => decisionForm(d) }, 'Edit') : ''])) : el('div', 'p-empty', 'No decisions recorded yet.'));
    return c;
  }
  function recordForm(title, listName, spec, existing, extra) {
    return dialog(title, (body, close) => {
      const f = el('div', 'p-form p-form-2');
      const inputs = {};
      spec.forEach(([k, label, opts]) => { const x = field(label, { value: existing ? existing[k] : (opts && opts.default) || '', ...(opts || {}) }); inputs[k] = x.input; f.append(x.wrap); });
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }));
      foot.firstChild.textContent = 'Cancel';
      if (existing) foot.append(h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await window.NiecUI.confirm('Remove this entry?', { danger: true, confirmText: 'Remove' })) { try { await api(`/api/planning/${listName}/${existing.id}/delete`, {}); close(true); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; } } } }, 'Remove'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      ok.addEventListener('click', async () => { try { await api(`/api/planning/${listName}`, { ...(existing ? { id: existing.id } : {}), ...(extra || {}), ...Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])) }); close(true); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; } });
      foot.append(ok);
      body.append(f, msg, foot);
    }, { wide: true }).then((saved) => { if (saved) { say('Saved'); load(); } });
  }
  const todayIso = () => data.today;
  const decisionForm = (d) => recordForm(d ? 'Edit the decision' : 'Record a decision', 'decisions', [
    ['title', 'The decision', { wide: true, max: 160, placeholder: 'Move 30% of the advert budget to the scholarship advert' }], ['date', 'Decided on', { kind: 'date', default: todayIso() }], ['status', 'Status', { kind: 'select', choices: plan.lists.DECISION_STATUS }],
    ['problem', 'The problem', { kind: 'area', wide: true, max: 1200 }], ['evidence', 'The evidence (numbers)', { kind: 'area', wide: true, max: 1200 }], ['decision', 'What exactly was decided', { kind: 'area', wide: true, max: 1200 }],
    ['expected', 'What is expected', { kind: 'area', wide: true, max: 600 }], ['measure', 'How it will be measured', { wide: true, max: 300 }], ['reviewDate', 'Review on', { kind: 'date' }],
    ['outcome', 'What really happened', { kind: 'area', wide: true, max: 1200 }], ['lesson', 'The lesson', { kind: 'area', wide: true, max: 600 }]], d);

  function renderDecisions() {
    const s = data.summary;
    const k = el('div', 'p-kpis');
    k.append(kpi('Students', number(s.students), data.scope, 'mark'), kpi('Applied', number(s.applied), `${percent(s.toApplication)} of students`), kpi('Offers', number(s.offers), `${percent(s.toOffer)} of applications`),
      kpi('Paid', number(s.paid), `${percent(s.toPayment)} of offers`), kpi('Visas', number(s.visas), `${percent(s.leadToVisa)} of all students`, 'good'), kpi('Visa success', percent(s.visaSuccess), `${s.refused} refused`));
    return [chooser(), summaryCard(), k, funnelCard(), trendCard(), targetCard(), findings(), weeklyCard(), decisionLog()];
  }

  // ---- Channels and events ----
  function renderChannels() {
    const rows = [];
    data.channels.sources.forEach((s) => {
      rows.push([h('b', {}, s.label), number(s.students), number(s.applied), number(s.paid), number(s.visas), percent(s.leadToVisa), s.spend ? rupees(s.spend) : '', s.costPerStudent ? rupees(s.costPerStudent) : '', s.costPerApplication ? rupees(s.costPerApplication) : '', s.costPerVisa ? rupees(s.costPerVisa) : '']);
      if (s.low && !s.spendOnly) rows[rows.length - 1][5] = percent(s.leadToVisa) + ' *';
      s.details.forEach((d) => rows.push({ sub: true, cells: [d.label, number(d.students), number(d.applied), number(d.paid), number(d.visas), percent(d.leadToVisa) + (d.low ? ' *' : ''), d.spend ? rupees(d.spend) : '', d.costPerStudent ? rupees(d.costPerStudent) : '', d.costPerApplication ? rupees(d.costPerApplication) : '', d.costPerVisa ? rupees(d.costPerVisa) : ''] }));
    });
    const ch = card('Where students come from, and what each source costs', 'Each source with what is inside it (the platform, the event, the partner). The cost columns are marketing cost only (what was paid for adverts and events, divided by the students, applications or visas that came from it). They are not the cost of running the office. A blank cost means no spend was recorded for it.',
      table(['Source and where exactly', 'Students', 'Applied', 'Paid', 'Visas', 'Student to visa', 'Marketing spent', 'Cost per student', 'Cost per application', 'Cost per visa'], rows, { numCols: [1, 2, 3, 4, 5, 6, 7, 8, 9] }), lowNote());
    const out = [chooser(), ch];
    // spend
    const spendSec = card('Marketing spend', 'What was paid, by month and source. Type the source and the detail the same way as on the student cards.');
    const lines = plan.spend.filter((l) => !l.intake || l.intake === data.selected).sort((a, b) => b.month.localeCompare(a.month));
    if (admin()) spendSec.append(h('button', { class: 'btn btn-sm btn-primary no-print', type: 'button', onclick: () => spendForm() }, '+ Add a spend line'));
    spendSec.append(lines.length ? table(['Month', 'Source', 'Detail', 'Amount', 'Leads reported', 'Cost per lead', ''], lines.map((l) => [l.month, l.source, l.detail, rupees(l.amount), l.leads ? number(l.leads) : '', l.leads ? rupees(Math.round(l.amount / l.leads)) : '', admin() ? h('button', { class: 'p-link no-print', type: 'button', onclick: () => spendForm(l) }, 'Edit') : '']), { numCols: [4, 5, 6] }) : el('div', 'p-empty', 'No spend recorded for this intake yet.'));
    out.push(spendSec);
    // events
    const ev = card('Events', 'Each event with its cost and how many students and visas are linked to it (choose Events and the event on the student card).');
    if (admin()) ev.append(h('button', { class: 'btn btn-sm btn-primary no-print', type: 'button', onclick: () => eventForm() }, '+ Add an event'));
    ev.append(data.events.length ? table(['Event', 'Date', 'Cost', 'Registered', 'Attended', 'Students', 'Visas', 'Cost per student', 'Cost per visa', ''], data.events.map((e) => [el('b', '', e.label), e.date, rupees(e.cost), e.registered ? number(e.registered) : '', e.attended ? number(e.attended) : '', number(e.students), number(e.visas), e.costPerStudent ? rupees(e.costPerStudent) : '', e.costPerVisa ? rupees(e.costPerVisa) : '', admin() ? h('button', { class: 'p-link no-print', type: 'button', onclick: () => eventForm(plan.events.find((x) => x.id === e.id)) }, 'Edit') : '']), { numCols: [2, 3, 4, 5, 6, 7, 8] }) : el('div', 'p-empty', 'No events recorded yet.'));
    out.push(ev);
    return out;
  }
  const spendForm = (l) => recordForm(l ? 'Edit the spend line' : 'Add a spend line', 'spend', [
    ['month', 'Month', { placeholder: '2026-10', default: data.today.slice(0, 7), max: 7 }], ['amount', 'Amount paid (Rs)', { max: 12 }],
    ['source', 'Source', { kind: 'select', choices: plan.lists.sources }], ['detail', 'Where exactly', { max: 120, placeholder: 'TikTok, or the event name' }],
    ['leads', 'Leads the platform or event reported', { max: 8 }], ['note', 'Note', { wide: true, max: 300 }]], l, { intake: data.selected });
  const eventForm = (e) => recordForm(e ? 'Edit the event' : 'Add an event', 'events', [
    ['name', 'Name', { wide: true, max: 120, placeholder: 'UK Education Fair, Kathmandu (August 2026)' }], ['date', 'Date', { kind: 'date' }], ['type', 'Kind', { kind: 'select', choices: plan.lists.EVENT_TYPES }],
    ['place', 'Place', { max: 120 }], ['cost', 'Cost (Rs)', { max: 12 }], ['registered', 'Registered', { max: 6 }], ['attended', 'Attended', { max: 6 }],
    ['universities', 'Universities present', { wide: true, max: 300 }], ['note', 'Note', { kind: 'area', wide: true, max: 600 }]], e);

  // ---- Universities and partners ----
  function renderUniversities() {
    const u = data.universities;
    const conc = u.concentration.applications;
    const out = [chooser()];
    const k = el('div', 'p-kpis');
    k.append(kpi('Universities in use', conc.count || 0, 'with applications'), kpi('Biggest university', conc.top || 'none', conc.topShare !== null ? `${conc.topShare}% of applications` : '', conc.topShare >= 50 ? 'warn' : ''),
      kpi('Top three together', conc.top3Share !== null ? conc.top3Share + '%' : 'none', 'of applications'), kpi('Biggest partner', data.partners.concentration.applications.top || 'none', data.partners.concentration.applications.topShare !== null ? `${data.partners.concentration.applications.topShare}% of applications` : ''));
    out.push(k);
    out.push(card('Universities', 'How many students each university holds and how far they got. A big share on one university is a risk: its rules or its agents can change.', table(['University', 'Students', 'Applied', 'Offers', 'Paid', 'Visas', 'Refused', 'Application to visa'], u.list.map((g) => [g.label, number(g.students), number(g.applied), number(g.offers), number(g.paid), number(g.visas), number(g.refused), g.applied ? percent(Math.round((g.visas / g.applied) * 1000) / 10) + (g.applied < 10 ? ' *' : '') : ''])), lowNote()));
    if (u.speed.length) out.push(card('How fast each university answers', 'Typical days from application to offer, where at least three students have both dates.', bars(u.speed.map((x) => ({ label: x.label, value: x.median, text: `${x.median} days` })), { quiet: true })));
    out.push(card('B2B partners and the sheet\'s University Partner', 'Students by the partner they were processed through.', table(['Partner', 'Students', 'Applied', 'Offers', 'Paid', 'Visas'], data.partners.list.map((g) => [g.label, number(g.students), number(g.applied), number(g.offers), number(g.paid), number(g.visas)]))));
    if (data.partners.agreements.length) {
      const order = { ended: 0, soon: 1, 'no-date': 2, unread: 3, ok: 4 };
      const text = { ended: 'Ended', soon: 'Ends soon', 'no-date': 'No end day recorded', unread: 'Day not understood', ok: 'In force' };
      out.push(card('Agreements', 'Universities and B2B partners with the day each agreement ends (Admin only).', table(['Name', 'Kind', 'Ends', 'Days left', 'State'], [...data.partners.agreements].sort((a, b) => order[a.state] - order[b.state]).map((a) => [a.label, a.kind, a.end, a.days === null ? '' : String(a.days), el('span', `p-pill p-pill-${a.state === 'ok' ? 'green' : a.state === 'soon' ? 'amber' : a.state === 'ended' ? 'red' : 'gray'}`, text[a.state])]), { numCols: [3] })));
    }
    out.push(card('Courses most asked for', 'The courses on the sheet, with how far their students got.', table(['Course', 'Students', 'Applied', 'Visas'], data.courses.map((g) => [g.label, number(g.students), number(g.applied), number(g.visas)]), { numCols: [1, 2, 3] })));
    out.push(card('Study level wanted', 'What level students ask for (from the student cards).', table(['Study level', 'Students', 'Applied', 'Visas'], data.levels.map((g) => [g.label, number(g.students), number(g.applied), number(g.visas)]), { numCols: [1, 2, 3] })));
    return out;
  }

  // ---- Students lost and the records ----
  function renderTeam() {
    const out = [chooser()];
    const lost = data.lost;
    out.push(card('Why students are lost', `${lost.total} students are withdrawn, on hold, deferred or refused. A reason recorded on the card turns each into a lesson.`, lost.reasons.length ? bars(lost.reasons.map((r) => ({ label: r.label, value: r.count, text: `${r.count} (${r.percent}%)` })), { quiet: true }) : el('div', 'p-empty', 'No students lost yet.')));
    out.push(card('What students wanted that NIEC could not offer', 'Worked out from the cards of lost students: the subject and level they asked for, where the recorded reason was that we had no suitable course, the fee or deposit was too high, or the grades or English score were not accepted. The same request repeating is the sign of a gap in the university list.', lost.wanted.length ? table(['Subject', 'Level', 'Students', 'Why we lost them'], lost.wanted.map((w) => [el('b', '', w.subject), w.level, number(w.count), w.reasons.join(', ')]), { numCols: [2] }) : el('div', 'p-empty', 'Nothing yet. It fills in as lost students get a reason and a subject on their card.')));
    out.push(card('How long each step takes', 'Typical days between two dates on the same student (the middle value).', table(['Step', 'Typical time', 'Students counted'], data.speed.map((s) => [s.label, s.median === null ? 'not enough dates yet' : `${s.median} days`, number(s.samples)]), { numCols: [2] })));
    out.push(card('How complete the records are', 'Each detail, how many students have it, and the decision it makes possible. A decision cannot be better than its data.', table(['Detail', 'Filled in', 'Of', 'Share', 'What it lets you decide'], data.quality.map((q) => [q.label, number(q.filled), number(q.of), el('b', '', percent(q.percent)), q.decision]), { numCols: [1, 2, 3] })));
    return out;
  }

  // ---- Intake plan ----
  function renderPlan() {
    const p = data.plan;
    const out = [chooser()];
    out.push(el('div', 'p-actions no-print'));
    out[1].append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => proposal() }, 'Print the intake proposal'));
    out[1].style.marginBottom = '14px';
    out.push(card(`Plan for ${p.intake}`, p.startDate ? `Teaching starts about ${p.startDate}${data.target && data.target.startGuessed ? ' (assumed from the intake name: set the day with the target)' : ''}. ${p.comparable ? `Compared with ${p.comparable.label}: ${p.comparable.students} students, ${p.comparable.applied} applications, ${p.comparable.visas} visas.` : 'There is no earlier intake to compare with yet.'}` : 'Choose one intake above.',
      table(['Step', 'Rate from NIEC\'s own history', 'Students counted'], [['Inquiry to application', p.rates.inquiryToApplication], ['Application to offer', p.rates.applicationToOffer], ['Offer to payment', p.rates.offerToPayment], ['Payment to visa', p.rates.paymentToVisa], ['Application to visa', p.rates.applicationToVisa]].map(([l, r]) => [l, r.percent === null ? 'not enough history yet' : r.percent + '%', number(r.n)]), { numCols: [1, 2] })));
    out.push(card('What the target needs, what you have, what is still to find', p.needs.length ? 'Working back from the visa target with NIEC\'s own conversion rates. Still to find is what is needed minus what the intake already has.' : 'Set a visa target (on the Decisions page) to see what the intake needs.',
      p.needs.length ? table(['Step', 'Needed', 'You have', 'Still to find'], p.needs.map((x) => [el('b', '', x.label), x.need === null ? 'not enough history' : number(x.need), number(x.have), x.left === null ? '' : el('b', '', number(x.left))]), { numCols: [1, 2, 3] }) : null,
      p.needs.length ? el('p', 'p-muted p-small', p.weeklyPace.applicationsPerWeek ? `To finish before applications close on ${p.weeklyPace.closes} (${p.weeklyPace.weeksLeft} weeks): about ${number(p.weeklyPace.applicationsPerWeek)} applications and ${p.weeklyPace.inquiriesPerWeek ? number(p.weeklyPace.inquiriesPerWeek) : 'some'} new inquiries every week. Last week: ${p.weeklyPace.applicationsLastWeek} applications.` : 'The weekly pace needs a start day and applications still open.') : null));
    if (p.scenarios.length) out.push(card('What each choice needs', 'Working back from the visas wanted. Every number comes from the rates above; where the history is too thin the cell is empty rather than guessed.',
      table(['Choice', 'Visas', 'Paid', 'Offers', 'Applications', 'Inquiries', 'Based on'], p.scenarios.map((s) => [el('b', '', s.name), s.visas, s.paid ?? '', s.offers ?? '', s.applications ?? '', s.inquiries ?? '', s.basis]), { numCols: [1, 2, 3, 4, 5] })));
    if (p.timeline.length) {
      const ol = el('ol', 'p-steps');
      p.timeline.forEach((t) => { const li = el('li', t.state); li.append(el('b', '', t.from === t.to ? t.from : `${t.from} to ${t.to}`), el('span', '', t.label), el('span', 'p-muted p-small', `${t.weeksBefore} weeks before the start`)); ol.append(li); });
      out.push(card('Working back from the start day', `A university's own deadline in the Fact File always comes first. The last safe week to apply is ten weeks before the start.${p.ownLatestApply ? ` From NIEC's own journeys (${p.ownJourneyDays} days from application to visa) the latest application day is about ${p.ownLatestApply}.` : ''}`, ol));
    }
    if (p.channelMix.length) out.push(card('Where the students came from last time', 'The starting point for the lead target of each channel.', table(['Channel', 'Share of students', 'Application rate', 'Student to visa', 'Cost per student'], p.channelMix.map((c) => [c.label, percent(c.share), percent(c.toApplication), percent(c.leadToVisa) + (c.low ? ' *' : ''), c.costPerStudent ? rupees(c.costPerStudent) : '']), { numCols: [1, 2, 3, 4] }), lowNote()));
    if (p.channelPlan.length) out.push(card('Where the missing inquiries should come from, and the budget', 'The inquiries still to find, split by the share each source brought before, with the marketing cost per student it had. A blank budget means no spend was recorded for that source. Check the split before you spend: it repeats the past, it does not know what is new.', table(['Source', 'Inquiries to find', 'Cost per student', 'Budget'], p.channelPlan.map((c) => [c.label + (c.low ? ' *' : ''), number(c.students), c.costPerStudent ? rupees(c.costPerStudent) : '', c.budget ? rupees(c.budget) : '']), { numCols: [1, 2, 3] }), lowNote()));
    out.push(marketNotes());
    return out;
  }
  function marketNotes() {
    const c = card('Market watch', 'UK immigration rules, Nepal rules, universities and competitors: each note with where it came from and what it means for NIEC. Only write what you have checked, and say where you checked it.');
    if (admin()) c.append(h('button', { class: 'btn btn-sm btn-primary no-print', type: 'button', onclick: () => marketForm() }, '+ Add a note'));
    const items = [...plan.market].sort((a, b) => b.date.localeCompare(a.date));
    c.append(items.length ? table(['Date', 'Kind', 'Note', 'Source', 'What it means', 'What to do', ''], items.map((m) => [m.date, m.kind, el('b', '', m.title), m.source, m.impact, m.action, admin() ? h('button', { class: 'p-link no-print', type: 'button', onclick: () => marketForm(m) }, 'Edit') : ''])) : el('div', 'p-empty', 'No notes yet. Add the rule changes and competitor moves that affect the next intake.'));
    return c;
  }
  const marketForm = (m) => recordForm(m ? 'Edit the note' : 'Add a market note', 'market', [
    ['title', 'What changed', { wide: true, max: 200 }], ['date', 'Date', { kind: 'date', default: todayIso() }], ['kind', 'Kind', { kind: 'select', choices: plan.lists.MARKET_KINDS }],
    ['detail', 'Detail', { kind: 'area', wide: true, max: 2000 }], ['source', 'Where you checked it (official page or document)', { wide: true, max: 400 }], ['checkedOn', 'Checked on', { kind: 'date', default: todayIso() }],
    ['impact', 'What it means for NIEC', { kind: 'area', wide: true, max: 800 }], ['action', 'What to do', { kind: 'area', wide: true, max: 800 }]], m);

  // The intake proposal: the figures and the plan in the words a CEO or chairman reads, to print or save as PDF.
  function proposal() {
    const d = data;
    const p = d.plan;
    const view = el('article', 'p-proposal print-me');
    const top = el('div', 'p-doc-top'); const logo = el('img'); logo.src = 'niec-logo.png'; logo.alt = 'NIEC';
    top.append(el('div'), logo); top.firstChild.append(el('div', 'p-muted p-small', 'UK Recruitment Department'), el('h1', '', `Intake proposal: ${p.intake}`), el('div', 'p-muted p-small', `Prepared ${d.today} from NIEC's own records`));
    view.append(top);
    const sec = (title, ...kids) => { view.append(el('h2', '', title)); kids.forEach((k) => view.append(k)); };
    const para = (t) => el('p', '', t);
    const s = d.summary;
    sec('1. Where we stand', para(`${s.students} students are recorded for ${p.intake}: ${s.applied} have applied, ${s.offers} hold an offer, ${s.paid} have paid and ${s.visas} have a visa. ${s.refused} visa${s.refused === 1 ? ' was' : 's were'} refused.${d.target && d.target.forecast ? ` The ${d.target.forecast.counted} students in progress are likely to add about ${d.target.forecast.expected} visas (between ${d.target.forecast.low} and ${d.target.forecast.high}), from NIEC's own past rates.` : ''}`));
    if (d.target && d.target.visas) sec('2. The target', para(`The target is ${d.target.visas} visas${d.target.byDate ? ` by ${d.target.byDate}` : ''}. ${d.target.gap ? `The forecast is about ${d.target.gap} visas short; closing it needs about ${d.target.applicationsNeeded ?? 'an unknown number of'} more applications.` : d.target.status === 'on-track' || d.target.status === 'reached' ? 'The intake is on track or has reached it.' : 'There is not enough history to forecast yet.'}`));
    const ul = el('ul');
    if (d.findings.length) d.findings.slice(0, 6).forEach((f) => { const li = el('li'); li.append(el('b', '', `${f.priority} ${f.title}. `), f.decision); ul.append(li); }); else ul.append(el('li', '', 'No decision is flagged by the figures.'));
    sec('3. Decisions asked for', ul);
    if (p.scenarios.length) sec('4. What each choice needs', table(['Choice', 'Visas', 'Paid', 'Offers', 'Applications', 'Inquiries'], p.scenarios.map((x) => [x.name, x.visas, x.paid ?? '', x.offers ?? '', x.applications ?? '', x.inquiries ?? '']), { numCols: [1, 2, 3, 4, 5] }));
    if (p.timeline.length) { const ol = el('ul'); p.timeline.forEach((t) => ol.append(el('li', '', `${t.from === t.to ? t.from : t.from + ' to ' + t.to}: ${t.label}`))); sec('5. Calendar', ol); }
    const mk = el('ul'); d.channels.sources.filter((x) => !x.spendOnly && x.students >= 5).slice(0, 6).forEach((x) => mk.append(el('li', '', `${x.label}: ${x.students} students, ${x.visas} visas${x.costPerVisa ? `, Rs ${number(x.costPerVisa)} per visa` : ''}.`)));
    sec('6. Channels', mk.children.length ? mk : para('No channel has enough students to compare yet.'));
    if (d.partners.concentration.applications.top || d.universities.concentration.applications.top) sec('7. Risks', para(`${d.universities.concentration.applications.top ? `${d.universities.concentration.applications.top} holds ${d.universities.concentration.applications.topShare}% of applications.` : ''} ${d.partners.concentration.applications.top ? `${d.partners.concentration.applications.top} is the partner for ${d.partners.concentration.applications.topShare}% of applications.` : ''}`));
    view.append(el('p', 'p-muted p-small', 'Every figure is taken from the student sheet, the student cards and the management records. A rate from fewer than ten students is marked and not used for a decision.'));
    const bar = el('div', 'p-actions no-print'); bar.style.margin = '0 0 12px';
    bar.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => window.print() }, 'Print or save as PDF'), h('button', { class: 'btn', type: 'button', onclick: () => { draw(); } }, 'Back to the plan'));
    panel.replaceChildren(bar, view);
  }

  const RENDER = { decisions: renderDecisions, channels: renderChannels, universities: renderUniversities, team: renderTeam, plan: renderPlan };
  function draw() { panel.replaceChildren(...RENDER[tab]()); }
  async function load() {
    clearTimeout(timer);
    try {
      [data, plan] = await Promise.all([api('/api/insights?intake=' + encodeURIComponent(intake)), api('/api/planning')]);
      intake = data.selected;
      if (tab !== 'numbers' && !document.querySelector('.p-proposal')) draw();
    } catch (e) { panel.replaceChildren(el('div', 'p-notice bad', e.message)); }
    timer = setTimeout(() => { if (!document.hidden && tab !== 'numbers' && !document.querySelector('.p-proposal') && !document.querySelector('dialog[open]') && !document.activeElement.matches('textarea, input')) load(); }, 45000);
  }
  function show(name) {
    tab = name;
    tabsBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    const isNumbers = name === 'numbers';
    numbers.hidden = !isNumbers;
    panel.hidden = isNumbers;
    if (headFilters) headFilters.style.display = isNumbers ? '' : 'none'; // the intake chooser of the Numbers page
    history.replaceState(null, '', isNumbers ? location.pathname + location.search : `#tab=${name}`);
    if (!isNumbers) { panel.replaceChildren(el('div', 'p-card', 'Loading…')); load(); }
  }
  tabsBar.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) show(b.dataset.tab); });
  if (tab !== 'numbers' && RENDER[tab]) show(tab); else tab = 'numbers';
})();

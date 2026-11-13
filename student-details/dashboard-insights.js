// The Dashboard's decision pages (Decisions, Channels and events, Universities and partners, Team and students lost,
// Intake plan). Everything shown is worked out on the server (insights-engine.js): this page only draws it and, for Admin,
// edits the management records (targets, marketing spend, events, the decision log, market notes).
(function () {
  const { el, h, api, number, rupees, percent, field, dialog } = window.Portal;
  const tabsBar = document.getElementById('dashTabs');
  const numbers = document.getElementById('panel-overview');
  const panel = document.getElementById('panel-insights');
  const headFilters = document.querySelector('.filters');
  let tab = (location.hash.match(/tab=(\w+)/) || [])[1] || 'overview';
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
    const out = [chooser(), card('Where the marketing money figures come from', 'The system cannot see what you pay for adverts, boosts, events or agents. The cost figures below are only what you type under Marketing spend and Events (one line each time you pay: month, source, where exactly, amount). Until a line is added for a platform its cost stays empty, and a cost per visa is never guessed. Add a line each time you pay, and choose the same source and platform as on the student cards.'), ch];
    // spend
    const spendSec = card('Marketing spend', 'What was paid, by month and source. Type the source and the detail the same way as on the student cards.');
    const lines = plan.spend.filter((l) => !l.intake || l.intake === data.selected).sort((a, b) => b.month.localeCompare(a.month));
    if (admin()) spendSec.append(h('button', { class: 'btn btn-sm btn-primary no-print', type: 'button', onclick: () => spendForm() }, '+ Add a spend line'));
    spendSec.append(lines.length ? table(['Month', 'Source', 'Detail', 'Amount', 'Leads reported', 'Cost per lead', ''], lines.map((l) => [l.month, l.source, l.detail, rupees(l.amount), l.leads ? number(l.leads) : '', l.leads ? rupees(Math.round(l.amount / l.leads)) : '', admin() ? h('button', { class: 'p-link no-print', type: 'button', onclick: () => spendForm(l) }, 'Edit') : '']), { numCols: [4, 5, 6] }) : el('div', 'p-empty', 'No spend recorded for this intake yet.'));
    out.push(spendSec);
    // events
    const ev = card('Events and marketing', 'What each one cost, how long it ran and how many students and visas it brought. Add and change them on the Events and marketing page.');
    ev.append(h('a', { class: 'btn btn-sm no-print', href: '/events' }, 'Open Events and marketing'));
    const ranText = (e) => (e.endDate && e.endDate !== e.date ? `${e.date} to ${e.endDate}` : e.date);
    ev.append(data.events.length ? table(['Name', 'Ran', 'Days', 'Investment', 'Enquiries', 'Visas', 'Cost per enquiry', 'Cost per visa'], data.events.map((e) => [el('b', '', e.label), ranText(e), number(e.days), rupees(e.cost), number(e.students), number(e.visas), e.costPerStudent ? rupees(e.costPerStudent) : '', e.costPerVisa ? rupees(e.costPerVisa) : '']), { numCols: [2, 3, 4, 5, 6, 7] }) : el('div', 'p-empty', 'No event or marketing recorded yet.'));
    out.push(ev);
    return out;
  }
  const spendForm = (l) => recordForm(l ? 'Edit the spend line' : 'Add a spend line', 'spend', [
    ['month', 'Month', { placeholder: '2026-10', default: data.today.slice(0, 7), max: 7 }], ['amount', 'Amount paid (Rs)', { max: 12 }],
    ['source', 'Source', { kind: 'select', choices: plan.lists.sources }], ['detail', 'Where exactly', { max: 120, placeholder: 'TikTok, or the event name' }],
    ['leads', 'Leads the platform or event reported', { max: 8 }], ['note', 'Note', { wide: true, max: 300 }]], l, { intake: data.selected });

  // ---- plain words for the target ----
  const targetSentence = (t) => {
    if (!t || !t.visas) return 'No visa target is set for this intake yet. Set it on the Intake plan tab.';
    if (t.status === 'reached') return `The target of ${t.visas} visas is reached.`;
    if (t.status === 'missed') return `The target of ${t.visas} visas was not reached: ${t.visasNow} visas were issued.`;
    if (t.expectedTotal === null || t.expectedTotal === undefined) return `The target is ${t.visas} visas and ${t.visasNow} are issued. There is not enough history from earlier intakes to say where this one will end.`;
    const end = Math.round(t.expectedTotal);
    const range = t.forecast ? ` (most likely between ${t.forecast.low} and ${t.forecast.high})` : '';
    return `The target is ${t.visas} visas and ${t.visasNow} are issued. If students move forward as they did in your earlier intakes, this intake ends with about ${end} visas${range}. ${t.status === 'behind' ? `That is about ${Math.max(1, t.visas - end)} short of the target.` : 'That meets the target.'}`;
  };
  window.DashText = { targetSentence: (t) => targetSentence(t), sayStatus: (t) => sayStatus(t) };
  const sayStatus = (t) => ({ reached: ['Reached', 'green'], 'on-track': ['On track', 'green'], behind: ['Behind the target', 'red'], missed: ['Missed', 'red'], unknown: ['Not enough history yet', 'amber'], none: ['No target set', 'amber'] }[(t && t.status) || 'none']);

  // ---- Decisions: only what needs acting on, in plain words ----
  function renderDecisions() {
    const out = [chooser()];
    const list = data.findings;
    const box = card('What needs a decision', list.length ? `${list.length} thing${list.length === 1 ? '' : 's'} the figures say you should act on, most urgent first. Press Why for the figures behind each.` : 'Nothing stands out right now: the figures are inside the limits this page watches.');
    (allFindings ? list : list.slice(0, 5)).forEach((f, i) => {
      const a = el('article', `dc dc-${f.priority.toLowerCase()}`);
      const head = el('div', 'dc-head');
      head.append(el('span', 'dc-num', String(i + 1)), el('h3', '', f.title), el('span', 'dc-prio', f.priority));
      a.append(head);
      if (f.evidence[0]) a.append(el('p', 'dc-see', f.evidence[0]));
      const todo = el('p', 'dc-do'); todo.append(el('b', '', 'What to do: '), f.decision); a.append(todo);
      const more = el('div', 'dc-more'); more.hidden = true;
      const ul = el('ul'); f.evidence.slice(1).forEach((e) => ul.append(el('li', '', e)));
      more.append(ul, el('p', '', f.why), el('p', 'p-muted', `Check again with: ${f.measure}`));
      const btn = h('button', { class: 'p-link no-print', type: 'button', onclick: () => { more.hidden = !more.hidden; btn.textContent = more.hidden ? 'Why?' : 'Hide'; } }, 'Why?');
      a.append(btn, more);
      box.append(a);
    });
    if (list.length > 5) box.append(h('button', { class: 'btn btn-sm no-print', type: 'button', onclick: () => { allFindings = !allFindings; draw(); } }, allFindings ? 'Show the first five only' : `Show all ${list.length}`));
    out.push(box);
    const lost = data.lost;
    if (lost.reasons.length) {
      const lc = card('Why students are lost', `${lost.total} student${lost.total === 1 ? '' : 's'} did not go on. The biggest reasons:`);
      lc.append(bars(lost.reasons.slice(0, 4).map((r) => ({ label: r.label, value: r.count, text: `${r.count} (${r.percent}%)` })), { quiet: true }));
      out.push(lc);
    }
    return out;
  }
  let allFindings = false;

  // ---- Universities and partners ----
  function board(list, what) {
    if (!list.length) return el('p', 'p-muted', `No ${what} recorded yet.`);
    const max = Math.max(1, ...list.map((g) => g.students));
    const box = el('div', 'rk');
    list.slice(0, 8).forEach((g) => {
      const row = el('div', 'rk-row');
      const name = el('div', 'rk-name'); name.append(el('b', '', g.label), el('span', 'p-muted', `${number(g.applied)} applied, ${number(g.offers)} offers, ${number(g.paid)} paid`));
      const track = el('span', 'rk-track'); const fill = el('i', 'rk-fill'); fill.style.width = Math.max(3, (g.students / max) * 100) + '%'; track.append(fill);
      const nums = el('div', 'rk-nums'); nums.append(el('b', '', number(g.students)), el('span', 'p-muted', 'students'));
      const visa = el('div', 'rk-nums rk-visa'); visa.append(el('b', '', number(g.visas)), el('span', 'p-muted', g.visas === 1 ? 'visa' : 'visas'));
      row.append(name, track, nums, visa);
      box.append(row);
    });
    return box;
  }
  function renderUniversities() {
    const out = [chooser()];
    const u = data.universities; const a = u.concentration.applications;
    const uc = card('Universities', a.total ? `${a.top} holds ${a.topShare}% of the applications${a.count > 1 ? `, the top three ${a.top3Share}%` : ''}. ${a.topShare >= 50 ? 'That is a risk: if its rules or its agents change, half of this intake is affected.' : 'The applications are spread well.'}` : 'Where the students of this intake are placed.');
    uc.append(board(u.list, 'university'));
    out.push(uc);
    const pa = data.partners.concentration.applications;
    const pc = card('B2B partners', pa.total ? `${pa.top} processes ${pa.topShare}% of the applications.` : 'Who the applications are processed through.');
    pc.append(board(data.partners.list, 'partner'));
    out.push(pc);
    const due = data.partners.agreements.filter((x) => x.state === 'ended' || x.state === 'soon');
    const ac = card('Agreements to renew', due.length ? 'Agreements that have ended or end soon.' : 'Every agreement with a recorded end day is still in force.');
    if (due.length) ac.append(table(['Name', 'Ends', 'Days left'], due.map((x) => [h('b', {}, x.name), x.ends || '', x.state === 'ended' ? 'Ended' : String(x.daysLeft)]), { numCols: [2] }));
    out.push(ac);
    return out;
  }

  // ---- Intake plan: the target, what it takes, and the proposal ----
  function renderPlan() {
    const p = data.plan; const t = data.target;
    const out = [chooser()];
    const tc = card(`Visa target for ${data.scope}`, 'Set the target here. Everything below, and the printed proposal, is worked out from it and from your own earlier intakes.');
    const st = sayStatus(t);
    const line = el('p', 'plan-line'); line.append(el('span', `p-pill p-pill-${st[1]}`, st[0]), ' ', targetSentence(t));
    tc.append(line);
    if (admin() && t) {
      const f = el('div', 'p-form p-form-2 no-print');
      const v = field('Visas you want from this intake', { value: t.visas ? String(t.visas) : '', max: 6 });
      const by = field('Visas needed by (day)', { kind: 'date', value: t.byDate });
      const stt = field('Teaching starts (day)', { kind: 'date', value: t.startGuessed ? '' : t.startDate, hint: t.startGuessed && t.startDate ? `Not set: the plan assumes ${t.startDate}` : '' });
      const worth = field('What one visa earns the consultancy (Rs, average)', { value: plan.settings.valuePerVisa ? String(plan.settings.valuePerVisa) : '', max: 10, hint: 'Optional. Shows earnings and the return on marketing in the proposal.' });
      f.append(v.wrap, by.wrap, stt.wrap, worth.wrap);
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save the target');
      save.addEventListener('click', async () => { try { await api('/api/planning/targets/' + data.selected, { visas: v.input.value, byDate: by.input.value, startDate: stt.input.value, note: t.note || '' }); await api('/api/planning/settings', { valuePerVisa: worth.input.value }); say('Saved'); load(); } catch (e) { say(e.message, true); } });
      tc.append(f, el('div', 'p-bar')); tc.lastChild.append(save);
    }
    out.push(tc);
    if (p.needs.length) {
      const nc = card('What it takes to reach the target', p.weeklyPace.applicationsPerWeek ? `To finish before applications close on ${p.weeklyPace.closes} (${p.weeklyPace.weeksLeft} weeks), you need about ${number(p.weeklyPace.applicationsPerWeek)} new applications every week.` : 'Working back from the target with the rates of your own earlier intakes.');
      const box = el('div', 'nd');
      p.needs.forEach((x) => {
        const row = el('div', 'nd-row');
        const pct = x.need ? Math.min(100, Math.round((x.have / x.need) * 100)) : 0;
        const track = el('span', 'nd-track'); const fill = el('i', 'nd-fill'); fill.style.width = pct + '%'; track.append(fill);
        row.append(el('b', '', x.label), track, el('span', 'nd-have', `${number(x.have)} of ${x.need === null ? '?' : number(x.need)}`), el('span', 'nd-left', x.left === null ? '' : (x.left > 0 ? `${number(x.left)} to find` : 'done')));
        box.append(row);
      });
      nc.append(box);
      out.push(nc);
    }
    const act = el('div', 'p-card plan-go no-print');
    act.append(el('div', '', ''), h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => proposal() }, 'Make the intake proposal (2 pages, to print)'));
    act.firstChild.append(el('b', '', 'The intake proposal'), el('p', 'p-muted', 'A two-page summary for your CEO: the target, where you stand, what it takes, where students come from and the decisions to take. It uses the target above.'));
    out.push(act);
    return out;
  }

  // ---- The intake proposal: two printed pages with charts ----
  const SVGNS = 'http://www.w3.org/2000/svg';
  // 🔴 CSS CHANGED (2026-11-13): bars of the printed proposal in the brand colour | from: bright blue #1f5fc0 | to: navy #1d2f52
  function chartBars(rows, { width = 640, color = '#1d2f52', unit = '' } = {}) {
    const rowH = 30; const labelW = 170; const H = rows.length * rowH + 6;
    const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', `0 0 ${width} ${H}`); s.setAttribute('class', 'prop-chart'); s.setAttribute('role', 'img');
    const max = Math.max(1, ...rows.map((r) => r.value));
    rows.forEach((r, i) => {
      const y = i * rowH + 3; const w = Math.max(2, ((width - labelW - 120) * r.value) / max);
      const mk = (tag, a) => { const e = document.createElementNS(SVGNS, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
      const t1 = mk('text', { x: 0, y: y + 18, class: 'prop-lbl' }); t1.textContent = r.label.length > 26 ? r.label.slice(0, 25) + '...' : r.label;
      const bg = mk('rect', { x: labelW, y: y + 4, width: width - labelW - 120, height: 18, rx: 9, fill: '#e1e6ee' });
      const bar = mk('rect', { x: labelW, y: y + 4, width: w, height: 18, rx: 9, fill: r.color || color });
      const t2 = mk('text', { x: width - 112, y: y + 18, class: 'prop-val' }); t2.textContent = r.text !== undefined ? r.text : `${number(r.value)}${unit}`;
      s.append(t1, bg, bar, t2);
    });
    return s;
  }
  function proposal() {
    const d = data; const p = d.plan; const t = d.target; const s = d.summary;
    const view = el('article', 'p-proposal print-me');
    const hdr = (title) => { const top = el('header', 'prop-head'); top.append(el('div', 'prop-org', 'International Student Recruitment'), el('div', 'prop-sub', 'UK Recruitment Department')); const h1 = el('h1', '', title); return [top, h1]; };
    // page 1
    const p1 = el('section', 'prop-page');
    const [t1, h1a] = hdr(`Intake proposal: ${p.intake}`);
    p1.append(t1, h1a, el('p', 'prop-date', `Prepared ${d.today}`));
    const st = sayStatus(t);
    const call = el('div', `prop-call prop-${st[1]}`); call.append(el('b', '', t && t.visas ? `Target: ${t.visas} visas${t.byDate ? ` by ${t.byDate}` : ''}` : 'No target set'), el('p', '', targetSentence(t)));
    p1.append(call);
    const stats = el('div', 'prop-stats');
    [['Students', s.students], ['Applied', s.applied], ['Paid', s.paid], ['Visas issued', s.visas]].forEach(([l, v]) => { const b = el('div', 'prop-stat'); b.append(el('b', '', number(v)), el('span', '', l)); stats.append(b); });
    p1.append(stats);
    p1.append(el('h2', '', 'The student journey'), chartBars(d.funnel.map((f, i) => ({ label: f.label, value: f.count, text: `${number(f.count)}${f.fromPrevious !== null ? '   (' + f.fromPrevious + '%)' : ''}`, color: i === d.funnel.length - 1 ? '#1f8a52' : '#1d2f52' }))));
    p1.append(el('p', 'prop-note', 'The percentage is the share of the step before that went on.'));
    if (t && t.visas) {
      const likely = t.expectedTotal === null || t.expectedTotal === undefined ? null : Math.round(t.expectedTotal);
      p1.append(el('h2', '', 'Visas: now, expected and target'), chartBars([{ label: 'Issued so far', value: t.visasNow, color: '#1f8a52' }, ...(likely === null ? [] : [{ label: 'Expected at the end', value: likely, color: '#6b4fd8' }]), { label: 'Target', value: t.visas, color: '#b86a00' }]));
    }
    view.append(p1);
    // page 2
    const p2 = el('section', 'prop-page');
    const [t2, h2a] = hdr('What it takes, and what to decide');
    p2.append(t2, h2a);
    if (p.needs.length) {
      p2.append(el('h2', '', 'What it takes to reach the target'), chartBars(p.needs.map((x) => ({ label: x.label, value: x.have, text: `${number(x.have)} of ${x.need === null ? '?' : number(x.need)}`, color: '#1d2f52' })).map((r, i) => ({ ...r, value: p.needs[i].need ? Math.min(p.needs[i].have, p.needs[i].need) : r.value }))));
      if (p.weeklyPace.applicationsPerWeek) p2.append(el('p', 'prop-note', `To finish before applications close on ${p.weeklyPace.closes}, about ${number(p.weeklyPace.applicationsPerWeek)} new applications are needed every week.`));
    }
    const src = d.channels.sources.filter((x) => !x.spendOnly && x.students >= 5).slice(0, 6);
    if (src.length) p2.append(el('h2', '', 'Where the students come from'), chartBars(src.map((x) => ({ label: x.label, value: x.students, text: `${number(x.students)}  (${number(x.visas)} ${x.visas === 1 ? 'visa' : 'visas'})`, color: '#2a9fc4' }))), el('p', 'prop-note', 'Students, and how many of them have a visa.'));
    const acts = d.findings.slice(0, 4);
    p2.append(el('h2', '', 'Decisions we ask for'));
    if (acts.length) { const ol = el('ol', 'prop-list'); acts.forEach((f) => { const li = el('li'); li.append(el('b', '', f.title + '. '), f.decision); ol.append(li); }); p2.append(ol); } else p2.append(el('p', '', 'No decision is needed at the moment.'));
    const risks = [];
    if (d.universities.concentration.applications.topShare >= 40) risks.push(`${d.universities.concentration.applications.top} holds ${d.universities.concentration.applications.topShare}% of the applications.`);
    if (d.partners.concentration.applications.topShare >= 50) risks.push(`${d.partners.concentration.applications.top} processes ${d.partners.concentration.applications.topShare}% of the applications.`);
    const weakest = d.funnel.slice(1).filter((x, i) => d.funnel[i].count >= 10).sort((a, b) => a.fromPrevious - b.fromPrevious)[0];
    if (weakest) risks.push(`The weakest step is ${weakest.label.toLowerCase()}: only ${weakest.fromPrevious}% of the step before went on.`);
    if (risks.length) { p2.append(el('h2', '', 'Watch out for')); const ul = el('ul', 'prop-list'); risks.forEach((r) => ul.append(el('li', '', r))); p2.append(ul); }
    p2.append(el('p', 'prop-foot', 'Every figure comes from the student sheet, the student cards and the management records. A rate from fewer than ten students is a hint, not evidence.'));
    view.append(p2);
    const bar = el('div', 'p-actions no-print'); bar.style.margin = '0 0 12px';
    bar.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => window.print() }, 'Print or save as PDF'), h('button', { class: 'btn', type: 'button', onclick: () => { draw(); } }, 'Back to the plan'));
    panel.replaceChildren(bar, view);
  }

  const RENDER = { decisions: renderDecisions, channels: renderChannels, universities: renderUniversities, plan: renderPlan };
  function draw() { panel.replaceChildren(...RENDER[tab]()); }
  async function load() {
    clearTimeout(timer);
    try {
      [data, plan] = await Promise.all([api('/api/insights?intake=' + encodeURIComponent(intake)), api('/api/planning')]);
      intake = data.selected;
      if (tab !== 'overview' && !document.querySelector('.p-proposal')) draw();
    } catch (e) { panel.replaceChildren(el('div', 'p-notice bad', e.message)); }
    timer = setTimeout(() => { if (!document.hidden && tab !== 'overview' && !document.querySelector('.p-proposal') && !document.querySelector('dialog[open]') && !document.activeElement.matches('textarea, input')) load(); }, 45000);
  }
  function show(name) {
    tab = name;
    tabsBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    const isNumbers = name === 'overview';
    numbers.hidden = !isNumbers;
    panel.hidden = isNumbers;
    if (headFilters) headFilters.style.display = isNumbers ? '' : 'none'; // the intake chooser of the Numbers page
    history.replaceState(null, '', isNumbers ? location.pathname + location.search : `#tab=${name}`);
    if (!isNumbers) { panel.replaceChildren(el('div', 'p-card', 'Loading…')); load(); } else if (window.DashboardOverview) window.DashboardOverview.load();
  }
  tabsBar.addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) show(b.dataset.tab); });
  if (tab !== 'overview' && RENDER[tab]) show(tab); else tab = 'overview';
})();

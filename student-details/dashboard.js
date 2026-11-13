// The Dashboard's Overview (dashboard.html), written from zero: the numbers a head of recruitment looks at first, as cards that say
// what the number is, how it compares with the intake before, and where it is heading. Everything is worked out on the server
// (/api/dashboard and /api/insights, from the sheet, the student cards and the records): this page only draws it.
// Names and labels come from student records, so they are only ever put in with textContent.
(function () {
  const { el, api, number, rupees } = window.Portal;
  const SVG = 'http://www.w3.org/2000/svg';
  const root = document.getElementById('panel-overview');
  const picker = document.getElementById('intake');
  const updated = document.getElementById('updated');
  const REFRESH_MS = 45000;
  const COLORS = { inquiry: 'var(--s5)', applied: 'var(--s1)', offer: 'var(--s4)', paid: 'var(--s2)', visa: 'var(--s3)' };
  const TREND_LABEL = { inquiry: 'Inquiries', applied: 'Applications', offer: 'Offers', paid: 'Payments', visa: 'Visas' };
  let selected = (() => { try { return decodeURIComponent(location.hash.slice(1)).replace(/^tab=.*/, ''); } catch (e) { return ''; } })();
  let dash = null;
  let ins = null;
  let apps = null; // where the applicants came from (/api/applicants)
  let isAdmin = false; // only Admin sets the visa target
  let seq = 0;
  let timer = null;
  const hidden = new Set(['inquiry', 'offer']); // trend lines switched off (two lines to start with, the others with one click)
  let channelMetric = 'students';

  // ---- small helpers ----
  const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const num = (v) => (v === null || v === undefined ? 'n/a' : number(v));
  const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v}%`);
  const compact = (v) => (v >= 1e7 ? `${(v / 1e7).toFixed(1).replace(/\.0$/, '')} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1).replace(/\.0$/, '')} L` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(v));
  const shortDay = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`; };

  // The hover readout.
  const tip = document.getElementById('tip');
  function showTip(x, y, title, rows) {
    tip.replaceChildren();
    if (title) tip.append(el('div', 'tip-title', title));
    rows.forEach((r) => {
      const row = el('div', 'tip-row');
      if (r.color) { const key = el('span', 'tip-key'); key.style.setProperty('--c', r.color); row.append(key); }
      row.append(el('span', 'tip-name', r.name), el('span', 'tip-val', r.value));
      tip.append(row);
    });
    tip.hidden = false;
    tip.style.left = Math.max(8, Math.min(x, window.innerWidth - tip.offsetWidth - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(y, window.innerHeight - tip.offsetHeight - 8)) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function hover(node, content) {
    node.addEventListener('pointermove', (e) => { const c = content(); showTip(e.clientX + 14, e.clientY + 14, c.title, c.rows); });
    node.addEventListener('pointerleave', hideTip);
  }

  const card = (cls, title, sub) => {
    const c = el('section', `ov-card ${cls || ''}`);
    if (title) { const head = el('header', 'ov-card-head'); const t = el('div'); t.append(el('h2', '', title)); if (sub) t.append(el('p', '', sub)); head.append(t); c.append(head); c.head = head; }
    return c;
  };

  // ---- a small line with a soft area under it ----
  function sparkline(values, color) {
    const W = 120; const H = 34;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ov-spark', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
    const max = Math.max(1, ...values);
    const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W / 2, H - 3 - (v / max) * (H - 8)]);
    if (!pts.length) return s;
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    s.append(svg('path', { d: `${line} L${W} ${H} L0 ${H} Z`, fill: color, opacity: '.12' }), svg('path', { d: line, fill: 'none', stroke: color, 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
    return s;
  }

  // ---- the headline numbers ----
  // The intake before the chosen one (in the order of the sheet), for "compared with".
  function previous() {
    const list = ins.compare || [];
    const i = list.findIndex((c) => c.id === ins.selected);
    return i > 0 ? list[i - 1] : null;
  }
  // Last intake's figure beside this one, in plain words. No arrows or colours: an intake that is still running is not
  // comparable with one that has finished, so the page does not call a difference good or bad.
  function deltaNode(cur, prev, prevLabel, { isPercentPoints = false } = {}) {
    const d = el('div', 'ov-delta');
    if (prev === null || prev === undefined) { d.append(el('span', 'ov-delta-none', 'No earlier intake to compare')); return d; }
    d.append(el('span', 'ov-delta-text', `${prevLabel}: ${isPercentPoints ? prev + '%' : number(prev)}`));
    return d;
  }
  function kpis() {
    const s = ins.summary;
    const trend = ins.trend || [];
    const a = apps || { applicants: 0, headOffice: 0, headOfficeVisas: 0 };
    const cards = [
      { label: 'Students', value: num(s.students), color: 'var(--s1)', series: null, hint: `${num(s.active)} still active` },
      { label: 'Applicants', value: num(a.applicants), color: COLORS.applied, series: trend.map((t) => t.applied), hint: `${pct(s.toApplication)} of students` },
      { label: 'Applicants from Head Office', value: num(a.headOffice), color: 'var(--s1)', series: null, hint: a.applicants ? `${Math.round((a.headOffice / a.applicants) * 100)}% of applicants \u00b7 ${num(a.headOfficeVisas)} visa${a.headOfficeVisas === 1 ? '' : 's'}` : 'No applicants yet', main: true },
      { label: 'Payments', value: num(s.paid), color: COLORS.paid, series: trend.map((t) => t.paid), hint: `${pct(s.toPayment)} of offers` },
      { label: 'Visas issued', value: num(s.visas), color: COLORS.visa, series: trend.map((t) => t.visa), hint: ins.target && ins.target.visas ? `target ${ins.target.visas}` : `${pct(s.visaSuccess)} of decisions` },
    ];
    const row = el('div', 'ov-kpis');
    cards.forEach((c) => {
      const k = el('article', 'ov-kpi' + (c.main ? ' main' : ''));
      k.style.setProperty('--accent', c.color);
      k.append(el('span', 'ov-kpi-label', c.label), el('b', 'ov-kpi-value', c.value), el('span', 'ov-kpi-hint', c.hint));
      if (c.series && c.series.some(Boolean)) k.append(sparkline(c.series, c.color));
      row.append(k);
    });
    return row;
  }

  // ---- the visa target as a ring ----
  function targetCard() {
    const t = ins.target;
    const c = card('ov-target', 'Visa target', ins.scope);
    // The target is set here (the Intake plan page is gone): Admin types the number of visas aimed for and saves.
    const setter = () => {
      const row = el('div', 'ov-target-set');
      const input = el('input'); input.type = 'number'; input.min = '1'; input.max = '9999'; input.placeholder = 'Visas aimed for'; input.value = t && t.visas ? t.visas : '';
      const save = el('button', 'btn btn-sm', t && t.visas ? 'Change' : 'Set the target'); save.type = 'button';
      save.addEventListener('click', async () => { try { await api('/api/planning/targets/' + ins.selected, { visas: input.value, byDate: (t && t.byDate) || '', startDate: (t && t.startDate) || '', note: (t && t.note) || '' }); window.NiecUI.toast('Target saved', { type: 'success' }); load(); } catch (e) { window.NiecUI.toast(e.message, { type: 'error' }); } });
      row.append(input, save);
      return row;
    };
    if (!t || !t.visas) {
      c.append(el('p', 'ov-empty', 'No visa target is set for this intake yet.'));
      if (isAdmin) c.append(setter());
      return c;
    }
    c.setter = setter;
    const share = Math.min(1, t.visasNow / t.visas);
    const forecast = Math.min(1, (t.expectedTotal || t.visasNow) / t.visas);
    const R = 62; const C = 2 * Math.PI * R;
    const ring = svg('svg', { viewBox: '0 0 160 160', class: 'ov-ring', role: 'img', 'aria-label': `${t.visasNow} of ${t.visas} visas` });
    ring.append(svg('circle', { cx: 80, cy: 80, r: R, fill: 'none', stroke: 'var(--ov-track)', 'stroke-width': 14 }),
      svg('circle', { cx: 80, cy: 80, r: R, fill: 'none', stroke: 'var(--s3)', 'stroke-opacity': '.28', 'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-dasharray': `${C * forecast} ${C}`, transform: 'rotate(-90 80 80)' }),
      svg('circle', { cx: 80, cy: 80, r: R, fill: 'none', stroke: 'var(--s3)', 'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-dasharray': `${Math.max(0.5, C * share)} ${C}`, transform: 'rotate(-90 80 80)' }));
    const mid = svg('text', { x: 80, y: 82, 'text-anchor': 'middle', class: 'ov-ring-num' }); mid.textContent = String(t.visasNow);
    const sub = svg('text', { x: 80, y: 104, 'text-anchor': 'middle', class: 'ov-ring-sub' }); sub.textContent = `of ${t.visas} visas`;
    ring.append(mid, sub);
    const T = window.DashText;
    const stat = T.sayStatus(t);
    const side = el('div', 'ov-target-side');
    side.append(el('span', `p-pill p-pill-${stat[1]}`, stat[0]), el('p', 'ov-target-text', T.targetSentence(t)));
    if (isAdmin) side.append(setter());
    const wrap = el('div', 'ov-target-body'); wrap.append(ring, side);
    c.append(wrap);
    return c;
  }

  // ---- what needs a decision: the top three, in plain words ----
  function decisionCard() {
    const c = card('ov-decide', 'Needs a decision', 'The most important things the figures say today');
    const list = ins.findings.slice(0, 3);
    if (!list.length && !dash.attention.length) { c.append(el('p', 'ov-ok', 'Nothing needs a decision right now.')); return c; }
    const ol = el('ol', 'ov-decide-list');
    list.forEach((f) => { const li = el('li'); li.append(el('b', '', f.title), el('span', '', f.decision)); ol.append(li); });
    c.append(ol);
    if (dash.attention.length) {
      const w = el('div', 'ov-wait'); w.append(el('h3', '', 'Students waiting too long'));
      dash.attention.slice(0, 3).forEach((a) => { const r = el('div', 'ov-wait-row'); r.append(el('b', '', String(a.count)), el('span', '', a.text)); w.append(r); });
      c.append(w);
    }
    const more = el('button', 'p-link ov-more', 'See every decision'); more.type = 'button'; more.addEventListener('click', () => { const b = document.querySelector('#dashTabs [data-tab="decisions"]'); if (b) b.click(); }); c.append(more);
    return c;
  }

  // ---- the funnel ----
  function funnelCard() {
    const c = card('ov-funnel', 'The student journey', 'How many reached each step, and what share of the step before went on');
    const max = Math.max(1, ...ins.funnel.map((f) => f.count));
    const list = el('div', 'ov-funnel-list');
    ins.funnel.forEach((f, i) => {
      const row = el('div', 'ov-funnel-row');
      const bar = el('span', 'ov-funnel-track'); const fill = el('i', 'ov-funnel-fill');
      fill.style.width = Math.max(2, (f.count / max) * 100) + '%';
      fill.style.setProperty('--shade', String(0.95 - i * 0.09));
      bar.append(fill);
      row.append(el('span', 'ov-funnel-label', f.label), bar, el('b', 'ov-funnel-count', num(f.count)), el('span', `ov-funnel-conv${f.fromPrevious === null ? ' none' : ''}`, f.fromPrevious === null ? '' : `${f.fromPrevious}%`));
      hover(row, () => ({ title: f.label, rows: [{ name: 'Students', value: num(f.count) }, { name: 'Of all students', value: pct(f.ofAll) }, ...(f.fromPrevious === null ? [] : [{ name: 'Of the step before', value: pct(f.fromPrevious) }])] }));
      list.append(row);
    });
    c.append(list);
    return c;
  }

  // ---- the trend ----
  function trendCard() {
    const rows = ins.trend || [];
    const c = card('ov-trend', 'Week by week', 'What happened each week in the last 12 weeks, by the date entered on each student');
    const legend = el('div', 'ov-legend', '');
    legend.setAttribute('role', 'group'); legend.setAttribute('aria-label', 'Show or hide a line');
    Object.keys(TREND_LABEL).forEach((k) => {
      const b = el('button', 'ov-legend-btn', '');
      b.type = 'button'; b.setAttribute('aria-pressed', String(!hidden.has(k)));
      const dot = el('i', 'ov-dot'); dot.style.background = COLORS[k];
      b.append(dot, TREND_LABEL[k]);
      b.addEventListener('click', () => { if (hidden.has(k)) hidden.delete(k); else hidden.add(k); draw(); });
      legend.append(b);
    });
    c.head.append(legend);
    const W = 720; const H = 250; const pad = { l: 36, r: 14, t: 12, b: 28 };
    const shown = Object.keys(TREND_LABEL).filter((k) => !hidden.has(k));
    const max = Math.max(4, ...rows.flatMap((r) => shown.map((k) => r[k])));
    const top = Math.ceil(max / 4) * 4;
    const x = (i) => pad.l + (rows.length > 1 ? (i / (rows.length - 1)) * (W - pad.l - pad.r) : (W - pad.l - pad.r) / 2);
    const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ov-chart', role: 'img', 'aria-label': 'Week by week chart' });
    for (let g = 0; g <= 4; g += 1) {
      const v = (top / 4) * g;
      s.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: 'var(--ov-grid)', 'stroke-width': 1 }));
      const t = svg('text', { x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'ov-axis' }); t.textContent = String(Math.round(v)); s.append(t);
    }
    rows.forEach((r, i) => {
      if (i % 2 === 0 || rows.length < 7) { const t = svg('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'ov-axis' }); t.textContent = shortDay(r.start); s.append(t); }
    });
    shown.forEach((k) => {
      const pts = rows.map((r, i) => [x(i), y(r[k])]);
      if (!pts.length) return;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      if (shown.length <= 2) s.append(svg('path', { d: `${d} L${pts[pts.length - 1][0]} ${H - pad.b} L${pts[0][0]} ${H - pad.b} Z`, fill: COLORS[k], opacity: '.1' }));
      s.append(svg('path', { d, fill: 'none', stroke: COLORS[k], 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    });
    // One invisible column per week carries the readout.
    rows.forEach((r, i) => {
      const colW = (W - pad.l - pad.r) / Math.max(1, rows.length - 1);
      const hit = svg('rect', { x: x(i) - colW / 2, y: pad.t, width: colW, height: H - pad.t - pad.b, fill: 'transparent' });
      hover(hit, () => ({ title: `${shortDay(r.start)} to ${shortDay(r.end)}`, rows: shown.map((k) => ({ name: TREND_LABEL[k], value: num(r[k]), color: COLORS[k] })) }));
      s.append(hit);
    });
    c.append(s);
    return c;
  }

  // ---- where students come from ----
  function channelsCard() {
    const c = card('ov-channels', 'Where students come from', 'The five biggest sources, and how many of their students reached a visa');
    const list = ins.channels.sources.filter((g) => !g.spendOnly).slice(0, 5);
    const max = Math.max(1, ...list.map((g) => g.students));
    const box = el('div', 'ov-rank');
    list.forEach((g) => {
      const row = el('div', 'ov-rank-row');
      const track = el('span', 'ov-rank-track'); const fill = el('i', 'ov-rank-fill'); fill.style.width = Math.max(2, (g.students / max) * 100) + '%'; track.append(fill);
      row.append(el('span', 'ov-rank-label', g.label), track, el('b', 'ov-rank-value', num(g.students)), el('span', 'ov-rank-note', `${num(g.visas)} ${g.visas === 1 ? 'visa' : 'visas'}`));
      hover(row, () => ({ title: g.label, rows: [{ name: 'Students', value: num(g.students) }, { name: 'Paid', value: num(g.paid) }, { name: 'Visas', value: num(g.visas) }, ...(g.costPerVisa ? [{ name: 'Cost per visa', value: rupees(g.costPerVisa) }] : [])] }));
      box.append(row);
    });
    c.append(box);
    return c;
  }

  // ---- universities and partners ----
  function leaderboard(title, sub, list, concentration, what) {
    const c = card('ov-board', title, sub);
    if (!list.length) { c.append(el('p', 'ov-empty', `No ${what} recorded yet.`)); return c; }
    const max = Math.max(1, ...list.map((g) => g.students));
    const t = el('div', 'ov-board-list');
    const head = el('div', 'ov-board-row head');
    ['', 'Students', 'Offers', 'Paid', 'Visas'].forEach((h) => head.append(el('span', h ? 'num' : '', h)));
    t.append(head);
    list.slice(0, 5).forEach((g) => {
      const row = el('div', 'ov-board-row');
      const name = el('span', 'ov-board-name'); name.append(el('b', '', g.label));
      const track = el('i', 'ov-board-bar'); track.style.width = Math.max(3, (g.students / max) * 100) + '%'; name.append(track);
      row.append(name, el('span', 'num', num(g.students)), el('span', 'num', num(g.offers)), el('span', 'num', num(g.paid)), el('span', 'num strong', num(g.visas)));
      hover(row, () => ({ title: g.label, rows: [{ name: 'Applied', value: num(g.applied) }, { name: 'Offer rate', value: pct(g.toOffer) }, { name: 'Payment rate', value: pct(g.toPayment) }, { name: 'Visa success', value: pct(g.visaSuccess) }] }));
      t.append(row);
    });
    c.append(t);
    if (concentration && concentration.applications && concentration.applications.total) {
      const a = concentration.applications;
      c.append(el('p', 'ov-foot', `${a.top} takes ${a.topShare}% of applications${a.count > 1 ? `, the top three ${a.top3Share}%` : ''}.`));
    }
    return c;
  }






  // ---- where the applicants came from: Head Office, each branch and each agent ----
  function fromCard() {
    const c = card('ov-from', 'Where applicants came from', 'By the Receiving Partner of each applicant');
    const list = (apps && apps.list) || [];
    if (!list.length) { c.append(el('p', 'ov-empty', 'No applicant has a Receiving Partner yet.')); return c; }
    const max = Math.max(1, ...list.map((g) => g.applicants));
    const box = el('div', 'ov-board-list');
    const head = el('div', 'ov-from-row head'); ['', 'Applicants', 'Visas'].forEach((x) => head.append(el('span', x ? 'num' : '', x)));
    box.append(head);
    list.forEach((g) => {
      const row = el('div', 'ov-from-row' + (g.kind === 'office' ? ' main' : ''));
      const name = el('span', 'ov-board-name'); name.append(el('b', '', g.label)); if (g.kind === 'agent') name.append(el('small', '', 'Agent'));
      const bar = el('i', 'ov-board-bar'); bar.style.width = Math.max(3, (g.applicants / max) * 100) + '%'; name.append(bar);
      row.append(name, el('span', 'num strong', num(g.applicants)), el('span', 'num', num(g.visas)));
      box.append(row);
    });
    c.append(box);
    return c;
  }

  // ---- the page: only what the head of the consultancy needs ----
  function draw() {
    if (!ins || !dash || !window.DashText) return;
    const page = el('div', 'ov');
    page.append(kpis());
    const r1 = el('div', 'ov-row ov-row-2'); r1.append(fromCard(), targetCard());
    // Universities: only those recorded on the students (a blank University Name is not a row).
    const unis = (ins.universities.list || []).filter((g) => g.label && !/not recorded/i.test(g.label));
    const r2 = el('div', 'ov-row ov-row-2'); r2.append(funnelCard(), leaderboard('Universities', 'Where the students are placed', unis, null, 'university'));
    page.append(r1, r2);
    if (ins.summary.low) page.append(el('p', 'ov-foot', 'This intake has fewer than 10 students, so a rate from it is a hint, not evidence.'));
    root.replaceChildren(page);
  }

  async function load() {
    const my = ++seq;
    clearTimeout(timer);
    try {
      const [d, i] = await Promise.all([api('/api/dashboard?intake=' + encodeURIComponent(selected)), api('/api/insights?intake=' + encodeURIComponent(selected))]);
      if (my !== seq) return;
      dash = d; ins = i; selected = i.selected || d.selected;
      try { apps = await api('/api/applicants?intake=' + encodeURIComponent(selected)); } catch (e) { apps = null; }
      try { isAdmin = (await api('/api/me')).role === 'admin'; } catch (e) { isAdmin = false; }
      picker.replaceChildren(...i.intakes.map((x) => { const o = el('option', '', x.name); o.value = x.id; return o; }));
      picker.value = selected;
      updated.textContent = `Figures as of ${ins.today}. They refresh on their own.`;
      document.getElementById('page').classList.remove('first-load');
      draw();
    } catch (e) {
      if (my === seq) root.replaceChildren(el('div', 'p-notice bad', e.message));
    }
    timer = setTimeout(() => { if (!document.hidden && !root.hidden) load(); }, REFRESH_MS);
  }
  picker.addEventListener('change', () => { selected = picker.value; history.replaceState(null, '', location.pathname); load(); });
  window.DashboardOverview = { load, intake: () => selected, setIntake: (v) => { selected = v; } };
  if (!(location.hash.match(/tab=(\w+)/) || [])[1]) load();
})();

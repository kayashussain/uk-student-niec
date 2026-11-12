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
    const s = ins.summary; const p = previous();
    const trend = ins.trend || [];
    const cards = [
      { label: 'Students', value: num(s.students), cur: s.students, prev: p && p.students, color: 'var(--s1)', series: null, hint: `${num(s.active)} still active` },
      { label: 'Applications', value: num(s.applied), cur: s.applied, prev: p && p.applied, color: COLORS.applied, series: trend.map((t) => t.applied), hint: `${pct(s.toApplication)} of students` },
      { label: 'Offers', value: num(s.offers), cur: s.offers, prev: p && p.offers, color: COLORS.offer, series: trend.map((t) => t.offer), hint: `${pct(s.toOffer)} of applications` },
      { label: 'Payments', value: num(s.paid), cur: s.paid, prev: p && p.paid, color: COLORS.paid, series: trend.map((t) => t.paid), hint: `${pct(s.toPayment)} of offers` },
      { label: 'Visas issued', value: num(s.visas), cur: s.visas, prev: p && p.visas, color: COLORS.visa, series: trend.map((t) => t.visa), hint: `${pct(s.toVisa)} of payments` },
      { label: 'Visa success', value: pct(s.visaSuccess), cur: s.visaSuccess, prev: p && p.visaSuccess, color: 'var(--s3)', series: null, hint: `${num(s.refused)} refused`, points: true },
    ];
    const row = el('div', 'ov-kpis');
    cards.forEach((c) => {
      const k = el('article', 'ov-kpi');
      k.style.setProperty('--accent', c.color);
      k.append(el('span', 'ov-kpi-label', c.label), el('b', 'ov-kpi-value', c.value), deltaNode(c.cur, c.prev, p ? p.label : '', { isPercentPoints: c.points }), el('span', 'ov-kpi-hint', c.hint));
      if (c.series && c.series.some(Boolean)) k.append(sparkline(c.series, c.color));
      row.append(k);
    });
    return row;
  }

  // ---- the visa target as a ring ----
  function targetCard() {
    const t = ins.target;
    const c = card('ov-target', 'Visa target', ins.scope);
    if (!t || !t.visas) {
      c.append(el('p', 'ov-empty', 'No target is set for this intake. Set one on the Intake plan page and this ring shows how close you are.'));
      return c;
    }
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
    const status = { reached: ['Reached', 'green'], 'on-track': ['On track', 'green'], behind: ['Behind', 'red'], missed: ['Missed', 'red'], unknown: ['Not enough history yet', 'amber'], none: ['No target', 'amber'] }[t.status] || ['', 'amber'];
    const side = el('div', 'ov-target-side');
    side.append(el('span', `p-pill p-pill-${status[1]}`, status[0]));
    const facts = el('dl', 'ov-facts');
    const fact = (k, v) => { facts.append(el('dt', '', k), el('dd', '', v)); };
    fact('Likely total', t.expectedTotal === null ? 'unknown' : `about ${Math.round(t.expectedTotal)}`);
    if (t.forecast) fact('Range', `${t.forecast.low} to ${t.forecast.high}`);
    if (t.byDate) fact('Needed by', shortDay(t.byDate));
    if (t.gap) fact('Short by', `about ${t.gap} visas`);
    if (t.gap && t.applicationsNeeded !== null) fact('Applications needed', `${t.applicationsNeeded}${t.perWeek ? `, about ${t.perWeek} a week` : ''}`);
    side.append(facts);
    const wrap = el('div', 'ov-target-body'); wrap.append(ring, side);
    c.append(wrap);
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
  const CHANNEL_METRICS = {
    students: { label: 'Students', get: (g) => g.students, text: (g) => num(g.students) },
    visas: { label: 'Visas', get: (g) => g.visas, text: (g) => num(g.visas) },
    rate: { label: 'Reach a visa', get: (g) => (g.leadToVisa === null ? 0 : g.leadToVisa), text: (g) => pct(g.leadToVisa) },
    cost: { label: 'Cost per student', get: (g) => g.costPerStudent || 0, text: (g) => (g.costPerStudent ? rupees(g.costPerStudent) : 'n/a') },
  };
  function channelsCard() {
    const c = card('ov-channels', 'Where students come from', 'Each source, and what it brings');
    const tabs = el('div', 'ov-seg'); tabs.setAttribute('role', 'tablist');
    Object.entries(CHANNEL_METRICS).forEach(([k, m]) => {
      const b = el('button', '', m.label); b.type = 'button'; b.setAttribute('aria-pressed', String(channelMetric === k));
      b.addEventListener('click', () => { channelMetric = k; draw(); });
      tabs.append(b);
    });
    c.head.append(tabs);
    const list = ins.channels.sources.slice();
    const m = CHANNEL_METRICS[channelMetric];
    list.sort((a, b) => m.get(b) - m.get(a));
    const max = Math.max(1, ...list.map(m.get));
    const box = el('div', 'ov-rank');
    list.forEach((g) => {
      const row = el('div', 'ov-rank-row');
      const track = el('span', 'ov-rank-track'); const fill = el('i', 'ov-rank-fill'); fill.style.width = Math.max(2, (m.get(g) / max) * 100) + '%'; track.append(fill);
      row.append(el('span', 'ov-rank-label', g.label), track, el('b', 'ov-rank-value', m.text(g)), el('span', 'ov-rank-note', g.low ? 'few students' : `${pct(g.share)} of all`));
      hover(row, () => ({ title: g.label, rows: [
        { name: 'Students', value: num(g.students) }, { name: 'Applied', value: num(g.applied) }, { name: 'Offers', value: num(g.offers) }, { name: 'Paid', value: num(g.paid) }, { name: 'Visas', value: num(g.visas) },
        { name: 'Student to visa', value: pct(g.leadToVisa) }, ...(g.spend ? [{ name: 'Spent', value: rupees(g.spend) }, { name: 'Cost per visa', value: g.costPerVisa ? rupees(g.costPerVisa) : 'no visa yet' }] : []),
      ] }));
      box.append(row);
    });
    c.append(box);
    const spend = ins.channels.spendTotal;
    if (spend) c.append(el('p', 'ov-foot', `Marketing spent on this intake: ${rupees(spend)}${ins.channels.reportedLeads ? `, ${num(ins.channels.reportedLeads)} leads reported by the platforms` : ''}.`));
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
    list.slice(0, 7).forEach((g) => {
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

  // ---- how fast ----
  function speedCard() {
    const c = card('ov-speed', 'How fast we move', 'Middle number of days between two dates on the same student');
    const rows = dash.speed.filter((s) => s.median !== null && s.key !== 'whole');
    const whole = dash.speed.find((s) => s.key === 'whole');
    if (!rows.length) { c.append(el('p', 'ov-empty', 'Not enough dates entered yet.')); return c; }
    const max = Math.max(1, ...rows.map((s) => s.median));
    const box = el('div', 'ov-rank');
    rows.forEach((s) => {
      const row = el('div', 'ov-rank-row');
      const track = el('span', 'ov-rank-track'); const fill = el('i', 'ov-rank-fill alt'); fill.style.width = Math.max(3, (s.median / max) * 100) + '%'; track.append(fill);
      row.append(el('span', 'ov-rank-label', s.label), track, el('b', 'ov-rank-value', `${Math.round(s.median)} d`), el('span', 'ov-rank-note', `${s.samples} students`));
      box.append(row);
    });
    c.append(box);
    if (whole && whole.median !== null) c.append(el('p', 'ov-foot', `From application to visa the middle student takes ${Math.round(whole.median)} days (${whole.samples} students so far).`));
    return c;
  }

  // ---- why students are lost ----
  function lostCard() {
    const c = card('ov-lost', 'Why students are lost', `${ins.lost.total} student${ins.lost.total === 1 ? '' : 's'} did not go on`);
    if (!ins.lost.reasons.length) { c.append(el('p', 'ov-empty', 'No student has been lost in this intake.')); return c; }
    const palette = ['var(--s1)', 'var(--s4)', 'var(--s2)', 'var(--s3)', 'var(--s5)', 'var(--ov-muted)'];
    const total = ins.lost.reasons.reduce((n, r) => n + r.count, 0) || 1;
    const R = 52; const C = 2 * Math.PI * R;
    const d = svg('svg', { viewBox: '0 0 140 140', class: 'ov-donut', role: 'img', 'aria-label': 'Reasons students were lost' });
    d.append(svg('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: 'var(--ov-track)', 'stroke-width': 20 }));
    let offset = 0;
    ins.lost.reasons.forEach((r, i) => {
      const len = (r.count / total) * C;
      const seg = svg('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: palette[Math.min(i, palette.length - 1)], 'stroke-width': 20, 'stroke-dasharray': `${Math.max(0, len - 1.5)} ${C}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 70 70)' });
      hover(seg, () => ({ title: r.label, rows: [{ name: 'Students', value: num(r.count) }, { name: 'Share', value: pct(r.percent) }] }));
      d.append(seg); offset += len;
    });
    const mid = svg('text', { x: 70, y: 76, 'text-anchor': 'middle', class: 'ov-ring-num small' }); mid.textContent = String(ins.lost.total); d.append(mid);
    const legend = el('ul', 'ov-donut-legend');
    ins.lost.reasons.slice(0, 6).forEach((r, i) => { const li = el('li'); const dot = el('i', 'ov-dot'); dot.style.background = palette[Math.min(i, palette.length - 1)]; li.append(dot, el('span', '', r.label), el('b', '', `${r.count}`)); legend.append(li); });
    const wrap = el('div', 'ov-donut-wrap'); wrap.append(d, legend);
    c.append(wrap);
    return c;
  }

  // ---- what needs a person now ----
  function attentionCard() {
    const c = card('ov-attention', 'Needs attention', 'Students waiting longer than they should, longest first');
    if (!dash.attention.length && !dash.chase.length) { c.append(el('p', 'ov-ok', 'Nothing is waiting too long. Well done.')); return c; }
    const chips = el('div', 'ov-attn-chips');
    dash.attention.forEach((a) => { const chip = el('div', 'ov-attn'); chip.append(el('b', '', String(a.count)), el('span', '', a.text)); chips.append(chip); });
    c.append(chips);
    const list = el('ul', 'ov-chase');
    dash.chase.slice(0, 6).forEach((s) => { const li = el('li'); li.append(el('b', '', s.name), el('span', '', s.reason), el('em', '', `${s.days} days`)); list.append(li); });
    c.append(list);
    return c;
  }

  // ---- intake against intake ----
  function compareCard() {
    const c = card('ov-compare', 'Intake against intake', 'The same numbers for every intake on the sheet');
    const list = ins.compare || [];
    if (list.length < 2) { c.append(el('p', 'ov-empty', 'A second intake is needed to compare.')); return c; }
    const max = Math.max(1, ...list.map((g) => g.students));
    const t = el('div', 'ov-board-list');
    const head = el('div', 'ov-compare-row head');
    ['Intake', 'Students', 'Applied', 'Offers', 'Paid', 'Visas', 'Student to visa'].forEach((h, i) => head.append(el('span', i ? 'num' : '', h)));
    t.append(head);
    list.forEach((g) => {
      const row = el('div', `ov-compare-row${g.id === ins.selected ? ' current' : ''}`);
      const name = el('span', 'ov-board-name'); name.append(el('b', '', g.label)); const bar = el('i', 'ov-board-bar'); bar.style.width = Math.max(3, (g.students / max) * 100) + '%'; name.append(bar);
      row.append(name, el('span', 'num', num(g.students)), el('span', 'num', num(g.applied)), el('span', 'num', num(g.offers)), el('span', 'num', num(g.paid)), el('span', 'num strong', num(g.visas)), el('span', 'num', pct(g.leadToVisa)));
      t.append(row);
    });
    c.append(t);
    return c;
  }

  // ---- the money (only when the cost of marketing or the worth of a visa is known) ----
  function moneyCard() {
    const m = ins.money;
    if (!m || (!m.spend && !m.valuePerVisa)) return null;
    const c = card('ov-money', 'Money', 'Marketing spend and what the visas are worth');
    const grid = el('div', 'ov-money-grid');
    const item = (label, value, hint) => { const d = el('div', 'ov-money-item'); d.append(el('span', '', label), el('b', '', value), el('small', '', hint || '')); grid.append(d); };
    item('Spent on marketing', m.spend ? rupees(m.spend) : 'none recorded', 'this intake');
    if (m.valuePerVisa) item('Earned so far', rupees(m.earned), `${ins.summary.visas} visas at ${rupees(m.valuePerVisa)}`);
    if (m.valuePerVisa && m.expected) item('Likely when all are done', rupees(m.expected), 'from the forecast');
    if (m.returnOnSpend !== null && m.returnOnSpend !== undefined && m.spend) item('Return on marketing', `${m.returnOnSpend}x`, 'earned for each rupee spent');
    if (ins.summary.visas && m.spend) item('Marketing per visa', rupees(Math.round(m.spend / ins.summary.visas)), 'spend divided by visas');
    c.append(grid);
    return c;
  }

  // ---- the page ----
  function draw() {
    if (!ins || !dash) return;
    const page = el('div', 'ov');
    const lead = ins.headline && ins.headline[1] ? ins.headline[1] : '';
    if (lead) page.append(el('p', 'ov-lead', lead));
    page.append(kpis());
    const r1 = el('div', 'ov-row ov-row-3-2'); r1.append(funnelCard(), targetCard());
    page.append(r1, trendCard());
    const r2 = el('div', 'ov-row ov-row-2'); r2.append(channelsCard(), leaderboard('Universities', 'Where students are placed', ins.universities.list, ins.universities.concentration, 'university'));
    page.append(r2);
    const r3 = el('div', 'ov-row ov-row-2'); r3.append(leaderboard('Partners', 'Who sends the applications', ins.partners.list, ins.partners.concentration, 'partner'), speedCard());
    page.append(r3);
    const r4 = el('div', 'ov-row ov-row-2'); r4.append(attentionCard(), lostCard());
    page.append(r4, compareCard());
    const money = moneyCard(); if (money) page.append(money);
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

// The Dashboard's deeper cards (the owner, 14 Nov 2026), drawn from /api/trends:
//   1. "Business growth by intake": every intake side by side, like a company's quarters (students, applications, offers, payments,
//      visas), with how much each grew on the intake before.
//   2. "Ups and downs over time": a chart like a stock market's, one line for each of inquiries, applications, offers, payments, CAS
//      and visas, by day, week or month, on the day each one happened (a lead list's own inquiry days, never the upload day). A line is
//      shown or hidden by tapping its name; each line's peak is marked; a crosshair reads every line on the day under the mouse; every
//      event and campaign is marked where it ran, so a rise can be read: the ads, an event, or by itself, and did the applications
//      follow. Inquiries can be narrowed to one source. A few plain sentences say what it shows.
//   3. "Where students are from": Nepal, district by district (from the address in the passport), with a red dot sized by students,
//      the top districts, the students from outside Nepal by nationality, and the age groups.
// Every name and label comes from records, so it is only ever put in with textContent.
(function (root) {
  const { el } = root.Portal;
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v))); return e; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNo = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
  const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const short = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]}`; };
  const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

  // The hover readout (the Dashboard's own, #tip).
  const tip = () => document.getElementById('tip');
  function showTip(e, title, rows) {
    const t = tip(); if (!t) return;
    t.replaceChildren(el('div', 'tip-title', title));
    rows.forEach(([k, v, c]) => { const r = el('div', 'tip-row'); if (c) { const key = el('span', 'tip-key'); key.style.setProperty('--c', c); r.append(key); } r.append(el('span', 'tip-name', k), el('span', 'tip-val', String(v))); t.append(r); });
    t.hidden = false;
    t.style.left = Math.max(8, Math.min(e.clientX + 16, window.innerWidth - t.offsetWidth - 8)) + 'px';
    t.style.top = Math.max(8, Math.min(e.clientY + 16, window.innerHeight - t.offsetHeight - 8)) + 'px';
  }
  const hideTip = () => { const t = tip(); if (t) t.hidden = true; };
  const head = (title, sub, ...right) => {
    const h = el('div', 'tr-head');
    const words = el('div');
    words.append(el('h2', '', title), el('p', 'ov-sub', sub));
    h.append(words, ...right);
    return h;
  };
  const segmented = (opts, now, onPick) => {
    const sw = el('div', 'dd-switch tr-switch');
    const bs = opts.map(([k, t]) => { const b = el('button', k === now ? 'on' : '', t); b.type = 'button'; b.addEventListener('click', () => { bs.forEach((x) => x.classList.toggle('on', x === b)); onPick(k); }); return b; });
    sw.append(...bs);
    return sw;
  };
  // A smooth line through the points (Catmull-Rom), as finance charts draw them.
  const smooth = (pts) => pts.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const p0 = pts[i - 2] || pts[i - 1]; const p1 = pts[i - 1]; const p3 = pts[i + 1] || p;
    // The bends stay between the two points' heights, so a curve never dips below zero or above a peak that is not there.
    const lo = Math.min(p1[1], p[1]); const hi = Math.max(p1[1], p[1]); const clamp = (y) => Math.max(lo, Math.min(hi, y));
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, clamp(p1[1] + (p[1] - p0[1]) / 6)]; const c2 = [p[0] - (p3[0] - p1[0]) / 6, clamp(p[1] - (p3[1] - p1[1]) / 6)];
    return `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  }).join('');

  // ---- 1. business growth by intake ----
  function growth(data) {
    const card = el('section', 'ov-card tr-card tr-growth');
    const list = data.intakes || [];
    card.append(head('Business growth by intake', 'Every intake side by side, like a company’s quarters: how many students, applications, offers, payments and visas, and how much each grew on the intake before.'));
    if (list.length < 2) { card.append(el('p', 'p-muted', 'The growth shows once there are two intakes or more.')); }
    const W = 1000; const H = 260; const L = 44; const R = 16; const TOP = 22; const BOT = 220;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tr-svg', role: 'img', 'aria-label': 'Students and visas in each intake' });
    const max = Math.max(4, ...list.map((v) => v.students));
    const cw = (W - L - R) / Math.max(1, list.length);
    [0, .5, 1].forEach((f) => { const y = BOT - (BOT - TOP) * f; s.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'tr-grid' })); const t = svg('text', { x: L - 8, y: y + 4, class: 'tr-axis', 'text-anchor': 'end' }); t.textContent = fmt(Math.round(max * f)); s.append(t); });
    const SERIES = [['students', 'Students', '#d2d2d7'], ['applied', 'Applications', '#0071e3'], ['offers', 'Offers', '#5856d6'], ['paid', 'Payments', '#ff9500'], ['visas', 'Visas', '#34c759']];
    const visaPts = [];
    list.forEach((v, i) => {
      const x0 = L + cw * i; const bw = Math.min(26, (cw * .8) / SERIES.length);
      const g = svg('g', { class: 'tr-col' }); g.style.setProperty('--d', `${i * 70}ms`);
      SERIES.forEach(([k, , c], j) => {
        const h = ((BOT - TOP) * v[k]) / max;
        g.append(svg('rect', { x: x0 + cw / 2 - (SERIES.length * bw) / 2 + j * bw + 1, y: BOT - h, width: bw - 2, height: Math.max(h, .5), rx: 3, fill: c, class: 'tr-bar' }));
      });
      visaPts.push([x0 + cw / 2, BOT - ((BOT - TOP) * v.visas) / max]);
      const hit = svg('rect', { x: x0, y: TOP, width: cw, height: BOT - TOP, class: 'tr-hit' });
      hit.addEventListener('mousemove', (e) => showTip(e, v.name, SERIES.map(([k, n, c]) => [n, fmt(v[k]), c])));
      hit.addEventListener('mouseleave', hideTip);
      g.append(hit);
      s.append(g);
      const t = svg('text', { x: x0 + cw / 2, y: H - 14, class: 'tr-axis strong', 'text-anchor': 'middle' }); t.textContent = v.name; s.append(t);
    });
    if (visaPts.length > 1) s.append(svg('path', { d: smooth(visaPts), class: 'tr-line draw', stroke: '#34c759' }));
    const legend = el('div', 'tr-legend');
    SERIES.forEach(([, n, c]) => { const k = el('span', 'tr-key static'); const dot = el('i'); dot.style.background = c; k.append(dot, el('span', '', n)); legend.append(k); });
    // The table of the quarters: each figure, and its change on the intake before.
    const table = el('table', 'tr-table');
    const thead = el('tr');
    ['Intake', 'Students', 'Applications', 'Offers', 'Payments', 'Visas', 'Visas per 100 students'].forEach((x) => thead.append(el('th', '', x)));
    table.append(thead);
    list.forEach((v, i) => {
      const prev = list[i - 1];
      const tr = el('tr');
      const name = el('td', 'tr-name', v.name);
      // The newest intake is still running: its payments and visas are still to come, so a fall there is not yet a fall.
      if (i === list.length - 1 && list.length > 1) name.append(el('span', 'tr-live', 'In progress'));
      tr.append(name);
      ['students', 'applied', 'offers', 'paid', 'visas'].forEach((k) => {
        const td = el('td');
        td.append(el('b', '', fmt(v[k])));
        if (prev && prev[k]) { const c = Math.round(((v[k] - prev[k]) / prev[k]) * 100); const ch = el('span', `tr-chg ${c > 0 ? 'up' : c < 0 ? 'down' : ''}`, `${c > 0 ? '▲' : c < 0 ? '▼' : ''} ${Math.abs(c)}%`); td.append(ch); }
        tr.append(td);
      });
      tr.append(el('td', '', v.students ? String(Math.round((v.visas / v.students) * 1000) / 10) : '-'));
      table.append(tr);
    });
    card.append(legend, el('div', 'tr-chart'), table);
    if (list.length > 1) card.append(el('p', 'ov-foot', `${list[list.length - 1].name} is still running: its payments and visas are still coming in, so compare it with the others again once it has closed.`));
    card.querySelector('.tr-chart').append(s);
    return card;
  }

  // ---- 2. ups and downs over time ----
  const LINES = [
    ['inq', 'Inquiries', '#0071e3', (d) => d.inquiries.map((x) => x[0])], ['app', 'Applications', '#5856d6', (d) => d.applications], ['off', 'Offers', '#af52de', (d) => d.offers],
    ['pay', 'Payments', '#ff9500', (d) => d.payments || []], ['cas', 'CAS', '#30b0c7', (d) => d.cas || []], ['visa', 'Visas', '#34c759', (d) => d.visas || []],
  ];
  const SOURCES = [['', 'Every source'], ['social', 'Social Media'], ['events', 'Events and marketing'], ['organic', 'Came by itself'], ['branch', 'Branches'], ['agent', 'Agents']];
  function periods(mode, today) {
    const t = dayNo(today);
    if (mode === 'day') return Array.from({ length: 60 }, (_, i) => { const n = t - 59 + i; return { from: n, to: n, label: short(isoOf(n)), tick: short(isoOf(n)) }; });
    if (mode === 'week') {
      const monday = t - ((new Date(t * 86400000).getUTCDay() + 6) % 7);
      return Array.from({ length: 26 }, (_, i) => { const from = monday - (25 - i) * 7; return { from, to: from + 6, label: `${short(isoOf(from))} to ${short(isoOf(from + 6))}`, tick: short(isoOf(from)) }; });
    }
    const d = new Date(t * 86400000);
    return Array.from({ length: 12 }, (_, i) => {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (11 - i), 1));
      const from = dayNo(m.toISOString().slice(0, 10));
      const to = dayNo(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).toISOString().slice(0, 10));
      return { from, to, label: `${MON[m.getUTCMonth()]} ${m.getUTCFullYear()}`, tick: MON[m.getUTCMonth()] };
    });
  }
  function story(data) {
    const t = dayNo(data.today);
    const count = (list, from, to) => list.filter((d) => { const n = dayNo(Array.isArray(d) ? d[0] : d); return n > from && n <= to; }).length;
    const now = { inq: count(data.inquiries, t - 28, t), app: count(data.applications, t - 28, t) };
    const before = { inq: count(data.inquiries, t - 56, t - 28), app: count(data.applications, t - 56, t - 28) };
    const change = (a, b) => (b === 0 ? (a ? 'new' : 'flat') : Math.round(((a - b) / b) * 100));
    const say = (c) => (c === 'new' ? 'up from none' : c === 'flat' ? 'none either way' : c === 0 ? 'the same' : c > 0 ? `up ${c}%` : `down ${-c}%`);
    const lines = [`Last 4 weeks: ${now.inq} inquir${now.inq === 1 ? 'y' : 'ies'} (${say(change(now.inq, before.inq))} on the 4 weeks before) and ${now.app} application${now.app === 1 ? '' : 's'} submitted (${say(change(now.app, before.app))}).`];
    const ci = change(now.inq, before.inq); const ca = change(now.app, before.app);
    if (typeof ci === 'number' && typeof ca === 'number' && ci >= 20 && ca <= -10) lines.push('Inquiries are rising while applications are falling: the new inquiries are not yet turning into applications. Follow them up before the deadline.');
    else if (typeof ci === 'number' && typeof ca === 'number' && ci <= -20 && ca >= 0) lines.push('Applications are holding up while inquiries are falling: the pipeline will thin out in the weeks ahead unless marketing picks up.');
    const allInq = data.inquiries.length; const allApp = data.applications.length;
    if (allInq && allApp) { const r = Math.round(allInq / allApp); lines.push(r <= 1 ? 'In this intake, about as many applications as inquiries with a known day.' : `In this intake, about 1 application for every ${r} inquiries.`); }
    return lines;
  }
  function overTime(data) {
    const card = el('section', 'ov-card tr-card tr-stock');
    let mode = 'week';
    let source = '';
    const on = new Set(['inq', 'app', 'off']);
    const modeSw = segmented([['day', 'Days'], ['week', 'Weeks'], ['month', 'Months']], mode, (k) => { mode = k; draw(); });
    card.append(head('Ups and downs over time', `${data.intake ? data.intake.name : ''}, by the day each thing happened (a lead list’s own inquiry days). Tap a name to show or hide its line; a dashed line marks each event or campaign.`, modeSw));
    const words = el('div', 'tr-story');
    story(data).forEach((l, i) => words.append(el('p', i ? '' : 'tr-lead', l)));
    const keys = el('div', 'tr-legend tr-lines');
    const keyEls = LINES.map(([k, n, c, get]) => {
      const total = get(data).length;
      const b = el('button', `tr-key line${on.has(k) ? '' : ' off'}`); b.type = 'button';
      const dot = el('i'); dot.style.background = c;
      b.append(dot, el('span', '', n), el('small', '', fmt(total)));
      b.setAttribute('aria-pressed', String(on.has(k)));
      b.addEventListener('click', () => { if (on.has(k)) on.delete(k); else on.add(k); b.classList.toggle('off', !on.has(k)); b.setAttribute('aria-pressed', String(on.has(k))); draw(); });
      return b;
    });
    keys.append(...keyEls);
    const src = el('label', 'tr-source');
    const sel = el('select');
    SOURCES.forEach(([k, n]) => sel.append(new Option(k ? `Inquiries from ${n}` : 'Inquiries from every source', k)));
    sel.addEventListener('change', () => { source = sel.value; draw(); });
    src.append(sel);
    keys.append(src);
    const box = el('div', 'tr-chart');
    const note = el('p', 'ov-foot');
    if (data.undated) note.textContent = `${data.undated} student${data.undated === 1 ? ' has' : 's have'} no inquiry day (added before ISR kept it), so ${data.undated === 1 ? 'is' : 'are'} not on the inquiries line.`;
    function draw() {
      const ps = periods(mode, data.today);
      const at = (iso) => { const n = dayNo(iso); return ps.findIndex((p) => n >= p.from && n <= p.to); };
      const series = LINES.filter(([k]) => on.has(k)).map(([k, n, c, get]) => {
        const vals = ps.map(() => 0);
        const days = k === 'inq' ? data.inquiries.filter((x) => !source || x[1] === source).map((x) => x[0]) : get(data);
        days.forEach((d) => { const i = at(d); if (i >= 0) vals[i] += 1; });
        return { k, n, c, vals };
      });
      const W = 1000; const H = 330; const L = 40; const R = 16; const TOP = 30; const BOT = 290;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tr-svg', role: 'img', 'aria-label': 'Ups and downs over time' });
      const defs = svg('defs'); s.append(defs);
      const max = Math.max(4, ...series.flatMap((x) => x.vals));
      const xOfI = (i) => L + ((W - L - R) * (i + .5)) / ps.length;
      const yOf = (v) => BOT - ((BOT - TOP) * v) / max;
      [0, .25, .5, .75, 1].forEach((f) => { const y = BOT - (BOT - TOP) * f; s.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'tr-grid' })); const t = svg('text', { x: L - 8, y: y + 4, class: 'tr-axis', 'text-anchor': 'end' }); t.textContent = fmt(Math.round(max * f)); s.append(t); });
      const step = mode === 'day' ? 7 : mode === 'week' ? 2 : 1;
      ps.forEach((p, i) => { if (i % step === 0) { const t = svg('text', { x: xOfI(i), y: H - 12, class: 'tr-axis', 'text-anchor': 'middle' }); t.textContent = p.tick; s.append(t); } });
      // events and campaigns, and the day teaching starts
      const xOfDay = (iso) => { const i = at(iso); if (i < 0) return null; const p = ps[i]; return L + ((W - L - R) * (i + (dayNo(iso) - p.from + .5) / (p.to - p.from + 1))) / ps.length; };
      const marks = [...data.events.map((e) => ({ iso: e.date, label: e.name, kind: 'ev' })), ...(data.teachingStarts ? [{ iso: data.teachingStarts, label: 'Teaching starts', kind: 'start' }] : [])];
      marks.forEach((m, i) => {
        const x = xOfDay(m.iso); if (x === null) return;
        const g = svg('g', { class: `tr-mark ${m.kind}` });
        g.append(svg('line', { x1: x, x2: x, y1: TOP - 14, y2: BOT, class: 'tr-mark-line' }));
        const flag = svg('text', { x: x + 4, y: TOP - 16 + (i % 2) * 11, class: 'tr-mark-label' }); flag.textContent = m.label.length > 28 ? m.label.slice(0, 27) + '…' : m.label;
        g.append(flag);
        g.addEventListener('mousemove', (e) => showTip(e, m.label, [[m.kind === 'start' ? 'Teaching starts' : 'Started', short(m.iso), m.kind === 'start' ? '#1d1d1f' : '#ff9500']]));
        g.addEventListener('mouseleave', hideTip);
        s.append(g);
      });
      // each line: a soft area under it, the line drawing itself, and its peak
      series.forEach((x, j) => {
        const pts = x.vals.map((v, i) => [xOfI(i), yOf(v)]);
        const gid = `trg-${x.k}`;
        const grad = svg('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 });
        grad.append(svg('stop', { offset: '0%', 'stop-color': x.c, 'stop-opacity': .22 }), svg('stop', { offset: '100%', 'stop-color': x.c, 'stop-opacity': 0 }));
        defs.append(grad);
        s.append(svg('path', { d: `${smooth(pts)}L${pts[pts.length - 1][0]},${BOT}L${pts[0][0]},${BOT}Z`, fill: `url(#${gid})`, class: 'tr-area' }));
        const line = svg('path', { d: smooth(pts), stroke: x.c, class: 'tr-line draw' });
        line.style.setProperty('--d', `${j * 120}ms`);
        s.append(line);
        const peak = x.vals.reduce((b, v, i) => (v > x.vals[b] ? i : b), 0);
        if (x.vals[peak] > 0) {
          const g = svg('g', { class: 'tr-peak' });
          g.append(svg('circle', { cx: pts[peak][0], cy: pts[peak][1], r: 5, fill: '#fff', stroke: x.c, 'stroke-width': 2.5 }));
          const t = svg('text', { x: pts[peak][0], y: pts[peak][1] - 10, class: 'tr-peak-label', 'text-anchor': 'middle', fill: x.c }); t.textContent = `Peak ${fmt(x.vals[peak])}`;
          g.append(t);
          s.append(g);
        }
      });
      // the crosshair: every line's value on the day, week or month under the mouse
      const cross = svg('g', { class: 'tr-cross' });
      const vline = svg('line', { x1: 0, x2: 0, y1: TOP, y2: BOT, class: 'tr-cross-line' });
      const dots = series.map((x) => svg('circle', { r: 4.5, fill: x.c, stroke: '#fff', 'stroke-width': 2 }));
      cross.append(vline, ...dots);
      cross.style.display = 'none';
      s.append(cross);
      const hit = svg('rect', { x: L, y: TOP, width: W - L - R, height: BOT - TOP, class: 'tr-hit' });
      hit.addEventListener('mousemove', (e) => {
        const r = s.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(ps.length - 1, Math.floor(((x - L) / (W - L - R)) * ps.length)));
        cross.style.display = '';
        vline.setAttribute('x1', xOfI(i)); vline.setAttribute('x2', xOfI(i));
        series.forEach((sr, j) => { dots[j].setAttribute('cx', xOfI(i)); dots[j].setAttribute('cy', yOf(sr.vals[i])); });
        const ran = data.events.filter((ev) => dayNo(ev.date) >= ps[i].from && dayNo(ev.date) <= ps[i].to);
        showTip(e, ps[i].label, [...series.map((sr) => [sr.n, fmt(sr.vals[i]), sr.c]), ...ran.map((ev) => [`Started: ${ev.name}`, short(ev.date), '#ff9500'])]);
      });
      hit.addEventListener('mouseleave', () => { cross.style.display = 'none'; hideTip(); });
      s.append(hit);
      if (!series.length) { const t = svg('text', { x: W / 2, y: (TOP + BOT) / 2, class: 'tr-axis', 'text-anchor': 'middle' }); t.textContent = 'Tap a name above to show its line.'; s.append(t); }
      box.replaceChildren(s);
    }
    draw();
    card.append(words, keys, box, note);
    return card;
  }

  // ---- 3. where students are from ----
  function map(data) {
    const M = root.NepalMap;
    const card = el('section', 'ov-card tr-card');
    card.append(head('Where students are from', `${data.intake ? data.intake.name : ''}: the district of the address in each student’s passport, a dot for each district, bigger where more students come from.`));
    const body = el('div', 'tr-map-body');
    const mapBox = el('div', 'tr-map');
    const side = el('div', 'tr-map-side');
    body.append(mapBox, side);
    const counts = data.places.home || {};
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = list.reduce((n, [, c]) => n + c, 0);
    const s = svg('svg', { viewBox: `0 0 ${M.width} ${M.height}`, class: 'tr-nepal', role: 'img', 'aria-label': 'Map of Nepal with where the students are from' });
    M.shapes.forEach((d) => s.append(svg('path', { d: d.d, class: 'tr-district' })));
    const max = Math.max(1, ...list.map(([, c]) => c));
    list.slice().reverse().forEach(([district, c], i) => {
      const p = M.pointOf(district); if (!p) return;
      const r = 6 + 22 * Math.sqrt(c / max);
      const g = svg('g', { class: 'tr-dot' + (c === max ? ' top' : '') });
      g.style.setProperty('--d', `${(list.length - i) * 40}ms`);
      g.append(svg('circle', { cx: p.x, cy: p.y, r, class: 'tr-dot-halo' }), svg('circle', { cx: p.x, cy: p.y, r: Math.max(4, r * .45), class: 'tr-dot-core' }));
      g.addEventListener('mousemove', (e) => showTip(e, district, [['Students', c, '#ff3b30'], ['Share', `${Math.round((c / total) * 100)}%`, '']]));
      g.addEventListener('mouseleave', hideTip);
      s.append(g);
    });
    mapBox.append(s);
    if (!total) side.append(el('p', 'p-muted', 'No address from a passport yet. Add it when a student is added, or with Edit details on the student card.'));
    else {
      side.append(el('h3', '', `Top districts (${total} student${total === 1 ? '' : 's'})`));
      const ol = el('ol', 'tr-top');
      list.slice(0, 8).forEach(([district, c]) => { const li = el('li'); const bar = el('i'); bar.style.width = `${Math.max(4, (c / max) * 100)}%`; li.append(el('span', '', district), el('b', '', String(c)), bar); ol.append(li); });
      side.append(ol);
    }
    // Students from outside Nepal, by nationality (from the passport).
    const abroad = Object.entries(data.abroad || {}).sort((a, b) => b[1] - a[1]);
    if (abroad.length) {
      side.append(el('h3', 'tr-age-title', `From outside Nepal (${abroad.reduce((n, [, c]) => n + c, 0)})`));
      const ol = el('ol', 'tr-top abroad');
      const am = Math.max(...abroad.map(([, c]) => c));
      abroad.forEach(([k, c]) => { const li = el('li'); const bar = el('i'); bar.style.width = `${Math.max(4, (c / am) * 100)}%`; li.append(el('span', '', k), el('b', '', String(c)), bar); ol.append(li); });
      side.append(ol);
    }
    const ages = Object.entries(data.ages).filter(([, c]) => c);
    if (ages.length) {
      side.append(el('h3', 'tr-age-title', 'Age groups'));
      const am = Math.max(...ages.map(([, c]) => c));
      const ol = el('ol', 'tr-top ages');
      Object.entries(data.ages).forEach(([k, c]) => { const li = el('li'); const bar = el('i'); bar.style.width = `${c ? Math.max(4, (c / am) * 100) : 0}%`; li.append(el('span', '', k), el('b', '', String(c)), bar); ol.append(li); });
      side.append(ol);
    }
    const foot = el('p', 'ov-foot');
    if (data.places.none) foot.textContent = `${data.places.none} student${data.places.none === 1 ? ' has' : 's have'} no passport address yet.`;
    card.append(body, foot);
    return card;
  }

  root.DashboardTrends = { growth, overTime, map };
})(this);

// The dashboard page (dashboard.html): fetches the totals from /api/dashboard and draws them.
// Names and labels come from student records, so they are only ever put in with textContent.
(function () {
  const $ = (id) => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  const REFRESH_MS = 30000;
  const SERIES_COLOR = { applications: 'var(--s1)', payments: 'var(--s2)', visas: 'var(--s3)' };
  let data = null;
  let selected = decodeURIComponent(location.hash.slice(1)); // empty: the newest intake
  const hiddenSeries = new Set(); // lines switched off in the legend (colours stay with their line)
  const asTable = new Set(); // charts shown as a table instead

  // ---- small helpers ----
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function svg(tag, attrs = {}) {
    const e = document.createElementNS(SVG, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  }
  const num = (v) => Number(v).toLocaleString();
  const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(v));
  const pct = (v, total) => (total ? `${Math.round((v / total) * 1000) / 10}%` : '0%');

  // ---- the hover readout ----
  const tip = $('tip');
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
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  // A mark that shows `content()` ({ title, rows }) when hovered or focused.
  function hover(node, content) {
    node.addEventListener('pointermove', (e) => { const c = content(); showTip(e.clientX + 14, e.clientY + 14, c.title, c.rows); });
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', () => { const r = node.getBoundingClientRect(); const c = content(); showTip(r.left + 40, r.bottom + 4, c.title, c.rows); });
    node.addEventListener('blur', hideTip);
  }

  // ---- horizontal bars ----
  // rows: [{ label, value, text, small, quiet, tip: { title, rows } }]; scale: the value that fills the track.
  function bars(container, rows, scale) {
    const list = el('div', 'bars');
    rows.forEach((r) => {
      if (r.group) { list.append(el('div', 'group-title', r.group)); return; }
      const row = el('div', 'bar-row');
      row.tabIndex = 0;
      row.setAttribute('aria-label', `${r.label}: ${r.text}${r.small ? ' ' + r.small : ''}`);
      const track = el('span', 'bar-track');
      const bar = el('span', r.quiet ? 'bar quiet' : 'bar');
      bar.style.width = `${Math.max(0, Math.min(1, scale ? r.value / scale : 0)) * 82}%`;
      const value = el('span', 'bar-value', r.text);
      if (r.small) value.append(' ', el('small', '', r.small));
      track.append(bar, value);
      row.append(el('span', 'bar-label', r.label), track);
      hover(row, () => r.tip);
      list.append(row);
    });
    container.append(list);
  }

  function table(container, headers, rows, plain = false) {
    const wrap = el('div', 'scroll-x');
    const t = el('table', 'data');
    const head = el('tr');
    headers.forEach((h, i) => head.append(el('th', i && !plain ? 'num' : '', h)));
    const thead = el('thead');
    thead.append(head);
    t.append(thead);
    const body = el('tbody');
    rows.forEach((r) => {
      const tr = el('tr');
      r.forEach((cell, i) => tr.append(el('td', i && !plain ? 'num' : '', cell)));
      body.append(tr);
    });
    t.append(body);
    wrap.append(t);
    container.append(wrap);
  }

  const empty = (container, text) => container.append(el('p', 'empty', text));

  // ---- the headline numbers ----
  const rate = (v) => (v === null || v === undefined ? 'n/a' : `${v}%`);
  function tiles(container, list) {
    container.replaceChildren(...list.map(([label, value, sub]) => {
      const t = el('div', 'kpi');
      t.append(el('span', 'kpi-label', label), el('span', 'kpi-value', value), el('span', 'kpi-sub', sub));
      return t;
    }));
  }

  function renderKpis(d) {
    const k = d.kpis;
    $('heroValue').textContent = num(k.students);
    $('heroSub').textContent = (d.intakes.find((i) => i.id === d.selected) || {}).name || '';
    tiles($('kpis'), [
      ['Applications submitted', num(k.applicationsSubmitted), `${pct(k.applicationsSubmitted, k.students)} of students`],
      ['Offers received', num(k.offersReceived), `${pct(k.offersReceived, k.students)} of students`],
      ['Mock interviews held', num(k.mocksHeld), `${num(k.mockInterviews)} interviews in total`],
      ['Payments made', num(k.paymentsMade), d.paidInFull || d.partlyPaid ? `${num(d.paidInFull)} in full, ${num(d.partlyPaid)} part paid` : `${pct(k.paymentsMade, k.students)} of students paid`],
      ['Visas issued', num(k.visaIssued), `${k.conversionRate}% of students`],
    ]);
    tiles($('kpis2'), [
      ['Visa success', rate(k.visaSuccessRate), 'visas issued out of visas decided'],
    ]);
  }

  function renderAttention(d) {
    const c = $('attention');
    c.replaceChildren();
    if (!d.attention.length) {
      const a = el('div', 'alert ok');
      a.append(el('span', 'icon', '✓'), el('span', '', 'Nothing needs attention right now.'));
      c.append(a);
      return;
    }
    const list = el('div', 'alerts');
    d.attention.forEach((x) => {
      const a = el('div', 'alert');
      a.append(el('span', 'icon', '⚠'), el('b', '', num(x.count)), el('span', '', x.text));
      list.append(a);
    });
    c.append(list);
    if (d.chase.length) {
      c.append(el('div', 'group-title', 'Longest waiting'));
      table(c, ['Student', 'Waiting', 'Stage', 'What is missing'], d.chase.map((x) => [x.name, x.days ? `${x.days} days` : '', x.stage, x.reason]), true);
    }
  }

  // ---- how long each step takes ----
  function renderSpeed(d) {
    const c = $('speed');
    c.replaceChildren();
    const rows = d.speed.map((s) => [
      s.label,
      s.samples >= 3 ? `${Math.round(s.median)} days` : 'not enough dates yet',
      num(s.samples),
    ]);
    table(c, ['Step', 'Typical time', 'Students counted'], rows);
    c.append(el('p', 'method', 'Typical time is the middle value, so one very slow student does not distort it. Only students with both dates entered are counted.'));
  }

  // ---- stages and milestones ----
  function renderStages(d) {
    const c = $('chartStages');
    c.replaceChildren();
    const total = d.kpis.students;
    const all = [...d.stages, ...d.left];
    if (!total) { empty(c, 'No students yet.'); return; }
    const scale = Math.max(1, ...all.map((s) => s.count));
    const row = (s, quiet) => ({
      label: s.label, value: s.count, text: num(s.count), quiet,
      tip: { title: s.label, rows: [{ name: 'Students', value: num(s.count) }, { name: 'Share of all students', value: pct(s.count, total) }] },
    });
    if (asTable.has('stages')) {
      table(c, ['Stage', 'Students', 'Share'], all.map((s) => [s.label, num(s.count), pct(s.count, total)]));
      return;
    }
    bars(c, [...d.stages.map((s) => row(s, false)), { group: 'Not moving forward' }, ...d.left.map((s) => row(s, true))], scale);
  }

  function renderMilestones(d) {
    const c = $('chartMilestones');
    c.replaceChildren();
    if (!d.kpis.students) { empty(c, 'No students yet.'); return; }
    if (asTable.has('milestones')) {
      table(c, ['Step', 'Students', 'Share of all', 'Of the step before'], d.milestones.map((m) => [m.label, num(m.count), `${m.percent}%`, `${m.fromPrevious}%`]));
      return;
    }
    bars(c, d.milestones.map((m, i) => ({
      label: m.label, value: m.percent, text: num(m.count), small: i ? `${m.fromPrevious}% of the step before` : '',
      tip: { title: m.label, rows: [{ name: 'Students', value: num(m.count) }, { name: 'Share of all students', value: `${m.percent}%` }, { name: 'Of the step before', value: `${m.fromPrevious}%` }] },
    })), 100);
  }

  // ---- sources, partners, universities ----
  function renderGroups(id, key, headerName, list) {
    const c = $(id);
    c.replaceChildren();
    if (!list.length || !data.kpis.students) { empty(c, 'Nothing recorded yet.'); return; }
    const total = data.kpis.students;
    const visaRate = (g) => (g.count ? `${Math.round((g.visas / g.count) * 1000) / 10}%` : '0%');
    if (asTable.has(key)) {
      table(c, [headerName, 'Students', 'Paid', 'Visas', 'Visa rate'], list.map((g) => [g.label, num(g.count), num(g.paid), num(g.visas), visaRate(g)]));
      return;
    }
    const scale = Math.max(1, ...list.map((g) => g.count));
    bars(c, list.map((g) => ({
      label: g.label, value: g.count, text: num(g.count), small: `${g.paid} paid, ${g.visas} visa${g.visas === 1 ? '' : 's'}`, quiet: Boolean(g.other),
      tip: { title: g.label, rows: [
        { name: 'Students', value: num(g.count) }, { name: 'Share of all students', value: pct(g.count, total) },
        { name: 'Paid', value: num(g.paid) }, { name: 'Visas issued', value: num(g.visas) }, { name: 'Visa rate', value: visaRate(g) },
      ] },
    })), scale);
  }

  // What was filled in by the dashboard and what is missing, in plain words, so nothing looks hidden.
  function renderNotes(d) {
    const q = d.quality;
    const parts = [];
    if (q.filledFromStage) parts.push(`${num(q.filledFromStage)} student${q.filledFromStage === 1 ? ' is' : 's are'} counted at earlier steps because of their current stage (for example, a student at Visa Issued has applied, had an offer and paid), even where those dates were never typed in.`);
    const undated = [];
    if (q.applicationsWithoutDate) undated.push(`${num(q.applicationsWithoutDate)} applications`);
    if (q.paymentsWithoutDate) undated.push(`${num(q.paymentsWithoutDate)} payments`);
    if (q.visasWithoutDate) undated.push(`${num(q.visasWithoutDate)} visas`);
    if (undated.length) parts.push(`${undated.join(', ')} have no date entered, so they are in the totals but not on the month charts or the timing figures.`);
    $('notes').textContent = parts.length ? 'About these numbers: ' + parts.join(' ') : '';
  }

  // ---- the month by month line chart ----
  const niceTop = (max) => {
    const steps = [1, 2, 5];
    let mag = 1;
    for (;;) {
      for (const s of steps) {
        const step = s * mag;
        if (max / step <= 5) return { step, top: Math.ceil(max / step) * step };
      }
      mag *= 10;
    }
  };
  const monthName = (ym, withYear) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, withYear ? { month: 'short', year: 'numeric' } : { month: 'short' });
  };

  function renderMonthly(d) {
    const legend = $('legend');
    const c = $('chartMonthly');
    legend.replaceChildren();
    c.replaceChildren();
    const m = d.monthly;
    m.series.forEach((s) => {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!hiddenSeries.has(s.key)));
      b.style.setProperty('--c', SERIES_COLOR[s.key]);
      b.append(el('span', 'key'), document.createTextNode(s.label));
      b.addEventListener('click', () => { hiddenSeries.has(s.key) ? hiddenSeries.delete(s.key) : hiddenSeries.add(s.key); renderMonthly(data); });
      legend.append(b);
    });
    if (asTable.has('monthly')) {
      legend.replaceChildren();
      table(c, ['Month', ...m.series.map((s) => s.label)], m.months.map((mo, i) => [monthName(mo, true), ...m.series.map((s) => num(s.values[i]))]));
      return;
    }
    if (!m.series.some((s) => s.values.some((v) => v > 0))) { empty(c, 'No dates have been entered in the last 12 months yet.'); return; }

    const visible = m.series.filter((s) => !hiddenSeries.has(s.key));
    const W = Math.max(300, c.clientWidth);
    const H = 300;
    const pad = { l: 42, r: 18, t: 12, b: 30 };
    const { step, top } = niceTop(Math.max(1, ...(visible.length ? visible : m.series).flatMap((s) => s.values)));
    const x = (i) => pad.l + (i * (W - pad.l - pad.r)) / (m.months.length - 1);
    const y = (v) => H - pad.b - (v / top) * (H - pad.t - pad.b);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Line chart of applications, payments and visas by month. A table view is available.' });

    for (let v = 0; v <= top; v += step) {
      root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: v === 0 ? 'baseline' : 'gridline' }));
      const t = svg('text', { x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end' });
      t.textContent = compact(v);
      root.append(t);
    }
    const every = W < 560 ? 2 : 1;
    m.months.forEach((mo, i) => {
      if (i % every) return;
      const t = svg('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' });
      t.textContent = monthName(mo, i === 0 || mo.endsWith('-01'));
      root.append(t);
    });

    visible.forEach((s) => {
      const path = svg('path', { d: s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' '), fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      path.style.stroke = SERIES_COLOR[s.key];
      root.append(path);
    });
    // Dots: the last month always, and the hovered month for every line.
    const dot = (cx, cy, key) => {
      const g = svg('circle', { cx, cy, r: 4, 'stroke-width': 2 });
      g.style.fill = SERIES_COLOR[key];
      g.style.stroke = 'var(--surface)';
      return g;
    };
    const last = m.months.length - 1;
    visible.forEach((s) => root.append(dot(x(last), y(s.values[last]), s.key)));
    const cross = svg('line', { y1: pad.t, y2: H - pad.b, class: 'crosshair' });
    cross.style.display = 'none';
    const hoverGroup = svg('g');
    root.append(cross, hoverGroup);

    const at = (i) => {
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.style.display = '';
      hoverGroup.replaceChildren(...visible.map((s) => dot(x(i), y(s.values[i]), s.key)));
    };
    const clear = () => { cross.style.display = 'none'; hoverGroup.replaceChildren(); hideTip(); };
    const readout = (i, px, py) => showTip(px, py, monthName(m.months[i], true), visible.map((s) => ({ name: s.label, value: num(s.values[i]), color: SERIES_COLOR[s.key] })));
    const hit = svg('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' });
    hit.addEventListener('pointermove', (e) => {
      const box = root.getBoundingClientRect();
      const i = Math.max(0, Math.min(last, Math.round(((e.clientX - box.left) * (W / box.width) - pad.l) / ((W - pad.l - pad.r) / last))));
      at(i);
      readout(i, e.clientX + 14, e.clientY + 14);
    });
    hit.addEventListener('pointerleave', clear);
    root.append(hit);
    c.append(root);

    // Keyboard: focus the chart, then the arrow keys step through the months.
    c.tabIndex = 0;
    let kb = last;
    c.onkeydown = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      kb = Math.max(0, Math.min(last, kb + (e.key === 'ArrowRight' ? 1 : -1)));
      at(kb);
      const box = root.getBoundingClientRect();
      readout(kb, box.left + x(kb) * (box.width / W) + 14, box.top + 40);
    };
    c.onblur = clear;
  }

  // ---- everything ----
  function render() {
    const d0 = data;
    renderKpis(d0);
    renderAttention(d0);
    renderStages(d0);
    renderMilestones(d0);
    renderSpeed(d0);
    renderMonthly(d0);
    renderGroups('chartSources', 'sources', 'Source', d0.sources);
    renderGroups('chartPartners', 'partners', 'Partner', d0.partners);
    renderGroups('chartUniversities', 'universities', 'University', d0.universities);
    renderGroups('chartCourses', 'courses', 'Course', d0.courses);
    renderNotes(d0);
    document.querySelectorAll('.toggle').forEach((b) => b.setAttribute('aria-pressed', String(asTable.has(b.dataset.table))));
  }

  function fillIntakes(d0) {
    const sel = $('intake');
    sel.length = 0;
    d0.intakes.forEach((i) => sel.add(new Option(i.name, i.id)));
    sel.value = d0.selected;
  }

  async function load() {
    const page = $('page');
    page.classList.add('loading');
    try {
      const res = await fetch('/api/dashboard?intake=' + encodeURIComponent(selected), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
      selected = data.selected;
      fillIntakes(data);
      render();
      $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      $('updated').textContent = data ? 'Could not refresh. Showing the last numbers.' : 'Could not load the dashboard.';
    } finally {
      page.classList.remove('loading');
    }
  }

  $('intake').addEventListener('change', () => {
    selected = $('intake').value;
    try { history.replaceState(null, '', '#' + encodeURIComponent(selected)); } catch (e) { /* not important */ }
    load();
  });
  document.querySelectorAll('.toggle').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.table;
    asTable.has(id) ? asTable.delete(id) : asTable.add(id);
    if (data) render();
  }));
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (data && !asTable.has('monthly')) renderMonthly(data); }, 150); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
  load();
})();

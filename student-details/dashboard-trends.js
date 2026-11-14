// The Dashboard's two deeper cards (the owner, 14 Nov 2026), drawn from /api/trends:
//   1. "Inquiries and applications over time": inquiries by week or month on the day the student really enquired (a lead list's own
//      dates, not the day it was uploaded), split by where they came from, with the applications and offers of the same weeks
//      below them like the volume under a stock chart, and every event or campaign marked where it ran, so a rise can be read: was it
//      the ads, an event, or did it come by itself, and did the applications follow. A few plain sentences say what the chart shows.
//   2. "Where the students live": Nepal, district by district, with a dot for every place students live now (or their home district),
//      bigger where there are more, and the top districts beside it; and the age groups of the students whose birthday is known.
// Every name and label comes from records, so it is only ever put in with textContent.
(function (root) {
  const { el } = root.Portal;
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v))); return e; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const GROUPS = [
    ['social', 'Social Media', '#0071e3'], ['events', 'Events and marketing', '#ff9500'], ['organic', 'Came by itself (Visitor, Reference, classes)', '#34c759'],
    ['branch', 'Branches', '#af52de'], ['agent', 'Agents and partners', '#30b0c7'], ['unknown', 'Source not recorded', '#c7c7cc'],
  ];
  const COLOR = Object.fromEntries(GROUPS.map(([k, , c]) => [k, c]));
  const NAME = Object.fromEntries(GROUPS.map(([k, n]) => [k, n]));
  const dayNo = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
  const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const short = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]}`; };

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

  // ---- 1. over time ----
  // The buckets: weeks (Monday to Sunday) or calendar months, the last 26 weeks or 12 months up to today.
  function buckets(mode, today) {
    const t = dayNo(today);
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
  function fill(bs, data) {
    const at = (iso) => { const n = dayNo(iso); return bs.findIndex((b) => n >= b.from && n <= b.to); };
    bs.forEach((b) => { b.inq = Object.fromEntries(GROUPS.map(([k]) => [k, 0])); b.total = 0; b.apps = 0; b.offers = 0; b.events = []; });
    data.inquiries.forEach(([d, g]) => { const i = at(d); if (i >= 0) { bs[i].inq[g in bs[i].inq ? g : 'unknown'] += 1; bs[i].total += 1; } });
    data.applications.forEach((d) => { const i = at(d); if (i >= 0) bs[i].apps += 1; });
    data.offers.forEach((d) => { const i = at(d); if (i >= 0) bs[i].offers += 1; });
    data.events.forEach((ev) => { const i = at(ev.date); if (i >= 0) bs[i].events.push(ev); });
    return bs;
  }
  // What the chart says, in plain words: the last 4 weeks against the 4 before, how many inquiries an application takes, the busiest
  // week and what was running then.
  function story(data) {
    const t = dayNo(data.today);
    const count = (list, from, to) => list.filter((d) => { const n = dayNo(Array.isArray(d) ? d[0] : d); return n > from && n <= to; }).length;
    const now = { inq: count(data.inquiries, t - 28, t), app: count(data.applications, t - 28, t) };
    const before = { inq: count(data.inquiries, t - 56, t - 28), app: count(data.applications, t - 56, t - 28) };
    const change = (a, b) => (b === 0 ? (a ? 'new' : 'flat') : Math.round(((a - b) / b) * 100));
    const say = (c) => (c === 'new' ? 'up from none' : c === 'flat' ? 'none either way' : c === 0 ? 'the same' : c > 0 ? `up ${c}%` : `down ${-c}%`);
    const lines = [];
    lines.push(`Last 4 weeks: ${now.inq} inquir${now.inq === 1 ? 'y' : 'ies'} (${say(change(now.inq, before.inq))} on the 4 weeks before) and ${now.app} application${now.app === 1 ? '' : 's'} submitted (${say(change(now.app, before.app))}).`);
    const ci = change(now.inq, before.inq); const ca = change(now.app, before.app);
    if (typeof ci === 'number' && typeof ca === 'number' && ci >= 20 && ca <= -10) lines.push('Inquiries are rising while applications are falling: the new inquiries are not yet turning into applications. Follow them up before the deadline.');
    else if (typeof ci === 'number' && typeof ca === 'number' && ci <= -20 && ca >= 0) lines.push('Applications are holding up while inquiries are falling: the pipeline will thin out in the weeks ahead unless marketing picks up.');
    const allInq = data.inquiries.length; const allApp = data.applications.length;
    if (allInq && allApp) { const r = Math.round(allInq / allApp); lines.push(r <= 1 ? 'In this intake, about as many applications as inquiries with a known day.' : `In this intake, about 1 application for every ${r} inquiries.`); }
    return lines;
  }
  function overTime(data) {
    const card = el('section', 'ov-card tr-card');
    const head = el('div', 'tr-head');
    const titles = el('div');
    titles.append(el('h2', '', 'Inquiries and applications over time'), el('p', 'ov-sub', `${data.intake ? data.intake.name : ''}: inquiries on the day each student enquired, by where they came from, with the applications and offers of the same weeks below. A dashed line marks each event or campaign.`));
    let mode = 'week';
    const sw = el('div', 'dd-switch tr-switch');
    const modes = [['week', 'Weeks'], ['month', 'Months']].map(([k, t]) => { const b = el('button', k === mode ? 'on' : '', t); b.type = 'button'; b.addEventListener('click', () => { mode = k; modes.forEach((x) => x.classList.toggle('on', x === b)); draw(); }); return b; });
    sw.append(...modes);
    head.append(titles, sw);
    const words = el('div', 'tr-story');
    story(data).forEach((l, i) => words.append(el('p', i ? '' : 'tr-lead', l)));
    const legend = el('div', 'tr-legend');
    const hidden = new Set();
    GROUPS.forEach(([k, n, c]) => {
      if (!data.inquiries.some(([, g]) => g === k)) return;
      const b = el('button', 'tr-key'); b.type = 'button';
      const dot = el('i'); dot.style.background = c;
      b.append(dot, el('span', '', n));
      b.addEventListener('click', () => { if (hidden.has(k)) hidden.delete(k); else hidden.add(k); b.classList.toggle('off', hidden.has(k)); draw(); });
      legend.append(b);
    });
    const app = el('span', 'tr-key static'); app.append(el('i', 'line'), el('span', '', 'Applications submitted'));
    const off = el('span', 'tr-key static'); off.append(el('i', 'line offer'), el('span', '', 'Offers received'));
    legend.append(app, off);
    const box = el('div', 'tr-chart');
    const note = el('p', 'ov-foot');
    if (data.undated) note.textContent = `${data.undated} student${data.undated === 1 ? ' has' : 's have'} no inquiry day (added before ISR kept it), so ${data.undated === 1 ? 'is' : 'are'} not in the inquiry bars.`;
    function draw() {
      const bs = fill(buckets(mode, data.today), data);
      const W = 1000; const H = 340; const L = 40; const R = 12; const TOP = 26; const MID = 220; const BOT = 312;
      const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'tr-svg', role: 'img', 'aria-label': 'Inquiries and applications over time' });
      const bw = (W - L - R) / bs.length;
      const maxI = Math.max(4, ...bs.map((b) => GROUPS.reduce((n, [k]) => n + (hidden.has(k) ? 0 : b.inq[k]), 0)));
      const maxA = Math.max(2, ...bs.map((b) => Math.max(b.apps, b.offers)));
      // grid lines and the scale
      [0, .5, 1].forEach((f) => {
        const y = MID - (MID - TOP) * f;
        s.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'tr-grid' }));
        const t = svg('text', { x: L - 8, y: y + 4, class: 'tr-axis', 'text-anchor': 'end' }); t.textContent = String(Math.round(maxI * f)); s.append(t);
      });
      s.append(svg('line', { x1: L, x2: W - R, y1: BOT, y2: BOT, class: 'tr-grid' }));
      { const t = svg('text', { x: L - 8, y: MID + 22, class: 'tr-axis', 'text-anchor': 'end' }); t.textContent = String(maxA); s.append(t); }
      // event and campaign markers, and the day teaching starts
      const xOf = (iso) => { const n = dayNo(iso); const i = bs.findIndex((b) => n >= b.from && n <= b.to); if (i < 0) return null; const b = bs[i]; return L + bw * i + bw * ((n - b.from + .5) / (b.to - b.from + 1)); };
      const marks = [...data.events.map((e) => ({ iso: e.date, label: e.name, kind: 'ev' })), ...(data.teachingStarts ? [{ iso: data.teachingStarts, label: 'Teaching starts', kind: 'start' }] : [])];
      marks.forEach((m, i) => {
        const x = xOf(m.iso); if (x === null) return;
        const g = svg('g', { class: `tr-mark ${m.kind}` });
        g.append(svg('line', { x1: x, x2: x, y1: TOP - 10, y2: BOT, class: 'tr-mark-line' }));
        const flag = svg('text', { x: x + 4, y: TOP - 12 + (i % 2) * 12, class: 'tr-mark-label' }); flag.textContent = m.label.length > 28 ? m.label.slice(0, 27) + '…' : m.label;
        g.append(flag);
        g.addEventListener('mousemove', (e) => showTip(e, m.label, [[m.kind === 'start' ? 'Teaching starts' : 'Ran from', short(m.iso), m.kind === 'start' ? '#1d1d1f' : '#ff9500']]));
        g.addEventListener('mouseleave', hideTip);
        s.append(g);
      });
      // the bars: inquiries stacked by source (top), applications and offers side by side (bottom)
      bs.forEach((b, i) => {
        const x = L + bw * i;
        let y = MID;
        const g = svg('g', { class: 'tr-col' });
        g.style.setProperty('--d', `${i * 18}ms`);
        GROUPS.forEach(([k]) => {
          if (hidden.has(k) || !b.inq[k]) return;
          const h = ((MID - TOP) * b.inq[k]) / maxI;
          y -= h;
          g.append(svg('rect', { x: x + bw * .16, y, width: bw * .68, height: Math.max(h - 1, .5), rx: 3, fill: COLOR[k], class: 'tr-bar' }));
        });
        const ah = ((BOT - MID - 24) * b.apps) / maxA; const oh = ((BOT - MID - 24) * b.offers) / maxA;
        if (b.apps) g.append(svg('rect', { x: x + bw * .2, y: BOT - ah, width: bw * .28, height: ah, rx: 2, class: 'tr-app' }));
        if (b.offers) g.append(svg('rect', { x: x + bw * .52, y: BOT - oh, width: bw * .28, height: oh, rx: 2, class: 'tr-offer' }));
        // the whole column takes the hover
        const hit = svg('rect', { x, y: TOP - 4, width: bw, height: BOT - TOP + 4, class: 'tr-hit' });
        hit.addEventListener('mousemove', (e) => {
          const rows = GROUPS.filter(([k]) => b.inq[k] && !hidden.has(k)).map(([k]) => [NAME[k], b.inq[k], COLOR[k]]);
          rows.push(['Applications submitted', b.apps, '#1d1d1f'], ['Offers received', b.offers, '#86868b']);
          b.events.forEach((ev) => rows.push([`Ran: ${ev.name}`, short(ev.date), '#ff9500']));
          showTip(e, `${b.label}: ${b.total} inquir${b.total === 1 ? 'y' : 'ies'}`, rows);
          g.classList.add('hot');
        });
        hit.addEventListener('mouseleave', () => { hideTip(); g.classList.remove('hot'); });
        g.append(hit);
        s.append(g);
        if (mode === 'month' || i % 2 === 0) { const t = svg('text', { x: x + bw / 2, y: H - 6, class: 'tr-axis', 'text-anchor': 'middle' }); t.textContent = b.tick; s.append(t); }
      });
      const lab1 = svg('text', { x: L, y: TOP - 14, class: 'tr-axis strong' }); lab1.textContent = 'Inquiries';
      const lab2 = svg('text', { x: L, y: MID + 14, class: 'tr-axis strong' }); lab2.textContent = 'Applications and offers';
      s.append(lab1, lab2);
      box.replaceChildren(s);
    }
    draw();
    card.append(head, words, legend, box, note);
    return card;
  }

  // ---- 2. where the students live ----
  function map(data) {
    const M = root.NepalMap;
    const card = el('section', 'ov-card tr-card');
    const head = el('div', 'tr-head');
    const titles = el('div');
    titles.append(el('h2', '', 'Where the students live'), el('p', 'ov-sub', `${data.intake ? data.intake.name : ''}: a dot for each district, bigger where more students live. "Now" is where they live today (asked at the first inquiry); "Home" is their permanent district, from the passport.`));
    let which = 'lives';
    const sw = el('div', 'dd-switch tr-switch');
    const opts = [['lives', 'Now'], ['home', 'Home']].map(([k, t]) => { const b = el('button', k === which ? 'on' : '', t); b.type = 'button'; b.addEventListener('click', () => { which = k; opts.forEach((x) => x.classList.toggle('on', x === b)); draw(); }); return b; });
    sw.append(...opts);
    head.append(titles, sw);
    const body = el('div', 'tr-map-body');
    const mapBox = el('div', 'tr-map');
    const side = el('div', 'tr-map-side');
    body.append(mapBox, side);
    const foot = el('p', 'ov-foot');
    function draw() {
      const counts = which === 'lives' ? data.places.lives : data.places.home;
      const list = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const total = list.reduce((n, [, c]) => n + c, 0);
      const s = svg('svg', { viewBox: `0 0 ${M.width} ${M.height}`, class: 'tr-nepal', role: 'img', 'aria-label': 'Map of Nepal with where the students live' });
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
      mapBox.replaceChildren(s);
      side.replaceChildren();
      if (!total) side.append(el('p', 'p-muted', which === 'lives' ? 'No district recorded yet. Add it when a student is added, or on the student card (Personal details).' : 'No home district recorded yet. Add it from the passport on the student card (Personal details).'));
      else {
        side.append(el('h3', '', `Top districts (${total} student${total === 1 ? '' : 's'})`));
        const ol = el('ol', 'tr-top');
        list.slice(0, 8).forEach(([district, c]) => { const li = el('li'); const bar = el('i'); bar.style.width = `${Math.max(4, (c / max) * 100)}%`; li.append(el('span', '', district), el('b', '', String(c)), bar); ol.append(li); });
        side.append(ol);
      }
      // the age groups, when birthdays are known
      const ages = Object.entries(data.ages).filter(([, c]) => c);
      if (ages.length) {
        side.append(el('h3', 'tr-age-title', 'Age groups'));
        const am = Math.max(...ages.map(([, c]) => c));
        const ol = el('ol', 'tr-top ages');
        Object.entries(data.ages).forEach(([k, c]) => { const li = el('li'); const bar = el('i'); bar.style.width = `${c ? Math.max(4, (c / am) * 100) : 0}%`; li.append(el('span', '', k), el('b', '', String(c)), bar); ol.append(li); });
        side.append(ol);
      }
      foot.textContent = data.places.none ? `${data.places.none} student${data.places.none === 1 ? ' has' : 's have'} no district yet.` : '';
    }
    draw();
    card.append(head, body, foot);
    return card;
  }

  root.DashboardTrends = { overTime, map };
})(this);

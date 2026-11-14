// My dashboard: each team's own page (Application, Mock, Follow-up, a branch). How the team's work is going, in the team's own
// words: four figures, this week against last week, where its students are, what is coming up in the next 7 days, the good news
// of the last 30 days and the team's tasks. Admin and the Manager have the full Dashboard instead.
(function () {
  const { el, h, api, initials } = window.Portal;
  const view = document.getElementById('view');
  const shortDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const num = (n) => Number(n || 0).toLocaleString('en-GB');

  function card(title, sub, cls = '') {
    const c = el('section', `md-card ${cls}`.trim());
    const head = el('header', 'md-card-head');
    head.append(el('h2', '', title));
    if (sub) head.append(el('p', '', sub));
    c.append(head);
    return c;
  }

  // This week against the week before: the figure, and a calm word on the change (never red: a quieter week is not a failure).
  function weekCard(week) {
    const c = card('This week', 'The last 7 days, next to the 7 days before.');
    const grid = el('div', 'md-week');
    week.forEach((w) => {
      const box = el('div', 'md-week-item');
      const diff = w.now - w.before;
      const trend = diff > 0 ? `${diff} more than last week` : diff < 0 ? `${-diff} fewer than last week` : (w.now ? 'The same as last week' : 'None yet this week');
      box.append(el('b', '', num(w.now)), el('span', 'md-week-label', w.label), el('small', `md-trend ${diff > 0 ? 'up' : ''}`, trend));
      grid.append(box);
    });
    c.append(grid);
    return c;
  }

  // Where the team's students are: one bar per stage, as long as its share of the largest.
  function stagesCard(stages, note) {
    const shown = stages.filter((s) => s.count > 0);
    const c = card('Where the students are', note);
    if (!shown.length) { c.append(el('p', 'md-quiet', 'No students at these stages yet.')); return c; }
    const max = Math.max(...shown.map((s) => s.count));
    const list = el('div', 'md-bars');
    shown.forEach((s) => {
      const row = el('div', 'md-bar');
      const track = el('span', 'md-bar-track');
      const fill = el('span', 'md-bar-fill');
      fill.style.width = `${Math.max(4, Math.round((s.count / max) * 100))}%`;
      track.append(fill);
      row.append(el('span', 'md-bar-label', s.stage), track, el('b', 'md-bar-n', num(s.count)));
      list.append(row);
    });
    c.append(list);
    return c;
  }

  function peopleCard(title, sub, rows, empty, side) {
    const c = card(title, sub);
    if (!rows.length) { c.append(el('p', 'md-quiet', empty)); return c; }
    const list = el('div', 'md-people');
    rows.forEach((r) => {
      const a = h('a', { class: 'md-person', href: '/student?id=' + encodeURIComponent(r.id), title: 'Open the student card' });
      a.append(el('span', 'td-av', initials(r.name)));
      const mid = el('span', 'md-person-mid');
      mid.append(el('b', '', r.name), el('small', '', r.what));
      a.append(mid, side(r));
      list.append(a);
    });
    c.append(list);
    return c;
  }

  api('/api/my-dashboard').then((d) => {
    document.title = 'Dashboard · ISR';
    const page = el('div', 'md-page');
    const head = el('header', 'td-hello');
    head.append(el('span', 'td-kicker', d.intake ? `${d.title} · ${d.intake}` : d.title), el('h1', '', 'Dashboard'), el('p', '', d.lead));
    page.append(head);

    const kpis = el('div', 'md-kpis');
    d.kpis.forEach((k) => { const t = el('div', 'md-kpi'); t.append(el('span', 'md-kpi-label', k.label), el('b', '', num(k.value)), el('small', '', k.note)); kpis.append(t); });
    page.append(kpis);

    // The tasks of the team, in one line, with the way to Today where they are ticked.
    const tk = el('a', 'md-taskline');
    tk.href = '/today';
    tk.append(el('b', '', d.tasks.open ? `${num(d.tasks.open)} open task${d.tasks.open === 1 ? '' : 's'}` : 'No open task'),
      el('span', '', `${num(d.tasks.doneWeek)} done this week`),
      el('span', 'md-taskline-go', 'Open on Today'));
    page.append(tk);

    const grid = el('div', 'md-grid');
    grid.append(weekCard(d.week), stagesCard(d.stages, d.stagesNote),
      peopleCard('Coming up', 'The next 7 days.', d.upcoming, 'Nothing booked for the next 7 days.', (r) => el('span', 'md-date', shortDay(r.date))),
      peopleCard('Good news', 'Offers, deposits, CAS and visas of the last 30 days.', d.wins, 'No news in the last 30 days yet.', (r) => el('span', 'md-date', shortDay(r.date))));
    page.append(grid);
    view.replaceChildren(page);
  }).catch((e) => view.replaceChildren(el('div', 'p-card', e.message)));
})();

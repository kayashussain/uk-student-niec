// Today: the first screen. What needs a person's attention now, for the students this account sees, each a click away from the student's card.
(function () {
  const { el, h, api, initials, stagePill } = window.Portal;
  const view = document.getElementById('view');
  if (new URLSearchParams(location.search).get('notice') === 'admin') {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { if (window.NiecUI) window.NiecUI.toast('That page is for Admin only, so you are back on Today.', { type: 'error' }); }, 300);
  }
  const ICON = {
    inquiries: '<path d="M4 5h16v11H8l-4 4V5z"/>',
    apply: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 13h6M10 17h6"/>',
    mock: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    offers: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.200 8 12.700 4 8.800 9.500 8z"/>',
    cas: '<path d="M4 12l5 5L20 6"/>',
  };
  const ICON_AS = { defer: 'inquiries', noUni: 'apply', noOffer: 'offers', mockFeedback: 'mock', preCas: 'mock' };
  const icon = (key) => { const s = el('span', 't-ico'); s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[ICON_AS[key] || key] || ''}</svg>`; return s; };
  const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };

  function tile(label, value) { const t = el('div', 't-tile'); t.append(el('b', '', String(value)), el('span', '', label)); return t; }

  let readOnly = false;
  function section(x) {
    const c = el('section', 't-card');
    const head = el('header', 't-head');
    head.append(icon(x.key));
    const title = el('div', 't-title');
    title.append(el('h2', '', x.title), el('p', '', x.hint));
    head.append(title, el('span', `t-count${x.count ? '' : ' zero'}`, String(x.count)));
    c.append(head);
    if (!x.count) {
      const ok = el('div', 't-clear');
      ok.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>';
      ok.append(el('span', '', 'All clear'));
      c.append(ok);
      return c;
    }
    const list = el('div', 't-list');
    x.students.forEach((s) => {
      const row = h('a', { class: 't-row', href: '/student?id=' + encodeURIComponent(s.id), title: 'Open the student card' });
      row.append(el('span', 't-av', initials(s.name)));
      const mid = el('span', 't-mid');
      mid.append(el('b', '', s.name), el('small', '', `${s.detail} · ${s.intake}`));
      row.append(mid, stagePill(s.stage));
      list.append(row);
    });
    c.append(list);
    const foot = el('footer', 't-foot');
    if (x.count > x.students.length) foot.append(el('span', '', `and ${x.count - x.students.length} more`));
    if (x.stage && !readOnly) foot.append(h('a', { class: 'btn btn-sm', href: '/bulk?stage=' + encodeURIComponent(x.stage) }, 'Follow up these'));
    if (foot.childNodes.length) c.append(foot);
    return c;
  }

  // Tasks: a team sees the tasks given to it (open first, then the ones done); Admin and the Manager see every task they gave, and
  // whether each is done. A tick marks a task complete (or not complete again); the student's name opens the card.
  let showDone = false;
  function tasksPanel(t, refresh) {
    const box = el('section', 't-tasks');
    const head = el('div', 't-tasks-head');
    const open = t.tasks.filter((x) => !x.done);
    const done = t.tasks.filter((x) => x.done);
    head.append(el('h2', '', t.canAssign ? 'Assigned tasks' : "Today's tasks"), el('span', 't-tasks-count', t.canAssign ? `${open.length} open \u00b7 ${done.length} done` : `${open.length} to do`));
    const toggle = h('button', { class: 'btn btn-sm', type: 'button' }, showDone ? 'Hide done' : `Show done (${done.length})`);
    toggle.addEventListener('click', () => { showDone = !showDone; refresh(); });
    if (done.length) head.append(toggle);
    box.append(head);
    const shown = showDone ? t.tasks : open;
    if (!shown.length) { box.append(el('p', 't-tasks-empty', t.canAssign ? 'No open task. Open a student card and press "Assign a task" to give one to a team.' : 'Nothing assigned to your team. Well done.')); return box; }
    shown.forEach((x) => {
      const r = el('div', 't-task' + (x.done ? ' done' : ''));
      const tick = h('button', { class: 't-task-check', type: 'button', 'aria-pressed': String(x.done), title: x.done ? 'Mark as not complete' : 'Mark as complete' }, x.done ? '\u2713' : '');
      tick.addEventListener('click', async () => { try { await api(`/api/cards/${encodeURIComponent(x.studentId)}/tasks/${x.id}`, { done: !x.done }); window.NiecUI.toast(x.done ? 'Marked as not complete' : 'Marked as complete', { type: 'success' }); refresh(true); } catch (e) { window.NiecUI.toast(e.message, { type: 'error' }); } });
      const mid = el('div', 't-task-mid');
      const who = h('a', { class: 't-task-student', href: '/student?id=' + encodeURIComponent(x.studentId) }, x.student);
      const overdue = !x.done && x.due && x.due < new Date().toISOString().slice(0, 10);
      const meta = [t.canAssign ? x.teamLabel : '', x.due ? (overdue ? 'overdue, was due ' : 'by ') + new Date(x.due + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '', `from ${x.by}`, x.done ? `done by ${x.doneBy}` : ''].filter(Boolean).join(' \u00b7 ');
      const line = el('div', 't-task-top'); line.append(who, stagePill(x.stage));
      mid.append(line, el('div', 't-task-text', x.text), el('div', 't-task-meta' + (overdue ? ' late' : ''), meta));
      r.append(tick, mid);
      box.append(r);
    });
    return box;
  }

  api('/api/today').then(async (d) => {
    let tasks = { tasks: [], canAssign: false };
    try { tasks = await api('/api/tasks'); } catch (e) { /* the rest of Today still shows */ }
    document.title = 'Today · ISR';
    readOnly = Boolean(d.readOnly);
    const page = el('div');
    const head = el('div', 't-hello');
    const first = String(d.name || '').split(/\s+/)[0] || '';
    head.append(el('h1', '', `${greeting()}${first ? ', ' + first : ''}`), el('p', '', new Date(d.today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '. ' + d.tagline));
    const kindLabel = el('span', 't-kind', d.title);
    head.insertBefore(kindLabel, head.firstChild);
    // The buttons of each kind of account: what that team starts its day with.
    const actions = el('div', 't-actions');
    const go = (href, text, primary) => actions.append(h('a', { class: `btn${primary ? ' btn-primary' : ''}`, href }, text));
    if (d.kind === 'manager') { go('/dashboard', 'Open the Dashboard', true); go('/students', 'All Students'); }
    else {
      go('/students', 'Open All Students', true);
      if (['admin', 'branch', 'team'].includes(d.kind)) go('/bulk-add', 'Add many students');
      if (['admin', 'branch', 'team', 'followup'].includes(d.kind)) go('/bulk', 'Follow-up');
      if (d.kind === 'admin') go('/dashboard', 'Dashboard');
      if (['application', 'mock'].includes(d.kind)) go('/fact-file', 'Fact File');
    }
    head.append(actions);
    const tiles = el('div', 't-tiles');
    d.tiles.forEach((t) => tiles.append(tile(t.label, t.value)));
    const grid = el('div', 't-grid');
    // Cards with work come first; the ones with nothing to do are one quiet line each, so an empty card does not take a whole tile.
    d.sections.filter((x) => x.count > 0).forEach((x) => grid.append(section(x)));
    const clear = d.sections.filter((x) => x.count === 0);
    if (clear.length) {
      const quiet = el('section', 't-clear');
      clear.forEach((x) => { const row = el('div', 't-clear-row'); row.append(el('span', 't-clear-tick', '\u2713'), el('b', '', x.title), el('span', 't-clear-hint', 'Nothing waiting')); quiet.append(row); });
      grid.append(quiet);
    }
    const slot = el('div');
    const refresh = async (reload) => { if (reload) { try { tasks = await api('/api/tasks'); } catch (e) { /* keep */ } } slot.replaceChildren(tasksPanel(tasks, refresh)); };
    refresh();
    const workHead = el('h2', 't-section-title', d.kind === 'admin' || d.kind === 'manager' ? 'Needs attention' : 'Your work lists');
    page.append(head, tiles, slot, workHead, grid);
    view.replaceChildren(page);
  }).catch((e) => view.replaceChildren(el('div', 'p-card', e.message)));
})();

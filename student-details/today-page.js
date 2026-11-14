// Today: the first screen, kept quiet on purpose. Two things only:
//   1. the tasks: a team sees the tasks given to it (late first, then today, then the coming days); Admin and the Manager see the
//      tasks they gave and whether each is done;
//   2. what needs attention: one short list, a line per kind of work with how many students wait, opened with a click.
// The numbers, charts and buttons live on the Dashboard and on All Students, not here.
(function () {
  const { el, h, api, initials, stagePill } = window.Portal;
  const view = document.getElementById('view');
  if (new URLSearchParams(location.search).get('notice') === 'admin') {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { if (window.NiecUI) window.NiecUI.toast('That page is for Admin only, so you are back on Today.', { type: 'error' }); }, 300);
  }
  const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
  const shortDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  let todayIso = new Date().toISOString().slice(0, 10);

  // When a task is due, in words, and how urgent that is: late, today, soon or later.
  function dueOf(t) {
    if (t.done) return { group: 'done', text: t.doneBy ? `Done by ${t.doneBy}` : 'Done' };
    if (!t.due) return { group: 'later', text: 'No date' };
    const days = Math.round((Date.parse(t.due + 'T12:00:00Z') - Date.parse(todayIso + 'T12:00:00Z')) / 86400000);
    if (days < 0) return { group: 'late', text: days === -1 ? 'Late, was due yesterday' : `Late, was due ${-days} days ago` };
    if (days === 0) return { group: 'today', text: 'Due today' };
    if (days === 1) return { group: 'soon', text: 'Due tomorrow' };
    return { group: days <= 7 ? 'soon' : 'later', text: `Due ${shortDay(t.due)}` };
  }
  const GROUPS = [['late', 'Late'], ['today', 'Due today'], ['soon', 'Coming up'], ['later', 'Later or no date']];

  let showDone = false;
  function taskRow(t, canAssign, refresh) {
    const due = dueOf(t);
    const r = el('div', `td-task is-${due.group}`);
    // A task a branch gave to another team is ticked by that team, not here.
    const tick = h('button', { class: 'td-check', type: 'button', 'aria-pressed': String(t.done), title: t.given ? `${t.teamLabel} ticks it when it is done` : t.done ? 'Mark as not done' : 'Mark as done', 'aria-label': t.done ? 'Mark as not done' : 'Mark as done', disabled: Boolean(t.given) });
    tick.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    tick.addEventListener('click', async () => {
      tick.disabled = true;
      try { await api(`/api/cards/${encodeURIComponent(t.studentId)}/tasks/${t.id}`, { done: !t.done }); window.NiecUI.toast(t.done ? 'Marked as not done' : 'Done. Well done.', { type: 'success' }); refresh(true); } catch (e) { tick.disabled = false; window.NiecUI.toast(e.message, { type: 'error' }); }
    });
    const mid = el('div', 'td-task-mid');
    mid.append(el('div', 'td-task-text', t.text));
    const who = el('div', 'td-task-who');
    who.append(h('a', { class: 'td-student', href: '/student?id=' + encodeURIComponent(t.studentId), title: 'Open the student card' }, t.student), stagePill(t.stage));
    if (canAssign || t.given) who.append(el('span', 'td-team', t.teamLabel));
    mid.append(who);
    const meta = el('div', 'td-task-side');
    meta.append(el('span', `td-due is-${due.group}`, due.text), el('span', 'td-from', canAssign || t.given ? `Given ${new Date(t.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : `From ${t.by}`));
    r.append(tick, mid, meta);
    return r;
  }

  function tasksPanel(t, refresh) {
    const box = el('section', 'td-tasks');
    // A branch also sees the tasks it gave to the Application and Mock Teams, in their own list below its own tasks.
    const given = t.canAssign ? [] : t.tasks.filter((x) => x.given);
    const ownTasks = t.canAssign ? t.tasks : t.tasks.filter((x) => !x.given);
    const open = ownTasks.filter((x) => !x.done);
    const done = ownTasks.filter((x) => x.done && Date.now() - Date.parse(x.doneAt || 0) < 7 * 86400000); // done in the last 7 days
    const head = el('div', 'td-tasks-head');
    const titles = el('div');
    titles.append(el('h2', '', t.canAssign ? 'Tasks you have given' : 'Your tasks'), el('p', '', t.canAssign
      ? 'Give a task from a student card (Assign a task). The team sees it here on its Today.'
      : 'Given to your team. Tick a task when it is done.'));
    head.append(titles);
    const sum = el('div', 'td-sum');
    const late = open.filter((x) => dueOf(x).group === 'late').length;
    const today = open.filter((x) => dueOf(x).group === 'today').length;
    if (late) sum.append(el('span', 'td-chip is-late', `${late} late`));
    if (today) sum.append(el('span', 'td-chip is-today', `${today} due today`));
    sum.append(el('span', 'td-chip', `${open.length} open`));
    head.append(sum);
    box.append(head);
    if (!open.length) {
      const empty = el('div', 'td-empty');
      empty.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      empty.append(el('div', '', t.canAssign ? 'Every task you gave is done.' : 'Nothing open for your team. You are all caught up.'));
      box.append(empty);
    }
    GROUPS.forEach(([key, label]) => {
      const list = open.filter((x) => dueOf(x).group === key);
      if (!list.length) return;
      const g = el('div', `td-group is-${key}`);
      g.append(el('h3', '', `${label} · ${list.length}`));
      list.forEach((x) => g.append(taskRow(x, t.canAssign, refresh)));
      box.append(g);
    });
    if (given.length) {
      const g = el('div', 'td-group');
      const waiting = given.filter((x) => !x.done);
      g.append(el('h3', '', `Tasks you have given \u00b7 ${waiting.length} open, ${given.length - waiting.length} done`));
      [...waiting, ...given.filter((x) => x.done)].slice(0, 30).forEach((x) => g.append(taskRow(x, false, refresh)));
      box.append(g);
    }
    if (done.length) {
      const toggle = h('button', { class: 'td-done-toggle', type: 'button', 'aria-expanded': String(showDone) }, showDone ? 'Hide the tasks done this week' : `Done this week (${done.length})`);
      toggle.addEventListener('click', () => { showDone = !showDone; refresh(); });
      box.append(toggle);
      if (showDone) { const g = el('div', 'td-group is-done'); done.forEach((x) => g.append(taskRow(x, t.canAssign, refresh))); box.append(g); }
    }
    return box;
  }

  // What needs attention: one line per kind of work that has students waiting; a click opens the first few names.
  function attention(sections) {
    const box = el('section', 'td-attn');
    const waiting = sections.filter((x) => x.count > 0);
    const head = el('div', 'td-attn-head');
    head.append(el('h2', '', 'Needs attention'), el('p', '', waiting.length ? 'Students who are waiting for the next step. Open a line to see who.' : 'Nothing is waiting. Every student is where they should be.'));
    box.append(head);
    waiting.forEach((x) => {
      const d = el('details', 'td-attn-row');
      const s = el('summary');
      const words = el('span', 'td-attn-words');
      words.append(el('b', '', x.title), el('small', '', x.hint));
      s.append(words, el('span', 'td-attn-count', String(x.count)));
      d.append(s);
      const list = el('div', 'td-attn-list');
      x.students.forEach((st) => {
        const a = h('a', { class: 'td-attn-student', href: '/student?id=' + encodeURIComponent(st.id), title: 'Open the student card' });
        a.append(el('span', 'td-av', initials(st.name)));
        const mid = el('span', 'td-attn-mid');
        mid.append(el('b', '', st.name), el('small', '', `${st.detail} · ${st.intake}`));
        a.append(mid, stagePill(st.stage));
        list.append(a);
      });
      if (x.count > x.students.length) list.append(h('a', { class: 'td-attn-more', href: '/students' }, `and ${x.count - x.students.length} more on All Students`));
      d.append(list);
      box.append(d);
    });
    return box;
  }

  api('/api/today').then(async (d) => {
    todayIso = d.today || todayIso;
    let tasks = { tasks: [], canAssign: false };
    try { tasks = await api('/api/tasks'); } catch (e) { /* the rest of Today still shows */ }
    document.title = 'Today · ISR';
    const page = el('div', 'td-page');
    const head = el('header', 'td-hello');
    const first = String(d.name || '').split(/\s+/)[0] || '';
    head.append(el('span', 'td-kicker', d.title), el('h1', '', `${greeting()}${first ? ', ' + first : ''}`),
      el('p', '', new Date(d.today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })));
    const slot = el('div');
    const refresh = async (reload) => { if (reload) { try { tasks = await api('/api/tasks'); } catch (e) { /* keep */ } } slot.replaceChildren(tasksPanel(tasks, refresh)); };
    refresh();
    page.append(head, slot, attention(d.sections));
    view.replaceChildren(page);
  }).catch((e) => view.replaceChildren(el('div', 'p-card', e.message)));
})();

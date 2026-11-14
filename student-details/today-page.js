// Today: the first screen, kept quiet on purpose. Two things only:
//   1. the tasks: a team sees the tasks given to it; Admin and the Manager see the tasks they gave and whether each is done. Each task
//      has its own comments, where the team and whoever gave it talk it through (the owner, 14 Nov 2026: no dates to do it by);
//   2. what needs attention: one short list, a line per kind of work with how many students wait, opened with a click.
// The numbers, charts and buttons live on the Dashboard and on All Students, not here.
(function () {
  const { el, h, api, initials, stagePill, taskThread } = window.Portal;
  const view = document.getElementById('view');
  if (new URLSearchParams(location.search).get('notice') === 'admin') {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { if (window.NiecUI) window.NiecUI.toast('That page is for Admin only, so you are back on Today.', { type: 'error' }); }, 300);
  }
  const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
  const shortDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  let me = '';
  const lastFromOther = (t) => { const c = Array.isArray(t.comments) ? t.comments : []; return Boolean(c.length && c[c.length - 1].by !== me); };

  let showDone = false;
  function taskRow(t, canAssign, refresh) {
    const r = el('div', `td-task${t.done ? ' is-done' : ''}`);
    // A task a branch gave to another team is ticked by that team, not here.
    const tick = h('button', { class: 'td-check', type: 'button', 'aria-pressed': String(t.done), title: t.given ? `${t.teamLabel} ticks it when it is done` : t.done ? 'Mark as not done' : 'Mark as done', 'aria-label': t.done ? 'Mark as not done' : 'Mark as done', disabled: Boolean(t.given) });
    tick.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    tick.addEventListener('click', async () => {
      tick.disabled = true;
      // The circle turns blue with a tick and the row folds away (about half a second), and only then is the list redrawn, so the
      // next task never jumps under the mouse.
      const quick = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!t.done) r.classList.add('is-ticking');
      const folded = new Promise((ok) => setTimeout(ok, t.done || quick ? 0 : 520));
      try {
        await api(`/api/cards/${encodeURIComponent(t.studentId)}/tasks/${t.id}`, { done: !t.done });
        window.NiecUI.toast(t.done ? 'Marked as not done' : 'Done. Well done. You can still add a comment under Done this week.', { type: 'success' });
        await folded;
        refresh(true);
      } catch (e) { r.classList.remove('is-ticking'); tick.disabled = false; window.NiecUI.toast(e.message, { type: 'error' }); }
    });
    const mid = el('div', 'td-task-mid');
    mid.append(el('div', 'td-task-text', t.text));
    const who = el('div', 'td-task-who');
    who.append(h('a', { class: 'td-student', href: '/student?id=' + encodeURIComponent(t.studentId), title: 'Open the student card' }, t.student), stagePill(t.stage));
    if (canAssign || t.given) who.append(el('span', 'td-team', t.teamLabel));
    const given = t.at ? shortDay(t.at) : '';
    who.append(el('span', 'td-from', t.done ? (t.doneBy ? `Done by ${t.doneBy}` : 'Done') : canAssign || t.given ? `Given ${given}` : `From ${t.by}${given ? ' \u00b7 ' + given : ''}`));
    mid.append(who, taskThread(t, { rowId: t.studentId, me, canWrite: true }));
    r.append(tick, mid);
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
      ? 'Give a task from a student card (Assign a task). The team sees it on its Today, and you talk it through in the comments.'
      : 'Given to your team. Comment to ask for what you need or to say how it went, and tick a task when it is done.'));
    head.append(titles);
    const sum = el('div', 'td-sum');
    const replies = [...open, ...given.filter((x) => !x.done)].filter(lastFromOther).length;
    if (replies) sum.append(el('span', 'td-chip is-new', `${replies} new ${replies === 1 ? 'reply' : 'replies'}`));
    sum.append(el('span', 'td-chip', `${open.length} open`));
    head.append(sum);
    box.append(head);
    if (!open.length) {
      const empty = el('div', 'td-empty');
      empty.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      empty.append(el('div', '', t.canAssign ? 'Every task you gave is done.' : 'Nothing open for your team. You are all caught up.'));
      box.append(empty);
    } else {
      const g = el('div', 'td-group');
      open.forEach((x) => g.append(taskRow(x, t.canAssign, refresh)));
      box.append(g);
    }
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
    me = d.name || '';
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

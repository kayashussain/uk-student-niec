// Today: the first screen, kept quiet on purpose. Two things only:
//   1. the tasks: what is for this person (their team's, or for Admin the tasks the team gave them), what they gave, and (Admin and
//      the Manager) what others gave; each says who gave it to whom, has its own comments, and a red dot marks what is new (the
//      owner, 14 Nov 2026: no dates to do it by);
//   2. what needs attention: one short list, a line per kind of work with how many students wait, opened with a click.
// The numbers, charts and buttons live on the Dashboard and on All Students, not here.
(function () {
  const { el, h, api, initials, stagePill, taskThread, taskRoute, handOn } = window.Portal;
  const view = document.getElementById('view');
  if (new URLSearchParams(location.search).get('notice') === 'admin') {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { if (window.NiecUI) window.NiecUI.toast('That page is for Admin only, so you are back on Today.', { type: 'error' }); }, 300);
  }
  const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
  const shortDay = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  let me = '';

  let showDone = false;
  // One task: the tick (only for whoever the task is for), what to do, the student, who gave it to whom and when, and its comments.
  function taskRow(t, refresh) {
    const r = el('div', `td-task${t.done ? ' is-done' : ''}${t.unread ? ' has-unread' : ''}`);
    const mayTick = t.forMe || (canAssignAll && !t.given);
    const tick = h('button', { class: 'td-check', type: 'button', 'aria-pressed': String(t.done), title: mayTick ? (t.done ? 'Mark as not done' : 'Mark as done') : `${t.teamLabel} ticks it when it is done`, 'aria-label': t.done ? 'Mark as not done' : 'Mark as done', disabled: !mayTick });
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
        window.NiecUI.toast(t.done ? 'Marked as not done' : 'Done. You can still add a comment under Done this week.', { type: 'success' });
        await folded;
        refresh(true);
      } catch (e) { r.classList.remove('is-ticking'); tick.disabled = false; window.NiecUI.toast(e.message, { type: 'error' }); }
    });
    const mid = el('div', 'td-task-mid');
    const top = el('div', 'td-task-top');
    top.append(el('div', 'td-task-text', t.text));
    if (t.unread) top.append(el('span', 'td-dot', String(t.unread)));
    mid.append(top);
    // From whom, to whom, and when: "From SK Kayas Hussain to the Application Team · 14 Nov".
    const fromName = t.by === me ? 'You' : t.by || 'Someone';
    const toName = t.forMe ? (t.team === 'head' ? 'you' : `your team (${t.teamLabel})`) : t.teamLabel;
    // The way it went, when it was handed on: "From SK → Mock Team → Application Team".
    const route = taskRoute(t, { fromName, toName, teams: allTeams });
    route.append(el('span', 'td-when', t.at ? shortDay(t.at) : ''));
    if (t.mayHand) route.append(h('button', { class: 'p-link', type: 'button', onclick: async () => { if (await handOn(t, { rowId: t.studentId, teams: allTeams })) { window.NiecUI.toast(`Handed on. It is with the new team now, and you can still comment.`, { type: 'success' }); refresh(true); } } }, 'Hand on'));
    if (t.done) route.append(el('span', 'td-donemark', t.doneBy ? `Done by ${t.doneBy}` : 'Done'));
    const who = el('div', 'td-task-who');
    who.append(h('a', { class: 'td-student', href: '/student?id=' + encodeURIComponent(t.studentId), title: 'Open the student card' }, t.student), stagePill(t.stage));
    const thread = taskThread(t, { rowId: t.studentId, me, canWrite: true, unread: t.unread || 0, teams: allTeams });
    mid.append(route, who, thread);
    r.append(tick, mid);
    if (t.unread) r.addEventListener('pointerdown', () => thread.markRead());
    return r;
  }
  let canAssignAll = false;
  let allTeams = [];

  // One list of tasks under its own heading, the newest word first; the ones done in the last 7 days fold away at the bottom.
  function group(title, hint, list, refresh, emptyText) {
    const g = el('div', 'td-group');
    const open = list.filter((x) => !x.done);
    const done = list.filter((x) => x.done && Date.now() - Date.parse(x.doneAt || 0) < 7 * 86400000);
    const head = el('div', 'td-group-head');
    const words = el('div');
    words.append(el('h3', '', title));
    if (hint) words.append(el('p', '', hint));
    head.append(words);
    const chips = el('div', 'td-sum');
    const fresh = list.reduce((n, x) => n + (x.unread || 0), 0);
    if (fresh) chips.append(el('span', 'td-chip is-new', `${fresh} new`));
    chips.append(el('span', 'td-chip', `${open.length} open`));
    head.append(chips);
    g.append(head);
    if (!open.length) {
      const empty = el('div', 'td-empty');
      empty.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      empty.append(el('div', '', emptyText));
      g.append(empty);
    }
    open.forEach((x) => g.append(taskRow(x, refresh)));
    if (done.length) {
      const key = title;
      const shown = showDone === key;
      const toggle = h('button', { class: 'td-done-toggle', type: 'button', 'aria-expanded': String(shown) }, shown ? 'Hide the tasks done this week' : `Done this week (${done.length})`);
      toggle.addEventListener('click', () => { showDone = shown ? false : key; refresh(); });
      g.append(toggle);
      if (shown) { const d = el('div', 'is-done'); done.forEach((x) => d.append(taskRow(x, refresh))); g.append(d); }
    }
    return g;
  }

  function tasksPanel(t, refresh) {
    canAssignAll = Boolean(t.canAssign);
    allTeams = t.teams || [];
    if (t.me) me = t.me;
    const box = el('section', 'td-tasks');
    const head = el('div', 'td-tasks-head');
    const titles = el('div');
    titles.append(el('h2', '', 'Tasks'), el('p', '', 'Who gave each task to whom, and the comments on it. A red dot marks what is new for you.'));
    head.append(titles);
    box.append(head);
    const forMe = t.tasks.filter((x) => x.forMe);
    const gave = t.tasks.filter((x) => !x.forMe && (x.given || x.by === me));
    const others = t.canAssign ? t.tasks.filter((x) => !x.forMe && x.by !== me) : [];
    // Tasks the team handed on to another team: still seen here, to follow them and comment.
    const passed = t.canAssign ? [] : t.tasks.filter((x) => x.had && !x.forMe && !gave.includes(x));
    const any = forMe.length || gave.length || others.length || passed.length;
    if (t.isHead || forMe.length || !t.canAssign) box.append(group(t.isHead ? 'For you' : 'For your team', t.isHead ? `Tasks the team gave you, ${t.headLabel || 'Admin'}.` : 'Tick a task when it is done; comment to ask for what you need or to say how it went.', forMe, refresh, t.isHead ? 'Nothing for you. When the team gives you a task, it is here.' : 'Nothing open for your team. You are all caught up.'));
    if (gave.length || t.canAssign) box.append(group('Tasks you have given', 'Give a task from a student card (Assign a task). Their comments come back here.', gave, refresh, 'Every task you gave is done.'));
    if (passed.length) box.append(group('Handed on by your team', 'Tasks your team passed to another team. Follow them and comment here.', passed, refresh, 'Every one of them is done.'));
    if (others.length) box.append(group('Given by others', 'Tasks others gave the teams, to keep an eye on.', others, refresh, 'Every one of them is done.'));
    if (!any && !t.canAssign && !forMe.length) { /* the "For your team" list above already says so */ }
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

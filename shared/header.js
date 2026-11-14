// The side menu every page shares: the ISR mark and the name of the consultancy using it, navigation between the pages, and the account
// menu with Log out. A page puts <header class="niec-header" data-page="..."></header> at the top (page
// is dashboard, sheet, b2b, templates, incentive, users, activity or direct), loads header.css and this file (after
// session.js), and the header fills itself in.
//
// Navigation depends on the account: Admin sees every page (Users and Activity in the account menu), the Manager the Dashboard, All Students and
// Fact File, and the teams All Students and Fact File.
(function () {
  const header = document.querySelector('.niec-header');
  if (!header) return;
  const page = header.dataset.page;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  header.innerHTML = `
    <button type="button" class="niec-toggle" aria-label="Open or close the menu" aria-expanded="true" title="Open or close the menu"><span class="niec-burger-ico" aria-hidden="true"></span></button>
    <a class="niec-brand" href="/today" title="Home" id="niecHome">
      <img class="niec-logo" src="/brand-logo.png" alt="Home" width="198" height="96" />
      <span class="niec-name" hidden><b>ISR</b></span>
      <span class="niec-mark" aria-hidden="true">ISR</span>
    </a>
    <button type="button" class="niec-burger" aria-expanded="false" aria-controls="niecNav"><span class="niec-burger-ico" aria-hidden="true"></span><span class="niec-burger-lbl">Menu</span></button>
    <nav class="niec-nav" id="niecNav" aria-label="Pages"></nav>
    <div class="niec-account"></div>`;
  // The soft fade between pages: a second click while one page is still fading in skips the fade, which the browser reports as an
  // error although nothing is wrong. It is caught here so it is never shown as one.
  const quiet = (e) => { if (e.viewTransition) e.viewTransition.finished.catch(() => {}); if (e.viewTransition && e.viewTransition.ready) e.viewTransition.ready.catch(() => {}); };
  window.addEventListener('pageswap', quiet);
  window.addEventListener('pagereveal', quiet);

  // Only the consultancy's logo at the top of the menu (the owner, 14 Nov 2026); "ISR" shows only if there is no logo.
  const logo = header.querySelector('.niec-logo');
  logo.addEventListener('error', () => { logo.hidden = true; header.querySelector('.niec-name').hidden = false; });


  // ---- Quick search (Ctrl+K, or the Search button): jump to a page or a student from anywhere, with the keyboard ----
  function palette(links) {
    const back = document.createElement('div');
    back.className = 'fly-pal-back';
    back.innerHTML = '<div class="fly-pal" role="dialog" aria-label="Quick search"><input class="fly-pal-input" type="search" placeholder="Search a student or go to a page" autocomplete="off" aria-label="Quick search"><div class="fly-pal-list" role="listbox"></div><div class="fly-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>';
    document.body.append(back);
    const input = back.querySelector('input');
    const list = back.querySelector('.fly-pal-list');
    let items = [];
    let at = 0;
    let timer;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
    const go = (it) => { if (!it) return; close(); if (it.card && window.CardDrawer) window.CardDrawer.open(it.card); else location.href = it.href; };
    const draw = () => {
      list.innerHTML = items.length ? items.map((it, i) => `<button type="button" class="fly-pal-item${i === at ? ' on' : ''}" role="option" data-i="${i}"><span class="fly-pal-kind">${esc(it.kind)}</span><span class="fly-pal-main"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('') : '<div class="fly-pal-empty">Nothing found</div>';
      const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const run = async () => {
      const q = input.value.trim().toLowerCase();
      const pages = links.filter(([, , label]) => !q || label.toLowerCase().includes(q)).map(([, href, label]) => ({ kind: 'Page', title: label, href }));
      let people = [];
      if (q.length >= 2) {
        try { const r = await (await fetch('/api/students/search?q=' + encodeURIComponent(q), { cache: 'no-store' })).json(); people = (r.students || []).slice(0, 8).map((s) => ({ kind: 'Student', title: s.name, sub: [s.stage, s.intake, s.university].filter(Boolean).join(' · '), card: s.id, href: '/student?id=' + encodeURIComponent(s.id) })); } catch (e) { /* only the pages are shown */ }
      }
      items = [...people, ...pages].slice(0, 12); at = 0; draw();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(items.length - 1, at + 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(items[at]); }
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    list.addEventListener('click', (e) => { const b = e.target.closest('.fly-pal-item'); if (b) go(items[Number(b.dataset.i)]); });
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 140); });
    run(); input.focus();
  }
  let paletteLinks = [];
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.querySelector('.fly-pal-back') && paletteLinks.length) palette(paletteLinks); }
  });

  // The menu is folded or open as the person left it.
  // The menu is open or closed as the person left it; with nothing saved, open on a wide screen and closed on a narrow one.
  try {
    const saved = localStorage.getItem('niecNav');
    const closed = saved ? (saved === 'closed' || saved === 'folded') : innerWidth < 1300;
    document.documentElement.setAttribute('data-nav', closed ? 'closed' : 'open');
  } catch (e) { /* open */ }
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>'),
    dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    sheet: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
    direct: svg('<path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M7 11.5V16c0 1.4 2.2 3 5 3s5-1.6 5-3v-4.5"/>'),
    b2b: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    agents: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 5a3.5 3.5 0 0 1 0 7M18.5 15c1.8.8 3 2.4 3.3 5"/>'),
    bulk: svg('<path d="M4 5h16v11H8l-4 4V5z"/><path d="M8 9h8M8 12h5"/>'),
    bulkadd: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5 1.4 0 2.6.3 3.6.9"/><path d="M18 13v6M15 16h6"/>'),
    users: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.8 3.4-6 7-6s6.4 2.2 7 6"/>'),
    activity: svg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
    templates: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 8l9 6 9-6"/>'),
    incentive: svg('<path d="M12 3v18M16.5 7.5C15.8 6.4 14.2 6 12.5 6 10.3 6 8.5 7 8.5 8.8c0 4 8 2 8 6.2 0 1.8-1.9 3-4.2 3-2 0-3.7-.6-4.5-1.8"/>'),
    events: svg('<path d="M4 14V8l12-4v14L4 14z"/><path d="M16 8a3 3 0 0 1 0 6M7 14v4a2 2 0 0 0 4 0v-3"/>'),
    factfile: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>'),
  };
  const LINKS = {
    admin: [['today', '/today', 'Today'], ['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'All Students'],
      ['direct', '/partner-universities', 'Partner Universities'], ['events', '/events', 'Events and marketing'], ['b2b', '/b2b-partners', 'B2B Partners'], ['agents', '/agents', 'Agents'], ['factfile', '/fact-file', 'Fact File'], ['templates', '/message-templates', 'Message templates']],
    manager: [['today', '/today', 'Today'], ['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'All Students'], ['events', '/events', 'Events and marketing'], ['factfile', '/fact-file', 'Fact File']],
    staff: [['today', '/today', 'Today'], ['dashboard', '/my-dashboard', 'Dashboard'], ['sheet', '/students', 'All Students'], ['factfile', '/fact-file', 'Fact File']],
    followup: [['today', '/today', 'Today'], ['dashboard', '/my-dashboard', 'Dashboard'], ['sheet', '/students', 'All Students'], ['bulk', '/bulk', 'Follow-up'], ['factfile', '/fact-file', 'Fact File']],
    branch: [['today', '/today', 'Today'], ['dashboard', '/my-dashboard', 'Dashboard'], ['sheet', '/students', 'All Students'], ['bulkadd', '/bulk-add', 'Add many students'], ['bulk', '/bulk', 'Follow-up'], ['factfile', '/fact-file', 'Fact File']],
  };
  // The menu of an account: Admin and Manager have their own; a team gets the pages its work needs (a branch adds students, the Follow-up Team follows up).
  const kindOf = (me) => {
    const deps = me.departments || [];
    if (me.role === 'admin' || me.role === 'manager') return me.role === 'manager' && deps.length ? (deps.some((d) => !['application', 'mock', 'followup'].includes(d)) ? 'branch' : 'staff') : me.role;
    if (deps.some((d) => !['application', 'mock', 'followup'].includes(d))) return 'branch';
    return deps.includes('followup') ? 'followup' : 'staff';
  };

  // Admin's own pages (people and the record of what happened) are in the account menu, not in the top menu.
  const MENU_LINKS = {
    admin: [['users', '/users', 'Users'], ['activity', '/activity', 'Activity'], ['incentive', '/incentive/', 'Incentive']],
  };

  // The partner pages and Message templates a person may open besides their own (the same rules as student-details/partner-access.js):
  // the Manager all of them; the Application and Mock Teams Partner Universities, B2B Partners, Agents and the templates; a branch
  // Partner Universities and the templates. Admin has them already.
  function sharedLinks(me) {
    if (me.role === 'admin') return { before: [], after: [] };
    const deps = me.departments || [];
    const manager = me.role === 'manager';
    const appMock = deps.some((d) => d === 'application' || d === 'mock');
    const branch = deps.some((d) => !['application', 'mock', 'followup'].includes(d));
    const before = [];
    if (manager || appMock || branch) before.push(['direct', '/partner-universities', 'Partner Universities']);
    if (manager || appMock) before.push(['b2b', '/b2b-partners', 'B2B Partners'], ['agents', '/agents', 'Agents']);
    const after = manager || appMock || branch ? [['templates', '/message-templates', 'Message templates']] : [];
    return { before, after };
  }

  let bound = false; // the menu's own buttons are wired once, however often the menu is drawn
  function render(me) {
    const own = LINKS[kindOf(me)] || [];
    const extra = sharedLinks(me);
    const at = own.findIndex(([id]) => id === 'factfile');
    const links = at === -1 ? [...own, ...extra.before, ...extra.after] : [...own.slice(0, at), ...extra.before, ...own.slice(at), ...extra.after];
    paletteLinks = [...links, ...(MENU_LINKS[me.role] || [])];
    // Follow-up and Add many students belong to All Students in a menu that has no link of their own.
    const page = links.some(([id]) => id === header.dataset.page) || !['bulk', 'bulkadd'].includes(header.dataset.page) ? header.dataset.page : 'sheet';
    header.querySelector('.niec-nav').innerHTML = links
      .map(([id, href, label]) => `<a href="${href}" title="${label}"${id === page ? ' aria-current="page"' : ''}><span class="niec-ico" aria-hidden="true">${ICONS[id] || ''}</span><span class="niec-lbl">${label}</span></a>`).join('')
      // Admin's own pages are in the menu too, under their own heading (Users, Activity, Incentive). Message templates is in the main
      // menu: it is shared with the teams Admin gives it to (the owner, 14 Nov 2026).
      + ((MENU_LINKS[me.role] || []).length ? `<div class="niec-sep" role="presentation"><span>Admin only</span></div>` + (MENU_LINKS[me.role] || []).map(([id, href, label]) => `<a href="${href}" title="${label}"${id === page ? ' aria-current="page"' : ''}><span class="niec-ico" aria-hidden="true">${ICONS[id] || ''}</span><span class="niec-lbl">${label}</span></a>`).join('') : '')
      ;
    const burger = header.querySelector('.niec-burger');
    const toggle = header.querySelector('.niec-toggle');
    const nav = header.querySelector('.niec-nav');
    const firstTime = !bound;
    bound = true;
    if (firstTime) burger.addEventListener('click', () => { const open = !header.classList.contains('menu-open'); header.classList.toggle('menu-open', open); burger.setAttribute('aria-expanded', String(open)); });
    if (firstTime) document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && header.classList.contains('menu-open')) { header.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); burger.focus(); } });
    const setNav = (closed) => { document.documentElement.setAttribute('data-nav', closed ? 'closed' : 'open'); toggle.setAttribute('aria-expanded', String(!closed)); try { localStorage.setItem('niecNav', closed ? 'closed' : 'open'); } catch (e) { /* the menu simply opens as usual next time */ } };
    toggle.setAttribute('aria-expanded', String(document.documentElement.getAttribute('data-nav') !== 'closed'));
    if (firstTime) toggle.addEventListener('click', () => setNav(document.documentElement.getAttribute('data-nav') !== 'closed'));
    // On a phone the menu may not fit: its right edge fades until it is scrolled to the end, as a hint to swipe.
    const edge = () => nav.classList.toggle('at-end', nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2);
    if (firstTime) { nav.addEventListener('scroll', edge, { passive: true }); window.addEventListener('resize', edge); }
    edge();
    // The current page is scrolled into view in a menu that doesn't fit.
    const here = nav.querySelector('[aria-current="page"]');
    if (here) nav.scrollLeft = Math.max(0, here.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - (nav.clientWidth - here.offsetWidth) / 2);
    // The logo goes home: the dashboard for the Manager, All Students for everyone else.
    header.querySelector('#niecHome').setAttribute('href', '/today');
    const initials = String(me.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const account = header.querySelector('.niec-account');
    account.innerHTML = `
      <button type="button" class="niec-account-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu for ${esc(me.name)}">
        <span class="niec-avatar" aria-hidden="true">${esc(initials)}</span>
        <span class="niec-account-text"><span class="niec-account-name">${esc(me.name)}</span><span class="niec-account-role">${esc(me.roleLabel)}</span></span>
        <span class="niec-caret" aria-hidden="true">▾</span>
      </button>
      <div class="niec-menu" role="menu" hidden>
        <div class="niec-menu-head"><b>${esc(me.name)}</b><span>${esc(me.username)} · ${esc(me.roleLabel)}</span></div>
        ${(MENU_LINKS[me.role] || []).map(([id, href, label]) => `<a role="menuitem" href="${href}"${id === page ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
        <a role="menuitem" href="/my-email"${page === 'myemail' ? ' aria-current="page"' : ''}>My email and WhatsApp</a>
        <button type="button" role="menuitem" class="niec-logout">Log out</button>
      </div>`;
    const btn = account.querySelector('.niec-account-btn');
    const menu = account.querySelector('.niec-menu');
    const setOpen = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener('click', (e) => { if (!account.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); } });
    account.querySelector('.niec-logout').addEventListener('click', () => window.NiecSession.logout());
  }

  // The menu is drawn at once from what this browser tab remembers from the last page (who is logged in), so moving from page
  // to page never shows an empty menu; the server's answer then confirms it and redraws only if something changed. The memory is
  // per tab (sessionStorage), holds only the name, username and access, and is wiped at the login page and at Log out.
  const MEMORY = 'isrMe';
  let shown = '';
  try {
    const kept = sessionStorage.getItem(MEMORY);
    if (kept) {
      const me = JSON.parse(kept);
      render(me); shown = kept;
      // All Students shows its team buttons by the role, so they are right in the first picture instead of appearing a moment later.
      if (me.role && !document.body.dataset.role) document.body.dataset.role = me.role;
    }
  } catch (e) { /* drawn when the server answers */ }
  // A preview made of made-up students says so on every page, so it is never mistaken for the real data.
  const demoBar = () => {
    if (document.querySelector('.niec-demo')) return;
    const bar = document.createElement('div');
    bar.className = 'niec-demo';
    bar.setAttribute('role', 'status');
    bar.textContent = 'DEMO: these students, intakes and numbers are made up. They are not your real data.';
    document.body.prepend(bar);
  };
  try { if (sessionStorage.getItem('isrDemo') === '1') demoBar(); } catch (e) { /* checked below */ }
  fetch('/api/demo', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    try { sessionStorage.setItem('isrDemo', d && d.demo ? '1' : '0'); } catch (e) { /* not kept */ }
    if (d && d.demo) demoBar();
  }).catch(() => { /* no banner */ });
  // A red badge on Today in the menu when something is new on the person's tasks (a comment, a task just given to them), so nobody
  // misses that the team, or whoever gave a task, wrote back (the owner, 14 Nov 2026). Checked on every page, every minute, and at
  // once when the person reads a task (the comments send "isr-tasks-read").
  let unread = 0;
  try { unread = Number(sessionStorage.getItem('isrUnread')) || 0; } catch (e) { /* asked below */ }
  const showUnread = () => {
    const link = header.querySelector('.niec-nav a[href="/today"]');
    if (!link) return;
    let b = link.querySelector('.niec-badge');
    if (!unread) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'niec-badge'; link.append(b); }
    b.textContent = unread > 99 ? '99+' : String(unread);
    b.setAttribute('aria-label', `${unread} new on your tasks`);
    link.title = `Today: ${unread} new on your tasks`;
  };
  const askUnread = () => fetch('/api/tasks/unread', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d) return;
    const was = unread;
    unread = Number(d.count) || 0;
    try { sessionStorage.setItem('isrUnread', String(unread)); } catch (e) { /* asked again next page */ }
    showUnread();
    if (unread > was) { const b = header.querySelector('.niec-badge'); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } }
  }).catch(() => { /* asked again in a minute */ });
  showUnread();
  window.addEventListener('isr-tasks-read', () => setTimeout(askUnread, 300));
  setInterval(() => { if (!document.hidden) askUnread(); }, 60000);
  fetch('/api/me', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((me) => {
      if (!me) return;
      const fresh = JSON.stringify({ name: me.name, username: me.username, role: me.role, roleLabel: me.roleLabel, departments: me.departments || [] });
      try { sessionStorage.setItem(MEMORY, fresh); } catch (e) { /* not kept */ }
      if (fresh !== shown) { render(JSON.parse(fresh)); showUnread(); }
      askUnread();
    })
    .catch(() => { /* the session helper sends a logged-out page to the login page */ });
})();

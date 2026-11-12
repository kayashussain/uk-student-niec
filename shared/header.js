// The side menu every page shares: the ISR mark and the name of the consultancy using it, navigation between the pages, and the account
// menu with Log out. A page puts <header class="niec-header" data-page="..."></header> at the top (page
// is dashboard, sheet, b2b, templates, incentive, users, activity or direct), loads header.css and this file (after
// session.js), and the header fills itself in.
//
// Navigation depends on the account: Admin sees every page (Users and Activity in the account menu), the Manager the Dashboard, Student Details and
// Fact File, and the teams Student Details and Fact File.
(function () {
  const header = document.querySelector('.niec-header');
  if (!header) return;
  const page = header.dataset.page;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  header.innerHTML = `
    <a class="niec-brand" href="/today" title="Home" id="niecHome">
      <svg class="niec-logo-full" role="img" aria-label="ISR" viewBox="0 0 175 80"><defs><linearGradient id="ihg" gradientUnits="userSpaceOnUse" x1="10" y1="72" x2="72" y2="8"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient></defs><g fill="none" stroke="url(#ihg)" stroke-linecap="round"><circle cx="36" cy="46" r="23" stroke-width="4.6"/><ellipse cx="36" cy="46" rx="10.5" ry="23" stroke-width="3.2"/><path d="M13 46H59" stroke-width="3.2"/><path d="M17 34Q36 38 55 34M17 58Q36 62 55 58" stroke-width="2.6" opacity=".7"/></g><g transform="translate(64 17) rotate(-26) scale(.66)"><path d="M26 -2L-18 -14L-6 2z" fill="url(#ihg)"/><path d="M26 -2L-6 2L-12 14z" fill="url(#ihg)" opacity=".6"/></g><path d="M102.2421875 26.533203125H94.15625V60.0H102.2421875Z M121.3740234375 60.5390625C129.9990234375 60.5390625 135.1201171875 56.5634765625 135.1201171875 49.8251953125C135.1201171875 44.6591796875 131.908203125 41.716796875 124.49609375 40.234375L121.5537109375 39.650390625C117.7353515625 38.8642578125 116.140625 37.853515625 116.140625 36.0341796875C116.140625 33.9453125 118.2744140625 32.4853515625 121.3291015625 32.4853515625C124.5185546875 32.4853515625 126.65234375 34.1923828125 126.876953125 36.955078125H134.3564453125C134.154296875 30.1044921875 129.2353515625 25.994140625 121.216796875 25.994140625C113.35546875 25.994140625 108.0546875 30.1943359375 108.0546875 36.416015625C108.0546875 41.2900390625 111.4013671875 44.5244140625 117.9375 45.8720703125L121.3740234375 46.568359375C125.39453125 47.3994140625 127.1240234375 48.5 127.1240234375 50.4091796875C127.1240234375 52.6103515625 124.85546875 54.0478515625 121.44140625 54.0478515625C117.578125 54.0478515625 115.2197265625 52.1611328125 115.107421875 48.94921875H107.4033203125C107.4033203125 56.3388671875 112.45703125 60.5390625 121.3740234375 60.5390625Z M140.28125 60.0H148.3671875V48.8818359375H153.578125L159.0361328125 60.0H167.5712890625L161.1474609375 47.2421875C164.6513671875 45.4228515625 166.6953125 42.1435546875 166.6953125 37.853515625C166.6953125 30.9130859375 161.8212890625 26.533203125 154.072265625 26.533203125H140.28125ZM148.3671875 42.525390625V33.1591796875H153.5107421875C156.767578125 33.1591796875 158.7890625 35.0009765625 158.7890625 37.853515625C158.7890625 40.68359375 156.767578125 42.525390625 153.533203125 42.525390625Z" fill="#1a2230" stroke="#1a2230" stroke-width="0.5" stroke-linejoin="round"/></svg>
      <span class="niec-mark" aria-hidden="true"><svg aria-hidden="true" viewBox="0 0 80 80"><defs><linearGradient id="itb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient></defs><rect width="80" height="80" rx="20" fill="url(#itb)"/><g transform="translate(40 41) scale(.8) translate(-40 -42)"><g fill="none" stroke="#fff" stroke-linecap="round"><circle cx="36" cy="46" r="23" stroke-width="4.6"/><ellipse cx="36" cy="46" rx="10.5" ry="23" stroke-width="3.2"/><path d="M13 46H59" stroke-width="3.2"/><path d="M17 34Q36 38 55 34M17 58Q36 62 55 58" stroke-width="2.6" opacity=".7"/></g><g transform="translate(64 17) rotate(-26) scale(.66)"><path d="M26 -2L-18 -14L-6 2z" fill="#fff"/><path d="M26 -2L-6 2L-12 14z" fill="#fff" opacity=".6"/></g></g></svg></span></span>
    </a>
    <nav class="niec-nav" aria-label="Pages"></nav>
    <div class="niec-account"></div>`;


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
  try { if (localStorage.getItem('niecNav') === 'folded') document.documentElement.setAttribute('data-nav', 'folded'); } catch (e) { /* open */ }
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
    admin: [['today', '/today', 'Today'], ['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'Student Details'],
      ['direct', '/partner-universities', 'Partner Universities'], ['events', '/events', 'Events and marketing'], ['b2b', '/b2b-partners', 'B2B Partners'], ['agents', '/agents', 'Agents'], ['factfile', '/fact-file', 'Fact File']],
    manager: [['today', '/today', 'Today'], ['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'Student Details'], ['events', '/events', 'Events and marketing'], ['factfile', '/fact-file', 'Fact File']],
    staff: [['today', '/today', 'Today'], ['sheet', '/students', 'Student Details'], ['factfile', '/fact-file', 'Fact File']],
    followup: [['today', '/today', 'Today'], ['sheet', '/students', 'Student Details'], ['bulk', '/bulk', 'Bulk follow-up'], ['factfile', '/fact-file', 'Fact File']],
    branch: [['today', '/today', 'Today'], ['sheet', '/students', 'Student Details'], ['bulkadd', '/bulk-add', 'Add many students'], ['bulk', '/bulk', 'Bulk follow-up'], ['factfile', '/fact-file', 'Fact File']],
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
    admin: [['users', '/users', 'Users'], ['activity', '/activity', 'Activity'], ['templates', '/message-templates', 'Message templates'], ['incentive', '/incentive/', 'Incentive']],
  };

  function render(me) {
    const links = LINKS[kindOf(me)] || [];
    paletteLinks = [...links, ...(MENU_LINKS[me.role] || [])];
    header.querySelector('.niec-nav').innerHTML = links
      .map(([id, href, label]) => `<a href="${href}" title="${label}"${id === page ? ' aria-current="page"' : ''}><span class="niec-ico" aria-hidden="true">${ICONS[id] || ''}</span><span class="niec-lbl">${label}</span></a>`).join('')
      // Admin's own pages are in the menu too, under their own heading (Users, Activity, Message templates, Incentive).
      + ((MENU_LINKS[me.role] || []).length ? `<div class="niec-sep" role="presentation"><span>Admin only</span></div>` + (MENU_LINKS[me.role] || []).map(([id, href, label]) => `<a href="${href}" title="${label}"${id === page ? ' aria-current="page"' : ''}><span class="niec-ico" aria-hidden="true">${ICONS[id] || ''}</span><span class="niec-lbl">${label}</span></a>`).join('') : '')
      + '<button type="button" class="niec-fold" aria-label="Fold or open the menu" title="Fold or open the menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg><span>Fold the menu</span></button>';
    const fold = header.querySelector('.niec-fold');
    fold.addEventListener('click', () => {
      const folded = document.documentElement.getAttribute('data-nav') !== 'folded';
      document.documentElement.setAttribute('data-nav', folded ? 'folded' : 'open');
      try { localStorage.setItem('niecNav', folded ? 'folded' : 'open'); } catch (e) { /* the menu simply opens as usual next time */ }
    });
    // On a phone the menu may not fit: its right edge fades until it is scrolled to the end, as a hint to swipe.
    const nav = header.querySelector('.niec-nav');
    const edge = () => nav.classList.toggle('at-end', nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2);
    nav.addEventListener('scroll', edge, { passive: true });
    window.addEventListener('resize', edge);
    edge();
    // The current page is scrolled into view in a menu that doesn't fit.
    const here = nav.querySelector('[aria-current="page"]');
    if (here) nav.scrollLeft = Math.max(0, here.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - (nav.clientWidth - here.offsetWidth) / 2);
    // The logo goes home: the dashboard for the Manager, Student Details for everyone else.
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

  fetch('/api/me', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((me) => { if (me) render(me); })
    .catch(() => { /* the session helper sends a logged-out page to the login page */ });
})();

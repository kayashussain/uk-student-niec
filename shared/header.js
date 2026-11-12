// The side menu every page shares: the Fly mark and the name of the consultancy using it, navigation between the pages, and the account
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
    <a class="niec-brand" href="/students" title="Home" id="niecHome">
      <svg class="niec-logo-full" viewBox="0 0 244 130" role="img" aria-label="Fly"><defs><linearGradient id="hfgw" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient><linearGradient id="hfgl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f6bff" stop-opacity="0"/><stop offset="1" stop-color="#6a58ff"/></linearGradient></defs><g transform="translate(12 50) scale(1.3)" fill="none" stroke="currentColor" stroke-width="7.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6V38M4 6H23M4 20.5H20"/><path d="M33 2.5V38"/><path d="M43 17L54 38"/><path d="M65 17L49 49"/></g><path d="M100 86C132 86 164 72 186 48" fill="none" stroke="url(#hfgl)" stroke-width="3.8" stroke-linecap="round" stroke-dasharray="1 7"/><g transform="translate(200 36) rotate(-34) scale(1.5)"><path d="M26 -2L-18 -14L-6 2z" fill="url(#hfgw)"/><path d="M26 -2L-6 2L-12 14z" fill="url(#hfgw)" opacity=".6"/></g></svg>
      <span class="niec-mark" aria-hidden="true"><svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="higw" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f6bff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient><linearGradient id="higl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f6bff" stop-opacity="0"/><stop offset="1" stop-color="#6a58ff"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#higw)"/><g transform="translate(30 33) rotate(-34) scale(1.0)"><path d="M26 -2L-18 -14L-6 2z" fill="#fff"/><path d="M26 -2L-6 2L-12 14z" fill="#fff" opacity=".66"/></g></svg></span></span>
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
    dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    sheet: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
    direct: svg('<path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M7 11.5V16c0 1.4 2.2 3 5 3s5-1.6 5-3v-4.5"/>'),
    b2b: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    agents: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 5a3.5 3.5 0 0 1 0 7M18.5 15c1.8.8 3 2.4 3.3 5"/>'),
    events: svg('<path d="M4 14V8l12-4v14L4 14z"/><path d="M16 8a3 3 0 0 1 0 6M7 14v4a2 2 0 0 0 4 0v-3"/>'),
    factfile: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>'),
  };
  const LINKS = {
    admin: [['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'Student Details'],
      ['direct', '/partner-universities', 'Partner Universities'], ['events', '/events', 'Events and marketing'], ['b2b', '/b2b-partners', 'B2B Partners'], ['agents', '/agents', 'Agents'], ['factfile', '/fact-file', 'Fact File']],
    manager: [['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'Student Details'], ['events', '/events', 'Events and marketing'], ['factfile', '/fact-file', 'Fact File']],
    staff: [['sheet', '/students', 'Student Details'], ['factfile', '/fact-file', 'Fact File']],
  };

  // Admin's own pages (people and the record of what happened) are in the account menu, not in the top menu.
  const MENU_LINKS = {
    admin: [['users', '/users', 'Users'], ['activity', '/activity', 'Activity'], ['templates', '/message-templates', 'Message templates'], ['incentive', '/incentive/', 'Incentive']],
  };

  function render(me) {
    const links = LINKS[me.role] || [];
    paletteLinks = [...links, ...(MENU_LINKS[me.role] || [])];
    header.querySelector('.niec-nav').innerHTML = links
      .map(([id, href, label]) => `<a href="${href}" title="${label}"${id === page ? ' aria-current="page"' : ''}><span class="niec-ico" aria-hidden="true">${ICONS[id] || ''}</span><span class="niec-lbl">${label}</span></a>`).join('')
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
    header.querySelector('#niecHome').setAttribute('href', me.role === 'manager' ? '/dashboard' : '/students');
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

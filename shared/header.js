// The header every page shares: the NIEC logo and name, navigation between the pages, and the account
// menu with Log out. A page puts <header class="niec-header" data-page="..."></header> at the top (page
// is dashboard, sheet, incentive, users or activity), loads header.css and this file (after
// session.js), and the header fills itself in.
//
// Navigation depends on the account: Admin sees every page, the Manager the Dashboard, Student Details and
// Fact File, and the teams Student Details and Fact File.
(function () {
  const header = document.querySelector('.niec-header');
  if (!header) return;
  const page = header.dataset.page;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  header.innerHTML = `
    <a class="niec-brand" href="/students" title="Home" id="niecHome">
      <img class="niec-logo" src="niec-logo.png" alt="NIEC, Your Future, Our Responsibility" width="79" height="38">
      <span class="niec-brand-text"><span class="niec-brand-name">UK Student NIEC</span><span class="niec-brand-sub">Nepal International Education Consultancy</span></span>
    </a>
    <nav class="niec-nav" aria-label="Pages"></nav>
    <div class="niec-account"></div>`;

  const LINKS = {
    admin: [['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'Student Details'], ['incentive', '/commission/', 'Incentive'],
      ['users', '/users', 'Users'], ['activity', '/activity', 'Activity'], ['factfile', '/fact-file', 'Fact File']],
    manager: [['dashboard', '/dashboard', 'Dashboard'], ['sheet', '/students', 'Student Details'], ['factfile', '/fact-file', 'Fact File']],
    staff: [['sheet', '/students', 'Student Details'], ['factfile', '/fact-file', 'Fact File']],
  };

  function render(me) {
    const links = LINKS[me.role] || [];
    header.querySelector('.niec-nav').innerHTML = links
      .map(([id, href, label]) => `<a href="${href}"${id === page ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    // The logo goes home: the dashboard for the Manager, Student Details for everyone else.
    header.querySelector('#niecHome').setAttribute('href', me.role === 'manager' ? '/dashboard' : '/students');
    const initials = String(me.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const account = header.querySelector('.niec-account');
    account.innerHTML = `
      <button type="button" class="niec-account-btn" aria-haspopup="menu" aria-expanded="false">
        <span class="niec-avatar" aria-hidden="true">${esc(initials)}</span>
        <span class="niec-account-text"><span class="niec-account-name">${esc(me.name)}</span><span class="niec-account-role">${esc(me.roleLabel)}</span></span>
        <span class="niec-caret" aria-hidden="true">▾</span>
      </button>
      <div class="niec-menu" role="menu" hidden>
        <div class="niec-menu-head"><b>${esc(me.name)}</b><span>${esc(me.username)} · ${esc(me.roleLabel)}</span></div>
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

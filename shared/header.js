// The header every page shares: company name, navigation between the pages (Admin only; teams work
// on Student Details alone), and the account menu with Log out. A page puts
// <header class="niec-header" data-page="sheet|incentive|admin"></header> at the top, loads
// header.css and this file (after session.js), and the header fills itself in.
(function () {
  const header = document.querySelector('.niec-header');
  if (!header) return;
  const page = header.dataset.page;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  header.innerHTML = `
    <a class="niec-brand" href="/" title="Student Details">
      <span class="niec-mark" aria-hidden="true">NIEC</span>
      <span><span class="niec-brand-name">UK Student NIEC</span><br><span class="niec-brand-sub">Nepal International Education Consultancy</span></span>
    </a>
    <nav class="niec-nav" aria-label="Pages"></nav>
    <div class="niec-account"></div>`;

  function render(me) {
    if (me.role === 'admin') {
      const links = [['sheet', '/', 'Student Details'], ['incentive', '/commission/', 'Incentive'], ['admin', '/admin', 'Users & activity']];
      header.querySelector('.niec-nav').innerHTML = links
        .map(([id, href, label]) => `<a href="${href}"${id === page ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    }
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
        ${me.role === 'admin' ? '<a role="menuitem" href="/admin">Users &amp; activity</a>' : ''}
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

// "Logged in as …" in the toolbar, Admin's buttons (Check activity, Users), and the "Check activity"
// screen: every login, logout and change, newest first, as recorded by the server (see
// createActivityLog in shared/server-utils.js). The page's role goes on <body data-role>, which also
// shows Export Excel only to Admin (see style.css).
(function () {
  const userLabel = document.getElementById('userLabel');
  const activityBtn = document.getElementById('activityBtn');
  const usersBtn = document.getElementById('usersBtn');

  fetch('/api/me', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((user) => {
      if (!user) return;
      document.body.dataset.role = user.role;
      userLabel.textContent = user.label;
      userLabel.hidden = false;
      activityBtn.hidden = user.role !== 'admin';
      usersBtn.hidden = user.role !== 'admin';
    })
    .catch(() => { /* the label just stays hidden */ });

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const when = (iso) => new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  function render(list, body, filter) {
    const shown = list.filter((e) => !filter || e.account === filter);
    if (!shown.length) {
      body.innerHTML = '<p class="activity-empty">Nothing recorded yet.</p>';
      return;
    }
    body.innerHTML = shown.map((e) => `
      <div class="activity-entry">
        <div class="activity-head">
          <span class="activity-who">${esc(e.account)}</span>
          <span class="activity-action activity-${esc(String(e.action).split(' ')[0].toLowerCase())}">${esc(e.action)}</span>
          ${e.app ? `<span class="activity-app">${esc(e.app)}</span>` : ''}
          <span class="activity-time">${esc(when(e.time))}</span>
        </div>
        <div class="activity-device">${esc(e.device)}${e.ip ? ` · ${esc(e.ip)}` : ''}</div>
        ${e.note ? `<div class="activity-note">${esc(e.note)}</div>` : ''}
        ${Array.isArray(e.changes) && e.changes.length
    ? `<ul class="activity-changes">${e.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      </div>`).join('');
  }

  async function openActivity() {
    const overlay = document.createElement('div');
    overlay.className = 'activity-overlay';
    overlay.innerHTML = `
      <div class="activity-box" role="dialog" aria-modal="true" aria-labelledby="activity-title">
        <div class="activity-top">
          <h2 id="activity-title">Activity</h2>
          <select class="activity-filter" aria-label="Show activity for">
            <option value="">Everyone</option>
          </select>
          <button type="button" class="btn activity-refresh">Refresh</button>
          <button type="button" class="btn activity-close" aria-label="Close">✕</button>
        </div>
        <div class="activity-body"><p class="activity-empty">Loading…</p></div>
      </div>`;
    const body = overlay.querySelector('.activity-body');
    const filter = overlay.querySelector('.activity-filter');
    let list = [];

    const close = () => overlay.remove();
    overlay.querySelector('.activity-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      e.stopPropagation(); // keys here never reach the sheet underneath
    });
    filter.addEventListener('change', () => render(list, body, filter.value));

    async function load() {
      try {
        const res = await fetch('/api/activity', { cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HTTP ' + res.status);
        list = await res.json();
        // One choice per person (and "Unknown" for failed logins), keeping the current pick.
        const picked = filter.value;
        const people = [...new Set(list.map((e) => e.account))].sort();
        filter.length = 1;
        people.forEach((p) => filter.add(new Option(p, p)));
        filter.value = people.includes(picked) ? picked : '';
      } catch (err) {
        body.innerHTML = `<p class="activity-empty">Could not load the activity: ${esc(err.message)}</p>`;
        return;
      }
      render(list, body, filter.value);
    }
    overlay.querySelector('.activity-refresh').addEventListener('click', load);

    document.body.appendChild(overlay);
    overlay.querySelector('.activity-close').focus();
    load();
  }

  activityBtn.addEventListener('click', openActivity);
  usersBtn.addEventListener('click', () => { location.href = '/admin'; });
})();

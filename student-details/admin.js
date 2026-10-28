// The Users & activity page (admin.html, Admin only): people, logged-in devices, the activity record
// and settings. Everything it changes is checked again by the server (shared/accounts.js) and recorded
// in the activity.
(function () {
  const $ = (id) => document.getElementById(id);
  const TEAMS = { admin: 'Admin', application: 'Application Team', mock: 'Mock Team', followup: 'Follow-up Team' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const when = (iso, seconds = false) => (iso ? new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}),
  }) : '—');
  const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  let me = null;
  let names = {}; // user id -> name, for the confirmation questions

  async function api(url, body) {
    const res = await fetch(url, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
    return json;
  }

  function message(id, text, isError) {
    const el = $(id);
    el.textContent = text || '';
    el.className = 'msg' + (isError ? ' error' : '');
  }

  function showTempPassword(name, password) {
    const box = $('tempBox');
    box.innerHTML = `Temporary password for <b>${esc(name)}</b>: <code>${esc(password)}</code><br>`
      + 'Give it to them in person (not by email or chat). It works once: at their first login they choose their own '
      + 'password and link an authenticator app. It is not shown again.';
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest' });
  }

  // ---- Tabs ----
  const tabs = ['people', 'devices', 'activity', 'settings'];
  function showTab(name) {
    tabs.forEach((t) => {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('panel-' + t).hidden = t !== name;
    });
    if (name === 'activity') loadActivity();
    if (name === 'devices') loadSessions();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* not important */ }
  }
  tabs.forEach((t) => $('tab-' + t).addEventListener('click', () => showTab(t)));

  // ---- People ----
  function status(u) {
    if (u.disabled) return '<span class="pill pill-off">Disabled</span>';
    if (u.mustChangePassword || !u.authenticatorLinked) return '<span class="pill pill-wait">Not set up yet</span>';
    return '<span class="pill pill-ok">Active</span>';
  }

  async function loadUsers() {
    let users;
    try {
      users = await api('/api/users');
    } catch (e) {
      $('users').innerHTML = `<tr><td class="muted">${esc(e.message)}</td></tr>`;
      return;
    }
    names = Object.fromEntries(users.map((u) => [u.id, u.name]));
    $('peopleCount').textContent = users.filter((u) => !u.disabled).length;
    $('users').innerHTML = users.map((u) => {
      const self = me && u.id === me.id;
      const teamSelect = `<select data-role="${u.id}" aria-label="Team for ${esc(u.name)}">`
        + Object.entries(TEAMS).map(([id, label]) => `<option value="${id}" ${id === u.role ? 'selected' : ''}>${label}</option>`).join('')
        + '</select>';
      const actions = self ? '<span class="muted">This is you</span>' : `
        <div class="actions">
          ${teamSelect}
          <button class="btn btn-sm" data-act="reset-password" data-id="${u.id}">Reset password</button>
          <button class="btn btn-sm" data-act="reset-authenticator" data-id="${u.id}">Reset authenticator</button>
          <button class="btn btn-sm" data-act="logout-everywhere" data-id="${u.id}">Log out everywhere</button>
          ${u.disabled
    ? `<button class="btn btn-sm" data-act="enable" data-id="${u.id}">Enable</button>`
    : `<button class="btn btn-sm btn-danger" data-act="disable" data-id="${u.id}">Disable</button>`}
        </div>`;
      return `<tr class="${u.disabled ? 'is-disabled' : ''}">
        <td><div class="who"><span class="avatar" aria-hidden="true">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><span>${esc(u.username)}</span></div></div></td>
        <td data-label="Team">${esc(u.roleLabel)}</td>
        <td data-label="Status">${status(u)}</td>
        <td data-label="Last login">${when(u.lastLoginAt)}</td>
        <td data-label="Devices">${u.loggedInDevices}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('') || '<tr><td class="muted">No one yet.</td></tr>';
  }

  const CONFIRM = {
    disable: (n) => `Disable ${n}? They are logged out of every device now and can't log in again until enabled.`,
    'reset-password': (n) => `Give ${n} a new temporary password? Their current password stops working and they are logged out.`,
    'reset-authenticator': (n) => `Unlink ${n}'s authenticator app (e.g. they lost their phone)? They are logged out and link a new one at their next login.`,
    'logout-everywhere': (n) => `Log ${n} out of every device?`,
  };

  $('users').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const name = names[btn.dataset.id] || 'this person';
    const ask = CONFIRM[btn.dataset.act];
    if (ask && !confirm(ask(name))) return;
    message('usersMsg', '');
    $('tempBox').hidden = true;
    try {
      const result = await api(`/api/users/${btn.dataset.id}`, { action: btn.dataset.act });
      if (result.temporaryPassword) showTempPassword(name, result.temporaryPassword);
      else message('usersMsg', 'Done.');
    } catch (err) {
      message('usersMsg', err.message, true);
    }
    refresh();
  });

  $('users').addEventListener('change', async (e) => {
    const select = e.target.closest('select[data-role]');
    if (!select) return;
    const name = names[select.dataset.role] || 'this person';
    if (!confirm(`Move ${name} to ${TEAMS[select.value]}? They are logged out and log in again.`)) { loadUsers(); return; }
    try {
      await api(`/api/users/${select.dataset.role}`, { action: 'change-role', role: select.value });
      message('usersMsg', `${name} is now in ${TEAMS[select.value]}.`);
    } catch (err) {
      message('usersMsg', err.message, true);
    }
    refresh();
  });

  Object.entries(TEAMS).forEach(([id, label]) => $('addRole').add(new Option(label, id, id === 'application', id === 'application')));
  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    message('addMsg', '');
    $('tempBox').hidden = true;
    try {
      const result = await api('/api/users', { name: $('addName').value, username: $('addUsername').value, role: $('addRole').value });
      showTempPassword(result.user.name, result.temporaryPassword);
      message('addMsg', `${result.user.name} added to ${result.user.roleLabel}.`);
      $('addForm').reset();
    } catch (err) {
      message('addMsg', err.message, true);
    }
    refresh();
  });

  // ---- Devices ----
  async function loadSessions() {
    let list;
    try {
      list = await api('/api/sessions');
    } catch (e) {
      $('sessions').innerHTML = `<tr><td class="muted">${esc(e.message)}</td></tr>`;
      return;
    }
    $('devicesCount').textContent = list.length;
    $('sessions').innerHTML = list.map((s) => `<tr>
      <td><b>${esc(s.user)}</b>${s.current ? ' <span class="muted">(this device)</span>' : ''}</td>
      <td data-label="Device">${esc(s.device)}</td>
      <td data-label="IP address">${esc(s.ip)}</td>
      <td data-label="Logged in">${when(s.created)}</td>
      <td data-label="Last active">${when(s.lastSeen)}</td>
      <td>${s.current ? '' : `<div class="actions"><button class="btn btn-sm" data-end="${s.id}">Log out</button></div>`}</td>
    </tr>`).join('') || '<tr><td class="muted">No one is logged in.</td></tr>';
  }

  $('sessions').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-end]');
    if (!btn) return;
    try {
      await api(`/api/sessions/${btn.dataset.end}/end`, {});
    } catch (err) {
      message('sessionsMsg', err.message, true);
    }
    refresh();
  });

  $('endOthers').addEventListener('click', async () => {
    if (!confirm('Log out everyone except you, on every device? They will need to log in again.')) return;
    try {
      await api('/api/sessions/end-others', {});
      message('sessionsMsg', 'Everyone else has been logged out.');
    } catch (err) {
      message('sessionsMsg', err.message, true);
    }
    refresh();
  });

  // ---- Activity ----
  let activity = [];
  const PAGE = 200;
  let shown = PAGE;
  function renderActivity() {
    const filter = $('activityFilter').value;
    const list = activity.filter((e) => !filter || e.account === filter);
    const visible = list.slice(0, shown);
    $('activityList').innerHTML = visible.map((e) => `
      <div class="activity-entry">
        <div class="activity-head">
          <span class="activity-who">${esc(e.account)}</span>
          <span class="activity-action activity-${esc(String(e.action).split(' ')[0].toLowerCase())}">${esc(e.action)}</span>
          ${e.app ? `<span class="activity-app">${esc(e.app)}</span>` : ''}
          <span class="activity-time">${esc(when(e.time, true))}</span>
        </div>
        <div class="activity-device">${esc(e.device)}${e.ip ? ` · ${esc(e.ip)}` : ''}</div>
        ${e.note ? `<div class="activity-note">${esc(e.note)}</div>` : ''}
        ${Array.isArray(e.changes) && e.changes.length ? `<ul class="activity-changes">${e.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      </div>`).join('') || '<p class="muted">Nothing recorded yet.</p>';
    if (list.length > shown) {
      $('activityList').insertAdjacentHTML('beforeend', `<button class="btn activity-more" type="button" id="activityMore">Show more (${list.length - shown} older)</button>`);
      $('activityMore').addEventListener('click', () => { shown += PAGE; renderActivity(); });
    }
  }
  async function loadActivity() {
    try {
      activity = await api('/api/activity');
    } catch (e) {
      $('activityList').innerHTML = `<p class="muted">Could not load the activity: ${esc(e.message)}</p>`;
      return;
    }
    const filter = $('activityFilter');
    const picked = filter.value;
    const people = [...new Set(activity.map((e) => e.account))].sort();
    filter.length = 1;
    people.forEach((p) => filter.add(new Option(p, p)));
    filter.value = people.includes(picked) ? picked : '';
    shown = PAGE;
    renderActivity();
  }
  $('activityFilter').addEventListener('change', () => { shown = PAGE; renderActivity(); });
  $('activityRefresh').addEventListener('click', loadActivity);

  // ---- Settings ----
  $('hiddenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/settings/hidden-password', { password: $('hiddenPw').value });
      message('hiddenMsg', 'Hidden-sheet password changed.');
      $('hiddenForm').reset();
    } catch (err) {
      message('hiddenMsg', err.message, true);
    }
  });

  const refresh = () => Promise.all([loadUsers(), loadSessions()]);
  api('/api/me').then((user) => { me = user; }).catch(() => {}).finally(() => {
    refresh();
    const start = location.hash.slice(1);
    if (tabs.includes(start)) showTab(start);
  });
})();

// The Users page (users.html, Admin only): people and their access, and logged-in devices. Everything it changes is checked again by the server
// (shared/accounts.js) and recorded in the activity.
(function () {
  const $ = (id) => document.getElementById(id);
  const DEPARTMENTS = {
    application: { label: 'Application Team', help: 'Sees Application Stage students. Fills in details up to NOC Number.' },
    mock: { label: 'Mock Team', help: 'Sees Mock Stage students. Fills in the mock interviews and Pre-CAS result.' },
    followup: { label: 'Follow-up Team', help: 'Sees Inquiry, Defer and Withdrawn students. Adds remarks.' },
    chitwan: { label: 'Chitwan Branch', help: 'Sees the students whose Student Source is Chitwan Branch, and changes every column. Can add students.' },
    pokhara: { label: 'Pokhara Branch', help: 'Sees the students whose Student Source is Pokhara Branch, and changes every column. Can add students.' },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : 'Never');
  const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  let me = null;
  let people = {}; // user id -> person, for the questions and the edit box

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

  // ---- Access chooser (used when adding and when editing) ----
  // Tick any mix of the three teams and Manager. Admin is never offered.
  function accessFields(name) {
    const boxes = Object.entries(DEPARTMENTS).map(([id, d]) => `
      <label class="check"><input type="checkbox" name="${name}-dept" value="${id}"><span><b>${d.label}</b><small>${d.help}</small></span></label>`).join('');
    return `
      <fieldset class="access">
        <legend>What can this person do? Tick everything that applies.</legend>
        <div class="check-group">
          ${boxes}
          <label class="check"><input type="checkbox" name="${name}-manager"><span><b>Manager</b><small>Has their own dashboard, sees every student in every intake and can export to Excel. View only, unless a team is ticked as well. No Incentive page.</small></span></label>
        </div>
      </fieldset>`;
  }

  function wireAccess(container, name) {
    container.innerHTML = accessFields(name);
  }

  const readAccess = (container, name) => ({
    manager: container.querySelector(`input[name="${name}-manager"]`).checked,
    departments: [...container.querySelectorAll(`input[name="${name}-dept"]:checked`)].map((c) => c.value),
  });

  function setAccess(container, name, person) {
    container.querySelector(`input[name="${name}-manager"]`).checked = person.role === 'manager';
    container.querySelectorAll(`input[name="${name}-dept"]`).forEach((c) => { c.checked = (person.departments || []).includes(c.value); });
  }

  wireAccess($('addAccess'), 'add');
  wireAccess($('editAccess'), 'edit');

  // ---- Tabs ----
  const tabs = ['people', 'devices'];
  function showTab(name) {
    tabs.forEach((t) => {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('panel-' + t).hidden = t !== name;
    });
    if (name === 'devices') loadSessions();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* not important */ }
  }
  tabs.forEach((t) => $('tab-' + t).addEventListener('click', () => showTab(t)));

  // ---- Setup email results ----
  // What happened to the setup email, in a sentence, and whether the temporary password has to be shown.
  function showSetupResult(person, result) {
    const box = $('tempBox');
    const mail = result.email || {};
    let html;
    if (mail.status === 'sent') {
      html = `The setup email was sent to <b>${esc(mail.to)}</b>. It has their username, a link and a temporary password.`;
    } else {
      const why = {
        'no-address': 'No email address was entered for this person.',
        'not-configured': 'Email is not set up on the server yet.',
        failed: `The email could not be sent: ${esc(mail.error)}`,
      }[mail.status] || 'The email was not sent.';
      html = `${why}<br>Temporary password for <b>${esc(person)}</b>: <code>${esc(result.temporaryPassword)}</code><br>`
        + 'Give it to them in person, not by chat. It works once: at their first login they choose their own password. It is not shown again.';
    }
    box.innerHTML = html;
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest' });
  }

  // ---- People ----
  function status(u) {
    if (u.disabled) return '<span class="pill pill-off">Disabled</span>';
    if (u.mustChangePassword || !u.authenticatorLinked) return '<span class="pill pill-wait">Not set up yet</span>';
    return '<span class="pill pill-ok">Active</span>';
  }

  function accessChips(u) {
    if (u.role === 'admin') return '<span class="chip chip-admin">Admin</span>';
    const teams = (u.departments || []).map((d) => `<span class="chip chip-${d}">${esc(DEPARTMENTS[d].label)}</span>`).join('');
    return (u.role === 'manager' ? '<span class="chip chip-manager">Manager</span>' : '') + teams || '<span class="muted">No team</span>';
  }

  async function loadUsers() {
    let users;
    try {
      users = await api('/api/users');
    } catch (e) {
      $('users').innerHTML = `<tr><td class="muted">${esc(e.message)}</td></tr>`;
      return;
    }
    people = Object.fromEntries(users.map((u) => [u.id, u]));
    $('peopleCount').textContent = users.filter((u) => !u.disabled).length;
    $('users').innerHTML = users.map((u) => {
      const self = me && u.id === me.id;
      const notSetUp = !u.disabled && (u.mustChangePassword || !u.authenticatorLinked);
      const actions = self ? '<span class="muted">This is you</span>' : `
        <div class="actions">
          <button class="btn btn-sm" data-act="edit" data-id="${u.id}">Edit</button>
          <button class="btn btn-sm" data-act="reset-password" data-id="${u.id}">${notSetUp ? 'Resend setup email' : 'Reset password'}</button>
          ${u.authenticatorRequired ? `<button class="btn btn-sm" data-act="reset-authenticator" data-id="${u.id}">Reset authenticator</button>` : ''}
          <button class="btn btn-sm" data-act="logout-everywhere" data-id="${u.id}">Log out everywhere</button>
          ${u.disabled
    ? `<button class="btn btn-sm" data-act="enable" data-id="${u.id}">Enable</button>`
    : `<button class="btn btn-sm" data-act="disable" data-id="${u.id}">Disable</button>`}
          <button class="btn btn-sm btn-danger" data-act="remove" data-id="${u.id}">Remove</button>
        </div>`;
      return `<tr class="${u.disabled ? 'is-disabled' : ''}">
        <td><div class="who"><span class="avatar" aria-hidden="true">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><span>${esc(u.username)}${u.email ? ' &middot; ' + esc(u.email) : ''}</span></div></div></td>
        <td data-label="Access"><div class="chips">${accessChips(u)}</div></td>
        <td data-label="Status">${status(u)}</td>
        <td data-label="Last login">${when(u.lastLoginAt)}</td>
        <td data-label="Devices">${u.loggedInDevices}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('') || '<tr><td class="muted">No one yet.</td></tr>';
  }

  const CONFIRM = {
    remove: (n) => `Remove ${n} from the team? Their login is deleted and they are logged out everywhere. Their username and password will not work again. This cannot be undone.`,
    disable: (n) => `Disable ${n}? They are logged out of every device now and cannot log in again until enabled.`,
    'reset-password': (n, p) => (p.email
      ? `Email ${n} a new temporary password? Their current password stops working and they are logged out.`
      : `${n} has no email address, so the new temporary password will be shown here for you to give them. Their current password stops working and they are logged out. Continue?`),
    'reset-authenticator': (n) => `Unlink ${n}'s authenticator app (for example, they lost their phone)? They are logged out and link a new one at their next login.`,
    'logout-everywhere': (n) => `Log ${n} out of every device?`,
  };

  $('users').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const person = people[btn.dataset.id];
    if (!person) return;
    if (btn.dataset.act === 'edit') { openEdit(person); return; }
    const ask = CONFIRM[btn.dataset.act];
    if (ask && !confirm(ask(person.name, person))) return;
    message('usersMsg', '');
    $('tempBox').hidden = true;
    try {
      const result = await api(`/api/users/${person.id}`, { action: btn.dataset.act });
      if (btn.dataset.act === 'reset-password') showSetupResult(person.name, result);
      else message('usersMsg', btn.dataset.act === 'remove' ? `${person.name} was removed.` : 'Done.');
    } catch (err) {
      message('usersMsg', err.message, true);
    }
    refresh();
  });

  // ---- Add ----
  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    message('addMsg', '');
    $('tempBox').hidden = true;
    const access = readAccess($('addAccess'), 'add');
    try {
      const result = await api('/api/users', {
        name: $('addName').value, username: $('addUsername').value, email: $('addEmail').value, ...access,
      });
      message('addMsg', `${result.user.name} was added as ${result.user.accessLabel}.`);
      showSetupResult(result.user.name, result);
      $('addForm').reset();
      wireAccess($('addAccess'), 'add');
    } catch (err) {
      message('addMsg', err.message, true);
    }
    refresh();
  });

  // ---- Edit ----
  let editing = null;
  function openEdit(person) {
    editing = person;
    $('editName').value = person.name;
    $('editEmail').value = person.email || '';
    setAccess($('editAccess'), 'edit', person);
    $('editNote').textContent = 'Changing access logs the person out. They log in again to get their new access.';
    $('editDialog').showModal();
  }
  $('editCancel').addEventListener('click', () => $('editDialog').close());
  $('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await api(`/api/users/${editing.id}`, {
        action: 'update-person', name: $('editName').value, email: $('editEmail').value, ...readAccess($('editAccess'), 'edit'),
      });
      $('editDialog').close();
      message('usersMsg', `${editing.name} was updated.`);
    } catch (err) {
      $('editNote').textContent = err.message;
      return;
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

  const refresh = () => Promise.all([loadUsers(), loadSessions()]);
  api('/api/me').then((user) => { me = user; }).catch(() => {}).finally(() => {
    refresh();
    const start = location.hash.slice(1);
    if (tabs.includes(start)) showTab(start);
  });
})();

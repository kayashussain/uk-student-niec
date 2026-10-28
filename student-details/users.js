// The Users page (users.html, Admin only): people and their access, logged-in devices, and settings
// (email and the hidden-sheet password). Everything it changes is checked again by the server
// (shared/accounts.js) and recorded in the activity.
(function () {
  const $ = (id) => document.getElementById(id);
  const DEPARTMENTS = {
    application: { label: 'Application Team', help: 'Sees Application Stage students. Fills in details up to NOC Number.' },
    mock: { label: 'Mock Team', help: 'Sees Mock Stage students. Fills in the mock interviews and Pre-CAS result.' },
    followup: { label: 'Follow-up Team', help: 'Sees Inquiry, Defer and Withdrawn students. Adds remarks.' },
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
  // Team member (one or more teams) or Manager. Admin is never offered.
  function accessFields(name) {
    const depts = Object.entries(DEPARTMENTS).map(([id, d]) => `
      <label class="check"><input type="checkbox" name="${name}-dept" value="${id}"><span><b>${d.label}</b><small>${d.help}</small></span></label>`).join('');
    return `
      <fieldset class="access">
        <legend>What can this person do?</legend>
        <label class="radio"><input type="radio" name="${name}-role" value="staff" checked><span><b>Work in one or more teams</b><small>Tick every team they work in. They see and change only those teams' students.</small></span></label>
        <div class="check-group" data-for="${name}">${depts}</div>
        <label class="radio"><input type="radio" name="${name}-role" value="manager"><span><b>Manager</b><small>Has their own dashboard and sees every student, view only. Can export to Excel. No Incentive page.</small></span></label>
      </fieldset>`;
  }

  function wireAccess(container, name) {
    container.innerHTML = accessFields(name);
    const sync = () => {
      const staff = container.querySelector(`input[name="${name}-role"]:checked`).value === 'staff';
      container.querySelectorAll(`input[name="${name}-dept"]`).forEach((c) => { c.disabled = !staff; });
      container.querySelector('.check-group').classList.toggle('off', !staff);
    };
    container.querySelectorAll(`input[name="${name}-role"]`).forEach((r) => r.addEventListener('change', sync));
    sync();
  }

  const readAccess = (container, name) => ({
    role: container.querySelector(`input[name="${name}-role"]:checked`).value,
    departments: [...container.querySelectorAll(`input[name="${name}-dept"]:checked`)].map((c) => c.value),
  });

  function setAccess(container, name, person) {
    container.querySelector(`input[name="${name}-role"][value="${person.role === 'manager' ? 'manager' : 'staff'}"]`).checked = true;
    container.querySelectorAll(`input[name="${name}-dept"]`).forEach((c) => { c.checked = (person.departments || []).includes(c.value); });
    container.querySelector(`input[name="${name}-role"]:checked`).dispatchEvent(new Event('change'));
  }

  wireAccess($('addAccess'), 'add');
  wireAccess($('editAccess'), 'edit');

  // ---- Tabs ----
  const tabs = ['people', 'devices', 'settings'];
  function showTab(name) {
    tabs.forEach((t) => {
      $('tab-' + t).setAttribute('aria-selected', String(t === name));
      $('panel-' + t).hidden = t !== name;
    });
    if (name === 'devices') loadSessions();
    if (name === 'settings') loadEmailSettings();
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
        'not-configured': 'Email is not set up yet (see the Settings tab).',
        failed: `The email could not be sent: ${esc(mail.error)}`,
      }[mail.status] || 'The email was not sent.';
      html = `${why}<br>Temporary password for <b>${esc(person)}</b>: <code>${esc(result.temporaryPassword)}</code><br>`
        + 'Give it to them in person, not by chat. It works once: at their first login they choose their own password and link an authenticator app. It is not shown again.';
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
    if (u.role === 'manager') return '<span class="chip chip-manager">Manager</span>';
    return (u.departments || []).map((d) => `<span class="chip chip-${d}">${esc(DEPARTMENTS[d].label)}</span>`).join('') || '<span class="muted">No team</span>';
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
          <button class="btn btn-sm" data-act="reset-authenticator" data-id="${u.id}">Reset authenticator</button>
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

  // ---- Settings: email ----
  async function loadEmailSettings() {
    let e;
    try {
      e = await api('/api/settings/email');
    } catch (err) {
      message('emailMsg', err.message, true);
      return;
    }
    $('mHost').value = e.host;
    $('mPort').value = e.port;
    $('mSecurity').value = e.security;
    $('mUser').value = e.user;
    $('mPass').value = '';
    $('mPass').placeholder = e.passwordSet ? 'Saved. Leave empty to keep it' : 'Mailbox password';
    $('mFrom').value = e.from;
    $('mFromName').value = e.fromName;
    $('mSite').value = e.siteUrl;
    $('mSite').placeholder = e.detectedSiteUrl || 'https://example.com';
    const state = $('emailState');
    state.textContent = e.configured ? 'Set up' : 'Not set up';
    state.className = 'pill ' + (e.configured ? 'pill-ok' : 'pill-wait');
  }

  // Port and security usually go together: 465 is encrypted from the start, 587 starts plain.
  $('mPort').addEventListener('change', () => {
    if ($('mPort').value === '465') $('mSecurity').value = 'ssl';
    if ($('mPort').value === '587') $('mSecurity').value = 'starttls';
  });

  $('emailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    message('emailMsg', '');
    try {
      await api('/api/settings/email', {
        host: $('mHost').value, port: $('mPort').value, security: $('mSecurity').value, user: $('mUser').value,
        pass: $('mPass').value, from: $('mFrom').value, fromName: $('mFromName').value, siteUrl: $('mSite').value,
      });
      message('emailMsg', 'Email settings saved. Send a test email to check them.');
      loadEmailSettings();
    } catch (err) {
      message('emailMsg', err.message, true);
    }
  });

  $('testForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    message('testMsg', 'Sending...');
    try {
      await api('/api/settings/email/test', { to: $('testTo').value });
      message('testMsg', `Test email sent to ${$('testTo').value}. Check the inbox (and the spam folder).`);
    } catch (err) {
      message('testMsg', err.message, true);
    }
  });

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

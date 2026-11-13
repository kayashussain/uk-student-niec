// The Activity page (activity.html, Admin only): the record of every login and change, with filters.
// The server does the filtering and paging (see createActivityLog in shared/server-utils.js).
(function () {
  const $ = (id) => document.getElementById(id);
  const PAGE = 100;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const when = (iso) => new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  let events = []; // what is on screen
  let total = 0;
  let loading = 0; // newest request wins
  let timer = null;

  // The local start of a date and the local end of a date, as the ISO times the server compares.
  const startOf = (d) => (d ? new Date(d + 'T00:00:00').toISOString() : '');
  const endOf = (d) => (d ? new Date(d + 'T23:59:59.999').toISOString() : '');
  const dateInput = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  function params(offset) {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if ($('fPerson').value) p.set('account', $('fPerson').value);
    if ($('fType').value) p.set('category', $('fType').value);
    if ($('fFrom').value) p.set('from', startOf($('fFrom').value));
    if ($('fTo').value) p.set('to', endOf($('fTo').value));
    if ($('fSearch').value.trim()) p.set('q', $('fSearch').value.trim());
    return p;
  }

  function entryHtml(e) {
    const action = String(e.action).split(' ')[0].toLowerCase();
    return `<div class="activity-entry">
      <div class="activity-head">
        <span class="activity-who">${esc(e.account)}</span>
        <span class="activity-action activity-${esc(action)} cat-${esc(e.category)}">${esc(e.action)}</span>
        ${e.app ? `<span class="activity-app">${esc(e.app)}</span>` : ''}
        <span class="activity-time">${esc(when(e.time))}</span>
      </div>
      <div class="activity-device">${esc(e.device)}${e.ip ? ` &middot; ${esc(e.ip)}` : ''}</div>
      ${e.note ? `<div class="activity-note">${esc(e.note)}</div>` : ''}
      ${Array.isArray(e.changes) && e.changes.length ? `<ul class="activity-changes">${e.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function render() {
    $('list').innerHTML = events.map(entryHtml).join('') || '<p class="muted">Nothing matches these filters.</p>';
    $('resultCount').textContent = total ? `Showing ${events.length} of ${total}` : '';
    if (events.length < total) {
      $('list').insertAdjacentHTML('beforeend', `<button class="btn activity-more" type="button" id="more">Show more (${total - events.length} older)</button>`);
      $('more').addEventListener('click', () => load(true));
    }
  }

  function summary(s) {
    $('sLogins').textContent = s.today.logins;
    $('sLoginsWeek').textContent = `${s.week.logins} in the last 7 days`;
    $('sPeople').textContent = s.today.people;
    $('sChanges').textContent = s.today.changes;
    $('sChangesWeek').textContent = `${s.week.changes} in the last 7 days`;
    $('sFailed').textContent = s.today.failedLogins;
    $('sFailedWeek').textContent = `${s.week.failedLogins} in the last 7 days`;
    $('failedTile').classList.toggle('alert', s.today.failedLogins > 0);
  }

  async function load(more = false) {
    const mine = (loading += 1);
    try {
      const res = await fetch('/api/activity?' + params(more ? events.length : 0), { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
      if (mine !== loading) return;
      events = more ? events.concat(json.events) : json.events;
      total = json.total;
      summary(json.summary);
      const person = $('fPerson');
      const picked = person.value;
      person.length = 1;
      json.people.forEach((p) => person.add(new Option(p, p)));
      person.value = json.people.includes(picked) ? picked : '';
      render();
    } catch (err) {
      if (mine === loading) $('list').innerHTML = `<p class="muted">Could not load the activity: ${esc(err.message)}</p>`;
    }
  }

  const reload = () => { clearTimeout(timer); timer = setTimeout(() => load(false), 250); };
  ['fPerson', 'fType', 'fFrom', 'fTo'].forEach((id) => $(id).addEventListener('change', reload));
  $('fSearch').addEventListener('input', reload);
  $('refresh').addEventListener('click', () => load(false));

  document.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    const r = b.dataset.range;
    const today = new Date();
    if (r === 'all') { $('fFrom').value = ''; $('fTo').value = ''; } else {
      const from = new Date(today);
      from.setDate(from.getDate() - (r === 'today' ? 0 : Number(r) - 1));
      $('fFrom').value = dateInput(from);
      $('fTo').value = dateInput(today);
    }
    load(false);
  }));

  // Starts the record again from zero (Admin only). The server notes who cleared it as the first entry.
  $('clear').addEventListener('click', async () => {
    const yes = await NiecUI.confirm('Every login and change on record is deleted and the record starts again from zero. This cannot be undone.',
      { title: 'Clear all saved activity?', confirmText: 'Clear activity', danger: true });
    if (!yes) return;
    try {
      const res = await fetch('/api/activity/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
      $('fPerson').value = '';
      load(false);
    } catch (err) {
      $('list').innerHTML = `<p class="muted">Could not clear the activity: ${esc(err.message)}</p>`;
    }
  });

  // ---- Restore data (Admin only; the server checks again) ----
  const KIND = { daily: 'Daily backup', manual: 'Backup made by hand', 'before-restore': 'Saved before a restore' };
  const size = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const restoreSay = (text, error) => { $('restoreMsg').textContent = text || ''; $('restoreMsg').className = 'msg' + (error ? ' error' : ''); };
  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
    return json;
  }

  // The little panel under a row: what to restore, then the final button.
  function restorePanel(b, row) {
    const old = document.getElementById('restoreChoice');
    if (old) old.remove();
    const tr = el('tr'); tr.id = 'restoreChoice';
    const td = el('td'); td.colSpan = 6;
    td.append(el('b', '', `Restore from ${b.id}`));
    const box = el('div', 'filter-row'); box.style.marginTop = '8px';
    const parts = [['students', `Students${b.counts && b.counts.students != null ? ` (${b.counts.students})` : ''}`], ['facts', `Fact File${b.counts && b.counts.facts != null ? ` (${b.counts.facts})` : ''}`], ['partners', `Partner Universities${b.counts && b.counts.partners != null ? ` (${b.counts.partners})` : ''}`]];
    const boxes = parts.map(([key, label]) => {
      const l = el('label'); l.style.flexDirection = 'row'; l.style.gap = '6px'; l.style.alignItems = 'center';
      const c = el('input'); c.type = 'checkbox'; c.checked = true; c.value = key; c.style.width = 'auto';
      l.append(c, document.createTextNode(label));
      box.append(l);
      return c;
    });
    const go = el('button', 'btn btn-danger btn-sm', 'Restore these'); go.type = 'button';
    const cancel = el('button', 'btn btn-sm', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => tr.remove());
    go.addEventListener('click', async () => {
      const chosen = boxes.filter((c) => c.checked).map((c) => c.value);
      if (!chosen.length) { restoreSay('Tick at least one thing to restore.', true); return; }
      const yes = await NiecUI.confirm(`The ${chosen.map((k) => ({ students: 'students', facts: 'Fact File', partners: 'Partner Universities' }[k])).join(', ')} will be replaced with the copy saved as ${b.id}. Anything changed since then is lost, except that today's data is saved first as a "before restore" backup.`,
        { title: 'Restore this backup?', confirmText: 'Restore', danger: true });
      if (!yes) return;
      go.disabled = true; restoreSay('Restoring...');
      try {
        const r = await post('/api/restore', { id: b.id, parts: chosen });
        tr.remove();
        restoreSay(`Restored ${r.restored.join(', ')}. The data as it was before is saved as ${r.safety}. Ask everyone to refresh their page.`);
        NiecUI.toast('Backup restored', { type: 'success' });
        loadBackups();
      } catch (err) { restoreSay(err.message, true); go.disabled = false; }
    });
    box.append(go, cancel);
    const preview = el('div'); preview.style.marginTop = '8px'; preview.style.fontSize = '13px';
    td.append(preview);
    td.append(box);
    tr.append(td);
    row.after(tr);
    // What a restore would change, so the decision is made knowing it (the same preview as on the backup pages).
    preview.textContent = 'Checking what a restore would change...';
    window.NiecBackup.loadCompare(b.id).then((compare) => {
      preview.replaceChildren();
      if (!compare) { preview.textContent = 'Could not work out what would change.'; return; }
      ['students', 'facts', 'partners'].forEach((key) => {
        const d = window.NiecBackup.describe(key, compare[key]);
        const line = el('div'); line.append(el('b', '', window.NiecBackup.NAMES[key][0].toUpperCase() + window.NiecBackup.NAMES[key].slice(1) + ': '), document.createTextNode(d.text));
        if (d.warn) line.style.color = 'var(--danger)';
        preview.append(line);
        if (d.names) { const n = el('div', '', d.names); n.style.color = 'var(--danger)'; n.style.marginLeft = '12px'; preview.append(n); }
      });
    });
  }

  async function loadBackups() {
    try {
      const res = await fetch('/api/restore/backups', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
      const n = json.now;
      $('restoreNow').textContent = `Right now: ${n.students == null ? '?' : n.students} students, ${n.facts} universities in the Fact File, ${n.partners} Partner Universities.`;
      const body = $('backupRows');
      if (!json.backups.length) { body.replaceChildren(Object.assign(el('tr'), {})); const td = el('td', 'muted', 'No backups yet. The first one is saved after 6 p.m., or press Back up now.'); td.colSpan = 6; body.firstChild.append(td); return; }
      body.replaceChildren(...json.backups.map((b) => {
        const tr = el('tr');
        const name = el('td'); name.append(el('b', '', b.id.replace(/^[a-z-]+?-(\d{4})/, '$1')), el('div', 'muted', KIND[b.kind] || b.kind));
        const c = b.counts;
        const holds = el('td', '', c ? `${c.students ?? '-'} students, ${c.facts ?? '-'} universities, ${c.partners ?? '-'} partners` : 'Could not be read');
        const act = el('td'); act.style.whiteSpace = 'nowrap';
        if (c) {
          const view = el('a', 'btn btn-sm', 'View'); view.href = `/students?backup=${encodeURIComponent(b.id)}`; view.target = '_blank'; view.rel = 'noopener';
          view.title = 'Opens this backup in a new tab: the real All Students, Fact File and Partner Universities pages as they were, read only';
          const btn = el('button', 'btn btn-sm', 'Restore'); btn.type = 'button'; btn.style.marginLeft = '6px'; btn.addEventListener('click', () => restorePanel(b, tr));
          act.append(view, btn);
        }
        const d = new Date(b.createdAt);
        tr.append(name, el('td', '', d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })), el('td', '', d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })), holds, el('td', '', size(b.bytes)), act);
        return tr;
      }));
    } catch (err) { $('backupRows').replaceChildren(Object.assign(el('tr'), {})); const td = el('td', 'muted', err.message); td.colSpan = 6; $('backupRows').firstChild.append(td); }
  }

  $('backupNow').addEventListener('click', async () => {
    $('backupNow').disabled = true; restoreSay('Saving...');
    try { const r = await post('/api/restore/backup-now'); restoreSay(`Saved as ${r.id}.`); loadBackups(); } catch (err) { restoreSay(err.message, true); }
    $('backupNow').disabled = false;
  });


  const tabNames = ['activity', 'restore'];
  function showTab(name) {
    tabNames.forEach((t) => { $('tab-' + t).setAttribute('aria-selected', String(t === name)); $('panel-' + t).hidden = t !== name; });
    if (name === 'restore') loadBackups();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* not important */ }
  }
  tabNames.forEach((t) => $('tab-' + t).addEventListener('click', () => showTab(t)));
  if (location.hash === '#restore') showTab('restore');

  load(false);
})();

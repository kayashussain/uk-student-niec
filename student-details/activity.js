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
    td.append(box);
    tr.append(td);
    row.after(tr);
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
          const view = el('button', 'btn btn-sm', 'View'); view.type = 'button'; view.addEventListener('click', () => openViewer(b));
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


  // ---- View a backup, read only, like a spreadsheet ----
  const ROWS_AT_A_TIME = 300;
  async function openViewer(b) {
    const box = $('viewer');
    box.hidden = false;
    const d = new Date(b.createdAt);
    const head = el('div', 'viewer-head');
    head.append(el('h2', '', `Backup ${b.id.replace(/^[a-z-]+?-(\d{4})/, '$1')}`));
    const close = el('button', 'btn btn-sm', 'Close'); close.type = 'button'; close.addEventListener('click', () => { box.hidden = true; box.replaceChildren(); });
    head.append(close);
    const sub = el('p', 'hint', `Saved ${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}. Read only: nothing here changes the live data.`);
    const tabs = el('div', 'viewer-tabs');
    const body = el('div');
    box.replaceChildren(head, sub, tabs, body);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const parts = [['students', 'Students'], ['facts', 'Fact File'], ['partners', 'Partner Universities']];
    const cache = {};
    async function show(part) {
      [...tabs.children].forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.part === part)));
      body.replaceChildren(el('p', 'muted', 'Loading...'));
      try {
        if (!cache[part]) {
          const res = await fetch(`/api/restore/view?id=${encodeURIComponent(b.id)}&part=${part}`, { cache: 'no-store' });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
          cache[part] = json;
        }
        if (part === 'students') drawSheets(body, cache[part].sheets);
        else drawItems(body, part, cache[part].items);
      } catch (err) { body.replaceChildren(el('p', 'muted', err.message)); }
    }
    parts.forEach(([key, label]) => { const t = el('button', 'btn btn-sm', label); t.type = 'button'; t.dataset.part = key; t.addEventListener('click', () => show(key)); tabs.append(t); });
    show('students');
  }

  // A table that looks like a sheet: row numbers, a header that stays put, grid lines. `rows` are arrays of text.
  function gridTable(columns, rows, shown) {
    const wrap = el('div', 'sheet-scroll');
    const table = el('table', 'grid');
    const hr = el('tr'); hr.append(Object.assign(el('th', 'rn', '#'), {}));
    columns.forEach((c) => hr.append(el('th', '', c)));
    table.append(Object.assign(el('thead'), {}));
    table.firstChild.append(hr);
    const tb = el('tbody');
    rows.slice(0, shown).forEach((r, i) => {
      const tr = el('tr'); tr.append(el('td', 'rn', String(i + 1)));
      r.forEach((v) => { const td = el('td', '', v); td.title = v; tr.append(td); });
      tb.append(tr);
    });
    table.append(tb);
    wrap.append(table);
    return wrap;
  }

  // A filterable, sheet-like table with "show more" for long lists.
  function sheetView(parent, columns, allRows, emptyText) {
    let q = '';
    let shown = ROWS_AT_A_TIME;
    const bar = el('div', 'viewer-head');
    const search = el('input', 'view-search'); search.type = 'search'; search.placeholder = 'Search in this sheet'; search.setAttribute('aria-label', 'Search in this sheet');
    const count = el('span', 'sheet-note');
    bar.append(search, count);
    const holder = el('div');
    const more = el('button', 'btn btn-sm', 'Show more'); more.type = 'button'; more.style.marginTop = '8px';
    parent.append(bar, holder, more);
    function draw() {
      const rows = q ? allRows.filter((r) => r.some((v) => v.toLowerCase().includes(q))) : allRows;
      count.textContent = rows.length ? `${Math.min(shown, rows.length)} of ${rows.length} rows` : '';
      if (!rows.length) { holder.replaceChildren(el('p', 'muted', emptyText)); more.hidden = true; return; }
      holder.replaceChildren(gridTable(columns, rows, shown));
      more.hidden = rows.length <= shown;
    }
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); shown = ROWS_AT_A_TIME; draw(); });
    more.addEventListener('click', () => { shown += ROWS_AT_A_TIME; draw(); });
    draw();
  }

  function drawSheets(body, sheets) {
    const tabs = el('div', 'viewer-tabs');
    const holder = el('div');
    body.replaceChildren(tabs, holder);
    function open(sheet) {
      [...tabs.children].forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.id === sheet.id)));
      holder.replaceChildren();
      holder.append(el('p', 'sheet-note', `${sheet.rows.length} student${sheet.rows.length === 1 ? '' : 's'} in this sheet${sheet.hidden ? ' (an earlier intake)' : ''}.`));
      sheetView(holder, sheet.columns, sheet.rows.map((r) => sheet.columns.map((c) => String(r[c] ?? ''))), 'No students in this sheet.');
    }
    sheets.forEach((sh) => { const t = el('button', 'btn btn-sm', `${sh.name} (${sh.rows.length})`); t.type = 'button'; t.dataset.id = sh.id; t.addEventListener('click', () => open(sh)); tabs.append(t); });
    if (sheets.length) open(sheets.find((s) => !s.hidden) || sheets[0]); else body.append(el('p', 'muted', 'No sheets in this backup.'));
  }

  function drawItems(body, part, items) {
    body.replaceChildren();
    const flat = (t) => String(t || '').split('\n').map((l) => l.replace(/^\s*(?:[-*]\s+|##\s+)/, '').trim()).filter(Boolean).join('; ');
    if (part === 'facts') {
      sheetView(body, ['University', 'City', 'Intakes', 'Last updated'], items.map((u) => [u.name || '', u.city || '', (u.intakes || []).map((i) => i.name).join(', '), u.updatedAt ? new Date(u.updatedAt).toLocaleDateString() : '']), 'No universities in this backup.');
    } else {
      sheetView(body, ['University', 'Status', 'Campuses', 'Commission slabs', 'Payment terms', 'Agreement ends', 'Contacts (name, phone, email)', 'Notes'],
        items.map((u) => [u.name || '', u.status || '', (u.campuses || []).map((c) => [c.name, c.city].filter(Boolean).join(', ')).join(' | '), (u.slabs || []).map((s) => [s.level, s.students, s.commission].filter(Boolean).join(' ')).join(' | '), flat(u.paymentTerms), u.agreementEnd || '', (u.contacts || []).map((c) => [c.name, c.phone, c.email].filter(Boolean).join(', ')).join(' | '), flat(u.notes)]), 'No Partner Universities in this backup.');
    }
  }

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

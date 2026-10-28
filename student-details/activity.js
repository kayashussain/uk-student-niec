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
  const TYPE_NAMES = { logins: 'Logins and logouts', changes: 'Changes to students', security: 'Security', accounts: 'People and settings' };
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

  // The entries on screen, as a spreadsheet file.
  $('download').addEventListener('click', () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Time', 'Person', 'Action', 'Type', 'Where', 'Device', 'IP address', 'Details']].concat(events.map((e) => [
      e.time, e.account, e.action, TYPE_NAMES[e.category] || e.category, e.app || '', e.device, e.ip || '',
      [e.note, ...(e.changes || [])].filter(Boolean).join(' | '),
    ]));
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `niec-activity-${dateInput(new Date())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  load(false);
})();

// A backup opened on its own page (backup-view.html, Admin only): the students as sheets, the Fact File or the Partner
// Universities exactly as they were saved. Read only. Everything shown is put on the page as text, never as HTML.
(function () {
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('id') || '';
  const ROWS_AT_A_TIME = 500;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

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

  const PARTS = [['students', 'Students'], ['facts', 'Fact File'], ['partners', 'Partner Universities']];
  const cache = {};
  async function show(part) {
    [...$('parts').children].forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.part === part)));
    const body = $('body');
    body.replaceChildren(el('p', 'muted', 'Loading...'));
    try {
      if (!cache[part]) {
        const res = await fetch(`/api/restore/view?id=${encodeURIComponent(id)}&part=${part}`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
        cache[part] = json;
      }
      if (part === 'students') drawSheets(body, cache[part].sheets);
      else drawItems(body, part, cache[part].items);
    } catch (err) { body.replaceChildren(el('p', 'muted', err.message)); }
  }

  async function start() {
    if (!/^(daily|manual|before-restore)-\d{4}-\d{2}-\d{2}(-\d{4})?$/.test(id)) { $('body').replaceChildren(el('p', 'muted', 'Choose a backup from Activity, Restore data.')); return; }
    $('title').textContent = `Backup ${id.replace(/^[a-z-]+?-(\d{4})/, '$1')}`;
    document.title = `Backup ${id.replace(/^[a-z-]+?-(\d{4})/, '$1')} · UK Student NIEC`;
    PARTS.forEach(([key, label]) => { const t = el('button', 'btn btn-sm', label); t.type = 'button'; t.dataset.part = key; t.addEventListener('click', () => show(key)); $('parts').append(t); });
    try {
      const res = await fetch('/api/restore/backups', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      const b = (json.backups || []).find((x) => x.id === id);
      if (b) {
        const d = new Date(b.createdAt);
        $('when').textContent = `Saved ${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      }
    } catch (e) { /* the page still works without the date */ }
    show('students');
  }
  start();
})();

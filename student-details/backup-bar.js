// Looking at a backup (?backup=ID, Admin only; the server refuses anyone else).
//
// While a page is open on a backup, this bar is the ONLY navigation: the usual NIEC header (Dashboard, Student Details,
// Users, Activity, Fact File) is removed so nobody mistakes the backup for the live data or clicks away by accident.
// The bar says which backup it is, switches between the real Student Details, Fact File and Partner Universities pages
// on that backup, offers "Restore this backup" (with a preview of what a restore would change), and "Close", which is
// the only way out. The pages themselves read the backup's data and are read only (app.js, fact-file.js,
// fact-university.js, direct-page.js).
//
// On the Activity page the same helpers describe what a restore would change (window.NiecBackup).
(function () {
  const NAMES = { students: 'students', facts: 'Fact File', partners: 'Partner Universities' };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  // What restoring one part would do, in words: { text, warn, names }.
  function describe(part, c) {
    if (!c) return { text: 'This backup does not hold it.', warn: false, names: '' };
    const bits = [];
    bits.push(`Backup has ${c.backup}, there are ${c.now} now.`);
    if (!c.comeBack && !c.lost && !c.changed) bits.push('Identical: restoring changes nothing.');
    else {
      if (c.comeBack) bits.push(`${c.comeBack} come${c.comeBack === 1 ? 's' : ''} back.`);
      if (c.lost) bits.push(`${c.lost} added since would be lost.`);
      if (c.changed) bits.push(`${c.changed} changed since would go back to how they were.`);
    }
    const names = c.lostNames && c.lostNames.length ? `Would be lost: ${c.lostNames.join(', ')}${c.lost > c.lostNames.length ? ` and ${c.lost - c.lostNames.length} more` : ''}.` : '';
    return { text: bits.join(' '), warn: c.lost > 0 || c.changed > 0, names };
  }
  async function loadCompare(id) {
    try {
      const res = await fetch('/api/restore/compare?id=' + encodeURIComponent(id), { cache: 'no-store' });
      return res.ok ? await res.json() : null;
    } catch (e) { return null; }
  }
  window.NiecBackup = { describe, loadCompare, NAMES };

  const id = new URLSearchParams(location.search).get('backup') || '';
  if (!/^(daily|manual|before-restore)-\d{4}-\d{2}-\d{2}(-\d{4}(\d{2})?)?$/.test(id)) return;
  document.body.dataset.backup = '1';

  const style = el('style');
  style.textContent = `
    .backup-bar { flex: 0 0 auto; position: sticky; top: 0; z-index: 50; background: #fff4d6; color: #5c3b00; border-bottom: 2px solid #e0a100; padding: 10px 16px; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    @media (prefers-color-scheme: dark) { .backup-bar { background: #3a2d10; color: #fcd34d; border-color: #b8860b; } }
    .backup-bar .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
    .backup-bar .title { font-size: 15px; }
    .backup-bar .spacer { flex: 1; }
    .backup-bar a.tab, .backup-bar button { font: inherit; font-size: 13px; padding: 5px 12px; border-radius: 7px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer; text-decoration: none; }
    .backup-bar a.tab[aria-current="page"] { background: #e0a100; color: #1c1300; border-color: #e0a100; font-weight: 700; }
    .backup-bar button.go { background: #b42318; border-color: #b42318; color: #fff; font-weight: 600; }
    .backup-bar button:disabled { opacity: .6; cursor: default; }
    .backup-bar .panel { margin-top: 10px; padding-top: 10px; border-top: 1px dashed currentColor; }
    .backup-bar .part { display: block; margin: 6px 0; }
    .backup-bar .part .what { display: flex; gap: 8px; align-items: flex-start; }
    .backup-bar .part .detail { margin-left: 26px; font-size: 13px; }
    .backup-bar .part .warn { font-weight: 600; }
    body[data-backup] #status, body[data-backup] #presence { display: none !important; }
  `;
  document.head.append(style);

  // The usual header is not shown on a backup (see the top of this file).
  const header = document.querySelector('.niec-header');
  if (header) header.remove();

  const bar = el('div', 'backup-bar');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Viewing a backup');
  const row = el('div', 'row');
  const title = el('strong', 'title', 'Viewing backup');
  const when = el('span', '', id.replace(/^[a-z-]+?-(\d{4})/, '$1'));
  row.append(title, when);
  [['/students', 'Students'], ['/fact-file', 'Fact File'], ['/partner-universities', 'Partner Universities']].forEach(([path, label]) => {
    const a = el('a', 'tab', label);
    a.href = `${path}?backup=${encodeURIComponent(id)}`;
    if (location.pathname === path) a.setAttribute('aria-current', 'page');
    row.append(a);
  });
  row.append(el('span', 'spacer'));
  const restore = el('button', '', 'Restore this backup'); restore.type = 'button';
  const close = el('button', '', 'Close'); close.type = 'button';
  row.append(restore, close);
  const panel = el('div', 'panel'); panel.hidden = true;
  bar.append(row, panel);
  document.body.prepend(bar);

  // Close is the only way out. The backup opened in its own tab, so the tab closes; if the browser does not allow that,
  // the Restore data page takes its place.
  close.addEventListener('click', () => {
    window.close();
    setTimeout(() => { location.href = '/activity#restore'; }, 250);
  });

  // Nothing on a backup page may lead out of it by accident: links inside it keep the backup, any other link does nothing.
  const INSIDE = ['/students', '/fact-file', '/partner-universities'];
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || a.getAttribute('href').startsWith('#') || a.closest('.backup-bar')) return;
    let url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    if (url.searchParams.get('backup') === id) return;
    e.preventDefault();
    if (INSIDE.includes(url.pathname)) { url.searchParams.set('backup', id); location.href = url.pathname + url.search; }
  }, true);

  let meta = null;
  fetch('/api/restore/backups', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((json) => {
    meta = json && (json.backups || []).find((b) => b.id === id);
    if (meta) {
      const d = new Date(meta.createdAt);
      when.textContent = `${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    }
  }).catch(() => {});

  restore.addEventListener('click', async () => {
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.replaceChildren(el('div', '', 'Checking what a restore would change...'));
    panel.hidden = false;
    const compare = await loadCompare(id);
    const keys = ['students', 'facts', 'partners'];
    const intro = el('div', '', 'Choose what to put back. Anything you leave unticked stays as it is now. The data as it is right now is saved first as a "before restore" backup, so a restore can be undone.');
    const list = el('div');
    const boxes = keys.map((key) => {
      const d = describe(key, compare ? compare[key] : null);
      const label = el('label', 'part');
      const top = el('span', 'what');
      const b = el('input'); b.type = 'checkbox'; b.value = key; b.checked = Boolean(compare && compare[key]); b.disabled = Boolean(compare && !compare[key]);
      top.append(b, el('b', '', NAMES[key][0].toUpperCase() + NAMES[key].slice(1)));
      label.append(top);
      if (compare) {
        const detail = el('div', 'detail' + (d.warn ? ' warn' : ''), d.text);
        label.append(detail);
        if (d.names) label.append(el('div', 'detail warn', d.names));
      }
      list.append(label);
      return b;
    });
    const go = el('button', 'go', 'Restore these'); go.type = 'button';
    const cancel = el('button', '', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => { panel.hidden = true; });
    const out = el('div'); out.style.marginTop = '8px'; out.setAttribute('role', 'status');
    const actions = el('div'); actions.style.marginTop = '8px'; actions.style.display = 'flex'; actions.style.gap = '8px';
    actions.append(go, cancel);
    go.addEventListener('click', async () => {
      const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
      if (!chosen.length) { out.textContent = 'Tick at least one thing to restore.'; return; }
      const yes = await window.NiecUI.confirm(`The ${chosen.map((k) => NAMES[k]).join(', ')} will be replaced with the backup from ${when.textContent}. Anything changed since then is lost, except that today's data is saved first as a "before restore" backup.`,
        { title: 'Restore this backup?', confirmText: 'Restore', danger: true });
      if (!yes) return;
      go.disabled = true; out.textContent = 'Restoring...';
      try {
        const res = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, parts: chosen }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
        list.hidden = true; actions.hidden = true; intro.hidden = true;
        out.textContent = `Restored ${json.restored.join(', ')}. The data as it was before is saved as ${json.safety}. Ask everyone to refresh their page. `;
        const live = el('a', 'tab', 'Open the live data'); live.href = '/students'; 
        out.append(live);
      } catch (err) { out.textContent = err.message; go.disabled = false; }
    });
    panel.replaceChildren(intro, list, actions, out);
  });
})();

// The bar shown at the top of Student Details, the Fact File and Partner Universities when a page is opened on an earlier
// daily backup (?backup=ID, Admin only; the server refuses anyone else). It says which backup this is, switches between the
// three real pages on the same backup, and offers "Restore this backup" so the decision is made after looking at everything.
// The pages themselves read the backup's data and are read only (see app.js, fact-file.js, fact-university.js, direct-page.js).
(function () {
  const id = new URLSearchParams(location.search).get('backup') || '';
  if (!/^(daily|manual|before-restore)-\d{4}-\d{2}-\d{2}(-\d{4})?$/.test(id)) return;
  document.body.dataset.backup = '1';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  const style = el('style');
  style.textContent = `
    .backup-bar { flex: 0 0 auto; background: #fff4d6; color: #5c3b00; border-bottom: 2px solid #e0a100; padding: 8px 16px; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    @media (prefers-color-scheme: dark) { .backup-bar { background: #3a2d10; color: #fcd34d; border-color: #b8860b; } }
    .backup-bar .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
    .backup-bar .spacer { flex: 1; }
    .backup-bar a.tab, .backup-bar button { font: inherit; font-size: 13px; padding: 4px 11px; border-radius: 7px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer; text-decoration: none; }
    .backup-bar a.tab[aria-current="page"] { background: #e0a100; color: #1c1300; border-color: #e0a100; font-weight: 700; }
    .backup-bar button.go { background: #b42318; border-color: #b42318; color: #fff; font-weight: 600; }
    .backup-bar .panel { margin-top: 8px; padding-top: 8px; border-top: 1px dashed currentColor; }
    .backup-bar label { display: inline-flex; gap: 6px; align-items: center; margin-right: 14px; }
    body[data-backup] #status, body[data-backup] #presence { display: none !important; }
  `;
  document.head.append(style);

  const bar = el('div', 'backup-bar');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'You are looking at a backup');
  const row = el('div', 'row');
  const title = el('strong', '', `Viewing the backup ${id.replace(/^[a-z-]+?-(\d{4})/, '$1')}`);
  const when = el('span', '');
  row.append(title, when);
  [['/students', 'Students'], ['/fact-file', 'Fact File'], ['/partner-universities', 'Partner Universities']].forEach(([path, label]) => {
    const a = el('a', 'tab', label);
    a.href = `${path}?backup=${encodeURIComponent(id)}`;
    if (location.pathname === path) a.setAttribute('aria-current', 'page');
    row.append(a);
  });
  row.append(el('span', 'spacer'));
  const restore = el('button', '', 'Restore this backup…'); restore.type = 'button';
  const close = el('a', 'tab', 'Close'); close.href = '/activity#restore';
  row.append(restore, close);
  const note = el('div', '', 'Read only: this is how everything looked then. Nothing you do here changes the live data.');
  note.style.fontSize = '12px';
  const panel = el('div', 'panel'); panel.hidden = true;
  bar.append(row, note, panel);
  const header = document.querySelector('.niec-header');
  if (header) header.after(bar); else document.body.prepend(bar);

  let meta = null;
  fetch('/api/restore/backups', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((json) => {
    meta = json && (json.backups || []).find((b) => b.id === id);
    if (meta) {
      const d = new Date(meta.createdAt);
      when.textContent = `saved ${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    }
  }).catch(() => {});

  restore.addEventListener('click', () => {
    if (!panel.hidden) { panel.hidden = true; return; }
    const c = (meta && meta.counts) || {};
    const parts = [['students', 'Students', c.students], ['facts', 'Fact File', c.facts], ['partners', 'Partner Universities', c.partners]];
    panel.replaceChildren(el('div', '', 'Choose what to put back. The data as it is right now is saved first as a "before restore" backup, so this can be undone.'));
    const line = el('div'); line.style.marginTop = '6px';
    const boxes = parts.map(([key, label, n]) => {
      const l = el('label'); const b = el('input'); b.type = 'checkbox'; b.checked = true; b.value = key;
      l.append(b, document.createTextNode(label + (n != null ? ` (${n})` : '')));
      line.append(l);
      return b;
    });
    const go = el('button', 'go', 'Restore these'); go.type = 'button';
    const cancel = el('button', '', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', () => { panel.hidden = true; });
    go.addEventListener('click', async () => {
      const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
      if (!chosen.length) { out.textContent = 'Tick at least one thing to restore.'; return; }
      const names = { students: 'students', facts: 'Fact File', partners: 'Partner Universities' };
      const yes = await window.NiecUI.confirm(`The ${chosen.map((k) => names[k]).join(', ')} will be replaced with the backup ${id}. Anything changed since then is lost, except that today's data is saved first as a "before restore" backup.`,
        { title: 'Restore this backup?', confirmText: 'Restore', danger: true });
      if (!yes) return;
      go.disabled = true; out.textContent = 'Restoring...';
      try {
        const res = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, parts: chosen }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
        line.hidden = true;
        out.textContent = `Restored ${json.restored.join(', ')}. The data as it was before is saved as ${json.safety}. `;
        const live = el('a', 'tab', 'Open the live data'); live.href = '/students';
        out.append(live);
      } catch (err) { out.textContent = err.message; go.disabled = false; }
    });
    line.append(go, cancel);
    const out = el('div'); out.style.marginTop = '6px'; out.setAttribute('role', 'status');
    panel.append(line, out);
    panel.hidden = false;
  });
})();

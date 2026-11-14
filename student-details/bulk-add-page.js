// Add many students at once, all with the same stage, source and event or marketing tag. Paste one student a line:
// "Name, email, phone" (a tab between the parts works too, so a copy from Excel can be pasted as it is), or upload an Excel (.xlsx) or CSV file.
(function () {
  const { el, h, api, field } = window.Portal;
  const F = window.CardFields;
  const view = document.getElementById('view');
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  let lists = null;
  let rows = [];

  // Reading the file and checking its lines is shared with the event upload on Events and marketing (student-file.js).
  const { readFile, checkRows } = window.StudentFile;

  function render() {
    const wrap = el('div');
    const head = el('div', 'p-head');
    const title = el('div');
    title.append(el('h1', '', 'Add many students'), el('p', '', 'Choose the stage and where the students came from once, upload an Excel or CSV file, and they are all added with the same source.'));
    head.append(title, h('a', { class: 'btn', href: '/students' }, 'Back to All Students'));
    wrap.append(head);

    const set = el('section', 'p-card');
    set.append(el('h2', '', '1. Where they came from'));
    const form = el('div', 'p-form');
    const intake = field('Intake', { kind: 'select', choices: lists.intakes.map((i) => [i.id, i.name]), value: lists.intakes.length ? lists.intakes[lists.intakes.length - 1].id : '' });
    const stage = field('Stage', { kind: 'select', choices: lists.stages, value: 'Inquiry' });
    const dept = lists.departments.length > 1 ? field('Team', { kind: 'select', choices: lists.departments.map((d) => [d.id, d.label]), value: lists.departments[0].id }) : null;
    const branchOnly = lists.departments.length > 0 && lists.departments.every((d) => d.source);
    const picker = branchOnly ? null : window.SourcePicker.create({ lists });
    const isTeamUser = lists.departments.length > 0;
    if (isTeamUser) { stage.wrap.hidden = true; }
    form.append(intake.wrap, stage.wrap);
    if (dept) form.append(dept.wrap);
    if (picker) picker.nodes.forEach((n) => form.append(n));
    set.append(form);
    if (isTeamUser) set.append(el('p', 'p-muted p-small', 'New students start at the first stage of your team: ' + lists.departments.map((d) => d.start).filter(Boolean).join(' or ') + '.'));
    set.append(el('p', 'p-muted p-small', 'The event or marketing list comes from the Events and marketing page. Teams add students at the stage and intake their own rules allow.'));
    wrap.append(set);

    const paste = el('section', 'p-card');
    paste.append(el('h2', '', '2. Upload the students'));
    const out = el('div');
    const bar = el('div', 'p-bar');
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add them all');
    go.disabled = true;
    bar.append(go);
    const pick = el('input'); pick.type = 'file'; pick.accept = '.xlsx,.csv'; pick.setAttribute('aria-label', 'Upload an Excel or CSV file');
    const fileRow = el('div', 'p-bar');
    const sample = h('a', { class: 'p-link', href: 'data:text/csv;charset=utf-8,' + encodeURIComponent('First name,Last name,Email,Phone\nSita,Sharma,sita@example.com,9800000001\nRam,Thapa,ram@example.com,9800000002\n'), download: 'students-example.csv' }, 'Download an example file');
    fileRow.append(pick, sample);
    paste.append(el('p', 'p-muted', 'Choose an Excel (.xlsx) or CSV file. The first row holds the headings: First name, Last name, Email and Phone (a single Name column also works). The list is checked first: bad lines and students already on the sheet are skipped, and you see why.'), fileRow, out, bar);
    wrap.append(paste);

    // Students who are already on the sheet (same email or phone) are marked so the list says they will be skipped.
    const markExisting = async () => {
      try { const r = await api('/api/students/check', { rows: rows.map((x) => ({ email: x.email, phone: x.phone })) }); rows.forEach((x, i) => { x.exists = r.results[i] && r.results[i].exists ? r.results[i].name : ''; }); } catch (e) { /* the server still skips them when adding */ }
    };
    const showRows = () => {
      const checks = checkRows(rows);
      const ready = checks.filter((c) => !c.skip).length;
      const skipped = checks.length - ready;
      out.replaceChildren(el('p', '', `${rows.length} ${rows.length === 1 ? 'line' : 'lines'} found: ${ready} will be added${skipped ? `, ${skipped} will be skipped` : ''}.`));
      const t = el('table', 'p-table');
      t.append(h('thead', {}, h('tr', {}, ...['Name', 'Email', 'Phone', 'Check'].map((x) => el('th', '', x)))));
      const tb = el('tbody');
      rows.slice(0, 200).forEach((r, i) => tb.append(h('tr', {}, el('td', '', `${r.first} ${r.last}`.trim() || '(no name)'), el('td', '', r.email), el('td', '', r.phone), el('td', checks[i].skip ? 'p-bad' : 'p-muted', checks[i].note))));
      t.append(tb); out.append(t);
      go.disabled = !ready;
    };
    pick.addEventListener('change', async () => {
      const f = pick.files && pick.files[0];
      if (!f) return;
      try { rows = await readFile(f); await markExisting(); showRows(); } catch (e) { out.replaceChildren(el('div', 'p-notice bad', 'Could not read the file: ' + e.message)); }
    });
    const pickValue = () => (picker ? picker.value() : { source: '', detail: '', remarks: '' });
    const sourceText = () => { const v = pickValue(); return v.source ? [v.source, v.detail, v.remarks].filter(Boolean).join(': ') : 'your branch'; };
    go.addEventListener('click', async () => {
      if (picker && !pickValue().source) { say('Choose where the students came from first.', true); return; }
      if (picker && pickValue().group === 'Branch' && !pickValue().branch) { say('Choose which branch.', true); return; }
      if (picker && picker.check()) { say(picker.check(), true); return; }
      const checks = checkRows(rows);
      const sendRows = rows.filter((_, i) => !checks[i].skip);
      if (!sendRows.length) return;
      if (!(await window.NiecUI.confirm(`Add ${sendRows.length} students with the source "${sourceText()}"?`, { confirmText: 'Add them' }))) return;
      go.disabled = true;
      try {
        const r = await api('/api/students/bulk', { rows: sendRows, sheetId: intake.input.value, stage: stage.input.value, dept: dept ? dept.input.value : undefined, source: pickValue().source, sourceDetail: pickValue().detail, sourceRemarks: pickValue().remarks, sourcePlatform: pickValue().platform || '', sourceWay: pickValue().way || '' });
        const added = r.results.filter((x) => x.ok).length;
        const skippedLines = rows.filter((_, i) => checks[i].skip).map((x, k) => ({ name: `${x.first} ${x.last}`.trim(), note: checks.filter((c) => c.skip)[k].note }));
        out.replaceChildren(el('div', `p-notice ${added === r.results.length && !skippedLines.length ? 'ok' : 'warn'}`, `${added} of ${rows.length} lines added${skippedLines.length ? `, ${skippedLines.length} skipped` : ''}.`), ...r.results.filter((x) => x.ok).map((x) => el('div', 'p-sent', `Added: ${x.name}`)), ...skippedLines.map((x) => el('div', 'p-sent', `Skipped: ${x.name || '(no name)'}: ${x.note}`)), ...r.results.filter((x) => !x.ok).map((x) => el('div', 'p-sent', `${x.name || '(no name)'}: ${x.error}`)));
        say(`${added} students added`);
        rows = [];
      } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); go.disabled = false; }
    });
    view.replaceChildren(wrap);
  }

  api('/api/card-lists').then((l) => { lists = l; render(); }).catch((e) => view.replaceChildren(el('div', 'p-card', e.message)));
})();

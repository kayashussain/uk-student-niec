// Add many students at once, all with the same stage, source and event or marketing tag. Paste one student a line:
// "Name, email, phone" (a tab between the parts works too, so a copy from Excel can be pasted as it is), or upload an Excel (.xlsx) or CSV file.
(function () {
  const { el, h, api, field } = window.Portal;
  const F = window.CardFields;
  const view = document.getElementById('view');
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  let lists = null;
  let rows = [];

  // Splits one line at commas, semicolons or tabs, keeping "quoted, parts" together.
  function splitLine(line) {
    const out = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') { q = !q; continue; }
      if (!q && (ch === ',' || ch === ';' || ch === '\t')) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // What is wrong with a line, if anything: { skip, note }. Skipped lines are not added.
  function checkRows(list) {
    const seen = new Set();
    return list.map((r) => {
      const name = `${r.first} ${r.last}`.trim();
      if (r.exists) return { skip: true, note: `Already on the sheet${r.exists.trim() ? ' (' + r.exists + ')' : ''}, will be skipped` };
      if (r.badPhone) return { skip: true, note: `The phone number "${r.badPhone}" looks too short, skipped` };
      if (r.badBit) return { skip: true, note: `"${r.badBit}" does not look like a name, an email or a phone number, skipped` };
      if (!name) return { skip: true, note: 'No name, skipped' };
      if (r.phone && r.phone.replace(/\D/g, '').length < 6) return { skip: true, note: 'The phone number looks too short, skipped' };
      if (r.email && !EMAIL_OK.test(r.email)) return { skip: true, note: 'The email does not look right, skipped' };
      const keys = [];
      if (r.email) keys.push('e:' + r.email.toLowerCase());
      const digits = (r.phone || '').replace(/\D/g, '');
      if (digits.length >= 7) keys.push('p:' + digits);
      if (!keys.length) keys.push('n:' + name.toLowerCase());
      if (keys.some((k) => seen.has(k))) return { skip: true, note: 'Same email or phone as an earlier line, skipped' };
      keys.forEach((k) => seen.add(k));
      if (!r.email && !r.phone) return { skip: false, note: 'No email or phone yet' };
      return { skip: false, note: '' };
    });
  }
  // One line to a student: full name (or first and last name), email, phone, in any order.
  function parse(text) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 200).map((line) => {
      const parts = splitLine(line).map((p) => p.trim()).filter(Boolean);
      const email = parts.find((p) => /@/.test(p)) || '';
      const phone = parts.find((p) => /^[+\d][\d\s()-]{6,}$/.test(p)) || '';
      const badPhone = parts.find((p) => p !== email && p !== phone && /^[+\d][\d\s()-]*$/.test(p)) || '';
      const badBit = parts.find((p) => p !== email && p !== phone && p !== badPhone && (/\d/.test(p) || (/mail/i.test(p) && !/\s/.test(p)))) || '';
      const names = parts.filter((p) => p !== email && p !== phone && p !== badBit && p !== badPhone);
      let first = names[0] || '';
      let last = names[1] || '';
      if (!last && /\s/.test(first)) { const w = first.split(/\s+/); first = w[0]; last = w.slice(1).join(' '); }
      return { first, last, email, phone, badBit, badPhone };
    });
  }


  // Rows of a spreadsheet (arrays of cells) to students. A first row with headings (First name, Last name, Name, Email, Phone ...) names the
  // columns; without headings each row is read like a pasted line.
  function fromGrid(grid) {
    const cells = grid.map((r) => r.map((c) => String(c === null || c === undefined ? '' : (c.text || c.result || c)).trim()));
    const head = (cells[0] || []).map((c) => c.toLowerCase());
    const find = (re) => head.findIndex((c) => re.test(c));
    const col = { first: find(/first\s*name|given/), last: find(/last\s*name|surname|family/), name: find(/^(full\s*)?name$|student/), email: find(/e-?mail/), phone: find(/phone|mobile|contact|whatsapp|number/) };
    const hasHead = Object.values(col).some((i) => i >= 0);
    return (hasHead ? cells.slice(1) : cells).filter((r) => r.some(Boolean)).slice(0, 200).map((r) => {
      if (!hasHead) return parse(r.filter(Boolean).join('\t'))[0] || { first: '', last: '', email: '', phone: '' };
      let first = col.first >= 0 ? r[col.first] : '';
      let last = col.last >= 0 ? r[col.last] : '';
      if (!first && !last && col.name >= 0) { const w = (r[col.name] || '').split(/\s+/); first = w[0] || ''; last = w.slice(1).join(' '); }
      return { first, last, email: col.email >= 0 ? r[col.email] : '', phone: col.phone >= 0 ? r[col.phone] : '' };
    });
  }
  // A file the person chose: .xlsx is read with the Excel library (downloaded once, as for Export Excel), .csv as text.
  async function readFile(file) {
    if (/\.csv$/i.test(file.name)) return fromGrid((await file.text()).split(/\r?\n/).filter(Boolean).map((l) => splitLine(l)));
    const ExcelJS = await window.NiecSession.loadExcel();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const sheet = wb.worksheets[0];
    const grid = [];
    sheet.eachRow({ includeEmpty: false }, (row) => { grid.push(row.values.slice(1)); });
    return fromGrid(grid);
  }

  function render() {
    const wrap = el('div');
    const head = el('div', 'p-head');
    const title = el('div');
    title.append(el('h1', '', 'Add many students'), el('p', '', 'Choose the stage and where the students came from once, paste one student on each line, and they are all added with the same source and event or marketing tag.'));
    head.append(title, h('a', { class: 'btn', href: '/students' }, 'Back to Student Details'));
    wrap.append(head);

    const set = el('section', 'p-card');
    set.append(el('h2', '', '1. Where they came from'));
    const form = el('div', 'p-form');
    const intake = field('Intake', { kind: 'select', choices: lists.intakes.map((i) => [i.id, i.name]), value: lists.intakes.length ? lists.intakes[lists.intakes.length - 1].id : '' });
    const stage = field('Stage', { kind: 'select', choices: lists.stages, value: 'Inquiry' });
    const dept = lists.departments.length > 1 ? field('Team', { kind: 'select', choices: lists.departments.map((d) => [d.id, d.label]), value: lists.departments[0].id }) : null;
    const sources = Object.keys(F.SOURCE_DETAILS);
    const source = field('Student source', { kind: 'select', choices: sources, value: 'Events' });
    const holder = el('div', 'p-field');
    let detail = null;
    const draw = () => {
      const name = source.input.value;
      const choices = name === 'Agent' ? lists.partners : (lists.sourceOptions[name] || F.SOURCE_DETAILS[name] || []);
      const label = name === 'Events' ? 'Which event or marketing' : (F.SOURCE_DETAIL_LABEL[name] || (name === 'Agent' ? 'Which agent' : 'Where exactly'));
      const f2 = choices.length ? field(label, { kind: 'select', choices, value: choices[0] }) : field(label, { max: 120 });
      holder.replaceChildren(...f2.wrap.childNodes);
      detail = f2.input;
    };
    draw();
    source.input.addEventListener('change', draw);
    const isTeamUser = lists.departments.length > 0;
    if (isTeamUser) { stage.wrap.hidden = true; }
    form.append(intake.wrap, stage.wrap);
    if (dept) form.append(dept.wrap);
    form.append(source.wrap, holder);
    set.append(form);
    if (isTeamUser) set.append(el('p', 'p-muted p-small', 'New students start at the first stage of your team: ' + lists.departments.map((d) => d.start).filter(Boolean).join(' or ') + '.'));
    set.append(el('p', 'p-muted p-small', 'The event or marketing list comes from the Events and marketing page. Teams add students at the stage and intake their own rules allow.'));
    wrap.append(set);

    const paste = el('section', 'p-card');
    paste.append(el('h2', '', '2. Paste the students'));
    const box = el('textarea', 'p-input');
    box.style.minHeight = '200px';
    box.setAttribute('aria-label', 'Students, one on each line');
    box.placeholder = 'Sita Sharma, sita@example.com, 9800000001\nRam Thapa\tram@example.com\t9800000002';
    const out = el('div');
    const bar = el('div', 'p-bar');
    const check = h('button', { class: 'btn', type: 'button' }, 'Check the list');
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add them all');
    go.disabled = true;
    bar.append(check, go);
    const pick = el('input'); pick.type = 'file'; pick.accept = '.xlsx,.csv'; pick.setAttribute('aria-label', 'Upload an Excel or CSV file');
    const fileRow = el('div', 'p-bar');
    fileRow.append(pick, el('span', 'p-muted p-small', 'Or upload an Excel (.xlsx) or CSV file. A first row with headings such as First name, Last name, Email and Phone is used; without headings each row is Name, email, phone.'));
    paste.append(box, fileRow, bar, out);
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
    check.addEventListener('click', async () => { rows = parse(box.value); await markExisting(); showRows(); });
    pick.addEventListener('change', async () => {
      const f = pick.files && pick.files[0];
      if (!f) return;
      try { rows = await readFile(f); box.value = ''; await markExisting(); showRows(); } catch (e) { out.replaceChildren(el('div', 'p-notice bad', 'Could not read the file: ' + e.message)); }
    });
    go.addEventListener('click', async () => {
      const checks = checkRows(rows);
      const sendRows = rows.filter((_, i) => !checks[i].skip);
      if (!sendRows.length) return;
      if (!(await window.NiecUI.confirm(`Add ${sendRows.length} students with the source "${source.input.value}${detail && detail.value ? ': ' + detail.value : ''}"?`, { confirmText: 'Add them' }))) return;
      go.disabled = true;
      try {
        const r = await api('/api/students/bulk', { rows: sendRows, sheetId: intake.input.value, stage: stage.input.value, dept: dept ? dept.input.value : undefined, source: source.input.value, sourceDetail: detail ? detail.value : '' });
        const added = r.results.filter((x) => x.ok).length;
        const skippedLines = rows.filter((_, i) => checks[i].skip).map((x, k) => ({ name: `${x.first} ${x.last}`.trim(), note: checks.filter((c) => c.skip)[k].note }));
        out.replaceChildren(el('div', `p-notice ${added === r.results.length && !skippedLines.length ? 'ok' : 'warn'}`, `${added} of ${rows.length} lines added${skippedLines.length ? `, ${skippedLines.length} skipped` : ''}.`), ...r.results.filter((x) => x.ok).map((x) => el('div', 'p-sent', `Added: ${x.name}`)), ...skippedLines.map((x) => el('div', 'p-sent', `Skipped: ${x.name || '(no name)'}: ${x.note}`)), ...r.results.filter((x) => !x.ok).map((x) => el('div', 'p-sent', `${x.name || '(no name)'}: ${x.error}`)));
        say(`${added} students added`);
        box.value = ''; rows = [];
      } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); go.disabled = false; }
    });
    view.replaceChildren(wrap);
  }

  api('/api/card-lists').then((l) => { lists = l; render(); }).catch((e) => view.replaceChildren(el('div', 'p-card', e.message)));
})();

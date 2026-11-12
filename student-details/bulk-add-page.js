// Add many students at once, all with the same stage, source and event or marketing tag. Paste one student a line:
// "Name, email, phone" (a tab between the parts works too, so a copy from Excel can be pasted as it is).
(function () {
  const { el, h, api, field } = window.Portal;
  const F = window.CardFields;
  const view = document.getElementById('view');
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  let lists = null;
  let rows = [];

  // One line to a student: full name (or first and last name), email, phone, in any order.
  function parse(text) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 200).map((line) => {
      const parts = line.split(/\t|,|;/).map((p) => p.trim()).filter(Boolean);
      const email = parts.find((p) => /@/.test(p)) || '';
      const phone = parts.find((p) => /^[+\d][\d\s()-]{6,}$/.test(p)) || '';
      const names = parts.filter((p) => p !== email && p !== phone);
      let first = names[0] || '';
      let last = names[1] || '';
      if (!last && /\s/.test(first)) { const w = first.split(/\s+/); first = w[0]; last = w.slice(1).join(' '); }
      return { first, last, email, phone };
    });
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
    form.append(intake.wrap, stage.wrap);
    if (dept) form.append(dept.wrap);
    form.append(source.wrap, holder);
    set.append(form);
    set.append(el('p', 'p-muted p-small', 'The event or marketing list comes from the Events and marketing page. Teams add students at the stage and intake their own rules allow.'));
    wrap.append(set);

    const paste = el('section', 'p-card');
    paste.append(el('h2', '', '2. Paste the students'));
    const box = el('textarea', 'p-input');
    box.style.minHeight = '200px';
    box.placeholder = 'Sita Sharma, sita@example.com, 9800000001\nRam Thapa\tram@example.com\t9800000002';
    const out = el('div');
    const bar = el('div', 'p-bar');
    const check = h('button', { class: 'btn', type: 'button' }, 'Check the list');
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add them all');
    go.disabled = true;
    bar.append(check, go);
    paste.append(box, bar, out);
    wrap.append(paste);

    check.addEventListener('click', () => {
      rows = parse(box.value);
      const bad = rows.filter((r) => !r.first && !r.last);
      out.replaceChildren(el('p', '', `${rows.length} students found${bad.length ? `, ${bad.length} with no name (they will be skipped)` : ''}.`));
      const t = el('table', 'p-table');
      t.append(h('thead', {}, h('tr', {}, ...['Name', 'Email', 'Phone'].map((x) => el('th', '', x)))));
      const tb = el('tbody');
      rows.slice(0, 200).forEach((r) => tb.append(h('tr', {}, el('td', '', `${r.first} ${r.last}`.trim() || '(no name)'), el('td', '', r.email), el('td', '', r.phone))));
      t.append(tb); out.append(t);
      go.disabled = !rows.length;
    });
    go.addEventListener('click', async () => {
      if (!(await window.NiecUI.confirm(`Add ${rows.length} students with the source "${source.input.value}${detail && detail.value ? ': ' + detail.value : ''}"?`, { confirmText: 'Add them' }))) return;
      go.disabled = true;
      try {
        const r = await api('/api/students/bulk', { rows, sheetId: intake.input.value, stage: stage.input.value, dept: dept ? dept.input.value : undefined, source: source.input.value, sourceDetail: detail ? detail.value : '' });
        const added = r.results.filter((x) => x.ok).length;
        out.replaceChildren(el('div', `p-notice ${added === r.results.length ? 'ok' : 'warn'}`, `${added} of ${r.results.length} students added.`), ...r.results.filter((x) => !x.ok).map((x) => el('div', 'p-sent', `${x.name || '(no name)'}: ${x.error}`)));
        say(`${added} students added`);
        box.value = ''; rows = [];
      } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); go.disabled = false; }
    });
    view.replaceChildren(wrap);
  }

  api('/api/card-lists').then((l) => { lists = l; render(); }).catch((e) => view.replaceChildren(el('div', 'p-card', e.message)));
})();

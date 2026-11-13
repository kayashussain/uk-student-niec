// The Add student window on the sheet: the student's name and contact, where the student came from (always tagged with the same
// words, a missing platform or event can be added on the spot), and a first note. The student is added to the sheet the person is
// on, and the rest of what is known stays on the student card.
// window.NewStudent.open({ me, activeSheetId, defaultStage }) resolves with { id } once the student is added, or undefined.
(function (root) {
  const { el, h, api, field, dialog } = root.Portal;
  const F = root.CardFields;

  async function open({ me, activeSheetId = '', sheetName = '', defaultStage = 'Inquiry' } = {}) {
    let lists = { sourceOptions: {}, sourceLabels: F.SOURCE_DETAIL_LABEL, sourceCanAdd: F.SOURCE_CAN_ADD, partners: [], stages: [], departments: [] };
    try { lists = { ...lists, ...(await api('/api/card-lists')) }; } catch (e) { /* the form still works with the starting choices */ }
    const admin = me && me.role === 'admin';
    const options = (src) => (src === 'Agent' ? lists.partners : (lists.sourceOptions[src] || F.SOURCE_DETAILS[src] || []));
    return dialog(sheetName ? `Add a student to ${sheetName}` : 'Add a student', (body, close) => {
      const inputs = {};
      const form = el('div');
      // Many students at once (from an Excel or CSV file) is its own page: offered here, at the top of Add student.
      const many = el('div', 'ns-many');
      many.append(el('span', '', 'Adding many students at once?'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { close(); location.href = '/bulk-add'; } }, 'Add many students'));
      body.append(many);
      const group = (title, ...fields) => { form.append(el('h3', '', title)); const g = el('div', 'p-form p-form-2'); fields.forEach((x) => g.append(x.wrap)); form.append(g); };
      const make = (key, label, opts) => { const x = field(label, opts); inputs[key] = x.input; return x; };

      group('The student', make('FIRST NAME', 'First name', { max: 80 }), make('LAST NAME', 'Last name', { max: 80 }),
        make('EMAIL', 'Email', { max: 254, placeholder: 'student@example.com' }), make('CONTACT NUMBER', 'WhatsApp number', { max: 40, placeholder: '98XXXXXXXX' }));

      // Where the student came from: the source, then exactly which (the branch, the agent, the event ...). The choices are shared: a missing one is added once.
      // A branch account adds its own students, so the source is not asked: the server tags them with the branch.
      const branchOnly = !admin && lists.departments.length > 0 && lists.departments.every((d) => d.source);
      const picker = branchOnly ? null : root.SourcePicker.create({ lists });
      if (picker) { form.append(el('h3', '', 'How the student found us')); const g = el('div', 'p-form p-form-2'); picker.nodes.forEach((n) => g.append(n)); form.append(g); }

      const rest = [];
      if (admin) rest.push(make('stage', 'Stage', { kind: 'select', choices: lists.stages.length ? lists.stages : [defaultStage], value: defaultStage }));
      else if (lists.departments.length > 1) rest.push(make('dept', 'Add the student for', { kind: 'select', choices: lists.departments.map((d) => [d.id, `${d.label} (starts at ${d.start})`]), value: lists.departments[0].id }));
      if (rest.length) group('Stage', ...rest);
      const note = make('note', 'Note (optional)', { kind: 'area', wide: true, max: 2000, placeholder: 'What was discussed at the first contact.' });
      form.append(note.wrap);
      body.append(form);

      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add student');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), ok);
      body.append(msg, foot);
      ok.addEventListener('click', async () => {
        const v = (k) => (inputs[k] ? inputs[k].value : '');
        if (!v('FIRST NAME').trim() && !v('LAST NAME').trim()) { msg.textContent = "Please enter the student's name."; msg.className = 'p-msg error'; inputs['FIRST NAME'].focus(); return; }
        // Where the student came from must be complete (the event, or the campaign answer), so the student counts in its cost.
        const missing = picker ? picker.check() : '';
        if (missing) { msg.textContent = missing; msg.className = 'p-msg error'; return; }
        ok.disabled = true;
        msg.textContent = 'Adding…';
        msg.className = 'p-msg';
        const fields = {};
        ['FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER'].forEach((k) => { fields[k] = v(k); });
        const pick = picker ? picker.value() : { source: '', detail: '', remarks: '' };
        fields['STUDENT SOURCE'] = pick.source;
        try {
          const r = await api('/api/students/new', { fields, profile: { sourceDetail: pick.detail, sourceRemarks: pick.remarks }, stage: v('stage'), sheetId: activeSheetId, dept: v('dept'), note: v('note') });
          close(r);
        } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; ok.disabled = false; ok.focus(); }
      });
      form.addEventListener('input', () => { if (msg.classList.contains('error')) { msg.textContent = ''; msg.className = 'p-msg'; } });
      setTimeout(() => inputs['FIRST NAME'].focus(), 30);
    });
  }
  root.NewStudent = { open };
})(this);

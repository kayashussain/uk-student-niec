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

      // The order the owner asked for (14 Nov 2026): where the student starts, then the student as in the passport, then where they
      // came from, then remarks.
      const rest = [];
      if (admin) rest.push(make('stage', 'Stage', { kind: 'select', choices: lists.stages.length ? lists.stages : [defaultStage], value: defaultStage }));
      else if (lists.departments.length > 1) rest.push(make('dept', 'Add the student for', { kind: 'select', choices: lists.departments.map((d) => [d.id, `${d.label} (starts at ${d.start})`]), value: lists.departments[0].id }));
      if (rest.length) group('Where the student starts', ...rest);

      group('The student', make('FIRST NAME', 'First name', { max: 80 }), make('LAST NAME', 'Last name', { max: 80 }),
        make('EMAIL', 'Email', { max: 254, placeholder: 'student@example.com' }), make('CONTACT NUMBER', 'WhatsApp number', { max: 40, placeholder: '98XXXXXXXX' }),
        make('dob', 'Date of birth', { kind: 'date' }), make('passportNo', 'Passport number', { max: 20, placeholder: 'e.g. PA1234567' }),
        make('address', 'Address (as in the passport)', { max: 200, wide: true, placeholder: 'e.g. Butwal-11, Rupandehi' }),
        make('nationality', 'Nationality', { kind: 'select', choices: F.NATIONALITIES, value: 'Nepali' }));
      // From Application Stage on, the passport details are needed; an inquiry often has none yet (the owner, 14 Nov 2026).
      const passportNote = el('p', 'p-muted p-small ns-passport-note');
      form.append(passportNote);
      const stageNow = () => {
        if (inputs.stage) return inputs.stage.value;
        const d = (lists.departments || []).find((x) => x.id === (inputs.dept ? inputs.dept.value : (lists.departments[0] || {}).id));
        return d ? d.start : defaultStage;
      };
      const needsPassport = () => stageNow() && stageNow() !== 'Inquiry';
      const sayPassport = () => { passportNote.textContent = needsPassport() ? 'Date of birth, passport number and address are needed from Application Stage on.' : 'At Inquiry the passport details are optional: add them when the student applies.'; };
      [inputs.stage, inputs.dept].filter(Boolean).forEach((i) => i.addEventListener('change', sayPassport));
      sayPassport();

      // Where the student came from: the source, then exactly which (the branch, the agent, the event ...). The choices are shared: a missing one is added once.
      // A branch account adds its own students, so the source is not asked: the server tags them with the branch.
      const branchOnly = !admin && lists.departments.length > 0 && lists.departments.every((d) => d.source);
      const picker = branchOnly ? null : root.SourcePicker.create({ lists });
      if (picker) { form.append(el('h3', '', 'Student source')); const g = el('div', 'p-form p-form-2'); picker.nodes.forEach((n) => g.append(n)); form.append(g); }

      const note = make('note', 'Remarks (optional)', { kind: 'area', wide: true, max: 2000, placeholder: 'What was discussed at the first contact.' });
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
        if (needsPassport() && (!v('dob') || !v('passportNo').trim() || !v('address').trim())) { msg.textContent = 'Please fill in the date of birth, passport number and address (as in the passport): they are needed from Application Stage on.'; msg.className = 'p-msg error'; return; }
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
          const r = await api('/api/students/new', { fields, profile: { sourceDetail: pick.detail, sourceRemarks: pick.remarks, sourcePlatform: pick.platform || '', sourceWay: pick.way || '', dob: v('dob'), passportNo: v('passportNo').trim().toUpperCase(), address: v('address').trim(), nationality: v('nationality') }, stage: v('stage'), sheetId: activeSheetId, dept: v('dept'), note: v('note') });
          close(r);
        } catch (e) {
          const dup = e.body && e.body.duplicate;
          ok.disabled = false;
          if (!dup) { msg.textContent = e.message; msg.className = 'p-msg error'; ok.focus(); return; }
          // Already in ISR: never a second copy. Open them, or fill in only what is blank on them (nothing already there is replaced).
          msg.className = 'p-msg ns-dup';
          msg.replaceChildren(el('b', '', `${dup.name} is already in ISR`), el('span', '', ` (${dup.intake}, ${dup.stage || 'no stage'}${dup.source ? ', ' + dup.source : ''}), with this email or phone number.`));
          const row = el('div', 'p-bar');
          row.append(h('button', { class: 'btn', type: 'button', onclick: () => { close(); location.href = '/student?id=' + encodeURIComponent(dup.id); } }, 'Open their card'));
          if (dup.canFill) {
            row.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
              try {
                const r = await api('/api/students/merge', { id: dup.id, fields, profile: { sourceDetail: pick.detail, sourceRemarks: pick.remarks, sourcePlatform: pick.platform || '', sourceWay: pick.way || '', dob: v('dob'), passportNo: v('passportNo').trim().toUpperCase(), address: v('address').trim(), nationality: v('nationality') }, note: v('note') });
                window.NiecUI.toast(r.filled.length ? `Filled in ${r.filled.length} missing detail${r.filled.length === 1 ? '' : 's'} on ${dup.name}${r.differs.length ? '; the different ones are in a note on the card' : ''}.` : `Nothing was missing on ${dup.name}${r.differs.length ? '; the different details are in a note on the card' : ''}.`, { type: 'success' });
                close({ id: dup.id });
              } catch (err) { msg.textContent = err.message; msg.className = 'p-msg error'; }
            } }, 'Fill in what is missing'));
          }
          msg.append(row);
        }
      });
      form.addEventListener('input', () => { if (msg.classList.contains('error')) { msg.textContent = ''; msg.className = 'p-msg'; } });
      setTimeout(() => inputs['FIRST NAME'].focus(), 30);
    });
  }
  root.NewStudent = { open };
})(this);

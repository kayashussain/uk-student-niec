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
      const group = (title, ...fields) => { form.append(el('h3', '', title)); const g = el('div', 'p-form p-form-2'); fields.forEach((x) => g.append(x.wrap)); form.append(g); };
      const make = (key, label, opts) => { const x = field(label, opts); inputs[key] = x.input; return x; };

      group('The student', make('FIRST NAME', 'First name', { max: 80 }), make('LAST NAME', 'Last name', { max: 80 }),
        make('EMAIL', 'Email', { max: 254, placeholder: 'student@example.com' }), make('CONTACT NUMBER', 'WhatsApp number', { max: 40, placeholder: '98XXXXXXXX' }));

      // Where the student came from: the source, then exactly where. The choices are shared: a missing one is added once.
      const source = make('STUDENT SOURCE', 'Where did the student come from?', { kind: 'select', choices: Object.keys(F.SOURCE_DETAILS) });
      const detailBox = el('div', 'p-field');
      let detailInput = null;
      const drawDetail = () => {
        const src = source.input.value;
        const label = lists.sourceLabels[src] || F.SOURCE_DETAIL_LABEL[src] || 'Where exactly';
        const wrap = el('div');
        if (!src) { detailBox.replaceChildren(el('span', 'p-label', 'Where exactly'), Object.assign(el('input'), { disabled: true })); detailInput = null; return; }
        const f = field(label, { kind: 'select', choices: options(src) });
        detailInput = f.input;
        wrap.append(f.wrap);
        if (lists.sourceCanAdd.includes(src)) {
          const add = h('button', { class: 'p-link p-small', type: 'button', style: 'margin-top:4px' }, src === 'Events' ? '+ Add a new event' : '+ Add a missing choice');
          add.addEventListener('click', () => addChoice(src));
          wrap.append(add);
        }
        detailBox.replaceChildren(...wrap.childNodes);
      };
      // A new platform, class or event (with its day), saved once and offered to everyone.
      const addChoice = (src) => dialog(src === 'Events' ? 'Add an event' : 'Add a choice', (b2, close2) => {
        const name = field(src === 'Events' ? 'Name of the event' : 'The new choice', { max: 100, placeholder: src === 'Events' ? 'UK Study Abroad' : 'Snapchat' });
        const date = field('Day of the event', { kind: 'date' });
        const msg = el('div', 'p-msg');
        const foot = el('div', 'p-dialog-foot');
        foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close2() }, 'Cancel'));
        const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add');
        ok.addEventListener('click', async () => {
          try { const r = await api('/api/source-options', { source: src, name: name.input.value, date: date.input.value }); lists.sourceOptions = r.options; close2(r.value); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; }
        });
        foot.append(ok);
        const f = el('div', 'p-form p-form-2'); f.append(name.wrap); if (src === 'Events') f.append(date.wrap);
        b2.append(f, msg, foot);
      }).then((value) => { drawDetail(); if (value && detailInput) detailInput.value = value; });
      group('How the student found us', source, { wrap: detailBox });
      source.input.addEventListener('change', drawDetail);
      drawDetail();

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
        ok.disabled = true;
        msg.textContent = 'Adding…';
        msg.className = 'p-msg';
        const fields = {};
        ['FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER', 'STUDENT SOURCE'].forEach((k) => { fields[k] = v(k); });
        try {
          const r = await api('/api/students/new', { fields, profile: { sourceDetail: detailInput ? detailInput.value : '' }, stage: v('stage'), sheetId: activeSheetId, dept: v('dept'), note: v('note') });
          close(r);
        } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; ok.disabled = false; ok.focus(); }
      });
      form.addEventListener('input', () => { if (msg.classList.contains('error')) { msg.textContent = ''; msg.className = 'p-msg'; } });
      setTimeout(() => inputs['FIRST NAME'].focus(), 30);
    });
  }
  root.NewStudent = { open };
})(this);

// The Add student window on the sheet: asks for the student's details, where the student came from and who looks after
// them, then adds the student to the sheet (only the columns the sheet shows) and keeps the rest on the student card.
// window.NewStudent.open({ me, intakes, activeSheetId, stages, defaultStage }) resolves with { id } once the student is
// added, or undefined when the window is closed.
(function (root) {
  const { el, h, api, field, datalist, dialog } = root.Portal;
  const F = root.CardFields;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  async function open({ me, intakes = [], activeSheetId = '', defaultStage = 'Inquiry', departments = [] } = {}) {
    let lists = { people: [], partners: [], events: [], campaigns: [], stages: [], departments: [] };
    try { lists = await api('/api/card-lists'); } catch (e) { /* the form still works without the suggestions */ }
    const admin = me && me.role === 'admin';
    return dialog('Add a student', (body, close) => {
      const inputs = {};
      const form = el('div');
      const group = (title, ...fields) => { form.append(el('h3', '', title)); const g = el('div', 'p-form p-form-2'); fields.forEach((x) => g.append(x.wrap)); form.append(g); };
      const make = (key, label, opts) => { const x = field(label, opts); inputs[key] = x.input; return x; };

      group('The student',
        make('FIRST NAME', 'First name', { max: 80 }), make('LAST NAME', 'Last name', { max: 80 }),
        make('EMAIL', 'Email', { max: 254, placeholder: 'student@example.com' }), make('CONTACT NUMBER', 'WhatsApp number', { max: 40, placeholder: '98XXXXXXXX' }));

      // Where the student came from: the source, then exactly where.
      const source = make('STUDENT SOURCE', 'Where did the student come from?', { kind: 'select', choices: Object.keys(F.SOURCE_DETAILS) });
      const detail = make('sourceDetail', 'Where exactly', { max: 120 });
      const detailBox = detail.wrap;
      const redraw = () => {
        const s = source.input.value;
        const choices = F.SOURCE_DETAILS[s] || [];
        const label = F.SOURCE_DETAIL_LABEL[s] || 'Where exactly';
        const fresh = field(label, s === 'Events' ? { list: 'ns-events', placeholder: 'Choose an event or type its name and date', max: 120 }
          : s === 'Agent' ? { list: 'ns-agents', placeholder: 'Choose the B2B partner or type the name', max: 120 }
            : choices.length ? { kind: 'select', choices } : { max: 120, disabled: !s });
        detailBox.replaceChildren(...fresh.wrap.childNodes);
        inputs.sourceDetail = fresh.input;
        const refLabel = s === 'Reference' ? 'Name of the person who referred' : 'Name of a person, if there is one';
        referred.wrap.querySelector('.p-label').textContent = refLabel;
      };
      const referred = make('referredBy', 'Name of a person, if there is one', { max: 120 });
      const campaign = make('campaign', 'Campaign or advert (if from an advert)', { list: 'ns-campaigns', max: 120, placeholder: 'Scholarship advert, January intake' });
      group('How the student found NIEC', source, detail, referred, campaign);
      source.input.addEventListener('change', redraw);
      form.append(datalist('ns-events', lists.events), datalist('ns-agents', lists.partners || []), datalist('ns-campaigns', lists.campaigns), datalist('ns-people', lists.people));

      group('What the student wants',
        make('UNIVERSITY NAME', 'University (if already chosen)', { max: 160 }), make('COURSE NAME', 'Course (if already chosen)', { max: 160 }),
        make('studyLevel', 'Study level', { kind: 'select', choices: F.STUDY_LEVELS }), make('courseInterest', 'Subject interested in', { max: 160 }),
        make('preferredIntake', 'Intake wanted', { placeholder: 'January 2027', max: 60 }), make('budget', 'Budget for the first year (GBP)', { max: 60 }));

      const stageChoices = lists.stages.length ? lists.stages : [defaultStage];
      const rest = [
        make('counselor', 'Counselor', { list: 'ns-people', value: me ? me.name : '', max: 60 }),
        make('leadQuality', 'How promising', { kind: 'select', choices: F.LEAD_QUALITY.map((q) => [q.key, q.text]) }),
        make('inquiryDate', 'First inquiry day', { kind: 'date', value: today() }),
        make('followDate', 'Next follow-up day', { kind: 'date' }),
        make('followNote', 'What to do then', { max: 300, placeholder: 'Call about the documents' }),
      ];
      if (admin) {
        rest.push(make('sheetId', 'Intake', { kind: 'select', choices: intakes.map((i) => [i.id, i.name]), value: activeSheetId }));
        rest.push(make('stage', 'Stage', { kind: 'select', choices: stageChoices, value: defaultStage }));
      } else if (lists.departments.length > 1) {
        rest.push(make('dept', 'Add the student for', { kind: 'select', choices: lists.departments.map((d) => [d.id, `${d.label} (starts at ${d.start})`]), value: lists.departments[0].id }));
      }
      group('Looking after the student', ...rest);
      const note = make('note', 'First note', { kind: 'area', wide: true, max: 2000, placeholder: 'What was discussed at the first contact.' });
      form.append(note.wrap);
      body.append(form);
      redraw();
      if (admin && inputs.stage) inputs.stage.value = stageChoices.includes(defaultStage) ? defaultStage : 'Inquiry';

      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      const cancel = h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel');
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add student');
      foot.append(cancel, ok);
      body.append(msg, foot);
      ok.addEventListener('click', async () => {
        const v = (k) => (inputs[k] ? inputs[k].value : '');
        if (!v('FIRST NAME').trim() && !v('LAST NAME').trim()) { msg.textContent = "Please enter the student's name."; msg.className = 'p-msg error'; inputs['FIRST NAME'].focus(); return; }
        ok.disabled = true;
        msg.textContent = 'Adding…';
        msg.className = 'p-msg';
        const fields = {};
        ['FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER', 'STUDENT SOURCE', 'UNIVERSITY NAME', 'COURSE NAME'].forEach((k) => { fields[k] = v(k); });
        const profile = {};
        ['sourceDetail', 'referredBy', 'campaign', 'studyLevel', 'courseInterest', 'preferredIntake', 'budget', 'counselor', 'leadQuality', 'inquiryDate'].forEach((k) => { profile[k] = v(k); });
        try {
          const r = await api('/api/students/new', {
            fields, profile, stage: v('stage'), sheetId: v('sheetId'), dept: v('dept'), note: v('note'),
            followUp: v('followDate') ? { date: v('followDate'), note: v('followNote') } : null,
          });
          close(r);
        } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; ok.disabled = false; }
      });
      setTimeout(() => inputs['FIRST NAME'].focus(), 30);
    }, { wide: true });
  }
  root.NewStudent = { open };
})(this);

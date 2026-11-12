// One student's card (student.html), kept short: Details (where the student came from, the student, notes), University options
// and Send a message. The sheet's own details are changed on the sheet; the card never changes them except the Student Source,
// which is chosen here (it is no longer a column of the sheet).
(function () {
  const { el, h, api, day, when, fromToday, stagePill, initials, field, datalist, dialog, copy } = window.Portal;
  const F = window.CardFields;
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const embedded = params.get('embed') === '1';
  let data = null; // { student, card, can, me, mail, today }
  let lists = { people: [], partners: [], events: [], campaigns: [] };
  let templates = [];
  let chosenTemplate = '';
  let showAllNotes = false;
  const TABS = [['details', 'Details'], ['options', 'University options'], ['message', 'Send a message']];
  let tab = (location.hash || '#details').slice(1);
  const view = document.getElementById('view');
  const say = (text, error) => window.NiecUI.toast(text, { type: error ? 'error' : 'success' });

  if (embedded) {
    document.body.classList.add('p-embed');
    document.getElementById('closeEmbed').addEventListener('click', () => parent.postMessage({ niecCard: 'close' }, location.origin));
  }
  const can = () => data.can.edit;
  const profile = () => data.card.profile;
  async function save(path, body, okText) {
    try {
      const r = await api(`/api/cards/${id}/${path}`, body);
      if (r.card) data.card = r.card;
      if (okText) say(okText);
      return r;
    } catch (e) { say(e.message, true); throw e; }
  }

  // ---- the top: name, stage, contact ----
  function hero() {
    const s = data.student;
    const c = el('section', 'p-card p-hero');
    c.append(el('div', 'p-avatar', initials(s.name)));
    const mid = el('div');
    mid.append(el('h1', '', s.name));
    const line = el('div', 'p-hero-line');
    line.append(stagePill(s.stage), el('span', '', s.intake));
    if (s.source) line.append(el('span', 'p-chip', s.source + (profile().sourceDetail ? ': ' + profile().sourceDetail : '')));
    if (profile().leadQuality) line.append(el('span', 'p-chip', profile().leadQuality));
    mid.append(line);
    const facts = el('dl', 'p-facts');
    const fact = (k, v, href) => { if (!v) return; const d = el('div', 'p-fact'); const dd = el('dd'); if (href) { const a = el('a', '', v); a.href = href; dd.append(a); } else dd.textContent = v; d.append(el('dt', '', k), dd); facts.append(d); };
    fact('Email', s.email, s.email ? 'mailto:' + s.email : '');
    fact('WhatsApp', s.phone, F.whatsappNumber(s.phone) ? 'https://wa.me/' + F.whatsappNumber(s.phone) : '');
    fact('University', s.university);
    fact('Course', s.course);
    fact('Counselor', profile().counselor);
    fact('Application submitted', s.row['APPLICATION SUBMISSION DATE'] ? day(s.row['APPLICATION SUBMISSION DATE']) : '');
    fact('Offer received', s.row['OFFER RECEIVED DATE'] ? day(s.row['OFFER RECEIVED DATE']) : '');
    mid.append(facts);
    const act = el('div', 'p-hero-actions');
    act.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => select('message') }, 'Send a message'));
    c.append(mid, act);
    return c;
  }

  // ---- the follow-up strip ----
  function followStrip() {
    const f = data.card.followUp;
    const box = el('div', 'p-follow');
    if (!f) box.append(el('span', 'p-grow', 'No follow-up day set for this student.'));
    else {
      const diff = Math.round((Date.parse(f.date + 'T00:00:00Z') - Date.parse(data.today + 'T00:00:00Z')) / 86400000);
      box.classList.toggle('late', diff < 0);
      box.classList.toggle('today', diff === 0);
      const text = el('span', 'p-grow');
      text.append(el('b', '', 'Next follow-up: '), `${day(f.date)} (${fromToday(f.date, data.today)})${f.note ? ': ' + f.note : ''}`);
      box.append(text);
    }
    if (can()) {
      box.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => followDialog() }, f ? 'Change' : 'Set a day'));
      if (f) box.append(h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => followDialog(true) }, 'Mark done'));
    }
    return box;
  }
  function followDialog(done = false) {
    const f = data.card.followUp || {};
    return dialog(done ? 'Follow-up done' : 'Next follow-up', (body, close) => {
      const outcome = field('What came of it', { kind: 'area', max: 2000, wide: true, placeholder: 'Spoke to the student, documents promised for Friday.' });
      const date = field(done ? 'Next follow-up day (leave empty if there is none)' : 'Day', { kind: 'date', value: done ? '' : f.date });
      const what = field(done ? 'What to do then' : 'What to do', { value: done ? '' : f.note, placeholder: 'Call about the documents' });
      const form = el('div', 'p-form p-form-2');
      if (done) form.append(outcome.wrap);
      form.append(date.wrap, what.wrap);
      body.append(form);
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
      if (!done && f.date) foot.append(h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { await save('follow-up', { date: '' }, 'Follow-up cleared'); close(true); render(); } }, 'Clear'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      ok.addEventListener('click', async () => {
        try {
          await save('follow-up', done ? { done: true, outcome: outcome.input.value, nextDate: date.input.value, nextNote: what.input.value } : { date: date.input.value, note: what.input.value }, 'Saved');
          close(true); render();
        } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; }
      });
      foot.append(ok);
      body.append(msg, foot);
    });
  }

  // ---- Details ----
  function details() {
    const wrap = el('div');
    const lock = !can();
    const p = profile();
    const s = data.student;
    const inputs = {};

    const origin = el('section', 'p-card');
    origin.append(el('h2', '', 'Where the student came from'));
    origin.append(el('p', '', 'Say exactly where, so the Dashboard can show what each platform, event and B2B partner brings.'));
    const form = el('div', 'p-form');
    const sourceBox = field('Source', { kind: 'select', choices: Object.keys(F.SOURCE_DETAILS), value: s.source, disabled: !data.can.source });
    form.append(sourceBox.wrap);
    const detailHolder = el('div', 'p-field');
    const referred = field('Name of the person, if there is one', { value: p.referredBy, disabled: lock, max: 120 });
    const when1 = field('First inquiry day', { kind: 'date', value: p.inquiryDate, disabled: lock });
    inputs.referredBy = referred.input;
    inputs.inquiryDate = when1.input;
    const drawDetail = () => {
      const src = sourceBox.input.value;
      const choices = F.SOURCE_DETAILS[src] || [];
      const label = F.SOURCE_DETAIL_LABEL[src] || 'Where exactly';
      const current = inputs.sourceDetail ? inputs.sourceDetail.value : p.sourceDetail;
      const f2 = src === 'Events' ? field(label, { value: current, list: 'dl-events', placeholder: 'Choose an event or type its name and date', disabled: lock, max: 120 })
        : src === 'Agent' ? field(label, { value: current, list: 'dl-partners', placeholder: 'Choose the B2B partner or type the name', disabled: lock, max: 120 })
          : choices.length ? field(label, { kind: 'select', choices, value: current, disabled: lock }) : field(label, { value: current, disabled: lock || !src, max: 120 });
      detailHolder.replaceChildren(...f2.wrap.childNodes);
      inputs.sourceDetail = f2.input;
      referred.wrap.querySelector('.p-label').textContent = src === 'Reference' ? 'Name of the person who referred' : 'Name of a person, if there is one';
    };
    drawDetail();
    sourceBox.input.addEventListener('change', () => { inputs.sourceDetail = null; drawDetail(); });
    form.append(detailHolder, referred.wrap, when1.wrap);
    origin.append(form, datalist('dl-events', lists.events), datalist('dl-partners', lists.partners));
    if (!data.can.source && s.source && !lock) origin.append(el('p', 'p-muted p-small', 'The source of this student can only be changed by Admin.'));
    wrap.append(origin);

    const kind = el('section', 'p-card');
    kind.append(el('h2', '', 'The student'));
    kind.append(el('p', '', 'Who looks after the student and what the student has studied. The Fact File assistant and the document checklist read these.'));
    const f2 = el('div', 'p-form');
    const add = (key, labelText, opts, into = f2) => { const x = field(labelText, { value: p[key], disabled: lock, ...opts }); inputs[key] = x.input; into.append(x.wrap); };
    add('counselor', 'Counselor', { list: 'dl-people', max: 60 });
    add('studyLevel', 'Study level wanted', { kind: 'select', choices: F.STUDY_LEVELS });
    add('courseInterest', 'Course or subject wanted', { max: 160 });
    add('preferredIntake', 'Intake wanted', { placeholder: 'January 2027', max: 60 });
    add('qualification', 'Highest qualification', { kind: 'select', choices: F.QUALIFICATIONS });
    add('grade', 'GPA or percentage', { placeholder: '2.9 GPA or 62%', max: 40 });
    add('englishTest', 'English test', { kind: 'select', choices: F.ENGLISH_TESTS });
    add('englishScore', 'English score', { max: 60 });
    add('budget', 'Budget for the first year (GBP)', { placeholder: '17000', max: 60 });
    kind.append(f2, datalist('dl-people', lists.people), datalist('dl-districts', F.DISTRICTS));
    const more = el('details');
    more.style.marginTop = '12px';
    more.append(el('summary', 'p-link', 'More details'));
    const f3 = el('div', 'p-form');
    f3.style.marginTop = '10px';
    add('leadQuality', 'How promising', { kind: 'select', choices: F.LEAD_QUALITY.map((q) => [q.key, q.text]) }, f3);
    add('campaign', 'Campaign or advert', { list: 'dl-campaigns', max: 120 }, f3);
    add('district', 'Home district', { list: 'dl-districts', max: 60 }, f3);
    add('passedYear', 'Year passed', { max: 10 }, f3);
    more.append(f3, datalist('dl-campaigns', lists.campaigns));
    kind.append(more);
    if (F.LOST_STAGES.includes(s.stage) || p.lostReason) {
      kind.append(el('h3', '', 'Why the student did not go on'));
      const f4 = el('div', 'p-form p-form-2');
      add('lostReason', 'Reason', { kind: 'select', choices: F.LOST_REASONS }, f4);
      add('wanted', 'What the student wanted that we could not offer', { max: 300, placeholder: 'Nursing with a placement year, under 14,000 pounds' }, f4);
      kind.append(f4);
    }
    wrap.append(kind);

    if (can()) {
      const bar = el('div', 'p-bar');
      bar.style.margin = '0 0 16px';
      const btn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save details');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          if (data.can.source && sourceBox.input.value !== (s.source || '')) { await save('source', { source: sourceBox.input.value }); data.student.source = sourceBox.input.value; }
          await save('profile', Object.fromEntries(Object.entries(inputs).filter(([, i]) => i).map(([k, i]) => [k, i.value])), 'Details saved');
          render();
        } catch (e) { btn.disabled = false; }
      });
      bar.append(btn);
      wrap.append(bar);
    }
    wrap.append(notes());
    return wrap;
  }

  // ---- Notes (replace the Remarks column of the sheet) ----
  const KIND_TEXT = Object.fromEntries(F.NOTE_KINDS.map((k) => [k.key, k.text]));
  function notes() {
    const wrap = el('section', 'p-card');
    wrap.append(el('h2', '', 'Notes'));
    wrap.append(el('p', '', 'What was said and agreed, so anyone can pick the student up. The newest is first.'));
    if (can()) {
      const box = el('div', 'p-note-box');
      const kind = el('select', 'p-input');
      F.NOTE_KINDS.forEach((k) => kind.append(h('option', { value: k.key }, k.text)));
      kind.style.width = 'auto';
      const text = el('textarea', 'p-input');
      text.placeholder = 'Called the student. Documents will come on Friday.';
      text.maxLength = 4000;
      const bar = el('div', 'p-bar');
      bar.style.marginTop = '0';
      const add = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add note');
      add.addEventListener('click', async () => {
        if (!text.value.trim()) return;
        add.disabled = true;
        try { await save('notes', { text: text.value, kind: kind.value }, 'Note added'); render(); } catch (e) { add.disabled = false; }
      });
      bar.append(kind, add);
      box.append(text, bar);
      wrap.append(box);
    }
    const list = el('ol', 'p-timeline');
    const all = [...data.card.notes].reverse();
    const items = showAllNotes ? all : all.slice(0, 4);
    const remark = data.student.remarks;
    if (!all.length && !remark) list.append(el('li', '', 'No notes yet.'));
    items.forEach((n) => {
      const li = el('li', `kind-${n.kind}`);
      const head = el('div', 'p-when');
      head.append(el('b', '', n.by || 'Someone'), el('span', '', KIND_TEXT[n.kind] || (n.kind === 'followup' ? 'Follow-up' : 'Note')), el('span', '', when(n.at)));
      if (can() && (n.by === data.me.name || data.can.removeAnyNote)) head.append(h('button', { class: 'p-link', type: 'button', onclick: async () => { if (await window.NiecUI.confirm('Remove this note?', { danger: true })) { await save('notes/' + n.id + '/delete', {}, 'Note removed'); render(); } } }, 'Remove'));
      li.append(head, el('p', '', n.text));
      list.append(li);
    });
    if (remark) { const li = el('li'); li.append(el('div', 'p-when'), el('p', '', remark)); li.firstChild.append(el('b', '', 'Earlier remark from the sheet')); list.append(li); }
    wrap.append(list);
    if (all.length > 4) wrap.append(h('button', { class: 'p-link', type: 'button', style: 'margin-top:8px', onclick: () => { showAllNotes = !showAllNotes; render(); } }, showAllNotes ? 'Show fewer' : `Show all ${all.length} notes`));
    return wrap;
  }

  // ---- University options ----
  function chosenOptions() {
    const box = el('section', 'p-card');
    const head = el('div', 'p-card-head');
    head.append(el('h2', '', `Options for this student (${data.card.options.length})`));
    if (data.card.options.length) head.append(h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => select('message', 'options') }, 'Email these options'));
    box.append(head);
    if (!data.card.options.length) { box.append(el('p', 'p-muted', 'Nothing chosen yet. Ask the assistant or search below and press Add. Everything chosen goes into one email with the document checklist.')); return box; }
    const list = el('div', 'p-chosen');
    data.card.options.forEach((o) => {
      const item = el('div', 'p-chosen-item');
      const header = el('header');
      header.append(el('h4', '', `${o.university}: ${o.course}${o.intake ? ' (' + o.intake + ')' : ''}`));
      if (can()) header.append(h('button', { class: 'p-link', type: 'button', onclick: async () => { await save('options/' + o.id + '/delete', {}); render(); } }, 'Remove'));
      const form = el('div', 'p-form');
      const fee = field('Tuition fee', { value: o.fee, disabled: !can(), max: 400 });
      const sch = field('Scholarship', { value: o.scholarship, disabled: !can(), max: 400 });
      const link = field('Course link', { value: o.link, disabled: !can(), max: 500, placeholder: 'https://…' });
      const note = field('Note for the student', { value: o.note, disabled: !can(), max: 400 });
      form.append(fee.wrap, sch.wrap, link.wrap, note.wrap);
      item.append(header, form);
      if (can()) {
        const save1 = h('button', { class: 'btn btn-sm', type: 'button' }, 'Save changes');
        save1.addEventListener('click', async () => { try { await save('options/' + o.id, { fee: fee.input.value, scholarship: sch.input.value, link: link.input.value, note: note.input.value }, 'Saved'); render(); } catch (e) { /* shown */ } });
        item.append(el('div', 'p-bar'));
        item.lastChild.append(save1);
      }
      list.append(item);
    });
    box.append(list);
    return box;
  }
  async function addOption(o) {
    try { await save('options', { universityId: o.universityId, university: o.university, course: o.course, level: o.level, intake: o.intake, fee: o.fee, scholarship: o.scholarship, link: o.link }, 'Added to the options'); render(); } catch (e) { /* shown */ }
  }
  function optionCard(o) {
    const c = el('div', `p-option${o.closed ? ' closed' : ''}`);
    const left = el('div');
    left.append(el('h4', '', o.course), el('div', 'p-uni', `${o.university}${o.intake ? ' · ' + o.intake : ''}${o.level ? ' · ' + o.level : ''}`));
    c.append(left);
    const act = el('div');
    if (can()) act.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => addOption(o) }, 'Add'));
    c.append(act);
    const money = el('div', 'p-money');
    [['Fee', o.fee], ['Scholarship', o.scholarship]].forEach(([k, v]) => { const sp = el('span'); sp.append(el('span', 'p-muted', k + ': '), el('b', '', v || 'to be confirmed')); money.append(sp); });
    c.append(money);
    if (o.link) { const a = el('a', 'p-link p-small', o.linkIsCourse ? 'Course page' : 'University website'); a.href = o.link; a.target = '_blank'; a.rel = 'noopener'; const w = el('div', 'p-why'); w.append(a); c.append(w); }
    return c;
  }
  function optionsTab() {
    const wrap = el('div');
    wrap.append(chosenOptions());
    const assistant = el('section', 'p-card');
    assistant.append(el('h2', '', 'Fact File assistant'));
    assistant.append(el('p', '', 'Describe the student in your own words. It reads the entry rules of every university and tells you which ones the student is eligible for. What is already on this card (grade, English score, level, budget) is used too.'));
    window.SendToStudent.finderPanel(assistant, { studentId: id, onAdd: can() ? addOption : null });
    wrap.append(assistant);
    const search = el('section', 'p-card');
    search.append(el('h2', '', 'Search every course'));
    const bar = el('div', 'p-form');
    const q = field('Subject or university', { placeholder: 'cyber security', value: profile().courseInterest || '' });
    const lv = field('Level', { kind: 'select', choices: F.STUDY_LEVELS, value: profile().studyLevel });
    const it = field('Intake', { placeholder: 'January 2027', value: profile().preferredIntake || '' });
    bar.append(q.wrap, lv.wrap, it.wrap);
    const out = el('div', 'p-option-results');
    out.style.marginTop = '12px';
    let timer;
    const run = async () => {
      try {
        const r = await api('/api/courses?' + new URLSearchParams({ q: q.input.value, level: lv.input.value, intake: it.input.value }));
        out.replaceChildren(el('div', 'p-muted p-small', `${r.total} courses found${r.total > r.options.length ? `, the first ${r.options.length} shown` : ''}`));
        r.options.forEach((o) => out.append(optionCard(o)));
      } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); }
    };
    [q, lv, it].forEach((x) => x.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); }));
    search.append(bar, out);
    wrap.append(search);
    run();
    return wrap;
  }

  // ---- Send a message ----
  function messageTab(preselect) {
    const wrap = el('div', 'p-cols');
    const left = el('section', 'p-card');
    left.append(el('h2', '', 'Choose a message'));
    left.append(el('p', '', `Every email has the signature and the replies go to the office mailbox${data.mail.ready ? ` (${data.mail.from})` : ''}. The options email also carries the checklist of documents to apply.`));
    const stage = data.student.stage;
    const ordered = [...templates].sort((a, b) => (b.stages.includes(stage) - a.stages.includes(stage)) || a.name.localeCompare(b.name));
    const list = el('div', 'p-templates');
    const right = el('section', 'p-card');
    const buttons = [];
    ordered.forEach((t) => {
      const b = el('button', 'p-template');
      b.type = 'button';
      b.append(el('b', '', t.name), el('small', '', t.stages.includes(stage) ? 'Suits this stage' : t.stages.join(', ')));
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { chosenTemplate = t.key; buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); loadPreview(); });
      buttons.push(b);
      list.append(b);
    });
    left.append(list);
    left.append(el('h3', '', 'Sent to this student'));
    const sent = el('div');
    if (!data.card.messages.length) sent.append(el('p', 'p-muted p-small', 'Nothing sent yet.'));
    [...data.card.messages].reverse().slice(0, 10).forEach((m) => {
      const row = el('div', 'p-sent');
      row.append(el('b', '', m.template || 'Message'), el('span', 'p-chip', m.channel === 'whatsapp' ? 'WhatsApp opened' : m.status === 'sent' ? 'Email sent' : m.status === 'failed' ? 'Email failed' : m.status === 'opened' ? 'Email opened in your program' : 'Preview only'), el('span', 'p-muted p-small', `${m.by}, ${when(m.at)}`));
      if (m.channel === 'email') row.append(h('button', { class: 'p-link', type: 'button', onclick: () => readMessage(m) }, 'Read'));
      sent.append(row);
    });
    left.append(sent);

    right.append(el('h2', '', 'Preview'));
    const panel = el('div');
    panel.append(el('p', 'p-muted', 'Choose a message on the left. Nothing is sent until you press a send button.'));
    right.append(panel);
    wrap.append(left, right);

    async function loadPreview() {
      panel.replaceChildren(el('div', 'p-thinking', 'Preparing…'));
      try {
        const p = await api(`/api/cards/${id}/messages/preview`, { template: chosenTemplate });
        panel.replaceChildren();
        const subj = field('Subject', { value: p.subject, max: 200, disabled: true });
        const to = field('To', { value: p.to, max: 254, placeholder: 'student@example.com' });
        const f = el('div', 'p-form p-form-2');
        f.append(subj.wrap, to.wrap);
        panel.append(f);
        if (p.missing.length) panel.append(el('div', 'p-notice warn', 'Not filled in yet, so left out of the message: ' + p.missing.join(', ') + '.'));
        if (!data.mail.ready) panel.append(el('div', 'p-notice', 'This server cannot send email by itself yet (the office mailbox is not set up). You can still send this email: press Open in my email program, or copy it.'));
        const frame = el('iframe', 'p-preview');
        frame.setAttribute('sandbox', '');
        frame.title = 'Email preview';
        frame.srcdoc = p.html;
        const bar = el('div', 'p-bar');
        panel.append(bar, frame);
        if (data.mail.ready) {
          const sendEmail = h('button', { class: 'btn btn-primary', type: 'button' }, 'Send email');
          sendEmail.disabled = !can();
          sendEmail.addEventListener('click', async () => {
            if (!(await window.NiecUI.confirm(`Send "${p.subject}" to ${to.input.value || 'the student'}?`, { confirmText: 'Send email' }))) return;
            sendEmail.disabled = true;
            try { const r = await save('messages/send', { channel: 'email', template: chosenTemplate, to: to.input.value }, null); say(`Email sent from ${r.from}`); render(); } catch (e) { sendEmail.disabled = false; }
          });
          bar.append(sendEmail);
        }
        const mailto = h('button', { class: `btn${data.mail.ready ? '' : ' btn-primary'}`, type: 'button' }, 'Open in my email program');
        mailto.disabled = !can();
        mailto.addEventListener('click', async () => {
          if (!to.input.value.trim()) { say('Type the email address first.', true); return; }
          const r = await save('messages/send', { channel: 'mailto', template: chosenTemplate, to: to.input.value }, null).catch(() => null);
          if (r) { location.href = `mailto:${encodeURIComponent(to.input.value.trim())}?subject=${encodeURIComponent(p.subject)}&body=${encodeURIComponent(p.text)}`; setTimeout(render, 600); }
        });
        bar.append(mailto, h('button', { class: 'btn', type: 'button', onclick: async () => say((await copy(`${p.subject}\n\n${p.text}`)) ? 'Email text copied' : 'Could not copy', false) }, 'Copy email text'));
        if (p.whatsapp.number) {
          const wa = h('button', { class: 'btn', type: 'button' }, 'Open WhatsApp');
          wa.disabled = !can();
          wa.addEventListener('click', async () => {
            const r = await save('messages/send', { channel: 'whatsapp', template: chosenTemplate }, null).catch(() => null);
            if (r) { window.open(`https://wa.me/${p.whatsapp.number}?text=${encodeURIComponent(p.whatsapp.text)}`, '_blank', 'noopener'); render(); }
          });
          bar.append(wa);
        }
        panel.append(el('h3', '', 'WhatsApp text'), el('pre', 'p-wa-preview', p.whatsapp.text));
      } catch (e) { panel.replaceChildren(el('div', 'p-notice bad', e.message)); }
    }
    if (preselect) { const t = ordered.find((x) => x.key === preselect); if (t) setTimeout(() => buttons[ordered.indexOf(t)].click(), 0); }
    return wrap;
  }
  async function readMessage(m) {
    try {
      const r = await api(`/api/cards/${id}/messages/${m.id}`);
      dialog(m.subject || m.template, (body, close) => {
        body.append(el('p', 'p-muted p-small', `To ${m.to || ''}, ${when(m.at)}, by ${m.by}`), el('pre', 'p-wa-preview', r.text || '(the words were not kept)'), el('div', 'p-dialog-foot'));
        body.lastChild.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close'));
      }, { wide: true });
    } catch (e) { say(e.message, true); }
  }

  function select(name, template) {
    tab = name;
    history.replaceState(null, '', location.pathname + location.search + '#' + name);
    render(template);
  }
  function render(template) {
    document.title = `${data.student.name} · Student · UK Student NIEC`;
    const frag = document.createDocumentFragment();
    frag.append(hero(), followStrip());
    if (!can()) frag.append(el('div', 'p-notice', 'You can read this student but not change them.'));
    const tabs = el('div', 'p-tabs');
    tabs.style.marginTop = '16px';
    tabs.setAttribute('role', 'tablist');
    TABS.forEach(([key, text]) => {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(key === tab));
      b.textContent = text;
      if (key === 'options' && data.card.options.length) b.append(el('span', 'p-count', String(data.card.options.length)));
      b.addEventListener('click', () => select(key));
      tabs.append(b);
    });
    frag.append(tabs);
    frag.append(tab === 'options' ? optionsTab() : tab === 'message' ? messageTab(template) : details());
    view.replaceChildren(frag);
  }

  async function start() {
    if (!id) { view.replaceChildren(el('div', 'p-card', 'Choose a student from the sheet first.')); return; }
    try {
      const [d, l, t] = await Promise.all([api('/api/cards/' + encodeURIComponent(id)), api('/api/card-lists'), api('/api/templates')]);
      data = d; lists = l; templates = t.templates;
      if (tab === 'messages') tab = 'message';
      if (!TABS.some(([k]) => k === tab)) tab = 'details';
      render();
    } catch (e) {
      view.replaceChildren(h('div', { class: 'p-card' }, el('h2', '', 'This student cannot be opened'), el('p', '', e.message), h('a', { class: 'btn', href: '/students' }, 'Back to Student Details')));
    }
  }
  window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (data && t !== tab && TABS.some(([k]) => k === t)) { tab = t; render(); } });
  start();
})();

// One student's card (student.html): who the student is, where they came from, the next follow-up, notes, university
// options, the messages sent and the documents received. The sheet's own details are shown read only: the sheet changes them.
(function () {
  const { el, h, api, day, when, fromToday, stagePill, initials, field, datalist, dialog, richText, copy, waitFor } = window.Portal;
  const F = window.CardFields;
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const embedded = params.get('embed') === '1';
  let data = null; // { student, card, can, me, mail, today }
  let lists = { people: [], subAgents: [], events: [], campaigns: [] };
  let tab = (location.hash || '#overview').slice(1);
  const TABS = [['overview', 'Overview'], ['notes', 'Notes and follow-up'], ['options', 'University options'], ['messages', 'Messages'], ['documents', 'Documents']];
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
      data.card = r.card;
      if (okText) say(okText);
      return r;
    } catch (e) { say(e.message, true); throw e; }
  }

  // ---- the top: name, stage, contact, actions ----
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
    fact('First inquiry', profile().inquiryDate ? day(profile().inquiryDate) : '');
    mid.append(facts);
    const act = el('div', 'p-hero-actions');
    const open = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => select('messages') }, 'Send a message');
    act.append(open);
    c.append(mid, act);
    return c;
  }

  // ---- the follow-up strip ----
  function followStrip() {
    const f = data.card.followUp;
    const box = el('div', 'p-follow');
    if (!f) {
      box.append(el('span', 'p-grow', 'No follow-up day set for this student.'));
    } else {
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
      const cancel = h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel');
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      ok.addEventListener('click', async () => {
        try {
          await save('follow-up', done ? { done: true, outcome: outcome.input.value, nextDate: date.input.value, nextNote: what.input.value } : { date: date.input.value, note: what.input.value }, 'Saved');
          close(true);
          render();
        } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; }
      });
      foot.append(cancel);
      if (!done && f.date) foot.append(h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { await save('follow-up', { date: '' }, 'Follow-up cleared'); close(true); render(); } }, 'Clear'));
      foot.append(ok);
      body.append(msg, foot);
    });
  }

  // ---- Overview: where the student came from, and the kind of student ----
  function overview() {
    const wrap = el('div');
    const lock = !can();
    const p = profile();
    const s = data.student;
    const source = s.source;
    const inputs = {};
    const card = el('section', 'p-card');
    card.append(el('h2', '', 'How the student found NIEC'));
    card.append(el('p', '', source ? `Student Source on the sheet: ${source}. Say exactly where, so the Dashboard can show what each platform, event and partner brings.` : 'The Student Source is chosen on the sheet. Once it is chosen, say exactly where the student came from here.'));
    const form = el('div', 'p-form');
    const detailList = F.SOURCE_DETAILS[source] || [];
    const label = F.SOURCE_DETAIL_LABEL[source] || 'Where exactly';
    let detail;
    if (source === 'Events') detail = field(label, { value: p.sourceDetail, list: 'dl-events', placeholder: 'Choose an event or type its name and date', disabled: lock, max: 120 });
    else if (source === 'Agent') detail = field(label, { value: p.sourceDetail, list: 'dl-agents', placeholder: 'Choose the B2B partner or type the name', disabled: lock, max: 120 });
    else if (detailList.length) detail = field(label, { kind: 'select', value: p.sourceDetail, choices: detailList, disabled: lock });
    else detail = field(label, { value: p.sourceDetail, disabled: lock, max: 120 });
    inputs.sourceDetail = detail.input;
    form.append(detail.wrap);
    const referred = field(source === 'Reference' ? 'Name of the person who referred' : 'Name, if there is one', { value: p.referredBy, disabled: lock, max: 120 });
    inputs.referredBy = referred.input;
    form.append(referred.wrap);
    const camp = field('Campaign or advert', { value: p.campaign, list: 'dl-campaigns', disabled: lock, placeholder: 'Scholarship advert, January intake', max: 120 });
    inputs.campaign = camp.input;
    form.append(camp.wrap);
    const when1 = field('First inquiry day', { kind: 'date', value: p.inquiryDate, disabled: lock });
    inputs.inquiryDate = when1.input;
    form.append(when1.wrap);
    card.append(form, datalist('dl-events', lists.events), datalist('dl-agents', lists.subAgents), datalist('dl-campaigns', lists.campaigns));
    wrap.append(card);

    const kind = el('section', 'p-card');
    kind.append(el('h2', '', 'The student'));
    kind.append(el('p', '', 'Who looks after the student, how promising the lead is, and what the student has studied. The option finder and the document list read these.'));
    const f2 = el('div', 'p-form');
    const add = (key, labelText, opts) => { const x = field(labelText, { value: p[key], disabled: lock, ...opts }); inputs[key] = x.input; f2.append(x.wrap); };
    add('counselor', 'Counselor', { list: 'dl-people', max: 60 });
    add('leadQuality', 'Lead quality', { kind: 'select', choices: F.LEAD_QUALITY.map((q) => [q.key, q.text]) });
    add('studyLevel', 'Study level wanted', { kind: 'select', choices: F.STUDY_LEVELS });
    add('courseInterest', 'Course or subject wanted', { max: 160 });
    add('preferredIntake', 'Intake wanted', { placeholder: 'January 2027', max: 60 });
    add('budget', 'Budget for the first year (GBP)', { placeholder: '17000', max: 60 });
    add('district', 'Home district', { list: 'dl-districts', max: 60 });
    add('qualification', 'Highest qualification', { kind: 'select', choices: F.QUALIFICATIONS });
    add('grade', 'GPA or percentage', { placeholder: '2.9 GPA or 62%', max: 40 });
    add('passedYear', 'Year passed', { max: 10 });
    add('englishTest', 'English test', { kind: 'select', choices: F.ENGLISH_TESTS });
    add('englishScore', 'English score', { max: 60 });
    kind.append(f2, datalist('dl-people', lists.people), datalist('dl-districts', F.DISTRICTS));
    wrap.append(kind);

    const lost = el('section', 'p-card');
    lost.append(el('h2', '', 'If the student does not go on'));
    lost.append(el('p', '', F.LOST_STAGES.includes(s.stage) ? `The stage is ${s.stage}. Please say why: it is the cheapest market research NIEC gets.` : 'Fill this in when the student withdraws, is put on hold, is deferred or is refused.'));
    const f3 = el('div', 'p-form');
    const why = field('Why', { kind: 'select', choices: F.LOST_REASONS, value: p.lostReason, disabled: lock });
    const wanted = field('What the student wanted that we could not offer', { value: p.wanted, disabled: lock, max: 300, placeholder: 'Nursing with a placement year, under 14,000 pounds' });
    inputs.lostReason = why.input;
    inputs.wanted = wanted.input;
    f3.append(why.wrap, wanted.wrap);
    lost.append(f3);
    wrap.append(lost);

    if (can()) {
      const bar = el('div', 'p-bar');
      const btn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save details');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await save('profile', Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])), 'Details saved'); render(); } catch (e) { btn.disabled = false; }
      });
      bar.append(btn);
      wrap.append(bar);
    }

    // The sheet's own details, read only.
    const sheet = el('section', 'p-card');
    sheet.append(el('h2', '', 'On the sheet'), el('p', '', 'These are changed on the Student Details sheet, not here.'));
    F.SHEET_SECTIONS.forEach((sec) => {
      const cols = sec.columns.filter((c) => data.student.columns.includes(c));
      if (!cols.length) return;
      sheet.append(el('h3', '', sec.title));
      const dl = el('dl', 'p-sheet-grid');
      cols.forEach((c) => {
        const v = String(data.student.row[c] ?? '').trim();
        const dd = el('dd', v ? '' : 'blank', /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v) ? day(v) : (v || 'Not filled in'));
        dl.append(el('div', '', ''));
        dl.lastChild.append(el('dt', '', F.columnLabel(c)), dd);
      });
      sheet.append(dl);
    });
    if (data.student.remarks) { sheet.append(el('h3', '', 'Remarks')); sheet.append(el('p', '', data.student.remarks)); }
    wrap.append(sheet);
    return wrap;
  }

  // ---- Notes and follow-up ----
  const KIND_TEXT = Object.fromEntries(F.NOTE_KINDS.map((k) => [k.key, k.text]));
  function notes() {
    const wrap = el('section', 'p-card');
    wrap.append(el('h2', '', 'Notes'));
    wrap.append(el('p', '', 'What was said and agreed, so anyone can pick the student up. The newest is first.'));
    if (can()) {
      const box = el('div', 'p-note-box');
      const kind = el('select', 'p-input');
      F.NOTE_KINDS.forEach((k) => kind.append(h('option', { value: k.key }, k.text)));
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
      kind.style.width = 'auto';
      box.append(text, bar);
      wrap.append(box);
    }
    const list = el('ol', 'p-timeline');
    const items = [...data.card.notes].reverse();
    if (!items.length) list.append(el('li', '', 'No notes yet.'));
    items.forEach((n) => {
      const li = el('li', `kind-${n.kind}`);
      const head = el('div', 'p-when');
      head.append(el('b', '', n.by || 'Someone'), el('span', '', KIND_TEXT[n.kind] || (n.kind === 'followup' ? 'Follow-up' : 'Note')), el('span', '', when(n.at)));
      if (can() && (n.by === data.me.name || data.can.removeAnyNote)) {
        head.append(h('button', { class: 'p-link', type: 'button', onclick: async () => { if (await window.NiecUI.confirm('Remove this note?', { danger: true })) { await save('notes/' + n.id + '/delete', {}, 'Note removed'); render(); } } }, 'Remove'));
      }
      li.append(head, el('p', '', n.text));
      list.append(li);
    });
    wrap.append(list);
    return wrap;
  }

  // ---- University options ----
  const rows = {}; // option id -> inputs
  function chosenOptions() {
    const box = el('section', 'p-card');
    const head = el('div', 'p-card-head');
    head.append(el('h2', '', `Options for this student (${data.card.options.length})`));
    if (data.card.options.length) head.append(h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => select('messages', 'options') }, 'Email these options'));
    box.append(head);
    if (!data.card.options.length) { box.append(el('p', 'p-muted', 'Nothing chosen yet. Search below or use the option finder, and press Add. Everything chosen goes into one email.')); return box; }
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
  function optionCard(o, extra) {
    const c = el('div', `p-option${o.closed ? ' closed' : ''}`);
    const left = el('div');
    left.append(el('h4', '', o.course), el('div', 'p-uni', `${o.university}${o.intake ? ' · ' + o.intake : ''}${o.level ? ' · ' + o.level : ''}`));
    c.append(left);
    const act = el('div');
    if (can()) act.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => addOption(o) }, 'Add'));
    c.append(act);
    const money = el('div', 'p-money');
    const m = (k, v) => { const s = el('span'); s.append(el('span', 'p-muted', k + ': '), el('b', '', v || 'to be confirmed')); money.append(s); };
    m('Fee', o.fee); m('Scholarship', o.scholarship);
    c.append(money);
    if (extra) c.append(extra);
    if (o.link) { const a = el('a', 'p-link p-small', o.linkIsCourse ? 'Course page' : 'University website'); a.href = o.link; a.target = '_blank'; a.rel = 'noopener'; c.append(el('div', 'p-why')); c.lastChild.append(a); }
    return c;
  }
  function optionsTab() {
    const wrap = el('div');
    wrap.append(chosenOptions());
    // The finder
    const finder = el('section', 'p-card');
    finder.append(el('h2', '', 'Option finder'));
    finder.append(el('p', '', 'Say what the student wants, even an unusual request. It looks through the whole Fact File.'));
    const box = el('div', 'p-finder');
    const request = el('textarea', 'p-input');
    request.placeholder = 'Student with 2.4 GPA, 6 year gap, wants a nursing top-up in London, budget 16,000 pounds, IELTS 5.5.';
    request.maxLength = 1500;
    const results = el('div', 'p-option-results');
    const msg = el('div', 'p-msg');
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Find options');
    go.addEventListener('click', async () => {
      if (!request.value.trim() && !profile().courseInterest) { msg.textContent = 'Say what the student wants first.'; msg.className = 'p-msg error'; return; }
      go.disabled = true; msg.className = 'p-msg'; msg.textContent = '';
      results.replaceChildren(el('div', 'p-thinking', 'Looking through the Fact File…'));
      try {
        let out = await api('/api/finder', { request: request.value, studentId: id });
        if (out.job) out = await waitFor('/api/finder/' + out.job);
        results.replaceChildren();
        if (out.notice) results.append(el('div', 'p-notice warn', out.notice));
        if (out.summary) results.append(el('div', 'p-notice ok', out.summary));
        if (out.nothingFits) results.append(el('div', 'p-notice bad', out.nothingFits));
        out.results.forEach((o) => results.append(optionCard(o, el('div', 'p-why'))));
        results.querySelectorAll('.p-option').forEach((card, i) => {
          const r = out.results[i];
          const why = card.querySelector('.p-why');
          why.replaceChildren(el('b', '', r.fit + '. '), r.why || '', r.check ? ' To check: ' + r.check : '');
        });
        if (!out.results.length && !out.nothingFits) results.append(el('div', 'p-empty', 'Nothing in the Fact File matches. Try fewer words.'));
      } catch (e) { results.replaceChildren(el('div', 'p-notice bad', e.message)); }
      go.disabled = false;
    });
    box.append(request, go, results, msg);
    finder.append(box);
    wrap.append(finder);
    // Plain search of every course
    const search = el('section', 'p-card');
    search.append(el('h2', '', 'Search every course'));
    const bar = el('div', 'p-form');
    const q = field('Subject or university', { placeholder: 'cyber security', value: profile().courseInterest || '' });
    const lv = field('Level', { kind: 'select', choices: F.STUDY_LEVELS, value: profile().studyLevel === 'MBA' ? 'MBA' : profile().studyLevel });
    const it = field('Intake', { placeholder: 'January 2027', value: profile().preferredIntake || '' });
    bar.append(q.wrap, lv.wrap, it.wrap);
    const out = el('div', 'p-option-results');
    out.style.marginTop = '12px';
    let timer;
    const run = async () => {
      const params2 = new URLSearchParams({ q: q.input.value, level: lv.input.value, intake: it.input.value });
      try {
        const r = await api('/api/courses?' + params2);
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

  // ---- Messages ----
  let templates = [];
  let chosenTemplate = '';
  function messagesTab(preselect) {
    const wrap = el('div', 'p-cols');
    const left = el('section', 'p-card');
    left.append(el('h2', '', 'Choose a message'));
    left.append(el('p', '', `Sent from ${data.mail.ready ? data.mail.from : 'the office mailbox'}, with the email signature. Replies come to the office mailbox, not to this system.`));
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
    const sent = el('div');
    left.append(el('h3', '', 'Sent to this student'));
    if (!data.card.messages.length) sent.append(el('p', 'p-muted p-small', 'Nothing sent yet.'));
    [...data.card.messages].reverse().slice(0, 12).forEach((m) => {
      const row = el('div', 'p-sent');
      row.append(el('b', '', m.template || 'Message'), el('span', 'p-chip', m.channel === 'whatsapp' ? 'WhatsApp opened' : m.status === 'sent' ? 'Email sent' : m.status === 'failed' ? 'Email failed' : 'Email preview only'), el('span', 'p-muted p-small', `${m.by}, ${when(m.at)}`));
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
        if (!data.mail.ready) panel.append(el('div', 'p-notice', 'Email is not set up on this server yet, so pressing Send email only keeps a preview on the card. Admin sets it up once (see DEPLOY.md, Email).'));
        const frame = el('iframe', 'p-preview');
        frame.setAttribute('sandbox', '');
        frame.title = 'Email preview';
        frame.srcdoc = p.html;
        panel.append(el('div', 'p-bar'), frame);
        const bar = panel.querySelector('.p-bar');
        const sendEmail = h('button', { class: 'btn btn-primary', type: 'button' }, 'Send email');
        sendEmail.addEventListener('click', async () => {
          if (!can()) return;
          if (!(await window.NiecUI.confirm(`Send "${p.subject}" to ${to.input.value || 'the student'}?`, { confirmText: 'Send email' }))) return;
          sendEmail.disabled = true;
          try {
            const r = await save('messages/send', { channel: 'email', template: chosenTemplate, to: to.input.value }, null);
            say(r.status === 'sent' ? `Email sent from ${r.from}` : 'Email is not set up: a preview was kept on the card');
            render();
          } catch (e) { sendEmail.disabled = false; }
        });
        bar.append(sendEmail);
        if (!can()) sendEmail.disabled = true;
        if (p.whatsapp.number) {
          const wa = h('button', { class: 'btn', type: 'button' }, 'Open WhatsApp');
          wa.addEventListener('click', async () => {
            const r = await save('messages/send', { channel: 'whatsapp', template: chosenTemplate }, null).catch(() => null);
            if (r) { window.open(`https://wa.me/${p.whatsapp.number}?text=${encodeURIComponent(p.whatsapp.text)}`, '_blank', 'noopener'); render(); }
          });
          if (!can()) wa.disabled = true;
          bar.append(wa);
        }
        bar.append(h('button', { class: 'btn', type: 'button', onclick: async () => say((await copy(p.whatsapp.text)) ? 'WhatsApp text copied' : 'Could not copy', false) }, 'Copy WhatsApp text'));
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

  // ---- Documents ----
  function documents() {
    const c = el('section', 'p-card');
    c.append(el('h2', '', 'Documents'));
    c.append(el('p', '', 'Tick each document when the student has handed it in. The reminder message lists the ones still missing.'));
    const got = data.card.documents;
    const need = F.documentsFor(profile().studyLevel);
    const all = F.documentsFor(profile().studyLevel, { all: true });
    const have = all.filter((d) => got[d.key]).length;
    c.append(el('div', 'p-notice', `${have} of ${need.length} needed documents received${profile().studyLevel ? '' : ' (choose the study level on Overview for the exact list)'}.`));
    ['Application', 'CAS', 'Visa'].forEach((when1) => {
      const group = all.filter((d) => d.when === when1);
      c.append(el('h3', '', when1 === 'Application' ? 'For the application' : when1 === 'CAS' ? 'For the CAS' : 'For the visa'));
      group.forEach((d) => {
        const row = el('label', `p-check${got[d.key] ? ' done' : ''}`);
        const box = el('input');
        box.type = 'checkbox';
        box.checked = Boolean(got[d.key]);
        box.disabled = !can();
        box.addEventListener('change', async () => { try { await save('documents', { key: d.key, received: box.checked }); render(); } catch (e) { box.checked = !box.checked; } });
        const text = el('span', '', d.text + (need.includes(d) ? '' : ' (for another study level)'));
        row.append(box, text);
        if (got[d.key]) row.append(el('span', 'p-muted p-small', `received ${day(got[d.key].at)}`));
        c.append(row);
      });
    });
    return c;
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
    if (!can()) frag.append(el('div', 'p-notice', window.TeamRules ? 'You can read this student but not change them.' : 'View only.'));
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
      if (key === 'notes' && data.card.notes.length) b.append(el('span', 'p-count', String(data.card.notes.length)));
      b.addEventListener('click', () => select(key));
      tabs.append(b);
    });
    frag.append(tabs);
    frag.append(tab === 'notes' ? notes() : tab === 'options' ? optionsTab() : tab === 'messages' ? messagesTab(template) : tab === 'documents' ? documents() : overview());
    view.replaceChildren(frag);
  }

  async function start() {
    if (!id) { view.replaceChildren(el('div', 'p-card', 'Choose a student from the sheet first.')); return; }
    try {
      const [d, l, t] = await Promise.all([api('/api/cards/' + encodeURIComponent(id)), api('/api/card-lists'), api('/api/templates')]);
      data = d; lists = l; templates = t.templates;
      if (!TABS.some(([k]) => k === tab)) tab = 'overview';
      render();
    } catch (e) {
      view.replaceChildren(h('div', { class: 'p-card' }, el('h2', '', 'This student cannot be opened'), el('p', '', e.message), h('a', { class: 'btn', href: '/students' }, 'Back to Student Details')));
    }
  }
  window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (data && t !== tab && TABS.some(([k]) => k === t)) { tab = t; render(); } });
  start();
})();

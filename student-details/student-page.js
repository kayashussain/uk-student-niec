// One student's card (student.html), kept short: Details (where the student came from, the student, notes), University options
// and Send a message. The sheet's own details are changed on the sheet; the card never changes them except the Student Source,
// which is chosen here (it is no longer a column of the sheet).
(function () {
  const { el, h, api, day, when, stagePill, initials, field, dialog } = window.Portal;
  const F = window.CardFields;
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const embedded = params.get('embed') === '1';
  let data = null; // { student, card, can, me, mail, today }
    let templates = [];
  let lists = { sourceOptions: {}, partners: [] };
    let showAllNotes = false;
  const TABS = [['details', 'Notes'], ['options', 'University options'], ['message', 'Send a message']];
  let tab = (location.hash || '#details').slice(1);
  const view = document.getElementById('view');
  const say = (text, error) => window.NiecUI.toast(text, { type: error ? 'error' : 'success' });

  if (embedded) {
    document.body.classList.add('p-embed');
    document.getElementById('closeEmbed').addEventListener('click', () => parent.postMessage({ niecCard: 'close' }, location.origin));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) && !document.querySelector('dialog[open], .p-dialog')) parent.postMessage({ niecCard: 'close' }, location.origin); });
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

  // ---- the details of the sheet (name, email, number, university, course, dates): shown, and changed only after pressing Edit ----
  let editingHero = false;
  const HERO_FIELDS = [['FIRST NAME', 'First name'], ['LAST NAME', 'Last name'], ['EMAIL', 'Email'], ['CONTACT NUMBER', 'Contact number'], ['UNIVERSITY NAME', 'University'], ['COURSE NAME', 'Course'], ['APPLICATION SUBMISSION DATE', 'Application submitted', 'date'], ['OFFER RECEIVED DATE', 'Offer received', 'date']];
  function heroEdit() {
    const c = el('section', 'p-card');
    c.append(el('h2', '', 'Change the details'));
    c.append(el('p', 'p-muted p-small', 'These are the columns of the All Students sheet. A change here is a change on the sheet.'));
    const form = el('div', 'p-form');
    const inputs = {};
    HERO_FIELDS.forEach(([col, label, kind]) => {
      const raw = String(data.student.row[col] || '');
      const iso = kind === 'date' ? (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : (/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(raw) ? raw.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (m, a, b, y) => `${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`) : '')) : raw;
      const f = field(label, { value: iso, kind: kind === 'date' ? 'date' : undefined, max: 240 });
      inputs[col] = f.input;
      form.append(f.wrap);
    });
    const bar = el('div', 'p-bar');
    const msg = el('div', 'p-msg');
    const save = async () => {
      try {
        await api(`/api/cards/${id}/sheet`, { fields: Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])) });
        data = await api('/api/cards/' + encodeURIComponent(id));
        editingHero = false; say('Saved on the sheet'); render();
      } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; }
    };
    bar.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: save }, 'Save'), h('button', { class: 'btn', type: 'button', onclick: () => { editingHero = false; render(); } }, 'Cancel'));
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
    c.append(form, bar, msg);
    return c;
  }

  // ---- where the student is on the way from first inquiry to visa: a slim line of steps under the name ----
  const JOURNEY = [['Inquiry', 'Inquiry'], ['Application Stage', 'Application'], ['Mock Stage', 'Mock interview'], ['Payment Stage', 'Payment'],
    ['CAS Stage', 'CAS requested'], ['CAS Issued', 'CAS issued'], ['Visa Lodge', 'Visa lodged'], ['Visa Issued', 'Visa issued']];
  function journey(stage) {
    const box = el('div', 'p-journey');
    const bar = el('div', 'p-journey-bar');
    const at = JOURNEY.findIndex(([name]) => name === stage);
    JOURNEY.forEach(([, label], i) => { const step = el('i', at === -1 ? '' : i < at ? 'done' : i === at ? 'now' : ''); step.title = label; bar.append(step); });
    bar.setAttribute('aria-hidden', 'true');
    const text = el('div', 'p-journey-text');
    if (at !== -1) text.append(`Step ${at + 1} of ${JOURNEY.length}: `, el('b', '', JOURNEY[at][1]));
    else if (F.LOST_STAGES.includes(stage)) { box.classList.add('lost'); text.textContent = `Not moving at the moment: ${stage}`; }
    else text.textContent = stage ? `Stage: ${stage}` : 'No stage yet';
    box.append(bar, text);
    return box;
  }

  // ---- the top: name, stage, contact ----
  function hero() {
    const s = data.student;
    if (editingHero) return heroEdit();
    const c = el('section', 'p-card p-hero');
    c.append(el('div', 'p-avatar', initials(s.name)));
    const mid = el('div');
    mid.append(el('h1', '', s.name));
    const line = el('div', 'p-hero-line');
    line.append(stagePill(s.stage), el('span', '', s.intake));
    if (s.source) line.append(el('span', 'p-chip', data.event ? s.source : s.source + (profile().sourceDetail ? ': ' + profile().sourceDetail : '')));
    // An event or marketing tag shows when and for how long it ran.
    if (data.event) { const e = data.event; line.append(el('span', 'p-chip', `${e.kind === 'Marketing' ? 'Marketing' : 'Event'}: ${e.name}, ${e.endDate && e.endDate !== e.date ? day(e.date) + ' to ' + day(e.endDate) : day(e.date)}`)); }
    mid.append(line);
    mid.append(journey(s.stage));
    const facts = el('dl', 'p-facts');
    const fact = (k, v, href) => { if (!v) return; const d = el('div', 'p-fact'); const dd = el('dd'); if (href) { const a = el('a', '', v); a.href = href; dd.append(a); } else dd.textContent = v; d.append(el('dt', '', k), dd); facts.append(d); };
    fact('Email', s.email, s.email ? 'mailto:' + s.email : '');
    fact('WhatsApp', s.phone, F.whatsappNumber(s.phone) ? 'https://wa.me/' + F.whatsappNumber(s.phone) : '');
    fact('University', s.university);
    fact('Course', s.course);
    fact('Application submitted', s.row['APPLICATION SUBMISSION DATE'] ? day(s.row['APPLICATION SUBMISSION DATE']) : '');
    fact('Offer received', s.row['OFFER RECEIVED DATE'] ? day(s.row['OFFER RECEIVED DATE']) : '');
    // Where to send the application, from Partner Universities (the portal opens in a new tab).
    if (data.apply && (data.apply.portal || data.apply.email)) {
      const d = el('div', 'p-fact p-fact-apply'); const dd = el('dd');
      if (data.apply.portal) { const a = el('a', 'p-apply-portal', 'Open portal'); a.href = data.apply.portal; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = data.apply.portal; dd.append(a); }
      if (data.apply.email) { const a = el('a', 'p-apply-email', data.apply.email); a.href = 'mailto:' + data.apply.email; dd.append(a); }
      // The portal's login, to copy into the portal: the password stays hidden until Show is pressed.
      const copyBtn = (value, what) => h('button', { class: 'btn btn-sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(value); say(`${what} copied`); } catch (e) { say(`Could not copy the ${what.toLowerCase()}`, true); } } }, 'Copy');
      if (data.apply.user) {
        const line = el('span', 'p-apply-login'); line.append(el('small', '', 'Username'), el('code', '', data.apply.user), copyBtn(data.apply.user, 'Username')); dd.append(line);
      }
      if (data.apply.password) {
        const shown = el('code', '', '\u2022'.repeat(10));
        let open = false;
        const peek = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { open = !open; shown.textContent = open ? data.apply.password : '\u2022'.repeat(10); peek.textContent = open ? 'Hide' : 'Show'; } }, 'Show');
        const line = el('span', 'p-apply-login'); line.append(el('small', '', 'Password'), shown, peek, copyBtn(data.apply.password, 'Password')); dd.append(line);
      }
      d.append(el('dt', '', data.apply.via ? `Application link (through ${data.apply.via})` : 'Application link'), dd); facts.append(d);
    }
    mid.append(facts);
    const act = el('div', 'p-hero-actions');
    if (can()) act.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => select('message') }, 'Send a message'));
    if (can()) act.append(h('button', { class: 'btn', type: 'button', onclick: () => { editingHero = true; render(); } }, 'Edit details'));
    if (data.can.assign) act.append(h('button', { class: 'btn', type: 'button', onclick: assignTask }, 'Assign a task'));
    c.append(mid, act);
    return c;
  }

  // ---- Details: only the notes, and why a student did not go on ----
  // ---- tasks given to a team about this student ----
  function assignTask() {
    dialog('Assign a task', (body, close) => {
      // Which team and what to do: no date to do it by (the owner, 14 Nov 2026). The team asks for anything it needs in the
      // task's comments, and ticks it when it is done.
      // A team, or Admin (named with their title): the teams and branches can give Admin a task too.
      const targets = (data.assignTeams || data.taskTeams || []).map((t) => [t.id, t.label]);
      const team = field('Who should do it?', { kind: 'select', choices: targets, value: targets.length === 1 ? targets[0][0] : '' });
      const text = field('What should they do?', { kind: 'area', max: 2000, wide: true, placeholder: 'e.g. Submit the application to Coventry University.' });
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Assign');
      ok.addEventListener('click', async () => {
        if (!team.input.value) { msg.textContent = 'Choose who should do it.'; msg.className = 'p-msg error'; return; }
        if (!text.input.value.trim()) { msg.textContent = 'Write what should be done.'; msg.className = 'p-msg error'; return; }
        ok.disabled = true;
        try { await save('tasks', { team: team.input.value, text: text.input.value }, 'Task assigned'); close(true); } catch (e) { ok.disabled = false; }
      });
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), ok);
      const g = el('div', 'p-form'); g.append(team.wrap, text.wrap);
      body.append(g, msg, foot);
      setTimeout(() => text.input.focus(), 0);
    }).then((done) => { if (done) render(); });
  }
  // The tasks about this student, in the same look as Today, each with its comments: shown only when there is one (the "Assign a
  // task" button is at the top).
  function tasksCard() {
    const lastAt = (t) => { const c = t.comments || []; return String(c.length ? c[c.length - 1].at : t.at); };
    const tasks = (data.card.tasks || []).slice().sort((a, b) => (a.done - b.done) || lastAt(b).localeCompare(lastAt(a)));
    if (!tasks.length) return null;
    const c = el('section', 'p-card p-tasks');
    const head = el('div', 'p-card-head');
    const open = tasks.filter((t) => !t.done).length;
    head.append(el('h2', '', 'Tasks'), el('span', 'td-chip', open ? `${open} open` : 'All done'));
    c.append(head);
    const label = (id) => ((data.taskTeams || []).find((t) => t.id === id) || { label: id }).label;
    const me = (data.me || {}).name || '';
    const unread = data.taskUnread || {};
    const fresh = Object.values(unread).reduce((n, x) => n + x, 0);
    if (fresh) head.insertBefore(el('span', 'td-chip is-new', `${fresh} new`), head.lastChild);
    tasks.forEach((t) => {
      const r = el('div', `td-task${t.done ? ' is-done' : ''}${unread[t.id] ? ' has-unread' : ''}`);
      const forMe = (data.can.myTeams || []).includes(t.team) || (t.team === 'head' && (data.me || {}).role === 'admin');
      const mine = data.can.removeAnyTask || forMe;
      const box = h('button', { class: 'td-check', type: 'button', 'aria-pressed': String(t.done), title: t.done ? 'Mark as not done' : 'Mark as done', 'aria-label': t.done ? 'Mark as not done' : 'Mark as done', disabled: !mine });
      box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      box.addEventListener('click', async () => {
        box.disabled = true;
        if (!t.done) r.classList.add('is-ticking');
        try { await save(`tasks/${t.id}`, { done: !t.done }, t.done ? 'Marked as not done' : 'Done. Well done.'); setTimeout(render, t.done ? 0 : 450); } catch (e) { r.classList.remove('is-ticking'); box.disabled = false; }
      });
      const mid = el('div', 'td-task-mid');
      const top = el('div', 'td-task-top');
      top.append(el('div', 'td-task-text', t.text));
      if (unread[t.id]) top.append(el('span', 'td-dot', String(unread[t.id])));
      // From whom, to whom, and when.
      const route = el('div', 'td-route');
      route.append(el('span', 'td-from-who', t.by === me ? 'You' : t.by || 'Someone'), el('span', 'td-arrow', '\u2192'), el('span', 'td-to-who', forMe && t.team === 'head' ? 'you' : label(t.team)), el('span', 'td-when', t.at ? when(t.at) : ''));
      if (t.done) route.append(el('span', 'td-donemark', t.doneBy ? `Done by ${t.doneBy}` : 'Done'));
      if (data.can.removeAnyTask || t.by === me) route.append(h('button', { class: 'p-link', type: 'button', onclick: async () => { if (await window.NiecUI.confirm('Remove this task and its comments?', { danger: true, confirmText: 'Remove' })) { await save(`tasks/${t.id}/delete`, {}, 'Task removed'); render(); } } }, 'Remove'));
      const canWrite = mine || t.by === me;
      const thread = window.Portal.taskThread(t, { rowId: id, me, canWrite, unread: unread[t.id] || 0 });
      mid.append(top, route, thread);
      r.append(box, mid);
      if (unread[t.id]) r.addEventListener('pointerdown', () => thread.markRead());
      c.append(r);
    });
    return c;
  }

  function details() {
    const wrap = el('div');
    const s = data.student;
    const tc = tasksCard();
    if (tc) wrap.append(tc);
    if (F.LOST_STAGES.includes(s.stage) || profile().lostReason) {
      const kind = el('section', 'p-card');
      kind.append(el('h2', '', 'Why the student did not go on'));
      const reason = field('Reason', { kind: 'select', choices: F.LOST_REASONS, value: profile().lostReason, disabled: !can() });
      kind.append(reason.wrap);
      if (can()) {
        const bar = el('div', 'p-bar');
        bar.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { await save('profile', { lostReason: reason.input.value }, 'Saved'); render(); } }, 'Save'));
        kind.append(bar);
      }
      wrap.append(kind);
    }
    wrap.append(origin(), personal(), notes());
    return wrap;
  }

  // ---- Personal details: where the student lives now (asked of every inquiry), their home district, date of birth and passport
  // number (from the passport, once they apply). They feed the Dashboard's map of where students come from and the age groups. ----
  let editingPersonal = false;
  function personal() {
    const p = profile();
    const box = el('section', 'p-card');
    const head = el('div', 'p-card-head');
    head.append(el('h2', '', 'Personal details'));
    if (can() && !editingPersonal) head.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { editingPersonal = true; render(); } }, 'Edit'));
    box.append(head);
    if (!editingPersonal) {
      const dl = el('dl', 'p-facts');
      const fact = (k, v) => { const d = el('div', 'p-fact'); d.append(el('dt', '', k), el('dd', '', v || 'Not recorded')); dl.append(d); };
      const age = (() => { if (!p.dob) return ''; const b = new Date(p.dob + 'T12:00:00'); const t = new Date(); let a = t.getFullYear() - b.getFullYear(); if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) a -= 1; return a > 0 && a < 100 ? ` (${a})` : ''; })();
      fact('Lives in', p.livesIn);
      fact('Home district', p.homeDistrict);
      fact('Date of birth', p.dob ? day(p.dob) + age : '');
      fact('Passport number', p.passportNo);
      box.append(dl);
      return box;
    }
    const lives = field('Lives in (district, now)', { kind: 'select', choices: F.DISTRICTS, value: p.livesIn });
    const home = field('Home district (as in the passport)', { kind: 'select', choices: F.DISTRICTS, value: p.homeDistrict });
    const dob = field('Date of birth', { kind: 'date', value: p.dob });
    const pass = field('Passport number', { value: p.passportNo, max: 20 });
    const form = el('div', 'p-form p-form-2');
    form.append(lives.wrap, home.wrap, dob.wrap, pass.wrap);
    const bar = el('div', 'p-bar');
    bar.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
      try { await save('profile', { livesIn: lives.input.value, homeDistrict: home.input.value, dob: dob.input.value, passportNo: pass.input.value.trim().toUpperCase() }, 'Saved'); editingPersonal = false; render(); } catch (e) { /* shown */ }
    } }, 'Save'), h('button', { class: 'btn', type: 'button', onclick: () => { editingPersonal = false; render(); } }, 'Cancel'));
    box.append(form, bar);
    return box;
  }

  // ---- Where the student came from: shown as text, and changed only after pressing Edit ----
  let editingOrigin = false;
  function origin() {
    const p = profile();
    const s = data.student;
    const box = el('section', 'p-card');
    const head = el('div', 'p-card-head');
    head.append(el('h2', '', 'Where the student came from'));
    if (can() && !editingOrigin) head.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { editingOrigin = true; render(); } }, 'Edit'));
    box.append(head);
    if (!editingOrigin) {
      const dl = el('dl', 'p-facts');
      const fact = (k, v) => { const d = el('div', 'p-fact'); d.append(el('dt', '', k), el('dd', '', v || 'Not recorded')); dl.append(d); };
      const g = F.sourceGroup(s.source);
      fact('Student source', g);
      if (g === 'Branch') fact('Which branch', F.branchName(s.source));
      else if (p.sourceDetail || (F.SOURCE_DETAILS[g] || []).length || g === 'Agent') fact(F.SOURCE_DETAIL_LABEL[g] || (g === 'Agent' ? 'Which agent' : 'Where exactly'), p.sourceDetail);
      if (p.sourceRemarks) fact('Remarks', p.sourceRemarks);
      box.append(dl);
      return box;
    }
    const picker = window.SourcePicker.create({ lists, initial: { source: s.source, detail: p.sourceDetail, remarks: p.sourceRemarks }, disabled: !data.can.source });
    const form = el('div', 'p-form');
    picker.nodes.forEach((n) => form.append(n));
    box.append(form);
    if (!data.can.source && s.source) box.append(el('p', 'p-muted p-small', 'The source of this student can only be changed by Admin.'));
    const bar = el('div', 'p-bar');
    bar.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
      try {
        const missing = picker.check();
        if (missing) { say(missing, true); return; }
        const v = picker.value();
        if (data.can.source && v.source !== (s.source || '')) { await save('source', { source: v.source }); data.student.source = v.source; }
        await save('profile', { sourceDetail: v.detail, sourceRemarks: v.remarks }, 'Saved');
        editingOrigin = false; render();
      } catch (e) { /* shown */ }
    } }, 'Save'), h('button', { class: 'btn', type: 'button', onclick: () => { editingOrigin = false; render(); } }, 'Cancel'));
    box.append(bar);
    return box;
  }

  // ---- Notes (replace the Remarks column of the sheet) ----
  // A note is a note (the owner, 14 Nov 2026): no kinds to choose (phone call, office visit, message); notes kept with a kind
  // before still show, all simply as notes. Notes are about the student (IELTS booked, the CAS result, money ready); the talk with
  // a team about a piece of work is in the comments of its task.
  function notes() {
    const wrap = el('section', 'p-card');
    wrap.append(el('h2', '', 'Notes'));
    wrap.append(el('p', '', 'About the student: what was said and agreed, dates booked, results, money and documents. The newest is first.'));
    if (can()) {
      const box = el('div', 'p-note-box');
      const text = el('textarea', 'p-input');
      text.placeholder = 'e.g. IELTS booked for 6 December. The bank statement will be ready next week.';
      text.setAttribute('aria-label', 'Write a note');
      text.maxLength = 4000;
      const bar = el('div', 'p-bar');
      bar.style.marginTop = '0';
      const add = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add note');
      add.addEventListener('click', async () => {
        if (!text.value.trim()) { text.focus(); return; }
        add.disabled = true;
        try { await save('notes', { text: text.value, kind: 'note' }, 'Note added'); render(); } catch (e) { add.disabled = false; }
      });
      bar.append(add);
      box.append(text, bar);
      wrap.append(box);
    }
    const list = el('ol', 'p-timeline');
    const all = [...data.card.notes].reverse();
    const items = showAllNotes ? all : all.slice(0, 4);
    const remark = data.student.remarks;
    if (!all.length && !remark) list.append(el('li', '', 'No notes yet.'));
    items.forEach((n) => {
      const li = el('li');
      const head = el('div', 'p-when');
      head.append(el('b', '', n.by || 'Someone'), el('span', '', when(n.at)));
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
    if (data.card.options.length) head.append(h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openCompose('options') }, 'Email these options'));
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
      const dep = field('Minimum cash deposit', { value: o.deposit, disabled: !can(), max: 400 });
      const sch = field('Scholarship', { value: o.scholarship, disabled: !can(), max: 400 });
      const link = field('Course link', { value: o.link, disabled: !can(), max: 500, placeholder: 'https://…' });
      const note = field('Note for the student', { value: o.note, disabled: !can(), max: 400 });
      if (!o.link && can()) {
        // No link yet: the server looks the course page up and the link is filled in and kept.
        window.SendToStudent.lookupLink(o).then(async (found) => {
          if (!found) { const f = el('a', 'p-link p-small', 'Search for the course page'); f.href = F.courseSearchUrl(o); f.target = '_blank'; f.rel = 'noopener'; link.wrap.append(f); return; }
          link.input.value = found;
          try { await save('options/' + o.id, { link: found }); o.link = found; } catch (e) { /* shown */ }
        });
      }
      form.append(fee.wrap, dep.wrap, sch.wrap, link.wrap, note.wrap);
      item.append(header, form);
      if (can()) {
        const save1 = h('button', { class: 'btn btn-sm', type: 'button' }, 'Save changes');
        save1.addEventListener('click', async () => { try { await save('options/' + o.id, { fee: fee.input.value, deposit: dep.input.value, scholarship: sch.input.value, link: link.input.value, note: note.input.value }, 'Saved'); render(); } catch (e) { /* shown */ } });
        item.append(el('div', 'p-bar'));
        item.lastChild.append(save1);
      }
      list.append(item);
    });
    box.append(list);
    return box;
  }
  async function addOption(o) {
    try { await save('options', { universityId: o.universityId, university: o.university, course: o.course, level: o.level, intake: o.intake, fee: o.fee, deposit: o.deposit, scholarship: o.scholarship, link: o.link }, 'Added to the options'); render(); } catch (e) { /* shown */ }
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
    const w = el('div', 'p-why');
    const addLink = (text, href) => { const a = el('a', 'p-link p-small', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; if (w.childNodes.length) w.append(' · '); w.append(a); };
    if (o.link) addLink(o.linkIsCourse ? 'Course page' : 'University website', o.link);
    if (!o.linkIsCourse) addLink('Search for the course page', F.courseSearchUrl(o));
    c.append(w);
    return c;
  }
  // One box: everything about the student that matters for the universities, and the remarks, then Ask. What is typed is kept on the card.
  function optionsTab() {
    const wrap = el('div');
    wrap.append(chosenOptions());
    const p = profile();
    const lock = !can();
    const box = el('section', 'p-card');
    box.append(el('h2', '', 'University options'));
    box.append(el('p', '', 'Put in everything the student wants and has, and write anything else in the remarks, for example "near Manchester", "5 universities", "show the minimum cash deposit and the full tuition fee". The assistant reads the entry rules of every university in the Fact File and shows the courses the student can be offered.'));
    const inputs = {};
    const form = el('div', 'p-form');
    const add = (key, labelText, opts) => { const x = field(labelText, { value: p[key], disabled: lock, ...opts }); inputs[key] = x.input; form.append(x.wrap); };
    add('studyLevel', 'Study level', { kind: 'select', choices: F.STUDY_LEVELS });
    add('subject', 'Subject or course wanted', { max: 160, placeholder: 'Business, nursing, cyber security' });
    add('qualification', 'Highest qualification', { kind: 'select', choices: F.QUALIFICATIONS });
    add('grade', 'GPA or percentage', { max: 40, placeholder: '2.9 GPA or 62%' });
    add('passedYear', 'Year passed (the study gap is worked out from it)', { max: 10, placeholder: '2020' });
    add('englishTest', 'English test', { kind: 'select', choices: F.ENGLISH_TESTS });
    add('englishScore', 'English score', { max: 60 });
    // No score is asked for when the student has no English test (waiver or MOI, or not taken yet).
    const scoreBox = inputs.englishScore.closest('.p-field') || inputs.englishScore.parentElement;
    const showScore = () => { const none = /moi|waiver|not taken/i.test(inputs.englishTest.value); scoreBox.hidden = none; if (none) inputs.englishScore.value = ''; };
    inputs.englishTest.addEventListener('change', showScore);
    showScore();
    add('budget', 'Budget for the first year (GBP)', { max: 60, placeholder: '17000' });
    add('location', 'Where in the UK', { max: 120, placeholder: 'For example Manchester' });
    const intake = field('Intake', { value: data.student.intake, disabled: true });
    form.append(intake.wrap);
    const remarks = el('textarea', 'p-input');
    remarks.maxLength = 1500;
    remarks.placeholder = 'Remarks: student wants 5 universities near Manchester, show the minimum cash deposit and the full tuition fee, has a 2 year gap.';
    remarks.style.marginTop = '12px';
    const bar = el('div', 'p-bar');
    const ask = h('button', { class: 'btn btn-primary', type: 'button' }, 'Find options');
    bar.append(ask);
    const results = el('div', 'p-option-results');
    const picks = new Set();
    const last = [];
    box.append(form, remarks, bar, results);
    remarks.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask.click(); });
    ask.addEventListener('click', async () => {
      ask.disabled = true;
      results.replaceChildren(el('div', 'p-thinking', 'Reading the entry rules of every university…'));
      try {
        const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
        if (can()) await save('profile', values);
        const out = await api('/api/finder', { ...values, request: remarks.value, studentId: id });
        window.SendToStudent.drawAnswer(out, results, { onAdd: can() ? addOption : null, picks, sendBtn: { hidden: true }, last });
      } catch (e) { results.replaceChildren(el('div', 'p-notice bad', e.message)); }
      ask.disabled = false;
    });
    wrap.append(box);

    const search = el('section', 'p-card');
    search.append(el('h2', '', 'Search every course'));
    const sbar = el('div', 'p-form');
    const q = field('Subject or university', { placeholder: 'cyber security', value: profile().subject || '' });
    const lv = field('Level', { kind: 'select', choices: F.STUDY_LEVELS, value: profile().studyLevel });
    const it = field('Intake', { placeholder: 'January 2027', value: '' });
    sbar.append(q.wrap, lv.wrap, it.wrap);
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
    search.append(sbar, out);
    wrap.append(search);
    run();
    return wrap;
  }

  // ---- Send a message: choose one, it opens on its own full page (compose.html) ----
  function messageTab() {
    const wrap = el('div');
    const left = el('section', 'p-card');
    left.append(el('h2', '', 'Choose a message'));
    left.append(el('p', '', `The message opens on a full page where you can read it large, change the words and attach files. ${data.mail.ready ? `Emails go from ${data.mail.from}, with your signature, and replies come back there.` : data.mail.own ? 'To email, set up your own email first (Message templates, Your email and signature).' : 'Emails carry the signature.'}`));
    const stage = data.student.stage;
    const ordered = [...templates].sort((a, b) => (b.stages.includes(stage) - a.stages.includes(stage)) || a.name.localeCompare(b.name));
    const list = el('div', 'p-templates');
    ordered.forEach((t) => {
      const b = el('button', 'p-template');
      b.type = 'button';
      b.disabled = !can();
      b.append(el('b', '', t.name), el('small', '', t.stages.includes(stage) ? 'Suits this stage' : t.stages.join(', ')));
      b.addEventListener('click', () => openCompose(t.key));
      list.append(b);
    });
    const own = el('button', 'p-template');
    own.type = 'button';
    own.disabled = !can();
    own.append(el('b', '', 'Other: write my own message'), el('small', '', 'Write the words yourself and send them'));
    own.addEventListener('click', () => openCompose('custom'));
    list.append(own);
    left.append(list);
    const sentBox = el('section', 'p-card');
    sentBox.append(el('h2', '', 'Sent to this student'));
    if (!data.card.messages.length) sentBox.append(el('p', 'p-muted p-small', 'Nothing sent yet.'));
    [...data.card.messages].reverse().slice(0, 10).forEach((m) => {
      const row = el('div', 'p-sent');
      row.append(el('b', '', m.template || 'Message'), el('span', 'p-chip', m.channel === 'whatsapp' ? 'WhatsApp opened' : m.status === 'sent' ? 'Email sent' : m.status === 'failed' ? 'Email failed' : m.status === 'opened' ? 'Email opened in your program' : 'Preview only'), el('span', 'p-muted p-small', `${m.by}, ${when(m.at)}`));
      if (m.attachments && m.attachments.length) row.append(el('span', 'p-muted p-small', 'Files: ' + m.attachments.join(', ')));
      if (m.channel === 'email') row.append(h('button', { class: 'p-link', type: 'button', onclick: () => readMessage(m) }, 'Read'));
      sentBox.append(row);
    });
    wrap.append(left, sentBox);
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

  const openCompose = (template) => { (window.top || window).location.href = `/compose?id=${encodeURIComponent(id)}&template=${encodeURIComponent(template)}`; };
  function select(name, template) {
    const changed = name !== tab;
    tab = name;
    history.replaceState(null, '', location.pathname + location.search + '#' + name);
    // Another tab cross-fades in, as on a Mac; the same tab again is redrawn at once.
    if (changed && window.NiecUI && window.NiecUI.swap) window.NiecUI.swap(() => render(template), { soft: true });
    else render(template);
  }
  function render(template) {
    document.title = `${data.student.name} · Student · ISR`;
    const frag = document.createDocumentFragment();
    frag.append(hero());
    if (!can()) frag.append(el('div', 'p-notice', 'You can read this student but not change them.'));
    const tabs = el('div', 'p-tabs');
    tabs.style.marginTop = '16px';
    tabs.setAttribute('role', 'tablist');
    if (tab === 'message' && !can()) tab = 'details';
    TABS.filter(([key]) => key !== 'message' || can()).forEach(([key, text]) => {
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
    frag.append(tab === 'options' ? optionsTab() : tab === 'message' ? messageTab() : details());
    view.replaceChildren(frag);
  }

  async function start() {
    if (!id) { view.replaceChildren(el('div', 'p-card', 'Choose a student from the sheet first.')); return; }
    try {
      const [d, t, l] = await Promise.all([api('/api/cards/' + encodeURIComponent(id)), api('/api/templates'), api('/api/card-lists')]);
      data = d; templates = t.templates; lists = l;
      if (tab === 'messages') tab = 'message';
      if (!TABS.some(([k]) => k === tab)) tab = 'details';
      render();
    } catch (e) {
      view.replaceChildren(h('div', { class: 'p-card' }, el('h2', '', 'This student cannot be opened'), el('p', '', e.message), h('a', { class: 'btn', href: '/students' }, 'Back to All Students')));
    }
  }
  window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (data && t !== tab && TABS.some(([k]) => k === t)) { tab = t; render(); } });
  start();
})();

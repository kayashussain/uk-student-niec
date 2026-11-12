// Send one message to many students: choose the intake and the stage, tick the students, write (or choose) the message, then send the
// emails in one go (when the office mailbox is set up) or open each student's email or WhatsApp one after the other.
(function () {
  const { el, h, api, field } = window.Portal;
  const view = document.getElementById('view');
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  let students = [];
  let lists = { intakes: [], stages: [] };
  let templates = [];
  let mail = { ready: false };
  const chosen = new Set();
  let items = []; // previews of the chosen students

  async function start() {
    try {
      const [l, t] = await Promise.all([api('/api/bulk/students'), api('/api/templates')]);
      students = l.students; lists = l; mail = l.mail; templates = t.templates;
      render();
    } catch (e) { view.replaceChildren(el('div', 'p-card', e.message)); }
  }

  function render() {
    const wrap = el('div');
    const head = el('div', 'p-head');
    const title = el('div');
    title.append(el('h1', '', 'Send to many students'), el('p', '', 'Choose the students, write the message once and it goes to each of them with their own name and details. The signature is added to every email.'));
    head.append(title, h('a', { class: 'btn', href: '/students' }, 'Back to Student Details'));
    wrap.append(head);

    // 1. who
    const who = el('section', 'p-card');
    who.append(el('h2', '', '1. Choose the students'));
    const bar = el('div', 'p-form');
    const intake = field('Intake', { kind: 'select', choices: [['', 'All intakes you can see'], ...lists.intakes.map((i) => [i.id, i.name])] });
    const stage = field('Stage (application status)', { kind: 'select', choices: [['', 'Every stage'], ...lists.stages.map((s) => [s, s])] });
    const search = field('Name', { placeholder: 'Type to narrow the list' });
    bar.append(intake.wrap, stage.wrap, search.wrap);
    who.append(bar);
    const info = el('div', 'p-muted p-small');
    const listBox = el('div', 'p-pick-list');
    listBox.style.maxHeight = '340px';
    listBox.style.overflow = 'auto';
    const tools = el('div', 'p-bar');
    const visible = () => students.filter((s) => (!intake.input.value || s.sheetId === intake.input.value) && (!stage.input.value || s.stage === stage.input.value) && (!search.input.value || s.name.toLowerCase().includes(search.input.value.toLowerCase())));
    const draw = () => {
      const v = visible();
      info.textContent = `${v.length} students match. ${chosen.size} chosen.`;
      listBox.replaceChildren(...(v.length ? v.slice(0, 400).map((s) => {
        const row = el('label', 'p-check');
        const c = el('input'); c.type = 'checkbox'; c.checked = chosen.has(s.id);
        c.addEventListener('change', () => { if (c.checked) chosen.add(s.id); else chosen.delete(s.id); info.textContent = `${v.length} students match. ${chosen.size} chosen.`; });
        const t = el('span'); t.append(el('b', '', s.name), el('div', 'p-muted p-small', [s.stage, s.intake, s.email || 'no email', s.whatsapp ? '' : 'no WhatsApp number'].filter(Boolean).join(' · ')));
        row.append(c, t);
        return row;
      }) : [el('div', 'p-empty', 'No student matches.')]));
    };
    tools.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { visible().slice(0, 150).forEach((s) => chosen.add(s.id)); draw(); } }, 'Tick all shown (up to 150)'), h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { chosen.clear(); draw(); } }, 'Clear'));
    [intake, stage, search].forEach((x) => x.input.addEventListener('input', draw));
    who.append(info, tools, listBox);
    wrap.append(who);
    draw();

    // 2. what
    const what = el('section', 'p-card');
    what.append(el('h2', '', '2. Write the message'));
    const tmpl = field('Start from', { kind: 'select', choices: [['custom', 'Other: my own words'], ...templates.map((t) => [t.key, t.name])], value: 'custom' });
    const subject = field('Subject', { wide: true, max: 200 });
    const body = field('Email text (the words in curly brackets are filled in for each student)', { kind: 'area', max: 8000, wide: true, value: 'Dear {first_name},\n\n' });
    body.input.style.minHeight = '200px';
    const wa = field('WhatsApp text', { kind: 'area', max: 2000, wide: true, value: 'Hello {first_name}, ' });
    const form = el('div', 'p-form');
    form.append(tmpl.wrap, subject.wrap, body.wrap, wa.wrap);
    what.append(form);
    tmpl.input.addEventListener('change', () => {
      const t = templates.find((x) => x.key === tmpl.input.value);
      subject.input.value = t ? t.subject : '';
      body.input.value = t ? t.body : 'Dear {first_name},\n\n';
      wa.input.value = t ? t.whatsapp : 'Hello {first_name}, ';
    });
    wrap.append(what);

    // 3. send
    const send = el('section', 'p-card');
    send.append(el('h2', '', '3. Check and send'));
    const out = el('div');
    const actions = el('div', 'p-bar');
    const check = h('button', { class: 'btn', type: 'button' }, 'Check the message for each student');
    const sendAll = h('button', { class: 'btn btn-primary', type: 'button' }, 'Send all the emails now');
    sendAll.disabled = true;
    actions.append(check, sendAll);
    if (!mail.ready) send.append(el('div', 'p-notice', 'This server cannot send email by itself yet (the office mailbox is not set up). Check the message, then open each email in your own email program or each WhatsApp chat below. The signature picture is only added to emails the server sends itself.'));
    send.append(actions, out);
    wrap.append(send);

    const payload = () => ({ ids: [...chosen], template: tmpl.input.value, subject: subject.input.value, body: body.input.value, whatsapp: wa.input.value });
    check.addEventListener('click', async () => {
      if (!chosen.size) { say('Tick at least one student first.', true); return; }
      check.disabled = true;
      try {
        const r = await api('/api/bulk/preview', payload());
        items = r.items;
        const ok = items.filter((i) => !i.error && !i.problem).length;
        out.replaceChildren(el('p', '', `${ok} of ${items.length} students are ready for email. The others are shown with the reason.`));
        items.forEach((i) => {
          const row = el('div', 'p-sent');
          if (i.error) { row.append(el('b', '', i.id), el('span', 'p-muted', i.error)); out.append(row); return; }
          row.append(el('b', '', i.name), el('span', 'p-muted p-small', i.problem || i.to));
          if (i.missing && i.missing.length) row.append(el('span', 'p-chip', 'Missing: ' + i.missing.join(', ')));
          row.append(h('button', { class: 'p-link', type: 'button', onclick: () => window.NiecUI.alert ? window.NiecUI.alert(i.text, { title: i.subject }) : say(i.subject) }, 'Read'));
          if (!mail.ready && !i.problem) row.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { location.href = `mailto:${encodeURIComponent(i.to)}?subject=${encodeURIComponent(i.subject)}&body=${encodeURIComponent(i.text)}`; } }, 'Email'));
          if (i.whatsapp && i.whatsapp.number) row.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => {
            window.open(`https://wa.me/${i.whatsapp.number}?text=${encodeURIComponent(i.whatsapp.text)}`, '_blank', 'noopener');
            api(`/api/cards/${i.id}/messages/send`, { channel: 'whatsapp', template: tmpl.input.value, whatsapp: wa.input.value }).catch(() => {});
            e.target.textContent = 'WhatsApp opened'; e.target.disabled = true;
          } }, 'WhatsApp'));
          out.append(row);
        });
        sendAll.disabled = !(mail.ready && ok);
      } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); }
      check.disabled = false;
    });
    sendAll.addEventListener('click', async () => {
      if (!subject.input.value.trim()) { say('Write the subject first.', true); return; }
      if (!(await window.NiecUI.confirm(`Send this email to ${chosen.size} students?`, { confirmText: 'Send emails' }))) return;
      sendAll.disabled = true;
      try {
        const r = await api('/api/bulk/send-email', payload());
        const sent = r.results.filter((x) => x.status === 'sent').length;
        out.replaceChildren(el('div', `p-notice ${sent === r.results.length ? 'ok' : 'warn'}`, `${sent} of ${r.results.length} emails sent.`), ...r.results.filter((x) => x.status !== 'sent').map((x) => el('div', 'p-sent', `${x.name}: ${x.error || x.status}`)));
        say(`${sent} emails sent`);
      } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); sendAll.disabled = false; }
    });
    view.replaceChildren(wrap);
  }
  start();
})();

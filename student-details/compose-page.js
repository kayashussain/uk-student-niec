// The page where a message to a student is written and sent: the whole email is shown at full size, its words can be changed, files can be
// attached, and it is sent by email, opened in the person's own email program, or opened in WhatsApp. Attached files are read in this
// browser, sent once inside the email and never stored on the server: only their names are written on the student card.
(function () {
  const { el, h, api, when, field, copy } = window.Portal;
  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';
  const templateKey = params.get('template') || '';
  const view = document.getElementById('view');
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  const MAX_TOTAL = 12 * 1024 * 1024;
  let student = null;
  let mail = { ready: false, from: '' };
  let files = []; // [{ name, type, size, file }]
  let preview = null;
  let timer = null;

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read ' + file.name));
    r.readAsDataURL(file);
  });
  const size = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  async function build(templates) {
    const first = await api(`/api/cards/${id}/messages/preview`, { template: templateKey });
    const tmpl = templates.find((t) => t.key === templateKey) || (templateKey === 'custom' ? { name: 'Write my own message' } : null);
    document.title = `${tmpl ? tmpl.name : 'Message'} · ${student.name} · ISR`;
    const wrap = el('div');
    const head = el('div', 'p-head');
    const title = el('div');
    title.append(el('h1', '', tmpl ? tmpl.name : 'Message'), el('p', '', `To ${student.name}${student.email ? ' (' + student.email + ')' : ''}. Nothing is sent until you press a send button.`));
    head.append(title, h('a', { class: 'btn', href: `/student?id=${encodeURIComponent(id)}#message` }, 'Back to the student'));
    wrap.append(head);

    const cols = el('div', 'p-cols p-cols-compose');
    const left = el('section', 'p-card');
    const right = el('section', 'p-card');

    // the email as it will look, large
    left.append(el('h2', '', 'The email'));
    const frame = el('iframe', 'p-preview');
    frame.classList.add('p-preview-tall');
    frame.setAttribute('sandbox', '');
    frame.title = 'The email as the student sees it';
    left.append(frame);

    // the words, the address, the files
    right.append(el('h2', '', 'Send'));
    const to = field('To', { value: first.to, max: 254, placeholder: 'student@example.com', wide: true });
    const subject = field('Subject', { value: first.source.subject, max: 200, wide: true });
    const bodyText = field('Message (the words in curly brackets are filled in from the student)', { kind: 'area', value: first.source.body, max: 8000, wide: true });
    bodyText.input.style.minHeight = '260px';
    const form = el('div', 'p-form');
    form.append(to.wrap, subject.wrap, bodyText.wrap);
    right.append(form);

    const attach = el('div');
    attach.append(el('h3', '', 'Attachments'));
    const list = el('div');
    const pick = el('input'); pick.type = 'file'; pick.multiple = true; pick.setAttribute('aria-label', 'Attach files');
    pick.addEventListener('change', () => {
      [...pick.files].forEach((f) => files.push({ name: f.name, type: f.type, size: f.size, file: f }));
      pick.value = '';
      drawFiles();
    });
    const drawFiles = () => {
      const total = files.reduce((n, f) => n + f.size, 0);
      list.replaceChildren(...(files.length ? files.map((f, i) => {
        const r = el('div', 'p-sent');
        r.append(el('b', '', f.name), el('span', 'p-muted p-small', size(f.size)), h('button', { class: 'p-link', type: 'button', onclick: () => { files.splice(i, 1); drawFiles(); } }, 'Remove'));
        return r;
      }) : [el('p', 'p-muted p-small', 'No files attached.')]));
      if (total > MAX_TOTAL) list.append(el('div', 'p-notice bad', `The files are ${size(total)} together; the limit is ${size(MAX_TOTAL)}.`));
    };
    drawFiles();
    attach.append(list, pick, el('p', 'p-muted p-small', 'A file is read in your browser and goes out inside the email once. It is not saved on the server, and the server keeps no copy: only the file name is noted on the student card.'));
    right.append(attach);

    const notes = el('div');
    left.insertBefore(notes, frame.previousSibling && frame.previousSibling.tagName === 'H2' ? frame : left.firstChild);
    const bar = el('div', 'p-bar');
    right.append(bar);
    const msg = el('div', 'p-msg');
    right.append(msg);

    const refresh = async () => {
      try {
        preview = await api(`/api/cards/${id}/messages/preview`, { template: templateKey, subject: subject.input.value, body: bodyText.input.value, to: to.input.value });
        frame.srcdoc = preview.html;
        const gaps = preview.missing.length > 0;
        sendEmail.disabled = gaps || !mail.ready; copyBtn.disabled = gaps; if (typeof waBtn !== 'undefined') waBtn.disabled = gaps;
        [sendEmail, copyBtn].concat(typeof waBtn !== 'undefined' ? [waBtn] : []).forEach((b) => { b.title = gaps ? 'Fill in what is missing on the student first' : ''; });
        notes.replaceChildren();
        if (preview.missing.length) notes.append(el('div', 'p-notice warn', 'Check before sending: this student has no ' + preview.missing.join(' and no ') + ' yet, so the message below has gaps. Fill them in on the student card first, or write the message yourself.'));
        if (!mail.ready) notes.append(el('div', 'p-notice', 'Email cannot be sent from this computer yet because the office mailbox is not set up (this is normal on a test computer). On the real server, Send email works and adds your signature picture. You can copy the text meanwhile.'));
      } catch (e) { notes.replaceChildren(el('div', 'p-notice bad', e.message)); }
    };
    [subject, bodyText, to].forEach((x) => x.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refresh, 350); }));

    const sendEmail = h('button', { class: 'btn btn-primary', type: 'button' }, 'Send email');
    sendEmail.disabled = !mail.ready;
    sendEmail.addEventListener('click', async () => {
      const total = files.reduce((n, f) => n + f.size, 0);
      if (total > MAX_TOTAL) { say('The files are too large.', true); return; }
      if (preview.missing.length && !(await window.NiecUI.confirm('These are not filled in yet: ' + preview.missing.join(', ') + '. The message will read badly without them. Send it anyway?', { confirmText: 'Send anyway' }))) return;
      if (!(await window.NiecUI.confirm(`Send "${preview.subject}" to ${to.input.value || 'the student'}${files.length ? ` with ${files.length} attached file${files.length === 1 ? '' : 's'}` : ''}?`, { confirmText: 'Send email' }))) return;
      sendEmail.disabled = true;
      msg.textContent = 'Sending…'; msg.className = 'p-msg';
      try {
        const attachments = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, data: await toBase64(f.file) })));
        const r = await api(`/api/cards/${id}/messages/send`, { channel: 'email', template: templateKey, subject: subject.input.value, body: bodyText.input.value, to: to.input.value, attachments });
        say(`Email sent from ${r.from}`);
        files = []; drawFiles();
        msg.textContent = `Sent from ${r.from}.`;
      } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; }
      sendEmail.disabled = false;
    });
    const copyBtn = h('button', { class: 'btn', type: 'button', onclick: async () => say((await copy(`${preview.subject}\n\n${preview.text}`)) ? 'Email text copied' : 'Could not copy', false) }, 'Copy email text');
    bar.append(sendEmail, copyBtn);
    right.append(el('h3', '', 'WhatsApp'));
    const wa = el('pre', 'p-wa-preview');
    right.append(wa);
    const waBar = el('div', 'p-bar');
    const waBtn = h('button', { class: 'btn', type: 'button' }, 'Open WhatsApp');
    waBtn.addEventListener('click', async () => {
      if (preview.missing.length && !(await window.NiecUI.confirm('These are not filled in yet: ' + preview.missing.join(', ') + '. The message will read badly without them. Open WhatsApp anyway?', { confirmText: 'Open anyway' }))) return;
      try {
        await api(`/api/cards/${id}/messages/send`, { channel: 'whatsapp', template: templateKey });
        window.open(`https://wa.me/${preview.whatsapp.number}?text=${encodeURIComponent(preview.whatsapp.text)}`, '_blank', 'noopener');
      } catch (e) { say(e.message, true); }
    });
    waBar.append(waBtn);
    right.append(waBar);
    const showWa = () => { wa.textContent = preview ? preview.whatsapp.text : ''; waBtn.disabled = !(preview && preview.whatsapp.number) || Boolean(preview && preview.missing.length); if (preview && !preview.whatsapp.number) wa.textContent += '\n\n(This student has no WhatsApp number on the sheet.)'; };
    const oldRefresh = refresh;
    cols.append(left, right);
    wrap.append(cols);
    view.replaceChildren(wrap);
    await oldRefresh();
    showWa();
    [subject, bodyText].forEach((x) => x.input.addEventListener('input', () => setTimeout(showWa, 500)));
  }

  async function start() {
    if (!id) { view.replaceChildren(el('div', 'p-card', 'Choose a student first.')); return; }
    try {
      const [d, t] = await Promise.all([api('/api/cards/' + encodeURIComponent(id)), api('/api/templates')]);
      student = d.student; mail = d.mail;
      if (!d.can.edit) { view.replaceChildren(h('div', { class: 'p-card' }, el('h2', '', 'You can read this student but not send messages'), h('a', { class: 'btn', href: '/students' }, 'Back'))); return; }
      await build(t.templates);
    } catch (e) {
      view.replaceChildren(h('div', { class: 'p-card' }, el('h2', '', 'This message cannot be opened'), el('p', '', e.message), h('a', { class: 'btn', href: '/students' }, 'Back to All Students')));
    }
  }
  start();
})();

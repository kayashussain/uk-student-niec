// My email and WhatsApp: each person sets up their own mailbox once, so the emails they send to students go from their own address
// (see user-mail.js), and learns how WhatsApp messages go from their own WhatsApp. The password is checked with a test email, saved
// encrypted on the server and never shown again.
(function () {
  const { el, h, api, field } = window.Portal;
  const view = document.getElementById('view');
  const say = (t, bad) => window.NiecUI.toast(t, { type: bad ? 'error' : 'success' });

  function emailCard(d, reload) {
    const c = el('section', 'p-card');
    c.append(el('h2', '', 'Your email'));
    if (d.set) {
      c.append(el('p', '', `Emails you send to students go from ${d.from}, signed with your name.`),
        el('p', 'p-muted', `Checked on ${new Date(d.checkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. To change the address or the password, fill in the form again.`));
    } else if (d.admin) {
      c.append(el('p', '', d.officeReady ? 'Your emails go from the office mailbox. Set up your own here only if you want to send from another address.' : 'The office mailbox is not set up yet. Set up your own here to email students.'));
    } else {
      c.append(el('div', 'p-notice warn', 'Set up your own email to send emails to students. Until then, Send email keeps a preview on the card and nothing is sent.'));
    }
    const from = field('Your email address', { value: d.from || '', placeholder: 'e.g. asha@niecedu.com.np', max: 254 });
    from.input.type = 'email'; from.input.autocomplete = 'email';
    const pass = field('The password of that mailbox', { placeholder: d.set ? 'Type it again to change anything' : '', max: 300 });
    pass.input.type = 'password'; pass.input.autocomplete = 'new-password';
    const phone = field('Your phone or WhatsApp number (for your email signature, optional)', { value: d.phone || '', placeholder: 'e.g. +977 9800000001', max: 40 });
    const host = field('Mail server', { value: d.host || d.defaults.host, max: 200 });
    const port = field('Port', { value: String(d.port || d.defaults.port || 465), max: 5 });
    const security = field('Security', { kind: 'select', choices: [['ssl', 'SSL (port 465)'], ['starttls', 'STARTTLS (port 587)']], value: d.security || d.defaults.security || 'ssl' });
    const more = el('details');
    more.append(el('summary', '', 'Mail server settings (only if your email is not on the office mail server)'));
    const g2 = el('div', 'p-form p-form-2'); g2.append(host.wrap, port.wrap, security.wrap); more.append(g2);
    const g = el('div', 'p-form p-form-2'); g.append(from.wrap, pass.wrap, phone.wrap);
    const msg = el('div', 'p-msg');
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Check and save');
    save.addEventListener('click', async () => {
      save.disabled = true; msg.textContent = 'Sending a test email to your address...'; msg.className = 'p-msg';
      try {
        await api('/api/my-mail', { from: from.input.value, password: pass.input.value, phone: phone.input.value, host: host.input.value, port: port.input.value, security: security.input.value });
        say('Your email works and is saved. A test email is in your inbox.');
        reload();
      } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; save.disabled = false; }
    });
    const bar = el('div', 'p-bar'); bar.append(save);
    if (d.set) {
      bar.append(h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!(await window.NiecUI.confirm('Remove your mailbox from ISR? You can set it up again at any time.', { danger: true, confirmText: 'Remove' }))) return;
        await api('/api/my-mail/delete', {}); say('Removed'); reload();
      } }, 'Remove my mailbox'));
    }
    c.append(g, more, el('p', 'p-muted', 'ISR sends a test email to your address first and saves it only if that works. The password is kept encrypted on the server and is never shown again, to anyone.'), bar, msg);
    return c;
  }

  // Their own signature: a picture uploaded once (as the office signature is for Admin), put at the end of every email they send.
  function signatureCard(d, reload) {
    const c = el('section', 'p-card');
    c.append(el('h2', '', 'Your email signature'));
    c.append(el('p', 'p-muted', d.admin
      ? 'Your emails end with the office signature picture. Upload your own here only if you want a different one.'
      : 'Upload a picture of your signature (PNG or JPG, at most 1 MB): your name, title and contact as you want them under your emails. It goes at the end of every email you send.'));
    const show = el('div', 'p-sig');
    if (d.signature) {
      const img = h('img', { src: '/api/my-mail/signature?t=' + Date.now(), alt: 'Your email signature' });
      show.append(img);
    } else show.append(el('div', 'p-sig-empty', 'No signature picture yet.'));
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true });
    const pick = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => file.click() }, d.signature ? 'Change the picture' : 'Upload a signature picture');
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      pick.disabled = true;
      try {
        const r = await fetch('/api/my-mail/signature', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'It could not be uploaded.');
        say('Your signature is saved.');
        reload();
      } catch (e) { say(e.message, true); pick.disabled = false; }
    });
    const bar = el('div', 'p-bar'); bar.append(pick, file);
    if (d.signature) bar.append(h('button', { class: 'btn', type: 'button', onclick: async () => { await api('/api/my-mail/signature/delete', {}); say('Removed'); reload(); } }, 'Remove'));
    c.append(show, bar);
    return c;
  }

  function whatsappCard() {
    const c = el('section', 'p-card');
    c.append(el('h2', '', 'Your WhatsApp'));
    c.append(el('p', '', 'WhatsApp messages always go from your own WhatsApp: the WhatsApp button on a student card (or on Follow-up) opens the chat in your WhatsApp with the message ready, and you press send. Nothing to save here.'));
    const steps = el('ol');
    ['On this computer, open WhatsApp Web (the button below) or the WhatsApp Desktop app.',
      'On your phone, open WhatsApp, then Settings (or the three dots), Linked devices, Link a device, and scan the code on the screen.',
      'That is all. From now on the WhatsApp button opens your own chats on this computer. On your phone, it opens the WhatsApp app.'].forEach((t) => steps.append(el('li', '', t)));
    const go = h('a', { class: 'btn', href: 'https://web.whatsapp.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Open WhatsApp Web');
    const bar = el('div', 'p-bar'); bar.append(go);
    c.append(steps, bar);
    return c;
  }

  async function load() {
    const d = await api('/api/my-mail');
    const page = el('div', 'td-page');
    const head = el('header', 'td-hello');
    head.append(el('span', 'td-kicker', 'Your account'), el('h1', '', 'My email, signature and WhatsApp'),
      el('p', '', 'Messages to students go from your own email and your own WhatsApp, signed with your name.'));
    page.append(head, emailCard(d, load), signatureCard(d, load), whatsappCard());
    view.replaceChildren(page);
  }
  load().catch((e) => view.replaceChildren(el('div', 'p-card', e.message)));
})();

// Message templates (Admin edits, everyone else reads on the student card).
(function () {
  const { el, h, api, field, dialog } = window.Portal;
  const $ = (id) => document.getElementById(id);
  let data = null;
  let openKey = '';
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });

  function list() {
    const box = $('list');
    box.replaceChildren(...data.templates.map((t) => {
      const b = el('button', 'p-template');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(t.key === openKey));
      b.append(el('b', '', t.name), el('small', '', `${t.stages.join(', ') || 'Any stage'}${t.edited ? ' · edited' : ''}${t.builtIn ? '' : ' · yours'}`));
      b.addEventListener('click', () => { openKey = t.key; list(); edit(t); });
      return b;
    }));
  }
  function edit(t) {
    const ed = $('editor');
    const name = field('Name', { value: t.name, max: 80 });
    const subject = field('Email subject', { value: t.subject, max: 200, wide: true });
    const body = field('Email message', { kind: 'area', value: t.body, max: 8000, wide: true, hint: 'A blank line starts a new paragraph. A line that starts with "- " is a bullet, and one that starts with "## " is a small heading.' });
    body.input.style.minHeight = '300px';
    const wa = field('WhatsApp message (short)', { kind: 'area', value: t.whatsapp, max: 3000, wide: true });
    const stages = el('div', 'p-form');
    const checks = data.stages.map((s) => {
      const l = el('label', 'p-check'); const c = el('input'); c.type = 'checkbox'; c.checked = t.stages.includes(s); c.value = s; l.append(c, el('span', '', s)); stages.append(l); return c;
    });
    const form = el('div', 'p-form p-form-2');
    form.append(name.wrap, el('div'), subject.wrap, body.wrap, wa.wrap);
    const words = el('details');
    words.append(el('summary', 'p-link', 'Words you can use'));
    const dl = el('dl', 'p-sheet-grid');
    window.__fields = data.fields;
    data.fields.forEach(([k, d]) => { const x = el('div'); x.append(h('dt', {}, `{${k}}`), el('dd', '', d)); dl.append(x); });
    words.append(dl);
    const bar = el('div', 'p-bar');
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
    const msg = el('div', 'p-msg');
    save.addEventListener('click', async () => {
      try {
        await api('/api/templates/' + t.key, { name: name.input.value, subject: subject.input.value, body: body.input.value, whatsapp: wa.input.value, stages: checks.filter((c) => c.checked).map((c) => c.value) });
        say('Template saved'); await load(t.key);
      } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; }
    });
    bar.append(save);
    const remove = h('button', { class: 'btn btn-danger', type: 'button' }, t.builtIn ? 'Put back the original text' : 'Delete');
    remove.addEventListener('click', async () => {
      if (!(await window.NiecUI.confirm(t.builtIn ? 'This template goes back to the text it came with.' : 'This template is deleted.', { danger: true, confirmText: t.builtIn ? 'Put back' : 'Delete' }))) return;
      try { await api(`/api/templates/${t.key}/delete`, {}); say(t.builtIn ? 'Original text put back' : 'Deleted'); openKey = t.builtIn ? t.key : ''; await load(openKey); } catch (e) { say(e.message, true); }
    });
    if (t.edited || !t.builtIn) bar.append(remove);
    ed.replaceChildren(el('h2', '', t.name), el('p', 'p-muted', 'Which stages should this suit? The student card puts the suitable templates first.'), stages, el('h3', '', 'Words'), form, words, bar, msg);
    if (!data.canEdit) { ed.querySelectorAll('input, textarea, select, button').forEach((x) => { x.disabled = true; }); }
  }
  function signature() {
    const s = data.signature;
    const f = el('div', 'p-form');
    const fields = {};
    [['name', 'Name'], ['title', 'Title'], ['company', 'Company name'], ['short', 'Short name (for messages)'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp'], ['email', 'Email shown'], ['website', 'Website'], ['address', 'Address']].forEach(([k, label]) => { fields[k] = field(label, { value: s[k], max: 200 }); f.append(fields[k].wrap); });
    const copyBox = el('label', 'p-check');
    const c = el('input'); c.type = 'checkbox'; c.checked = s.copyToOffice !== false;
    copyBox.append(c, el('span', '', 'Send the office mailbox a copy of every email (so it is found there with the student\'s replies)'));
    const save = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Save signature');
    save.addEventListener('click', async () => { try { await api('/api/templates/signature', { ...Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, x.input.value])), copyToOffice: c.checked }); say('Signature saved'); } catch (e) { say(e.message, true); } });
    if (!data.canEdit) { f.querySelectorAll('input').forEach((x) => { x.disabled = true; }); c.disabled = true; save.disabled = true; }
    $('sig').replaceChildren(f, copyBox, el('div', 'p-bar'));
    $('sig').lastChild.append(save);
  }
  async function load(key) {
    data = await api('/api/templates');
    $('mailNote').hidden = false;
    $('mailNote').className = data.mail.ready ? 'p-notice ok' : 'p-notice warn';
    $('mailNote').textContent = data.mail.ready ? `Emails are sent from ${data.mail.from}.` : 'Email is not set up on this server yet, so sending only keeps a preview on the student card. Set it up once with "node scripts/email.js setup" (see DEPLOY.md). Students can only be sent messages from kayas@niecedu.com.np (or the mailbox set up), and WhatsApp messages open from your own phone or WhatsApp Web.';
    list();
    signature();
    const t = data.templates.find((x) => x.key === (key || openKey));
    if (t) edit(t); else $('editor').replaceChildren(el('p', 'p-muted', 'Choose a template on the left to edit it.'));
  }
  $('addTemplate').addEventListener('click', () => dialog('New template', (body, close) => {
    const name = field('Name', { max: 80, placeholder: 'Scholarship deadline reminder' });
    const subject = field('Email subject', { max: 200 });
    const text = field('Email message', { kind: 'area', max: 8000, value: 'Dear {first_name},\n\n' });
    const msg = el('div', 'p-msg');
    const foot = el('div', 'p-dialog-foot');
    foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
    const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Create');
    ok.addEventListener('click', async () => { try { const r = await api('/api/templates', { name: name.input.value, subject: subject.input.value, body: text.input.value, whatsapp: '' }); close(r.template.key); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; } });
    foot.append(ok);
    body.append(name.wrap, subject.wrap, text.wrap, msg, foot);
  }).then((key) => { if (key) { openKey = key; load(key); } }));
  load().catch((e) => { $('editor').replaceChildren(el('div', 'p-notice bad', e.message)); });
})();

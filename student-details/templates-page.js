// Message templates (Admin edits, everyone else reads on the student card). A slim list on the left (with a search), the open
// template in calm panels (stages, email, WhatsApp) with a Save bar that stays on screen, the words that can be filled in as chips
// that go where the cursor is, and the email signature on its own tab.
(function () {
  const { el, h, api, field, dialog } = window.Portal;
  const $ = (id) => document.getElementById(id);
  let data = null;
  let openKey = '';
  let lastBox = null; // the subject, email or WhatsApp box last typed in: a word chip goes there
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });

  function list() {
    const q = $('tpSearch').value.trim().toLowerCase();
    const shown = data.templates.filter((t) => !q || `${t.name} ${t.stages.join(' ')}`.toLowerCase().includes(q));
    $('list').replaceChildren(...(shown.length ? shown.map((t) => {
      const b = el('button', 'tp-item' + (t.key === openKey ? ' on' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(t.key === openKey));
      const tags = el('span', 'tp-item-meta', t.stages.length ? t.stages.join(', ') : 'Any stage');
      b.append(el('b', '', t.name), tags);
      if (t.edited || !t.builtIn) b.append(el('span', 'tp-flag', t.builtIn ? 'Edited' : 'Yours'));
      b.addEventListener('click', () => { openKey = t.key; list(); edit(t); });
      return b;
    }) : [el('p', 'p-muted', 'No template matches.')]));
  }

  function panel(title, help) {
    const s = el('section', 'tp-panel');
    s.append(el('h3', '', title));
    if (help) s.append(el('p', 'tp-help', help));
    return s;
  }

  function edit(t) {
    const ed = $('editor');
    const name = field('Name', { value: t.name, max: 80 });
    const subject = field('Subject', { value: t.subject, max: 200, wide: true });
    const body = field('Message', { kind: 'area', value: t.body, max: 8000, wide: true });
    body.input.style.minHeight = '340px';
    const wa = field('Message', { kind: 'area', value: t.whatsapp, max: 3000, wide: true });
    wa.input.style.minHeight = '120px';
    [subject.input, body.input, wa.input].forEach((x) => x.addEventListener('focus', () => { lastBox = x; }));
    lastBox = body.input;

    const head = el('div', 'tp-ed-head');
    head.append(el('h2', '', t.name), el('span', 'tp-ed-kind', t.builtIn ? (t.edited ? 'Ready-made, edited' : 'Ready-made') : 'Your own'));

    // 1. Name and the stages it suits: pills to tick.
    const p1 = panel('Name and stages', 'The student card shows the templates that suit the student\'s stage first.');
    const g1 = el('div', 'p-form'); g1.append(name.wrap); p1.append(g1);
    const pills = el('div', 'tp-stages');
    const chosen = new Set(t.stages);
    data.stages.forEach((s) => {
      const b = el('button', 'tp-stage' + (chosen.has(s) ? ' on' : ''), s); b.type = 'button'; b.setAttribute('aria-pressed', String(chosen.has(s)));
      b.addEventListener('click', () => { if (chosen.has(s)) chosen.delete(s); else chosen.add(s); b.classList.toggle('on', chosen.has(s)); b.setAttribute('aria-pressed', String(chosen.has(s))); });
      pills.append(b);
    });
    p1.append(el('span', 'tp-label', 'Suits these stages'), pills);

    // 2. The email, with the words that can be filled in.
    const p2 = panel('Email', 'A blank line starts a new paragraph. A line that starts with "- " is a bullet, and "## " a small heading.');
    const g2 = el('div', 'p-form'); g2.append(subject.wrap, body.wrap); p2.append(g2);
    const chips = el('div', 'tp-chips');
    data.fields.forEach(([k, d]) => {
      const c = el('button', 'tp-chip', `{${k}}`); c.type = 'button'; c.title = d;
      c.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor where it is
      c.addEventListener('click', () => {
        const box = lastBox || body.input;
        const at = box.selectionStart ?? box.value.length; const end = box.selectionEnd ?? at;
        box.value = box.value.slice(0, at) + `{${k}}` + box.value.slice(end);
        box.focus(); box.selectionStart = box.selectionEnd = at + k.length + 2;
      });
      chips.append(c);
    });
    p2.append(el('span', 'tp-label', 'Words filled in from the student (click to add where you are typing)'), chips);

    // 3. WhatsApp
    const p3 = panel('WhatsApp', 'Keep it short: it opens on the counselor\'s phone or WhatsApp Web, ready to send.');
    const g3 = el('div', 'p-form'); g3.append(wa.wrap); p3.append(g3);

    const bar = el('div', 'tp-savebar');
    const msg = el('span', 'p-msg grow');
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
    save.addEventListener('click', async () => {
      try {
        await api('/api/templates/' + t.key, { name: name.input.value, subject: subject.input.value, body: body.input.value, whatsapp: wa.input.value, stages: data.stages.filter((s) => chosen.has(s)) });
        say('Template saved'); await load(t.key);
      } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error grow'; }
    });
    bar.append(save, msg);
    if (t.edited || !t.builtIn) {
      const remove = h('button', { class: 'btn', type: 'button' }, t.builtIn ? 'Put back the original text' : 'Delete');
      remove.addEventListener('click', async () => {
        if (!(await window.NiecUI.confirm(t.builtIn ? 'This template goes back to the text it came with.' : 'This template is deleted.', { danger: true, confirmText: t.builtIn ? 'Put back' : 'Delete' }))) return;
        try { await api(`/api/templates/${t.key}/delete`, {}); say(t.builtIn ? 'Original text put back' : 'Deleted'); openKey = t.builtIn ? t.key : ''; await load(openKey); } catch (e) { say(e.message, true); }
      });
      bar.append(remove);
    }
    if (t.builtIn) {
      const del = h('button', { class: 'btn btn-danger', type: 'button' }, 'Delete');
      del.addEventListener('click', async () => {
        if (!(await window.NiecUI.confirm(`Delete "${t.name}"? It disappears from the list and from the student card. You can bring the ready-made templates back later.`, { danger: true, confirmText: 'Delete' }))) return;
        try { await api(`/api/templates/${t.key}/hide`, {}); say('Deleted'); openKey = ''; await load(''); } catch (e) { say(e.message, true); }
      });
      bar.append(del);
    }
    ed.replaceChildren(head, p1, p2, p3, ...(data.canEdit ? [bar] : []));
    if (!data.canEdit) { ed.querySelectorAll('input, textarea, select, button').forEach((x) => { x.disabled = true; }); }
  }

  // The company (the owner, 14 Nov 2026): no typed email signature here any more (each person's email ends with the signature picture
  // they upload on Your email and signature). Only the consultancy's name, used across ISR and in the messages, and the office copy.
  function signature() {
    const s = data.signature;
    const fields = {};
    const make = (k, label, ph) => { fields[k] = field(label, { value: s[k], max: 200, placeholder: ph || '' }); return fields[k].wrap; };
    const co = panel('The company', 'Its name is used across ISR and in the messages ({company_name} and {company_short}).');
    const g2 = el('div', 'p-form p-form-2'); g2.append(make('company', 'Company name'), make('short', 'Short name')); co.append(g2);
    const copyBox = el('label', 'p-check');
    const c = el('input'); c.type = 'checkbox'; c.checked = s.copyToOffice !== false;
    copyBox.append(c, el('span', '', 'Send the office mailbox a copy of every email, so it is found there with the student\'s replies'));
    co.append(copyBox);
    const bar = el('div', 'tp-savebar');
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
    save.addEventListener('click', async () => { try { await api('/api/templates/signature', { ...Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, x.input.value])), copyToOffice: c.checked }); say('Saved'); } catch (e) { say(e.message, true); } });
    bar.append(save);
    $('sig').replaceChildren(co, ...(data.canEdit ? [bar] : []));
    if (!data.canEdit) $('sig').querySelectorAll('input').forEach((x) => { x.disabled = true; });
  }

  async function load(key) {
    data = await api('/api/templates');
    const note = $('mailNote');
    note.hidden = false;
    note.className = 'tp-note ' + (data.mail.ready ? 'ok' : 'warn');
    note.textContent = data.mail.ready ? `Your emails are sent from ${data.mail.from}. WhatsApp messages open in your own WhatsApp.`
      : data.mail.own ? 'To email students, set up your own email and signature first (Your email and signature, at the top right). WhatsApp messages open in your own WhatsApp.'
        : 'Email is not set up on this server yet: sending keeps a preview on the student card. WhatsApp messages open on your own phone or WhatsApp Web.';
    list();
    signature();
    const old = $('bringBack'); if (old) old.remove();
    if (data.hiddenCount && data.canEdit) {
      const back = h('button', { class: 'btn', type: 'button', id: 'bringBack' }, `Bring back ${data.hiddenCount} deleted`);
      back.addEventListener('click', async () => { try { await api('/api/templates/restore-hidden', {}); say('Brought back'); await load(''); } catch (e) { say(e.message, true); } });
      $('addTemplate').before(back);
    }
    $('addTemplate').hidden = !data.canEdit;
    const t = data.templates.find((x) => x.key === (key || openKey)) || data.templates[0];
    if (t) { openKey = t.key; list(); edit(t); } else $('editor').replaceChildren(el('p', 'p-muted', 'No template yet.'));
  }

  // The two tabs: Templates and Company.
  document.querySelectorAll('.tp-page [role="tab"]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tp-page [role="tab"]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('viewTemplates').hidden = b.dataset.view !== 'templates';
    $('viewSignature').hidden = b.dataset.view !== 'signature';
  }));
  $('tpSearch').addEventListener('input', () => data && list());
  $('addTemplate').addEventListener('click', () => dialog('New template', (body, close) => {
    const name = field('Name', { max: 80, placeholder: 'e.g. Scholarship deadline reminder' });
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

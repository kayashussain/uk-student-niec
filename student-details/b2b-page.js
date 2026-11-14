// B2B Partners and Agents (one page script for both, chosen by data-kind on the body). Admin edits them; the Manager (with the
// commission) and the Application and Mock Teams (without the commission and the portal login) look at them: the server sends
// each account only what partner-access.js allows, and `data.access` says which ('full', 'commission' or 'team').
//   B2B Partners: the businesses you send applications to (they hold the direct agreement with a university). Each card shows how to
//   submit (the portal and its login, or the email) so it can be used without opening the partner.
//   Agents: the businesses that send you their students.
// Each has its contacts, agreement dates, the commission structure of each intake (a link or a PDF) and the visas it has brought.
(function () {
  const { el, h, api, field, number } = window.Portal;
  const $ = (id) => document.getElementById(id);
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  const KIND = document.body.dataset.kind === 'agents' ? 'agents' : 'b2b';
  const WORD = KIND === 'agents' ? { one: 'agent', a: 'an agent', title: 'Agents' } : { one: 'partner', a: 'a partner', title: 'B2B Partners' };
  const API = '/api/' + KIND;
  const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
  let data = null;
  const viewer = () => data && data.access && data.access !== 'full';
  const open = (id) => (viewer() ? view(id) : edit(id));

  const stats = (name) => data.performance[String(name).toLowerCase()] || { students: 0, visas: 0, intakes: {} };
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const openLink = (text, href, cls = 'bp-link') => { const a = el('a', cls, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const btn = (cls, label, onClick) => { const b = el('button', cls, label); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; };
  const copy = (value, what) => btn('bp-mini', 'Copy', async () => { try { await navigator.clipboard.writeText(value); say(`${what} copied`); } catch (e) { say(`Could not copy the ${what.toLowerCase()}`, true); } });
  const PILL = { Active: 'green', Ended: 'red' };

  // ---- the list ----
  function draw() {
    const all = data.partners;
    const sheet = data.onSheet || []; // named in the University Partner column, not set up yet
    const active = all.filter((p) => p.status === 'Active');
    const visas = all.reduce((n, p) => n + stats(p.name).visas, 0) + sheet.reduce((n, x) => n + stats(x.name).visas, 0);
    const band = [[`Active ${WORD.one}s`, number(active.length + sheet.length), sheet.length ? `${number(sheet.length)} named on the sheet, not set up yet` : ''], ['Visas through them', number(visas), 'Every intake on the sheet']];
    if (KIND === 'b2b') band.splice(2, 0, ['Ready to submit', `${number(active.filter((p) => p.applyPortal || p.applyEmail).length)} of ${number(active.length + sheet.length)}`, 'With a portal or an email']);
    $('kpis').replaceChildren(...band.map(([label, v, sub, warn]) => { const d = el('div', warn ? 'warn' : ''); d.append(el('span', '', label), el('b', '', v), el('small', '', sub || '')); return d; }));
    const q = $('search').value.trim().toLowerCase();
    const hit = (name, city) => !q || `${name} ${city || ''}`.toLowerCase().includes(q);
    const shown = all.filter((p) => hit(p.name, p.city));
    const shownSheet = sheet.filter((x) => hit(x.name));
    const total = all.length + sheet.length;
    $('count').textContent = total ? (q ? `${shown.length + shownSheet.length} of ${total}` : `${total} in the list`) : '';
    const hidden = (data.notPartners || []);
    const hiddenLine = () => {
      if (!hidden.length) return [];
      const d = el('div', 'bp-hidden');
      d.append(el('span', '', KIND === 'agents' ? 'Not agents: ' : 'Not B2B partners: '));
      hidden.forEach((n, k) => { if (k) d.append(', '); d.append(el('b', '', n), ' ', btn('bp-undo', 'show again', async () => { await api(`${API}/not-partner`, { name: n, undo: true }); load(); })); });
      return [d];
    };
    if (!total) { $('list').replaceChildren(el('div', 'bp-empty', `No ${WORD.one}s yet. Add the first with "+ New ${WORD.one}".`), ...hiddenLine()); return; }
    if (!shown.length && !shownSheet.length) { $('list').replaceChildren(el('div', 'bp-empty', 'Nothing matches that search.')); return; }
    $('list').replaceChildren(...shown.map(card), ...shownSheet.map(sheetCard), ...hiddenLine());
  }

  // A partner named in the University Partner column but not set up yet: set it up (to add how to submit and the commission list),
  // or mark it as not a B2B partner (it is then hidden here and in the dropdown, and can be shown again).
  function sheetCard(x) {
    const st = stats(x.name);
    const c = el('article', 'bp-card bp-card-new');
    const head = el('div', 'bp-card-head');
    const who = el('div');
    who.append(el('div', 'bp-name', x.name), el('div', 'bp-sub', `${number(st.visas)} visa${st.visas === 1 ? '' : 's'} from ${number(x.students)} student${x.students === 1 ? '' : 's'} on the sheet`));
    head.append(who, el('span', 'bp-status amber', 'Not set up'));
    const note = el('div', 'bp-submit');
    note.append(el('div', 'bp-submit-title', 'Named on the sheet'), el('div', 'bp-none', KIND === 'agents' ? 'Named in the Receiving Partner column. Set it up to add the contact, the agreement and the commission list.' : 'Set it up to add how to submit applications, the contact and the commission list.'));
    const foot = el('div', 'bp-foot');
    const notWord = KIND === 'agents' ? 'Not an agent' : 'Not a partner';
    foot.append(btn('btn', notWord, async () => {
      if (!(await window.NiecUI.confirm(`${x.name} is not ${KIND === 'agents' ? 'an agent' : 'a B2B partner'}? It is hidden here and in the ${KIND === 'agents' ? 'Receiving' : 'University'} Partner dropdown (the students keep the name). You can show it again.`, { confirmText: notWord }))) return;
      await api(`${API}/not-partner`, { name: x.name }); say(`${x.name} hidden`); load();
    }), btn('btn btn-primary', 'Set up →', async () => { try { const made = await api(API, { name: x.name }); await load(); edit(made.id); } catch (e) { say(e.message, true); } }));
    c.append(head, note, foot);
    return c;
  }

  function card(p) {
    const st = stats(p.name);
    const c = el('article', 'bp-card');
    const head = el('div', 'bp-card-head');
    const who = el('div');
    who.append(btn('bp-name', p.name, () => open(p.id)), el('div', 'bp-sub', [p.city, `${number(st.visas)} visa${st.visas === 1 ? '' : 's'} from ${number(st.students)} student${st.students === 1 ? '' : 's'}`].filter(Boolean).join(' · ')));
    head.append(who, el('span', `bp-status ${PILL[p.status] || 'amber'}`, p.status));
    c.append(head);
    if (KIND === 'b2b') c.append(submitBox(p));
    const facts = el('dl', 'bp-facts');
    const row = (label, value) => { const dd = el('dd'); if (value instanceof Node) dd.append(value); else if (value) dd.textContent = value; else dd.append(el('span', 'bp-none', 'Not entered yet')); facts.append(el('dt', '', label), dd); };
    // The commission of the intake that is running: open it, or a calm note that it is missing.
    const cur = data.currentIntake;
    const found = (p.commissions || []).find((x) => same(x.intake, cur) && (x.fileId || x.link));
    if (data.access === 'team') { /* a team does not see the commission */ } else if (found) row(`Commission list, ${cur}`, found.fileId ? openLink('Open the PDF ↗', `${API}/${p.id}/files/${found.fileId}?open=1`) : openLink('Open the link ↗', found.link));
    else if (p.status === 'Ended') row('Commission', 'Ended');
    else if (viewer()) row(`Commission list, ${cur || 'this intake'}`, el('span', 'bp-none', 'Not uploaded yet'));
    else { const m = btn('bp-missing', 'Not uploaded yet', () => edit(p.id)); row(`Commission list, ${cur || 'this intake'}`, m); }
    const k = p.contact || {};
    if (k.name || k.phone || k.email) {
      const d = el('div', 'bp-lines');
      if (k.name) d.append(el('span', '', k.name + (p.contactCount > 1 ? `  (+${p.contactCount - 1} more)` : '')));
      if (k.phone) d.append(el('span', '', k.phone));
      if (k.email) { const a = el('a', 'bp-link', k.email); a.href = 'mailto:' + k.email; d.append(a); }
      row('Contact', d);
    } else row('Contact', null);
    row('Agreement', [p.agreementStart ? 'From ' + p.agreementStart : '', p.agreementEnd ? 'to ' + p.agreementEnd : ''].filter(Boolean).join(' '));
    c.append(facts);
    const foot = el('div', 'bp-foot'); foot.append(btn('btn', 'Open details →', () => open(p.id)));
    c.append(foot);
    return c;
  }

  // How to submit an application through the partner, ready to use from the list.
  function submitBox(p) {
    const box = el('div', 'bp-submit');
    box.append(el('div', 'bp-submit-title', 'Application submission'));
    const line = (label, value, ...buttons) => { const d = el('div', 'bp-submit-line'); d.append(el('span', 'bp-submit-label', label), value, ...buttons); return d; };
    if (p.applyPortal) {
      box.append(line('Portal', openLink('Open portal ↗', p.applyPortal, 'bp-portal'), copy(p.applyPortal, 'Link')));
      if (p.applyUser) box.append(line('Username', el('code', '', p.applyUser), copy(p.applyUser, 'Username')));
      if (p.applyPassword) {
        const dots = '•'.repeat(10);
        const shown = el('code', '', dots);
        const peek = btn('bp-mini', 'Show', () => { const open = shown.textContent === dots; shown.textContent = open ? p.applyPassword : dots; peek.textContent = open ? 'Hide' : 'Show'; });
        box.append(line('Password', shown, peek, copy(p.applyPassword, 'Password')));
      }
    } else if (p.applyEmail) {
      const w = el('a', 'bp-portal', 'Write email ↗'); w.href = 'mailto:' + p.applyEmail;
      box.append(line('Email', el('code', '', p.applyEmail), copy(p.applyEmail, 'Email'), w));
    } else box.append(el('div', 'bp-none', viewer() ? 'Not entered yet. Ask Admin to add the portal or the email.' : 'Not entered yet. Open the partner to add the portal or the email.'));
    return box;
  }

  // ---- one partner, in numbered steps ----
  function step(n, title, help) {
    const s = el('section', 'bp-step');
    const head = el('div', 'bp-step-head');
    const words = el('div'); words.append(el('h3', '', title)); if (help) words.append(el('p', '', help));
    head.append(el('span', 'bp-num', String(n)), words);
    s.append(head);
    return s;
  }
  function grid(cls, ...nodes) { const g = el('div', 'p-form ' + cls); nodes.forEach((n) => g.append(n)); return g; }
  function repeater(cols, items, addLabel) {
    const node = el('div');
    const box = el('div', 'bp-rows');
    const rows = [];
    const add = (item) => {
      const r = el('div', 'bp-row');
      const inputs = {};
      cols.forEach(([k, label, ph]) => { const f = field(label, { value: item[k], placeholder: ph, max: 500 }); inputs[k] = f.input; r.append(f.wrap); });
      r.append(btn('bp-remove', 'Remove', () => { r.remove(); rows.splice(rows.indexOf(inputs), 1); }));
      rows.push(inputs); box.append(r);
    };
    items.forEach(add);
    node.append(box, btn('btn btn-sm bp-add-row', '+ ' + addLabel, () => add({})));
    return { node, values: () => rows.map((i) => Object.fromEntries(Object.entries(i).map(([k, x]) => [k, x.value]))) };
  }
  function commissionEditor(id, p) {
    const node = el('div');
    const box = el('div', 'bp-rows');
    const rows = [];
    const intakes = data.intakes || [];
    const add = (item) => {
      const r = el('div', 'bp-row');
      const intake = field('Intake', { kind: 'select', choices: intakes, value: item.intake || data.currentIntake || '' });
      const link = field('Link (optional)', { value: item.link, placeholder: 'https://…', max: 500 });
      const st = { fileId: item.fileId || '' };
      const fileLine = el('div', 'p-field');
      const showFile = () => {
        const a = (p.agreements || []).find((x) => x.id === st.fileId);
        fileLine.replaceChildren(el('span', 'p-label', 'PDF'), a ? openLink(a.name, `${API}/${id}/files/${a.id}?open=1`) : el('span', 'p-muted', 'None uploaded'));
      };
      showFile();
      const pick = el('input'); pick.type = 'file'; pick.accept = '.pdf,.png,.jpg,.jpeg'; pick.setAttribute('aria-label', 'Upload the commission PDF');
      pick.addEventListener('change', async () => {
        const f = pick.files && pick.files[0]; if (!f) return;
        try {
          const res = await fetch(`${API}/${id}/files?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error || 'Could not upload it.');
          p.agreements = j.agreements; st.fileId = j.agreements[j.agreements.length - 1].id; showFile(); say('Uploaded. Save to keep it for this intake.');
        } catch (e) { say(e.message, true); }
      });
      const rec = { intake, link, st };
      r.append(intake.wrap, link.wrap, fileLine, pick, btn('bp-remove', 'Remove', () => { r.remove(); rows.splice(rows.indexOf(rec), 1); }));
      rows.push(rec); box.append(r);
    };
    (p.commissions || []).forEach(add);
    node.append(box, btn('btn btn-sm bp-add-row', '+ Add an intake', () => add({})));
    return { node, values: () => rows.map((x) => ({ intake: x.intake.input.value, link: x.link.input.value, fileId: x.st.fileId, note: '' })) };
  }

  // ---- one partner, read only (everyone but Admin) ----
  async function view(id) {
    const p = await api(`${API}/${id}`);
    const st = stats(p.name);
    const page = el('div');
    page.append(btn('bp-back', `← ${WORD.title}`, closeEditor));
    const head = el('div', 'bp-ed-head'); head.append(el('h2', '', p.name), el('span', `bp-status ${PILL[p.status] || 'amber'}`, p.status));
    page.append(head, el('p', 'bp-saved', [p.city, `${number(st.visas)} visa${st.visas === 1 ? '' : 's'} from ${number(st.students)} student${st.students === 1 ? '' : 's'}`].filter(Boolean).join(' · ')));
    const box = (title, ...nodes) => { const s = el('section', 'bp-step'); const hd = el('div', 'bp-step-head'); const w = el('div'); w.append(el('h3', '', title)); hd.append(w); s.append(hd, ...nodes); page.append(s); };
    const none = (t = 'Not entered yet') => el('span', 'bp-none', t);
    const lines = (items) => { const d = el('div', 'bp-lines'); items.forEach((x) => d.append(x instanceof Node ? x : el('span', '', x))); return d; };
    if (KIND === 'b2b') box('Application submission', submitBox(p));
    box('Contacts', (p.contacts || []).length ? lines(p.contacts.map((c) => { const d = el('div', 'bp-lines'); if (c.name) d.append(el('b', '', c.name)); if (c.phone) d.append(el('span', '', c.phone)); if (c.email) { const a = el('a', 'bp-link', c.email); a.href = 'mailto:' + c.email; d.append(a); } return d; })) : none());
    box('Agreement', lines([p.agreementStart ? 'From ' + p.agreementStart : 'Start not entered', p.agreementEnd ? 'To ' + p.agreementEnd : ''].filter(Boolean)));
    // The Manager also sees the commission list of each intake, the files and the notes; a team never receives them.
    if (data.access === 'commission') {
      box('Commission by intake', (p.commissions || []).length ? lines(p.commissions.map((c) => {
        const d = el('div', 'bp-lines'); d.append(el('b', '', c.intake || 'Intake'));
        const f = (p.agreements || []).find((a) => a.id === c.fileId);
        if (f) d.append(openLink('Open the PDF ↗', `${API}/${p.id}/files/${f.id}?open=1`));
        if (c.link) d.append(openLink('Open the link ↗', c.link));
        return d;
      })) : none());
      if ((p.agreements || []).length) box('Files', lines(p.agreements.map((a) => openLink(a.name, `${API}/${p.id}/files/${a.id}?open=1`))));
      if (p.notes) box('Notes', el('p', '', p.notes));
    }
    $('editor').replaceChildren(page);
    $('listView').hidden = true; $('editor').hidden = false;
    window.scrollTo({ top: 0 });
  }

  async function edit(id) {
    const p = await api(`${API}/${id}`);
    const st = stats(p.name);
    const ed = $('editor');
    const form = el('div');
    form.append(btn('bp-back', `← ${WORD.title}`, closeEditor));
    const head = el('div', 'bp-ed-head'); head.append(el('h2', '', p.name), el('span', `bp-status ${PILL[p.status] || 'amber'}`, p.status));
    form.append(head, el('p', 'bp-saved', `${number(st.visas)} visa${st.visas === 1 ? '' : 's'} from ${number(st.students)} student${st.students === 1 ? '' : 's'}.`));
    let n = 0;
    const name = field('Name', { value: p.name, max: 120 });
    const status = field('Status', { kind: 'select', choices: data.statuses, value: p.status });
    const blank = status.input.querySelector('option[value=""]'); if (blank) blank.remove();
    const city = field('City or country', { value: p.city, max: 300 });
    const start = field('Agreement starts', { value: p.agreementStart, placeholder: 'e.g. 1 Jan 2026', max: 40 });
    const end = field('Agreement ends (optional)', { value: p.agreementEnd, placeholder: 'e.g. 31 Dec 2027', max: 40 });
    const s1 = step(++n, `The ${WORD.one}`, 'Its name, where it is, and the agreement.');
    s1.append(grid('bp-three', name.wrap, status.wrap, city.wrap, start.wrap, end.wrap));
    const steps = [s1];

    let apply = null; let applyUser = null; let applyPassword = null;
    if (KIND === 'b2b') {
      const s2 = step(++n, 'Application submission', 'Paste the portal link or the email applications go to. For a portal, add the login details your team uses. The team sees them on the list and on the card of every student whose University Partner is this partner.');
      apply = field('Portal link or email', { value: p.applyPortal || p.applyEmail, max: 600, wide: true, placeholder: 'e.g. https://portal.partner.com  or  applications@partner.com' });
      const kind = el('span', 'bp-kind');
      apply.wrap.append(kind);
      applyUser = field('Username', { value: p.applyUser, max: 200, placeholder: 'The username or email used to log in' });
      applyPassword = field('Password', { value: p.applyPassword, max: 200, placeholder: 'The password' });
      applyPassword.input.type = 'password'; applyPassword.input.autocomplete = 'new-password';
      const peek = btn('btn btn-sm', 'Show', () => { const hid = applyPassword.input.type === 'password'; applyPassword.input.type = hid ? 'text' : 'password'; peek.textContent = hid ? 'Hide' : 'Show'; });
      const passRow = el('div', 'bp-pass'); applyPassword.input.replaceWith(passRow); passRow.append(applyPassword.input, peek);
      const login = el('div'); login.append(el('h4', 'bp-sub-head', 'Login details'), grid('bp-two', applyUser.wrap, applyPassword.wrap));
      const showKind = () => { const v = apply.input.value.trim(); const isEmail = EMAIL.test(v); kind.hidden = !v; kind.textContent = isEmail ? 'Email: applications are sent to this address' : 'Portal link: add the login details below'; login.hidden = !v || isEmail; };
      apply.input.addEventListener('input', showKind); showKind();
      s2.append(grid('bp-one', apply.wrap), login);
      steps.push(s2);
    }

    const s3 = step(++n, 'Contacts', 'The people you deal with. The first one shows on the list.');
    const contacts = repeater([['name', 'Name', 'e.g. Partner manager'], ['phone', 'Phone', 'e.g. 98XXXXXXXX'], ['email', 'Email', 'name@partner.com']], p.contacts, 'Add a contact');
    s3.append(contacts.node); steps.push(s3);

    const s4 = step(++n, 'Commission list by intake', 'The partner\'s own commission list for each intake (it covers its universities, each with its own rate). Choose the intake, then paste the link or upload the PDF.');
    const commissions = commissionEditor(id, p);
    s4.append(commissions.node); steps.push(s4);

    const s5 = step(++n, 'Agreement and other files', 'PDF, Word or an image, up to 10 MB. Files are saved as soon as they are uploaded.');
    const fl = el('div', 'bp-files');
    const drawFiles = (pp) => {
      fl.replaceChildren(...(pp.agreements.length ? pp.agreements.map((a) => {
        const r = el('div', 'bp-file');
        const link = el('a', 'bp-link', a.name); link.href = `${API}/${id}/files/${a.id}`; link.setAttribute('download', a.name);
        r.append(link, el('span', 'p-muted', `${Math.max(1, Math.round(a.size / 1024))} KB`), btn('bp-remove', 'Remove', async () => { if (await window.NiecUI.confirm(`Remove ${a.name}?`, { danger: true })) drawFiles(await api(`${API}/${id}/files/${a.id}/delete`, {})); }));
        return r;
      }) : [el('p', 'p-muted', 'No file uploaded yet.')]));
    };
    drawFiles(p);
    const pick = el('input'); pick.type = 'file'; pick.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
    const up = btn('btn btn-sm', 'Upload', async () => {
      const f = pick.files && pick.files[0];
      if (!f) { say('Choose the file first.', true); return; }
      up.disabled = true;
      try {
        const res = await fetch(`${API}/${id}/files?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Could not upload it.');
        pick.value = ''; drawFiles(j); say('Uploaded');
      } catch (e) { say(e.message, true); }
      up.disabled = false;
    });
    const upRow = el('div', 'p-bar'); upRow.append(pick, up);
    s5.append(fl, upRow); steps.push(s5);

    const byIntake = Object.entries(st.intakes || {});
    const s6 = step(++n, 'Visas by intake', '');
    if (!byIntake.length) s6.append(el('p', 'p-muted', 'No students yet.'));
    else {
      const t = el('div', 'bp-visas');
      byIntake.forEach(([intake, v]) => { const d = el('div'); d.append(el('span', '', intake), el('b', '', number(v.visas))); t.append(d); });
      const tot = el('div', 'total'); tot.append(el('span', '', 'Total'), el('b', '', number(st.visas))); t.append(tot);
      s6.append(t);
    }
    steps.push(s6);

    const notes = field('Notes', { kind: 'area', value: p.notes, max: 12000, wide: true });
    const s7 = step(++n, 'Notes', '');
    s7.append(grid('bp-one', notes.wrap)); steps.push(s7);
    form.append(...steps);

    const bar = el('div', 'bp-savebar');
    const save = btn('btn btn-primary', 'Save', async () => {
      try {
        const body = { name: name.input.value, status: status.input.value, city: city.input.value, agreementStart: start.input.value, agreementEnd: end.input.value, contacts: contacts.values(), commissions: commissions.values(), notes: notes.input.value };
        if (apply) Object.assign(body, { apply: apply.input.value, applyUser: applyUser.input.value, applyPassword: applyPassword.input.value });
        const saved = await api(`${API}/${id}`, body);
        if (apply && apply.input.value.trim() && !saved.applyPortal && !saved.applyEmail) say('Saved, but the application link could not be kept: it must be a web address or an email address.', true);
        else say('Saved');
        await load(); edit(id);
      } catch (e) { say(e.message, true); }
    });
    const del = btn('btn btn-danger', 'Remove from list', async () => { if (!(await window.NiecUI.confirm(`Remove ${p.name} from ${WORD.title}?`, { danger: true, confirmText: 'Remove' }))) return; await api(`${API}/${id}/delete`, {}); say('Removed'); closeEditor(); load(); });
    bar.append(save, btn('btn', 'Back to the list', closeEditor), el('span', 'grow'), del);
    form.append(bar);
    ed.replaceChildren(form);
    $('listView').hidden = true; ed.hidden = false;
    window.scrollTo({ top: 0 });
  }
  function closeEditor() { $('editor').hidden = true; $('editor').replaceChildren(); $('listView').hidden = false; window.scrollTo({ top: 0 }); }

  // ---- add one, or add the partners named in the sheet ----
  function addOne() {
    window.Portal.dialog(`New ${WORD.one}`, (body, close) => {
      const n = field('Name', { max: 120 });
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(btn('btn', 'Cancel', () => close()));
      const ok = btn('btn btn-primary', 'Add', async () => { try { close(await api(API, { name: n.input.value })); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; } });
      foot.append(ok);
      body.append(grid('p-form-2', n.wrap), msg, foot);
    }).then(async (made) => { if (made) { await load(); edit(made.id); } });
  }
  async function load() {
    data = await api(API);
    if (!viewer()) { const c = document.querySelector('#pageTitle .p-chip'); if (c) c.hidden = true; } // others look at it too now
    if (viewer()) {
      $('add').hidden = true;
      const chip = document.querySelector('#pageTitle .p-chip'); if (chip) chip.textContent = 'View only';
      $('intro').textContent = data.access === 'commission'
        ? `To look at: where applications go, the contacts, the agreement and the commission of each intake. Admin makes the changes.`
        : `To look at: ${KIND === 'b2b' ? 'where applications go through each partner, ' : ''}the contacts and the agreement. Admin makes the changes.`;
    }
    draw();
  }
  $('add').addEventListener('click', addOne);
  $('search').addEventListener('input', () => data && draw());
  load().catch((e) => { $('list').replaceChildren(h('div', { class: 'p-notice bad' }, e.message)); });
})();

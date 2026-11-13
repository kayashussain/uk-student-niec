// The Partner Universities page (direct.html, Admin only). The server refuses every other account;
// everything shown is put on the page as text, never as HTML.
// The list is a set of calm cards; a click opens the university as its own view, in numbered steps, with a Save bar
// that stays at the bottom of the screen.
(function () {
  const $ = (id) => document.getElementById(id);
  let uni = null; // the university open in the editor
  let all = []; // the list, for the search box
  // ?backup=ID: this is an earlier daily backup, read only (see backup-bar.js): looked at, never changed.
  const BACKUP = new URLSearchParams(location.search).get('backup') || '';
  const API = BACKUP ? '/api/restore/snapshot/' + encodeURIComponent(BACKUP) + '/partners' : '/api/direct';
  const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function say(id, text, error) { const m = $(id); if (!m) return; m.textContent = text || ''; m.className = 'msg' + (error ? ' error' : ''); }
  async function api(url, body) {
    const res = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Something went wrong.');
    return json;
  }
  const btn = (cls, label, onClick) => { const b = el('button', cls, label); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; };

  // ---- the list ----
  async function loadList() {
    try {
      all = await api(API);
      drawList();
    } catch (e) { say('listMsg', e.message, true); }
  }
  function drawList() {
    const q = $('search').value.trim().toLowerCase();
    const shown = q ? all.filter((u) => [u.name, ...(u.campuses || [])].join(' ').toLowerCase().includes(q)) : all;
    $('count').textContent = all.length ? (q ? `${shown.length} of ${all.length} partner universities` : `${all.length} partner universit${all.length === 1 ? 'y' : 'ies'}`) : '';
    if (!all.length) { $('list').replaceChildren(el('div', 'pu-empty', 'No partner universities yet. Add the first one above.')); return; }
    if (!shown.length) { $('list').replaceChildren(el('div', 'pu-empty', 'No partner university matches that search.')); return; }
    $('list').replaceChildren(...shown.map(card));
  }
  function card(u) {
    const c = el('article', 'pu-card');
    const head = el('div', 'pu-card-head');
    const who = el('div');
    who.append(btn('pu-name', u.name, () => openEditor(u.id)));
    // The campuses straight under the name.
    if ((u.campuses || []).length) { const t = el('div', 'pu-tags pu-campus-tags'); u.campuses.forEach((x) => t.append(el('span', 'pu-tag', x))); who.append(t); }
    head.append(who);
    // Application submission, ready to use without opening the university: the portal and its login, or the email.
    const sub = el('div', 'pu-submit');
    sub.append(el('div', 'pu-submit-title', 'Application submission'));
    const copy = (value, what) => btn('pu-mini', 'Copy', async () => { try { await navigator.clipboard.writeText(value); window.NiecUI.toast(`${what} copied`, { type: 'success' }); } catch (e) { window.NiecUI.toast(`Could not copy the ${what.toLowerCase()}`, { type: 'error' }); } });
    const line = (label, valueNode, ...buttons) => { const d = el('div', 'pu-submit-line'); d.append(el('span', 'pu-submit-label', label), valueNode, ...buttons); return d; };
    if (u.applyPortal) {
      const a = el('a', 'pu-portal', 'Open portal ↗'); a.href = u.applyPortal; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = u.applyPortal;
      sub.append(line('Portal', a, copy(u.applyPortal, 'Link')));
      if (u.applyUser) sub.append(line('Username', el('code', '', u.applyUser), copy(u.applyUser, 'Username')));
      if (u.applyPassword) {
        const dots = '•'.repeat(10);
        const shown = el('code', '', dots);
        const peek = btn('pu-mini', 'Show', () => { const open = shown.textContent === dots; shown.textContent = open ? u.applyPassword : dots; peek.textContent = open ? 'Hide' : 'Show'; });
        sub.append(line('Password', shown, peek, copy(u.applyPassword, 'Password')));
      }
    } else if (u.applyEmail) {
      const a = el('a', 'pu-portal', 'Write email ↗'); a.href = 'mailto:' + u.applyEmail;
      sub.append(line('Email', el('code', '', u.applyEmail), copy(u.applyEmail, 'Email'), a));
    } else {
      sub.append(el('div', 'pu-none', 'Not entered yet. Open the university to add the portal link or email.'));
    }
    const facts = el('dl', 'pu-facts');
    const row = (label, value) => { const dd = el('dd'); if (value instanceof Node) dd.append(value); else if (value) dd.textContent = value; else dd.append(el('span', 'pu-none', 'Not entered yet')); facts.append(el('dt', '', label), dd); };
    row('Commission', u.slabs && u.slabs.length ? (() => { const d = el('div', 'pu-lines'); u.slabs.forEach((x) => d.append(el('span', '', x))); return d; })() : null);
    const p = u.contact || {};
    if (p.name || p.phone || p.email) {
      const d = el('div', 'pu-lines');
      if (p.name) d.append(el('span', '', p.name + (u.contactCount > 1 ? `  (+${u.contactCount - 1} more)` : '')));
      if (p.phone) d.append(el('span', '', p.phone));
      if (p.email) { const a = el('a', 'pu-link', p.email); a.href = 'mailto:' + p.email; d.append(a); }
      row('Contact', d);
    } else row('Contact', null);
    row('Agreement', [u.agreementStart ? 'Since ' + u.agreementStart : '', u.agreementCount ? `${u.agreementCount} file${u.agreementCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '));
    const foot = el('div', 'pu-card-foot');
    foot.append(btn('btn', 'Open details →', () => openEditor(u.id)));
    c.append(head, sub, facts, foot);
    return c;
  }

  // ---- the editor ----
  function field(label, input, { wide = false, hint = '' } = {}) {
    const l = el('label', 'pu-field' + (wide ? ' wide' : ''));
    l.append(el('span', '', label), input);
    if (hint) l.append(el('small', 'pu-hint', hint));
    return l;
  }
  function text(value, max, placeholder) { const i = el('input'); i.value = value || ''; i.maxLength = max || 300; if (placeholder) i.placeholder = placeholder; return i; }
  function area(value, placeholder) { const t = el('textarea'); t.value = value || ''; t.maxLength = 12000; if (placeholder) t.placeholder = placeholder; return t; }
  function step(n, title, help) {
    const s = el('section', 'pu-step');
    const head = el('div', 'pu-step-head');
    const words = el('div'); words.append(el('h3', '', title)); if (help) words.append(el('p', '', help));
    head.append(el('span', 'pu-num', String(n)), words);
    s.append(head);
    return s;
  }

  // A repeatable set of rows (campuses, slabs, contacts): each row has labelled boxes and a Remove link.
  function repeater(cols, items, addLabel) {
    const node = el('div');
    const box = el('div', 'pu-rows');
    const rows = [];
    function add(item) {
      const row = el('div', 'pu-row');
      row.style.setProperty('--cols', String(cols.length));
      const inputs = {};
      cols.forEach(([key, label, ph]) => { inputs[key] = text(item[key], 300, ph); row.append(field(label, inputs[key])); });
      const entry = { inputs };
      row.append(btn('pu-remove', 'Remove', () => { row.remove(); rows.splice(rows.indexOf(entry), 1); }));
      rows.push(entry);
      box.append(row);
    }
    (items || []).forEach(add);
    const addBtn = btn('btn btn-sm pu-add-row', '+ ' + addLabel, () => add({}));
    node.append(box, addBtn);
    return { node, values: () => rows.map((r) => Object.fromEntries(Object.entries(r.inputs).map(([k, i]) => [k, i.value]))) };
  }

  function openEditor(id) {
    api(API + '/' + id).then((u) => { uni = u; buildEditor(); }).catch((e) => say('listMsg', e.message, true));
  }
  function closeEditor() {
    $('editor').hidden = true; $('editor').replaceChildren(); uni = null;
    $('listView').hidden = false;
    window.scrollTo({ top: 0 });
  }

  function buildEditor() {
    const ed = $('editor');
    const f = {};
    const form = el('form');
    form.autocomplete = 'off';
    form.append(btn('pu-back', '← All partner universities', closeEditor));
    const head = el('div', 'pu-ed-head');
    head.append(el('h2', '', uni.name));
    form.append(head, el('p', 'pu-saved', uni.updatedAt ? `Last saved ${new Date(uni.updatedAt).toLocaleString()}${uni.updatedBy ? ' by ' + uni.updatedBy : ''}.` : 'Not saved yet.'));

    // 1. The university: its name, its campuses and when the agreement started. (Status, how it is held, when it ends
    // and notes are no longer asked: a partner is always active. Anything stored in them is kept as it is.)
    const s1 = step(1, 'The university', 'Its name, its campuses and the day the agreement started.');
    f.name = text(uni.name, 120);
    f.agreementStart = text(uni.agreementStart, 40, 'e.g. 1 Sep 2025');
    const g1 = el('div', 'pu-fields two');
    g1.append(field('University name', f.name), field('Agreement started', f.agreementStart));
    const campusHead = el('h4', 'pu-sub-head', 'Campuses');
    const campuses = repeater([['name', 'Campus', 'e.g. London Campus'], ['city', 'City', 'e.g. London']], uni.campuses, 'Add a campus');
    s1.append(g1, campusHead, campuses.node);

    // 2. Application submission: one box, a link or an email; the login only for a link.
    const s2 = step(2, 'Application submission', 'Paste the portal link or the email address applications go to. For a portal, add the login details your team uses. The team sees them on the list and on every student\'s card for this university.');
    f.apply = text(uni.applyPortal || uni.applyEmail, 600, 'e.g. https://apply.university.ac.uk  or  admissions@university.ac.uk');
    f.apply.inputMode = 'url';
    const kind = el('span', 'pu-kind');
    f.applyUser = text(uni.applyUser, 200, 'The username or email used to log in');
    f.applyPassword = text(uni.applyPassword, 200, 'The password');
    f.applyPassword.type = 'password';
    f.applyPassword.autocomplete = 'new-password';
    const peek = btn('btn btn-sm', 'Show', () => { const hidden = f.applyPassword.type === 'password'; f.applyPassword.type = hidden ? 'text' : 'password'; peek.textContent = hidden ? 'Hide' : 'Show'; });
    const pass = el('div', 'pu-pass'); pass.append(f.applyPassword, peek);
    const login = el('div');
    const loginFields = el('div', 'pu-fields two');
    loginFields.append(field('Username', f.applyUser), field('Password', pass));
    login.append(el('h4', 'pu-sub-head', 'Login details'), loginFields);
    const g2 = el('div', 'pu-fields');
    const applyField = field('Portal link or email', f.apply, { wide: true });
    applyField.append(kind);
    g2.append(applyField);
    const showKind = () => {
      const v = f.apply.value.trim();
      const isEmail = EMAIL.test(v);
      kind.hidden = !v;
      kind.textContent = isEmail ? 'Email: applications are sent to this address' : 'Portal link: add the login details below';
      login.hidden = !v || isEmail;
    };
    f.apply.addEventListener('input', showKind); showKind();
    s2.append(g2, login);

    // 3. Contacts
    const s3 = step(3, 'Contacts', 'The people at the university you deal with. The first one shows on the list.');
    const contacts = repeater([['name', 'Name', 'e.g. Braj Jha (Regional Manager)'], ['phone', 'Phone', 'e.g. +44 7833 769210'], ['email', 'Email', 'name@university.ac.uk']], uni.contacts, 'Add a contact');
    s3.append(contacts.node);

    // 4. Commission and payment
    const s5 = step(4, 'Commission and payment', 'One row for each band, for example level UG, students "1 to 10", commission "15%". Then when and how it is paid.');
    const slabs = repeater([['level', 'Level', 'UG, PG or All'], ['students', 'Students enrolled', 'e.g. 1 to 10'], ['commission', 'Commission', 'e.g. 15% or £1,500']], uni.slabs, 'Add a commission band');
    f.paymentTerms = area(uni.paymentTerms, 'When and how commission is paid.');
    const pay = el('div', 'pu-fields'); pay.style.marginTop = '16px';
    pay.append(field('Payment terms', f.paymentTerms, { wide: true }));
    s5.append(slabs.node, pay);

    // 6. Agreement files: uploaded and removed at once (they are not part of Save).
    const s6 = step(5, 'Agreement files', 'The signed agreement. PDF, Word or an image, up to 10 MB. Files are saved as soon as they are uploaded.');
    const fileList = el('div', 'pu-files');
    const size = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    function drawFiles() {
      if (!uni.agreements.length) { fileList.replaceChildren(el('p', 'pu-hint', 'No agreement uploaded yet.')); return; }
      fileList.replaceChildren(...uni.agreements.map((a) => {
        const row = el('div', 'pu-file');
        const link = BACKUP ? el('span', '', a.name) : el('a', 'pu-link', a.name);
        if (!BACKUP) { link.href = `/api/direct/${uni.id}/files/${a.id}`; link.setAttribute('download', a.name); }
        const info = el('span', 'pu-hint', `${size(a.size)} · uploaded ${new Date(a.uploadedAt).toLocaleDateString()}${a.uploadedBy ? ' by ' + a.uploadedBy : ''}`);
        const rm = btn('pu-remove', 'Remove', async () => {
          if (!(await window.NiecUI.confirm(`Remove the agreement file ${a.name}?`, { danger: true }))) return;
          try { uni.agreements = (await api(`/api/direct/${uni.id}/files/${a.id}/delete`, {})).agreements; drawFiles(); loadList(); } catch (e) { say('editMsg', e.message, true); }
        });
        row.append(link, info, rm);
        return row;
      }));
    }
    drawFiles();
    const pick = el('input'); pick.type = 'file'; pick.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg'; pick.setAttribute('aria-label', 'Agreement file');
    const up = btn('btn btn-sm', 'Upload', async () => {
      const file = pick.files && pick.files[0];
      if (!file) { say('editMsg', 'Choose the agreement file first.', true); return; }
      if (file.size > 10 * 1024 * 1024) { say('editMsg', 'That file is too large (the limit is 10 MB).', true); return; }
      say('editMsg', 'Uploading...'); up.disabled = true;
      try {
        const res = await fetch(`/api/direct/${uni.id}/files?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not upload it.');
        uni.agreements = json.agreements; pick.value = ''; drawFiles(); loadList(); say('editMsg', ''); window.NiecUI.toast('Agreement uploaded', { type: 'success' });
      } catch (e) { say('editMsg', e.message, true); }
      up.disabled = false;
    });
    const picker = el('div', 'bar'); picker.append(pick, up);
    s6.append(fileList, picker);

    form.append(s1, s2, s3, s5, s6);

    const bar = el('div', 'pu-savebar');
    const save = el('button', 'btn btn-primary', 'Save'); save.type = 'submit';
    const close = btn('btn', 'Back to the list', closeEditor);
    const msg = el('div', 'msg grow'); msg.id = 'editMsg'; msg.setAttribute('role', 'status');
    const del = btn('btn btn-danger', 'Remove from list', async () => {
      if (!(await window.NiecUI.confirm(`Remove ${uni.name} from Partner Universities?`, { danger: true }))) return;
      try { await api(`/api/direct/${uni.id}/delete`, {}); window.NiecUI.toast('Removed', { type: 'success' }); closeEditor(); loadList(); } catch (e) { say('editMsg', e.message, true); }
    });
    bar.append(save, close, msg, del);
    form.append(bar);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value]));
      Object.assign(body, { campuses: campuses.values(), slabs: slabs.values(), contacts: contacts.values() });
      // What the page no longer asks is sent back as it was, so nothing stored is lost; a partner is always Active.
      Object.assign(body, { status: 'Active', type: uni.type || 'Direct', via: uni.via || '', agreementEnd: uni.agreementEnd || '', notes: uni.notes || '' });
      say('editMsg', 'Saving...');
      try {
        uni = await api('/api/direct/' + uni.id, body);
        // A link or email that is not a real address is not kept: say so instead of losing it quietly.
        if (body.apply.trim() && !uni.applyPortal && !uni.applyEmail) window.NiecUI.toast('Saved, but the application link could not be kept: it must be a web address (e.g. https://apply.university.ac.uk) or an email address. Please check it and save again.', { type: 'error' });
        else window.NiecUI.toast('Saved', { type: 'success' });
        buildEditor();
        loadList();
      } catch (err) { say('editMsg', err.message, true); }
    });

    if (BACKUP) { // look only: every box is locked and every button except the way back is gone
      form.querySelectorAll('input, textarea, select').forEach((i) => { i.disabled = true; });
      form.querySelectorAll('button').forEach((b) => { if (b !== close && !b.classList.contains('pu-back') && b !== peek) b.hidden = true; });
      picker.hidden = true;
    }
    ed.replaceChildren(form);
    $('listView').hidden = true;
    ed.hidden = false;
    if (BACKUP) say('editMsg', 'This is the data as it was in the backup. The agreement files themselves are not kept in backups.');
    window.scrollTo({ top: 0 });
  }

  if (BACKUP) $('addForm').hidden = true;
  $('search').addEventListener('input', drawList);
  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const made = await api('/api/direct', { name: $('addName').value });
      $('addName').value = '';
      say('addMsg', `${made.name} added. Fill in its details below.`);
      await loadList();
      openEditor(made.id);
    } catch (err) { say('addMsg', err.message, true); }
  });

  // Names from the Fact File, to pick from when adding.
  fetch('/api/facts', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then((list) => {
    $('factNames').replaceChildren(...list.map((u) => { const o = el('option'); o.value = u.name; return o; }));
  }).catch(() => {});
  loadList();
})();

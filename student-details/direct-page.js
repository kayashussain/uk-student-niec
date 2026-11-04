// The Partnered Universities page (direct.html, Admin only). The server refuses every other account;
// everything shown is put on the page as text, never as HTML.
(function () {
  const $ = (id) => document.getElementById(id);
  const STATUSES = ['Active', 'Pending', 'On hold', 'Ended'];
  const PILL = { Active: 'pill-ok', Pending: 'pill-wait', 'On hold': 'pill-wait', Ended: 'pill-off' };
  let uni = null; // the university open in the editor

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function say(id, text, error) { const m = $(id); m.textContent = text || ''; m.className = 'msg' + (error ? ' error' : ''); }
  async function api(url, body) {
    const res = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Something went wrong.');
    return json;
  }

  // ---- the list ----
  async function loadList() {
    try {
      const list = await api('/api/direct');
      $('count').textContent = list.length ? `(${list.length})` : '';
      const body = $('rows');
      if (!list.length) {
        body.replaceChildren(Object.assign(el('tr'), {}));
        const td = el('td', 'muted', 'No partnered universities yet. Add the first one above.');
        td.colSpan = 9;
        body.firstChild.append(td);
        return;
      }
      body.replaceChildren(...list.map((u) => {
        const tr = el('tr');
        const cell = (label, text) => { const td = el('td', '', text); td.dataset.label = label; return td; };
        const name = el('td'); name.dataset.label = 'University';
        const open = el('button', 'open-link', u.name);
        open.type = 'button';
        open.addEventListener('click', () => openEditor(u.id));
        name.append(open);
        const campuses = el('td'); campuses.dataset.label = 'Campuses';
        if (u.campuses.length) { const ul = el('ul', 'campus-list'); u.campuses.forEach((c) => ul.append(el('li', '', c))); campuses.append(ul); } else campuses.textContent = 'None yet';
        const commission = el('td'); commission.dataset.label = 'Commission';
        if (u.slabs.length) { const ul = el('ul', 'campus-list'); u.slabs.forEach((x) => ul.append(el('li', '', x))); commission.append(ul); } else commission.textContent = 'None yet';
        const status = el('td'); status.dataset.label = 'Status'; status.append(el('span', 'pill ' + (PILL[u.status] || 'pill-wait'), u.status));
        const end = cell('Agreement ends', u.agreementEnd || 'None yet');
        const c = u.contact || {};
        const person = cell('Contact person', (c.name || '') + (u.contactCount > 1 ? ` +${u.contactCount - 1} more` : '') || 'None yet');
        const phone = cell('Phone', c.phone || 'None yet');
        const email = cell('Email', c.email || 'None yet');
        const act = el('td');
        const btn = el('button', 'btn btn-sm', 'Open'); btn.type = 'button'; btn.addEventListener('click', () => openEditor(u.id));
        act.append(btn);
        tr.append(name, campuses, commission, status, end, person, phone, email, act);
        return tr;
      }));
    } catch (e) { say('listMsg', e.message, true); }
  }

  // ---- the editor ----
  function field(label, input, wide) { const l = el('label'); l.append(label, input); if (wide) l.classList.add('wide'); return l; }
  function text(value, max, placeholder) { const i = el('input'); i.value = value || ''; i.maxLength = max || 300; if (placeholder) i.placeholder = placeholder; return i; }
  function area(value, placeholder) { const t = el('textarea'); t.value = value || ''; t.maxLength = 12000; if (placeholder) t.placeholder = placeholder; return t; }

  // A repeatable set of rows (campuses, slabs, contacts): each row is a set of labelled inputs and a Remove button.
  function repeater(title, hint, cols, items, addLabel) {
    const sec = el('div', 'section');
    sec.append(el('h3', '', title));
    if (hint) sec.append(el('p', 'hint', hint));
    const box = el('div', 'rows');
    const rows = [];
    function add(item) {
      const row = el('div', 'row');
      const inputs = {};
      cols.forEach(([key, label, kind, ph]) => {
        inputs[key] = kind === 'area' ? area(item[key], ph) : text(item[key], 300, ph);
        if (kind === 'area') inputs[key].style.minHeight = '52px';
        row.append(field(label, inputs[key], kind === 'area'));
      });
      const rm = el('button', 'btn btn-danger btn-sm', 'Remove'); rm.type = 'button';
      rm.addEventListener('click', () => { row.remove(); rows.splice(rows.indexOf(entry), 1); });
      row.append(rm);
      const entry = { inputs };
      rows.push(entry);
      box.append(row);
    }
    (items || []).forEach(add);
    const addBtn = el('button', 'btn btn-sm', addLabel); addBtn.type = 'button'; addBtn.addEventListener('click', () => add({}));
    sec.append(box, addBtn);
    return { node: sec, values: () => rows.map((r) => Object.fromEntries(Object.entries(r.inputs).map(([k, i]) => [k, i.value]))) };
  }

  function openEditor(id) {
    api('/api/direct/' + id).then((u) => { uni = u; buildEditor(); }).catch((e) => say('listMsg', e.message, true));
  }

  function buildEditor() {
    const ed = $('editor');
    const f = {};
    const form = el('form');
    form.autocomplete = 'off';
    const head = el('div', 'card-head'); head.append(el('h2', '', uni.name));
    form.append(head);
    if (uni.updatedAt) form.append(el('p', 'hint', `Last saved ${new Date(uni.updatedAt).toLocaleString()}${uni.updatedBy ? ' by ' + uni.updatedBy : ''}.`));

    const basics = el('div', 'form');
    f.name = text(uni.name, 120);
    f.status = el('select'); STATUSES.forEach((s) => { const o = el('option', '', s); o.value = s; f.status.append(o); }); f.status.value = uni.status;
    f.agreementEnd = text(uni.agreementEnd, 40, 'e.g. 31 Aug 2027');
    basics.append(field('University name', f.name), field('Status', f.status), field('Agreement ends', f.agreementEnd));
    form.append(basics);

    const campuses = repeater('Campus locations', '', [['name', 'Campus', 'text', 'e.g. London Campus'], ['city', 'City', 'text']], uni.campuses, 'Add a campus');
    form.append(campuses.node);

    const slabs = repeater('Commission slabs', 'One row for each band, e.g. level UG, students "1 to 10", commission "15%".', [['level', 'Level', 'text', 'UG, PG, All'], ['students', 'Students enrolled', 'text', 'e.g. 1 to 10'], ['commission', 'Commission', 'text', 'e.g. 15% or £1,500']], uni.slabs, 'Add a slab');
    form.append(slabs.node);

    const pay = el('div', 'section');
    f.paymentTerms = area(uni.paymentTerms, 'When and how commission is paid.');
    pay.append(el('h3', '', 'Payment terms'), f.paymentTerms);
    form.append(pay);

    const contacts = repeater('Contact person', '', [['name', 'Name', 'text'], ['phone', 'Phone', 'text'], ['email', 'Email', 'text']], uni.contacts, 'Add a contact');
    form.append(contacts.node);

    const notes = el('div', 'section'); f.notes = area(uni.notes, 'Anything else to remember.');
    notes.append(el('h3', '', 'Notes'), f.notes);
    form.append(notes);

    const bar = el('div', 'bar');
    const save = el('button', 'btn btn-primary', 'Save'); save.type = 'submit';
    const close = el('button', 'btn', 'Close'); close.type = 'button';
    const del = el('button', 'btn btn-danger', 'Remove from list'); del.type = 'button';
    bar.append(save, close, del);
    form.append(bar);
    const msg = el('div', 'msg'); msg.id = 'editMsg'; msg.setAttribute('role', 'status');
    form.append(msg);

    close.addEventListener('click', () => { ed.hidden = true; uni = null; });
    del.addEventListener('click', async () => {
      if (!(await window.NiecUI.confirm(`Remove ${uni.name} from Partnered Universities?`, { danger: true }))) return;
      try { await api(`/api/direct/${uni.id}/delete`, {}); ed.hidden = true; uni = null; window.NiecUI.toast('Removed', { type: 'success' }); loadList(); } catch (e) { say('editMsg', e.message, true); }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value]));
      Object.assign(body, { campuses: campuses.values(), slabs: slabs.values(), contacts: contacts.values() });
      say('editMsg', 'Saving...');
      try {
        uni = await api('/api/direct/' + uni.id, body);
        window.NiecUI.toast('Saved', { type: 'success' });
        buildEditor();
        loadList();
      } catch (err) { say('editMsg', err.message, true); }
    });

    ed.replaceChildren(form);
    ed.hidden = false;
    ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const made = await api('/api/direct', { name: $('addName').value });
      $('addName').value = '';
      say('addMsg', `${made.name} added. Fill in its campuses and commission below.`);
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

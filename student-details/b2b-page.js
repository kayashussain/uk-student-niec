// B2B Partners and Agents (Admin only; one page script for both, chosen by data-kind on the body).
//   B2B Partners: the businesses you send applications to (they hold the direct agreement with a university).
//   Agents: the businesses that send you their students.
// Each has a contact person and number, the day the agreement ends, the commission structure of each intake (a link, and PDF files to
// upload) and the visas it has brought, intake by intake.
(function () {
  const { el, h, api, field, number } = window.Portal;
  const $ = (id) => document.getElementById(id);
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  const KIND = document.body.dataset.kind === 'agents' ? 'agents' : 'b2b';
  const WORD = KIND === 'agents' ? { one: 'agent', title: 'Agents' } : { one: 'partner', title: 'B2B Partners' };
  const API = '/api/' + KIND;
  let data = null;

  const stats = (name) => data.performance[String(name).toLowerCase()] || { students: 0, visas: 0, intakes: {} };

  function list() {
    const body = $('rows');
    const active = data.partners.filter((p) => p.status === 'Active').length;
    const total = data.partners.reduce((n, p) => n + stats(p.name).visas, 0);
    const tile = (label, v, sub) => { const t = el('div', 'p-kpi'); t.append(el('b', '', String(v)), el('span', '', label), el('small', '', sub || '')); return t; };
    $('kpis').replaceChildren(tile(`${WORD.title} (active)`, active), tile('Visas through them', total, 'every intake on the sheet'));
    $('count').textContent = data.partners.length ? `${data.partners.length} in the list` : '';
    if (!data.partners.length) { body.replaceChildren(h('tr', {}, h('td', { colspan: 6, class: 'p-empty' }, el('b', '', `No ${WORD.one} yet`), `Add the first ${WORD.one}.`))); return; }
    body.replaceChildren(...data.partners.map((p) => {
      const st = stats(p.name);
      const tr = el('tr');
      const name = el('td'); name.append(h('button', { class: 'p-link', type: 'button', onclick: () => edit(p.id) }, p.name), p.city ? el('div', 'p-muted p-small', p.city) : '');
      const pill = el('span', `p-pill p-pill-${p.status === 'Active' ? 'green' : p.status === 'Ended' ? 'red' : 'amber'}`, p.status);
      const st1 = el('td'); st1.append(pill);
      tr.append(name, st1, el('td', '', p.agreementEnd || 'None yet'), el('td', '', p.contact.name || 'None yet'), el('td', '', p.contact.phone || ''), el('td', 'num', number(st.visas)));
      return tr;
    }));
  }

  // A list of small forms the person can add to and remove from. Returns { node, values() }.
  function repeater(title, cols, items, addLabel) {
    const sec = el('div');
    sec.append(el('h3', '', title));
    const box = el('div');
    const rowsList = [];
    const add = (item) => {
      const r = el('div', 'p-form p-form-2');
      r.style.marginBottom = '8px';
      const inputs = {};
      cols.forEach(([k, label, ph]) => { const f = field(label, { value: item[k], placeholder: ph, max: 500 }); inputs[k] = f.input; r.append(f.wrap); });
      r.append(h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => { r.remove(); rowsList.splice(rowsList.indexOf(inputs), 1); } }, 'Remove'));
      rowsList.push(inputs);
      box.append(r);
    };
    items.forEach(add);
    sec.append(box, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => add({}) }, addLabel));
    return { node: sec, values: () => rowsList.map((i) => Object.fromEntries(Object.entries(i).map(([k, x]) => [k, x.value]))) };
  }

  async function edit(id) {
    const p = await api(`${API}/${id}`);
    const ed = $('editor');
    const st = stats(p.name);
    const name = field('Name', { value: p.name, max: 120 });
    const status = field('Status', { kind: 'select', choices: data.statuses, value: p.status });
    status.input.querySelector('option[value=""]').remove();
    const city = field('City or country', { value: p.city, max: 300 });
    const start = field('Agreement starts', { value: p.agreementStart, placeholder: '1 Jan 2026', max: 40 });
    const end = field('Agreement ends', { value: p.agreementEnd, placeholder: '31 Dec 2026', max: 40 });
    const form = el('div', 'p-form');
    form.append(name.wrap, status.wrap, city.wrap, start.wrap, end.wrap);
    const contacts = repeater('Contacts', [['name', 'Contact person'], ['phone', 'Contact number'], ['email', 'Email']], p.contacts, 'Add a contact');
    const commissions = repeater('Commission structure by intake (a link to where it is written)', [['intake', 'Intake', 'Jan Intake 2027'], ['link', 'Link', 'https://…'], ['note', 'Note']], p.commissions || [], 'Add an intake');
    const notes = field('Notes', { kind: 'area', value: p.notes, max: 12000, wide: true });

    const visas = el('div');
    visas.append(el('h3', '', 'Visas by intake'));
    const byIntake = Object.entries(st.intakes || {});
    if (!byIntake.length) visas.append(el('p', 'p-muted p-small', 'No students yet.'));
    else {
      const t = el('table', 'p-table');
      t.append(h('thead', {}, h('tr', {}, ...['Intake', 'Visas'].map((x, i) => el('th', i ? 'num' : '', x)))));
      const tb = el('tbody');
      byIntake.forEach(([intake, v]) => tb.append(h('tr', {}, el('td', '', intake), el('td', 'num', number(v.visas)))));
      tb.append(h('tr', {}, el('td', '', el('b', '', 'Total')), el('td', 'num', el('b', '', number(st.visas)))));
      t.append(tb); visas.append(t);
    }

    // PDF (or Word, or picture) of a commission structure or of the agreement
    const files = el('div');
    files.append(el('h3', '', 'Commission structure and agreement files (PDF)'));
    const fl = el('div');
    const draw = (pp) => {
      fl.replaceChildren(...(pp.agreements.length ? pp.agreements.map((a) => {
        const r = el('div', 'p-sent');
        const link = el('a', 'p-link', a.name); link.href = `${API}/${id}/files/${a.id}`; link.setAttribute('download', a.name);
        r.append(link, el('span', 'p-muted p-small', `${Math.max(1, Math.round(a.size / 1024))} KB`), h('button', { class: 'p-link', type: 'button', onclick: async () => { if (await window.NiecUI.confirm(`Remove ${a.name}?`, { danger: true })) draw(await api(`${API}/${id}/files/${a.id}/delete`, {})); } }, 'Remove'));
        return r;
      }) : [el('p', 'p-muted p-small', 'No file uploaded yet. Name the file after the intake, for example "Jan 2027 commission.pdf", so it is easy to find.')]));
    };
    draw(p);
    const pick = el('input'); pick.type = 'file'; pick.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
    const up = h('button', { class: 'btn btn-sm', type: 'button' }, 'Upload');
    up.addEventListener('click', async () => {
      const f = pick.files && pick.files[0];
      if (!f) { say('Choose the file first.', true); return; }
      up.disabled = true;
      try {
        const res = await fetch(`${API}/${id}/files?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Could not upload it.');
        pick.value = ''; draw(j); say('Uploaded');
      } catch (e) { say(e.message, true); }
      up.disabled = false;
    });
    files.append(fl, el('div', 'p-bar'));
    files.lastChild.append(pick, up, el('span', 'p-muted p-small', 'PDF, Word or image, up to 10 MB.'));

    const bar = el('div', 'p-bar');
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
    save.addEventListener('click', async () => {
      try {
        await api(`${API}/${id}`, { name: name.input.value, status: status.input.value, city: city.input.value, agreementStart: start.input.value, agreementEnd: end.input.value, contacts: contacts.values(), commissions: commissions.values(), notes: notes.input.value });
        say('Saved'); await load(); edit(id);
      } catch (e) { say(e.message, true); }
    });
    const close = h('button', { class: 'btn', type: 'button', onclick: () => { ed.hidden = true; } }, 'Close');
    const del = h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (!(await window.NiecUI.confirm(`Remove ${p.name} from ${WORD.title}?`, { danger: true, confirmText: 'Remove' }))) return; await api(`${API}/${id}/delete`, {}); ed.hidden = true; say('Removed'); load(); } }, 'Remove from list');
    bar.append(save, close, del);
    ed.replaceChildren(el('h2', '', p.name), el('div', 'p-notice', `Visas so far: ${number(st.visas)} from ${number(st.students)} students.`), form, contacts.node, commissions.node, files, visas, notes.wrap, bar);
    ed.hidden = false;
    ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function load() { data = await api(API); list(); }
  $('add').addEventListener('click', async () => {
    const made = await new Promise((resolve) => window.Portal.dialog(`Add ${WORD.one === 'agent' ? 'an agent' : 'a partner'}`, (body, close) => {
      const n = field('Name', { max: 120 });
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add');
      ok.addEventListener('click', async () => { try { close(await api(API, { name: n.input.value })); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; } });
      foot.append(ok);
      body.append(el('div', 'p-form p-form-2'), msg, foot);
      body.firstChild.append(n.wrap);
    }).then(resolve));
    if (made) { await load(); edit(made.id); }
  });
  load().catch((e) => { $('rows').replaceChildren(h('tr', {}, h('td', { colspan: 6, class: 'p-notice bad' }, e.message))); });
})();

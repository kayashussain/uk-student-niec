// B2B Partners (Admin only): the B2B partners, their terms, contacts, agreements and what each has brought.
(function () {
  const { el, h, api, field, number, percent } = window.Portal;
  const $ = (id) => document.getElementById(id);
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  let data = null;
  let open = null;

  function stats(name) { return data.performance[String(name).toLowerCase()] || { students: 0, applied: 0, paid: 0, visas: 0 }; }
  function list() {
    const body = $('rows');
    const active = data.partners.filter((p) => p.status === 'Active').length;
    const total = data.partners.reduce((n, p) => n + stats(p.name).visas, 0);
    const tile = (label, v, sub1) => { const t = el('div', 'p-kpi'); t.append(el('b', '', String(v)), el('span', '', label), el('small', '', sub1 || '')); return t; };
    $('kpis').replaceChildren(tile('B2B partners', active, 'active'), tile('Visas through partners', total, 'every intake on the sheet'));
    $('count').textContent = data.partners.length ? `${data.partners.length} partners` : '';
    if (!data.partners.length) { body.replaceChildren(h('tr', {}, h('td', { colspan: 7, class: 'p-empty' }, el('b', '', 'No partners yet'), 'Add the first B2B partner.'))); return; }
    body.replaceChildren(...data.partners.map((p) => {
      const st = stats(p.name);
      const tr = el('tr');
      const name = el('td'); name.append(h('button', { class: 'p-link', type: 'button', onclick: () => edit(p.id) }, p.name), p.city ? el('div', 'p-muted p-small', p.city) : '');
      const pill = el('span', `p-pill p-pill-${p.status === 'Active' ? 'green' : p.status === 'Ended' ? 'red' : 'amber'}`, p.status);
      const st1 = el('td'); st1.append(pill);
      const contact = el('td', '', [p.contact.name, p.contact.phone].filter(Boolean).join(', ') || 'None yet');
      const terms = el('td'); if (p.commissionRate) terms.append(el('div', 'p-small', 'Commission: ' + p.commissionRate)); (p.terms.length ? p.terms : ['None yet']).forEach((t) => terms.append(el('div', 'p-small', t)));
      tr.append(name, st1, el('td', '', p.agreementEnd || 'None yet'), contact, terms, el('td', 'num', number(st.students)), el('td', 'num', number(st.visas)));
      return tr;
    }));
  }

  function repeater(title, cols, items, addLabel) {
    const sec = el('div');
    sec.append(el('h3', '', title));
    const box = el('div');
    const rowsList = [];
    const add = (item) => {
      const r = el('div', 'p-form p-form-2');
      r.style.marginBottom = '8px';
      const inputs = {};
      cols.forEach(([k, label, ph]) => { const f = field(label, { value: item[k], placeholder: ph, max: 300 }); inputs[k] = f.input; r.append(f.wrap); });
      const rm = h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => { r.remove(); rowsList.splice(rowsList.indexOf(inputs), 1); } }, 'Remove');
      r.append(rm);
      rowsList.push(inputs);
      box.append(r);
    };
    items.forEach(add);
    sec.append(box, h('button', { class: 'btn btn-sm', type: 'button', onclick: () => add({}) }, addLabel));
    return { node: sec, values: () => rowsList.map((i) => Object.fromEntries(Object.entries(i).map(([k, x]) => [k, x.value]))) };
  }

  async function edit(id) {
    const p = await api('/api/b2b/' + id);
    open = id;
    const ed = $('editor');
    const st = stats(p.name);
    const name = field('Name', { value: p.name, max: 120 });
    const status = field('Status', { kind: 'select', choices: data.statuses, value: p.status });
    status.input.querySelector('option[value=""]').remove();
    const city = field('City or country', { value: p.city, max: 300 });
    const start = field('Agreement starts', { value: p.agreementStart, placeholder: '1 Jan 2026', max: 40 });
    const end = field('Agreement ends', { value: p.agreementEnd, placeholder: '31 Dec 2026', max: 40 });
    const rate = field('Commission rate', { value: p.commissionRate, placeholder: '15% of the first year fee, or Rs 40,000 per visa', max: 120, wide: true });
    const form = el('div', 'p-form');
    form.append(name.wrap, status.wrap, city.wrap, start.wrap, end.wrap, rate.wrap);
    const terms = repeater('What is agreed (who gets what)', [['item', 'For', 'Postgraduate student with a visa'], ['terms', 'Terms', 'Rs 40,000 after enrolment']], p.terms, 'Add a term');
    const contacts = repeater('Contact people', [['name', 'Name'], ['phone', 'Phone'], ['email', 'Email']], p.contacts, 'Add a contact');
    const pay = field('Payment terms', { kind: 'area', value: p.paymentTerms, max: 12000, wide: true });
    const notes = field('Notes', { kind: 'area', value: p.notes, max: 12000, wide: true });
    const perf = el('div', 'p-notice', `Brought so far: ${number(st.students)} students, ${number(st.applied)} applied, ${number(st.paid)} paid, ${number(st.visas)} with a visa${st.students ? ` (${percent(Math.round((st.visas / st.students) * 1000) / 10)} of students).` : '.'}`);
    const byIntake = Object.entries(st.intakes || {});
    const intakes = el('div');
    intakes.append(el('h3', '', 'By intake'));
    if (!byIntake.length) intakes.append(el('p', 'p-muted p-small', 'No students yet.'));
    else {
      const t = el('table', 'p-table');
      t.append(h('thead', {}, h('tr', {}, ...['Intake', 'Students', 'Applied', 'Visas'].map((x) => el('th', '', x)))));
      const tb = el('tbody');
      byIntake.forEach(([name2, v]) => tb.append(h('tr', {}, el('td', '', name2), el('td', 'num', number(v.students)), el('td', 'num', number(v.applied)), el('td', 'num', number(v.visas)))));
      t.append(tb); intakes.append(t);
    }
    // agreement files
    const files = el('div');
    files.append(el('h3', '', 'Agreement files'));
    const fl = el('div');
    const draw = (pp) => {
      fl.replaceChildren(...(pp.agreements.length ? pp.agreements.map((a) => {
        const r = el('div', 'p-sent');
        const link = el('a', 'p-link', a.name); link.href = `/api/b2b/${id}/files/${a.id}`; link.setAttribute('download', a.name);
        r.append(link, el('span', 'p-muted p-small', `${Math.max(1, Math.round(a.size / 1024))} KB`), h('button', { class: 'p-link', type: 'button', onclick: async () => { if (await window.NiecUI.confirm(`Remove ${a.name}?`, { danger: true })) { draw(await api(`/api/b2b/${id}/files/${a.id}/delete`, {})); } } }, 'Remove'));
        return r;
      }) : [el('p', 'p-muted p-small', 'No agreement uploaded yet.')]));
    };
    draw(p);
    const pick = el('input'); pick.type = 'file'; pick.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
    const up = h('button', { class: 'btn btn-sm', type: 'button' }, 'Upload agreement');
    up.addEventListener('click', async () => {
      const f = pick.files && pick.files[0];
      if (!f) { say('Choose the file first.', true); return; }
      up.disabled = true;
      try {
        const res = await fetch(`/api/b2b/${id}/files?name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Could not upload it.');
        pick.value = ''; draw(j); say('Agreement uploaded');
      } catch (e) { say(e.message, true); }
      up.disabled = false;
    });
    files.append(fl, el('div', 'p-bar'));
    files.lastChild.append(pick, up, el('span', 'p-muted p-small', 'PDF, Word or image, up to 10 MB.'));
    const bar = el('div', 'p-bar');
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
    save.addEventListener('click', async () => {
      try {
        await api('/api/b2b/' + id, { name: name.input.value, status: status.input.value, city: city.input.value, agreementStart: start.input.value, agreementEnd: end.input.value, commissionRate: rate.input.value, terms: terms.values(), contacts: contacts.values(), paymentTerms: pay.input.value, notes: notes.input.value });
        say('Saved'); await load(); edit(id);
      } catch (e) { say(e.message, true); }
    });
    const close = h('button', { class: 'btn', type: 'button', onclick: () => { ed.hidden = true; open = null; } }, 'Close');
    const del = h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (!(await window.NiecUI.confirm(`Remove ${p.name} from B2B Partners?`, { danger: true, confirmText: 'Remove' }))) return; await api(`/api/b2b/${id}/delete`, {}); ed.hidden = true; say('Removed'); load(); } }, 'Remove from list');
    bar.append(save, close, del);
    ed.replaceChildren(el('h2', '', p.name), perf, intakes, form, terms.node, pay.wrap, files, contacts.node, notes.wrap, bar);
    ed.hidden = false;
    ed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function load() { data = await api('/api/b2b'); list(); }
  $('add').addEventListener('click', async () => {
    const name = await new Promise((resolve) => window.Portal.dialog('Add a partner', (body, close) => {
      const n = field('Name', { max: 120, placeholder: 'Himal Education Hub' });
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add');
      ok.addEventListener('click', async () => { try { close(await api('/api/b2b', { name: n.input.value })); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; } });
      foot.append(ok);
      body.append(el('div', 'p-form p-form-2'), msg, foot);
      body.firstChild.append(n.wrap);
    }).then(resolve));
    if (name) { await load(); edit(name.id); }
  });
  load().catch((e) => { $('rows').replaceChildren(h('tr', {}, h('td', { colspan: 7, class: 'p-notice bad' }, e.message))); });
})();

// Events and marketing: what was run to find students, when, for how long, at what cost, and how many students it brought.
// Admin adds and changes them; the Manager reads. Each one is a tag that can be chosen as the student source on a student.
(function () {
  const { el, h, api, field, number, dialog, day } = window.Portal;
  const $ = (id) => document.getElementById(id);
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  const rupees = (n) => (n || n === 0 ? 'Rs ' + Number(n).toLocaleString('en-IN') : '');
  let data = null;

  const ran = (a) => (a.endDate && a.endDate !== a.date ? `${day(a.date)} to ${day(a.endDate)}` : day(a.date));

  function list() {
    const total = data.activities.reduce((s, a) => ({ cost: s.cost + (a.cost || 0), leads: s.leads + a.leads, visas: s.visas + a.visas }), { cost: 0, leads: 0, visas: 0 });
    const tile = (label, v, sub) => { const t = el('div', 'p-kpi'); t.append(el('b', '', String(v)), el('span', '', label), el('small', '', sub || '')); return t; };
    $('kpis').replaceChildren(tile('Events and marketing', data.activities.length), tile('Spent in all', rupees(total.cost)), tile('Students brought', number(total.leads), `${number(total.visas)} with a visa`), tile('Cost per student', total.leads ? rupees(Math.round(total.cost / total.leads)) : 'none yet'));
    $('count').textContent = data.activities.length ? `${data.activities.length} in the list` : '';
    $('add').hidden = !data.canEdit;
    if (!data.activities.length) { $('rows').replaceChildren(h('tr', {}, h('td', { colspan: 9, class: 'p-empty' }, el('b', '', 'Nothing yet'), 'Add the first event or marketing. It then appears as a tag when you add a student.'))); return; }
    $('rows').replaceChildren(...data.activities.map((a) => {
      const tr = el('tr');
      const name = el('td'); name.append(h('button', { class: 'p-link', type: 'button', onclick: () => detail(a) }, a.name), el('div', 'p-muted p-small', [a.kind === 'Marketing' ? 'Marketing' : 'Event', a.type, a.place].filter(Boolean).join(' · ')));
      tr.append(name, el('td', '', ran(a)), el('td', 'num', number(a.days)), el('td', 'num', rupees(a.cost)), (() => { const t = el('td', 'num'); t.append(el('b', '', number(a.leads))); return t; })(), el('td', 'num', number(a.applied)), el('td', 'num', number(a.visas)), el('td', 'num', a.costPerLead ? rupees(a.costPerLead) : ''));
      const act = el('td');
      if (data.canEdit) act.append(h('button', { class: 'p-link', type: 'button', onclick: () => form(a) }, 'Edit'));
      tr.append(act);
      return tr;
    }));
  }

  function detail(a) {
    const box = $('detail');
    box.replaceChildren(el('h2', '', a.name), el('p', 'p-muted', `${a.kind === 'Marketing' ? 'Marketing' : 'Event'}${a.type ? ', ' + a.type : ''}. Ran ${ran(a)} (${a.days} day${a.days === 1 ? '' : 's'}). Cost ${rupees(a.cost) || 'not recorded'}.${a.note ? ' ' + a.note : ''}`));
    box.append(el('h3', '', `Students tagged with it (${a.leads})`));
    if (!a.students.length) box.append(el('p', 'p-muted p-small', 'None yet. Choose it as the Student source when you add a student.'));
    a.students.forEach((s) => { const r = el('div', 'p-sent'); r.append(h('a', { class: 'p-link', href: '/student?id=' + encodeURIComponent(s.id) }, s.name), el('span', 'p-muted p-small', `${s.stage} · ${s.intake}`)); box.append(r); });
    if (a.leads > a.students.length) box.append(el('p', 'p-muted p-small', `The first ${a.students.length} are shown.`));
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function form(a) {
    dialog(a ? 'Change it' : 'Add an event or marketing', (body, close) => {
      const f = {
        name: field('Name (this is the tag)', { value: a && a.name, max: 120, wide: true, placeholder: 'UK Education Fair, Kathmandu' }),
        type: field('What it is', { kind: 'select', choices: data.types, value: a && a.type }),
        date: field('Starts', { kind: 'date', value: a && a.date }),
        endDate: field('Ends (leave empty for one day)', { kind: 'date', value: a && a.endDate }),
        place: field('Place or channel', { value: a && a.place, max: 120 }),
        cost: field('Total cost (Rs)', { value: a && a.cost ? String(a.cost) : '', max: 12 }),
        note: field('Note', { kind: 'area', value: a && a.note, max: 600, wide: true }),
      };
      const grid = el('div', 'p-form p-form-2');
      Object.values(f).forEach((x) => grid.append(x.wrap));
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
      if (a) foot.append(h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await window.NiecUI.confirm('Remove it? Students tagged with it keep the tag text.', { danger: true, confirmText: 'Remove' })) { await api(`/api/planning/events/${a.id}/delete`, {}); close(true); } } }, 'Remove'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      ok.addEventListener('click', async () => {
        if (ok.disabled) return;
        ok.disabled = true;
        try {
          await api('/api/planning/events', { ...(a ? { id: a.id } : {}), ...Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.input.value])) });
          close(true);
        } catch (e) { ok.disabled = false; msg.textContent = e.message; msg.className = 'p-msg error'; }
      });
      foot.append(ok);
      body.append(grid, msg, foot);
    }).then((changed) => { if (changed) { say('Saved'); load(); } });
  }

  async function load() { data = await api('/api/activities'); list(); }
  $('add').addEventListener('click', () => form(null));
  load().catch((e) => { $('rows').replaceChildren(h('tr', {}, h('td', { colspan: 9, class: 'p-notice bad' }, e.message))); });
})();

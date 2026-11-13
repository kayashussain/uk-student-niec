// Events and marketing: what was run to find students, where it ran, when, for how long, at what cost, and how many students
// it brought. Admin adds and changes them; the Manager reads. Each one is a tag that can be chosen as the student source on a
// student; a social media campaign is also offered under "Social Media", so its students are counted in its cost per student.
(function () {
  const { el, h, api, field, number, dialog, day } = window.Portal;
  const $ = (id) => document.getElementById(id);
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  const rupees = (n) => (n || n === 0 ? 'Rs ' + Number(n).toLocaleString('en-IN') : '');
  let data = null;
  let show = 'all';

  const ran = (a) => (a.endDate && a.endDate !== a.date ? `${day(a.date)} to ${day(a.endDate)}` : day(a.date));

  function draw() {
    const acts = data.activities;
    const total = acts.reduce((s, a) => ({ cost: s.cost + (a.cost || 0), leads: s.leads + a.leads, visas: s.visas + a.visas }), { cost: 0, leads: 0, visas: 0 });
    const tile = (label, v, sub, main) => { const t = el('div', 'ev-kpi' + (main ? ' main' : '')); t.append(el('span', '', label), el('b', '', String(v)), el('small', '', sub || '')); return t; };
    $('kpis').replaceChildren(
      tile('Events and marketing', number(acts.length), `${acts.filter((a) => a.kind === 'Marketing').length} marketing, ${acts.filter((a) => a.kind !== 'Marketing').length} events`),
      tile('Spent in all', rupees(total.cost) || 'Rs 0'),
      tile('Students brought', number(total.leads), `${number(total.visas)} with a visa`),
      tile('Cost per student', total.leads && total.cost ? rupees(Math.round(total.cost / total.leads)) : 'None yet', total.visas && total.cost ? `${rupees(Math.round(total.cost / total.visas))} per visa` : '', true));
    // Students from social media with no campaign picked are in no cost per student: say so, with how to fix it.
    $('note').replaceChildren();
    if (data.unlinkedSocial > 0) {
      const n = el('div', 'ev-note');
      n.append((() => { const t = el('div'); t.append(el('b', '', `${number(data.unlinkedSocial)} student${data.unlinkedSocial === 1 ? '' : 's'} came from social media without a campaign picked.`), ' They are not counted in any cost per student. When a student came from a campaign, choose Social Media and then the campaign (campaigns are listed first).'); return t; })());
      $('note').append(n);
    }
    $('add').hidden = !data.canEdit;
    const shown = show === 'all' ? acts : acts.filter((a) => (show === 'Marketing' ? a.kind === 'Marketing' : a.kind !== 'Marketing'));
    $('count').textContent = acts.length ? `${shown.length} shown` : '';
    if (!acts.length) { $('list').replaceChildren(el('div', 'ev-empty', 'Nothing yet. Add the first event or marketing: it then appears as a tag when you add a student.')); return; }
    if (!shown.length) { $('list').replaceChildren(el('div', 'ev-empty', 'None of this kind yet.')); return; }
    $('list').replaceChildren(...shown.map(card));
  }

  function card(a) {
    const c = el('article', 'ev-card');
    const top = el('div');
    top.append(el('h2', 'ev-name', a.name));
    const meta = el('div', 'ev-meta');
    meta.append(el('span', 'ev-tag' + (a.kind === 'Marketing' ? ' mk' : ''), a.channel || 'Other'), el('span', '', `${ran(a)} · ${a.days} day${a.days === 1 ? '' : 's'}`));
    top.append(meta);
    if (a.place) top.append(el('div', 'ev-place', a.place));
    const figs = el('div', 'ev-figs');
    const fig = (label, v, cls) => { const d = el('div', cls || ''); d.append(el('span', '', label), el('b', '', v)); figs.append(d); };
    fig('Cost', a.cost ? rupees(a.cost) : '-', 'money');
    fig('Cost per student', a.costPerLead ? rupees(a.costPerLead) : '-', 'money cpl');
    fig('Cost per visa', a.costPerVisa ? rupees(a.costPerVisa) : '-', 'money cpl');
    fig('Students', number(a.leads), 'count');
    fig('Applied', number(a.applied), 'count');
    fig('Visas', number(a.visas), 'count');
    const foot = el('div', 'ev-foot');
    foot.append(h('button', { class: 'btn', type: 'button', onclick: () => students(a) }, `Students (${number(a.leads)})`));
    if (data.canEdit) foot.append(h('button', { class: 'btn', type: 'button', onclick: () => form(a) }, 'Edit'));
    c.append(top);
    if (a.note) c.append(el('p', 'ev-place', a.note));
    c.append(figs, foot);
    return c;
  }

  function students(a) {
    dialog(`Students from ${a.name}`, (body, close) => {
      if (!a.students.length) body.append(el('p', 'p-muted', a.channel === 'Social media' ? 'None yet. When you add a student who came from this campaign, choose Social Media and then this campaign.' : 'None yet. Choose it as the Student source when you add a student.'));
      const list = el('div', 'ev-students');
      a.students.forEach((s) => { const r = el('div', 'ev-student'); r.append(h('a', { class: 'p-link', href: '/student?id=' + encodeURIComponent(s.id) }, s.name), el('span', 'p-muted p-small', `${s.stage} · ${s.intake}`)); list.append(r); });
      body.append(list);
      if (a.leads > a.students.length) body.append(el('p', 'p-muted p-small', `The first ${a.students.length} are shown.`));
      const foot = el('div', 'p-dialog-foot'); foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close')); body.append(foot);
    });
  }

  function form(a) {
    dialog(a ? 'Change it' : 'Add an event or marketing', (body, close) => {
      const f = {
        name: field('Name of the event or marketing', { value: a && a.name, max: 120, wide: true, placeholder: 'e.g. UK Education Fair, Kathmandu  or  Facebook campaign January' }),
        place: field('Place or page (optional)', { value: a && a.place, max: 120, placeholder: 'e.g. Hotel Annapurna, or the Facebook page name' }),
        cost: field('Total cost (Rs)', { value: a && a.cost ? String(a.cost) : '', max: 12, placeholder: 'e.g. 25000' }),
        date: field('Starts', { kind: 'date', value: a && a.date }),
        endDate: field('Ends (leave empty for one day)', { kind: 'date', value: a && a.endDate }),
        note: field('Note (optional)', { kind: 'area', value: a && a.note, max: 600, wide: true }),
      };
      // Where it ran: one choice from a few pills.
      let channel = (a && a.channel) || '';
      const choices = el('div', 'ev-choices');
      const pills = data.channels.map((c) => {
        const b = h('button', { type: 'button', class: c === channel ? 'on' : '' }, c);
        b.setAttribute('aria-pressed', String(c === channel));
        b.addEventListener('click', () => { channel = c; pills.forEach((p) => { p.classList.toggle('on', p === b); p.setAttribute('aria-pressed', String(p === b)); }); });
        return b;
      });
      choices.append(...pills);
      const where = el('div', 'p-field ev-where'); where.append(el('span', 'ev-choice-label', 'Where it ran'), choices);
      const grid = el('div', 'p-form p-form-2');
      grid.append(f.name.wrap, where, f.place.wrap, f.cost.wrap, f.date.wrap, f.endDate.wrap, f.note.wrap);
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
      if (a) foot.append(h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await window.NiecUI.confirm('Remove it? Students tagged with it keep the tag text.', { danger: true, confirmText: 'Remove' })) { await api(`/api/planning/events/${a.id}/delete`, {}); close(true); } } }, 'Remove'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      ok.addEventListener('click', async () => {
        if (ok.disabled) return;
        if (!channel) { msg.textContent = 'Please choose where it ran.'; msg.className = 'p-msg error'; return; }
        ok.disabled = true;
        try {
          // The older "type" of an entry is sent back as it was, so nothing stored is lost.
          await api('/api/planning/events', { ...(a ? { id: a.id, type: a.type } : {}), channel, ...Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.input.value])) });
          close(true);
        } catch (e) { ok.disabled = false; msg.textContent = e.message; msg.className = 'p-msg error'; }
      });
      foot.append(ok);
      body.append(grid, msg, foot);
    }).then((changed) => { if (changed) { say('Saved'); load(); } });
  }

  async function load() { data = await api('/api/activities'); draw(); }
  $('add').addEventListener('click', () => form(null));
  document.querySelectorAll('#filter button').forEach((b) => b.addEventListener('click', () => {
    show = b.dataset.f;
    document.querySelectorAll('#filter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (data) draw();
  }));
  load().catch((e) => { $('list').replaceChildren(h('div', { class: 'p-notice bad' }, e.message)); });
})();

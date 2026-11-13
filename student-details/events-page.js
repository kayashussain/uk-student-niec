// Events and marketing: what was run to find students, where it ran, when, at what cost, and the students and visas it brought.
// Admin adds and changes them; the Manager reads. The list Admin uploads for an event (Excel or CSV) is the truth of who came from
// it: new students go into All Students at Inquiry tagged with it, students already on the sheet are found (phone or email) and
// tagged, and every line is shown for review before anything is saved. An event opens as its own view with its students, so the
// team can work through them (open the card, call, write the note).
(function () {
  const { el, h, api, field, number, dialog, day } = window.Portal;
  const $ = (id) => document.getElementById(id);
  const say = (t, e) => window.NiecUI.toast(t, { type: e ? 'error' : 'success' });
  const rupees = (n) => (n || n === 0 ? 'Rs ' + Number(n).toLocaleString('en-IN') : '');
  let data = null;
  let show = 'all';
  let open = null; // the event open in its own view

  const ran = (a) => (a.endDate && a.endDate !== a.date ? `${day(a.date)} to ${day(a.endDate)}` : day(a.date));
  const per = (cost, n) => (cost > 0 && n > 0 ? rupees(Math.round(cost / n)) : '-');
  const tag = (a) => el('span', 'ev-tag' + (a.kind === 'Marketing' ? ' mk' : ''), a.channel || 'Other');
  function band(items) {
    const b = el('div', 'ev-band');
    items.forEach(([label, value, sub, gold]) => { const d = el('div', gold ? 'gold' : ''); d.append(el('span', '', label), el('b', '', value), el('small', '', sub || '')); b.append(d); });
    return b;
  }

  // ---- the list ----
  function draw() {
    const acts = data.activities;
    const t = acts.reduce((s, a) => ({ cost: s.cost + (a.cost || 0), leads: s.leads + a.leads, visas: s.visas + a.visas }), { cost: 0, leads: 0, visas: 0 });
    $('band').replaceWith(Object.assign(band([
      ['Spent in all', rupees(t.cost) || 'Rs 0', `${acts.length} event${acts.length === 1 ? '' : 's'} and campaigns`],
      ['Students brought', number(t.leads)],
      ['Visas', number(t.visas)],
      ['Cost per student', per(t.cost, t.leads), '', true],
      ['Cost per visa', per(t.cost, t.visas), '', true],
    ]), { id: 'band' }));
    $('note').replaceChildren();
    if (data.unlinkedSocial > 0) $('note').append(el('div', 'ev-note', `${number(data.unlinkedSocial)} student${data.unlinkedSocial === 1 ? '' : 's'} from social media ${data.unlinkedSocial === 1 ? 'is' : 'are'} not on any campaign's list, so ${data.unlinkedSocial === 1 ? 'it is' : 'they are'} in no cost per student. Upload each campaign's list of students (open the campaign): anyone on it who is already on the sheet is found and tagged.`));
    $('add').hidden = !data.canEdit;
    const shown = show === 'all' ? acts : acts.filter((a) => (show === 'Marketing' ? a.kind === 'Marketing' : a.kind !== 'Marketing'));
    $('count').textContent = acts.length ? `${shown.length} shown` : '';
    const list = $('list');
    if (!acts.length) { list.replaceChildren(el('div', 'ev-empty', 'Nothing yet. Add the first event or campaign, then open it to upload its students.')); return; }
    if (!shown.length) { list.replaceChildren(el('div', 'ev-empty', 'None of this kind yet.')); return; }
    const head = el('div', 'ev-lrow head');
    ['Event or campaign', 'Cost', 'Students', 'Visas', 'Per student', 'Per visa', ''].forEach((x, i) => head.append(el('div', i && i < 6 ? 'num' : '', x)));
    list.replaceChildren(head, ...shown.map((a) => {
      const r = el('div', 'ev-lrow item');
      r.tabIndex = 0; r.setAttribute('role', 'button'); r.setAttribute('aria-label', `Open ${a.name}`);
      const who = el('div');
      const meta = el('div', 'ev-lmeta'); meta.append(tag(a), el('span', '', `${ran(a)} · ${a.days} day${a.days === 1 ? '' : 's'}`));
      who.append(el('div', 'ev-lname', a.name), meta);
      const num = (label, v, gold) => { const d = el('div', 'num' + (gold ? ' gold' : ''), v); d.dataset.label = label; return d; };
      r.append(who, num('Cost', a.cost ? rupees(a.cost) : '-'), num('Students', number(a.leads)), num('Visas', number(a.visas)), num('Per student', per(a.cost, a.leads), true), num('Per visa', per(a.cost, a.visas), true), el('div', 'ev-go', '→'));
      const go = () => openEvent(a.id);
      r.addEventListener('click', go);
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      return r;
    }));
  }

  // ---- one event: its figures, the upload of its students, and its students ----
  function openEvent(id) {
    const a = data.activities.find((x) => x.id === id);
    if (!a) return;
    open = a;
    $('listView').hidden = true;
    const v = $('eventView'); v.hidden = false;
    const back = h('button', { class: 'ev-back', type: 'button', onclick: closeEvent }, '← All events and campaigns');
    const head = el('div', 'ev-head');
    const left = el('div');
    const meta = el('div', 'ev-lmeta'); meta.append(tag(a), el('span', '', `${ran(a)} · ${a.days} day${a.days === 1 ? '' : 's'}`)); if (a.place) meta.append(el('span', '', a.place));
    left.append(el('h2', '', a.name), meta);
    if (a.note) left.append(el('p', 'p-muted', a.note));
    head.append(left);
    if (data.canEdit) head.append(h('button', { class: 'btn', type: 'button', onclick: () => form(a) }, 'Edit'));
    const figs = band([
      ['Cost', a.cost ? rupees(a.cost) : 'Not entered'],
      ['Students', number(a.leads), `${number(a.applied)} applied`],
      ['Visas', number(a.visas)],
      ['Cost per student', per(a.cost, a.leads), '', true],
      ['Cost per visa', per(a.cost, a.visas), '', true],
    ]);
    figs.style.marginTop = '20px';
    const upload = data.canEdit ? uploadPanel(a) : null;
    const people = el('section', 'ev-panel');
    people.append(el('h3', '', 'Its students'), el('p', '', 'Everyone tagged with it, in every intake. Click a name to open the student card: call, write the note, move the stage.'));
    const listBox = el('div'); listBox.append(el('div', 'ev-empty', 'Loading...'));
    people.append(listBox);
    v.replaceChildren(back, head, figs, ...(upload ? [upload] : []), people);
    loadPeople(a, listBox);
  }
  function closeEvent() { open = null; $('eventView').hidden = true; $('eventView').replaceChildren(); $('listView').hidden = false; window.scrollTo({ top: 0 }); }

  async function loadPeople(a, box) {
    let list;
    try { list = (await api(`/api/activities/${a.id}/students`)).students; } catch (e) { box.replaceChildren(el('div', 'p-notice bad', e.message)); return; }
    if (!list.length) { box.replaceChildren(el('div', 'ev-empty', data.canEdit ? 'No students yet. Upload its list above.' : 'No students yet.')); return; }
    const search = h('input', { class: 'ev-search', type: 'search', placeholder: 'Search a name or phone', 'aria-label': 'Search its students' });
    const rows = el('div', 'ev-people');
    const drawPeople = () => {
      const q = search.value.trim().toLowerCase();
      const shown = q ? list.filter((s) => `${s.name} ${s.phone} ${s.email}`.toLowerCase().includes(q)) : list;
      const hd = el('div', 'ev-person head'); ['Student', 'Phone', 'Stage', 'Intake', 'Latest note'].forEach((x) => hd.append(el('div', '', x)));
      rows.replaceChildren(hd, ...shown.map((s) => {
        const r = el('div', 'ev-person');
        const who = h('button', { class: 'who', type: 'button', onclick: () => window.CardDrawer.open(s.id, { onClose: () => refresh() }) }, s.name);
        const last = el('div', 'last');
        if (s.lastNote) last.append(el('b', '', `${new Date(s.lastNote.at).toLocaleDateString()}${s.lastNote.by ? ', ' + s.lastNote.by : ''}: `), s.lastNote.text); else last.textContent = 'No note yet';
        const stage = el('div'); stage.append(window.Portal.stagePill(s.stage));
        r.append(who, el('div', '', s.phone || '-'), stage, el('div', '', s.intake), last);
        return r;
      }));
    };
    search.addEventListener('input', drawPeople);
    drawPeople();
    const top = el('div', 'ev-actions'); top.style.margin = '0 0 12px'; top.append(search, el('span', 'p-muted', `${list.length} student${list.length === 1 ? '' : 's'}`));
    box.replaceChildren(top, rows);
  }

  function uploadPanel(a) {
    const p = el('section', 'ev-panel');
    p.append(el('h3', '', 'Students from this event'), el('p', '', 'Upload the list of everyone who came from it: an Excel (.xlsx) or CSV file with a name and a phone number or email on each line (a first row of headings like Name, Phone, Email is understood). You see what will happen to every line before anything is saved. Uploading the same list again changes nothing.'));
    const intake = h('select', {});
    (data.intakes || []).forEach((s) => intake.append(h('option', { value: s.id }, s.name)));
    const file = h('input', { type: 'file', accept: '.xlsx,.csv' });
    const row = el('div', 'ev-upload');
    const l1 = el('label'); l1.append('New students go into the intake', intake);
    const l2 = el('label'); l2.append('The list (Excel or CSV)', file);
    row.append(l1, l2);
    const out = el('div');
    p.append(row, out);
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      out.replaceChildren(el('p', 'p-muted', 'Reading the file...'));
      let lines;
      try { lines = await window.StudentFile.readFile(f, 1000); } catch (e) { out.replaceChildren(el('div', 'p-notice bad', 'Could not read the file: ' + e.message)); return; }
      if (!lines.length) { out.replaceChildren(el('div', 'p-notice bad', 'No students were found in that file.')); return; }
      const rows = lines.map((r) => ({ first: r.first, last: r.last, email: r.email, phone: r.phone }));
      let pre;
      try { pre = await api(`/api/activities/${a.id}/students`, { rows, sheetId: intake.value, preview: true }); } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); return; }
      out.replaceChildren(review(pre, async () => {
        const done = await api(`/api/activities/${a.id}/students`, { rows, sheetId: intake.value });
        say(`${done.added} added at Inquiry, ${done.linked} tagged`);
        file.value = '';
        await refresh();
        if (done.failed.length) window.NiecUI.toast('Not done: ' + done.failed.join(' | '), { type: 'error' });
      }, () => { out.replaceChildren(); file.value = ''; }));
    });
    return p;
  }

  const WHAT = { new: 'New', link: 'On the sheet', already: 'Already tagged', other: 'Other event', problem: 'Skipped' };
  function review(pre, onOk, onCancel) {
    const box = el('div');
    const c = pre.counts;
    const counts = el('div', 'ev-counts');
    [['new', `${c.new} new: added at Inquiry`], ['link', `${c.link} already on the sheet: tagged with it`], ['already', `${c.already} already tagged`], ['other', `${c.other} in another event: left as they are`], ['problem', `${c.problem} skipped`]]
      .forEach(([k, t]) => counts.append(el('span', `ev-count ${k}`, t)));
    const list = el('div', 'ev-review');
    const order = ['problem', 'other', 'link', 'new', 'already'];
    [...pre.rows].sort((x, y) => order.indexOf(x.action) - order.indexOf(y.action)).forEach((r) => {
      const line = el('div', 'ev-rline');
      line.append(el('span', `what ${r.action}`, WHAT[r.action]), el('b', '', r.name || '(no name)'), el('span', '', r.phone || r.email || '-'), el('span', 'why', r.note));
      list.append(line);
    });
    const doing = c.new + c.link;
    const ok = h('button', { class: 'btn btn-primary', type: 'button' }, doing ? `Add ${c.new} and tag ${c.link}` : 'Nothing to add');
    ok.disabled = !doing;
    ok.addEventListener('click', async () => { ok.disabled = true; try { await onOk(); } catch (e) { say(e.message, true); ok.disabled = false; } });
    const actions = el('div', 'ev-actions'); actions.append(ok, h('button', { class: 'btn', type: 'button', onclick: onCancel }, 'Cancel'), el('span', 'p-muted', 'Nothing is saved until you press the button.'));
    box.append(counts, list, actions);
    return box;
  }

  // ---- add or change one ----
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
      if (a) foot.append(h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await window.NiecUI.confirm('Remove it? Students tagged with it keep the tag text.', { danger: true, confirmText: 'Remove' })) { await api(`/api/planning/events/${a.id}/delete`, {}); close('removed'); } } }, 'Remove'));
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
    }).then(async (changed) => {
      if (!changed) return;
      say(changed === 'removed' ? 'Removed' : 'Saved');
      if (changed === 'removed') closeEvent();
      await refresh();
    });
  }

  async function refresh() {
    data = await api('/api/activities');
    draw();
    if (open) { const still = data.activities.find((x) => x.id === open.id); if (still) openEvent(still.id); else closeEvent(); }
  }
  $('add').addEventListener('click', () => form(null));
  document.querySelectorAll('#filter button').forEach((b) => b.addEventListener('click', () => {
    show = b.dataset.f;
    document.querySelectorAll('#filter button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    if (data) draw();
  }));
  refresh().catch((e) => { $('list').replaceChildren(h('div', { class: 'p-notice bad' }, e.message)); });
})();

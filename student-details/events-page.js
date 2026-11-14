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

  // "5 Nov to 20 Nov 2026" when both days are in the same year, so the dates stay short.
  const ran = (a) => {
    if (!a.endDate || a.endDate === a.date) return day(a.date);
    const from = day(a.date);
    return a.date.slice(0, 4) === a.endDate.slice(0, 4) ? `${from.replace(/\s\d{4}$/, '')} to ${day(a.endDate)}` : `${from} to ${day(a.endDate)}`;
  };
  // A moment as its day here, written like every other date ("13 Sep 2026").
  const localDay = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : day(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); };
  // A cost paid in dollars or pounds, as typed and at what rate it was turned into rupees: "$500 at Rs 135.20 a dollar".
  const SIGN = { USD: '$', GBP: '\u00a3' };
  const UNIT = { USD: 'dollar', GBP: 'pound' };
  const paidIn = (a) => (a.costCurrency && a.costCurrency !== 'NPR' && a.costAmount ? `${SIGN[a.costCurrency]}${Number(a.costAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })} at Rs ${Number(a.costRate).toFixed(2)} a ${UNIT[a.costCurrency]}` : '');
  const per = (cost, n) => (cost > 0 && n > 0 ? rupees(Math.round(cost / n)) : 'None yet');
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
      ['Total investment', rupees(t.cost) || 'Rs 0', `Across ${acts.length} event${acts.length === 1 ? '' : 's'} and campaigns, in rupees${acts.some((a) => a.costCurrency && a.costCurrency !== 'NPR') ? ' (dollars and pounds at the day\u2019s rate)' : ''}`],
      ['Enquiries', number(t.leads)],
      ['Visas', number(t.visas)],
      ['Cost per enquiry', per(t.cost, t.leads), '', true],
      ['Cost per visa', per(t.cost, t.visas), '', true],
    ]), { id: 'band' }));
    $('note').replaceChildren();
    if (data.unlinkedSocial > 0) $('note').append(el('div', 'ev-note', `${number(data.unlinkedSocial)} social media ${data.unlinkedSocial === 1 ? 'enquiry is' : 'enquiries are'} not yet linked to a campaign. Open the campaign and upload its list to link them.`));
    $('add').hidden = !data.canEdit;
    const shown = show === 'all' ? acts : acts.filter((a) => (show === 'Marketing' ? a.kind === 'Marketing' : a.kind !== 'Marketing'));
    $('count').textContent = acts.length ? `${shown.length} shown` : '';
    const list = $('list');
    if (!acts.length) { list.replaceChildren(el('div', 'ev-empty', 'No events or campaigns yet.')); return; }
    if (!shown.length) { list.replaceChildren(el('div', 'ev-empty', 'Nothing here yet.')); return; }
    const head = el('div', 'ev-lrow head');
    ['Event or campaign', 'Investment', 'Enquiries', 'Visas', 'Per enquiry', 'Per visa', ''].forEach((x, i) => head.append(el('div', i && i < 6 ? 'num' : '', x)));
    list.replaceChildren(head, ...shown.map((a) => {
      const r = el('div', 'ev-lrow item');
      r.style.setProperty('--i', String(Math.min(shown.indexOf(a), 12)));
      r.tabIndex = 0; r.setAttribute('role', 'button'); r.setAttribute('aria-label', `Open ${a.name}`);
      const who = el('div');
      const meta = el('div', 'ev-lmeta'); meta.append(tag(a), el('span', '', `${ran(a)} · ${a.days} day${a.days === 1 ? '' : 's'}`));
      who.append(el('div', 'ev-lname', a.name), meta);
      const num = (label, v, gold) => { const d = el('div', 'num' + (gold ? ' gold' : ''), v); d.dataset.label = label; return d; };
      r.append(who, num('Investment', a.cost ? rupees(a.cost) : '-'), num('Enquiries', number(a.leads)), num('Visas', number(a.visas)), num('Per enquiry', per(a.cost, a.leads), a.cost > 0 && a.leads > 0), num('Per visa', per(a.cost, a.visas), a.cost > 0 && a.visas > 0), el('div', 'ev-go', '→'));
      const go = () => window.NiecUI.swap(() => { openEvent(a.id); window.scrollTo({ top: 0 }); });
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
    const back = h('button', { class: 'ev-back', type: 'button', onclick: () => window.NiecUI.swap(closeEvent) }, '← Events and campaigns');
    const head = el('div', 'ev-head');
    const left = el('div');
    const meta = el('div', 'ev-lmeta'); meta.append(tag(a), el('span', '', [ran(a), `${a.days} day${a.days === 1 ? '' : 's'}`, a.place].filter(Boolean).join(' \u00b7 ')));
    left.append(el('h2', '', a.name), meta);
    if (a.note) left.append(el('p', 'p-muted', a.note));
    head.append(left);
    if (data.canEdit) head.append(h('button', { class: 'btn', type: 'button', onclick: () => form(a) }, 'Edit'));
    const figs = band([
      ['Investment', a.cost ? rupees(a.cost) : 'Not entered', paidIn(a) || (data.canEdit && !a.cost ? 'Add it with Edit' : '')],
      ['Enquiries', number(a.leads), `${number(a.applied)} applied`],
      ['Visas', number(a.visas)],
      ['Cost per enquiry', per(a.cost, a.leads), '', true],
      ['Cost per visa', per(a.cost, a.visas), '', true],
    ]);
    figs.style.marginTop = '20px';
    const upload = data.canEdit ? uploadPanel(a) : null;
    const people = el('section', 'ev-panel');
    people.append(el('h3', '', 'Enquiries'), el('p', '', 'Everyone from this event, in every intake. Open a name to call, add a note or move the stage.'));
    const listBox = el('div'); listBox.innerHTML = '<div class="isr-skel" role="status" aria-label="Loading"><i></i><i></i><i></i></div>';
    people.append(listBox);
    v.replaceChildren(back, head, figs, ...(upload ? [upload] : []), people);
    loadPeople(a, listBox);
  }
  function closeEvent() { open = null; $('eventView').hidden = true; $('eventView').replaceChildren(); $('listView').hidden = false; window.scrollTo({ top: 0 }); }

  async function loadPeople(a, box) {
    let list;
    try { list = (await api(`/api/activities/${a.id}/students`)).students; } catch (e) { box.replaceChildren(el('div', 'p-notice bad', e.message)); return; }
    if (!list.length) { box.replaceChildren(el('div', 'ev-empty', data.canEdit ? 'No enquiries yet. Upload the list above.' : 'No enquiries yet.')); return; }
    const search = h('input', { class: 'ev-search', type: 'search', placeholder: 'Search a name or phone', 'aria-label': 'Search the enquiries' });
    const rows = el('div', 'ev-people');
    const drawPeople = () => {
      const q = search.value.trim().toLowerCase();
      const shown = q ? list.filter((s) => `${s.name} ${s.phone} ${s.email}`.toLowerCase().includes(q)) : list;
      const hd = el('div', 'ev-person head'); ['Name', 'Phone', 'Stage', 'Intake', 'Latest note'].forEach((x) => hd.append(el('div', '', x)));
      rows.replaceChildren(hd, ...shown.map((s) => {
        const r = el('div', 'ev-person');
        const who = h('button', { class: 'who', type: 'button', onclick: () => window.CardDrawer.open(s.id, { onClose: () => refresh() }) }, s.name);
        const last = el('div', 'last');
        if (s.lastNote) last.append(el('b', '', `${localDay(s.lastNote.at)}${s.lastNote.by ? ', ' + s.lastNote.by : ''}: `), s.lastNote.text); else last.textContent = 'No note yet';
        const stage = el('div'); stage.append(window.Portal.stagePill(s.stage));
        r.append(who, el('div', '', s.phone || '-'), stage, el('div', '', s.intake), last);
        return r;
      }));
    };
    search.addEventListener('input', drawPeople);
    drawPeople();
    const top = el('div', 'ev-actions'); top.style.margin = '0 0 12px'; top.append(search, el('span', 'p-muted', `${list.length} ${list.length === 1 ? 'enquiry' : 'enquiries'}`));
    box.replaceChildren(top, rows);
  }

  function uploadPanel(a) {
    const p = el('section', 'ev-panel');
    p.append(el('h3', '', 'Upload the enquiry list'), el('p', '', 'An Excel or CSV file with a name and a phone or email on each line. You review every line before anything is saved.'));
    const intake = h('select', {});
    (data.intakes || []).forEach((s) => intake.append(h('option', { value: s.id }, s.name)));
    const file = h('input', { type: 'file', accept: '.xlsx,.csv' });
    const row = el('div', 'ev-upload');
    const l1 = el('label'); l1.append('Intake for new enquiries', intake);
    const l2 = el('label'); l2.append('File (Excel or CSV)', file);
    row.append(l1, l2);
    const out = el('div');
    p.append(row, out);
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      out.replaceChildren(el('p', 'p-muted', 'Reading the file…'));
      let lines;
      try { lines = await window.StudentFile.readFile(f, 1000); } catch (e) { out.replaceChildren(el('div', 'p-notice bad', 'Could not read the file: ' + e.message)); return; }
      if (!lines.length) { out.replaceChildren(el('div', 'p-notice bad', 'No names were found in that file.')); return; }
      const rows = lines.map((r) => ({ first: r.first, last: r.last, email: r.email, phone: r.phone, level: r.level || '', intake: r.intake || '', inquiryDate: r.inquiryDate || '', place: r.place || '', extra: r.extra || '' }));
      let pre;
      try { pre = await api(`/api/activities/${a.id}/students`, { rows, sheetId: intake.value, preview: true }); } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); return; }
      out.replaceChildren(review(pre, async () => {
        const done = await api(`/api/activities/${a.id}/students`, { rows, sheetId: intake.value });
        say(`${done.added} added, ${done.linked} linked`);
        file.value = '';
        await refresh();
        if (done.failed.length) window.NiecUI.toast('Not done: ' + done.failed.join(' | '), { type: 'error' });
      }, () => { out.replaceChildren(); file.value = ''; }));
    });
    return p;
  }

  const WHAT = { new: 'New', link: 'Match', already: 'Linked', other: 'Other event', check: 'Check', problem: 'Skipped' };
  function review(pre, onOk, onCancel) {
    const box = el('div');
    const c = pre.counts;
    const counts = el('div', 'ev-counts');
    [['new', `${c.new} new, added at Inquiry`], ['link', `${c.link} matched on the sheet, will be linked`], ['already', `${c.already} already linked`], ['other', `${c.other} in another event, left as is`], ...(c.check ? [['check', `${c.check} to check: same phone, another name`]] : []), ['problem', `${c.problem} skipped`]]
      .forEach(([k, t]) => counts.append(el('span', `ev-count ${k === 'check' ? 'other' : k}`, t)));
    // Students tagged with this event earlier who are not on this list: they stay as they are, and are named here to be checked.
    let gone = null;
    if (pre.missing && pre.missing.length) {
      gone = el('div', 'p-notice warn ev-missing');
      const words = el('div');
      words.append(el('b', '', `${pre.missing.length} ${pre.missing.length === 1 ? 'student was' : 'students were'} on an earlier list but ${pre.missing.length === 1 ? 'is' : 'are'} not in this one.`), el('div', '', 'Nothing is changed for them: they stay tagged with this event. Check them on their cards.'));
      const names = el('div', 'ev-missing-names');
      pre.missing.slice(0, 60).forEach((m) => { const b = h('button', { type: 'button', class: 'ev-missing-name', onclick: () => window.CardDrawer.open(m.id) }, m.name); b.title = `${m.intake} \u00b7 ${m.stage || 'no stage'}`; names.append(b); });
      if (pre.missing.length > 60) names.append(el('span', 'p-muted', `and ${pre.missing.length - 60} more`));
      words.append(names);
      gone.append(words);
    }
    const list = el('div', 'ev-review');
    const order = ['problem', 'check', 'other', 'link', 'new', 'already'];
    [...pre.rows].sort((x, y) => order.indexOf(x.action) - order.indexOf(y.action)).forEach((r) => {
      const line = el('div', 'ev-rline');
      line.append(el('span', `what ${r.action === 'check' ? 'other' : r.action}`, WHAT[r.action]), el('b', '', r.name || '(no name)'), el('span', '', r.phone || r.email || '-'), el('span', 'why', r.note));
      list.append(line);
    });
    const doing = c.new + c.link;
    const ok = h('button', { class: 'btn btn-primary', type: 'button' }, doing ? `Confirm: add ${c.new}, link ${c.link}` : 'Nothing to add');
    ok.disabled = !doing;
    ok.addEventListener('click', async () => { ok.disabled = true; try { await onOk(); } catch (e) { say(e.message, true); ok.disabled = false; } });
    const actions = el('div', 'ev-actions'); actions.append(ok, h('button', { class: 'btn', type: 'button', onclick: onCancel }, 'Cancel'), el('span', 'p-muted', 'Nothing is saved until you confirm.'));
    box.append(counts, ...(gone ? [gone] : []), list, actions);
    return box;
  }

  // ---- add or change one ----
  function form(a) {
    dialog(a ? 'Edit event or campaign' : 'New event or campaign', (body, close) => {
      const f = {
        name: field('Name', { value: a && a.name, max: 120, wide: true, placeholder: 'e.g. UK Education Fair, Kathmandu' }),
        place: field('Venue or page (optional)', { value: a && a.place, max: 120, placeholder: 'e.g. Hotel Annapurna' }),
        cost: field('Investment', { value: a && (a.costAmount || a.cost) ? String(a.costAmount || a.cost) : '', max: 14, placeholder: 'e.g. 25000' }),
        date: field('Starts', { kind: 'date', value: a && a.date }),
        endDate: field('Ends (optional)', { kind: 'date', value: a && a.endDate }),
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
      // The investment in rupees, US dollars or pounds: dollars and pounds are turned into rupees at today's rate when saved.
      let currency = (a && a.costCurrency) || 'NPR';
      const money = el('div', 'ev-money');
      const cur = el('div', 'ev-cur');
      cur.setAttribute('role', 'group'); cur.setAttribute('aria-label', 'Currency');
      const curs = [['NPR', 'Rs'], ['USD', '$'], ['GBP', '\u00a3']].map(([k, t]) => {
        const b = h('button', { type: 'button', class: k === currency ? 'on' : '', title: { NPR: 'Nepalese rupees', USD: 'US dollars', GBP: 'Pounds' }[k] }, t);
        b.setAttribute('aria-pressed', String(k === currency));
        b.addEventListener('click', () => { currency = k; curs.forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); hint(); });
        return b;
      });
      cur.append(...curs);
      const conv = el('small', 'ev-conv');
      const hint = () => { conv.textContent = currency === 'NPR' ? 'In Nepalese rupees.' : `In ${currency === 'USD' ? 'US dollars' : 'pounds'}: turned into rupees at today\u2019s rate when you save, and every total is in rupees.`; };
      hint();
      f.cost.input.inputMode = 'decimal';
      const line = el('div', 'ev-money-row');
      f.cost.input.replaceWith(line);
      line.append(f.cost.input, cur);
      f.cost.wrap.append(conv);
      money.append(f.cost.wrap);
      const grid = el('div', 'p-form p-form-2');
      grid.append(f.name.wrap, where, f.place.wrap, money, f.date.wrap, f.endDate.wrap, f.note.wrap);
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
      if (a) foot.append(h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { if (await window.NiecUI.confirm('Remove this event? Its enquiries stay in All Students.', { danger: true, confirmText: 'Remove' })) { await api(`/api/planning/events/${a.id}/delete`, {}); close('removed'); } } }, 'Remove'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      ok.addEventListener('click', async () => {
        if (ok.disabled) return;
        if (!channel) { msg.textContent = 'Please choose where it ran.'; msg.className = 'p-msg error'; return; }
        ok.disabled = true;
        try {
          // The older "type" of an entry is sent back as it was, so nothing stored is lost.
          const typed = Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.input.value]));
          await api('/api/planning/events', { ...(a ? { id: a.id, type: a.type } : {}), channel, ...typed, costAmount: typed.cost, costCurrency: currency });
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
    if (data) window.NiecUI.swap(draw, { soft: true });
  }));
  refresh().catch((e) => { $('list').replaceChildren(h('div', { class: 'p-notice bad' }, e.message)); });
})();

// The Follow-ups page: every student with a follow-up day, the late ones first, and the inquiries nobody has set a day for.
(function () {
  const { el, h, api, day, fromToday, stagePill, initials, dialog, field } = window.Portal;
  let data = null;
  let me = null;
  const $ = (id) => document.getElementById(id);

  function row(x, planned) {
    const r = el('div', 'p-due');
    const who = el('div', 'p-due-who');
    who.append(el('span', 'p-avatar sm', initials(x.name)));
    const info = el('div');
    const name = h('button', { class: 'p-link p-due-name', type: 'button', onclick: () => window.CardDrawer.open(x.id) }, x.name);
    info.append(name, el('div', 'p-due-sub', [x.phone, x.email, x.counselor && 'Counselor ' + x.counselor].filter(Boolean).join(' · ')));
    who.append(info);
    const what = el('div', 'p-due-what');
    if (planned) {
      const late = x.days > 0;
      const line = el('div');
      line.append(el('b', '', day(x.date)), ' ', el('span', late ? 'p-pill p-pill-red' : x.days === 0 ? 'p-pill p-pill-amber' : 'p-chip', fromToday(x.date, data.today)));
      what.append(line, el('div', 'p-due-sub', x.what || 'No note'));
    } else {
      what.append(el('div', 'p-due-sub', x.lastNote ? `Last note: ${x.lastNote.text}` : (x.remarks || 'No notes yet')));
    }
    const act = el('div', 'p-due-act');
    act.append(stagePill(x.stage));
    if (x.editable) {
      if (planned) act.append(h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => finish(x) }, 'Done'));
      act.append(h('button', { class: 'btn btn-sm', type: 'button', onclick: () => set(x, planned) }, planned ? 'Change day' : 'Set a day'));
    }
    r.append(who, what, act);
    return r;
  }
  function set(x, planned) {
    return dialog(planned ? 'Change the follow-up day' : 'Set a follow-up day', (body, close) => {
      const d = field('Day', { kind: 'date', value: planned ? x.date : '' });
      const w = field('What to do', { value: planned ? x.what : '', placeholder: 'Call about the documents' });
      const f = el('div', 'p-form p-form-2'); f.append(d.wrap, w.wrap);
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      ok.addEventListener('click', async () => { try { await api(`/api/cards/${x.id}/follow-up`, { date: d.input.value, note: w.input.value }); close(true); load(); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; } });
      foot.append(ok);
      body.append(el('p', 'p-muted', x.name), f, msg, foot);
    }).then(() => undefined);
  }
  function finish(x) {
    return dialog('Follow-up done', (body, close) => {
      const o = field('What came of it', { kind: 'area', max: 2000, wide: true, placeholder: 'Spoke to the student, documents promised for Friday.' });
      const d = field('Next follow-up day (leave empty if none)', { kind: 'date' });
      const w = field('What to do then', { value: '' });
      const f = el('div', 'p-form p-form-2'); f.append(o.wrap, d.wrap, w.wrap);
      const msg = el('div', 'p-msg');
      const foot = el('div', 'p-dialog-foot');
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'));
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      ok.addEventListener('click', async () => { try { await api(`/api/cards/${x.id}/follow-up`, { done: true, outcome: o.input.value, nextDate: d.input.value, nextNote: w.input.value }); close(true); load(); } catch (e) { msg.textContent = e.message; msg.className = 'p-msg error'; } });
      foot.append(ok);
      body.append(el('p', 'p-muted', x.name), f, msg, foot);
    }).then(() => undefined);
  }

  function render() {
    const mineOnly = $('who').value === 'mine';
    const mine = (x) => !mineOnly || !x.counselor || x.counselor === data.me;
    const due = data.due.filter(mine);
    const unplanned = data.unplanned.filter(mine);
    const late = due.filter((x) => x.days > 0).length;
    const today = due.filter((x) => x.days === 0).length;
    const next7 = due.filter((x) => x.days < 0 && x.days >= -7).length;
    const tile = (label, value, cls, sub) => { const t = el('div', `p-kpi ${cls || ''}`); t.append(el('b', '', String(value)), el('span', '', label), el('small', '', sub || '')); return t; };
    $('kpis').replaceChildren(tile('Late', late, late ? 'warn' : 'good', late ? 'Do these first' : 'Nothing is late'), tile('Due today', today, 'mark'), tile('In the next 7 days', next7), tile('No follow-up day', unplanned.length, unplanned.length ? 'warn' : '', 'Inquiries with no next step'));
    $('count').textContent = due.length ? `${due.length} students` : '';
    $('due').replaceChildren(...(due.length ? due.map((x) => row(x, true)) : [el('div', 'p-empty')]));
    if (!due.length) { $('due').firstChild.append(el('b', '', 'Nothing to follow up'), 'Set a follow-up day on a student card or when you add a student.'); }
    $('unplanned').replaceChildren(...(unplanned.length ? unplanned.slice(0, 60).map((x) => row(x, false)) : [el('div', 'p-empty', 'Every inquiry has a follow-up day.')]));
  }
  async function load() {
    try { data = await api('/api/follow-ups'); render(); } catch (e) { $('due').replaceChildren(el('div', 'p-notice bad', e.message)); }
  }
  $('who').addEventListener('change', render);
  $('add').addEventListener('click', async () => {
    me = me || (await api('/api/me'));
    const made = await window.NewStudent.open({ me, intakes: [], defaultStage: 'Inquiry' });
    if (made && made.id) { await load(); window.CardDrawer.open(made.id); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  load();
})();

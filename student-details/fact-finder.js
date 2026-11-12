// The Fact File's links to the student cards: "Send to a student" (pick courses, pick a student, one email with all of them)
// and the option finder for unusual requests. window.SendToStudent.open(options) is also used by the finder's results.
(function (root) {
  const { el, h, api, field, dialog, waitFor } = root.Portal;
  const F = root.CardFields;
  const say = (t, e) => root.NiecUI.toast(t, { type: e ? 'error' : 'success' });

  // Pick one student from the ones this account sees (searches by name, email, phone number or course).
  function pickStudent() {
    return dialog('Choose the student', (body, close) => {
      const q = field('Search', { placeholder: 'Name, email or phone number', max: 100 });
      const results = el('div', 'p-pick-list');
      body.append(q.wrap, results);
      let timer;
      const run = async () => {
        try {
          const r = await api('/api/students/search?q=' + encodeURIComponent(q.input.value));
          results.replaceChildren(...(r.students.length ? r.students.map((s) => {
            const b = el('button', 'p-pick');
            b.type = 'button';
            const text = el('span');
            text.append(el('b', '', s.name), el('small', '', [s.stage, s.intake, s.university, s.email].filter(Boolean).join(' · ')));
            b.append(el('span', 'p-avatar sm', root.Portal.initials(s.name)), text);
            b.addEventListener('click', () => close(s));
            return b;
          }) : [el('div', 'p-empty', 'No student found. Add the student on the Student Details sheet first.')]));
        } catch (e) { results.replaceChildren(el('div', 'p-notice bad', e.message)); }
      };
      q.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
      run();
      setTimeout(() => q.input.focus(), 30);
    });
  }

  // Adds the options to the student's card and opens the message writer there, so one email carries every option.
  async function open(options) {
    if (!options.length) { say('Choose at least one course first.', true); return; }
    const student = await pickStudent();
    if (!student) return;
    let added = 0;
    let skipped = 0;
    for (const o of options) {
      try {
        await api(`/api/cards/${student.id}/options`, { universityId: o.universityId, university: o.university, course: o.course, level: o.level, intake: o.intake, fee: o.fee, scholarship: o.scholarship, link: o.link });
        added += 1;
      } catch (e) { if (e.status === 409) skipped += 1; else { say(e.message, true); return; } }
    }
    say(`${added} option${added === 1 ? '' : 's'} added to ${student.name}${skipped ? ` (${skipped} already there)` : ''}`);
    location.href = `/student?id=${encodeURIComponent(student.id)}#messages`;
  }

  // A window listing the courses of one university, to tick and send.
  function pickCourses(universityId, universityName) {
    return dialog(`Send ${universityName} courses to a student`, (body, close) => {
      const q = field('Search the courses', { placeholder: 'cyber security', max: 100 });
      const lv = field('Level', { kind: 'select', choices: F.STUDY_LEVELS });
      const form = el('div', 'p-form p-form-2'); form.append(q.wrap, lv.wrap);
      const info = el('div', 'p-muted p-small');
      const out = el('div', 'p-option-results');
      const chosen = new Map();
      const foot = el('div', 'p-dialog-foot');
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Choose the student');
      go.addEventListener('click', () => close([...chosen.values()]));
      foot.append(h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'), go);
      body.append(form, info, out, foot);
      const key = (o) => `${o.course}|${o.intake}|${o.level}`;
      let timer;
      const run = async () => {
        try {
          const r = await api('/api/courses?' + new URLSearchParams({ q: q.input.value, level: lv.input.value, university: universityId }));
          info.textContent = `${r.total} courses${r.total > r.options.length ? `, the first ${r.options.length} shown` : ''}. Tick the ones to send.`;
          out.replaceChildren(...r.options.map((o) => {
            const row = el('label', 'p-check');
            const c = el('input'); c.type = 'checkbox'; c.checked = chosen.has(key(o));
            c.addEventListener('change', () => { if (c.checked) chosen.set(key(o), o); else chosen.delete(key(o)); go.textContent = chosen.size ? `Choose the student (${chosen.size})` : 'Choose the student'; });
            const t = el('span'); t.append(el('b', '', o.course), el('div', 'p-muted p-small', [o.intake, o.level, o.fee && 'Fee ' + o.fee, o.scholarship && 'Scholarship ' + o.scholarship].filter(Boolean).join(' · ')));
            row.append(c, t);
            return row;
          }));
        } catch (e) { out.replaceChildren(el('div', 'p-notice bad', e.message)); }
      };
      [q, lv].forEach((x) => x.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); }));
      run();
    }, { wide: true });
  }
  async function sendUniversity(universityId, universityName) {
    const options = await pickCourses(universityId, universityName);
    if (options && options.length) await open(options);
  }

  // The option finder card of the Fact File page.
  function finderCard(container) {
    const card = el('section', 'p-card');
    card.style.margin = '0 0 16px';
    const head = el('div', 'p-card-head');
    head.append(el('h2', '', 'Find options for a student'));
    const badge = el('span', 'p-chip', 'Checking the AI helper…');
    head.append(badge);
    card.append(head, el('p', '', 'Describe the student and what they want, even an unusual case. It looks through every university in this Fact File and shows the course, link, fee and scholarship of each option.'));
    const box = el('div', 'p-finder');
    const request = el('textarea', 'p-input');
    request.placeholder = 'Student with 2.4 GPA and a 6 year gap, IELTS 5.5, wants a business course in London under 16,000 pounds for January 2027.';
    request.maxLength = 1500;
    const form = el('div', 'p-form');
    const lv = field('Level', { kind: 'select', choices: F.STUDY_LEVELS });
    const subj = field('Subject', { placeholder: 'business', max: 120 });
    const intake = field('Intake', { placeholder: 'January 2027', max: 60 });
    const budget = field('Budget for the first year (GBP)', { max: 20 });
    form.append(lv.wrap, subj.wrap, intake.wrap, budget.wrap);
    const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Find options');
    const results = el('div', 'p-option-results');
    const picks = new Set();
    let last = [];
    const sendBtn = h('button', { class: 'btn', type: 'button' }, 'Send the ticked options to a student');
    sendBtn.hidden = true;
    sendBtn.addEventListener('click', () => open(last.filter((_, i) => picks.has(i))));
    box.append(request, form, el('div', 'p-bar'), results, sendBtn);
    box.querySelector('.p-bar').append(go);
    card.append(box);
    container.before(card);
    api('/api/ai/status').then((s) => { badge.textContent = s.ready ? 'AI helper on' : 'AI helper off: built-in matching'; badge.title = s.message || ''; }).catch(() => { badge.textContent = ''; });
    go.addEventListener('click', async () => {
      go.disabled = true; picks.clear(); sendBtn.hidden = true;
      results.replaceChildren(el('div', 'p-thinking', 'Looking through the Fact File…'));
      try {
        let out = await api('/api/finder', { request: request.value, level: lv.input.value, subject: subj.input.value, intake: intake.input.value, budget: budget.input.value });
        if (out.job) out = await waitFor('/api/finder/' + out.job);
        results.replaceChildren();
        if (out.notice) results.append(el('div', 'p-notice warn', out.notice));
        if (out.summary) results.append(el('div', 'p-notice ok', out.summary));
        if (out.nothingFits) results.append(el('div', 'p-notice bad', out.nothingFits));
        last = out.results;
        out.results.forEach((o, i) => {
          const c = el('div', `p-option${o.closed ? ' closed' : ''}`);
          const left = el('label', 'p-check');
          const cb = el('input'); cb.type = 'checkbox';
          cb.addEventListener('change', () => { if (cb.checked) picks.add(i); else picks.delete(i); sendBtn.hidden = !picks.size; });
          const t = el('span'); t.append(el('b', '', o.course), el('div', 'p-muted p-small', `${o.university}${o.intake ? ' · ' + o.intake : ''}${o.level ? ' · ' + o.level : ''}`));
          left.append(cb, t);
          c.append(left, el('span', `p-pill p-pill-${o.fit === 'Eligible' ? 'green' : o.fit === 'Likely eligible' ? 'blue' : 'amber'}`, o.fit));
          const money = el('div', 'p-money');
          [['Fee', o.fee], ['Scholarship', o.scholarship]].forEach(([k, v]) => { const s = el('span'); s.append(el('span', 'p-muted', k + ': '), el('b', '', v || 'to be confirmed')); money.append(s); });
          c.append(money);
          const why = el('div', 'p-why');
          why.append(el('b', '', o.fit + '. '), o.why || '', o.check ? ' To check: ' + o.check : '');
          c.append(why);
          if (o.link) { const a = el('a', 'p-link p-small', o.linkIsCourse ? 'Course page' : 'University website'); a.href = o.link; a.target = '_blank'; a.rel = 'noopener'; const w = el('div', 'p-why'); w.append(a); c.append(w); }
          results.append(c);
        });
        if (!out.results.length && !out.nothingFits) results.append(el('div', 'p-empty', 'Nothing matches. Try fewer words.'));
      } catch (e) { results.replaceChildren(el('div', 'p-notice bad', e.message)); }
      go.disabled = false;
    });
  }
  root.SendToStudent = { open, sendUniversity, finderCard };
})(this);

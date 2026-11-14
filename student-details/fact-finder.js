// The Fact File's links to the student cards: "Send to a student" (pick courses, pick a student, one email with all of them), and
// the look-up of a course's page on the university website.
(function (root) {
  const { el, h, api, field, dialog } = root.Portal;
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
          }) : [el('div', 'p-empty', 'No student found. Add the student on the All Students sheet first.')]));
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
        await api(`/api/cards/${student.id}/options`, { universityId: o.universityId, university: o.university, course: o.course, level: o.level, intake: o.intake, fee: o.fee, deposit: o.deposit, scholarship: o.scholarship, link: o.link });
        added += 1;
      } catch (e) { if (e.status === 409) skipped += 1; else { say(e.message, true); return; } }
    }
    say(`${added} option${added === 1 ? '' : 's'} added to ${student.name}${skipped ? ` (${skipped} already there)` : ''}`);
    location.href = `/student?id=${encodeURIComponent(student.id)}#message`;
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

  // Looks the course page up on the university's website (the server does the search); resolves to a link or ''.
  async function lookupLink(o) {
    try { const r = await api('/api/course-link', { universityId: o.universityId, university: o.university, course: o.course }); return r.link || ''; } catch (e) { return ''; }
  }

  root.SendToStudent = { open, sendUniversity, lookupLink };
})(this);

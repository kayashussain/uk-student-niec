// One university's page: read it as a document (print it, or save it as a PDF from the print window),
// and, for Admin, edit it. Everything typed is put on the page as text, never as HTML.
(function () {
  const $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get('u');
  let uni = null;
  let isAdmin = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const has = (s) => String(s || '').trim() !== '';
  function say(text, error) { const m = $('msg'); m.textContent = text || ''; m.className = 'no-print msg' + (error ? ' error' : ''); }

  // Typed text as paragraphs and bullet lists: a line starting with "- " or "* " is a bullet; blank lines separate paragraphs.
  function richText(parent, text, { allBullets = false } = {}) {
    let list = null;
    String(text || '').split('\n').forEach((raw) => {
      const line = raw.trim();
      const heading = /^##\s+(.*)$/.exec(line);
      if (heading) { list = null; parent.append(el('h3', '', heading[1])); return; }
      const bullet = /^[-*•]\s+(.*)$/.exec(line) || (allBullets && line ? [line, line] : null);
      if (bullet) {
        if (!list) { list = el('ul'); parent.append(list); }
        list.append(el('li', '', bullet[1]));
      } else {
        list = null;
        if (line) parent.append(el('p', '', line));
      }
    });
  }

  // ---- reading ----
  function section(doc, title, text, { force = false, allBullets = false } = {}) {
    if (!has(text) && !(force && isAdmin)) return;
    const s = el('section');
    s.append(el('h2', '', title));
    if (has(text)) richText(s, text, { allBullets }); else s.append(el('p', 'placeholder', 'Not added yet.'));
    doc.append(s);
  }

  const PROGRAM_COLUMNS = [['name', 'Program'], ['duration', 'Duration'], ['academic', 'Academic requirement'], ['english', 'English language requirement'],
    ['tuition', 'Total tuition fee'], ['scholarship', 'Scholarship'], ['deposit', 'CAS deposit structure']];

  // Fees, scholarships and deposits by course level, as a table that scrolls sideways on a phone.
  function renderPrograms(doc) {
    const programs = uni.programs || [];
    if (!programs.length && !isAdmin) return;
    const s = el('section');
    s.append(el('h2', '', 'Entry requirements, fees and scholarships'));
    if (!programs.length) { s.append(el('p', 'placeholder', 'Not added yet.')); doc.append(s); return; }
    const wrap = el('div', 'table-wrap');
    const table = el('table', 'programs');
    const headRow = el('tr');
    PROGRAM_COLUMNS.forEach(([, label]) => headRow.append(el('th', '', label)));
    const thead = el('thead');
    thead.append(headRow);
    table.append(thead);
    const body = el('tbody');
    programs.forEach((p) => {
      const tr = el('tr');
      PROGRAM_COLUMNS.forEach(([key, label]) => {
        const td = el('td');
        td.dataset.label = label;
        if (key === 'name') td.append(el('b', '', p.name)); else richText(td, p[key]);
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(body);
    wrap.append(table);
    s.append(wrap);
    doc.append(s);
  }

  function renderView() {
    const view = $('view');
    view.replaceChildren();
    const doc = el('article', 'doc');
    const top = el('div', 'doc-top');
    const logo = el('img');
    logo.src = 'niec-logo.png';
    logo.alt = 'NIEC';
    top.append(logo, el('span', 'kind', 'University Fact File'));
    doc.append(top, el('h1', '', uni.name));

    const glance = el('dl', 'glance');
    const row = (k, v, chips) => {
      glance.append(el('dt', '', k));
      const dd = el('dd');
      if (chips) { const c = el('div', 'chips'); chips.forEach((n) => c.append(el('span', 'chip', n))); dd.append(c); } else dd.textContent = v;
      glance.append(dd);
    };
    if (has(uni.city)) row('City', uni.city);
    if (has(uni.website)) row('Website', uni.website);
    if (uni.intakes.length) row('Intakes', '', uni.intakes.map((i) => i.name));
    if (glance.children.length) doc.append(glance);

    section(doc, 'Overview and key facts', uni.overview, { allBullets: true });
    section(doc, 'Location', uni.location);
    renderPrograms(doc);
    section(doc, 'Entry requirements', uni.entryRequirements, { force: true });
    section(doc, 'Language test', uni.languageTests, { force: true });
    section(doc, 'Courses available', uni.courses, { force: true, allBullets: true });

    if (uni.process.length || isAdmin) {
      const s = el('section');
      s.append(el('h2', '', 'Application process'));
      if (uni.process.length) {
        const ol = el('ol', 'steps');
        uni.process.forEach((p) => {
          const li = el('li');
          li.append(el('div', 'step-title', p.title));
          if (has(p.detail)) { const d = el('div'); richText(d, p.detail); li.append(d); }
          ol.append(li);
        });
        s.append(ol);
      } else s.append(el('p', 'placeholder', 'Not added yet.'));
      doc.append(s);
    }
    section(doc, 'Interview requirements', uni.interview, { force: true });

    if (uni.intakes.length) {
      const s = el('section');
      s.append(el('h2', '', 'Intakes'));
      s.append(el('p', '', 'What is different for each intake.'));
      uni.intakes.forEach((i) => {
        const box = el('div', 'intake');
        const h = el('h3', '', i.name);
        if (has(i.deadline)) h.append(' ', el('span', 'deadline', `(apply by ${i.deadline})`));
        box.append(h);
        [['Requirements', i.requirements], ['Courses', i.courses], ['Notes', i.notes]].forEach(([label, text]) => {
          if (!has(text)) return;
          box.append(el('div', 'label', label));
          richText(box, text, { allBullets: label === 'Courses' });
        });
        s.append(box);
      });
      doc.append(s);
    }
    section(doc, 'Notes', uni.notes);
    doc.append(el('div', 'foot', has(uni.updatedBy) ? `Last updated ${when(uni.updatedAt)} by ${uni.updatedBy}. Nepal International Education Consultancy.` : 'Nepal International Education Consultancy.'));
    // A bar to jump between the sections of a long page (hidden when printing).
    const heads = [...doc.querySelectorAll('section > h2')];
    if (heads.length >= 4) {
      const toc = el('nav', 'toc no-print');
      toc.setAttribute('aria-label', 'On this page');
      heads.forEach((h, i) => {
        h.parentElement.id = `sec-${i}`;
        const a = el('a', '', h.textContent);
        a.href = `#sec-${i}`;
        a.addEventListener('click', (e) => { e.preventDefault(); h.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', location.pathname + location.search); });
        toc.append(a);
      });
      view.append(toc);
    }
    view.append(doc);
    document.title = `${uni.name} · Fact File · UK Student NIEC`;

    const bar = $('toolbar');
    bar.replaceChildren();
    const print = el('button', 'btn', 'Print or save as PDF');
    print.type = 'button';
    print.addEventListener('click', () => window.print());
    bar.append(print);
    if (isAdmin) {
      const edit = el('button', 'btn btn-primary', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', renderEdit);
      bar.append(edit);
    }
  }

  // ---- editing (Admin) ----
  function field(label, input) {
    const l = el('label', '', label);
    l.append(input);
    return l;
  }
  const text = (value, rows) => { const t = el('textarea'); t.value = value || ''; if (rows) t.rows = rows; return t; };
  const line = (value, ph) => { const i = el('input'); i.value = value || ''; if (ph) i.placeholder = ph; return i; };

  function renderEdit() {
    say('');
    $('toolbar').replaceChildren();
    const form = el('form', 'editor');
    form.autocomplete = 'off';
    // Anything changed and not yet saved: the browser asks before the page is left, and Cancel asks too.
    let dirty = false;
    const guard = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    const stopGuarding = () => { window.removeEventListener('beforeunload', guard); dirty = false; };
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('click', (e) => { if (e.target.closest('button.btn-sm')) dirty = true; }); // add / remove / move a step or intake
    form.addEventListener('keydown', (e) => { // Ctrl+S or Cmd+S saves
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); form.requestSubmit(); }
    });
    const name = line(uni.name); name.required = true; name.maxLength = 120;
    const city = line(uni.city, 'e.g. London');
    const website = line(uni.website, 'e.g. https://www.uwl.ac.uk');
    const location = text(uni.location, 3);
    const overview = text(uni.overview, 5);
    const entry = text(uni.entryRequirements, 6);
    const lang = text(uni.languageTests, 5);
    const courses = text(uni.courses, 6);
    const interview = text(uni.interview, 5);
    const notes = text(uni.notes, 4);

    form.append(el('h2', '', 'The university'));
    const two = el('div', 'two');
    two.append(field('Name', name), field('City', city));
    form.append(two, field('Website', website), field('Where it is (campus, address, how to get there)', location));
    form.append(field('Overview and key facts (living expenses requirement, placement partners, anything at a glance)', overview));

    form.append(el('h2', '', 'Fees and scholarships by course level'));
    form.append(el('p', 'hint', 'One block for each level, for example UG, PG or PG Placement Year. Start a line with "- " for a bullet.'));
    const programsBox = el('div');
    form.append(programsBox);
    const programRows = [];
    function addProgram(p) {
      const block = el('div', 'block');
      const head = el('div', 'block-head');
      const remove = el('button', 'btn btn-sm btn-danger', 'Remove');
      remove.type = 'button';
      const rec = { block };
      PROGRAM_COLUMNS.forEach(([key]) => { rec[key] = key === 'name' || key === 'duration' ? line(p && p[key], key === 'name' ? 'e.g. PG' : 'e.g. 1 Year') : text(p && p[key], 4); });
      remove.addEventListener('click', () => { programRows.splice(programRows.indexOf(rec), 1); block.remove(); });
      head.append(el('b', '', 'Course level'), remove);
      const pair = el('div', 'two');
      pair.append(field('Program', rec.name), field('Duration', rec.duration));
      block.append(head, pair);
      PROGRAM_COLUMNS.slice(2).forEach(([key, label]) => block.append(field(label, rec[key])));
      programRows.push(rec);
      programsBox.append(block);
    }
    (uni.programs || []).forEach(addProgram);
    const addProgramBtn = el('button', 'btn btn-sm', 'Add a course level');
    addProgramBtn.type = 'button';
    addProgramBtn.style.marginTop = '10px';
    addProgramBtn.addEventListener('click', () => addProgram({}));
    form.append(addProgramBtn);

    form.append(el('h2', '', 'Requirements'));
    form.append(el('p', 'hint', 'Start a line with "- " to make a bullet list, or "## " to make a sub-heading. Blank lines make a new paragraph.'));
    form.append(field('Entry requirements (grades, subjects, gap, backlogs)', entry), field('Language test (IELTS, PTE, Duolingo, waivers)', lang));
    form.append(field('Courses available (one per line)', courses));

    form.append(el('h2', '', 'Application process'));
    form.append(el('p', 'hint', 'The steps in order, from application to visa. Add what the student must do at each step.'));
    const steps = el('div');
    form.append(steps);
    const stepRows = [];
    function addStep(s) {
      const block = el('div', 'block');
      const head = el('div', 'block-head');
      const label = el('b', '', 'Step');
      const tools = el('div', 'block-tools');
      const mk = (t, fn) => { const b = el('button', 'btn btn-sm', t); b.type = 'button'; b.addEventListener('click', fn); return b; };
      const rec = { block, title: line(s && s.title, 'e.g. Offer letter received'), detail: text(s && s.detail, 3) };
      const renumber = () => stepRows.forEach((r, i) => { r.block.querySelector('.block-head b').textContent = `Step ${i + 1}`; });
      tools.append(
        mk('Up', () => { const i = stepRows.indexOf(rec); if (i > 0) { stepRows.splice(i, 1); stepRows.splice(i - 1, 0, rec); steps.insertBefore(block, stepRows[i].block); renumber(); } }),
        mk('Down', () => { const i = stepRows.indexOf(rec); if (i < stepRows.length - 1) { stepRows.splice(i, 1); stepRows.splice(i + 1, 0, rec); steps.insertBefore(stepRows[i].block, block); renumber(); } }),
        mk('Remove', () => { stepRows.splice(stepRows.indexOf(rec), 1); block.remove(); renumber(); }),
      );
      head.append(label, tools);
      block.append(head, rec.title, field('What happens, and what the student needs', rec.detail));
      stepRows.push(rec);
      steps.append(block);
      renumber();
    }
    (uni.process.length ? uni.process : [{}]).forEach(addStep);
    const addStepBtn = el('button', 'btn btn-sm', 'Add a step');
    addStepBtn.type = 'button';
    addStepBtn.style.marginTop = '10px';
    addStepBtn.addEventListener('click', () => addStep({}));
    form.append(addStepBtn);
    form.append(field('Interview requirements (what the university or Pre-CAS interview asks, documents to bring)', interview));

    form.append(el('h2', '', 'Intakes'));
    form.append(el('p', 'hint', 'Add each intake the university offers. Requirements and courses often differ between, for example, September and January.'));
    const intakes = el('div');
    form.append(intakes);
    const intakeRows = [];
    function addIntake(i) {
      const block = el('div', 'block');
      const head = el('div', 'block-head');
      const remove = el('button', 'btn btn-sm btn-danger', 'Remove');
      remove.type = 'button';
      const rec = { id: i && i.id, block, name: line(i && i.name, 'e.g. September 2026'), deadline: line(i && i.deadline, 'e.g. 31 July 2026'), requirements: text(i && i.requirements, 4), courses: text(i && i.courses, 4), notes: text(i && i.notes, 3) };
      remove.addEventListener('click', () => { intakeRows.splice(intakeRows.indexOf(rec), 1); block.remove(); });
      head.append(el('b', '', 'Intake'), remove);
      const pair = el('div', 'two');
      pair.append(field('Intake name', rec.name), field('Apply by', rec.deadline));
      block.append(head, pair, field('Requirements for this intake', rec.requirements), field('Courses open in this intake (one per line)', rec.courses), field('Notes', rec.notes));
      intakeRows.push(rec);
      intakes.append(block);
    }
    uni.intakes.forEach(addIntake);
    const addIntakeBtn = el('button', 'btn btn-sm', 'Add an intake');
    addIntakeBtn.type = 'button';
    addIntakeBtn.style.marginTop = '10px';
    addIntakeBtn.addEventListener('click', () => addIntake({}));
    form.append(addIntakeBtn);

    form.append(el('h2', '', 'Anything else'));
    form.append(field('Notes', notes));

    const actions = el('div', 'sticky-actions');
    const save = el('button', 'btn btn-primary', 'Save');
    save.type = 'submit';
    const cancel = el('button', 'btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', async () => {
      if (dirty && !(await NiecUI.confirm('What you changed on this page has not been saved.', { title: 'Leave without saving?', confirmText: 'Leave without saving', cancelText: 'Keep editing', danger: true }))) return;
      stopGuarding();
      say('');
      renderView();
    });
    const del = el('button', 'btn btn-danger', 'Delete this university');
    del.type = 'button';
    del.style.marginLeft = 'auto';
    del.addEventListener('click', async () => {
      const yes = await NiecUI.confirm(`The whole page for ${uni.name} is removed from the Fact File. This cannot be undone.`,
        { title: 'Delete this university?', confirmText: 'Delete university', danger: true });
      if (!yes) return;
      const res = await fetch(`/api/facts/${uni.id}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (res.ok) { stopGuarding(); location.href = '/fact-file'; } else say('Could not delete it.', true);
    });
    actions.append(save, cancel, del);
    form.append(actions);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      save.disabled = true;
      say('Saving...');
      const body = {
        name: name.value, city: city.value, website: website.value, location: location.value, overview: overview.value,
        programs: programRows.map((r) => Object.fromEntries(PROGRAM_COLUMNS.map(([key]) => [key, r[key].value]))),
        entryRequirements: entry.value, languageTests: lang.value, courses: courses.value, interview: interview.value, notes: notes.value,
        process: stepRows.map((r) => ({ title: r.title.value, detail: r.detail.value })),
        intakes: intakeRows.map((r) => ({ id: r.id, name: r.name.value, deadline: r.deadline.value, requirements: r.requirements.value, courses: r.courses.value, notes: r.notes.value })),
      };
      try {
        const res = await fetch(`/api/facts/${uni.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
        uni = json;
        stopGuarding();
        renderView();
        say('');
        NiecUI.toast('Saved. Everyone can see the new version.', { type: 'success' });
        window.scrollTo(0, 0);
      } catch (err) {
        say(err.message, true);
        save.disabled = false;
      }
    });
    $('view').replaceChildren(form);
    // Long lists (a university's courses) show in full instead of a small box that scrolls.
    const fit = (t) => { t.style.height = 'auto'; t.style.height = Math.min(Math.max(t.scrollHeight + 2, 84), 460) + 'px'; };
    form.querySelectorAll('textarea').forEach((t) => { fit(t); t.addEventListener('input', () => fit(t)); });
    name.focus();
  }

  async function start() {
    if (!id) { location.replace('/fact-file'); return; }
    try {
      const [meRes, uniRes] = await Promise.all([fetch('/api/me', { cache: 'no-store' }), fetch('/api/facts/' + encodeURIComponent(id), { cache: 'no-store' })]);
      if (!uniRes.ok) { say('That university is not in the Fact File.', true); return; }
      isAdmin = (await meRes.json()).role === 'admin';
      uni = await uniRes.json();
    } catch (e) {
      say('Could not load this page. Please reload.', true);
      return;
    }
    if (isAdmin && new URLSearchParams(location.search).get('edit')) renderEdit(); else renderView();
  }
  start();
})();

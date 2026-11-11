// The Pipeline page (pipeline.html): the students of one intake as cards, one column for each stage. It reads the same
// /api/data as the sheet, so every account sees exactly the students it may see there. Nothing is changed from here: a
// card opens the student's profile on the Student Details page. Names come from student records: textContent only.
(function () {
  const $ = (id) => document.getElementById(id);
  const STAGES = ['Inquiry', 'Application Stage', 'Mock Stage', 'Payment Stage', 'CAS Stage', 'CAS Issued', 'Visa Lodge', 'Visa Issued'];
  const LEFT = ['Visa Rejected', 'Defer', 'Hold', 'Withdrawn'];
  let sheets = [];
  let selected = (() => { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ''; } })();
  let last = '';

  const text = (v) => String(v === undefined || v === null ? '' : v).trim();
  function el(tag, cls, value) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (value !== undefined) e.textContent = value;
    return e;
  }
  const isStudent = (r) => text(r['FIRST NAME']) || text(r['LAST NAME']);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function render() {
    const sheet = sheets.find((s) => s.id === selected) || sheets[sheets.length - 1];
    const board = $('board');
    board.replaceChildren();
    if (!sheet) { board.append(el('p', 'empty', 'No intake to show yet.')); return; }
    selected = sheet.id;
    const all = sheet.rows.filter(isStudent);
    const who = $('counselor').value;
    const find = text($('find').value).toLowerCase();
    const shown = all.filter((r) => (!who || text(r.COUNSELOR) === who)
      && (!find || ['FIRST NAME', 'LAST NAME', 'UNIVERSITY NAME', 'COURSE NAME', 'STUDENT SOURCE'].some((c) => text(r[c]).toLowerCase().includes(find)) || `${text(r['FIRST NAME'])} ${text(r['LAST NAME'])}`.toLowerCase().includes(find)));
    const now = today();
    const column = (title, list, quiet) => {
      const col = el('section', quiet ? 'lane quiet' : 'lane');
      const head = el('header');
      head.append(el('h2', '', title), el('span', 'lane-count', String(list.length)));
      col.append(head);
      const cards = el('div', 'lane-cards');
      list.forEach((r) => {
        const a = el('a', 'student-card');
        a.href = `/students#open=${encodeURIComponent(r._id)}&sheet=${encodeURIComponent(sheet.id)}`;
        a.append(el('strong', '', `${text(r['FIRST NAME'])} ${text(r['LAST NAME'])}`.trim()));
        const place = [text(r['UNIVERSITY NAME']), text(r['COURSE NAME'])].filter(Boolean).join(' · ');
        if (place) a.append(el('span', '', place));
        const meta = [text(r.COUNSELOR), text(r['STUDENT SOURCE'])].filter(Boolean).join(' · ');
        if (meta) a.append(el('small', '', meta));
        const due = text(r['NEXT FOLLOW UP']);
        if (/^\d{4}-\d{2}-\d{2}$/.test(due) && !LEFT.includes(title) && title !== 'Visa Issued') {
          a.append(el('small', due < now ? 'due late' : 'due', due < now ? `Follow-up was due ${due}` : `Follow-up ${due}`));
        }
        cards.append(a);
      });
      if (!list.length) cards.append(el('p', 'empty', 'Nobody here.'));
      col.append(cards);
      board.append(col);
    };
    const at = (status) => shown.filter((r) => text(r['APPLICATION STATUS']) === status);
    STAGES.forEach((s) => column(s, at(s)));
    LEFT.forEach((s) => column(s, at(s), true));
    const none = shown.filter((r) => ![...STAGES, ...LEFT].includes(text(r['APPLICATION STATUS'])));
    if (none.length) column('No stage yet', none, true);
    $('notes').textContent = `${shown.length} of ${all.length} students of ${sheet.name} shown. Stages are changed on Student Details, where each move is checked.`;
  }

  function fillFilters() {
    const intake = $('intake');
    intake.length = 0;
    sheets.forEach((s) => intake.add(new Option(s.name, s.id)));
    const sheet = sheets.find((s) => s.id === selected) || sheets[sheets.length - 1];
    if (sheet) intake.value = sheet.id;
    const who = $('counselor');
    const keep = who.value;
    who.length = 0;
    who.add(new Option('Everyone', ''));
    [...new Set((sheet ? sheet.rows : []).map((r) => text(r.COUNSELOR)).filter(Boolean))].sort().forEach((c) => who.add(new Option(c, c)));
    who.value = [...who.options].some((o) => o.value === keep) ? keep : '';
  }

  async function load() {
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const stamp = 'Updated ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      if (String(json.revision) === last) { $('updated').textContent = stamp; return; }
      last = String(json.revision);
      sheets = Array.isArray(json.sheets) ? json.sheets : [];
      fillFilters();
      render();
      $('updated').textContent = stamp;
    } catch (e) {
      $('updated').textContent = sheets.length ? 'Could not refresh. Showing the last list.' : 'Could not load the students.';
    }
  }

  $('intake').addEventListener('change', () => {
    selected = $('intake').value;
    try { history.replaceState(null, '', '#' + encodeURIComponent(selected)); } catch (e) { /* not important */ }
    fillFilters();
    render();
  });
  $('counselor').addEventListener('change', render);
  $('find').addEventListener('input', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 30000);
  load();
})();

// Adds new facts to a Fact File page without overwriting anything that is already there.
//
// The rules (the owner asked for them):
//   - A field that is empty is filled; a field that has text keeps it.
//   - Something that is already on the page is not added again, however it is worded: courses are compared by their words,
//     numbers by their values (6 and 6.0 are the same), so five sources for one university end up as one set of facts.
//   - A new fact for an existing field (a number the page does not have yet) is added as a line of its own, but only when
//     it does not disagree with what the page says. When it does disagree, the page keeps its value and the difference is
//     reported, so a person can decide.
//   - Whatever was added is reported, so the review can say exactly what changed.

const crypto = require('crypto');

const STOP = new Set(['hons', 'and', 'the', 'of', 'in', 'for', 'a', 'to']);

const clean = (s) => String(s || '').replace(/\r\n?/g, '\n');

// Words of a course name, so "Accounting & Finance BA (Hons)" and "BA (Hons) Accounting and Finance" are the same course.
function courseKey(name) {
  const words = clean(name).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter((w) => w && !STOP.has(w));
  return words.sort().join(' ');
}

// The numbers in a text, as values ("6.0" and "6" are both 6; "£16,950" is 16950).
function numbersIn(text) {
  const out = new Set();
  // "5 Years", "2 terms" and "1st" are durations and counts, not scores or amounts.
  const t = clean(text).replace(/(\d),(\d{3})/g, '$1$2').replace(/\b\d+\s*(?:years?|yrs?|months?|terms?)\b/gi, ' ').replace(/\b\d+(?:st|nd|rd|th)\b/gi, ' ');
  (t.match(/\d+(?:\.\d+)?/g) || []).forEach((n) => out.add(String(parseFloat(n))));
  return out;
}
// The numbers that carry a fact: amounts, percentages, scores. Small whole numbers (years, terms, "3 or 4 year") are not
// compared, except in a language score line (IELTS 6, band 5).
function factNumbers(text) {
  const out = new Set();
  fragments(text).forEach((f) => {
    const language = /ielts|pte|toefl|duolingo|band|oet|det\b/i.test(f);
    numbersIn(f).forEach((n) => { if (language || n.includes('.') || parseFloat(n) >= 20) out.add(n); });
  });
  return out;
}
const isSubset = (a, b) => [...a].every((x) => b.has(x));

// Pieces of a text that carry a fact: lines, split again at semicolons.
// A line can hold several facts ("IELTS 6 OR PTE 62 OR DET 110", "Arts: 18,500, MBA: 19,950"): each is its own piece, so a
// fact that is already on the page is not repeated just because it came with a new one.
function fragments(text) {
  return clean(text).split(/\n|;|\s+\|\s+|\s+or\s+|,\s+(?=[A-Za-z])/i).map((s) => s.replace(/^[-\s]+/, '').trim()).filter(Boolean);
}

// Which course level a program row is about. A name can cover several ("International Year Zero/One").
function levelKeys(name) {
  const n = clean(name).toLowerCase();
  const keys = new Set();
  if (/year zero|\biyz\b|\biy0\b/.test(n)) keys.add('iyz');
  if (/year one|year 1\b|\biy1\b|stage one|stage 1\b|\bis1\b/.test(n)) keys.add('iy1');
  if (/year two|year 2\b|\biy2\b|stage two|stage 2\b|\bis2\b/.test(n)) keys.add('iy2');
  if (/zero\/one/.test(n)) { keys.add('iyz'); keys.add('iy1'); }
  if (/incorporated|\biim\b|pre ?master/.test(n)) {
    if (/term ?-?1|term one|1 term/.test(n)) keys.add('iim1');
    if (/term ?-?2|term two|2 term/.test(n)) keys.add('iim2');
    if (!/term/.test(n)) keys.add('iim');
    if (/term1\/term2|term 1\/term 2/.test(n)) { keys.add('iim1'); keys.add('iim2'); }
  }
  if (/enhanced|extended/.test(n)) keys.add('extended');
  if (/placement|industry year/.test(n)) keys.add('placement');
  if (/nursing/.test(n)) keys.add('nursing');
  if (!keys.size) {
    if (/^(under-?graduate|ug|bachelors?|first degree)\b/.test(n)) keys.add('ug');
    else if (/^(post-?graduate|pg)\b/.test(n) || /^(masters?|msc|mres)$/.test(n)) keys.add('pg');
  }
  if (!keys.size) keys.add('name:' + courseKey(n));
  return keys;
}
const sharesKey = (a, b) => [...a].some((k) => b.has(k));

// The row of the page an incoming level belongs to. A pathway college often keeps one row for all its undergraduate
// stages and one for its master's terms; the stages then go into that row, each fact labelled with its stage.
function findProgram(programs, incoming) {
  const want = levelKeys(incoming.name);
  const exact = programs.find((p) => { const k = levelKeys(p.name); return k.size === want.size && sharesKey(k, want); });
  if (exact) return { program: exact, broader: false };
  const shares = programs.find((p) => sharesKey(levelKeys(p.name), want));
  if (shares) return { program: shares, broader: true };
  const stage = ['iyz', 'iy1', 'iy2'].some((k) => want.has(k));
  const master = ['iim', 'iim1', 'iim2'].some((k) => want.has(k));
  const wider = programs.find((p) => { const k = levelKeys(p.name); return (stage && k.has('ug')) || (master && (k.has('pg') || k.has('iim'))); });
  return wider ? { program: wider, broader: true } : null;
}

const programText = (p) => [p.academic, p.english, p.tuition, p.scholarship, p.deposit].join('\n');

// Adds what is new from `incoming` to one field of an existing program. Returns what happened for the report.
function mergeField(program, field, incoming, report, where, { label = '', exact = true } = {}) {
  const text = clean(incoming).trim();
  if (!text) return;
  const have = clean(program[field]).trim();
  const tag = label ? `${label}: ` : '';
  if (!have) {
    program[field] = tag + text;
    report.added.push({ where, field, text: tag + text });
    return;
  }
  const known = factNumbers(programText(program));
  const fresh = fragments(text).filter((f) => { const n = factNumbers(f); return n.size && !isSubset(n, known); });
  if (!fresh.length) return;
  // The page has a number this new text does not agree with: a different version of the same fact, not a missing one.
  const disagrees = exact && [...factNumbers(have)].some((n) => !factNumbers(text).has(n));
  if (disagrees) {
    report.conflicts.push({ where, field, kept: have.split('\n')[0].slice(0, 160), other: fresh[0].slice(0, 160) });
    return;
  }
  const add = fresh.map((f) => '- ' + tag + f).join('\n');
  program[field] = have + '\n' + add;
  report.added.push({ where, field, text: add });
}

// Programs: match by course level, fill what is missing, add a row for a level the page does not have.
function mergePrograms(page, incomingPrograms, report) {
  page.programs = page.programs || [];
  incomingPrograms.forEach((inc) => {
    const where = `${page.name} / ${inc.name}`;
    const hit = findProgram(page.programs, inc);
    if (!hit) {
      const academic = [inc.academic, inc.gap && `Gap: ${inc.gap}`, inc.refusal && `Previous UK visa refusal: ${inc.refusal}`].filter(Boolean).join('\n');
      page.programs.push({ name: inc.name, duration: '', academic, english: inc.english || '', tuition: inc.tuition || '', scholarship: inc.scholarship || '', deposit: inc.deposit || '' });
      report.addedPrograms.push(where);
      if (inc.extra) mergeNotes(page, [`${inc.name}: ${inc.extra}`], report);
      return;
    }
    const found = hit.program;
    const label = hit.broader ? inc.name : '';
    ['academic', 'english', 'tuition', 'scholarship', 'deposit'].forEach((f) => mergeField(found, f, inc[f], report, where, { label, exact: !hit.broader }));
    // Gap and visa refusal sit in the academic cell, as lines, the way the existing pages already show them.
    if (inc.gap) {
      const gapLines = clean(found.academic).split('\n').filter((l) => /\bgap\b/i.test(l));
      if (!gapLines.length) {
        found.academic = (clean(found.academic).trim() + '\n- ' + (label ? label + ': ' : '') + 'Gap: ' + inc.gap).trim();
        report.added.push({ where, field: 'academic', text: 'Gap: ' + inc.gap });
      } else {
        // Years of gap are small numbers, so they are compared here on purpose.
        const years = (t) => new Set((clean(t).match(/\d+(?=\s*(?:years?|yrs?))/gi) || []).map(Number));
        const have = years(gapLines.join('\n'));
        const want = years(inc.gap);
        if (!hit.broader && want.size && have.size && ![...want].every((y) => have.has(y))) report.conflicts.push({ where, field: 'gap', kept: gapLines[0].slice(0, 160), other: inc.gap.slice(0, 160) });
      }
    }
    if (inc.refusal && !/refusal/i.test(programText(found) + '\n' + clean(page.notes))) {
      found.academic = (clean(found.academic).trim() + '\n- ' + (label ? label + ': ' : '') + 'Previous UK visa refusal: ' + inc.refusal).trim();
      report.added.push({ where, field: 'academic', text: 'Previous UK visa refusal: ' + inc.refusal });
    }
    // A note about particular courses (for example courses that need a higher IELTS) belongs to the university's notes.
    if (inc.extra) mergeNotes(page, [`${inc.name}: ${inc.extra}`], report);
  });
}

// ---- intakes: key dates and courses ----
const intakeKey = (name) => clean(name).toLowerCase().replace(/\bintake\b/g, '').replace(/\s+/g, ' ').trim();
function ensureIntake(page, name) {
  page.intakes = page.intakes || [];
  let i = page.intakes.find((x) => intakeKey(x.name) === intakeKey(name));
  // The id is worked out from the names, so loading the page again gives the same intake the same id (a random one would make
  // the page look changed on every load).
  if (!i) { i = { id: crypto.createHash('sha1').update(`intake:${page.name}:${name}`).digest('hex').slice(0, 12), name, deadline: '', requirements: '', courses: '', notes: '' }; page.intakes.push(i); }
  return i;
}

const lineKey = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Key dates: one line per course in the intake's notes. A line that is already there is not repeated.
function mergeKeyDates(page, intakes, report) {
  Object.keys(intakes || {}).forEach((label) => {
    const info = intakes[label];
    const intake = ensureIntake(page, label);
    if (!intake.deadline && info.deadline) { intake.deadline = info.deadline; report.added.push({ where: `${page.name} / ${intake.name}`, field: 'deadline', text: info.deadline }); }
    const have = new Set(clean(intake.notes).split('\n').map(lineKey));
    const fresh = (info.keyDates || []).filter((l) => !have.has(lineKey('- ' + l)) && !have.has(lineKey(l)));
    if (!fresh.length) return;
    const heading = '## Key dates and CAS deadlines';
    let notes = clean(intake.notes).trim();
    if (!notes.includes(heading)) notes = (notes ? notes + '\n' : '') + heading;
    intake.notes = notes + '\n' + fresh.map((l) => '- ' + l).join('\n');
    report.added.push({ where: `${page.name} / ${intake.name}`, field: 'notes', text: `${fresh.length} key date line(s)` });
  });
}

const MAX_TEXT = 11800; // the page keeps up to 12000 characters per text

// Courses: every course the page does not have yet (anywhere on it) is added once, under its heading, in the intake it runs in.
function mergeCourses(page, courses, report) {
  const seen = new Set();
  const collect = (text) => clean(text).split('\n').forEach((l) => { const t = l.trim(); if (t && !t.startsWith('##') && !/^The course list is under/.test(t)) seen.add(courseKey(t.replace(/^[-\s]+/, ''))); });
  collect(page.courses);
  (page.intakes || []).forEach((i) => collect(i.courses));
  let skipped = 0;
  const added = {};
  (courses || []).forEach((c) => {
    const k = courseKey(c.course);
    if (!k || seen.has(k)) return;
    const intake = ensureIntake(page, c.intake);
    const heading = '## ' + c.heading;
    let text = clean(intake.courses).trim();
    const blocks = text ? text.split(/\n(?=## )/) : [];
    const at = blocks.findIndex((b) => lineKey(b.split('\n')[0]) === lineKey(heading));
    if (text.length + c.course.length + 2 + (at === -1 ? heading.length + 2 : 0) > MAX_TEXT) { skipped += 1; return; }
    if (at === -1) blocks.push(heading + '\n' + c.course); else blocks[at] += '\n' + c.course;
    intake.courses = blocks.join('\n');
    seen.add(k);
    added[intake.name] = (added[intake.name] || 0) + 1;
  });
  Object.keys(added).forEach((n) => report.added.push({ where: `${page.name} / ${n}`, field: 'courses', text: `${added[n]} course(s)` }));
  if (skipped) report.skipped.push(`${page.name}: ${skipped} course(s) not added, the page text is full`);
}

// Notes of the university: bullet lines not already on the page.
function mergeNotes(page, lines, report) {
  const have = new Set(clean(page.notes).split('\n').map(lineKey));
  const fresh = (lines || []).filter((l) => !have.has(lineKey(l)) && !have.has(lineKey('- ' + l)));
  if (!fresh.length) return;
  page.notes = (clean(page.notes).trim() ? clean(page.notes).trim() + '\n' : '') + fresh.map((l) => '- ' + l).join('\n');
  report.added.push({ where: page.name, field: 'notes', text: `${fresh.length} note(s)` });
}

// One course list for a page that kept a list per intake: each course once, under its level, and a course that runs in only
// one of the intakes says which ("(February 2027 intake only)"). The intakes keep their dates and notes, not a second list.
function unifyCourses(page) {
  const withCourses = (page.intakes || []).filter((i) => clean(i.courses).trim());
  if (withCourses.length < 2) return page;
  const LEVELS = [['Undergraduate', /undergrad|bachelor/i], ['Enhanced Extended Master\'s', /enhanced|extended master/i], ['Placement Year', /placement/i], ['Postgraduate', /master|postgrad|pg/i]];
  const levelOf = (heading) => (LEVELS.find(([, re]) => re.test(heading)) || ['Other'])[0];
  // The same course is worded differently in two lists ("Enhanced Extended MSc Cyber Security" and "MSc Cyber Security"), so
  // the level words, degree words and plurals are left out when comparing.
  const DROP = new Set(['enhanced', 'extended', 'master', 'masters', 'ma', 'msc', 'mba', 'mph', 'mres', 'llm', 'ba', 'bsc', 'beng', 'hons']);
  const same = (line) => courseKey(line).split(' ').filter((w) => !DROP.has(w)).map((w) => (w.length > 4 ? w.replace(/s$/, '') : w)).join(' ');
  const seen = new Map(); // course key -> { level, line, intakes }
  withCourses.forEach((intake) => {
    let level = 'Other';
    // A course name that wrapped onto the next line in the source ("... Tourism and Aviation / Management Enhanced Extended MSc ...").
    const lines = clean(intake.courses).split('\n').map((l) => l.trim()).filter(Boolean).reduce((out, l) => {
      const m = l.match(/^Management\s+(Enhanced Extended .+)$/);
      if (m && out.length) { out[out.length - 1] += ' Management'; out.push(m[1]); } else out.push(l);
      return out;
    }, []);
    lines.forEach((line) => {
      if (line.startsWith('##')) { level = levelOf(line); return; }
      const k = same(line) && level + '|' + same(line); // a course on two tracks (direct and with placement) is listed under each
      if (!k) return;
      const have = seen.get(k) || { level, line, intakes: new Set() };
      have.intakes.add(intake.name);
      seen.set(k, have);
    });
  });
  const order = [...LEVELS.map(([n]) => n), 'Other'];
  const blocks = order.map((level) => {
    const lines = [...seen.values()].filter((c) => c.level === level).map((c) => (c.intakes.size < withCourses.length ? `${c.line} (${[...c.intakes][0]} intake only)` : c.line));
    return lines.length ? `## ${level}\n${lines.join('\n')}` : '';
  }).filter(Boolean);
  page.courses = blocks.join('\n');
  withCourses.forEach((i) => { i.courses = ''; });
  return page;
}

// A course listed twice under the same heading, or in an intake and again in the page's own course list, is kept once. A course
// under two different stages (a continuation degree reached from Year Zero and from Year One) stays: it shows both routes.
function dedupeCourses(page) {
  const pageKeys = new Set();
  clean(page.courses).split('\n').forEach((l) => { const t = l.trim(); if (t && !t.startsWith('##')) pageKeys.add(courseKey(t)); });
  const tidy = (text, skipPage) => {
    const blocks = [];
    let current = null;
    const seen = new Map();
    clean(text).split('\n').forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      if (line.startsWith('##')) { current = { heading: line, lines: [] }; blocks.push(current); return; }
      if (!current) { current = { heading: '', lines: [] }; blocks.push(current); }
      const k = courseKey(line);
      const keys = seen.get(current.heading) || seen.set(current.heading, new Set()).get(current.heading);
      if (k && (keys.has(k) || (skipPage && pageKeys.has(k)))) return;
      if (k) keys.add(k);
      current.lines.push(line);
    });
    return blocks.filter((b) => b.lines.length).map((b) => (b.heading ? b.heading + '\n' : '') + b.lines.join('\n')).join('\n');
  };
  (page.intakes || []).forEach((i) => { if (i.courses) i.courses = tidy(i.courses, true); });
  if (page.courses && /\n## |^## /.test(page.courses)) page.courses = tidy(page.courses, false);
  return page;
}

const newReport = () => ({ added: [], addedPrograms: [], conflicts: [], skipped: [] });

// One university's new facts added to its page. `page` is changed in place; the report says what happened.
function mergeEntry(page, entry, report = newReport()) {
  mergePrograms(page, entry.programs || [], report);
  mergeKeyDates(page, entry.intakes, report);
  mergeCourses(page, entry.courses, report);
  mergeNotes(page, entry.notes, report);
  return report;
}

module.exports = { dedupeCourses, unifyCourses, mergeEntry, newReport, courseKey, numbersIn, levelKeys, mergeCourses, mergePrograms, mergeKeyDates, mergeNotes, lineKey, ensureIntake };

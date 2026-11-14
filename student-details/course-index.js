// Every course in the Fact File as one flat list, each with its university, level, intake, tuition fee and
// scholarship, so a counselor can find "cyber security" once and send the matching options to a student instead of
// opening each university's page. Built from the Fact File as it is (nothing is stored twice): the course lines of
// each university and of each of its intakes, matched to the fees table of the same page by course level.
//
// The Fact File holds no web address for a single course. A link typed once for a course (on a student's options)
// is remembered in course-links.json in the data folder and offered the next time; until then the university's own
// website is offered.

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('../shared/server-utils');
const { websiteOf } = require('./university-websites');

const Fields = require('./card-fields');
const text = (v) => String(v ?? '').trim();
const flat = (v) => text(v).split('\n').map((l) => l.replace(/^\s*(?:[-*•]\s+|##\s+)/, '').trim()).filter(Boolean);

// The study level a heading or a course name points to ('' when it cannot be told).
function levelOf(words) {
  const t = ` ${String(words || '').toLowerCase()} `;
  if (/\btop[- ]?up\b/.test(t)) return 'Top-up (final year)';
  if (/pre[- ]?masters?\b/.test(t)) return 'Pre-Masters';
  if (/international year (one|1)|\biy1\b|\biyo\b|with international year/.test(t)) return 'International Year 1';
  if (/\bfoundation\b|\bifp\b|pathway/.test(t)) return 'Foundation';
  if (/\bphd\b|\bmres\b|doctor|research degree|by research/.test(t)) return 'Masters by Research or PhD';
  if (/postgraduate|\bpg\b|\bmba\b/.test(t)) return 'Postgraduate'; // an MBA is postgraduate (the owner, 14 Nov 2026)
  if (/\bmasters?\b|\bmsc\b|\bma\b|\bllm\b|\bmeng\b|\bmph\b|\bpgdip\b|\bpgcert\b|\bmfa\b|\bmarch\b/.test(t)) return 'Postgraduate';
  if (/undergraduate|\bug\b|\bbachelors?\b|\bbsc\b|\bba\b|\bbeng\b|\bllb\b|\bbba\b|\bbn\b|\(hons\)/.test(t)) return 'Undergraduate';
  return '';
}

// A line of a course list that is a sentence about the list, not a course.
const isSentence = (line) => line.length > 150 || /^The (full )?course list/i.test(line) || (/[.]$/.test(line) && line.split(/\s+/).length > 9);

// The course lines of a text block: [{ course, group }] where group is the "## " heading the course sits under.
function parseCourses(block) {
  const out = [];
  let group = '';
  text(block).split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) { group = heading[1].trim(); return; }
    const course = line.replace(/^[-*•]\s+/, '').trim();
    if (!course || isSentence(course)) return;
    // A list of other universities (the ones whose degree is accepted without an English test), or of dates, is not a course list.
    if (/\bmoi\b/i.test(group) || /^\d{1,2} [A-Z][a-z]+ \d{4}$/.test(group)
      || (/^university name$|universit(y|ies)\b|\binstitute of\b|^note \d/i.test(course) && !levelOf(course))) return;
    out.push({ course, group });
  });
  return out;
}

// How well a row of the fees table suits a course: the row named after the course itself wins, then the row of the
// same level, with the plain row ("PG") ahead of its variants ("PG Placement Year") unless the course asks for one.
function programScore(program, course, group, level) {
  const name = text(program.name).toLowerCase();
  const c = `${course} ${group}`.toLowerCase();
  if (!name) return -1;
  if (name === text(course).toLowerCase()) return 100;
  const special = ['nursing', 'placement', 'extended', 'top-up', 'top up', 'foundation', 'pathway', 'mba', 'law', 'research'];
  let score = 0;
  const pLevel = levelOf(name);
  if (pLevel && level && pLevel === level) score += 40;
  else if (pLevel && level && pLevel !== level) return -1;
  special.forEach((w) => {
    const inProgram = name.includes(w);
    const inCourse = c.includes(w);
    if (inProgram && inCourse) score += 25;
    else if (inProgram && !inCourse) score -= 20;
  });
  // A distinctive word of the row's name that also appears in the course ("Business" in "BSc Business and Management").
  name.split(/[^a-z]+/).filter((w) => w.length > 4 && !['undergraduate', 'postgraduate', 'years', 'programme', 'program', 'course', 'courses'].includes(w))
    .forEach((w) => { if (c.includes(w)) score += 6; });
  return score;
}
function programFor(programs, course, group, level) {
  let best = null;
  let bestScore = 0;
  (programs || []).forEach((p) => {
    const s = programScore(p, course, group, level);
    if (s > bestScore) { best = p; bestScore = s; }
  });
  return best;
}

// The part of a fees (or scholarship) cell that is about one course. The cells are written by people, in many ways:
// "£17,250" then "MBA: £19,000"; "MSc AI and Data Science: £18,500" then "Other MSc Courses: £17,450"; a list for
// each campus under a heading. Each line is scored for how well it suits the course (its degree, the subject named
// in front of the colon), and the best line or lines are kept exactly as written. When nothing can be told apart,
// every line is kept, so the counselor sees all of it and nothing is guessed.
const DEGREES = ['imba', 'mba', 'msc', 'ma', 'llm', 'mres', 'meng', 'mph', 'march', 'mfa', 'pgdip', 'pgcert', 'bsc', 'ba', 'beng', 'llb', 'bba', 'bn', 'phd', 'hnd'];
const GENERIC = new Set(['other', 'others', 'course', 'courses', 'all', 'taught', 'year', 'years', 'masters', 'master', 'total', 'campus', 'for', 'the', 'and', 'with',
  'upto', 'from', 'starting', 'fee', 'fees', 'tuition', 'scholarship', 'scholarships', 'including', 'full', 'time', 'per', 'only', 'programme', 'programmes', 'program',
  'london', 'birmingham', 'manchester', 'outside', 'after', 'first', 'each', 'months', 'month', 'remaining', 'ranging', 'ranges', 'range', 'discount', 'early', 'bird',
  'payment', 'paid', 'above', 'below', 'gpa', 'net', 'undergraduate', 'postgraduate', 'bachelor', 'bachelors', 'everyone', 'merit', 'based', 'checked', 'november', 'one']);
const wordsOf = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
function pickLine(cell, course) {
  const lines = flat(cell);
  if (lines.length <= 1) return lines[0] || '';
  const courseWords = new Set(wordsOf(course));
  const degrees = DEGREES.filter((d) => courseWords.has(d));
  const isMba = courseWords.has('mba') || courseWords.has('imba');
  // A short line with no figure in it is a heading for the lines below it ("LONDON").
  let heading = '';
  const candidates = [];
  lines.forEach((line) => {
    if (!/\d/.test(line)) { if (line.length <= 48) heading = line.replace(/[:\s]+$/, ''); return; }
    candidates.push({ line, heading });
  });
  if (!candidates.length) return lines.join('; ').slice(0, 300);
  const score = (line) => {
    const w = wordsOf(line.replace(/[£$]?\d[\d,.]*/g, ' '));
    const mentionsMba = w.includes('mba') || w.includes('imba');
    let n = 0;
    if (isMba) n += mentionsMba ? 6 : 0;
    else if (mentionsMba) return -9; // a line about the MBA is not about another course
    if (degrees.some((d) => w.includes(d))) n += 3;
    const specific = w.filter((x) => x.length > 2 && !GENERIC.has(x) && !DEGREES.includes(x));
    const hits = specific.filter((x) => courseWords.has(x)).length;
    if (specific.length) n += hits === specific.length ? 5 : hits > 0 ? 2 : -4;
    if (w.includes('other') || w.includes('others')) n += 1;
    return n;
  };
  const scored = candidates.map((c) => ({ ...c, n: score(c.line) }));
  const best = Math.max(...scored.map((c) => c.n));
  const kept = best < 0 ? scored : scored.filter((c) => c.n === best);
  const headings = new Set(kept.map((c) => c.heading));
  const title = (h) => (h === h.toUpperCase() ? h.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : h); // "LONDON" reads better as "London"
  const tidy = (line) => line.replace(/[\s;,]+$/, ''); // a line that ends in ";" would read ";;" once joined
  return kept.map((c) => (headings.size > 1 && c.heading ? `${title(c.heading)}: ${tidy(c.line)}` : tidy(c.line))).join('; ').slice(0, 300);
}

const linkKey = (universityId, course) => `${universityId}|${text(course).toLowerCase()}`;

// Every course of the given universities (the Fact File's own records) as options.
function buildIndex(universities, links = {}) {
  const out = [];
  const seen = new Set();
  (universities || []).forEach((u) => {
    const add = (entry, intake) => {
      // An MBA is told apart from the other postgraduate courses (it often has a fee of its own).
      const level = levelOf(entry.group) || levelOf(entry.course);
      const key = `${u.id}|${entry.course.toLowerCase()}|${intake.toLowerCase()}|${entry.group.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      const program = programFor(u.programs, entry.course, entry.group, level);
      out.push({
        universityId: u.id, university: u.name, city: text(u.city), course: entry.course, group: entry.group, level, intake,
        closed: /\bclosed\b/i.test(entry.group),
        fee: program ? pickLine(program.tuition, entry.course) : '',
        scholarship: program ? pickLine(program.scholarship, entry.course) : '',
        deposit: program ? flat(program.deposit).join('; ') : '',
        academic: program ? flat(program.academic).join('; ') : '',
        english: program ? flat(program.english).join('; ') : '',
        programName: program ? program.name : '',
        link: links[linkKey(u.id, entry.course)] || websiteOf(u),
        linkIsCourse: Boolean(links[linkKey(u.id, entry.course)]),
      });
    };
    const general = parseCourses(u.courses);
    const intakes = (u.intakes || []).map((i) => ({ name: text(i.name), courses: parseCourses(i.courses) }));
    const allIntakeNames = intakes.map((i) => i.name).filter(Boolean).join(', ');
    intakes.forEach((i) => i.courses.forEach((entry) => add(entry, i.name)));
    // A course on the general list runs in every intake of the university, unless an intake has a course list of its own.
    general.forEach((entry) => add(entry, intakes.some((i) => i.courses.length) ? '' : allIntakeNames));
  });
  return out;
}

// The options matching every word typed (in the course, the university, the city or the heading), best first.
function searchCourses(index, { q = '', level = '', intake = '', universityId = '', limit = 60 } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const wantIntake = text(intake).toLowerCase();
  const hits = [];
  index.forEach((o) => {
    if (universityId && o.universityId !== universityId) return;
    const want = Fields.OLDER_STUDY_LEVELS[level] || level; // a card that still holds MBA looks for postgraduate courses
    if (want && o.level !== want) return;
    if (wantIntake && o.intake && !o.intake.toLowerCase().includes(wantIntake)) return;
    const courseText = o.course.toLowerCase();
    const rest = `${o.university} ${o.city} ${o.group}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (courseText.includes(w)) score += 3;
      else if (rest.includes(w)) score += 1;
      else return;
    }
    hits.push({ o, score: score - (o.closed ? 5 : 0) });
  });
  hits.sort((a, b) => b.score - a.score || a.o.university.localeCompare(b.o.university) || a.o.course.localeCompare(b.o.course));
  return { total: hits.length, options: hits.slice(0, limit).map((h) => h.o) };
}

// The links typed for single courses, remembered for the next student.
// Course pages checked by hand on the university's own website (public pages, nothing private). They show in the Fact File for every
// installation that has the university and the course, until someone looks a link up with "Find the course page" (that one is kept).
const STARTING_LINKS = [
  // Checked on 14 Nov 2026 on arden.ac.uk, Arden University's own site: the page names this course and lists a January 2027 intake.
  { university: 'Arden University', course: 'BA (Hons) Business Management (Top-Up)', link: 'https://arden.ac.uk/our-courses/undergraduate/business-degree/ba-hons-business-management-top-up' },
];

function createCourseLinks(dir) {
  const file = path.join(dir, 'course-links.json');
  let cache = null;
  const NONE = Object.freeze({}); // the same empty list every time, so the merged links below are worked out once
  function load() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return NONE; }
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) { cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }; return data; }
    } catch (e) { /* unreadable: start again */ }
    return NONE;
  }
  // The links kept, with the starting links added for the universities given (worked out once per version of either).
  let merged = { data: null, universities: null, out: {} };
  function all(universities) {
    const data = load();
    if (!Array.isArray(universities)) return data;
    if (merged.data === data && merged.universities === universities) return merged.out;
    const out = { ...data };
    STARTING_LINKS.forEach((s) => universities.filter((u) => u && text(u.name).toLowerCase() === s.university.toLowerCase()).forEach((u) => {
      const key = linkKey(u.id, s.course);
      if (!out[key]) out[key] = s.link;
    }));
    merged = { data, universities, out };
    return out;
  }
  return {
    all,
    remember(universityId, course, link) {
      if (!/^[a-f0-9]{12}$/.test(String(universityId || '')) || !text(course) || !/^https?:\/\/[^\s<>"']+$/i.test(text(link))) return false;
      const data = load();
      const key = linkKey(universityId, course);
      if (data[key] === text(link) || Object.keys(data).length >= 20000) return false;
      const next = { ...data, [key]: text(link).slice(0, 500) };
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileAtomic(file, JSON.stringify(next, null, 1));
      const stat = fs.statSync(file);
      cache = { mtimeMs: stat.mtimeMs, size: stat.size, data: next };
      return true;
    },
  };
}

module.exports = { buildIndex, searchCourses, parseCourses, levelOf, programFor, pickLine, createCourseLinks, linkKey };

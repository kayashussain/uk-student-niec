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

const text = (v) => String(v ?? '').trim();
const flat = (v) => text(v).split('\n').map((l) => l.replace(/^\s*(?:[-*•]\s+|##\s+)/, '').trim()).filter(Boolean);

// The study level a heading or a course name points to ('' when it cannot be told).
function levelOf(words) {
  const t = ` ${String(words || '').toLowerCase()} `;
  if (/\btop[- ]?up\b/.test(t)) return 'Top-up (final year)';
  if (/pre[- ]?masters?\b/.test(t)) return 'Pre-Masters';
  if (/\bfoundation\b|international year one|\biyo\b|\bifp\b|pathway/.test(t)) return 'Foundation';
  if (/\bphd\b|\bmres\b|doctor|research degree/.test(t)) return 'MRes or PhD';
  if (/postgraduate|\bpg\b/.test(t)) return 'Postgraduate'; // "Postgraduate (MBA, MSc, LLM)" is the postgraduate row, not the MBA's own
  if (/\bmba\b/.test(t)) return 'MBA';
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
  else if (pLevel === 'Postgraduate' && level === 'MBA') score += 30; // an MBA is priced in the postgraduate row unless it has its own
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
      const level = levelOf(entry.course) === 'MBA' ? 'MBA' : (levelOf(entry.group) || levelOf(entry.course));
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
    if (level && o.level !== level && !(level === 'Postgraduate' && o.level === 'MBA')) return;
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
function createCourseLinks(dir) {
  const file = path.join(dir, 'course-links.json');
  let cache = null;
  function load() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return {}; }
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) { cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }; return data; }
    } catch (e) { /* unreadable: start again */ }
    return {};
  }
  return {
    all: load,
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

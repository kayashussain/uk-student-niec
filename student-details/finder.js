// The Fact File assistant: a counselor describes a student and what they want, even an unusual case, and it answers with
// the options NIEC can offer (university, course, link, fee, scholarship), the ones the student is not eligible for and
// why, and what it understood. It reads the entry rules in the Fact File itself (eligibility.js) and runs on NIEC's own
// server: there is no outside service and no key, and nothing about the student leaves the system.

const { searchCourses } = require('./course-index');
const E = require('./eligibility');

const text = (v) => String(v ?? '').trim();

// The lowest pound figure of 1,000 or more in a fee cell ("£17,250", "From £18,792 - £19,854"), or null.
function feeFloor(fee) {
  const amounts = (String(fee || '').match(/£\s?\d[\d,]*/g) || []).map((m) => Number(m.replace(/[^\d]/g, ''))).filter((n) => n >= 1000 && n < 100000);
  return amounts.length ? Math.min(...amounts) : null;
}
// The largest scholarship figure named in a scholarship cell, for ordering (0 when none).
function scholarshipValue(s) {
  const amounts = (String(s || '').match(/£\s?\d[\d,]*/g) || []).map((m) => Number(m.replace(/[^\d]/g, '')));
  return amounts.length ? Math.max(...amounts) : 0;
}

// The cities the Fact File knows, as lower-case words, so "in London" is understood as a city and not as a subject.
function cityWords(index) {
  const set = new Set();
  index.forEach((o) => String(o.city || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !['university', 'campus'].includes(w)).forEach((w) => set.add(w)));
  return set;
}

function readAsk(body, card, index) {
  const profile = (card && card.profile) || {};
  const grade = E.readGrade(body.grade || profile.grade);
  const test = text(body.englishTest || profile.englishTest);
  const score = Number(String(body.englishScore || profile.englishScore || '').replace(/[^\d.]/g, '')) || null;
  const known = {
    gpa: grade.gpa ?? null, percent: grade.percent ?? null,
    ielts: /ielts/i.test(test) && score ? score : null, pte: /pte/i.test(test) && score ? score : null,
    noEnglish: /waiver|moi/i.test(test),
    level: text(body.level || profile.studyLevel), intake: text(body.intake || profile.preferredIntake),
    budget: Number(String(body.budget || profile.budget || '').replace(/[^\d.]/g, '')) || 0,
    passedYear: Number(profile.passedYear) || null, city: text(body.city),
  };
  const request = text(body.request).slice(0, 1500);
  const student = E.readStudent(request, known);
  const cities = cityWords(index);
  const lower = ` ${request.toLowerCase()} `;
  if (!student.city) student.city = [...cities].find((c) => lower.includes(` ${c} `)) || '';
  student.subject = text(body.subject) || E.subjectOf(request, cities) || text(profile.courseInterest);
  return { request, student };
}

// Courses worth judging for what was asked: by subject, level, intake and city. When nothing matches, the city and then the
// level and intake are let go (and `relaxed` says so), so the answer is never empty only because of one detail.
function candidates(index, student) {
  const relaxed = [];
  const search = (level, intake) => {
    const base = { level, intake, limit: 5000 };
    let found = student.subject ? searchCourses(index, { ...base, q: student.subject }).options : [];
    if (!found.length && student.subject) {
      const score = new Map();
      student.subject.split(' ').forEach((w) => searchCourses(index, { ...base, q: w }).options.forEach((o) => score.set(o, (score.get(o) || 0) + 1)));
      found = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([o]) => o);
    }
    if (!found.length && !student.subject) found = searchCourses(index, base).options;
    return found;
  };
  let found = search(student.level, student.intake);
  const inCity = (list) => list.filter((o) => `${o.city} ${o.group} ${o.course}`.toLowerCase().includes(student.city));
  if (student.city) {
    const local = inCity(found);
    if (local.length) found = local; else if (found.length) relaxed.push(`none in ${student.city.replace(/^./, (c) => c.toUpperCase())}, so courses elsewhere are shown`);
  }
  if (!found.length && (student.level || student.intake)) {
    found = search('', '');
    if (found.length) relaxed.push('no course of that level and intake, so other levels and intakes are shown');
    if (student.city) { const local = inCity(found); if (local.length) found = local; }
  }
  return { found: found.slice(0, 700), relaxed };
}

const shape = (o, j, withinBudget) => ({
  universityId: o.universityId, university: o.university, city: o.city, course: o.course, level: o.level, intake: o.intake,
  fee: o.fee, scholarship: o.scholarship, link: o.link, linkIsCourse: o.linkIsCourse, deposit: o.deposit, closed: o.closed, withinBudget,
  fit: E.fitOf(j), why: [...j.fails, ...j.passes].join('; ').replace(/^./, (c) => c.toUpperCase()) + (j.fails.length || j.passes.length ? '.' : ''),
  check: j.missing.length ? `Add ${j.missing.join(' and ')} to be sure.` : '',
});

function createFinder() {
  return async function find({ body, index, card }) {
    const { request, student } = readAsk(body || {}, card, index);
    if (!request && !student.subject && !student.level && student.gpa == null && student.percent == null) return { error: 'Describe the student: the grade, the English score, the gap, and what they want to study.' };
    const { found, relaxed } = candidates(index, student);
    const ok = [];
    const no = [];
    found.forEach((o) => {
      const j = E.judge(student, o);
      const floor = feeFloor(o.fee);
      const within = student.budget && floor !== null ? floor <= student.budget : null;
      (j.status === 'not' ? no : ok).push({ o, j, within, rank: (j.status === 'likely' ? 1000 : j.status === 'unstated' ? 3000 : 0) + (within === false ? 400 : 0) + (o.closed ? 200 : 0) + (o.fee ? 0 : 20) - Math.min(scholarshipValue(o.scholarship) / 500, 15) });
    });
    ok.sort((a, b) => a.rank - b.rank);
    // A spread of universities: at most two courses of one university in the answer.
    const perUni = new Map();
    const results = [];
    for (const r of ok) {
      const n = perUni.get(r.o.universityId) || 0;
      if (n >= 2) continue;
      perUni.set(r.o.universityId, n + 1);
      results.push(shape(r.o, r.j, r.within));
      if (results.length >= 15) break;
    }
    const reasonCount = { grade: 0, gap: 0, English: 0, refusal: 0, other: 0 };
    no.forEach((r) => r.j.fails.forEach((f) => { const k = /grade/.test(f) ? 'grade' : /gap|passed in/.test(f) ? 'gap' : /IELTS|PTE|English/.test(f) ? 'English' : /refusal/.test(f) ? 'refusal' : 'other'; reasonCount[k] += 1; }));
    const unis = (list) => new Set(list.map((r) => r.o.universityId)).size;
    const parts = [];
    if (relaxed.length) parts.push(`Note: ${relaxed.join('; ')}.`);
    const count = (k) => ok.filter((r) => r.j.status === k).length;
    parts.push(results.length ? `${ok.length} course${ok.length === 1 ? '' : 's'} at ${unis(ok)} universit${unis(ok) === 1 ? 'y' : 'ies'} can be offered (${count('eligible')} eligible, ${count('likely')} likely${count('unstated') ? `, ${count('unstated')} with no entry rules in the Fact File` : ''}).` : 'No course in the Fact File can be offered with these details.');
    if (no.length) {
      const top = Object.entries(reasonCount).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k} (${n})`);
      parts.push(`${no.length} other course${no.length === 1 ? ' is' : 's are'} ruled out${top.length ? `, mostly by ${top.join(' and ')}` : ''}.`);
    }
    let advice = '';
    if (!results.length && no.length) {
      const best = [...no].sort((a, b) => a.j.fails.length - b.j.fails.length)[0];
      advice = `The closest is ${best.o.course} at ${best.o.university}, which is out only because ${best.j.fails.join(' and ')}.`;
    }
    return {
      ask: { request }, understood: E.understood(student), summary: parts.join(' '), advice,
      results, notEligible: no.sort((a, b) => a.j.fails.length - b.j.fails.length).slice(0, 8).map((r) => shape(r.o, r.j, r.within)),
      considered: found.length,
    };
  };
}

module.exports = { createFinder, feeFloor, readAsk, candidates };

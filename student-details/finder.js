// The Fact File assistant: describe a student and what they want, even an unusual case, and it answers with the options NIEC can offer
// (university, course, link, fee, scholarship, and the minimum cash deposit when asked), the ones the student is not eligible for and
// why, and what it understood. It reads the entry rules in the Fact File itself (eligibility.js) and the map of the UK (places.js),
// so "near Manchester" or "in Scotland" means the universities there. It runs inside NIEC's own server: no outside service and no
// key, and nothing about the student leaves the system.
//
// The boxes (level, grades, English, budget, where, subject) and the remarks are read together: whatever the remarks say that the boxes
// do not ("5 universities", "minimum cash deposit and full tuition fee", "near Manchester") is understood as well.

const { searchCourses } = require('./course-index');
const E = require('./eligibility');
const P = require('./places');

const text = (v) => String(v ?? '').trim();

// The lowest pound figure of 1,000 or more in a fee cell ("£17,250", "From £18,792 - £19,854"), or null.
function feeFloor(fee) {
  const amounts = (String(fee || '').match(/£\s?\d[\d,]*/g) || []).map((m) => Number(m.replace(/[^\d]/g, ''))).filter((n) => n >= 1000 && n < 100000);
  return amounts.length ? Math.min(...amounts) : null;
}
const scholarshipValue = (s) => { const a = (String(s || '').match(/£\s?\d[\d,]*/g) || []).map((m) => Number(m.replace(/[^\d]/g, ''))); return a.length ? Math.max(...a) : 0; };
const wholeNumber = (v) => { const n = Number(String(v ?? '').replace(/[^\d]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };

// What the counselor asked: the boxes and the remarks as one description of the student, and what the answer should show.
function readAsk(body, card) {
  const profile = (card && card.profile) || {};
  const pick = (k) => text(body[k]) || text(profile[k]);
  const grade = E.readGrade(pick('grade'));
  const test = pick('englishTest');
  const score = Number(String(pick('englishScore')).replace(/[^\d.]/g, '')) || null;
  const known = {
    gpa: grade.gpa ?? null, percent: grade.percent ?? null,
    ielts: /ielts/i.test(test) && score ? score : null, pte: /pte/i.test(test) && score ? score : null,
    noEnglish: /waiver|moi/i.test(test),
    level: pick('studyLevel') || text(body.level), intake: text(body.intake),
    budget: Number(String(pick('budget')).replace(/[^\d.]/g, '')) || 0,
    passedYear: wholeNumber(pick('passedYear')), gapYears: null,
  };
  const request = text(body.request || body.remarks).slice(0, 1500);
  const student = E.readStudent(request, known);
  // The study gap is worked out from the year the student passed (a gap written in the remarks wins).
  if (student.gapYears == null && student.passedYear) student.gapYears = Math.max(0, new Date().getFullYear() - student.passedYear);
  const place = text(body.location) || text(profile.location);
  const where = P.readWhere(`${place} ${request}`);
  const lower = request.toLowerCase();
  const count = wholeNumber(body.count) || (/(\d{1,2})\s*(?:different\s*)?(?:universit|option|choice)/.exec(lower) || [])[1] && Number(/(\d{1,2})\s*(?:different\s*)?(?:universit|option|choice)/.exec(lower)[1]) || null;
  const show = {
    deposit: /\bdeposit\b|\bcash\b|\bcas\b/.test(lower) || body.showDeposit === true,
    fullFee: /full\s*(?:tuition\s*)?(?:fee|payment)|total\s*(?:tuition\s*)?fee|tuition\s*fee/.test(lower) || body.showFullFee === true,
  };
  student.subject = text(body.subject) || text(profile.subject) || E.subjectOf(request, new Set(Object.keys(P.PLACES)));
  return { request, student, where, count: count && count <= 30 ? count : null, show };
}

// Courses worth judging: by subject, level and intake. Then by place when one was asked for; when no course is there, the place is let go
// and `relaxed` says so, so the answer is never empty only because of one detail.
function candidates(index, ask) {
  const { student, where } = ask;
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
  if (!found.length && (student.level || student.intake)) {
    found = search('', '');
    if (found.length) relaxed.push('no course of that level and intake, so other levels and intakes are shown');
  }
  let unknownPlace = 0;
  if (where) {
    const verdict = (o) => P.fits(where, P.locate(o.city, o.group, o.course));
    const near = found.filter((o) => verdict(o) === 'yes');
    unknownPlace = found.filter((o) => verdict(o) === 'unknown').length;
    if (near.length) found = near;
    else if (found.length) relaxed.push(`no course near ${where.label}, so courses elsewhere are shown`);
  }
  return { found: found.slice(0, 900), relaxed, unknownPlace };
}

const placeOf = (o) => { const l = P.locate(o.city, o.group, o.course); return l && l.name ? l.name.replace(/^./, (c) => c.toUpperCase()) : (o.city || ''); };
function shape(o, j, within, show) {
  return {
    universityId: o.universityId, university: o.university, city: o.city, place: placeOf(o), course: o.course, level: o.level, intake: o.intake,
    fee: o.fee, scholarship: o.scholarship, deposit: o.deposit || '', link: o.link, linkIsCourse: o.linkIsCourse, closed: o.closed, withinBudget: within,
    fit: E.fitOf(j), why: [...j.fails, ...j.passes].join('; ').replace(/^./, (c) => c.toUpperCase()) + (j.fails.length || j.passes.length ? '.' : ''),
    check: j.missing.length ? `Add ${j.missing.join(' and ')} to be sure.` : '',
    showDeposit: show.deposit, showFullFee: show.fullFee,
  };
}

function createFinder() {
  return async function find({ body, index, card }) {
    const ask = readAsk(body || {}, card);
    const { student, where, count, show } = ask;
    if (!ask.request && !student.subject && !student.level && student.gpa == null && student.percent == null && !where) return { error: 'Describe the student: the grade, the English score, the study gap, where in the UK and what they want to study.' };
    const { found, relaxed, unknownPlace } = candidates(index, ask);
    const ok = [];
    const no = [];
    found.forEach((o) => {
      const j = E.judge(student, o);
      const floor = feeFloor(o.fee);
      const within = student.budget && floor !== null ? floor <= student.budget : null;
      (j.status === 'not' ? no : ok).push({ o, j, within, rank: (j.status === 'likely' ? 1000 : j.status === 'unstated' ? 3000 : 0) + (within === false ? 400 : 0) + (o.closed ? 200 : 0) + (o.fee ? 0 : 20) - Math.min(scholarshipValue(o.scholarship) / 500, 15) });
    });
    ok.sort((a, b) => a.rank - b.rank);
    // A spread of universities: one course each when a number of universities was asked for, otherwise at most two.
    const cap = count ? 1 : 2;
    const limit = count || 15;
    const perUni = new Map();
    const results = [];
    for (const r of ok) {
      const n = perUni.get(r.o.universityId) || 0;
      if (n >= cap) continue;
      perUni.set(r.o.universityId, n + 1);
      results.push(shape(r.o, r.j, r.within, show));
      if (results.length >= limit) break;
    }
    const reasonCount = { grade: 0, gap: 0, English: 0, refusal: 0, other: 0 };
    no.forEach((r) => r.j.fails.forEach((f) => { const k = /grade/.test(f) ? 'grade' : /gap|passed in/.test(f) ? 'gap' : /IELTS|PTE|English/.test(f) ? 'English' : /refusal/.test(f) ? 'refusal' : 'other'; reasonCount[k] += 1; }));
    const unis = (list) => new Set(list.map((r) => r.o.universityId)).size;
    const count1 = (k) => ok.filter((r) => r.j.status === k).length;
    const parts = [];
    if (relaxed.length) parts.push(`Note: ${relaxed.join('; ')}.`);
    parts.push(results.length ? `${ok.length} course${ok.length === 1 ? '' : 's'} at ${unis(ok)} universit${unis(ok) === 1 ? 'y' : 'ies'} can be offered (${count1('eligible')} eligible, ${count1('likely')} likely${count1('unstated') ? `, ${count1('unstated')} with no entry rules in the Fact File` : ''}).${count ? ` The best ${results.length} universit${results.length === 1 ? 'y is' : 'ies are'} shown, one course each.` : ''}` : 'No course in the Fact File can be offered with these details.');
    if (count && results.length < count && results.length) parts.push(`Only ${results.length} of the ${count} universities asked for fit.`);
    if (no.length) {
      const top = Object.entries(reasonCount).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k} (${n})`);
      parts.push(`${no.length} other course${no.length === 1 ? ' is' : 's are'} ruled out${top.length ? `, mostly by ${top.join(' and ')}` : ''}.`);
    }
    if (where && unknownPlace) parts.push(`${unknownPlace} course${unknownPlace === 1 ? ' has' : 's have'} no known campus city in the Fact File, so they were left out of the place search.`);
    let advice = '';
    if (!results.length && no.length) {
      const best = [...no].sort((a, b) => a.j.fails.length - b.j.fails.length)[0];
      advice = `The closest is ${best.o.course} at ${best.o.university}, which is out only because ${best.j.fails.join(' and ')}.`;
    }
    const understood = E.understood(student);
    if (where) understood.push(`Where: ${where.label}`);
    if (count) understood.push(`${count} universities`);
    if (show.deposit) understood.push('minimum cash deposit');
    if (show.fullFee) understood.push('full tuition fee');
    return {
      ask: { request: ask.request }, understood, summary: parts.join(' '), advice, show,
      results, notEligible: no.sort((a, b) => a.j.fails.length - b.j.fails.length).slice(0, 8).map((r) => shape(r.o, r.j, r.within, show)),
      considered: found.length,
    };
  };
}

module.exports = { createFinder, feeFloor, readAsk, candidates };

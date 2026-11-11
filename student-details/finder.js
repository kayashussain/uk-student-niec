// The option finder in the Fact File: a counselor describes what a student wants (also an unusual request: a low
// grade, a long study gap, no English test, a small budget, one city) and gets back the options NIEC can offer, each
// with the university, the course, the link, the fee and the scholarship, so nobody has to open every page of the
// Fact File.
//
// Two ways of answering, with the same result shape:
//   - Built in (always works): finds the courses by subject, level, intake, city and budget, and shows the entry
//     requirement next to each one for the counselor to check.
//   - With the AI helper switched on (ai.js): Claude reads the entry requirements of every university in the Fact
//     File against the student and says for each option whether the student is eligible, likely eligible or needs
//     checking, and why. It may only choose from the courses the Fact File holds: the fee, the scholarship and the
//     link always come from the Fact File itself, never from the AI.
//
// A student's name or contact details are never part of what is sent: only the study details and the request.

const { searchCourses } = require('./course-index');

const text = (v) => String(v ?? '').trim();
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'without', 'at', 'by', 'is', 'are', 'has', 'have', 'who', 'that', 'wants', 'want', 'wanted',
  'student', 'students', 'university', 'universities', 'course', 'courses', 'option', 'options', 'any', 'some', 'like', 'looking', 'needs', 'need', 'no', 'not', 'under', 'below',
  'less', 'than', 'low', 'fee', 'fees', 'budget', 'gap', 'year', 'years', 'ielts', 'pte', 'gpa', 'percent', 'intake', 'uk', 'study', 'from', 'only', 'but', 'can', 'we', 'offer',
  'accepts', 'accept', 'accepted', 'which', 'what', 'do', 'does', 'eligible', 'scholarship', 'scholarships', 'cheap', 'cheapest', 'best', 'good', 'he', 'she', 'they', 'his', 'her',
  'ug', 'pg', 'undergraduate', 'postgraduate', 'masters', 'master', 'bachelor', 'bachelors', 'degree', 'jan', 'january', 'sep', 'september', 'may', 'pounds', 'gbp', 'london']);

// The lowest pound figure of 1,000 or more in a fee cell ("£17,250", "From £18,792 - £19,854"), or null.
function feeFloor(fee) {
  const amounts = (String(fee || '').match(/£\s?\d[\d,]*/g) || []).map((m) => Number(m.replace(/[^\d]/g, ''))).filter((n) => n >= 1000 && n < 100000);
  return amounts.length ? Math.min(...amounts) : null;
}
// The subject words of a free request: what is left once the small words and the figures are taken out.
function subjectWords(request) {
  return [...new Set(String(request || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 6);
}

const candidateId = (o, i) => `c${i}`;

// The courses worth looking at for a request, best first. `wide`: how many to keep.
function candidates(index, ask, wide = 150) {
  const base = { level: ask.level, intake: ask.intake, limit: 5000 };
  let found = ask.subject ? searchCourses(index, { ...base, q: ask.subject }).options : [];
  if (!found.length) {
    // No course holds every word typed: take the ones that hold any of them, the more the better.
    const words = subjectWords(ask.subject || ask.request);
    const score = new Map();
    words.forEach((w) => searchCourses(index, { ...base, q: w }).options.forEach((o) => score.set(o, (score.get(o) || 0) + 1)));
    found = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([o]) => o);
    if (!found.length && !words.length) found = searchCourses(index, base).options; // no subject at all: every course of the level
  }
  const city = text(ask.city).toLowerCase();
  if (city) found = found.filter((o) => `${o.city} ${o.group} ${o.course}`.toLowerCase().includes(city));
  const budget = Number(ask.budget) > 0 ? Number(ask.budget) : null;
  const ranked = found.map((o, order) => {
    const floor = feeFloor(o.fee);
    const within = budget === null || floor === null ? null : floor <= budget;
    return { o, order, floor, within, rank: (within === false ? 1000 : 0) + (o.closed ? 500 : 0) + (o.fee ? 0 : 50) + order };
  }).sort((a, b) => a.rank - b.rank);
  // No more than a few courses of one university, so the list shows a spread of choices.
  const perUniversity = new Map();
  const kept = [];
  for (const r of ranked) {
    const n = perUniversity.get(r.o.universityId) || 0;
    if (n >= Math.max(3, Math.ceil(wide / 12))) continue;
    perUniversity.set(r.o.universityId, n + 1);
    kept.push(r);
    if (kept.length >= wide) break;
  }
  return kept;
}

const resultOf = (r, extra = {}) => ({
  universityId: r.o.universityId, university: r.o.university, city: r.o.city, course: r.o.course, level: r.o.level, intake: r.o.intake,
  fee: r.o.fee, scholarship: r.o.scholarship, link: r.o.link, linkIsCourse: r.o.linkIsCourse, deposit: r.o.deposit,
  academic: r.o.academic, english: r.o.english, closed: r.o.closed, withinBudget: r.within, ...extra,
});

// The built-in answer: the best matching courses, each with its entry requirement to check.
function builtIn(index, ask) {
  const kept = candidates(index, ask, 150);
  const perUniversity = new Map();
  const results = [];
  for (const r of kept) {
    const n = perUniversity.get(r.o.universityId) || 0;
    if (n >= 2) continue;
    perUniversity.set(r.o.universityId, n + 1);
    const check = [r.o.academic && `Entry: ${r.o.academic}`, r.o.english && `English: ${r.o.english}`].filter(Boolean).join(' | ').slice(0, 600);
    results.push(resultOf(r, {
      fit: 'Needs checking',
      why: [r.within === true ? 'Within the budget.' : '', r.within === false ? 'Above the budget.' : '', r.o.closed ? 'The Fact File marks this intake as closed.' : ''].filter(Boolean).join(' '),
      check: check || 'The Fact File has no entry requirement for this level. Open the university page.',
    }));
    if (results.length >= 15) break;
  }
  return { results, considered: kept.length };
}

// The facts of every university that an eligibility decision rests on (not the course lists), as plain text.
function factsDigest(universities) {
  const flat = (v, max = 900) => text(v).replace(/\s*\n\s*/g, '; ').slice(0, max);
  return [...universities].sort((a, b) => a.name.localeCompare(b.name)).map((u) => {
    const lines = [`### ${u.name}${u.city ? ` (${u.city})` : ''} [${u.id}]`];
    (u.programs || []).forEach((p) => {
      lines.push(`- Level "${p.name}"${p.duration ? `, ${flat(p.duration, 80)}` : ''}`);
      [['Academic', p.academic], ['English', p.english], ['Tuition', p.tuition], ['Scholarship', p.scholarship], ['Deposit', p.deposit]].forEach(([k, v]) => { if (text(v)) lines.push(`  ${k}: ${flat(v)}`); });
    });
    if (text(u.entryRequirements)) lines.push(`- Entry requirements: ${flat(u.entryRequirements, 1200)}`);
    if (text(u.languageTests)) lines.push(`- Language tests: ${flat(u.languageTests, 900)}`);
    if (text(u.interview)) lines.push(`- Interview: ${flat(u.interview, 500)}`);
    if (text(u.notes)) lines.push(`- Notes: ${flat(u.notes, 900)}`);
    (u.intakes || []).forEach((i) => lines.push(`- Intake ${i.name}${text(i.deadline) ? `, apply by ${flat(i.deadline, 80)}` : ''}${text(i.requirements) ? `. Requirements: ${flat(i.requirements, 700)}` : ''}${text(i.notes) ? `. Notes: ${flat(i.notes, 500)}` : ''}`));
    return lines.join('\n');
  }).join('\n\n');
}

const INSTRUCTIONS = [
  'You help the counselors of Nepal International Educational Consultancy (NIEC), an education consultancy in Nepal that places students in UK universities.',
  'A counselor describes a student and what the student wants. Your job is to say which of the candidate courses NIEC can offer this student, and how sure that is.',
  '',
  'Rules:',
  '- Use only the facts given below (the Fact File) and the candidate list in the question. Never add a university, a course, a fee, a scholarship or a rule from your own knowledge.',
  '- Choose only from the candidate list, by its id. Pick the best 3 to 10; fewer when few fit. If nothing fits, return no options and say in nothing_fits what blocks it and what would make it possible (for example a higher English score, another level, a pathway course).',
  '- Judge eligibility from the entry requirements of that university and level: the grade or percentage, the study gap, the English test and any waiver or MOI rule, earlier visa refusals, the deposit. Nepali grades: a GPA is out of 4.0; where a university states both a GPA and a percentage, either one is enough.',
  '- fit is "Eligible" only when the facts clearly allow this student; "Likely eligible" when they nearly do or one detail of the student is unknown; "Needs checking" when the Fact File does not say or the case is unusual.',
  '- why: one or two short sentences a counselor can repeat to the student, naming the rule that decides it. check: what the counselor must confirm with the university or the student before applying, or an empty text.',
  '- Prefer options within the budget, with a real scholarship, in the intake asked for, and not marked closed.',
  '- Plain English, short sentences. No dashes used as punctuation.',
].join('\n');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'options', 'nothing_fits'],
  properties: {
    summary: { type: 'string', description: 'Two or three sentences for the counselor: what can be offered and the main thing to watch.' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'fit', 'why', 'check'],
        properties: {
          id: { type: 'string', description: 'The id of the candidate, exactly as given (for example c12).' },
          fit: { type: 'string', enum: ['Eligible', 'Likely eligible', 'Needs checking'] },
          why: { type: 'string' },
          check: { type: 'string' },
        },
      },
    },
    nothing_fits: { type: 'string', description: 'Empty when there are options. Otherwise what blocks it and what would make it possible.' },
  },
};

// What the counselor asked, with the gaps filled from the student card (study details only).
function readAsk(body, card) {
  const p = (card && card.profile) || {};
  const pick = (k, fallback = '') => text(body[k]) || text(fallback);
  return {
    request: text(body.request).slice(0, 1500),
    subject: pick('subject', p.courseInterest).slice(0, 120),
    level: pick('level', p.studyLevel),
    intake: pick('intake').slice(0, 60),
    city: pick('city').slice(0, 60),
    budget: Number(String(body.budget ?? p.budget ?? '').replace(/[^\d.]/g, '')) || 0,
    qualification: pick('qualification', p.qualification).slice(0, 80),
    grade: pick('grade', p.grade).slice(0, 60),
    passedYear: pick('passedYear', p.passedYear).slice(0, 10),
    englishTest: pick('englishTest', p.englishTest).slice(0, 60),
    englishScore: pick('englishScore', p.englishScore).slice(0, 60),
  };
}

function createFinder({ ai }) {
  // { ai: false, results, considered, notice } or, with the AI helper, { ai: true, summary, results, nothingFits, model }.
  return async function find({ body, index, universities, card }) {
    const ask = readAsk(body || {}, card);
    if (!ask.request && !ask.subject && !ask.level) return { error: 'Say what the student wants: a subject, a level, or the request in your own words.' };
    const basic = builtIn(index, ask);
    const state = ai.status();
    if (!state.ready || body.useAi === false) {
      return { ai: false, ask, ...basic, notice: body.useAi === false ? '' : ai.offMessage() };
    }
    const kept = candidates(index, ask, 150);
    if (!kept.length) return { ai: false, ask, ...basic, notice: 'No course in the Fact File matches those words, so there was nothing for the AI to judge. Try a broader subject.' };
    const list = kept.map((r, i) => `${candidateId(r.o, i)} | ${r.o.university} [${r.o.universityId}] | ${r.o.course} | level: ${r.o.level || 'not stated'} | intake: ${r.o.intake || 'not stated'}${r.o.closed ? ' (closed)' : ''} | fee: ${r.o.fee || 'not stated'} | scholarship: ${r.o.scholarship || 'not stated'}`);
    const student = [
      ['Level wanted', ask.level], ['Subject wanted', ask.subject], ['Intake wanted', ask.intake], ['City wanted', ask.city], ['Budget for the first year (GBP)', ask.budget || ''],
      ['Highest qualification', ask.qualification], ['Grade', ask.grade], ['Year passed', ask.passedYear], ['English test', ask.englishTest], ['English score', ask.englishScore],
    ].filter(([, v]) => text(v)).map(([k, v]) => `${k}: ${v}`);
    const user = [
      'THE STUDENT', student.length ? student.join('\n') : '(no study details recorded)', '',
      "THE COUNSELOR'S REQUEST", ask.request || '(none: suggest the best options for the details above)', '',
      'CANDIDATE COURSES (id | university [university id] | course | level | intake | fee | scholarship)', ...list,
    ].join('\n');
    try {
      const answer = await ai.askJson({
        system: [{ text: INSTRUCTIONS }, { text: `THE FACT FILE (entry requirements, fees and rules of each university NIEC works with)\n\n${factsDigest(universities)}`, cache: true }],
        user, schema: SCHEMA, effort: 'high',
      });
      const byId = new Map(kept.map((r, i) => [candidateId(r.o, i), r]));
      const seen = new Set();
      const results = (Array.isArray(answer.data.options) ? answer.data.options : []).map((o) => {
        const r = byId.get(text(o.id));
        if (!r || seen.has(o.id)) return null; // an id the AI made up, or one given twice, is left out
        seen.add(o.id);
        const fit = ['Eligible', 'Likely eligible', 'Needs checking'].includes(o.fit) ? o.fit : 'Needs checking';
        return resultOf(r, { fit, why: text(o.why).slice(0, 600), check: text(o.check).slice(0, 600) });
      }).filter(Boolean).slice(0, 12);
      return { ai: true, ask, model: answer.model, summary: text(answer.data.summary).slice(0, 1200), nothingFits: text(answer.data.nothing_fits).slice(0, 1200), results, considered: kept.length };
    } catch (e) {
      // The AI could not answer: the built-in answer is given instead, with the reason.
      return { ai: false, ask, ...basic, notice: `${e.message} The list below is the built-in match instead.` };
    }
  };
}

module.exports = { createFinder, builtIn, candidates, factsDigest, feeFloor, subjectWords, readAsk, SCHEMA };

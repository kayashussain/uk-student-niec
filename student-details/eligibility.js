// Reads a counselor's description of a student ("2.4 GPA, 6 year gap, IELTS 5.5, wants nursing in London under 16,000
// pounds") and judges it against the entry rules written in the Fact File, course by course. It runs inside your own
// server: no outside service, no key, nothing leaves the computer.
//
// What it reads from the Fact File text of a course level: the lowest grade accepted (a GPA or a percentage), the study
// gap allowed, and the English test scores (IELTS and PTE, overall and in each band), and whether a waiver is mentioned.
// It only judges what the Fact File actually states. A rule it cannot find is said to be "not in the Fact File", never
// guessed. The result of each course is one of:
//   eligible    every rule it could read is met
//   likely      the rules it could read are met, but a detail of the student is missing for another rule
//   not         one rule is clearly not met (the reasons say which)

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const text = (v) => String(v ?? '').trim();

// ---- what the counselor wrote ----
const LEVEL_WORDS = [
  [/\btop[- ]?up\b/, 'Top-up (final year)'], [/\bpre[- ]?masters?\b/, 'Pre-Masters'], [/\bfoundation\b|\bpathway\b|\bint(?:ernational)? year (?:one|zero|1|0)\b/, 'Foundation'],
  [/\bmba\b/, 'MBA'], [/\bpostgrad\w*\b|\bmasters?\b|\bmsc\b|\bpg\b|\bllm\b|\bmres\b/, 'Postgraduate'], [/\bundergrad\w*\b|\bbsc\b|\bug\b|\bnursing degree\b/, 'Undergraduate'],
];
const NOT_SUBJECT = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'without', 'at', 'by', 'is', 'are', 'has', 'have', 'had', 'who', 'that', 'wants', 'want', 'wanted',
  'student', 'students', 'university', 'universities', 'course', 'courses', 'option', 'options', 'any', 'some', 'like', 'looking', 'needs', 'need', 'no', 'not', 'under', 'below', 'above',
  'less', 'than', 'low', 'fee', 'fees', 'budget', 'gap', 'year', 'years', 'yr', 'yrs', 'ielts', 'pte', 'gpa', 'cgpa', 'percent', 'intake', 'uk', 'study', 'from', 'only', 'but', 'can', 'we',
  'offer', 'accepts', 'accept', 'accepted', 'which', 'what', 'do', 'does', 'eligible', 'scholarship', 'scholarships', 'cheap', 'cheapest', 'best', 'good', 'he', 'she', 'they', 'his', 'her',
  'ug', 'pg', 'undergraduate', 'postgraduate', 'masters', 'master', 'bachelor', 'bachelors', 'degree', 'jan', 'january', 'sep', 'sept', 'september', 'may', 'pounds', 'gbp', 'band', 'each',
  'overall', 'score', 'marks', 'got', 'scored', 'with', 'about', 'around', 'upto', 'visa', 'refusal', 'refused', 'moi', 'waiver', 'english', 'test', 'tests', 'top', 'up', 'pre', 'also',
  'then', 'there', 'their', 'this', 'please', 'give', 'show', 'find', 'suggest', 'me', 'my', 'i', 'am', 'be', 'been', 'was', 'were', 'will', 'would', 'should', 'could', 'if', 'so', 'it',
  'near', 'within', 'miles', 'upon', 'passed', 'previous', 'out', 'pass', 'zero', 'none', 'never', 'have', 'having', 'mba', 'msc', 'bsc', 'llm', 'mres', 'foundation', 'pathway', 'nepal', 'nepali']);

// Everything the text says about the student. Anything not mentioned is null.
function readStudent(request, known = {}) {
  const t = ` ${String(request || '').toLowerCase().replace(/,(?!\d)|;/g, ' ').replace(/\s+/g, ' ')} `;
  const out = { gpa: null, percent: null, gapYears: null, passedYear: null, ielts: null, ieltsBand: null, pte: null, budget: null, level: '', city: '', intake: '', noEnglish: false, refusal: false, subject: '' };
  let m = /(\d(?:\.\d{1,2})?)\s*(?:out of 4\s*)?(?:c?gpa)\b/.exec(t) || /\bc?gpa\s*(?:of|is|was|:|=)?\s*(\d(?:\.\d{1,2})?)/.exec(t);
  if (m && num(m[1]) <= 4.5) out.gpa = num(m[1]);
  m = /(\d{2}(?:\.\d+)?)\s*(?:%|percent|per cent)/.exec(t);
  if (m && num(m[1]) <= 100) out.percent = num(m[1]);
  const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const tg = t.replace(/\b(one|two|three|four|five|six|seven|eight)\b(?=[\s-]*(?:years?|yrs?))/g, (w) => WORDNUM[w]).replace(/(\d)-(?=years?|yrs?)/g, '$1 ');
  m = /(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:study\s*)?gap/.exec(tg) || /\bgap\s*(?:of|is|was|:)?\s*(\d{1,2})\s*(?:years?|yrs?)/.exec(tg) || /\bgap\s*(?:of|is|was|:)?\s*(\d{1,2})\b(?!\.\d)/.exec(tg);
  if (m) out.gapYears = num(m[1]);
  else if (/\b(?:no|zero|without(?: any)?)\s+(?:study\s+)?gap\b/.test(t)) out.gapYears = 0;
  m = /(?:passed|completed|graduated|finished)(?:\s*(?:in|the)\s*)?\s*(?:his|her)?\s*(?:\w+\s*)?(?:in\s*)?(20\d{2})/.exec(t);
  if (m && num(m[1]) <= new Date().getFullYear()) out.passedYear = num(m[1]);
  m = /\bielts[^\d]{0,14}(\d(?:\.\d)?)/.exec(t);
  if (m && num(m[1]) <= 9) out.ielts = num(m[1]);
  m = /(\d(?:\.\d)?)\s*(?:in\s*)?(?:each|every|all)\s*(?:band|skill|section)/.exec(t);
  if (m) out.ieltsBand = num(m[1]);
  m = /\bpte[^\d]{0,14}(\d{2})\b/.exec(t);
  if (m) out.pte = num(m[1]);
  m = /£\s?(\d+)\s*k\b/.exec(t) || /\bbudget[^\d]{0,20}(\d+)\s*k\b/.exec(t);
  if (m) out.budget = num(m[1]) * 1000;
  else m = /£\s?(\d[\d,]*)/.exec(t) || /(\d[\d,]*)\s*(?:pounds|gbp)/.exec(t) || /budget[^\d]{0,20}(\d[\d,]*)/.exec(t);
  if (m && out.budget == null) { const b = num(m[1].replace(/,/g, '')); if (b >= 3000 && b < 100000) out.budget = b; }
  for (const [re, level] of LEVEL_WORDS) if (re.test(t)) { out.level = level; break; }
  m = /\b(jan(?:uary)?|sep(?:t(?:ember)?)?|may|nov(?:ember)?)\b\s*(20\d{2})?/.exec(t);
  if (m && /\bintake\b|\bin\s+(?:jan|sep|may|nov)/.test(t)) out.intake = `${{ jan: 'January', sep: 'September', may: 'May', nov: 'November' }[m[1].slice(0, 3)]}${m[2] ? ' ' + m[2] : ''}`;
  out.noEnglish = /\b(?:no|without)\s+(?:ielts|pte|english)|\bwaiver\b|\bmoi\b|\bnot taken|\bno test/.test(t);
  out.refusal = /\bvisa refus|\bprevious refus|\brefused\b/.test(t) && !/\b(?:no|not|never|without|zero)\s+(?:any\s+)?(?:previous\s+|prior\s+)?(?:visa\s+)?refus|\bnever (?:been )?refused|\bnot (?:been )?refused/.test(t);
  // The form's own boxes win over the words.
  if (known.gpa != null) out.gpa = known.gpa;
  if (known.percent != null) out.percent = known.percent;
  if (known.gapYears != null) out.gapYears = known.gapYears;
  if (known.passedYear != null) out.passedYear = known.passedYear;
  if (known.ielts != null) out.ielts = known.ielts;
  if (known.pte != null) out.pte = known.pte;
  if (known.budget) out.budget = known.budget;
  if (known.level) out.level = known.level;
  if (known.intake) out.intake = known.intake;
  if (known.city) out.city = known.city;
  if (known.noEnglish) out.noEnglish = true;
  out.subject = text(known.subject);
  return out;
}

// The words of the request that name a subject (what is left once the facts about the student are taken out).
function subjectOf(request, cities) {
  const cleaned = String(request || '').toLowerCase().replace(/[£$]?\d[\d,.]*\s*(?:%|pounds|gbp|years?|yrs?)?/g, ' ').replace(/[^a-z\s-]/g, ' ');
  return [...new Set(cleaned.split(/\s+/).filter((w) => w.length > 2 && !NOT_SUBJECT.has(w) && !cities.has(w)))].slice(0, 6).join(' ');
}

// A grade written on the form ("2.9 GPA" or "62%") as { gpa, percent }.
function readGrade(v) {
  const s = text(v).toLowerCase();
  if (!s) return {};
  let m = /(\d{2}(?:\.\d+)?)\s*%/.exec(s);
  if (m) return { percent: num(m[1]) };
  m = /(\d+(?:\.\d+)?)\s*(?:percent|per cent)/.exec(s);
  if (m && num(m[1]) <= 100) return { percent: num(m[1]) };
  m = /(\d+(?:\.\d+)?)/.exec(s);
  if (m && num(m[1]) <= 4.5) return { gpa: num(m[1]) };
  if (m && num(m[1]) >= 10 && num(m[1]) <= 100) return { percent: num(m[1]) };
  return {};
}

// ---- what the Fact File says ----
const lines = (v) => String(v || '').split(/\s*;\s+|\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);

// The lowest and highest grade of each kind that the text names for entry.
function academicRules(academic) {
  const rules = { gpa: [], percent: [] };
  lines(academic).forEach((l) => {
    if (/less than/i.test(l)) return;
    let m;
    const gpa = /(\d(?:\.\d{1,2})?)\s*\+?\s*(?:out of 4\s*)?c?gpa|c?gpa\s*(?:of|:)?\s*(\d(?:\.\d{1,2})?)/gi;
    while ((m = gpa.exec(l))) { const v = num(m[1] || m[2]); if (v > 0 && v <= 4.5) rules.gpa.push(v); }
    const pct = /(\d{2}(?:\.\d+)?)\s*%/g;
    while ((m = pct.exec(l))) { const v = num(m[1]); if (v >= 30 && v <= 90) rules.percent.push(v); }
  });
  return rules;
}
// The study gap the text allows: { years, since (a pass-out year) } or { considered: true }, or null when it says nothing.
function gapRule(academic) {
  const g = lines(academic).filter((l) => /gap/i.test(l)).join(' | ');
  if (!g) return null;
  const years = [...g.matchAll(/(?:up\s*to|upto|accepted up to|max(?:imum)?(?: of)?|within)\s*(\d{1,2})\s*(?:years?|yrs?)|(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?gap(?: accepted)?/gi)].map((m) => num(m[1] || m[2]));
  const since = /(20\d{2})\s*(?:pass[ -]?out\s*)?onwards/i.exec(g);
  if (years.length || since) return { years: years.length ? Math.max(...years) : null, since: since ? num(since[1]) : null, text: g.slice(0, 160) };
  if (/consider/i.test(g)) return { considered: true };
  return null;
}
// IELTS and PTE as { overall, band }: "6.0 overall / 5.5 in each band", "(min 5.5 each band)", "6.0/5.5", "Overall 6 no band below 5.5".
function englishRules(english) {
  const out = {};
  lines(english).forEach((l) => {
    const test = /\bielts\b/i.test(l) ? 'ielts' : /\bpte\b/i.test(l) ? 'pte' : '';
    if (!test || out[test]) return;
    const body = l.replace(/^.*?(?:ielts|pte)(?: academic| ukvi)?/i, '').replace(/oxford ellt.*$/i, '');
    const nums = [...body.matchAll(/\d{1,2}(?:\.\d)?/g)].map((x) => num(x[0]));
    if (!nums.length) return;
    const valid = (v) => (test === 'ielts' ? v >= 4 && v <= 9 : v >= 30 && v <= 90);
    const first = nums.find(valid);
    if (first === undefined) return;
    const rest = nums.slice(nums.indexOf(first) + 1).filter(valid);
    out[test] = { overall: first, band: rest.length ? Math.min(...rest) : null };
  });
  const all = lines(english).join(' ');
  // The waiver route, read from the lines that mention it: none (n/a, not accepted), only for a UK qualification (our students hold
  // Nepal qualifications, so it does not help them), or open to them (MOI, a score in Grade 12 ...).
  const waiverLines = lines(english).filter((l) => /waiver|\bmoi\b|medium of instruction|grade 12|12th/i.test(l));
  out.waiverText = waiverLines.join('; ').replace(/\s+/g, ' ').slice(0, 160);
  out.waiverKind = !waiverLines.length ? '' : /n\/a|not accepted|not available|not offered|no (?:ielts |english )?waiver|waiver:\s*(?:no|none)\b/i.test(out.waiverText) ? 'none'
    : /uk[\s-]*(?:affiliated|degree|based|universit|qualification)|affiliated degree|studied in the uk|from the uk/i.test(out.waiverText) ? 'uk' : 'yes';
  out.waiver = out.waiverKind === 'yes';
  return out;
}
const refusalNotAccepted = (academic) => /refusal[^|;\n]*(?:not accepted|not considered|no)/i.test(String(academic || ''));

// ---- judging one course ----
function judge(student, course, now = new Date()) {
  const academic = String(course.academic || '').replace(/;\s+/g, '\n');
  const english = String(course.english || '').replace(/;\s+/g, '\n');
  const fails = [];
  const passes = [];
  const missing = []; // a detail of the student that would settle a rule

  // Grade
  const rules = academicRules(academic);
  const wanted = student.gpa != null ? 'gpa' : student.percent != null ? 'percent' : '';
  if (wanted && rules[wanted].length) {
    const lowest = Math.min(...rules[wanted]);
    const value = student[wanted];
    const unit = wanted === 'gpa' ? ' GPA' : '%';
    if (value < lowest) fails.push(`the grade (${value}${unit}) is below the lowest the Fact File accepts (${lowest}${unit})`);
    else passes.push(`grade ${value}${unit} meets ${lowest}${unit}${Math.max(...rules[wanted]) > lowest ? ` (some boards need up to ${Math.max(...rules[wanted])}${unit})` : ''}`);
  } else if (!wanted && (rules.gpa.length || rules.percent.length)) missing.push('the grade');
  else if (wanted && !rules[wanted].length && (rules.gpa.length || rules.percent.length)) missing.push(wanted === 'gpa' ? 'the percentage (the rule is in percent)' : 'the GPA (the rule is a GPA)');

  // Study gap
  const gap = gapRule(academic);
  const gapYears = student.gapYears != null ? student.gapYears : (student.passedYear ? Math.max(0, now.getFullYear() - student.passedYear) : null);
  if (gap && !gap.considered) {
    if (gapYears === null) missing.push('the study gap');
    else if (gap.years !== null && gapYears > gap.years) fails.push(`the study gap (${gapYears} ${gapYears === 1 ? 'year' : 'years'}) is longer than the ${gap.years} years allowed`);
    else if (gap.since && student.passedYear && student.passedYear < gap.since) fails.push(`the student passed in ${student.passedYear}; the rule is ${gap.since} onwards`);
    else passes.push(`a gap of ${gapYears} ${gapYears === 1 ? 'year is' : 'years is'} allowed`);
  } else if (gap && gap.considered && gapYears !== null && gapYears > 0) passes.push('the university considers a study gap case by case');

  // Visa refusal
  if (student.refusal && refusalNotAccepted(academic)) fails.push('this university does not accept a previous UK visa refusal');

  // English
  const rule = englishRules(english);
  const hasTest = student.ielts != null || student.pte != null;
  if (hasTest && (rule.ielts || rule.pte)) {
    const checks = [];
    if (student.ielts != null && rule.ielts) {
      if (student.ielts < rule.ielts.overall) checks.push(`IELTS ${student.ielts} is below the ${rule.ielts.overall} needed`);
      else if (student.ieltsBand != null && rule.ielts.band != null && student.ieltsBand < rule.ielts.band) checks.push(`the IELTS band ${student.ieltsBand} is below the ${rule.ielts.band} needed in each band`);
      else checks.push(null);
    }
    if (student.pte != null && rule.pte) checks.push(student.pte < rule.pte.overall ? `PTE ${student.pte} is below the ${rule.pte.overall} needed` : null);
    const bad = checks.filter(Boolean);
    if (!checks.length) missing.push(student.ielts != null ? 'the PTE score' : 'the IELTS score');
    else if (bad.length === checks.length) bad.forEach((b) => fails.push(b));
    else passes.push(`English meets ${student.ielts != null && rule.ielts && !bad.some((b) => /IELTS/.test(b)) ? `IELTS ${rule.ielts.overall}` : `PTE ${rule.pte.overall}`}${student.ielts != null && rule.ielts && student.ieltsBand == null && rule.ielts.band != null ? ' (the band scores are not known)' : ''}`);
  } else if (!hasTest && (rule.ielts || rule.pte)) {
    if (student.noEnglish && rule.waiverKind === 'yes') passes.push(`no English test: the waiver route is open (${rule.waiverText})`);
    else if (student.noEnglish && rule.waiverKind === 'uk') fails.push(`no English test, and the waiver is only for UK affiliated degrees (${rule.waiverText})`);
    else if (student.noEnglish) fails.push('no English test, and the Fact File offers no waiver');
    else missing.push('the English test');
  }
  // Nothing readable in the Fact File for this course: no verdict is made up.
  const stated = rules.gpa.length || rules.percent.length || (gap && !gap.considered) || rule.ielts || rule.pte;
  const status = fails.length ? 'not' : !stated ? 'unstated' : (missing.length ? 'likely' : 'eligible');
  return { status, fails, passes, missing };
}

const LEVEL_PRIORITY = ['Eligible', 'Likely eligible'];
function fitOf(j) { return { eligible: 'Eligible', likely: 'Likely eligible', unstated: 'Entry rules not in the Fact File', not: 'Not eligible' }[j.status]; }

// The one-line "what I understood", for the counselor to check.
function understood(s) {
  const out = [];
  if (s.level) out.push(`Level: ${s.level}`);
  if (s.subject) out.push(`Subject: ${s.subject}`);
  if (s.gpa != null) out.push(`GPA ${s.gpa}`);
  if (s.percent != null) out.push(`${s.percent}%`);
  if (s.gapYears != null) out.push(`${s.gapYears} year gap`);
  if (s.passedYear) out.push(`passed ${s.passedYear}`);
  if (s.ielts != null) out.push(`IELTS ${s.ielts}${s.ieltsBand != null ? ` (${s.ieltsBand} each band)` : ''}`);
  if (s.pte != null) out.push(`PTE ${s.pte}`);
  if (s.noEnglish) out.push('no English test');
  if (s.refusal) out.push('earlier visa refusal');
  if (s.budget) out.push(`budget £${s.budget.toLocaleString('en-GB')}`);
  if (s.city) out.push(`City: ${s.city}`);
  if (s.intake) out.push(`Intake: ${s.intake}`);
  return out;
}

module.exports = { readStudent, readGrade, subjectOf, judge, fitOf, understood, academicRules, gapRule, englishRules, LEVEL_PRIORITY };

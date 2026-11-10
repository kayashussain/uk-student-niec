// The numbers behind the Analysis page (analysis.html) and the Advisor's get_business_analysis tool.
//
// The Dashboard answers "where is each student today?". This answers the business questions: which channel, campaign,
// university, course and counselor bring students who pay and get a visa, what each channel costs, which months are busy,
// how much rests on one university or partner, why students are lost, and what the sheet does not record yet.
//
// Nothing here is guessed. Every figure is a count of what is typed in the sheet (read with the same rules as the
// Dashboard, see dashboard-stats.js) or a sum of the marketing spend Admin entered. Where the sheet is silent the
// answer says so (the `completeness` and `findings` blocks) instead of showing a made-up number.

const { progressOf, isStudent, median, isoDate, LEFT } = require('./dashboard-stats');
const { localDate } = require('../shared/server-utils');

const text = (v) => String(v ?? '').trim();
const round1 = (n) => Math.round(n * 10) / 10;
const pct = (n, of) => (of ? round1((n / of) * 100) : null);
const BLANK = '(not filled in)';
const SMALL = 10; // fewer students than this in a group: a rate from it is not yet a pattern
const DAY = 86400000;
const dayNumber = (v) => { const iso = isoDate(v); return iso ? Date.parse(iso + 'T00:00:00Z') / DAY : NaN; };

const newGroup = () => ({ students: 0, inquiries: 0, applied: 0, offers: 0, paid: 0, visas: 0, rejected: 0, lost: 0, active: 0 });
function add(g, s) {
  g.students += 1;
  if (s.status === 'Inquiry') g.inquiries += 1;
  if (s.p.reached.applied) g.applied += 1;
  if (s.p.reached.offer) g.offers += 1;
  if (s.p.reached.paid) g.paid += 1;
  if (s.visa) g.visas += 1;
  if (s.status === 'Visa Rejected') g.rejected += 1;
  if (s.left) g.lost += 1;
  if (s.active) g.active += 1;
}
// The rates of a group. visaSuccess is of the visas decided (issued or refused), the others are of every student in the group.
function withRates(g, total) {
  const decided = g.visas + g.rejected;
  return {
    ...g,
    share: pct(g.students, total),
    appliedRate: pct(g.applied, g.students),
    paidRate: pct(g.paid, g.students),
    visaRate: pct(g.visas, g.students),
    visaSuccess: decided ? pct(g.visas, decided) : null,
    smallSample: g.students < SMALL,
  };
}
// One row per value of `keyOf` (a blank cell is its own row, so what is missing is seen, not hidden), biggest first.
function scorecard(students, keyOf) {
  const map = new Map();
  students.forEach((s) => {
    const label = keyOf(s) || BLANK;
    add(map.get(label) || map.set(label, newGroup()).get(label), s);
  });
  return [...map.entries()].map(([label, g]) => ({ label, ...withRates(g, students.length) }))
    .sort((a, b) => (a.label === BLANK) - (b.label === BLANK) || b.students - a.students || a.label.localeCompare(b.label));
}
// How much rests on the biggest one and the biggest three of a scorecard (blank rows left out), by students and by paid students.
function concentration(cards) {
  const named = cards.filter((c) => c.label !== BLANK);
  const share = (key, n) => {
    const total = named.reduce((sum, c) => sum + c[key], 0);
    const top = [...named].sort((a, b) => b[key] - a[key]).slice(0, n);
    return { names: top.map((c) => c.label), percent: pct(top.reduce((sum, c) => sum + c[key], 0), total), of: total };
  };
  return { groups: named.length, top1Students: share('students', 1), top3Students: share('students', 3), top1Paid: share('paid', 1) };
}

// What each column lets management decide, and which students it is expected on.
const COMPLETENESS = [
  { column: 'STUDENT SOURCE', label: 'Student Source', on: 'all', decides: 'Which channels bring students' },
  { column: 'SOURCE DETAIL', label: 'Source Detail', on: 'all', decides: 'Which platform or kind of referral inside each source (TikTok or ads, a past student or a teacher)' },
  { column: 'CAMPAIGN OR EVENT', label: 'Campaign or Event', on: 'campaign', decides: 'Which advert or event to repeat and which to stop (expected on Events and Social Media students)' },
  { column: 'INQUIRY DATE', label: 'Inquiry Date', on: 'all', date: true, decides: 'Which months students first ask, so when to advertise and hold events, and how long an inquiry takes to apply' },
  { column: 'COUNSELOR', label: 'Counselor', on: 'all', decides: 'Workload and results by counselor' },
  { column: 'STUDY LEVEL', label: 'Study Level', on: 'all', decides: 'Which level (undergraduate, postgraduate ...) to promote' },
  { column: 'HOME DISTRICT', label: 'Home District', on: 'all', decides: 'Where in Nepal to hold events and aim adverts' },
  { column: 'UNIVERSITY NAME', label: 'University Name', on: 'applied', decides: 'Which universities carry the business' },
  { column: 'COURSE NAME', label: 'Course Name', on: 'applied', decides: 'Which courses to promote' },
  { column: 'UNIVERSITY PARTNER', label: 'University Partner', on: 'applied', decides: 'How much depends on each partner' },
  { column: 'APPLICATION SUBMISSION DATE', label: 'Application Submitted', on: 'applied', date: true, decides: 'Busy months and how fast applications move' },
  { column: 'PAYMENT DATE', label: 'Payment Date', on: 'paid', date: true, decides: 'When money comes in' },
  { column: 'VISA RECEIVED DATE', label: 'Visa Received Date', on: 'visa', date: true, decides: 'How long the whole journey takes' },
  { column: 'LOST REASON', label: 'Lost Reason', on: 'lost', decides: 'Why students are lost and what to fix first' },
];
const CAMPAIGN_SOURCES = ['Events', 'Social Media'];
const EXPECTED_ON = {
  all: () => true,
  campaign: (s) => CAMPAIGN_SOURCES.includes(s.source),
  applied: (s) => s.p.reached.applied,
  paid: (s) => s.p.reached.paid,
  visa: (s) => s.visa,
  lost: (s) => s.left,
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// How many students have this date in each month of the year (every year added together), to see the busy season.
function byMonthOfYear(students, column) {
  const counts = new Array(12).fill(0);
  students.forEach((s) => { const iso = isoDate(s.row[column]); if (iso) counts[Number(iso.slice(5, 7)) - 1] += 1; });
  return counts;
}

// The spend rows that count in this view: an intake's own rows, or every row when all intakes are shown.
function spendInScope(spend, selected) {
  return (Array.isArray(spend) ? spend : []).filter((r) => r && Number(r.amount) > 0 && (selected === 'all' || r.intake === selected));
}
const per = (money, n) => (money > 0 && n > 0 ? Math.round(money / n) : null);
function withCost(card, money) {
  return { ...card, spend: money, costPerStudent: per(money, card.students), costPerApplication: per(money, card.applied), costPerPaid: per(money, card.paid), costPerVisa: per(money, card.visas) };
}
const sameText = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();

// The plain-language findings: what stands out, what it means and what to do. Only rules that the numbers prove.
function findings(a) {
  const out = [];
  const say = (level, title, detail, action) => out.push({ level, title, detail, action });
  const t = a.totals;
  if (!t.students) return out;
  const gap = (column) => a.completeness.find((c) => c.column === column);
  const missing = (c) => c.expected - c.filled;

  const src = gap('STUDENT SOURCE');
  if (missing(src) > 0 && src.percent < 90) say('gap', `${missing(src)} of ${src.expected} students have no Student Source`, 'These students cannot be counted for any channel, so every channel looks smaller than it is.', 'Fill in Student Source for every student, starting with the newest intake.');
  const detail = gap('SOURCE DETAIL');
  if (missing(detail) > 0 && detail.percent < 80) say('gap', `${missing(detail)} of ${detail.expected} students have no Source Detail`, 'The sheet says "Social Media" or "Events" but not which platform or which kind, so money cannot be moved to the channel that works.', 'Pick the Source Detail for each student (it is a dropdown beside Application Status). Ask every new student "where did you first hear about us?".');
  const inquiry = gap('INQUIRY DATE');
  if (missing(inquiry) > 0 && inquiry.percent < 80) say('gap', `${missing(inquiry)} of ${inquiry.expected} students have no Inquiry Date`, 'Without the day a student first asked, the busy months for inquiries and the time from inquiry to application are unknown. Those two decide when to advertise and when to hold events.', 'Enter the Inquiry Date for every new student on the day they first make contact.');
  const lost = gap('LOST REASON');
  if (lost.expected >= 3 && lost.percent < 80) say('gap', `${missing(lost)} of ${lost.expected} lost students have no Lost Reason`, 'Students were deferred, put on hold, withdrawn or refused, but the sheet does not say why, so the same loss can repeat.', 'Pick a Lost Reason whenever a student is set to Defer, Hold, Withdrawn or Visa Rejected.');
  if (t.inquiries === 0 && t.students >= SMALL) say('gap', 'No student is at Inquiry', 'Only students who went on to apply seem to be recorded. Without the inquiries that did not apply, the real conversion of each channel is unknown and looks better than it is.', 'Add every serious inquiry as a row at Inquiry, even if the student never applies.');

  [['universities', 'university', 40], ['partners', 'University Partner', 60]].forEach(([key, word, limit]) => {
    const c = a.concentration[key];
    if (c.top1Students.of >= SMALL && c.top1Students.percent >= limit) say('risk', `${c.top1Students.percent}% of students are with one ${word}: ${c.top1Students.names[0]}`, `If this ${word} changes its terms, its agents or its intake, most of the pipeline is exposed. There are ${c.groups} in total on the sheet.`, `Decide which second and third ${word} to grow, and steer suitable new students to them.`);
  });
  if (t.visaSuccess !== null && t.visas + t.rejected >= 5 && t.visaSuccess < 85) say('risk', `Visa success is ${t.visaSuccess}% (${t.rejected} refused of ${t.visas + t.rejected} decided)`, 'Each refusal loses the commission and weakens the standing with the university.', 'Read the Lost Reason and university of each refusal, and tighten the mock interview and financial checks where they cluster.');

  const sized = a.sources.filter((s) => s.label !== BLANK && !s.smallSample);
  if (sized.length >= 2) {
    const best = [...sized].sort((x, y) => y.paidRate - x.paidRate)[0];
    const worst = [...sized].sort((x, y) => x.paidRate - y.paidRate)[0];
    if (best.paidRate - worst.paidRate >= 15) say('info', `${best.label} students pay far more often than ${worst.label} students`, `${best.paidRate}% of ${best.students} students from ${best.label} reached payment, against ${worst.paidRate}% of ${worst.students} from ${worst.label}.`, `Before spending more on ${worst.label}, find out why its students stop (see their Lost Reasons and stages).`);
  }
  if (!a.spend.total) say('gap', 'No marketing spend is entered', 'The cost of a student, an application and a visa from each channel cannot be worked out, so it is not known which channel is worth its money.', 'Admin: enter what was spent on each channel, advert and event in the Marketing spend table on the Analysis page.');
  else a.sources.filter((s) => s.spend > 0 && s.students === 0).forEach((s) => say('risk', `NPR ${s.spend.toLocaleString('en-US')} spent on ${s.label} with no student recorded from it`, 'Either the channel brought nobody, or its students were entered under another source.', 'Check the Student Source of recent students, then decide whether to keep paying for this channel.'));

  const peak = (counts) => { const max = Math.max(...counts); return max > 0 ? MONTH_NAMES[counts.indexOf(max)] : null; };
  const totalOf = (counts) => counts.reduce((x, y) => x + y, 0);
  const season = a.seasonality;
  const basis = totalOf(season.inquiries) >= SMALL ? ['inquiries', 'Inquiries'] : totalOf(season.applications) >= SMALL ? ['applications', 'Applications'] : null;
  if (basis) say('info', `${basis[1]} peak in ${peak(season[basis[0]])}`, `Counted from ${totalOf(season[basis[0]])} dated ${basis[0]} on the sheet, every year added together.`, 'Plan adverts and events to start four to six weeks before the peak month, not during it.');
  if (t.students < 30) say('info', `Only ${t.students} students in this view`, 'Rates from a small number of students move a lot with one or two students. Treat them as a first signal, not a proven pattern.', 'Look at All intakes for steadier figures.');
  return out;
}

// `sheetId`: one intake's id, or "all" (also the default) for every intake together.
function buildAnalysis(workbook, { sheetId = 'all', spend = [], today: now = new Date() } = {}) {
  const sheets = (workbook && workbook.sheets) || [];
  const selected = sheets.some((s) => s.id === sheetId) ? sheetId : 'all';
  const read = (sheet) => (sheet.rows || []).filter(isStudent).map((row) => {
    const status = text(row['APPLICATION STATUS']);
    const p = progressOf(row, status);
    const left = LEFT.includes(status);
    return { row, status, p, left, visa: p.reached.visa, active: !left && !p.reached.visa, source: text(row['STUDENT SOURCE']), sheet };
  });
  const bySheet = sheets.map((sheet) => ({ sheet, students: read(sheet) }));
  const students = bySheet.filter((x) => selected === 'all' || x.sheet.id === selected).flatMap((x) => x.students);
  const col = (name) => (s) => text(s.row[name]);

  const all = newGroup();
  students.forEach((s) => add(all, s));
  const totals = withRates(all, students.length);

  const money = spendInScope(spend, selected);
  const sumSpend = (test) => money.filter(test).reduce((sum, r) => sum + Number(r.amount), 0);

  // Channels: each source, with its details inside it, and what was spent on each.
  const sourceCards = scorecard(students, (s) => s.source);
  money.forEach((r) => { // a channel that was paid for but has no student yet is still shown
    if (text(r.source) && !sourceCards.some((c) => sameText(c.label, r.source))) sourceCards.push({ label: text(r.source), ...withRates(newGroup(), students.length) });
  });
  const sources = sourceCards.map((card) => {
    const inside = students.filter((s) => (s.source || BLANK) === card.label);
    const details = scorecard(inside, col('SOURCE DETAIL')).map((d) => withCost(d, d.label === BLANK ? 0 : sumSpend((r) => sameText(r.source, card.label) && sameText(r.detail, d.label))));
    return { ...withCost(card, card.label === BLANK ? 0 : sumSpend((r) => sameText(r.source, card.label))), details };
  });
  const campaigns = scorecard(students.filter((s) => text(s.row['CAMPAIGN OR EVENT'])), col('CAMPAIGN OR EVENT'))
    .map((c) => withCost(c, sumSpend((r) => sameText(r.campaign, c.label))));

  const universities = scorecard(students, col('UNIVERSITY NAME'));
  const partners = scorecard(students, col('UNIVERSITY PARTNER'));

  const completeness = COMPLETENESS.map((c) => {
    const expected = students.filter(EXPECTED_ON[c.on]);
    const filled = expected.filter((s) => (c.date ? isoDate(s.row[c.column]) !== '' : text(s.row[c.column]) !== '')).length;
    return { column: c.column, label: c.label, expected: expected.length, filled, percent: expected.length ? pct(filled, expected.length) : 100, decides: c.decides };
  });

  const gapDays = (from, to) => {
    const list = [];
    students.forEach((s) => { const d = dayNumber(s.row[to]) - dayNumber(s.row[from]); if (d >= 0 && d <= 730) list.push(d); });
    return { samples: list.length, medianDays: median(list) };
  };
  const spent = sumSpend(() => true);

  const analysis = {
    asOf: now.toISOString(),
    today: localDate(now),
    selected,
    intakes: sheets.map((s) => ({ id: s.id, name: s.name })),
    totals,
    // Every intake side by side, whatever is selected, so one intake can be judged against the others.
    intakeComparison: bySheet.map(({ sheet, students: list }) => {
      const g = newGroup();
      list.forEach((s) => add(g, s));
      return { id: sheet.id, label: sheet.name, ...withRates(g, list.length) };
    }),
    completeness,
    sources,
    campaigns,
    universities,
    partners,
    courses: scorecard(students, col('COURSE NAME')),
    counselors: scorecard(students, col('COUNSELOR')),
    studyLevels: scorecard(students, col('STUDY LEVEL')),
    districts: scorecard(students, col('HOME DISTRICT')),
    lostReasons: scorecard(students.filter((s) => s.left), col('LOST REASON')).map((r) => ({ label: r.label, students: r.students, rejected: r.rejected })),
    lostByStatus: LEFT.map((label) => ({ label, students: students.filter((s) => s.status === label).length })),
    concentration: { universities: concentration(universities), partners: concentration(partners) },
    seasonality: {
      months: MONTH_NAMES,
      inquiries: byMonthOfYear(students, 'INQUIRY DATE'),
      applications: byMonthOfYear(students, 'APPLICATION SUBMISSION DATE'),
      payments: byMonthOfYear(students, 'PAYMENT DATE'),
      visas: byMonthOfYear(students, 'VISA RECEIVED DATE'),
    },
    speed: {
      inquiryToApplication: gapDays('INQUIRY DATE', 'APPLICATION SUBMISSION DATE'),
      inquiryToPayment: gapDays('INQUIRY DATE', 'PAYMENT DATE'),
      applicationToVisa: gapDays('APPLICATION SUBMISSION DATE', 'VISA RECEIVED DATE'),
    },
    spend: { currency: 'NPR', total: spent, rows: money.length, costPerStudent: per(spent, totals.students), costPerPaid: per(spent, totals.paid), costPerVisa: per(spent, totals.visas) },
    notes: [
      'A student counts as applied, paid and so on from their stage or any later date, exactly as on the Dashboard.',
      'Rates marked with a star come from fewer than 10 students and are not yet a pattern.',
      'Cost figures divide the marketing spend entered by Admin by the students of that channel; they do not prove the spend caused the student.',
      'Results by counselor are not adjusted for how hard their students were (source, course, stage), so they show workload first, not skill.',
    ],
  };
  analysis.findings = findings(analysis);
  return analysis;
}

module.exports = { buildAnalysis, BLANK };

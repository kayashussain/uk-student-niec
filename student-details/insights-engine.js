// The figures behind the Dashboard's decision pages (Decisions, Channels, Universities, Team, Intake plan), worked
// out on the server from the sheet, the student cards and the management records, so the page gets totals and never
// a student's record.
//
// buildInsights({ workbook, cards, planning, partners, b2b, sheetId, today, admin }) -> plain object (see the end).
//
// The rules it keeps to, because decisions are taken on these numbers:
//   - Nothing is guessed. A detail nobody filled in is counted as "(not recorded)", never spread over the others.
//   - A rate from fewer than MIN_SAMPLE students is marked `low`, and no finding is built on it.
//   - A step is counted the way the Dashboard counts it (dashboard-stats.js): from its own date or from any later
//     step, so an old sheet without dates still reads right.
//   - Every finding carries the numbers it rests on, why it matters, the decision it asks for and how to measure it.

const { isoDate, progressOf, LEFT, median } = require('./dashboard-stats');
const { newestSheet } = require('../shared/teams');
const { localDate } = require('../shared/server-utils');

const MIN_SAMPLE = 10;
const DAY = 86400000;
const NONE = '(not recorded)';
const text = (v) => String(v ?? '').trim();
const dayNumber = (iso) => (iso ? Date.parse(iso + 'T00:00:00Z') / DAY : NaN);
const round1 = (n) => Math.round(n * 10) / 10;
const pct = (n, of) => (of ? round1((n / of) * 100) : null);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const isStudent = (row) => text(row['FIRST NAME']) !== '' || text(row['LAST NAME']) !== '';
const addDays = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "Jan Intake 2027" or "September 2026" -> { month: 0..11, year }, else null.
function intakeSeason(name) {
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b[^\d]*(\d{4})/i.exec(String(name || ''));
  return m ? { month: MONTHS.indexOf(m[1].toLowerCase()), year: Number(m[2]) } : null;
}
// The day teaching usually starts for an intake, when Admin has not typed one: late in the intake's month.
function guessStart(name) {
  const s = intakeSeason(name);
  return s ? `${s.year}-${String(s.month + 1).padStart(2, '0')}-20` : '';
}

// ---- one student, as the analysis reads them ----
const EMPTY_CARD = { profile: {}, notes: [], messages: [], options: [] };
function readStudents(workbook, cards) {
  const out = [];
  (workbook.sheets || []).forEach((sheet, sheetIndex) => {
    (sheet.rows || []).forEach((row) => {
      if (!row || !isStudent(row)) return;
      const status = text(row['APPLICATION STATUS']);
      const p = progressOf(row, status);
      const card = (cards && cards[row._id]) || EMPTY_CARD;
      const prof = card.profile || {};
      const left = LEFT.includes(status);
      const notes = card.notes || [];
      out.push({
        id: row._id, sheetId: sheet.id, intake: sheet.name, sheetIndex,
        name: `${text(row['FIRST NAME'])} ${text(row['LAST NAME'])}`.trim(),
        status, p, left, refused: status === 'Visa Rejected', visa: Boolean(p.reached.visa), active: !left && !p.reached.visa,
        inquiry: status === 'Inquiry',
        source: text(row['STUDENT SOURCE']), detail: text(prof.sourceDetail),
        level: text(prof.studyLevel), subject: text(prof.subject), where: text(prof.location), budget: text(prof.budget),
        grade: text(prof.grade), english: text(prof.englishScore), lostReason: text(prof.lostReason),
        // Options were put together for the student: a serious inquiry.
        optioned: (card.options || []).length > 0,
        university: text(row['UNIVERSITY NAME']), partner: text(row['UNIVERSITY PARTNER']), course: text(row['COURSE NAME']),
        dates: {
          inquiry: text(prof.inquiryDate), applied: isoDate(row['APPLICATION SUBMISSION DATE']), offer: isoDate(row['OFFER RECEIVED DATE']),
          paid: isoDate(row['PAYMENT DATE']), cas: isoDate(row['CAS RECEIVED DATE']), lodged: isoDate(row['VISA LODGE DATE']), visa: isoDate(row['VISA RECEIVED DATE']),
        },
        lastNoteAt: notes.length ? notes[notes.length - 1].at : '',
        messages: (card.messages || []).filter((m) => m.status === 'sent' || m.status === 'opened').length,
        hasCard: Boolean(cards && cards[row._id]),
      });
    });
  });
  return out;
}

// ---- a group of students counted along the journey ----
const newGroup = (label) => ({ label, students: 0, qualified: 0, applied: 0, offers: 0, paid: 0, cas: 0, lodged: 0, visas: 0, refused: 0, lost: 0, active: 0, inquiries: 0 });
// A serious inquiry: university options were prepared for the student, or the student has applied.
const isQualified = (s) => s.p.reached.applied || s.optioned;
function count(g, s) {
  g.students += 1;
  if (isQualified(s)) g.qualified += 1;
  if (s.p.reached.applied) g.applied += 1;
  if (s.p.reached.offer) g.offers += 1;
  if (s.p.reached.paid) g.paid += 1;
  if (s.p.reached.cas) g.cas += 1;
  if (s.p.reached.lodged) g.lodged += 1;
  if (s.visa) g.visas += 1;
  if (s.refused) g.refused += 1;
  if (s.left && !s.refused) g.lost += 1;
  if (s.active) g.active += 1;
  if (s.inquiry) g.inquiries += 1;
  return g;
}
function rates(g) {
  const decided = g.visas + g.refused;
  return {
    ...g,
    toApplication: pct(g.applied, g.students), toOffer: pct(g.offers, g.applied), toPayment: pct(g.paid, g.offers), toVisa: pct(g.visas, g.paid),
    leadToVisa: pct(g.visas, g.students), visaSuccess: pct(g.visas, decided), low: g.students < MIN_SAMPLE,
  };
}
function groupBy(students, keyOf, { blank = NONE } = {}) {
  const map = new Map();
  students.forEach((s) => {
    const label = keyOf(s) || blank;
    count(map.get(label) || map.set(label, newGroup(label)).get(label), s);
  });
  return [...map.values()].map(rates).sort((a, b) => b.students - a.students || a.label.localeCompare(b.label));
}

// ---- money: what was spent, tied to a source and a detail ----
function spendTotals(lines) {
  const bySource = new Map();
  const byDetail = new Map();
  let total = 0;
  let leads = 0;
  lines.forEach((l) => {
    total += l.amount;
    leads += l.leads || 0;
    const add = (map, key) => { const e = map.get(key) || map.set(key, { amount: 0, leads: 0 }).get(key); e.amount += l.amount; e.leads += l.leads || 0; };
    add(bySource, l.source || NONE);
    if (l.detail) add(byDetail, `${l.source}\u0000${l.detail}`);
  });
  return { total, leads, bySource, byDetail };
}
const costPer = (amount, n) => (amount > 0 && n > 0 ? Math.round(amount / n) : null);

function channelTable(students, spendLines) {
  const spend = spendTotals(spendLines);
  const sources = groupBy(students, (s) => s.source).map((g) => {
    const mine = students.filter((s) => (s.source || NONE) === g.label);
    const sp = spend.bySource.get(g.label) || { amount: 0, leads: 0 };
    // What follows the source: the platform, the event, the partner or the kind of referrer.
    const details = groupBy(mine, (s) => s.detail).map((d) => {
      const ds = spend.byDetail.get(`${g.label}\u0000${d.label}`) || { amount: 0, leads: 0 };
      return { ...d, spend: ds.amount, reportedLeads: ds.leads, costPerStudent: costPer(ds.amount, d.students), costPerApplication: costPer(ds.amount, d.applied), costPerVisa: costPer(ds.amount, d.visas) };
    });
    return {
      ...g, spend: sp.amount, reportedLeads: sp.leads,
      costPerStudent: costPer(sp.amount, g.students), costPerQualified: costPer(sp.amount, g.qualified), costPerApplication: costPer(sp.amount, g.applied), costPerVisa: costPer(sp.amount, g.visas),
      share: pct(g.students, students.length), visaShare: pct(g.visas, students.filter((s) => s.visa).length),
      details: details.length === 1 && details[0].label === NONE ? [] : details,
      detailMissing: mine.filter((s) => !s.detail).length,
    };
  });
  // Money spent on a source no student is recorded under: it would otherwise vanish from the table.
  spend.bySource.forEach((sp, label) => {
    if (!sources.some((s) => s.label === label)) sources.push({ ...rates(newGroup(label)), spend: sp.amount, reportedLeads: sp.leads, costPerStudent: null, costPerQualified: null, costPerApplication: null, costPerVisa: null, share: 0, visaShare: 0, details: [], detailMissing: 0, spendOnly: true });
  });
  return { sources, spendTotal: spend.total, reportedLeads: spend.leads };
}

// ---- concentration: how much rests on the biggest one ----
function concentration(groups, key) {
  const named = groups.filter((g) => g.label !== NONE);
  const total = named.reduce((n, g) => n + g[key], 0);
  if (!total) return { total: 0, top: null, topShare: null, top3Share: null, count: 0 };
  const sorted = [...named].sort((a, b) => b[key] - a[key]);
  return {
    total, count: sorted.filter((g) => g[key] > 0).length, top: sorted[0].label, topShare: pct(sorted[0][key], total),
    top3Share: pct(sorted.slice(0, 3).reduce((n, g) => n + g[key], 0), total),
  };
}

// ---- how long the steps take (days between two dates on the same student) ----
const GAPS = [
  ['inquiryToApplication', 'First inquiry to application', 'inquiry', 'applied'], ['applicationToOffer', 'Application to offer', 'applied', 'offer'],
  ['offerToPayment', 'Offer to payment', 'offer', 'paid'], ['paymentToCas', 'Payment to CAS', 'paid', 'cas'], ['casToLodge', 'CAS to visa lodged', 'cas', 'lodged'],
  ['lodgeToVisa', 'Visa lodged to visa issued', 'lodged', 'visa'], ['applicationToVisa', 'Application to visa issued', 'applied', 'visa'],
];
function speed(students) {
  return GAPS.map(([key, label, from, to]) => {
    const days = students.map((s) => dayNumber(s.dates[to]) - dayNumber(s.dates[from])).filter((d) => d >= 0 && d <= 730);
    return { key, label, samples: days.length, median: days.length >= 3 ? Math.round(median(days)) : null };
  });
}

// ---- the chance of a visa from each step, from your own finished students ----
// Of the students of every intake whose journey has ended (visa issued, refused, withdrawn, on hold or deferred) and
// who had reached a step, the share who got the visa. A student still in progress is counted at the chance of the
// furthest step they have reached.
const STEP_KEYS = ['applied', 'offer', 'mock', 'paid', 'cas', 'lodged', 'visa'];
// A journey has ended when the student has a visa, has left, or belongs to an intake that is over (an inquiry of last
// year that never went further did not turn into a visa, whatever its stage still says).
const hasEnded = (s) => s.visa || s.left || s.closed;
function visaChances(all) {
  const finished = all.filter(hasEnded);
  const chance = [];
  for (let i = 0; i <= STEP_KEYS.length; i += 1) {
    const reached = finished.filter((s) => s.p.furthest >= i);
    chance.push({ n: reached.length, p: reached.length >= MIN_SAMPLE ? reached.filter((s) => s.visa).length / reached.length : null });
  }
  return { finished: finished.length, chance };
}
function forecast(inProgress, chances) {
  if (chances.finished < MIN_SAMPLE) return null;
  let expected = 0;
  let variance = 0;
  let counted = 0;
  inProgress.forEach((s) => {
    // The chance of the furthest step reached; when too few finished students got that far, the nearest earlier step with enough.
    let i = Math.min(s.p.furthest, STEP_KEYS.length);
    while (i > 0 && chances.chance[i].p === null) i -= 1;
    const p = chances.chance[i].p;
    if (p === null) return;
    expected += p;
    variance += p * (1 - p);
    counted += 1;
  });
  const sd = Math.sqrt(variance);
  return { expected: round1(expected), low: Math.max(0, Math.floor(expected - sd)), high: Math.ceil(expected + sd), counted };
}

// ---- what was dated in the last 7 days against the 7 before ----
function weekly(students, todayIso) {
  const today = dayNumber(todayIso);
  const rows = [['inquiry', 'New inquiries'], ['applied', 'Applications submitted'], ['offer', 'Offers received'], ['paid', 'Payments made'], ['visa', 'Visas issued']];
  return rows.map(([key, label]) => {
    let last = 0;
    let before = 0;
    students.forEach((s) => {
      const d = today - dayNumber(s.dates[key]);
      if (d >= 0 && d < 7) last += 1; else if (d >= 7 && d < 14) before += 1;
    });
    return { key, label, last7: last, before7: before };
  });
}

// ---- the journey as a funnel: how many reach each step and what share of the step before goes on ----
function funnel(summary) {
  const steps = [['Students', summary.students], ['Applied', summary.applied], ['Offer received', summary.offers], ['Paid the deposit', summary.paid], ['CAS received', summary.cas], ['Visa lodged', summary.lodged], ['Visa issued', summary.visas]];
  return steps.map(([label, count], i) => ({ label, count, ofAll: pct(count, steps[0][1]), fromPrevious: i ? pct(count, steps[i - 1][1]) : null }));
}
// What was dated in each of the last 12 weeks (weeks end on today's weekday), to see the pace and whether it is rising.
function trend(students, todayIso) {
  const today = dayNumber(todayIso);
  const keys = ['inquiry', 'applied', 'offer', 'paid', 'visa'];
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: new Date((today - (11 - i) * 7 - 6) * DAY).toISOString().slice(0, 10), end: new Date((today - (11 - i) * 7) * DAY).toISOString().slice(0, 10), inquiry: 0, applied: 0, offer: 0, paid: 0, visa: 0 }));
  students.forEach((s) => keys.forEach((k) => {
    const d = today - dayNumber(s.dates[k]);
    if (d >= 0 && d < 84) weeks[11 - Math.floor(d / 7)][k] += 1;
  }));
  return weeks;
}

// ---- how complete the records are, and what each detail lets you decide ----
function completeness(students) {
  const lost = students.filter((s) => s.left || s.refused);
  const applied = students.filter((s) => s.p.reached.applied);
  const row = (label, group, has, decision) => ({ label, of: group.length, filled: group.filter(has).length, percent: pct(group.filter(has).length, group.length), decision });
  return [
    row('Student Source (on the sheet)', students, (s) => s.source, 'Which channels bring students, and where to put the marketing money.'),
    row('Where exactly (on the card)', students, (s) => s.detail, 'Which platform, event or partner inside a source works: "Social Media" alone cannot be acted on.'),
    row('First inquiry day (the day the student was added)', students, (s) => s.dates.inquiry, 'How long it takes to turn an inquiry into an application.'),
    row('Study level wanted', students, (s) => s.level, 'Which levels to promote, and which universities are missing from the portfolio.'),
    row('Grade and English score', students, (s) => s.grade && s.english, 'Lets the Fact File assistant name the universities each student is eligible for.'),
    row('Why the student did not go on', lost, (s) => s.lostReason, 'What to fix: price, speed, the portfolio, or the preparation of the students.'),
    row('Application submitted day', applied, (s) => s.dates.applied, 'The month charts, the speed of each university and the latest safe day to apply.'),
  ];
}

// ---- the plan for an intake: the numbers needed at each step to reach a number of visas ----
function pooledRates(all) {
  // Students of intakes that are over, or of any intake once their own journey has ended, tell how each step converts.
  const g = rates(all.reduce((acc, s) => count(acc, s), newGroup('all')));
  const ended = all.filter(hasEnded);
  const e = rates(ended.reduce((acc, s) => count(acc, s), newGroup('ended')));
  const safe = (n, of) => (of >= MIN_SAMPLE && n > 0 ? n / of : null);
  // The steps after the application are read from finished journeys only (a student still waiting for an offer is not a
  // lost one); where too few have finished yet, from every student.
  const step = (num, den) => (safe(e[num], e[den]) !== null ? { value: safe(e[num], e[den]), n: e[den] } : { value: safe(g[num], g[den]), n: g[den] });
  return {
    inquiryToApplication: { value: safe(g.applied, g.students), n: g.students },
    applicationToOffer: step('offers', 'applied'),
    offerToPayment: step('paid', 'offers'),
    paymentToVisa: step('visas', 'paid'),
    applicationToVisa: step('visas', 'applied'),
  };
}
function workBack(visas, r) {
  if (!visas) return null;
  const up = (n, rate) => (rate ? Math.ceil(n / rate) : null);
  const paid = up(visas, r.paymentToVisa.value);
  const offers = paid === null ? null : up(paid, r.offerToPayment.value);
  let applications = offers === null ? null : up(offers, r.applicationToOffer.value);
  if (applications === null) applications = up(visas, r.applicationToVisa.value); // the whole step when the parts are not known
  const inquiries = applications === null ? null : up(applications, r.inquiryToApplication.value);
  return { visas, paid, offers, applications, inquiries };
}
// The working-back schedule: each step with the weeks before the start by which it should be done. Rules of thumb for
// a UK intake from Nepal; a university's own deadline in the Fact File always comes first.
const SCHEDULE = [
  { key: 'leads', label: 'Lead generation at full strength (adverts, school and college visits)', from: 30, to: 12 },
  { key: 'event1', label: 'Main event or education fair', from: 24, to: 20 },
  { key: 'most', label: 'Most applications submitted (early applicants get the scholarships and the interview slots)', at: 14 },
  { key: 'event2', label: 'Last push: spot assessment or application day with the universities', from: 14, to: 11 },
  { key: 'apply', label: 'Applications submitted (last safe week)', at: 10 },
  { key: 'funds', label: 'Bank balance in place (it must be held 28 days before the visa application)', at: 9 },
  { key: 'offer', label: 'Offers in hand and conditions met', at: 8 },
  { key: 'interview', label: 'Mock interviews done and credibility interview passed', at: 8 },
  { key: 'deposit', label: 'Tuition deposit paid and CAS requested', at: 7 },
  { key: 'cas', label: 'CAS received', at: 5 },
  { key: 'lodge', label: 'Visa application lodged', at: 4 },
  { key: 'visa', label: 'Visa decision in hand, flight booked', at: 1 },
];
const APPLY_WEEKS = 10; // the last safe week to apply, in weeks before the start
function timeline(startIso, todayIso) {
  if (!startIso) return [];
  const today = dayNumber(todayIso);
  return SCHEDULE.map((s) => {
    const fromDay = addDays(startIso, -(s.from || s.at) * 7);
    const toDay = addDays(startIso, -(s.to || s.at) * 7);
    const state = dayNumber(toDay) < today ? 'past' : (dayNumber(fromDay) <= today ? 'now' : 'ahead');
    return { key: s.key, label: s.label, from: fromDay, to: toDay, weeksBefore: s.from ? `${s.from} to ${s.to}` : String(s.at), state };
  });
}

function buildInsights({ workbook, cards = {}, planning = {}, partners = [], b2b = [], sheetId = '', today: now = new Date(), admin = false }) {
  const todayIso = typeof now === 'string' ? now : localDate(now);
  const sheets = workbook.sheets || [];
  const all = readStudents(workbook, cards);
  // An intake is over once its start day has passed (the day typed with its target, else late in the month its name
  // gives); a sheet with no month in its name counts as over when a newer sheet exists.
  const newest = newestSheet(sheets);
  const targetsOf = (planning && planning.targets) || {};
  const startOf = (sheet) => (targetsOf[sheet.id] && targetsOf[sheet.id].startDate) || guessStart(sheet.name);
  const todayNumber = dayNumber(typeof now === 'string' ? now : localDate(now));
  const closedIds = new Set(sheets.filter((sh) => (startOf(sh) ? dayNumber(startOf(sh)) < todayNumber : sh !== newest)).map((sh) => sh.id));
  all.forEach((s) => { s.closed = closedIds.has(s.sheetId); });
  const everyIntake = sheetId === 'all';
  const selectedSheet = everyIntake ? null : (sheets.find((s) => s.id === sheetId) || newestSheet(sheets) || null);
  const students = everyIntake ? all : all.filter((s) => selectedSheet && s.sheetId === selectedSheet.id);
  const plan = { targets: {}, spend: [], events: [], decisions: [], market: [], settings: {}, ...planning };
  const spendLines = plan.spend.filter((l) => everyIntake || !l.intake || (selectedSheet && l.intake === selectedSheet.id));
  const scopeName = everyIntake ? 'all intakes' : (selectedSheet ? selectedSheet.name : '');

  // -- headline numbers and every intake side by side --
  const summary = rates(students.reduce((g, s) => count(g, s), newGroup(scopeName)));
  const intakes = sheets.map((sh) => {
    const mine = all.filter((s) => s.sheetId === sh.id);
    const target = plan.targets[sh.id] || null;
    return { id: sh.id, ...rates(mine.reduce((g, s) => count(g, s), newGroup(sh.name))), season: intakeSeason(sh.name), target: target ? target.visas : 0 };
  });
  // The intake to compare with: the same month a year or more earlier, else the one before in the tab order.
  let comparable = null;
  if (selectedSheet) {
    const season = intakeSeason(selectedSheet.name);
    const earlier = intakes.filter((i) => i.id !== selectedSheet.id && i.season && season && i.season.month === season.month && i.season.year < season.year)
      .sort((a, b) => b.season.year - a.season.year)[0];
    const index = sheets.findIndex((s) => s.id === selectedSheet.id);
    comparable = earlier || (index > 0 ? intakes[index - 1] : null);
  }

  // -- channels, universities, partners, courses --
  const channels = channelTable(students, spendLines);
  const channelsAll = everyIntake ? channels : channelTable(all, plan.spend);
  const universities = groupBy(students.filter((s) => s.p.reached.applied || s.university), (s) => s.university);
  const partnerGroups = groupBy(students.filter((s) => s.p.reached.applied || s.partner), (s) => s.partner);
  const courses = groupBy(students.filter((s) => s.course), (s) => s.course).slice(0, 15);
  const levels = groupBy(students, (s) => s.level);
  const uniConcentration = { applications: concentration(universities, 'applied'), visas: concentration(universities, 'visas') };
  const partnerConcentration = { applications: concentration(partnerGroups, 'applied'), visas: concentration(partnerGroups, 'visas') };
  const uniSpeed = [...new Set(students.map((s) => s.university).filter(Boolean))].map((u) => {
    const days = students.filter((s) => s.university === u).map((s) => dayNumber(s.dates.offer) - dayNumber(s.dates.applied)).filter((d) => d >= 0 && d <= 365);
    return { label: u, samples: days.length, median: days.length >= 3 ? Math.round(median(days)) : null };
  }).filter((u) => u.median !== null).sort((a, b) => b.median - a.median);

  // -- events and campaigns --
  const eventRows = plan.events.map((e) => {
    const mine = all.filter((s) => s.detail.toLowerCase() === e.name.toLowerCase());
    const g = rates(mine.reduce((acc, s) => count(acc, s), newGroup(e.name)));
    return { ...g, id: e.id, date: e.date, type: e.type, place: e.place, cost: e.cost, registered: e.registered, attended: e.attended, costPerStudent: costPer(e.cost, g.students), costPerVisa: costPer(e.cost, g.visas), showUp: pct(e.attended, e.registered) };
  }).sort((a, b) => b.date.localeCompare(a.date));
  // -- why students are lost, and what they wanted that you could not offer --
  const gone = students.filter((s) => (s.left && !s.refused) || s.refused || s.lostReason);
  const lostReasons = groupBy(gone, (s) => s.lostReason).map((g) => ({ label: g.label, count: g.students, percent: pct(g.students, gone.length) }));
  // What lost students were looking for that you could not give, read from their cards: the same subject and level asked for again and again.
  const unmetReasons = ['Course or university not available with us', 'Fees or deposit too high', 'Grades or study gap not accepted', 'English score not enough'];
  const wantedMap = new Map();
  gone.filter((s) => s.subject && unmetReasons.includes(s.lostReason)).forEach((s) => {
    const key = `${s.subject.toLowerCase()}|${s.level}`;
    const e = wantedMap.get(key) || wantedMap.set(key, { subject: s.subject, level: s.level, count: 0, reasons: new Set(), where: new Set() }).get(key);
    e.count += 1; e.reasons.add(s.lostReason); if (s.where) e.where.add(s.where);
  });
  const wanted = [...wantedMap.values()].sort((a, b) => b.count - a.count).slice(0, 15).map((e) => ({ subject: e.subject, level: e.level, count: e.count, reasons: [...e.reasons], where: [...e.where].slice(0, 3) }));

  const today = dayNumber(todayIso);
  const inProgress = students.filter((s) => s.active);

  // -- target and forecast --
  const chances = visaChances(all);
  const target = selectedSheet ? (plan.targets[selectedSheet.id] || null) : null;
  const over = Boolean(selectedSheet && closedIds.has(selectedSheet.id)); // the intake has started: what it has is what it got
  const fc = over ? null : forecast(inProgress, chances);
  const startDate = selectedSheet ? ((target && target.startDate) || guessStart(selectedSheet.name)) : '';
  const pooled = pooledRates(all);
  let targetView = null;
  if (selectedSheet) {
    const visasNow = summary.visas;
    const expectedTotal = over ? visasNow : (fc ? round1(visasNow + fc.expected) : null);
    const gap = target && target.visas && expectedTotal !== null ? Math.max(0, Math.ceil(target.visas - expectedTotal)) : null;
    const perApplication = pooled.applicationToVisa.value;
    const applicationsNeeded = gap !== null && perApplication ? Math.ceil(gap / perApplication) : null;
    const closeDay = startDate ? addDays(startDate, -APPLY_WEEKS * 7) : '';
    const weeksLeft = closeDay ? Math.max(0, Math.floor((dayNumber(closeDay) - today) / 7)) : null;
    targetView = {
      visas: target ? target.visas : 0, byDate: target ? target.byDate : '', note: target ? target.note : '', startDate, startGuessed: !(target && target.startDate),
      visasNow, forecast: fc, expectedTotal, gap, applicationsNeeded, weeksLeft, applicationsClose: closeDay,
      perWeek: applicationsNeeded !== null && weeksLeft ? Math.ceil(applicationsNeeded / weeksLeft) : null,
      status: !target || !target.visas ? 'none' : (visasNow >= target.visas ? 'reached' : (over ? 'missed' : (expectedTotal === null ? 'unknown' : (expectedTotal >= target.visas ? 'on-track' : 'behind')))),
      finishedStudents: chances.finished, over,
    };
  }

  // -- the plan --
  const base = comparable || (selectedSheet ? intakes.find((i) => i.id === selectedSheet.id) : null);
  const scenarios = [];
  if (base && base.visas) {
    [['Hold', 1, `The same as ${base.label}`], ['Grow', 1.2, `20% more than ${base.label}`], ['Stretch', 1.4, `40% more than ${base.label}`]]
      .forEach(([name, factor, basis]) => scenarios.push({ name, basis, ...workBack(Math.ceil(base.visas * factor), pooled) }));
  }
  if (target && target.visas) scenarios.push({ name: 'Your target', basis: 'The target set for this intake', ...workBack(target.visas, pooled) });
  const sp = speed(all);
  const wholeJourney = sp.find((x) => x.key === 'applicationToVisa');
  const ownLatestApply = startDate && wholeJourney && wholeJourney.median !== null ? addDays(startDate, -(wholeJourney.median + 21)) : '';
  // What the target needs, what you already have, and what is still to find (the plan the owner works from every week).
  const needBase = target && target.visas ? workBack(target.visas, pooled) : null;
  const needs = needBase ? [['Inquiries', needBase.inquiries, summary.students], ['Applications', needBase.applications, summary.applied], ['Offers', needBase.offers, summary.offers], ['Paid the deposit', needBase.paid, summary.paid], ['Visas', needBase.visas, summary.visas]]
    .map(([label, need, have]) => ({ label, need, have, left: need === null ? null : Math.max(0, need - have) })) : [];
  const appLeft = needs.length ? needs[1].left : null;
  const closing = targetView && targetView.weeksLeft !== null ? targetView.weeksLeft : null;
  const weeklyPace = {
    applicationsPerWeek: appLeft !== null && closing ? Math.ceil(appLeft / closing) : null,
    inquiriesPerWeek: needs.length && needs[0].left !== null && closing ? Math.ceil(needs[0].left / closing) : null,
    weeksLeft: closing, closes: targetView ? targetView.applicationsClose : '',
    applicationsLastWeek: weekly(students, todayIso)[1].last7,
  };
  const channelPlan = needs.length && needs[0].left ? channelsAll.sources.filter((c) => !c.spendOnly && c.label !== NONE && c.share).map((c) => {
    const students = Math.round(needs[0].left * c.share / 100);
    return { label: c.label, students, budget: c.costPerStudent ? students * c.costPerStudent : null, costPerStudent: c.costPerStudent, low: c.low };
  }) : [];
  const planView = {
    intake: scopeName, startDate, comparable: comparable ? { label: comparable.label, students: comparable.students, applied: comparable.applied, visas: comparable.visas, leadToVisa: comparable.leadToVisa } : null,
    rates: Object.fromEntries(Object.entries(pooled).map(([k, v]) => [k, { percent: v.value === null ? null : round1(v.value * 100), n: v.n }])),
    needs, weeklyPace, channelPlan, scenarios, timeline: timeline(startDate, todayIso), ownLatestApply, ownJourneyDays: wholeJourney ? wholeJourney.median : null,
    // The mix of channels of the comparable intake (or of every intake), as the starting point for the lead target of each channel.
    channelMix: channelsAll.sources.filter((s) => !s.spendOnly && s.label !== NONE).map((s) => ({ label: s.label, share: s.share, toApplication: s.toApplication, leadToVisa: s.leadToVisa, costPerStudent: s.costPerStudent, low: s.low })),
    costPerLead: costPer(channelsAll.spendTotal, all.length),
  };

  // -- the findings: what stands out, with the decision each asks for --
  const findings = [];
  const add = (priority, area, title, evidence, why, decision, measure, confidence = 'Medium') => findings.push({ priority, area, title, evidence, why, decision, measure, confidence });
  const n = students.length;
  if (n === 0) {
    add('P2', 'Data', 'There are no students in this intake yet', ['0 students recorded.'], 'Nothing can be measured or planned without the records.', 'Record every inquiry as a student at the Inquiry stage, from the first call or visit.', 'Students recorded each week.', 'High');
  }
  if (targetView && targetView.status === 'missed') {
    add('P2', 'Target', `${scopeName} ended ${plural(targetView.visas - targetView.visasNow, 'visa', 'visas')} short of its target`, [`Target: ${targetView.visas} visas. Reached: ${targetView.visasNow}.`],
      'The reasons for the shortfall are the most useful input for the next plan.', 'Write the outcome and the lesson in the Decision log, and carry the lesson into the plan of the next intake.', 'Target against result, intake by intake.', 'High');
  }
  if (targetView && targetView.status === 'behind') {
    add('P1', 'Target', `The intake is forecast to miss its target by about ${plural(targetView.gap, 'visa', 'visas')}`,
      [`Target: ${targetView.visas} visas. Visas so far: ${targetView.visasNow}.`, `The ${fc.counted} students in progress are likely to add about ${fc.expected} (between ${fc.low} and ${fc.high}), from your own past rates.`,
        ...(targetView.applicationsNeeded !== null ? [`To close the gap about ${targetView.applicationsNeeded} more applications are needed${targetView.perWeek ? `, about ${targetView.perWeek} a week for the ${targetView.weeksLeft} weeks before applications should close (${targetView.applicationsClose})` : ''}.`] : [])],
      'A gap seen now can still be closed with new applications; seen after applications close, it cannot.',
      targetView.weeksLeft === 0 ? 'Applications should already be closed for a safe visa timeline: concentrate on converting every offer and payment in progress, and move the remaining target to the next intake.' : 'Agree this week where the extra applications come from: the offers not yet paid, the warm inquiries with no follow-up, and one extra push on the best channel.',
      'Applications submitted each week against the weekly number above.', fc.counted >= MIN_SAMPLE ? 'Medium' : 'Low');
  } else if (targetView && targetView.status === 'none' && n > 0) {
    add('P2', 'Target', `No visa target is set for ${scopeName}`, [`${summary.visas} visas so far from ${n} students.`, ...(comparable ? [`${comparable.label} ended with ${comparable.visas} visas.`] : [])],
      'Without a target there is no weekly number to steer by, and no way to say whether the intake is on track.',
      'Set the target on the Intake plan page. The plan there shows what each choice needs in applications and inquiries.', 'Target set, and reviewed every Monday.', 'High');
  }
  if (uniConcentration.applications.total >= MIN_SAMPLE && uniConcentration.applications.topShare >= 40) {
    add(uniConcentration.applications.topShare >= 60 ? 'P1' : 'P2', 'Universities', `${uniConcentration.applications.topShare}% of applications rest on one university`,
      [`${uniConcentration.applications.top}: ${uniConcentration.applications.topShare}% of ${uniConcentration.applications.total} applications.`, `The top three universities hold ${uniConcentration.applications.top3Share}%. Students are placed at ${uniConcentration.applications.count} universities in all.`],
      'If that university changes its entry rules, its agents in Nepal or its deposit, most of the intake is hit at once. you cannot control that decision.',
      'Keep the partnership strong, and open a second and third option for the same kind of student: pick two universities from the Fact File with similar entry rules and fees, and offer them first in every new counseling this month.',
      'Share of applications at the biggest university, aiming below 40%.', 'High');
  }
  if (partnerConcentration.applications.total >= MIN_SAMPLE && partnerConcentration.applications.topShare >= 50) {
    add('P2', 'Partners', `${partnerConcentration.applications.topShare}% of applications go through one partner`,
      [`${partnerConcentration.applications.top}: ${partnerConcentration.applications.topShare}% of ${partnerConcentration.applications.total} applications with a partner recorded.`],
      'Processing speed, information and commission for most students depend on one company.',
      'List which of these universities you could hold directly or through a second partner, and start one such agreement before the next intake.',
      'Share of applications through the biggest partner.', 'Medium');
  }
  const decided = summary.visas + summary.refused;
  if (decided >= MIN_SAMPLE && summary.refused / decided >= 0.1) {
    add('P1', 'Visa', `${pct(summary.refused, decided)}% of visa decisions were refusals`, [`${summary.refused} refused out of ${decided} decided.`],
      'Universities watch the refusal rate of each agent, because their own licence depends on it. A high rate can cost you a partnership.',
      'Review every refusal letter this month, find the common reason (funds, interview, documents), and add that check before the CAS is requested.',
      'Refusals as a share of decisions, aiming below 10%.', 'High');
  }
  const offersUnpaid = students.filter((s) => s.active && s.p.reached.offer && !s.p.reached.paid).length;
  if (!over && offersUnpaid >= 5) {
    add('P2', 'Pipeline', `${offersUnpaid} students hold an offer but have not paid the deposit`, [`${summary.offers} offers so far, ${summary.paid} paid.`, ...(pooled.offerToPayment.value ? [`In the past ${round1(pooled.offerToPayment.value * 100)}% of offers were paid.`] : [])],
      'These students have already been through counseling, the application and the offer: they are the cheapest visas left to win.',
      'Call each of them this week with the Tuition deposit template and a clear last day to pay; note the reason of anyone who is not going to pay.',
      'Offers paid within 14 days.', 'High');
  }
  const staleInquiries = over ? students.filter((s) => s.inquiry).length : 0;
  if (staleInquiries >= 5) {
    add('P3', 'Data', `${staleInquiries} students of ${scopeName} are still at Inquiry although the intake has started`, [`${pct(staleInquiries, n)}% of the students on this sheet.`],
      'Each is either a student for the next intake or a lost one with a reason. Left as they are they hide both.',
      'Go through them once: move the ones still interested to the next intake (set Defer), and close the others with the reason on their card.', 'Students left at Inquiry on a finished intake, aiming at none.', 'High');
  }
  // How complete the records are.
  const quality = completeness(students);
  const q = (label) => quality.find((x) => x.label.startsWith(label));
  if (n >= MIN_SAMPLE) {
    const detail = q('Where exactly');
    if (detail.percent !== null && detail.percent < 70) {
      add('P2', 'Data', `${detail.of - detail.filled} of ${detail.of} students have no "where exactly" for their source`, [`Only ${detail.percent}% of cards say which platform, event or partner the student came from.`],
        '"Social Media" or "Events" alone cannot be acted on: the money goes to one platform or one event, not to a heading.',
        'Fill in "where exactly" on the card of every student of this intake, and make it part of adding a student.', 'Share of cards with "where exactly", aiming above 90%.', 'High');
    }
    const reason = q('Why the student did not go on');
    if (reason.of >= 5 && reason.percent !== null && reason.percent < 60) {
      add('P2', 'Data', `${reason.of - reason.filled} lost students have no reason recorded`, [`${reason.of} students are withdrawn, on hold, deferred or refused; a reason is recorded for ${reason.filled}.`],
        'The reasons students leave are the cheapest market research you can get. Without them every fix is a guess.',
        'Ask the reason in the last call and pick it on the card before closing a student.', 'Share of lost students with a reason, aiming above 90%.', 'High');
    }
    // Only students who applied seem to be on the sheet: the first step of the funnel is missing.
    if (summary.applied / n >= 0.85 && summary.inquiries <= n * 0.1) {
      add('P2', 'Data', 'Almost every student on the sheet has already applied: inquiries are not being recorded', [`${summary.applied} of ${n} students have applied; only ${summary.inquiries} are at Inquiry.`],
        'If only the students who go ahead are typed in, every channel looks as if it converts almost fully, and the real question (how many inquiries does a visa cost?) cannot be answered.',
        'Record every serious inquiry with Add student on the day it comes in, even if the student never applies.', 'Inquiries recorded each week, and the share that go on to apply.', 'Medium');
    }
  }
  if (plan.spend.length === 0 && n >= MIN_SAMPLE) {
    add('P2', 'Marketing', 'No marketing spend is recorded', ['The spend table on the Channels page is empty.'],
      'Without what each channel cost, the cost of a lead, an application and a visa cannot be worked out, so the budget cannot be moved to what works.',
      'Enter the spend of each month by source (adverts, events, printing, agent payments) on the Channels page. Ten minutes a month.', 'Months with spend recorded.', 'High');
  } else if (channels.spendTotal > 0) {
    const paidFor = channels.sources.filter((s) => s.spend > 0);
    const noVisa = paidFor.filter((s) => s.students >= MIN_SAMPLE && s.visas === 0 && s.active === 0);
    noVisa.forEach((s) => add('P2', 'Marketing', `${s.label} cost Rs ${s.spend.toLocaleString('en-IN')} and has produced no visa`, [`${s.students} students recorded from it, ${s.applied} applied, none with a visa and none still in progress.`],
      'Money that brings inquiries but no enrolments is the first place to save.', `Stop or sharply cut ${s.label} for the next intake unless the students it brings can be shown to be different next time.`, 'Cost per visa of the channel.', 'Medium'));
    const rupees = (v) => `Rs ${v.toLocaleString('en-IN')}`;
    const compareCost = (list, key, countKey, noun) => {
      if (list.length < 2) return false;
      const sorted = [...list].sort((a, b) => a[key] - b[key]);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (worst[key] < best[key] * 2) return false;
      add('P2', 'Marketing', `${noun === 'visa' ? 'A visa' : 'An application'} from ${worst.label} costs ${round1(worst[key] / best[key])} times one from ${best.label}`,
        [`${best.label}: ${rupees(best[key])} per ${noun} (${best[countKey]} ${noun}s, ${rupees(best.spend)} spent).`, `${worst.label}: ${rupees(worst[key])} per ${noun} (${worst[countKey]} ${noun}s, ${rupees(worst.spend)} spent).`],
        'The same rupee buys more in one channel than in the other.', `Move part of the next budget from ${worst.label} to ${best.label}, as a test for one intake, and compare again.`, `Cost per ${noun} by channel after the next intake.`, 'Medium');
      return true;
    };
    // Compared only where each side has enough to count: five visas, or else fifteen applications. Fewer would only show chance.
    if (!compareCost(paidFor.filter((s) => s.costPerVisa !== null && s.visas >= 5), 'costPerVisa', 'visas', 'visa')) {
      compareCost(paidFor.filter((s) => s.costPerApplication !== null && s.applied >= 15), 'costPerApplication', 'applied', 'application');
    }
  }
  const topLost = lostReasons.filter((r) => r.label !== NONE)[0];
  const lostKnown = lostReasons.filter((r) => r.label !== NONE).reduce((sum, r) => sum + r.count, 0);
  if (topLost && lostKnown >= 5 && topLost.count / lostKnown >= 0.3) {
    const fix = {
      'Chose another consultancy': 'Look at the speed of the first reply and the first offer: call three of these students and ask what the other consultancy did better.',
      'Applied by themselves': 'Show what you add that a student cannot do alone (interview preparation, visa file check, scholarship follow-up) in the first counseling and the first email.',
      'Chose another country': 'Find out which country and why (cost, work rights, visa odds), and answer exactly that point in the counseling.',
      'Fees or deposit too high': 'Lead with the lower-fee universities and the scholarships in the Fact File, and send the options email with fee and scholarship side by side on the first day.',
      'Funds or bank balance not ready': 'Start the funds talk at the first counseling, not after the offer: explain the 28-day rule and the loan route early.',
      'English score not enough': 'Offer the language class and the universities with an internal test or MOI route; follow up after the next test date.',
      'Grades or study gap not accepted': 'Use the option finder for universities that accept a lower grade or a longer gap, before saying no.',
      'Course or university not available with us': 'This is a portfolio gap: list the courses asked for and seek a partner for the most asked one.',
      'University rejected the application': 'Check the entry rules in the Fact File before applying, and ask the university for the reason of each rejection.',
      'Failed the credibility or Pre-CAS interview': 'More mock interviews before the real one, and a second mock for anyone who scores low in the first.',
      'Visa refused': 'Review each refusal letter and add the missing check before the CAS is requested.',
      'Family or personal decision': 'Invite the parents to the counseling; many of these decisions are made by the family.',
      'Postponed to a later intake': 'Keep them warm: a note on the card to call them when the next intake opens.',
      'Stopped answering': 'Shorten the time to the first call, and use WhatsApp as well as phone calls.',
    }[topLost.label] || 'Look at these students one by one and note what they have in common.';
    add('P2', 'Lost students', `The main reason students are lost: ${topLost.label.toLowerCase()}`, [`${topLost.count} of the ${lostKnown} lost students with a reason (${pct(topLost.count, lostKnown)}%).`, ...lostReasons.filter((r) => r.label !== NONE).slice(1, 3).map((r) => `${r.label}: ${r.count}.`)],
      'One reason behind a third or more of the losses is a pattern, not bad luck.', fix, 'Students lost for this reason next intake.', lostKnown >= MIN_SAMPLE ? 'Medium' : 'Low');
  }
  if (wanted.length && wanted[0].count >= 3) {
    add('P3', 'Universities', `${wanted[0].count} lost students were looking for ${wanted[0].subject}${wanted[0].level ? ` (${wanted[0].level})` : ''}, which you could not give`, wanted.slice(0, 4).map((w) => `${w.count} x ${w.subject}${w.level ? ` (${w.level})` : ''}: ${w.reasons.join(', ').toLowerCase()}`),
      'Each is a student another consultancy enrolled. Together they show which university or course is missing from the portfolio.',
      'Group these by course, and approach a university (or a B2B partner that has it) for the most asked one.', 'Requests that could not be served, by course.', 'Low');
  }
  // The weakest step of the journey, against the comparable intake.
  if (comparable && !summary.low && !comparable.low && selectedSheet && closedIds.has(selectedSheet.id)) {
    [['toApplication', 'from inquiry to application', 'applied'], ['toOffer', 'from application to offer', 'offers'], ['toPayment', 'from offer to payment', 'paid']].forEach(([key, words]) => {
      if (summary[key] !== null && comparable[key] !== null && comparable[key] - summary[key] >= 15) {
        add('P2', 'Pipeline', `Fewer students are going ${words} than in ${comparable.label}`, [`${scopeName}: ${summary[key]}%. ${comparable.label}: ${comparable[key]}%.`],
          'A step that converts worse than last time usually has one cause that can be found: a slower partner, a new rule, or follow-ups slipping.',
          'Look at the students stuck at this step on the Team page and ask what each is waiting for.', `The share going ${words}.`, 'Low');
      }
    });
  }
  // Agreements that are ending (Admin only: the partner records are Admin's).
  const agreements = [];
  if (admin) {
    const soon = (label, kind, end) => {
      const iso = isoDate(end) || (/^\d{4}-\d{2}-\d{2}$/.test(text(end)) ? text(end) : '');
      const parsed = iso || (Number.isNaN(Date.parse(text(end))) ? '' : new Date(Date.parse(text(end))).toISOString().slice(0, 10));
      if (!text(end)) { agreements.push({ label, kind, end: '', days: null, state: 'no-date' }); return; }
      if (!parsed) { agreements.push({ label, kind, end: text(end), days: null, state: 'unread' }); return; }
      const days = Math.round(dayNumber(parsed) - today);
      agreements.push({ label, kind, end: parsed, days, state: days < 0 ? 'ended' : (days <= 90 ? 'soon' : 'ok') });
    };
    partners.filter((u) => u.status !== 'Ended').forEach((u) => soon(u.name, 'University', u.agreementEnd));
    b2b.filter((p) => p.status !== 'Ended').forEach((p) => soon(p.name, 'B2B partner', p.agreementEnd));
    const ending = agreements.filter((a) => a.state === 'soon' || a.state === 'ended');
    if (ending.length) {
      add('P1', 'Partners', `${plural(ending.length, 'agreement ends', 'agreements end')} within 90 days or ${ending.length === 1 ? 'has' : 'have'} already ended`, ending.slice(0, 5).map((a) => `${a.label}: ${a.state === 'ended' ? `ended ${-a.days} days ago` : `ends in ${a.days} days`} (${a.end}).`),
        'Applications sent after an agreement has lapsed may earn no commission, and a renewal left late is negotiated from a weak position.',
        'Write to each contact person this week to renew, and note the answer on the partner page.', 'Agreements renewed before their end day.', 'High');
    }
  }
  const order = { P1: 0, P2: 1, P3: 2 };
  findings.sort((a, b) => order[a.priority] - order[b.priority]);

  // The business in a few sentences, then the money (Admin only: what a visa is worth is Admin's own assumption).
  const headline = [];
  headline.push(`${scopeName}: ${summary.students} students, ${summary.applied} applied (${pct(summary.applied, summary.students) ?? 0}%), ${summary.offers} with an offer, ${summary.paid} paid and ${summary.visas} with a visa.`);
  if (targetView && targetView.visas) headline.push(targetView.status === 'reached' ? `The target of ${targetView.visas} visas is reached.` : targetView.status === 'missed' ? `The intake ended ${targetView.visas - targetView.visasNow} visas short of its target of ${targetView.visas}.` : targetView.expectedTotal !== null ? `The target is ${targetView.visas} visas and the forecast is about ${targetView.expectedTotal}: ${targetView.status === 'behind' ? `about ${targetView.gap} short` : 'on track'}.` : `The target is ${targetView.visas} visas; there is not enough history to forecast yet.`);
  const bestChannel = [...channels.sources].filter((x) => !x.spendOnly && x.students >= MIN_SAMPLE && x.visas >= 3 && x.leadToVisa !== null).sort((a, b) => b.leadToVisa - a.leadToVisa)[0];
  if (bestChannel) headline.push(`${bestChannel.label} is the strongest source: ${bestChannel.leadToVisa}% of its ${bestChannel.students} students reach a visa.`);
  const value = admin && plan.settings && plan.settings.valuePerVisa ? plan.settings.valuePerVisa : 0;
  const money = value ? {
    valuePerVisa: value, earned: summary.visas * value, expected: targetView && targetView.expectedTotal !== null ? Math.round(targetView.expectedTotal * value) : null,
    spend: channels.spendTotal, returnOnSpend: channels.spendTotal ? round1((summary.visas * value) / channels.spendTotal) : null,
  } : null;

  return {
    asOf: new Date().toISOString(), today: todayIso,
    headline, funnel: funnel(summary), trend: trend(students, todayIso), money,
    intakes: sheets.map((s) => ({ id: s.id, name: s.name })), selected: everyIntake ? 'all' : (selectedSheet ? selectedSheet.id : ''), scope: scopeName,
    summary, comparable, compare: intakes,
    findings,
    target: targetView,
    weekly: weekly(students, todayIso),
    channels: { sources: channels.sources, spendTotal: channels.spendTotal, reportedLeads: channels.reportedLeads },
    events: eventRows,
    universities: { list: universities.slice(0, 25), concentration: uniConcentration, speed: uniSpeed.slice(0, 12) },
    partners: { list: partnerGroups.slice(0, 20), concentration: partnerConcentration, agreements },
    courses, levels,
    lost: { total: gone.length, reasons: lostReasons, wanted },
    speed: sp,
    quality,
    plan: planView,
    minSample: MIN_SAMPLE,
  };
}

module.exports = { buildInsights, readStudents, intakeSeason, guessStart, visaChances, forecast, workBack, pooledRates, channelTable, concentration, completeness, timeline, MIN_SAMPLE, NONE };

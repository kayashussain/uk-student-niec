// The numbers behind the dashboard, worked out on the server from the workbook so a screen gets a few
// kilobytes of totals instead of every student's record.
//
// buildDashboard(workbook, { sheetId, includeHidden, today }) -> plain object, see the end of the file.
// Only rows with a first or last name count as students (blank added rows are ignored), the same rule
// as the cards on the Student Details page.
//
// How a student's progress is read. A student is "at" the step their status says, but the dates and
// amounts filled in count too, and a later step proves the earlier ones: someone at Visa Issued must have
// applied, had an offer, done a mock interview and paid, even if nobody typed those dates in. Counting
// only typed dates made old sheets (built before every column was tracked) read as "18 visas, 0
// applications". So every step is counted from either its own entry or any later step, and the
// `quality` block says how many students were filled in this way, so nothing looks hidden.

const { parseNum, netTuitionFee } = require('./calc');

// The stages in the order a student moves through them, then the ones that leave the pipeline.
const PIPELINE = ['Inquiry', 'Application Stage', 'Mock Stage', 'Payment Stage', 'CAS Stage', 'CAS Issued', 'Visa Lodge', 'Visa Issued'];
const LEFT = ['Visa Rejected', 'Defer', 'Withdrawn'];
const SOURCES = ['Visitor', 'Reference', 'Branch', 'Agents', 'Events', 'Social Media'];
const TOP_N = 8;
const MONTHS = 12;
const DAY = 86400000;

// The steps of the journey, in order. `need` is the earliest pipeline stage that proves the step.
const STEPS = [
  { key: 'applied', label: 'Application submitted', stage: 2 },
  { key: 'offer', label: 'Offer received', stage: 2 },
  { key: 'mock', label: 'Mock interview held', stage: 3 },
  { key: 'paid', label: 'Payment made', stage: 3 },
  { key: 'cas', label: 'CAS received', stage: 5 },
  { key: 'lodged', label: 'Visa lodged', stage: 6 },
  { key: 'visa', label: 'Visa issued', stage: 7 },
];
// Chances used until enough students have finished to learn them from the data (weighted as 8 students).
const PRIOR_WEIGHT = 8;
const PRIOR_VISA = [0.12, 0.2, 0.3, 0.45, 0.8, 0.88, 0.92, 1]; // by furthest step: none, applied ... visa
const PRIOR_PAY = [0.2, 0.3, 0.45, 0.65, 1, 1, 1, 1];

const text = (v) => String(v ?? '').trim();
const has = (row, col) => text(row[col]) !== '';

// "2026-03-05" or "3/5/2026" (month first, as the sheet shows it) -> "2026-03-05", else ''.
function isoDate(v) {
  const s = text(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}
const monthOf = (v) => isoDate(v).slice(0, 7);
const dayNumber = (v) => {
  const iso = isoDate(v);
  return iso ? Date.parse(iso + 'T00:00:00Z') / DAY : NaN;
};

const isStudent = (row) => has(row, 'FIRST NAME') || has(row, 'LAST NAME');
const INSTALLMENTS = ['TUITION FEE DEPOSIT(1st Installment)', 'TUITION FEE DEPOSIT(2nd Installment)', 'TUITION FEE DEPOSIT(3rd Installment)'];
const deposits = (row) => INSTALLMENTS.reduce((sum, c) => sum + parseNum(row[c]), 0);

// The last `n` calendar months up to and including the month of `today`, as "YYYY-MM".
function lastMonths(today, n) {
  const out = [];
  let y = today.getFullYear();
  let m = today.getMonth(); // 0-based
  for (let i = 0; i < n; i += 1) {
    out.unshift(`${y}-${String(m + 1).padStart(2, '0')}`);
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return out;
}

const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round1 = (n) => Math.round(n * 10) / 10;

// What one student has reached. `direct` is the evidence typed in; the rest is carried back from later steps.
function progressOf(row, status) {
  const rank = PIPELINE.indexOf(status);
  const mockEntered = [1, 2, 3, 4].some((n) => has(row, `MOCK SCHEDULE ${n}`));
  const direct = {
    applied: has(row, 'APPLICATION SUBMISSION DATE'),
    offer: has(row, 'OFFER RECEIVED DATE'),
    mock: mockEntered,
    paid: has(row, 'PAYMENT DATE') || deposits(row) > 0,
    cas: has(row, 'CAS RECEIVED DATE'),
    lodged: has(row, 'VISA LODGE DATE') || has(row, 'VFS ATTENDED DATE') || status === 'Visa Rejected',
    visa: status === 'Visa Issued' || has(row, 'VISA RECEIVED DATE'),
  };
  const reached = {};
  STEPS.forEach((s) => { reached[s.key] = direct[s.key] || (rank >= s.stage); });
  // A later step proves every earlier one.
  for (let i = STEPS.length - 2; i >= 0; i -= 1) {
    if (STEPS[i + 1] && reached[STEPS[i + 1].key]) reached[STEPS[i].key] = true;
  }
  // The CAS requested date also shows the payment was made.
  if (has(row, 'CAS REQUESTED DATE')) { reached.paid = true; reached.mock = true; reached.offer = true; reached.applied = true; }
  const filledIn = STEPS.some((s) => reached[s.key] && !direct[s.key]);
  const furthest = STEPS.reduce((n, s, i) => (reached[s.key] ? i + 1 : n), 0); // 0 = none yet
  return { reached, direct, filledIn, furthest };
}

function newGroup() {
  return { count: 0, paid: 0, visas: 0, left: 0 };
}
function bump(map, label, p, isLeft) {
  const g = map.get(label) || map.set(label, newGroup()).get(label);
  g.count += 1;
  if (p.reached.paid) g.paid += 1;
  if (p.reached.visa) g.visas += 1;
  if (isLeft) g.left += 1;
}
// The biggest `n` groups by count, the rest folded into "Other".
function topGroups(map, n) {
  const list = [...map.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (list.length <= n) return list;
  const rest = list.slice(n);
  const sum = (key) => rest.reduce((s, g) => s + g[key], 0);
  return [...list.slice(0, n), { label: 'Other', count: sum('count'), paid: sum('paid'), visas: sum('visas'), left: sum('left'), other: true }];
}

// Settled students (finished one way or the other) show how likely a student at each step is to pay and to
// get a visa. Learned from every intake, so a new intake with few finished students still gets a sensible
// forecast; until there are enough of them, the starting chances above carry the estimate.
function learnRates(students) {
  const settled = students.filter((s) => s.settled);
  const rates = PRIOR_VISA.map((_, step) => {
    const here = settled.filter((s) => s.p.furthest >= step);
    const visa = here.filter((s) => s.p.reached.visa).length;
    const pay = here.filter((s) => s.p.reached.paid).length;
    return {
      n: here.length,
      visa: (visa + PRIOR_VISA[step] * PRIOR_WEIGHT) / (here.length + PRIOR_WEIGHT),
      pay: (pay + PRIOR_PAY[step] * PRIOR_WEIGHT) / (here.length + PRIOR_WEIGHT),
    };
  });
  return { rates, settled: settled.length };
}

// What needs chasing, with the days it has waited. Each rule: who, why, since which date.
function chaseRules(row, status, p, today) {
  const out = [];
  const waited = (col) => { const d = dayNumber(row[col]); return Number.isNaN(d) ? null : Math.floor(today / DAY - d); };
  const rule = (key, reason, days) => out.push({ key, reason, days: days ?? 0 });
  if (status === 'Mock Stage' && !p.direct.mock) rule('mockUnscheduled', 'At Mock Stage, no mock interview scheduled', waited('OFFER RECEIVED DATE'));
  if (text(row['PRE CAS INTERVIEW']) === 'Fail' && !p.reached.paid) rule('preCasFailed', 'Failed the Pre-CAS interview', null);
  const payDays = waited('PAYMENT DATE');
  if (['Payment Stage', 'CAS Stage'].includes(status) && !has(row, 'CAS REQUESTED DATE') && payDays !== null && payDays >= 7) rule('casNotRequested', `Paid ${payDays} days ago, CAS not requested`, payDays);
  const casReqDays = waited('CAS REQUESTED DATE');
  if (status === 'CAS Stage' && !has(row, 'CAS RECEIVED DATE') && casReqDays !== null && casReqDays >= 14) rule('casWaiting', `CAS requested ${casReqDays} days ago, not received`, casReqDays);
  const casDays = waited('CAS RECEIVED DATE');
  if (status === 'CAS Issued' && !has(row, 'VISA LODGE DATE') && casDays !== null && casDays >= 7) rule('visaNotLodged', `CAS received ${casDays} days ago, visa not lodged`, casDays);
  const lodgeDays = waited('VISA LODGE DATE');
  if (status === 'Visa Lodge' && lodgeDays !== null && lodgeDays >= 21) rule('visaWaiting', `Visa lodged ${lodgeDays} days ago, no decision`, lodgeDays);
  return out;
}
const CHASE_LABELS = {
  mockUnscheduled: 'students at Mock Stage with no mock interview scheduled',
  preCasFailed: 'students who failed the Pre-CAS interview',
  casNotRequested: 'paid over a week ago, CAS not requested yet',
  casWaiting: 'CAS requested over two weeks ago, not received',
  visaNotLodged: 'CAS received over a week ago, visa not lodged',
  visaWaiting: 'visas lodged over three weeks ago with no decision',
};

// Days between two dates on the same student, for the speed table. Wrong-way or silly gaps are ignored.
const GAPS = [
  { key: 'appToOffer', label: 'Application to offer', from: 'APPLICATION SUBMISSION DATE', to: 'OFFER RECEIVED DATE' },
  { key: 'offerToPay', label: 'Offer to payment', from: 'OFFER RECEIVED DATE', to: 'PAYMENT DATE' },
  { key: 'mockToPay', label: 'First mock interview to payment', from: 'MOCK SCHEDULE 1', to: 'PAYMENT DATE' },
  { key: 'payToCas', label: 'Payment to CAS received', from: 'PAYMENT DATE', to: 'CAS RECEIVED DATE' },
  { key: 'casToLodge', label: 'CAS received to visa lodged', from: 'CAS RECEIVED DATE', to: 'VISA LODGE DATE' },
  { key: 'lodgeToVisa', label: 'Visa lodged to visa issued', from: 'VISA LODGE DATE', to: 'VISA RECEIVED DATE' },
  { key: 'whole', label: 'Application to visa issued', from: 'APPLICATION SUBMISSION DATE', to: 'VISA RECEIVED DATE' },
];

function buildDashboard(workbook, { sheetId = 'all', includeHidden = false, today = new Date() } = {}) {
  const shown = (workbook.sheets || []).filter((s) => includeHidden || !s.hidden);
  const selected = shown.find((s) => s.id === sheetId) ? sheetId : 'all';
  const nowMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  // Every student of every shown intake, read once.
  const everyone = [];
  shown.forEach((sheet) => {
    sheet.rows.forEach((row) => {
      if (!isStudent(row)) return;
      const status = text(row['APPLICATION STATUS']);
      const p = progressOf(row, status);
      const left = LEFT.includes(status);
      everyone.push({
        row, status, p, left, sheet,
        settled: left || p.reached.visa,
        active: !left && !p.reached.visa,
        deposited: deposits(row),
      });
    });
  });
  const students = selected === 'all' ? everyone : everyone.filter((s) => s.sheet.id === selected);
  const { rates, settled: settledCount } = learnRates(everyone);

  const months = lastMonths(today, MONTHS);
  const monthly = { applications: new Map(), payments: new Map(), visas: new Map() };
  Object.values(monthly).forEach((m) => months.forEach((mo) => m.set(mo, 0)));
  const stageCounts = new Map([...PIPELINE, ...LEFT].map((s) => [s, 0]));
  const sources = new Map(SOURCES.map((s) => [s, newGroup()]));
  const partners = new Map();
  const universities = new Map();
  const courses = new Map();
  const reachedCount = Object.fromEntries(STEPS.map((s) => [s.key, 0]));
  const gaps = Object.fromEntries(GAPS.map((g) => [g.key, []]));
  const k = {
    students: students.length, mockInterviews: 0, noStatus: 0, active: 0, left: 0, rejected: 0,
  };
  const pay = { full: 0, partly: 0, unknown: 0 }; // students who have paid: the whole fee, part of it, or no fee entered to compare with
  const quality = {
    filledFromStage: 0, paymentsWithoutDate: 0, visasWithoutDate: 0, applicationsWithoutDate: 0, noSource: 0, noPartner: 0, noUniversity: 0,
  };
  const chase = [];
  const chaseCounts = new Map();
  const forecast = { expectedVisas: 0, expectedPayments: 0, active: 0 };

  for (const s of students) {
    const { row, status, p } = s;
    const name = `${text(row['FIRST NAME'])} ${text(row['LAST NAME'])}`.trim();
    if (stageCounts.has(status)) stageCounts.set(status, stageCounts.get(status) + 1);
    else k.noStatus += 1;
    STEPS.forEach((step) => { if (p.reached[step.key]) reachedCount[step.key] += 1; });
    if (p.filledIn) quality.filledFromStage += 1;
    if (p.reached.paid && !has(row, 'PAYMENT DATE')) quality.paymentsWithoutDate += 1;
    if (p.reached.visa && !has(row, 'VISA RECEIVED DATE')) quality.visasWithoutDate += 1;
    if (p.reached.applied && !has(row, 'APPLICATION SUBMISSION DATE')) quality.applicationsWithoutDate += 1;

    for (let n = 1; n <= 4; n += 1) if (has(row, `MOCK SCHEDULE ${n}`)) k.mockInterviews += 1;
    if (status === 'Visa Rejected') k.rejected += 1;
    if (s.left) k.left += 1;
    if (s.active) k.active += 1;

    // Paid in full or part? Only for students who have paid and still have a fee to compare with.
    if (p.reached.paid && !s.left) {
      const net = has(row, 'GROSS FEE') ? netTuitionFee(row) : 0;
      if (net > 0) { if (s.deposited >= net) pay.full += 1; else pay.partly += 1; } else pay.unknown += 1;
    }

    const source = text(row['STUDENT SOURCE']);
    if (!source) quality.noSource += 1;
    const partner = text(row['UNIVERSITY PARTNER']);
    if (!partner) quality.noPartner += 1;
    const uni = text(row['UNIVERSITY NAME']);
    if (!uni) quality.noUniversity += 1;
    bump(sources, source || 'Not recorded', p, s.left);
    bump(partners, partner || 'Not recorded', p, s.left);
    bump(universities, uni || 'Not recorded', p, s.left);
    bump(courses, text(row['COURSE NAME']) || 'Not recorded', p, s.left);

    const addTo = (map, month, by = 1) => { if (map.has(month)) map.set(month, map.get(month) + by); };
    addTo(monthly.applications, monthOf(row['APPLICATION SUBMISSION DATE']));
    addTo(monthly.payments, monthOf(row['PAYMENT DATE']));
    addTo(monthly.visas, monthOf(row['VISA RECEIVED DATE']));

    GAPS.forEach((g) => {
      const d = dayNumber(row[g.to]) - dayNumber(row[g.from]);
      if (d >= 0 && d <= 730) gaps[g.key].push(d);
    });

    if (s.active) {
      chaseRules(row, status, p, nowMs).forEach((r) => {
        chaseCounts.set(r.key, (chaseCounts.get(r.key) || 0) + 1);
        chase.push({ name: name || 'Unnamed student', stage: status || 'No status', reason: r.reason, days: r.days, intake: s.sheet.name });
      });
      const rate = rates[p.furthest];
      forecast.active += 1;
      forecast.expectedVisas += rate.visa;
      if (!p.reached.paid) forecast.expectedPayments += rate.pay;
    }
  }

  const total = k.students;
  const pct = (n, of = total) => (of ? round1((n / of) * 100) : 0);
  const steps = [{ key: 'students', label: 'Students', count: total }, ...STEPS.map((s) => ({ key: s.key, label: s.label, count: reachedCount[s.key] }))];
  steps.forEach((st, i) => {
    st.percent = pct(st.count);
    st.fromPrevious = i ? pct(st.count, steps[i - 1].count) : 100;
  });
  const decided = reachedCount.visa + k.rejected;
  const sourceList = [...sources.entries()].filter(([label, v]) => v.count || SOURCES.includes(label)).map(([label, v]) => ({ label, ...v }));
  chase.sort((a, b) => b.days - a.days);

  return {
    asOf: new Date().toISOString(),
    intakes: shown.map((s) => ({ id: s.id, name: s.name })),
    selected,
    kpis: {
      ...k,
      applicationsSubmitted: reachedCount.applied, offersReceived: reachedCount.offer, mocksHeld: reachedCount.mock,
      paymentsMade: reachedCount.paid, casReceived: reachedCount.cas, visaLodged: reachedCount.lodged, visaIssued: reachedCount.visa,
      conversionRate: pct(reachedCount.visa),
      paymentRate: pct(reachedCount.paid),
      visaSuccessRate: decided ? round1((reachedCount.visa / decided) * 100) : null,
      inquiries: stageCounts.get('Inquiry'),
    },
    stages: PIPELINE.map((label) => ({ label, count: stageCounts.get(label) })),
    left: LEFT.map((label) => ({ label, count: stageCounts.get(label) })),
    milestones: steps,
    paidInFull: pay.full, partlyPaid: pay.partly,
    forecast: {
      active: forecast.active,
      expectedVisas: round1(reachedCount.visa + forecast.expectedVisas),
      expectedPayments: round1(reachedCount.paid + forecast.expectedPayments),
      settledStudents: settledCount,
      reliable: settledCount >= 30,
    },
    speed: GAPS.map((g) => ({
      key: g.key, label: g.label, samples: gaps[g.key].length, median: median(gaps[g.key]),
    })),
    attention: [...chaseCounts.entries()].map(([key, count]) => ({ key, count, text: CHASE_LABELS[key] })).sort((a, b) => b.count - a.count),
    chase: chase.slice(0, 8),
    monthly: {
      months,
      series: [
        { key: 'applications', label: 'Applications submitted', values: months.map((m) => monthly.applications.get(m)) },
        { key: 'payments', label: 'Payments made', values: months.map((m) => monthly.payments.get(m)) },
        { key: 'visas', label: 'Visas issued', values: months.map((m) => monthly.visas.get(m)) },
      ],
    },
    sources: sourceList,
    partners: topGroups(partners, TOP_N),
    universities: topGroups(universities, TOP_N),
    courses: topGroups(courses, TOP_N),
    quality,
  };
}

module.exports = { buildDashboard, isoDate, PIPELINE, LEFT };

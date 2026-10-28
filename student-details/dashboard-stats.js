// The numbers behind the dashboard, worked out on the server from the workbook so a screen (for example
// the CEO's) gets a few kilobytes of totals instead of every student's record.
//
// buildDashboard(workbook, { sheetId, includeHidden, today }) -> plain object, see the end of the file.
// Only rows with a first or last name count as students (blank added rows are ignored), the same rule
// as the cards on the Student Details page.

const { parseNum, offerStuck } = require('./calc');

// The stages in the order a student moves through them, then the ones that leave the pipeline.
const PIPELINE = ['Inquiry', 'Application Stage', 'Mock Stage', 'Payment Stage', 'CAS Stage', 'CAS Issued', 'Visa Lodge', 'Visa Issued'];
const LEFT = ['Visa Rejected', 'Defer', 'Withdrawn'];
const SOURCES = ['Visitor', 'Reference', 'Branch', 'Agents', 'Events', 'Social Media'];
const TOP_N = 8;
const MONTHS = 12;

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

const isStudent = (row) => has(row, 'FIRST NAME') || has(row, 'LAST NAME');
const deposits = (row) => parseNum(row['TUITION FEE DEPOSIT(1st Installment)']) + parseNum(row['TUITION FEE DEPOSIT(2nd Installment)']);

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

// The biggest `n` groups by count, the rest folded into "Other".
function topGroups(map, n) {
  const list = [...map.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (list.length <= n) return list;
  const rest = list.slice(n);
  return [...list.slice(0, n), { label: 'Other', count: rest.reduce((s, g) => s + g.count, 0), visas: rest.reduce((s, g) => s + g.visas, 0), other: true }];
}

function buildDashboard(workbook, { sheetId = 'all', includeHidden = false, today = new Date() } = {}) {
  const shown = (workbook.sheets || []).filter((s) => includeHidden || !s.hidden);
  const selected = shown.find((s) => s.id === sheetId) ? sheetId : 'all';
  const sheets = selected === 'all' ? shown : shown.filter((s) => s.id === selected);

  const intakes = shown.map((s) => ({ id: s.id, name: s.name, hidden: Boolean(s.hidden), students: s.rows.filter(isStudent).length }));
  const stageCounts = new Map([...PIPELINE, ...LEFT].map((s) => [s, 0]));
  const sources = new Map(SOURCES.map((s) => [s, { count: 0, visas: 0 }]));
  const partners = new Map();
  const universities = new Map();
  const months = lastMonths(today, MONTHS);
  const monthly = { applications: new Map(months.map((m) => [m, 0])), payments: new Map(months.map((m) => [m, 0])), visas: new Map(months.map((m) => [m, 0])) };
  const k = {
    students: 0, applicationsSubmitted: 0, offersReceived: 0, mocksHeld: 0, preCasPassed: 0, preCasFailed: 0, mockInterviews: 0,
    paymentsMade: 0, depositsGbp: 0, casRequested: 0, casReceived: 0, visaLodged: 0, visaIssued: 0, noStatus: 0,
    offersWaiting: 0, mockStageUnscheduled: 0, medicalReceived: 0, nocSubmitted: 0,
  };

  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      if (!isStudent(row)) continue;
      const status = text(row['APPLICATION STATUS']);
      const visa = status === 'Visa Issued';
      k.students += 1;
      if (stageCounts.has(status)) stageCounts.set(status, stageCounts.get(status) + 1);
      else k.noStatus += 1;

      if (has(row, 'APPLICATION SUBMISSION DATE')) k.applicationsSubmitted += 1;
      if (has(row, 'OFFER RECEIVED DATE')) k.offersReceived += 1;
      if (has(row, 'MOCK SCHEDULE 1')) k.mocksHeld += 1;
      for (let n = 1; n <= 4; n += 1) if (has(row, `MOCK SCHEDULE ${n}`)) k.mockInterviews += 1;
      if (text(row['PRE CAS INTERVIEW']) === 'Passed') k.preCasPassed += 1;
      if (text(row['PRE CAS INTERVIEW']) === 'Fail') k.preCasFailed += 1;
      const paid = has(row, 'PAYMENT DATE') || deposits(row) > 0;
      if (paid) k.paymentsMade += 1;
      k.depositsGbp += deposits(row);
      if (has(row, 'CAS REQUESTED DATE')) k.casRequested += 1;
      if (has(row, 'CAS RECEIVED DATE')) k.casReceived += 1;
      if (has(row, 'VISA LODGE DATE')) k.visaLodged += 1;
      if (visa || has(row, 'VISA RECEIVED DATE')) k.visaIssued += 1;
      if (text(row['MEDICAL REPORT']) === 'Received') k.medicalReceived += 1;
      if (text(row['NOC']) === 'Submitted') k.nocSubmitted += 1;
      if (offerStuck(row, today)) k.offersWaiting += 1;
      if (status === 'Mock Stage' && !has(row, 'MOCK SCHEDULE 1')) k.mockStageUnscheduled += 1;

      const source = text(row['STUDENT SOURCE']) || 'Not recorded';
      const s = sources.get(source) || sources.set(source, { count: 0, visas: 0 }).get(source);
      s.count += 1;
      if (visa) s.visas += 1;
      for (const [map, col, fallback] of [[partners, 'UNIVERSITY PARTNER', 'Not recorded'], [universities, 'UNIVERSITY NAME', 'Not recorded']]) {
        const label = text(row[col]) || fallback;
        const g = map.get(label) || map.set(label, { count: 0, visas: 0 }).get(label);
        g.count += 1;
        if (visa) g.visas += 1;
      }
      const bump = (map, month) => { if (map.has(month)) map.set(month, map.get(month) + 1); };
      bump(monthly.applications, monthOf(row['APPLICATION SUBMISSION DATE']));
      bump(monthly.payments, monthOf(row['PAYMENT DATE']));
      bump(monthly.visas, monthOf(row['VISA RECEIVED DATE']));
    }
  }

  const students = k.students;
  const pct = (n) => (students ? Math.round((n / students) * 1000) / 10 : 0);
  const sourceList = [...sources.entries()].filter(([label, v]) => v.count || SOURCES.includes(label)).map(([label, v]) => ({ label, ...v }));

  return {
    asOf: new Date().toISOString(),
    intakes,
    selected,
    kpis: { ...k, depositsGbp: Math.round(k.depositsGbp), conversionRate: pct(k.visaIssued), inquiries: stageCounts.get('Inquiry') },
    stages: PIPELINE.map((label) => ({ label, count: stageCounts.get(label) })),
    left: LEFT.map((label) => ({ label, count: stageCounts.get(label) })),
    // How far students have got, counted from what has been filled in (not only from the current status).
    milestones: [
      { label: 'Students', count: students },
      { label: 'Applications submitted', count: k.applicationsSubmitted },
      { label: 'Offers received', count: k.offersReceived },
      { label: 'Mock interview held', count: k.mocksHeld },
      { label: 'Pre-CAS interview passed', count: k.preCasPassed },
      { label: 'Payment made', count: k.paymentsMade },
      { label: 'CAS received', count: k.casReceived },
      { label: 'Visa lodged', count: k.visaLodged },
      { label: 'Visa issued', count: k.visaIssued },
    ].map((m) => ({ ...m, percent: pct(m.count) })),
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
  };
}

module.exports = { buildDashboard, isoDate, PIPELINE, LEFT };

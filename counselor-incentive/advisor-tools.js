// The Incentive tools of the Claude "Strategy Advisor" connector. They are part of the SAME connector as the Student
// Details tools (student-details/advisor-mcp.js), so one connector in Claude, with one address, sees both.
//
// READ ONLY: Claude can read the live Incentive data (the visa-issued students of every intake with their University
// Partner, tuition fee, university commission and the incentives entered; the Payment Summary; the Company Earnings)
// and can not change any incentive, advance or student.

const { textResult, errorResult } = require('../shared/mcp-core');
const calc = require('./calc');

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const GROUPS = { university: 'University Name', universityPartner: 'University Partner', studentSource: 'Student Source', intake: 'Intake' };

const INCENTIVE_TOOLS = [
  {
    name: 'get_incentive_overview',
    description: 'Start here for anything about incentives, commissions or company earnings. Lists every intake (a tab of Student Details) with the number of visa-issued students (the only students the Incentive page lists), the exchange rate (GBP to NPR) last used, and what each field means. Use the intake names in the other incentive tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_incentives',
    description: 'The Incentive page rows, live: one per visa-issued student, with University Partner (the agent), university, course, tuition fee (GBP), university commission % and amount (GBP), and the incentives entered (NPR). Say which intake with "intake"; omit it for every intake. Filter with "student", "university", "partner" and "source" (Student Source; each matches part of the text, ignoring case). Returns at most "limit" rows (default 200, max 1000); use "offset" to page.',
    inputSchema: {
      type: 'object',
      properties: {
        intake: { type: 'string', description: 'Intake name from get_incentive_overview. Omit for all.' },
        student: { type: 'string' },
        university: { type: 'string' },
        partner: { type: 'string', description: 'University Partner (the agent).' },
        source: { type: 'string', description: 'Student Source, e.g. Visitor or a branch.' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_payment_summary',
    description: 'The Payment Summary and Company Earnings of an intake, as the Incentive page shows them: total incentives, loan incentive to share, net incentives, TDS (15%), previous advance, net payable (all NPR); the university commission (GBP, and NPR at the exchange rate), the counselor salary for the intake period, and the share of the company earnings that is paid out. Omit "intake" for every intake.',
    inputSchema: { type: 'object', properties: { intake: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'summarize_incentives_by',
    description: 'Incentive totals grouped by University Partner (the agent), Student Source, University Name or Intake: students, tuition fees (GBP), university commission (GBP) and incentives entered (NPR). Best for comparing agents and universities; far cheaper than reading rows. Optionally limit to one intake.',
    inputSchema: {
      type: 'object',
      properties: { by: { type: 'string', enum: Object.keys(GROUPS) }, intake: { type: 'string' } },
      required: ['by'],
      additionalProperties: false,
    },
  },
];

const round2 = calc.round2;
const has = (cell, needle) => String(cell || '').toLowerCase().includes(String(needle).trim().toLowerCase());
const NAMES = new Set(INCENTIVE_TOOLS.map((t) => t.name));

//   getSync()         the Incentive page's student list: { ok, intakes, byIntake } (see counselor-incentive/incentive-data.js)
//   getCommissions()  the incentives saved for each student, by student id (null if the Incentive data is not reachable)
//   getAdvances()     the advance and salary settings of each intake, by intake name
//   getRate()         the exchange rate last saved by the Incentive page, { rate, date }, or null
function createIncentiveTools({ getSync, getCommissions, getAdvances, getRate }) {
  // Every visa-issued student with their saved incentives and the worked-out amounts.
  function load() {
    const sync = getSync();
    if (!sync || !sync.ok) return { error: (sync && sync.error) || 'The Student Details data could not be read right now.' };
    const commissions = getCommissions();
    if (!commissions) return { error: 'The Incentive data (commissions and advances) could not be found on this server, so incentives cannot be shown. The Incentive data folder must be reachable from the Student Details app (see COUNSELOR_DATA_DIR).' };
    const advances = getAdvances() || {};
    return {
      intakes: (sync.intakes || []).map((name) => ({
        name,
        advance: advances[name] || {},
        students: (sync.byIntake[name] || []).map((s) => {
          const c = commissions[s.id] || {};
          const total = calc.num(c.enrollmentCommission) + calc.num(c.enrollmentCommissionUni) + calc.num(c.newPartnershipCommission)
            + calc.num(c.selfStudentCommission) + calc.num(c.flywireCommission);
          return {
            intake: name,
            student: s.name,
            course: s.course,
            university: s.university,
            universityPartner: s.agent || '',
            studentSource: s.source || '',
            studentId: s.studentId,
            tuitionFeeGbp: s.tuitionFee,
            visaIssuedDate: s.visaIssuedDate,
            uniCommissionRatePercent: calc.num(c.uniCommissionRate),
            uniCommissionAmountGbp: calc.universityCommission(s.tuitionFee, c.uniCommissionRate),
            enrollmentIncentiveNpr: calc.num(c.enrollmentCommission),
            enrollmentIncentiveFromUniversityNpr: calc.num(c.enrollmentCommissionUni),
            newPartnershipIncentiveNpr: calc.num(c.newPartnershipCommission),
            directStudentIncentiveNpr: calc.num(c.selfStudentCommission),
            flywireFeePaymentGbp: calc.num(c.flywireFeePayment),
            flywireIncentiveNpr: calc.num(c.flywireCommission),
            loanIncentiveToShareNpr: calc.num(c.loanCommission),
            totalIncentivesNpr: round2(total),
            _record: c,
          };
        }),
      })),
    };
  }

  function pickIntakes(data, ref) {
    if (ref === undefined || ref === null || ref === '') return { intakes: data.intakes };
    const want = String(ref).trim().toLowerCase();
    const hit = data.intakes.filter((i) => i.name.toLowerCase() === want);
    if (!hit.length) return { error: `No intake "${ref}". Intakes: ${data.intakes.map((i) => i.name).join(', ') || '(none)'}.` };
    return { intakes: hit };
  }

  const publicRow = ({ _record, ...row }) => row;

  function summaryOf(intake, rate) {
    const s = calc.computeSummary(intake.students.map((st) => st._record), intake.advance.previousAdvance);
    const salary = intake.advance.basicSalary === undefined ? calc.DEFAULT_BASIC_SALARY : intake.advance.basicSalary;
    const months = intake.advance.salaryMonths === undefined ? calc.DEFAULT_SALARY_MONTHS : intake.advance.salaryMonths;
    const e = calc.computeEarnings({
      commissionGbp: intake.students.reduce((a, st) => a + st.uniCommissionAmountGbp, 0),
      gbpToNpr: rate ? rate.rate : null,
      basicSalary: salary,
      salaryMonths: months,
      myIncentives: s.netCommissions,
    });
    return {
      intake: intake.name,
      students: intake.students.length,
      paymentSummaryNpr: {
        totalIncentives: round2(s.totalCommissions), loanIncentiveToShare: round2(s.loanPayable), netIncentives: round2(s.netCommissions),
        tds15Percent: round2(s.tds), previousAdvance: round2(s.previousAdvance), netPayable: round2(s.netPayable),
      },
      companyEarnings: {
        universityCommissionGbp: round2(e.commissionGbp), universityCommissionNpr: e.companyNpr,
        counselorSalaryForPeriodNpr: round2(e.salaryTotal), basicSalaryPerMonthNpr: salary, salaryMonths: months,
        counselorTotalNpr: round2(e.myTotal), counselorSharePercentOfCompanyEarnings: e.sharePercent === null ? null : round2(e.sharePercent),
      },
    };
  }

  function callTool(name, a) {
    const data = load();
    if (data.error) return errorResult(data.error);
    const rate = getRate ? getRate() : null;
    const pulledAt = new Date().toISOString();

    if (name === 'get_incentive_overview') {
      return textResult({
        pulledAt,
        exchangeRate: rate ? { gbpToNpr: rate.rate, date: rate.date || null } : null,
        intakes: data.intakes.map((i) => ({ name: i.name, visaIssuedStudents: i.students.length })),
        notes: [
          'Only students whose Application Status is exactly "Visa Issued" appear here, as on the Incentive page.',
          'University Partner is the agent: it comes from the University Partner column of Student Details.',
          'Tuition fee and university commission are in GBP; every incentive, TDS, advance and salary figure is in NPR.',
          'These tools cannot change anything.',
        ],
      });
    }

    const picked = pickIntakes(data, a.intake);
    if (picked.error) return errorResult(picked.error);

    if (name === 'get_incentives') {
      const rows = picked.intakes.flatMap((i) => i.students).filter((r) => (!a.student || has(r.student, a.student))
        && (!a.university || has(r.university, a.university)) && (!a.partner || has(r.universityPartner, a.partner))
        && (!a.source || has(r.studentSource, a.source)));
      const limit = Math.min(Math.max(Number.isInteger(a.limit) ? a.limit : DEFAULT_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(Number.isInteger(a.offset) ? a.offset : 0, 0);
      return textResult({ pulledAt, matched: rows.length, returned: Math.min(limit, Math.max(rows.length - offset, 0)), offset, students: rows.slice(offset, offset + limit).map(publicRow) });
    }

    if (name === 'get_payment_summary') {
      return textResult({
        pulledAt,
        exchangeRate: rate ? { gbpToNpr: rate.rate, date: rate.date || null } : null,
        intakes: picked.intakes.map((i) => summaryOf(i, rate)),
      });
    }

    if (name === 'summarize_incentives_by') {
      if (!GROUPS[a.by]) return errorResult(`"by" must be one of: ${Object.keys(GROUPS).join(', ')}.`);
      const groups = new Map();
      picked.intakes.forEach((i) => i.students.forEach((s) => {
        const key = String({ intake: s.intake, university: s.university, universityPartner: s.universityPartner, studentSource: s.studentSource }[a.by] || '').trim() || '(empty)';
        const g = groups.get(key) || { [GROUPS[a.by]]: key, students: 0, tuitionFeesGbp: 0, universityCommissionGbp: 0, incentivesEnteredNpr: 0 };
        g.students += 1;
        g.tuitionFeesGbp += s.tuitionFeeGbp;
        g.universityCommissionGbp += s.uniCommissionAmountGbp;
        g.incentivesEnteredNpr += s.totalIncentivesNpr;
        groups.set(key, g);
      }));
      const table = [...groups.values()].map((g) => ({ ...g, tuitionFeesGbp: round2(g.tuitionFeesGbp), universityCommissionGbp: round2(g.universityCommissionGbp), incentivesEnteredNpr: round2(g.incentivesEnteredNpr) }))
        .sort((x, y) => y.students - x.students);
      return textResult({ pulledAt, total: table.reduce((n, g) => n + g.students, 0), groups: table });
    }

    return errorResult(`Unknown tool "${name}".`);
  }

  return { TOOLS: INCENTIVE_TOOLS, isIncentiveTool: (name) => NAMES.has(name), callTool };
}

module.exports = { createIncentiveTools, INCENTIVE_TOOLS };

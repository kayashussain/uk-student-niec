// A door for the Claude "Strategy Advisor" project (an MCP connector).
//
// It lets Claude READ the live UK Student NIEC sheet (every tab, row and column), the Dashboard numbers, the Analysis
// figures, the intake targets, the Marketing spend table and the Decision log,
// the Fact File and the Incentive page (commissions, incentives, company earnings; see
// counselor-incentive/advisor-tools.js). It can NOT change any student, the Fact File or any incentive.
//
// The one thing it can write is the Advisor's own notebook ("memory"): short notes about the owner's
// preferences, how NIEC works, decisions and lessons, kept in advisor-memory/ next to the data. Notes that
// look like personal data (emails, phone numbers) are refused, every save keeps a backup, and the notebook
// has size limits. It never touches the student data.
//
// It is OFF unless NIEC_ADVISOR_TOKEN is set (a long random secret, at least 32 characters). The secret is
// part of the address: https://<your-site>/advisor-mcp/<NIEC_ADVISOR_TOKEN>. Anyone with that address can
// read all students, so keep it private; to cut access off, change or remove the variable and restart.

const { createMcpEndpoint, textResult, errorResult } = require('../shared/mcp-core');
const { createIncentiveTools } = require('../counselor-incentive/advisor-tools');
const { syncFromWorkbook } = require('../counselor-incentive/incentive-data');

const PREFIX = '/advisor-mcp/';
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const TOOLS = [
  {
    name: 'get_overview',
    description: 'Start here. Lists every tab (intake) of the UK Student NIEC sheet with its id, name, whether it is hidden (an earlier intake), the number of students and the exact column names, plus the sheet revision and the time of this read. Use the tab ids and column names in the other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_students',
    description: 'Reads student rows live from the sheet. Filter with "where": an object of column name to text; a row matches when every given column contains that text (case-insensitive). Use "columns" to return only some columns (the row id is always included). Returns at most "limit" rows (default 200, max 1000); use "offset" to page. Say which tab with "sheet" (an id or name from get_overview); leave it out to read every tab.',
    inputSchema: {
      type: 'object',
      properties: {
        sheet: { type: 'string', description: 'Tab id or name. Omit for all tabs.' },
        where: { type: 'object', additionalProperties: { type: 'string' }, description: 'Column name -> text the cell must contain. Use "=" prefix for an exact match (e.g. "=Inquiry"), and "=" alone to find empty cells.' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Only return these columns.' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
        offset: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'count_by',
    description: 'Counts students grouped by one or more columns (for example APPLICATION STATUS, UNIVERSITY NAME, STUDENT SOURCE), optionally filtered with "where" as in get_students. Empty cells are counted as "(empty)". Best for funnels and comparisons; far cheaper than reading rows.',
    inputSchema: {
      type: 'object',
      properties: {
        group_by: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
        sheet: { type: 'string' },
        where: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['group_by'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_dashboard',
    description: 'The same numbers the Dashboard page shows (pipeline, visas, fees and so on) for one intake. Pass the tab id from get_overview; omit it for the Dashboard\'s default view.',
    inputSchema: { type: 'object', properties: { intake: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'get_business_analysis',
    description: 'The same figures the Analysis page shows, for decisions rather than daily work. For one intake (pass its tab id) or every intake together (omit "intake"): totals and rates; the visa target of each intake with the forecast from students in progress, the gap, and the new applications and weekly pace needed ("targets"), and what was dated in the last 7 days against the 7 before ("week"); overdue and coming follow-ups ("followUps"); lead quality; decisions due for review; every intake side by side; a scorecard (students, applied, offers, paid, visas, refused, lost, rates) by Student Source with its Source Details, by campaign or event, university, University Partner, course, counselor, study level and home district; marketing spend and the cost per student, application, paid student and visa of each channel (NPR); how much rests on the biggest university and partner; lost students by Lost Reason; the busy months of the year for inquiries, applications, payments and visas; how complete each column is and what decision each column allows; and "findings": the gaps and risks the numbers prove. Start here for any business question, and read "completeness" and "notes" before trusting a rate.',
    inputSchema: { type: 'object', properties: { intake: { type: 'string', description: 'Tab id from get_overview. Omit for all intakes together.' } }, additionalProperties: false },
  },
  {
    name: 'get_marketing_spend',
    description: 'Every line of the Marketing spend table Admin keeps on the Analysis page: month, intake (tab id), source, source detail, campaign or event, amount in NPR and a note. Empty until Admin enters spend.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_decision_log',
    description: 'The Decision log Admin keeps on the Analysis page: each management decision with its date, the problem, the decision, the expected result, the review date, the actual result, the lesson and the outcome (Continue, Change or Stop). Read it before recommending something, so a past decision and its lesson are not repeated blindly.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_fact_file',
    description: 'The Fact File: one page per university (fees, entry requirements, English tests, courses, intakes, application process). Without arguments, lists the universities. With "id" returns one full page. With "q" searches by course or text.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, q: { type: 'string' } }, additionalProperties: false },
  }
];

function pickSheets(workbook, ref) {
  const sheets = workbook.sheets || [];
  if (ref === undefined || ref === null || ref === '') return { sheets };
  const want = String(ref).trim().toLowerCase();
  const hit = sheets.filter((s) => String(s.id).toLowerCase() === want || String(s.name).toLowerCase() === want);
  if (!hit.length) return { error: `No tab "${ref}". Tabs: ${sheets.map((s) => `${s.id} (${s.name})`).join(', ')}.` };
  return { sheets: hit };
}

function matcher(where) {
  const entries = Object.entries(where && typeof where === 'object' ? where : {});
  return (row) => entries.every(([col, needle]) => {
    const cell = String(row[col] === undefined || row[col] === null ? '' : row[col]).trim().toLowerCase();
    const want = String(needle).trim().toLowerCase();
    if (want === '=') return cell === '';
    if (want.startsWith('=')) return cell === want.slice(1).trim();
    return cell.includes(want);
  });
}

function unknownColumns(sheets, cols) {
  const known = new Set();
  sheets.forEach((s) => (s.columns || []).forEach((c) => known.add(c)));
  return [...new Set(cols)].filter((c) => !known.has(c));
}

// `incentive` (optional) adds the Incentive tools to this same connector: { getCommissions, getAdvances, getRate }, which read the
// Incentive page's saved figures; the students come from the same workbook as the rest.
function createAdvisorMcp({ getWorkbook, getDashboard, getAnalysis, getSpend, getDecisions, facts, incentive, token, memoryDir, log = console.log }) {
  const incentiveTools = incentive ? createIncentiveTools({
    getSync: () => { const w = getWorkbook(); return w ? syncFromWorkbook(w) : { ok: false, error: 'The sheet data could not be read right now.' }; },
    getCommissions: incentive.getCommissions,
    getAdvances: () => { const w = getWorkbook(); return incentive.getAdvances((w && w.sheets) || []); },
    getRate: incentive.getRate,
  }) : null;

  function callTool(name, a) {
    if (incentiveTools && incentiveTools.isIncentiveTool(name)) return incentiveTools.callTool(name, a);
    const workbook = getWorkbook();
    if (!workbook) return errorResult('The sheet data could not be read right now.');

    if (name === 'get_overview') {
      return textResult({
        pulledAt: new Date().toISOString(),
        revision: workbook.revision,
        sheets: (workbook.sheets || []).map((s) => ({ id: s.id, name: s.name, hidden: Boolean(s.hidden), students: (s.rows || []).length, columns: s.columns || [] })),
      });
    }

    if (name === 'get_students' || name === 'count_by') {
      const picked = pickSheets(workbook, a.sheet);
      if (picked.error) return errorResult(picked.error);
      const filterCols = Object.keys(a.where && typeof a.where === 'object' ? a.where : {});
      const wanted = name === 'count_by' ? (Array.isArray(a.group_by) ? a.group_by : []) : (Array.isArray(a.columns) ? a.columns : []);
      const bad = unknownColumns(picked.sheets, [...filterCols, ...wanted]);
      if (bad.length) return errorResult(`Unknown column(s): ${bad.join(', ')}. Call get_overview for the exact names.`);
      const test = matcher(a.where);
      const rows = [];
      picked.sheets.forEach((s) => (s.rows || []).forEach((r) => { if (test(r)) rows.push({ sheet: s.id, row: r }); }));

      if (name === 'count_by') {
        if (!wanted.length) return errorResult('group_by needs at least one column.');
        const counts = new Map();
        rows.forEach(({ row }) => {
          const key = wanted.map((c) => String(row[c] === undefined || row[c] === null || String(row[c]).trim() === '' ? '(empty)' : row[c]).trim());
          const k = JSON.stringify(key);
          counts.set(k, (counts.get(k) || 0) + 1);
        });
        const table = [...counts.entries()].map(([k, n]) => ({ ...Object.fromEntries(wanted.map((c, i) => [c, JSON.parse(k)[i]])), students: n })).sort((x, y) => y.students - x.students);
        return textResult({ pulledAt: new Date().toISOString(), total: rows.length, groups: table });
      }

      const limit = Math.min(Math.max(Number.isInteger(a.limit) ? a.limit : DEFAULT_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(Number.isInteger(a.offset) ? a.offset : 0, 0);
      const page = rows.slice(offset, offset + limit).map(({ sheet, row }) => {
        if (!wanted.length) return { sheet, ...Object.fromEntries(Object.entries(row).filter(([k]) => k === '_id' || !k.startsWith('_'))) }; // the page's own markers stay out
        const out = { sheet, _id: row._id };
        wanted.forEach((c) => { out[c] = row[c] === undefined ? '' : row[c]; });
        return out;
      });
      return textResult({ pulledAt: new Date().toISOString(), matched: rows.length, returned: page.length, offset, students: page });
    }

    if (name === 'get_dashboard') {
      try {
        return textResult(getDashboard(typeof a.intake === 'string' ? a.intake : ''));
      } catch (e) {
        return errorResult('The Dashboard numbers could not be made right now.');
      }
    }

    if (name === 'get_business_analysis') {
      try {
        if (!getAnalysis) return errorResult('The analysis is not available on this server.');
        if (typeof a.intake === 'string' && a.intake && !(workbook.sheets || []).some((s) => s.id === a.intake)) return errorResult(`No tab "${a.intake}". Call get_overview for the tab ids.`);
        return textResult(getAnalysis(typeof a.intake === 'string' ? a.intake : ''));
      } catch (e) {
        return errorResult('The analysis could not be made right now.');
      }
    }

    if (name === 'get_marketing_spend') {
      return textResult({ pulledAt: new Date().toISOString(), currency: 'NPR', lines: getSpend ? getSpend() : [] });
    }

    if (name === 'get_decision_log') {
      return textResult({ pulledAt: new Date().toISOString(), decisions: getDecisions ? getDecisions() : [] });
    }

    if (name === 'get_fact_file') {
      if (typeof a.id === 'string' && a.id) {
        const uni = facts.get(a.id);
        return uni ? textResult(uni) : errorResult('No university with that id. Call get_fact_file without arguments for the list.');
      }
      return textResult(facts.list(typeof a.q === 'string' ? a.q.slice(0, 100) : ''));
    }

    return errorResult(`Unknown tool "${name}".`);
  }

  return createMcpEndpoint({
    prefix: PREFIX, token, tokenName: 'NIEC_ADVISOR_TOKEN', tools: incentiveTools ? [...TOOLS, ...incentiveTools.TOOLS] : TOOLS, callTool, serverName: 'niec-advisor', memoryDir, log,
    instructions: 'Read-only, live access to the UK Student NIEC sheet and Fact File' + (incentiveTools ? ', and to the Incentive page (commissions, incentives and company earnings)' : '') + ', plus a notebook you may write to. Call read_memory first in every conversation, then get_overview' + (incentiveTools ? ' (and get_incentive_overview for anything about incentives, commissions or earnings; University Partner is the agent; tuition and university commission are in GBP, incentives, TDS, advances and salary in NPR)' : '') + '. Save durable preferences and lessons with save_memory (never personal data). For a business question (where to invest, what to promote, which university or channel, what is missing) call get_business_analysis first. Prefer count_by for numbers and get_students with "columns" and "where" for rows' + (incentiveTools ? ', and summarize_incentives_by to compare agents and universities' : '') + '. Always say when the data was pulled (pulledAt).',
  });
}

module.exports = { createAdvisorMcp };

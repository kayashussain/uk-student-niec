// A door for the Claude "Strategy Advisor" project (an MCP connector).
//
// It lets Claude READ the live UK Student NIEC sheet (every tab, row and column), the Dashboard numbers
// and the Fact File. It can NOT change any student or the Fact File.
//
// The one thing it can write is the Advisor's own notebook ("memory"): short notes about the owner's
// preferences, how NIEC works, decisions and lessons, kept in advisor-memory/ next to the data. Notes that
// look like personal data (emails, phone numbers) are refused, every save keeps a backup, and the notebook
// has size limits. It never touches the student data.
//
// It is OFF unless NIEC_ADVISOR_TOKEN is set (a long random secret, at least 32 characters). The secret is
// part of the address: https://<your-site>/advisor-mcp/<NIEC_ADVISOR_TOKEN>. Anyone with that address can
// read all students, so keep it private; to cut access off, change or remove the variable and restart.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROTOCOL = '2025-03-26';
const PREFIX = '/advisor-mcp/';
const MAX_BODY = 256 * 1024;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const MAX_REPLY_CHARS = 400000;
const MEMORY_MAX_SECTIONS = 40;
const MEMORY_MAX_SECTION_CHARS = 8000;
const MEMORY_MAX_TOTAL_CHARS = 60000;
const MEMORY_KEEP_BACKUPS = 30;
const EMAIL_RE = /[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}/;
const LONG_NUMBER_RE = /(?:\+?\d[\s-]?){9,}/;

const TOOLS = [
  {
    name: 'read_memory',
    description: 'Reads the Advisor\'s notebook: what has been learned so far about the owner\'s preferences, how NIEC works (hierarchy, culture, decisions), targets, lessons and open questions. CALL THIS AT THE START OF EVERY CONVERSATION, before advising.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'save_memory',
    description: 'Saves a durable note in the Advisor\'s notebook under a section title (for example "Preferences", "Hierarchy and decisions", "Culture", "Targets", "Lessons", "Open questions", "Decisions log"). Use mode "append" to add a dated line to a section, or "replace" to rewrite the whole section. Save things that will make future advice better. NEVER save students\' names, phone numbers, emails or passport details; they are refused. Tell the owner briefly what you saved.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', maxLength: 60 },
        text: { type: 'string', maxLength: MEMORY_MAX_SECTION_CHARS },
        mode: { type: 'string', enum: ['append', 'replace'] },
      },
      required: ['section', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'forget_memory',
    description: 'Removes a whole section from the Advisor\'s notebook (use only when the owner asks, or a section is wrong or out of date). A backup is kept.',
    inputSchema: { type: 'object', properties: { section: { type: 'string' } }, required: ['section'], additionalProperties: false },
  },
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
    name: 'get_fact_file',
    description: 'The Fact File: one page per university (fees, entry requirements, English tests, courses, intakes, application process). Without arguments, lists the universities. With "id" returns one full page. With "q" searches by course or text.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, q: { type: 'string' } }, additionalProperties: false },
  },
];

function tokenMatches(given, expected) {
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function textResult(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length > MAX_REPLY_CHARS) text = text.slice(0, MAX_REPLY_CHARS) + '\n[cut: too long. Use "columns", "where", "limit" and "offset" to ask for less.]';
  return { content: [{ type: 'text', text }] };
}

const errorResult = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

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

const cleanTitle = (t) => String(t || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const cleanText = (t) => String(t || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();

function createMemory(dir, log) {
  const file = dir && path.join(dir, 'memory.json');
  const load = () => {
    try {
      const m = JSON.parse(fs.readFileSync(file, 'utf8'));
      return m && typeof m.sections === 'object' && m.sections ? m : { sections: {} };
    } catch (e) {
      if (e.code !== 'ENOENT') log(`[advisor-mcp] could not read the notebook: ${e.message}`);
      return { sections: {} };
    }
  };
  const total = (m) => Object.values(m.sections).reduce((n, v) => n + v.text.length, 0);
  function save(m) {
    fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
    if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dir, 'backups', `memory-${new Date().toISOString().replace(/[:.]/g, '-')}-${require('crypto').randomBytes(2).toString('hex')}.json`));
    const old = fs.readdirSync(path.join(dir, 'backups')).filter((f) => /^memory-.*\.json$/.test(f)).sort();
    old.slice(0, Math.max(0, old.length - MEMORY_KEEP_BACKUPS)).forEach((f) => { try { fs.unlinkSync(path.join(dir, 'backups', f)); } catch (e) { /* ignore */ } });
    m.updatedAt = new Date().toISOString();
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(m, null, 1));
    fs.renameSync(tmp, file);
  }
  return {
    available: Boolean(dir),
    read() {
      const m = load();
      return { updatedAt: m.updatedAt || null, sections: Object.entries(m.sections).map(([title, v]) => ({ title, updatedAt: v.updatedAt, text: v.text })) };
    },
    write(sectionRaw, textRaw, mode) {
      const title = cleanTitle(sectionRaw);
      const text = cleanText(textRaw);
      if (!title) return { error: 'A section title is needed.' };
      if (!text) return { error: 'The note is empty.' };
      if (EMAIL_RE.test(text) || LONG_NUMBER_RE.test(text)) return { error: 'Refused: the note looks like it contains an email or a phone/ID number. The notebook must not hold personal data. Rewrite it without names, emails or numbers.' };
      const m = load();
      const had = m.sections[title];
      const day = new Date().toISOString().slice(0, 10);
      const next = mode === 'replace' || !had ? text : `${had.text}\n- ${day}: ${text}`;
      if (next.length > MEMORY_MAX_SECTION_CHARS) return { error: `That section would be over ${MEMORY_MAX_SECTION_CHARS} characters. Summarise it with mode "replace".` };
      if (!had && Object.keys(m.sections).length >= MEMORY_MAX_SECTIONS) return { error: `The notebook already has ${MEMORY_MAX_SECTIONS} sections. Merge some first.` };
      m.sections[title] = { text: next, updatedAt: new Date().toISOString() };
      if (total(m) > MEMORY_MAX_TOTAL_CHARS) return { error: 'The notebook is full. Summarise older sections with mode "replace" first.' };
      save(m);
      return { ok: true, section: title, characters: next.length };
    },
    forget(sectionRaw) {
      const title = cleanTitle(sectionRaw);
      const m = load();
      if (!m.sections[title]) return { error: `No section "${title}". Sections: ${Object.keys(m.sections).join(', ') || '(none)'}.` };
      delete m.sections[title];
      save(m);
      return { ok: true, removed: title };
    },
  };
}

function createAdvisorMcp({ getWorkbook, getDashboard, facts, token, memoryDir, log = console.log }) {
  const memory = createMemory(memoryDir, log);
  const enabled = typeof token === 'string' && token.length >= 32;
  if (token && !enabled) log('[advisor-mcp] NIEC_ADVISOR_TOKEN is shorter than 32 characters, so the Advisor connector stays off.');

  function callTool(name, args) {
    const a = args && typeof args === 'object' ? args : {};
    if (name === 'read_memory' || name === 'save_memory' || name === 'forget_memory') {
      if (!memory.available) return errorResult('The notebook is not set up on this server.');
      if (name === 'read_memory') return textResult({ pulledAt: new Date().toISOString(), ...memory.read() });
      const done = name === 'save_memory' ? memory.write(a.section, a.text, a.mode === 'replace' ? 'replace' : 'append') : memory.forget(a.section);
      return done.error ? errorResult(done.error) : textResult(done);
    }

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
        if (!wanted.length) return { sheet, ...row };
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

    if (name === 'get_fact_file') {
      if (typeof a.id === 'string' && a.id) {
        const uni = facts.get(a.id);
        return uni ? textResult(uni) : errorResult('No university with that id. Call get_fact_file without arguments for the list.');
      }
      return textResult(facts.list(typeof a.q === 'string' ? a.q.slice(0, 100) : ''));
    }

    return errorResult(`Unknown tool "${name}".`);
  }

  function rpc(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return { jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'Invalid request' } };
    }
    const isNotification = msg.id === undefined || msg.id === null;
    if (isNotification) return null;
    const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
    switch (msg.method) {
      case 'initialize':
        return ok({
          protocolVersion: PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'niec-advisor', version: '1.0.0' },
          instructions: 'Read-only, live access to the UK Student NIEC sheet and Fact File, plus a notebook you may write to. Call read_memory first in every conversation, then get_overview. Save durable preferences and lessons with save_memory (never personal data). Prefer count_by for numbers and get_students with "columns" and "where" for rows. Always say when the data was pulled (pulledAt).',
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call': {
        const params = msg.params || {};
        if (!TOOLS.some((t) => t.name === params.name)) return fail(-32602, `Unknown tool "${params.name}"`);
        try {
          return ok(callTool(params.name, params.arguments));
        } catch (e) {
          log(`[advisor-mcp] ${params.name} failed: ${e.message}`);
          return ok(errorResult('That request failed. Try asking for less.'));
        }
      }
      default:
        return fail(-32601, `Method not found: ${msg.method}`);
    }
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { statusCode: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  // Returns true when the request was for this connector (answered here), false to let the app carry on.
  async function handle(req, res, urlPath) {
    if (!urlPath.startsWith(PREFIX)) return false;
    const reply = (status, body) => {
      const text = body === undefined ? '' : JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(text);
    };
    // Wrong or missing secret, or the connector off: look exactly like a page that does not exist.
    let given = '';
    try { given = decodeURIComponent(urlPath.slice(PREFIX.length)).replace(/\/$/, ''); } catch (e) { /* bad escape: no match */ }
    if (!enabled || !tokenMatches(given, token)) {
      reply(404, { error: 'Not found' });
      return true;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      res.end();
      return true;
    }
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (e) {
      reply(e.statusCode || 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return true;
    }
    if (Array.isArray(payload)) {
      const out = payload.map(rpc).filter(Boolean);
      if (!out.length) { res.writeHead(202); res.end(); } else reply(200, out);
      return true;
    }
    const answer = rpc(payload);
    if (!answer) { res.writeHead(202); res.end(); } else reply(200, answer);
    return true;
  }

  return { enabled, handle, callTool, rpc, TOOLS };
}

module.exports = { createAdvisorMcp };

// The machinery both Claude connectors (MCP) share: the secret in the address, the JSON-RPC conversation, the tool
// results, and the small notebook ("memory") the connector may write to. The two connectors (the Student Details one
// in student-details/advisor-mcp.js and the Incentive one in counselor-incentive/advisor-mcp.js) only add their own
// read-only tools on top.
//
// A connector is OFF unless its secret is set (a long random secret, at least 32 characters). The secret is part of
// the address, so anyone with the address can read everything the connector can: keep it private, and change or remove
// the variable to cut access off.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROTOCOL = '2025-03-26';
const SUPPORTED_PROTOCOLS = ['2025-03-26', '2024-11-05'];
const MAX_BATCH = 20;
const MAX_BODY = 256 * 1024;
const MAX_REPLY_CHARS = 400000;
const MEMORY_MAX_SECTIONS = 40;
const MEMORY_MAX_SECTION_CHARS = 8000;
const MEMORY_MAX_TOTAL_CHARS = 60000;
const MEMORY_KEEP_BACKUPS = 30;
const EMAIL_RE = /[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}/;
const LONG_NUMBER_RE = /(?:\+?\d[\s-]?){9,}/;
const PASSPORT_RE = /\b[A-Z]{1,2}\d{6,8}\b/i; // e.g. PA1234567, or an 8-digit Nepal passport after a letter
const YEAR_RE = /\b(?:19|20)\d{2}\b/g; // "2025 2026 2027 targets" is years, not a phone number
// Devanagari digits and full-width letters are read as the plain ones first, so "९८४१२३४५६७" or "ram＠gmail.com" are caught too.
const plain = (t) => String(t).normalize('NFKC').replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966));
const PASSPORT_DIGITS_RE = /\b\d{8}\b/; // an 8-digit passport number with no letter
const looksPersonal = (raw) => { const t = plain(raw); return EMAIL_RE.test(t) || PASSPORT_RE.test(t) || PASSPORT_DIGITS_RE.test(t.replace(YEAR_RE, ' ')) || LONG_NUMBER_RE.test(t.replace(YEAR_RE, ' ')); };

const MEMORY_TOOLS = [
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

const cleanTitle = (t) => String(t || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
const cleanText = (t) => String(t || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();

let backupCounter = 0;

function createMemory(dir, log) {
  const file = dir && path.join(dir, 'memory.json');
  const load = () => {
    try {
      const m = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Sections in an object with no built-in keys, so titles like "constructor" or "__proto__" are just titles.
      const sections = Object.assign(Object.create(null), m && typeof m.sections === 'object' && m.sections ? m.sections : {});
      return { ...(m && typeof m === 'object' ? m : {}), sections };
    } catch (e) {
      if (e.code !== 'ENOENT') log(`[advisor-mcp] could not read the notebook: ${e.message}`);
      return { sections: Object.create(null) };
    }
  };
  const has = (m, title) => Object.prototype.hasOwnProperty.call(m.sections, title);
  const total = (m) => Object.values(m.sections).reduce((n, v) => n + v.text.length, 0);
  function save(m) {
    fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
    if (fs.existsSync(file)) {
      // The counter keeps two saves in the same millisecond from overwriting each other's backup.
      backupCounter += 1;
      fs.copyFileSync(file, path.join(dir, 'backups', `memory-${new Date().toISOString().replace(/[:.]/g, '-')}-${String(backupCounter).padStart(6, '0')}.json`));
    }
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
      if (typeof sectionRaw !== 'string' || typeof textRaw !== 'string') return { error: 'The section title and the note must be text.' };
      const title = cleanTitle(sectionRaw);
      const text = cleanText(textRaw);
      if (!title) return { error: 'A section title is needed.' };
      if (!text) return { error: 'The note is empty.' };
      if (looksPersonal(text) || looksPersonal(title)) return { error: 'Refused: the note looks like it contains an email or a phone/ID number. The notebook must not hold personal data. Rewrite it without names, emails or numbers.' };
      const m = load();
      const had = has(m, title) ? m.sections[title] : null;
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
      if (!has(m, title)) return { error: `No section "${title}". Sections: ${Object.keys(m.sections).join(', ') || '(none)'}.` };
      delete m.sections[title];
      save(m);
      return { ok: true, removed: title };
    },
  };
}

// A connector: its address (prefix + secret), the notebook, and the JSON-RPC conversation around the given read-only tools.
//   prefix        the start of the address, e.g. '/advisor-mcp/'
//   token         the secret (off if shorter than 32 characters); tokenName is only used in the log message
//   tools         the connector's own tools (the notebook tools are added in front)
//   callTool      (name, args) => a tool result (textResult / errorResult) for one of those tools
//   serverName / instructions   what Claude is told about the connector
function createMcpEndpoint({ prefix, token, tokenName, tools, callTool, serverName, instructions, memoryDir, log = console.log }) {
  const memory = createMemory(memoryDir, log);
  const enabled = typeof token === 'string' && token.length >= 32;
  if (token && !enabled) log(`[advisor-mcp] ${tokenName} is shorter than 32 characters, so the connector stays off.`);
  const TOOLS = [...MEMORY_TOOLS, ...tools];

  function run(name, args) {
    const a = args && typeof args === 'object' ? args : {};
    if (name === 'read_memory' || name === 'save_memory' || name === 'forget_memory') {
      if (!memory.available) return errorResult('The notebook is not set up on this server.');
      if (name === 'read_memory') return textResult({ pulledAt: new Date().toISOString(), ...memory.read() });
      const done = name === 'save_memory' ? memory.write(a.section, a.text, a.mode === 'replace' ? 'replace' : 'append') : memory.forget(a.section);
      return done.error ? errorResult(done.error) : textResult(done);
    }
    return callTool(name, a);
  }

  function rpc(msg) {
    // The client's own answer to something (it has a result or an error and no method): accepted, nothing to say.
    if (msg && typeof msg === 'object' && msg.jsonrpc === '2.0' && msg.method === undefined && msg.id !== undefined
      && ('result' in msg || 'error' in msg)) return null;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return { jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'Invalid request' } };
    }
    if (msg.id === undefined) return null; // a notification: no reply (an id of null still gets one)
    const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
    switch (msg.method) {
      case 'initialize':
        return ok({ protocolVersion: SUPPORTED_PROTOCOLS.includes(msg.params && msg.params.protocolVersion) ? msg.params.protocolVersion : PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: serverName, version: '1.0.0' }, instructions });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call': {
        const params = msg.params || {};
        if (!TOOLS.some((t) => t.name === params.name)) return fail(-32602, `Unknown tool "${params.name}"`);
        try {
          return ok(run(params.name, params.arguments));
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
    if (!urlPath.startsWith(prefix)) return false;
    const reply = (status, body) => {
      const text = body === undefined ? '' : JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(text);
    };
    // Wrong or missing secret, or the connector off: look exactly like a page that does not exist.
    let given = '';
    try { given = decodeURIComponent(urlPath.slice(prefix.length)).replace(/\/$/, ''); } catch (e) { /* bad escape: no match */ }
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
      if (!payload.length || payload.length > MAX_BATCH) {
        reply(200, { jsonrpc: '2.0', id: null, error: { code: -32600, message: payload.length ? `At most ${MAX_BATCH} requests in one batch.` : 'Invalid request: empty batch' } });
        return true;
      }
      const out = payload.map(rpc).filter(Boolean);
      if (!out.length) { res.writeHead(202); res.end(); } else reply(200, out);
      return true;
    }
    const answer = rpc(payload);
    if (!answer) { res.writeHead(202); res.end(); } else reply(200, answer);
    return true;
  }

  return { enabled, handle, callTool: run, rpc, TOOLS };
}

module.exports = { createMcpEndpoint, createMemory, textResult, errorResult, tokenMatches, MEMORY_TOOLS };

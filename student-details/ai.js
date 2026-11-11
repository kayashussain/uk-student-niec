// The AI helper: asks Claude a question and gets the answer back in a fixed shape. Used by the option finder in the
// Fact File (finder.js) and by "Ask the analyst" on the Dashboard.
//
// It is off until two things are true on the server:
//   1. the ANTHROPIC_API_KEY setting holds a key from console.anthropic.com (never in git, never sent to a page), and
//   2. the Anthropic package is installed (Run NPM Install; it is an optional package, so the rest of the system
//      works the same without it).
// While it is off the pages say so, and the option finder answers with its own built-in matching instead.
//
// What is sent: the Fact File's own facts, the counselor's question and the student's study details (level, grades,
// English score, budget). A student's name, email, phone number or address is never sent.
//
// NIEC_AI_MODEL chooses another Claude model; the default is Claude Opus 5.5.

const DEFAULT_MODEL = 'claude-opus-5-5';

let sdk = null;
let sdkMissing = false;
function loadSdk() {
  if (sdk || sdkMissing) return sdk;
  try {
    const mod = require('@anthropic-ai/sdk');
    sdk = mod.default || mod;
  } catch (e) {
    sdkMissing = true;
  }
  return sdk;
}

// `client`: a stand-in for the Anthropic client (the tests pass one, so they never call the real service).
function createAi({ env = process.env, client = null } = {}) {
  const key = String(env.ANTHROPIC_API_KEY || '').trim();
  const model = String(env.NIEC_AI_MODEL || '').trim() || DEFAULT_MODEL;
  let made = client;

  function status() {
    if (client) return { ready: true, model, reason: '' };
    if (!key) return { ready: false, model, reason: 'no-key' };
    if (!loadSdk()) return { ready: false, model, reason: 'not-installed' };
    return { ready: true, model, reason: '' };
  }
  const offMessage = () => ({
    'no-key': 'The AI helper is not switched on yet. Admin adds the ANTHROPIC_API_KEY setting on the server to switch it on.',
    'not-installed': 'The AI helper has a key but its package is not installed on the server. Press Run NPM Install, then Restart.',
    '': '',
  }[status().reason]);

  function getClient() {
    if (made) return made;
    const Anthropic = loadSdk();
    made = new Anthropic({ apiKey: key });
    return made;
  }

  // One question, one answer as JSON that follows `schema` (every object in it needs additionalProperties: false and
  // a full `required` list). `system`: the standing instructions and facts, as text blocks; a block marked `cache: true`
  // is kept by the service for a few minutes, so asking again about the same Fact File costs a fraction.
  async function askJson({ system, user, schema, effort = 'high', maxTokens = 16000 }) {
    const state = status();
    if (!state.ready) { const e = new Error(offMessage()); e.code = 'AI_OFF'; throw e; }
    const anthropic = getClient();
    const request = {
      model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort, format: { type: 'json_schema', schema } },
      // If the model declines a request, the service tries its recommended stand-in model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: system.map((block) => ({ type: 'text', text: block.text, ...(block.cache ? { cache_control: { type: 'ephemeral' } } : {}) })),
      messages: [{ role: 'user', content: user }],
    };
    let message;
    try {
      // Streamed, so a long answer never runs into a connection time limit; only the finished message is used.
      message = await anthropic.beta.messages.stream(request).finalMessage();
    } catch (e) {
      throw friendly(e);
    }
    if (message.stop_reason === 'refusal') { const e = new Error('The AI declined to answer this question. Please word it differently.'); e.code = 'AI_REFUSED'; throw e; }
    if (message.stop_reason === 'max_tokens') { const e = new Error('The answer was too long to finish. Please ask about fewer things at once.'); e.code = 'AI_TOO_LONG'; throw e; }
    const text = (message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return { data: JSON.parse(text), model: message.model || model, usage: message.usage || null };
    } catch (e) {
      const err = new Error('The AI answer could not be read. Please try again.');
      err.code = 'AI_BAD_ANSWER';
      throw err;
    }
  }

  // Errors as sentences a person can act on (the SDK's own error classes, most specific first).
  function friendly(e) {
    const Anthropic = loadSdk();
    const is = (name) => Boolean(Anthropic && Anthropic[name] && e instanceof Anthropic[name]);
    let text = 'The AI service could not be reached. Please try again in a moment.';
    if (is('AuthenticationError') || is('PermissionDeniedError')) text = 'The AI service refused the key. Check the ANTHROPIC_API_KEY setting on the server.';
    else if (is('RateLimitError')) text = 'The AI service is busy or the monthly limit of the key is reached. Please try again in a few minutes.';
    else if (is('BadRequestError')) text = `The AI service did not accept the question (${String(e.message || '').slice(0, 200)}).`;
    else if (is('APIConnectionError')) text = 'The server could not connect to the AI service. Check that the server is allowed to reach api.anthropic.com.';
    else if (is('APIError')) text = `The AI service answered with an error (${e.status || 'unknown'}). Please try again in a moment.`;
    const out = new Error(text);
    out.code = 'AI_ERROR';
    out.cause = e;
    return out;
  }

  return { status, offMessage, askJson, model };
}

// Long questions are answered in the background: the page gets a ticket at once and asks for the answer every few
// seconds, so a slow answer is never cut off by the web host's time limit. Kept in memory only.
function createJobs({ max = 4, keepMs = 15 * 60 * 1000, perUserHour = 30, now = Date.now } = {}) {
  const jobs = new Map(); // id -> { userId, status, result, error, at }
  const asked = new Map(); // account id -> [times]
  const crypto = require('crypto');
  function sweep() { const t = now(); jobs.forEach((j, id) => { if (t - j.at > keepMs) jobs.delete(id); }); }
  return {
    // Starts `work()` (a promise) for this account. { id } or { error, status }.
    start(userId, work) {
      sweep();
      const t = now();
      const recent = (asked.get(userId) || []).filter((x) => t - x < 3600000);
      if (recent.length >= perUserHour) return { error: 'That is a lot of questions in one hour. Please wait a little.', status: 429 };
      const running = [...jobs.values()].filter((j) => j.status === 'working');
      if (running.some((j) => j.userId === userId)) return { error: 'Your last question is still being answered. Please wait for it.', status: 429 };
      if (running.length >= max) return { error: 'The AI helper is busy with other questions. Please try again in a minute.', status: 429 };
      recent.push(t);
      asked.set(userId, recent);
      const id = crypto.randomBytes(8).toString('hex');
      const job = { userId, status: 'working', result: null, error: '', at: t };
      jobs.set(id, job);
      Promise.resolve().then(work).then((result) => { job.status = 'done'; job.result = result; }, (e) => { job.status = 'failed'; job.error = String((e && e.message) || e).slice(0, 400); });
      return { id };
    },
    get(userId, id) {
      const job = jobs.get(id);
      return job && job.userId === userId ? job : null;
    },
  };
}

module.exports = { createAi, createJobs, DEFAULT_MODEL };

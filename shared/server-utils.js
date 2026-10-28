// Helpers shared by the gateway and both apps' servers, so a fix in one place reaches all three.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

// Calendar dates (daily backups, "today's" exchange rate) follow the office's clock, not UTC.
const TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Kathmandu';

// YYYY-MM-DD in TIME_ZONE.
function localDate(date = new Date(), timeZone = TIME_ZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Sent with every response: the pages can't be shown inside another site's frame (so no one can trick
// a logged-in user into clicking things there), browsers don't guess file types, and no addresses
// leak to other sites through the Referer header.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

// Text bigger than this is sent gzip-compressed to browsers that accept it (all do): JSON and pages
// shrink to a fifth or less, which is most of the waiting on a slow connection.
const COMPRESS_FROM_BYTES = 1024;
const acceptsGzip = (res) => Boolean(res.req && /\bgzip\b/.test(String(res.req.headers['accept-encoding'] || '')));

// `gzipped`: the body already compressed (a cached copy), used when the browser accepts gzip.
function send(res, status, body, headers = {}, gzipped = null) {
  const out = { ...SECURITY_HEADERS, ...headers };
  if (body != null && !out['Content-Encoding'] && acceptsGzip(res)) {
    if (gzipped) {
      body = gzipped;
      out['Content-Encoding'] = 'gzip';
    } else if (Buffer.byteLength(body) >= COMPRESS_FROM_BYTES && /json|text|javascript|svg/.test(String(out['Content-Type']))) {
      body = zlib.gzipSync(body, { level: 6 });
      out['Content-Encoding'] = 'gzip';
    }
    if (out['Content-Encoding']) out.Vary = 'Accept-Encoding';
  }
  res.writeHead(status, out);
  res.end(body);
}

function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
}

// Compares hashes rather than the strings themselves, so neither the content nor the length of the
// real value can be worked out from how long the comparison takes.
function safeEqual(a, b) {
  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

// Requests reaching us through a proxy on this machine or a private network (the gateway, Render's
// load balancer, cPanel's Passenger) carry the real client in X-Forwarded-For. The proxy appends the
// address it saw, so the last entry is the one a client can't forge. Direct connections use the socket.
const PRIVATE_ADDRESS = /^(::1$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|f[cd][0-9a-f]{2}:|::ffff:(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i;
function clientIp(req) {
  const remote = (req.socket && req.socket.remoteAddress) || '';
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && (!remote || PRIVATE_ADDRESS.test(remote))) {
    const parts = String(forwarded).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return remote;
}

// A short name for the browser and device a request came from, e.g. "Chrome on Windows".
function describeDevice(userAgent) {
  const ua = String(userAgent || '');
  const os = [
    [/iPhone/, 'iPhone'], [/iPad/, 'iPad'], [/Android/, 'Android'], [/Windows/, 'Windows'],
    [/Mac OS X|Macintosh/, 'Mac'], [/CrOS/, 'Chromebook'], [/Linux/, 'Linux'],
  ].find(([re]) => re.test(ua));
  const browser = [
    [/Edg\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/SamsungBrowser/, 'Samsung Internet'], [/Firefox\//, 'Firefox'],
    [/Chrome\/|CriOS/, 'Chrome'], [/Safari\//, 'Safari'], [/curl\//, 'curl'],
  ].find(([re]) => re.test(ua));
  if (!os && !browser) return ua ? ua.slice(0, 60) : 'Unknown device';
  return `${browser ? browser[1] : 'Browser'} on ${os ? os[1] : 'unknown system'}`;
}

// The activity record (Activity page): one JSON line per login, logout or change, only ever added to.
// Both apps write to the same file in the Student Details data folder.
//
// Each entry has a category, used by the page's filter: logins (logged in or out), security (failed
// logins, refused changes, wrong hidden-sheet password, hidden sheets opened), changes (cell and sheet
// edits) and accounts (people added, access changed, passwords and settings).
const SECURITY_ACTIONS = new Set(['Failed login', 'Change refused', 'Wrong hidden-sheet password', 'Opened hidden sheets', 'Test email failed']);
function activityCategory(action) {
  if (action === 'Logged in' || action === 'Logged out') return 'logins';
  if (SECURITY_ACTIONS.has(action)) return 'security';
  if (action === 'Changed') return 'changes';
  return 'accounts';
}

function createActivityLog(dir) {
  const file = path.join(dir, 'activity.jsonl');
  let cache = null; // { mtimeMs, size, events } the whole record, oldest first, parsed once per change

  function record(req, user, action, details = {}) {
    const entry = {
      time: new Date().toISOString(),
      account: user ? user.label : 'Unknown',
      accountId: user ? user.id : null,
      device: describeDevice(req.headers['user-agent']),
      ip: clientIp(req),
      action,
      ...details,
    };
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    } catch (e) {
      console.error('[activity]', e.message);
    }
  }

  function events() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return []; }
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.events;
    const parsed = [];
    fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
      if (!line) return;
      try {
        const e = JSON.parse(line);
        e.category = activityCategory(e.action);
        parsed.push(e);
      } catch (e) { /* a damaged line is skipped */ }
    });
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, events: parsed };
    return parsed;
  }

  // The newest `limit` entries, newest first.
  function latest(limit = 2000) {
    return events().slice(-limit).reverse();
  }

  // Filtered, paged entries (newest first) plus counts for the summary cards.
  //   account  exactly this person's label      category  logins | security | changes | accounts
  //   from, to ISO times (inclusive)            q         words to find anywhere in the entry
  function query({ account = '', category = '', from = '', to = '', q = '', limit = 100, offset = 0 } = {}) {
    const all = events();
    const lower = String(q).trim().toLowerCase();
    const fromMs = from ? Date.parse(from) : -Infinity;
    const toMs = to ? Date.parse(to) : Infinity;
    const matches = [];
    for (let i = all.length - 1; i >= 0; i -= 1) {
      const e = all[i];
      if (account && e.account !== account) continue;
      if (category && e.category !== category) continue;
      const t = Date.parse(e.time);
      if (t < fromMs || t > toMs) continue;
      if (lower && !`${e.account} ${e.action} ${e.app || ''} ${e.device} ${e.note || ''} ${(e.changes || []).join(' ')}`.toLowerCase().includes(lower)) continue;
      matches.push(e);
    }
    return {
      total: matches.length,
      events: matches.slice(offset, offset + limit),
      people: [...new Set(all.map((e) => e.account))].sort(),
      summary: summarize(all),
    };
  }

  // Counts for "today" (office time) and the last 7 days, over the whole record.
  function summarize(all) {
    const today = localDate();
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const out = { today: { logins: 0, failedLogins: 0, changes: 0, people: 0 }, week: { logins: 0, failedLogins: 0, changes: 0 } };
    const people = new Set();
    for (let i = all.length - 1; i >= 0; i -= 1) {
      const e = all[i];
      const t = Date.parse(e.time);
      if (t < weekAgo - 24 * 3600 * 1000) break; // the record is in time order: nothing older matters
      const isToday = localDate(new Date(t)) === today;
      const login = e.action === 'Logged in';
      const failed = e.action === 'Failed login';
      const change = e.action === 'Changed';
      if (t >= weekAgo) {
        if (login) out.week.logins += 1;
        if (failed) out.week.failedLogins += 1;
        if (change) out.week.changes += 1;
      }
      if (isToday) {
        if (login) out.today.logins += 1;
        if (failed) out.today.failedLogins += 1;
        if (change) out.today.changes += 1;
        if (e.accountId) people.add(e.accountId);
      }
    }
    out.today.people = people.size;
    return out;
  }

  return { record, latest, query };
}

// Serves only the files listed in publicFiles ({ '/name': contentType }), so data files and server
// code sitting next to them are never reachable.
// The files in shared/ that pages load, and their types. One list for both apps, so a new shared file
// is added in one place. Public (no login needed): only the login page and the logo.
const SHARED_FILES = {
  '/edit-guard.js': 'text/javascript; charset=utf-8',
  '/session.js': 'text/javascript; charset=utf-8',
  '/patch.js': 'text/javascript; charset=utf-8',
  '/teams.js': 'text/javascript; charset=utf-8',
  '/header.js': 'text/javascript; charset=utf-8',
  '/header.css': 'text/css; charset=utf-8',
  '/niec-logo.png': 'image/png',
  '/login.html': 'text/html; charset=utf-8',
};
const PUBLIC_SHARED = new Set(['/niec-logo.png', '/login.html']);

// Each file is read and compressed once, then kept in memory (the files only change with a deploy,
// which restarts the server). The browser keeps its copy and only checks it's still current: an
// unchanged file is answered "304 Not Modified" with no body at all.
function createStaticServer(root, publicFiles) {
  const cache = new Map(); // name -> { data, gz, etag }
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const data = fs.readFileSync(path.join(root, name.slice(1)));
    const entry = {
      data,
      gz: /text|javascript|svg/.test(publicFiles[name]) ? zlib.gzipSync(data, { level: 9 }) : null,
      etag: '"' + crypto.createHash('sha1').update(data).digest('base64url').slice(0, 20) + '"',
    };
    cache.set(name, entry);
    return entry;
  }
  return function serveStatic(req, res) {
    const urlPath = req.url.split('?')[0];
    const name = urlPath === '/' ? '/index.html' : urlPath;
    const type = publicFiles[name];
    if (!type) return send(res, 404, 'Not found');
    let file;
    try {
      file = load(name);
    } catch (e) {
      return send(res, 404, 'Not found');
    }
    // no-cache: the browser checks for a newer copy every time, so a deploy shows up on a normal reload.
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: file.etag };
    if (req.headers['if-none-match'] === file.etag) return send(res, 304, null, headers);
    send(res, 200, file.data, headers, file.gz);
  };
}

// Reads a JSON request body, rejecting with statusCode 413 past maxBytes and 400 for bad JSON.
function readJSONBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      const body = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        e.statusCode = 400;
        e.message = 'invalid JSON';
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Writes to a temporary file and renames it into place, so a crash mid-write, or another process
// reading the file at that moment, never sees half a file.
function writeFileAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// Once a day, before the first save of that day, copies the file into <dataDir>/backups/<prefix>-YYYY-MM-DD.json
// and keeps the latest 60, so there's something to restore from beyond the last save.
function snapshotDaily(file, dataDir, prefix) {
  try {
    if (!fs.existsSync(file)) return;
    const dir = path.join(dataDir, 'backups');
    const target = path.join(dir, `${prefix}-${localDate()}.json`);
    if (fs.existsSync(target)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, target);
    fs.readdirSync(dir)
      .filter((f) => f.startsWith(prefix + '-') && f.endsWith('.json'))
      .sort()
      .slice(0, -60)
      .forEach((f) => fs.unlinkSync(path.join(dir, f)));
  } catch (e) {
    console.error('[backup]', e.message); // never block a save over a backup problem
  }
}

module.exports = {
  SECURITY_HEADERS,
  TIME_ZONE,
  localDate,
  send,
  sendJSON,
  safeEqual,
  clientIp,
  createActivityLog,
  activityCategory,
  describeDevice,
  createStaticServer,
  SHARED_FILES,
  PUBLIC_SHARED,
  readJSONBody,
  writeFileAtomic,
  snapshotDaily,
};

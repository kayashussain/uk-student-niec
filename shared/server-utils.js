// Helpers shared by the gateway and both apps' servers, so a fix in one place reaches all three.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
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

// The accounts that can log in, picked from a list on the login page (shared/login.html). Only a
// scrypt hash of each password is kept here. To change a password, replace its hash with the output of
//   node -e "console.log(require('crypto').scryptSync('NEW PASSWORD', 'niec-login-v1', 32).toString('hex'))"
const ACCOUNTS = [
  { id: 'admin', label: 'Admin', hash: '2fc2b430e9e2307db85684a96f60a10bbd4d09eb602d1ebaa363c89ab0ba804a' },
  { id: 'application', label: 'Application Team', hash: '185cea1d3200f1bd6803b16ea76e8960c474bc6d2df3713d91926fd5b37ac713' },
  { id: 'mock', label: 'Mock Team', hash: '7c15dffa55d50c4e7acb605799e167a36253cdd139649ee66346fc758c949d7e' },
  { id: 'followup', label: 'Follow-up Team', hash: 'e3c077efc7e833df1dc8382cbbe4bbdf4f363052d364f2789e78fe31958f74d5' },
];
const LOGIN_SALT = 'niec-login-v1';

const SESSION_COOKIE = 'niec_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // staying logged in for 30 days

function passwordMatches(password, hash) {
  const given = crypto.scryptSync(String(password), LOGIN_SALT, 32);
  return crypto.timingSafeEqual(given, Buffer.from(hash, 'hex'));
}

// The key that signs login cookies. Kept in a file both apps can read (the Student Details data
// folder), so logging in once works for both, and a restart doesn't log everyone out. Made on first use.
function loadSecret(dir) {
  const file = path.join(dir, 'session-secret');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  return fs.readFileSync(file, 'utf8').trim();
}

function readCookie(req, name) {
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

const isHttps = (req) => Boolean((req.socket && req.socket.encrypted)
  || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');

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

// The activity record ("Check activity"): one JSON line per login, logout or change, only ever added
// to. Both apps write to the same file in the Student Details data folder.
function createActivityLog(dir) {
  const file = path.join(dir, 'activity.jsonl');
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
  // The newest `limit` entries, newest first.
  function latest(limit = 2000) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
    const lines = text.split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map((line) => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
  }
  return { record, latest };
}

// Login with a session cookie that names the account. requireAuth(req, res) -> true when the request
// may go ahead (and sets req.user to { id, label }); otherwise it has answered already: a page visit
// goes to the login page (coming back to homePath(req) after), anything else gets a 401.
// handleLogin answers the login page's POST, handleLogout clears the cookie. After `maxFailures` wrong
// passwords from one address within `windowMs`, that address is refused (429) until the window runs
// out, without its guesses even being checked. onLogin/onLogout(req, user) are told about each one.
function createAuth({
  secretDir, homePath = (req) => req.url, accounts = ACCOUNTS,
  maxFailures = 20, windowMs = 15 * 60 * 1000, now = Date.now, onLogin = () => {}, onLogout = () => {},
} = {}) {
  let secret = null;
  const sign = (value) => {
    if (!secret) secret = loadSecret(secretDir);
    return crypto.createHmac('sha256', secret).update(value).digest('hex');
  };
  const failures = new Map(); // ip -> { count, since }
  const publicAccount = (a) => ({ id: a.id, label: a.label });

  // The logged-in account, or null.
  function userOf(req) {
    const [id, expires, mac] = readCookie(req, SESSION_COOKIE).split('.');
    if (!id || !expires || !mac || !(Number(expires) > now())) return null;
    if (!safeEqual(mac, sign(`${id}.${expires}`))) return null;
    const account = accounts.find((a) => a.id === id);
    return account ? publicAccount(account) : null;
  }

  function requireAuth(req, res) {
    const user = userOf(req);
    if (user) {
      req.user = user;
      return true;
    }
    const wantsPage = req.method === 'GET' && String(req.headers.accept || '').includes('text/html');
    if (wantsPage) {
      send(res, 302, '', { Location: '/login?next=' + encodeURIComponent(homePath(req)), 'Cache-Control': 'no-store' });
    } else {
      sendJSON(res, 401, { error: 'Please log in again.' });
    }
    return false;
  }

  async function handleLogin(req, res) {
    const t = now();
    const ip = clientIp(req);
    let f = failures.get(ip);
    if (f && t - f.since > windowMs) {
      failures.delete(ip);
      f = null;
    }
    if (f && f.count >= maxFailures) {
      return sendJSON(res, 429, { error: 'Too many wrong passwords. Try again in a few minutes.' });
    }
    let body;
    try {
      body = await readJSONBody(req, 4096);
    } catch (e) {
      return sendJSON(res, e.statusCode || 400, { error: e.message });
    }
    const account = accounts.find((a) => a.id === (body && body.account));
    if (!account) return sendJSON(res, 400, { error: 'Please choose your account.' });
    if (!passwordMatches((body && body.password) || '', account.hash)) {
      if (failures.size > 10000) failures.forEach((x, k) => { if (t - x.since > windowMs) failures.delete(k); });
      if (f) f.count += 1;
      else failures.set(ip, { count: 1, since: t });
      return sendJSON(res, 401, { error: 'Wrong password.' });
    }
    failures.delete(ip);
    const expires = String(t + SESSION_MS);
    const value = `${account.id}.${expires}.${sign(`${account.id}.${expires}`)}`;
    const cookie = `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${SESSION_MS / 1000}; HttpOnly; SameSite=Lax`
      + (isHttps(req) ? '; Secure' : '');
    onLogin(req, publicAccount(account));
    send(res, 200, JSON.stringify({ ok: true }), {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookie,
    });
  }

  function handleLogout(req, res) {
    const user = userOf(req);
    if (user) onLogout(req, user);
    send(res, 200, JSON.stringify({ ok: true }), {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    });
  }

  const listAccounts = () => accounts.map(publicAccount);

  return { requireAuth, handleLogin, handleLogout, userOf, listAccounts };
}

// Serves only the files listed in publicFiles ({ '/name': contentType }), so data files and server
// code sitting next to them are never reachable.
function createStaticServer(root, publicFiles) {
  return function serveStatic(req, res) {
    const urlPath = req.url.split('?')[0];
    const name = urlPath === '/' ? '/index.html' : urlPath;
    const type = publicFiles[name];
    if (!type) return send(res, 404, 'Not found');
    fs.readFile(path.join(root, name.slice(1)), (err, data) => {
      if (err) return send(res, 404, 'Not found');
      // no-cache: the browser checks for a newer copy every time, so a deploy shows up on a normal reload.
      send(res, 200, data, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    });
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
  createAuth,
  createActivityLog,
  describeDevice,
  createStaticServer,
  readJSONBody,
  writeFileAtomic,
  snapshotDaily,
};

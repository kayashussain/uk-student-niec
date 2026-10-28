// Personal accounts for both apps: one login per person, password + authenticator-app code, sessions
// the server can end at any moment (disabling a person logs them out everywhere at once).
//
// Files, all in the Student Details data folder (`dir`), never served:
//   users.json     people: username, name, email, role (admin, manager or staff), departments, scrypt password
//                  hash, authenticator secret, disabled
//   sessions.json  logged-in devices, keyed by a SHA-256 of the cookie token (the token itself is never stored)
//   mail.json      the mail server settings, written on the server by `node scripts/email.js setup` (the mail
//                  password is never sent to a page)
//
// Access: the first Admin is the owner and nobody else can ever be made Admin. Everyone else is the Manager
// (dashboard and view-only Student Details) or a staff member in one or more departments (Application,
// Mock, Follow-up, any mix). See shared/teams.js for what each can see and change.
//   first-admin-code.txt  only until the first Admin exists (see below)
//
// Logging in: username + password, then the 6-digit code from the person's authenticator app. A new
// person (or one whose password/authenticator Admin reset) first sets their own password and links the
// app. Until an Admin has finished setting up (own password + authenticator), the server keeps a random
// one-time setup code in first-admin-code.txt next to the data and prints it in its log; whoever has it
// (so: has access to the server) creates the first Admin account. If that setup is left unfinished
// (e.g. the browser was closed), the setup screen and the same code stay available to start again.
// The code is deleted once an Admin has finished. No password is built into the code.
// The Student Details server answers all of this (handleApi); the Incentive server only checks
// sessions (requireAuth), reading the same files.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { send, sendJSON, safeEqual, clientIp, readJSONBody, writeFileAtomic, describeDevice } = require('./server-utils');
const Teams = require('./teams');
const defaultMailer = require('./mailer');

const DEPARTMENTS = Object.fromEntries(Object.entries(Teams.DEPARTMENTS).map(([id, d]) => [id, d.label]));

const SESSION_COOKIE = 'niec_session';
const SESSION_MS = 12 * 60 * 60 * 1000; // a login lasts one working day
const PENDING_MS = 10 * 60 * 1000; // between the password and the code / finishing setup
const LAST_SEEN_EVERY_MS = 5 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 10;


// ---------------------------------------------------------------------------------------------
// Passwords: scrypt with a random salt per password, stored as "scrypt$<salt hex>$<hash hex>".
// ---------------------------------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [kind, saltHex, hashHex] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const given = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), 32);
  return crypto.timingSafeEqual(given, Buffer.from(hashHex, 'hex'));
}

// Checked for a username that doesn't exist, so a wrong username takes as long as a wrong password.
const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

// A password may include (or be) the username: that's each person's choice. The authenticator code
// is what stops someone who only knows or guesses the password.
function passwordProblem(password) {
  const pw = String(password || '');
  if (pw.length < MIN_PASSWORD_LENGTH) return `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password|qwerty)/i.test(pw)) return 'That password is too easy to guess.';
  return null;
}

// Easy to read out or type: no 0/O, 1/l/I.
function temporaryPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(14);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// ---------------------------------------------------------------------------------------------
// Authenticator codes (TOTP, RFC 6238: HMAC-SHA1, 30-second steps, 6 digits), as used by Google
// Authenticator, Microsoft Authenticator and others.
// ---------------------------------------------------------------------------------------------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(text).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpAt(secretBuf, step, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', secretBuf).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

// The time step the code belongs to (allowing one step either side for a phone clock that's a little
// off), or -1. A step at or before `lastStep` is refused, so a code can't be used twice.
function matchTotp(secretBase32, code, nowMs, lastStep = -1) {
  const clean = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return -1;
  const secret = base32Decode(secretBase32);
  const current = Math.floor(nowMs / 30000);
  for (const step of [current - 1, current, current + 1]) {
    if (step > lastStep && safeEqual(totpAt(secret, step), clean)) return step;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------
// JSON files, re-read only when they change on disk (the other app may have written them).
// ---------------------------------------------------------------------------------------------

function createStore(file, fallback, transform = (d) => d) {
  let cache = null; // { mtimeMs, size, data }
  return {
    read() {
      let stat;
      try {
        stat = fs.statSync(file);
      } catch (e) {
        return fallback();
      }
      if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
      const data = transform(JSON.parse(fs.readFileSync(file, 'utf8')));
      cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
      return data;
    },
    write(data) {
      writeFileAtomic(file, JSON.stringify(data, null, 2));
      try { fs.chmodSync(file, 0o600); } catch (e) { /* not supported on every host */ }
      const stat = fs.statSync(file);
      cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
    },
  };
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
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Accounts saved before departments existed had one team as their role (role: 'mock'): that becomes a
// staff member in that one department.
function normalizeUser(u) {
  if (u.role === 'ceo') return { ...u, role: 'manager', departments: [] }; // the Manager role was first called CEO
  if (u.role === 'manager') return { ...u, departments: (u.departments || []).filter((d) => DEPARTMENTS[d]) };
  if (DEPARTMENTS[u.role]) return { ...u, role: 'staff', departments: [u.role] };
  if (u.role === 'staff') return { ...u, departments: (u.departments || []).filter((d) => DEPARTMENTS[d]) };
  return { ...u, departments: [] };
}

// What a person can do, in words: "Admin", "Manager", or their teams joined with a plus.
function accessLabel(u) {
  if (u.role === 'admin') return 'Admin';
  const teams = (u.departments || []).map((d) => DEPARTMENTS[d]);
  if (u.role === 'manager') return ['Manager', ...teams].join(' + ');
  return teams.join(' + ') || 'No team';
}

// Who a user is, for pages and the activity record. Never includes the password or secret.
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email || '',
    role: u.role,
    departments: u.departments || [],
    roleLabel: accessLabel(u),
    label: `${u.name} (${accessLabel(u)})`,
  };
}

// Checks the access chosen for a person: the Manager, or staff in one or more departments. Admin can't be
// chosen, whatever is sent. { role, departments } or { error }.
function parseAccess(body) {
  let role = String(body.role || '');
  if (role === 'ceo') role = 'manager';
  let departments = Array.isArray(body.departments) ? body.departments.map(String) : [];
  if (DEPARTMENTS[role]) { departments = [role]; role = 'staff'; } // the older single-team form
  if (role === 'admin') return { error: "Admin access can't be given to anyone. The Admin account belongs to the owner only." };
  const manager = body.manager === true || role === 'manager';
  departments = [...new Set(departments)];
  if (departments.some((d) => !DEPARTMENTS[d])) return { error: 'That team does not exist.' };
  if (!manager && !departments.length) return { error: 'Choose at least one team, or Manager, for this person.' };
  return { role: manager ? 'manager' : 'staff', departments };
}

const USERNAME_RULE = /^[a-z0-9._@-]{3,60}$/;
const USERNAME_HELP = 'Usernames use 3 to 60 letters, numbers, dots, dashes or @. Capital letters are fine; they are not case sensitive.';
const cleanUsername = (s) => String(s || '').trim().toLowerCase();
// '' for no email, null when it isn't an email address, else the address in lower case.
function cleanEmail(s) {
  const e = String(s || '').trim().toLowerCase();
  if (!e) return '';
  return defaultMailer.isAddress(e) ? e : null;
}

// ---------------------------------------------------------------------------------------------

function createAccounts({
  dir, homePath = (req) => req.url, activity = null, writable = true, now = Date.now, mailer = defaultMailer,
  // Password only by default. Set REQUIRE_AUTHENTICATOR=1 to also ask for the 6-digit code from an authenticator app.
  requireAuthenticator = process.env.REQUIRE_AUTHENTICATOR === '1',
  maxFailures = 20, maxUserFailures = 8, windowMs = 15 * 60 * 1000,
}) {
  fs.mkdirSync(dir, { recursive: true });
  const usersStore = createStore(path.join(dir, 'users.json'), () => ({ users: [] }),
    (data) => ({ ...data, users: (data.users || []).map(normalizeUser) }));
  const sessionsStore = createStore(path.join(dir, 'sessions.json'), () => ({ sessions: {} }));
  const record = (req, user, action, details) => { if (activity) activity.record(req, user, action, details); };
  const setupCodeFile = path.join(dir, 'first-admin-code.txt');

  const users = () => usersStore.read().users;
  const saveUsers = (list) => usersStore.write({ users: list });
  const findUser = (id) => users().find((u) => u.id === id);

  // The one-time code for creating the first Admin: made (and printed) only while no accounts exist.
  // Someone who can log in: their own password is set (and their authenticator, when that is required).
  const isSetUp = (u) => !u.disabled && !u.mustChangePassword && (!requireAuthenticator || Boolean(u.totpSecret));
  const hasReadyAdmin = () => users().some((u) => u.role === 'admin' && isSetUp(u));

  function setupCode() {
    if (hasReadyAdmin()) return null;
    try {
      return fs.readFileSync(setupCodeFile, 'utf8').trim();
    } catch (e) {
      if (!writable) return null;
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.randomBytes(12), (b) => chars[b % chars.length]).join('').replace(/(.{4})(?!$)/g, '$1-');
      fs.writeFileSync(setupCodeFile, code + '\n', { mode: 0o600 });
      console.log(`[accounts] No accounts yet. First-time setup code: ${code} (also saved in ${setupCodeFile})`);
      return code;
    }
  }
  if (writable) setupCode();

  // ---- sessions ----
  function sessionsMap() {
    return { ...sessionsStore.read().sessions };
  }
  function saveSessions(map) {
    const t = now();
    Object.keys(map).forEach((k) => { if (map[k].expires <= t) delete map[k]; }); // drop expired ones
    sessionsStore.write({ sessions: map });
  }
  function currentSession(req) {
    const token = readCookie(req, SESSION_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const key = sha256(token);
    const s = sessionsMap()[key];
    if (!s || s.expires <= now()) return null;
    const user = findUser(s.userId);
    if (!user || user.disabled) return null;
    return { key, session: s, user };
  }
  function startSession(req, res, user, stage) {
    const token = crypto.randomBytes(32).toString('hex');
    const t = now();
    const map = sessionsMap();
    const old = currentSession(req);
    if (old) delete map[old.key]; // a pending login turning into a full one
    const ms = stage === 'full' ? SESSION_MS : PENDING_MS;
    map[sha256(token)] = {
      id: crypto.randomBytes(8).toString('hex'), // safe to show; the key is not
      userId: user.id,
      stage,
      created: t,
      lastSeen: t,
      expires: t + ms,
      device: describeDevice(req.headers['user-agent']),
      ip: clientIp(req),
    };
    saveSessions(map);
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${ms / 1000}; HttpOnly; SameSite=Strict`
      + (isHttps(req) ? '; Secure' : ''));
  }
  function endSessions(match) {
    const map = sessionsMap();
    let n = 0;
    Object.keys(map).forEach((k) => { if (match(map[k])) { delete map[k]; n += 1; } });
    if (n) saveSessions(map);
    return n;
  }
  const clearCookie = (res) => res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);

  // A request a page on another website made the browser send. SameSite=Strict already keeps the
  // cookie off those; this refuses them outright as well.
  const crossSite = (req) => req.method !== 'GET' && req.method !== 'HEAD'
    && String(req.headers['sec-fetch-site'] || '') === 'cross-site';

  // ---- the check every request goes through ----
  function requireAuth(req, res) {
    if (crossSite(req)) {
      sendJSON(res, 403, { error: 'Blocked: this request came from another website.' });
      return false;
    }
    const found = currentSession(req);
    if (found && found.session.stage === 'full') {
      req.user = publicUser(found.user);
      req.sessionId = found.session.id;
      if (writable && now() - found.session.lastSeen > LAST_SEEN_EVERY_MS) {
        const map = sessionsMap();
        if (map[found.key]) {
          map[found.key] = { ...map[found.key], lastSeen: now() };
          saveSessions(map);
        }
      }
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

  // ---- wrong-guess limits: per address and per account ----
  const ipFailures = new Map();
  const userFailures = new Map();
  function blocked(map, key, limit) {
    const f = map.get(key);
    if (!f) return false;
    if (now() - f.since > windowMs) { map.delete(key); return false; }
    return f.count >= limit;
  }
  function fail(map, key) {
    const f = map.get(key);
    if (f && now() - f.since <= windowMs) f.count += 1;
    else map.set(key, { count: 1, since: now() });
    if (map.size > 10000) map.forEach((x, k) => { if (now() - x.since > windowMs) map.delete(k); });
  }
  const TOO_MANY = 'Too many wrong tries. Please wait 15 minutes and try again.';

  // ---- email (setup details for new people, test messages) ----
  // The mail server settings come from the server (see loadConfig in shared/mailer.js), never from a page.
  const emailSettings = () => defaultMailer.loadConfig(dir);
  function emailConfig() {
    const e = emailSettings();
    return e.host && e.port && e.from && e.pass ? e : null;
  }
  // The address this request came to, e.g. https://niec.duckdns.org
  function detectedSiteUrl(req) {
    const host = /^[A-Za-z0-9.-]+(:\d+)?$/.test(String(req.headers.host || '')) ? req.headers.host : 'localhost';
    return `${isHttps(req) ? 'https' : 'http'}://${host}`;
  }
  // The address people open to log in: set in the email settings, else the address this request came to.
  const siteUrlFor = (req) => emailSettings().siteUrl || detectedSiteUrl(req);
  // Emails a person their login details. status: sent | no-address | not-configured | failed.
  async function sendSetupEmail(req, user, temp, kind) {
    if (!user.email) return { status: 'no-address' };
    const cfg = emailConfig();
    if (!cfg) return { status: 'not-configured', to: user.email };
    const message = mailer.setupEmail({
      name: user.name, username: user.username, temporaryPassword: temp, access: accessLabel(user), siteUrl: siteUrlFor(req), kind, authenticator: requireAuthenticator,
    });
    try {
      await mailer.sendMail(cfg, { to: user.email, ...message });
      return { status: 'sent', to: user.email };
    } catch (e) {
      return { status: 'failed', to: user.email, error: e.message };
    }
  }
  // One line for the activity record (never includes the password).
  const mailNote = (m) => ({
    sent: `Emailed the login details to ${m.to}`,
    'no-address': 'No email address, so nothing was emailed',
    'not-configured': 'Email is not set up yet, so nothing was emailed',
    failed: `Could not email ${m.to}: ${m.error}`,
  }[m.status]);

  // ---- the login steps and Admin's pages (Student Details only) ----
  const ok = (res, extra = {}) => sendJSON(res, 200, { ok: true, ...extra });
  const bad = (res, status, error) => sendJSON(res, status, { error });

  // What the login page should show next for this browser.
  function loginState(req) {
    const found = currentSession(req);
    // No Admin can log in yet: first-time setup (unless this browser is in the middle of it).
    if (!hasReadyAdmin() && !(found && found.session.stage === 'setup')) return { stage: 'first-admin' };
    if (!found) return { stage: 'password' };
    const { session, user } = found;
    if (session.stage === 'full') return { stage: 'done' };
    if (session.stage === 'code') return { stage: 'code', name: user.name };
    // stage 'setup'
    if (user.mustChangePassword) return { stage: 'new-password', name: user.name };
    return { stage: requireAuthenticator ? 'authenticator' : 'done', name: user.name };
  }

  // Signs the person in fully once their password and authenticator are both set.
  function finishSetupIfDone(req, res, user) {
    if (user.mustChangePassword || (requireAuthenticator && !user.totpSecret)) return ok(res, loginState(req));
    if (user.role === 'admin') { try { fs.unlinkSync(setupCodeFile); } catch (e) { /* already gone */ } }
    user = updateUser(user.id, { lastLoginAt: new Date(now()).toISOString() });
    startSession(req, res, user, 'full');
    record(req, publicUser(user), 'Logged in', { note: 'after setting up their login' });
    return ok(res, { stage: 'done' });
  }

  function updateUser(id, change) {
    const list = users().map((u) => (u.id === id ? { ...u, ...change } : u));
    saveUsers(list);
    return list.find((u) => u.id === id);
  }

  const activeAdmins = (list) => list.filter((u) => u.role === 'admin' && !u.disabled);

  function adminView(u) {
    const map = sessionsMap();
    const devices = Object.values(map).filter((s) => s.userId === u.id && s.stage === 'full' && s.expires > now());
    return {
      ...publicUser(u),
      accessLabel: accessLabel(u),
      disabled: Boolean(u.disabled),
      authenticatorRequired: requireAuthenticator,
      authenticatorLinked: !requireAuthenticator || Boolean(u.totpSecret),
      mustChangePassword: Boolean(u.mustChangePassword),
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt || null,
      loggedInDevices: devices.length,
    };
  }

  // Returns true when it answered the request.
  async function handleApi(req, res, urlPath) {
    const method = req.method;
    if (!urlPath.startsWith('/api/login') && !urlPath.startsWith('/api/logout')
      && !urlPath.startsWith('/api/users') && !urlPath.startsWith('/api/sessions')
      && urlPath !== '/api/me') return false;
    if (crossSite(req)) { bad(res, 403, 'Blocked: this request came from another website.'); return true; }
    const body = method === 'POST' ? await readJSONBody(req, 8192).catch(() => ({})) : {};
    const ip = clientIp(req);

    // -- the login page --
    if (urlPath === '/api/login/state' && method === 'GET') { sendJSON(res, 200, loginState(req)); return true; }

    if (urlPath === '/api/login/first-admin' && method === 'POST') {
      if (hasReadyAdmin()) { bad(res, 409, 'The first Admin account already exists. Please log in.'); return true; }
      if (blocked(ipFailures, ip, maxFailures)) { bad(res, 429, TOO_MANY); return true; }
      const code = setupCode();
      const given = String(body.setupCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code || !safeEqual(given, code.replace(/-/g, ''))) {
        fail(ipFailures, ip);
        record(req, null, 'Failed login', { note: 'wrong setup code for the first Admin account' });
        bad(res, 401, 'Wrong setup code.');
        return true;
      }
      const username = cleanUsername(body.username);
      const name = String(body.name || '').trim().slice(0, 60);
      if (!USERNAME_RULE.test(username)) { bad(res, 400, USERNAME_HELP); return true; }
      if (!name) { bad(res, 400, 'Please enter your name.'); return true; }
      const user = {
        id: crypto.randomBytes(8).toString('hex'), username, name, role: 'admin', departments: [],
        passwordHash: DUMMY_HASH, mustChangePassword: true, totpSecret: null, totpLastStep: -1,
        disabled: false, createdAt: new Date(now()).toISOString(),
      };
      // An earlier, unfinished setup is replaced (its account could never log in).
      const unfinished = users().filter((u) => !isSetUp(u)).map((u) => u.id);
      endSessions((sess) => unfinished.includes(sess.userId));
      saveUsers([...users().filter((u) => isSetUp(u) && u.username !== username), user]);
      record(req, publicUser(user), 'Added user', { changes: [`Created the first Admin account: ${name} (${username})`] });
      startSession(req, res, user, 'setup');
      ok(res, { stage: 'new-password', name });
      return true;
    }

    if (urlPath === '/api/login' && method === 'POST') {
      const username = cleanUsername(body.username); // not case sensitive
      if (blocked(ipFailures, ip, maxFailures) || blocked(userFailures, username, maxUserFailures)) {
        bad(res, 429, TOO_MANY);
        return true;
      }
      const user = users().find((u) => u.username === username);
      const passOk = verifyPassword(body.password || '', user ? user.passwordHash : DUMMY_HASH);
      if (!user || !passOk || user.disabled) {
        fail(ipFailures, ip);
        fail(userFailures, username);
        record(req, user && !user.disabled ? publicUser(user) : null, 'Failed login', {
          note: user && user.disabled ? `disabled account "${username}" tried to log in` : `wrong username or password (tried "${username.slice(0, 60)}")`,
        });
        bad(res, 401, 'Wrong username or password.');
        return true;
      }
      if (!requireAuthenticator && !user.mustChangePassword) {
        // Password only: the right password is the whole login.
        ipFailures.delete(ip);
        userFailures.delete(user.username);
        const updated = updateUser(user.id, { lastLoginAt: new Date(now()).toISOString() });
        startSession(req, res, updated, 'full');
        record(req, publicUser(updated), 'Logged in');
        sendJSON(res, 200, { ok: true, stage: 'done', name: user.name });
        return true;
      }
      const needsSetup = user.mustChangePassword || !user.totpSecret;
      startSession(req, res, user, needsSetup ? 'setup' : 'code');
      sendJSON(res, 200, { ok: true, stage: needsSetup ? (user.mustChangePassword ? 'new-password' : 'authenticator') : 'code', name: user.name });
      return true;
    }

    if (urlPath === '/api/login/code' && method === 'POST') {
      const found = currentSession(req);
      if (!found || found.session.stage !== 'code') { bad(res, 401, 'Please start again with your username and password.'); return true; }
      const { user } = found;
      if (blocked(ipFailures, ip, maxFailures) || blocked(userFailures, user.username, maxUserFailures)) {
        bad(res, 429, TOO_MANY);
        return true;
      }
      const step = matchTotp(user.totpSecret, body.code, now(), user.totpLastStep ?? -1);
      if (step < 0) {
        fail(ipFailures, ip);
        fail(userFailures, user.username);
        record(req, publicUser(user), 'Failed login', { note: 'right password, wrong authenticator code' });
        bad(res, 401, 'Wrong code. Use the newest 6-digit code in your authenticator app.');
        return true;
      }
      ipFailures.delete(ip);
      userFailures.delete(user.username);
      const updated = updateUser(user.id, { totpLastStep: step, lastLoginAt: new Date(now()).toISOString() });
      startSession(req, res, updated, 'full');
      record(req, publicUser(updated), 'Logged in');
      ok(res, { stage: 'done' });
      return true;
    }

    if (urlPath === '/api/login/new-password' && method === 'POST') {
      const found = currentSession(req);
      if (!found || found.session.stage !== 'setup') { bad(res, 401, 'Please start again with your username and password.'); return true; }
      const problem = passwordProblem(body.password);
      if (problem) { bad(res, 400, problem); return true; }
      if (verifyPassword(body.password, found.user.passwordHash)) { bad(res, 400, 'Please choose a new password, not the temporary one.'); return true; }
      const updated = updateUser(found.user.id, { passwordHash: hashPassword(body.password), mustChangePassword: false });
      record(req, publicUser(updated), 'Set their own password');
      finishSetupIfDone(req, res, updated);
      return true;
    }

    if (urlPath === '/api/login/authenticator' && method === 'POST') {
      const found = currentSession(req);
      if (!found || found.session.stage !== 'setup' || found.user.mustChangePassword) {
        bad(res, 401, 'Please start again with your username and password.');
        return true;
      }
      const { user } = found;
      // Step 1 (no code yet): make a new secret and keep it on the session until it's confirmed.
      if (!body.code) {
        const secret = base32Encode(crypto.randomBytes(20));
        const map = sessionsMap();
        map[found.key] = { ...map[found.key], pendingSecret: secret };
        saveSessions(map);
        const label = encodeURIComponent(`UK Student NIEC:${user.username}`);
        sendJSON(res, 200, {
          secret,
          uri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('UK Student NIEC')}&digits=6&period=30`,
        });
        return true;
      }
      // Step 2: the first code from the app proves it's linked.
      const secret = found.session.pendingSecret;
      const step = secret ? matchTotp(secret, body.code, now()) : -1;
      if (step < 0) { bad(res, 400, "That code didn't match. Check the app shows UK Student NIEC and try the newest code."); return true; }
      const updated = updateUser(user.id, { totpSecret: secret, totpLastStep: step, lastLoginAt: new Date(now()).toISOString() });
      record(req, publicUser(updated), 'Linked authenticator app');
      finishSetupIfDone(req, res, updated);
      return true;
    }

    if (urlPath === '/api/logout' && method === 'POST') {
      const found = currentSession(req);
      if (found) {
        endSessions((s) => s.id === found.session.id);
        if (found.session.stage === 'full') record(req, publicUser(found.user), 'Logged out');
      }
      clearCookie(res);
      ok(res);
      return true;
    }

    // -- everything below needs a full login --
    if (!requireAuth(req, res)) return true;
    if (urlPath === '/api/me' && method === 'GET') { sendJSON(res, 200, req.user); return true; }
    if (req.user.role !== 'admin') { bad(res, 403, 'Only Admin can do this.'); return true; }

    if (urlPath === '/api/users' && method === 'GET') {
      sendJSON(res, 200, users().map(adminView));
      return true;
    }

    if (urlPath === '/api/users' && method === 'POST') {
      const username = cleanUsername(body.username);
      const name = String(body.name || '').trim().slice(0, 60);
      const email = cleanEmail(body.email);
      if (!USERNAME_RULE.test(username)) { bad(res, 400, USERNAME_HELP); return true; }
      if (!name) { bad(res, 400, "Please enter the person's name."); return true; }
      if (email === null) { bad(res, 400, 'That email address does not look right.'); return true; }
      const access = parseAccess(body);
      if (access.error) { bad(res, 400, access.error); return true; }
      if (users().some((u) => u.username === username)) { bad(res, 409, 'That username is already taken.'); return true; }
      const temp = temporaryPassword();
      const user = {
        id: crypto.randomBytes(8).toString('hex'), username, name, email, role: access.role, departments: access.departments,
        passwordHash: hashPassword(temp), mustChangePassword: true, totpSecret: null, totpLastStep: -1,
        disabled: false, createdAt: new Date(now()).toISOString(),
      };
      saveUsers([...users(), user]);
      const mail = await sendSetupEmail(req, user, temp, 'new');
      record(req, req.user, 'Added user', { changes: [`Added ${name} (${username}) as ${accessLabel(user)}`, mailNote(mail)] });
      // The temporary password is shown to Admin only when it could not be emailed.
      sendJSON(res, 200, { user: adminView(user), email: mail, ...(mail.status === 'sent' ? {} : { temporaryPassword: temp }) });
      return true;
    }

    const userMatch = urlPath.match(/^\/api\/users\/([a-f0-9]{16})$/);
    if (userMatch && method === 'POST') {
      const target = findUser(userMatch[1]);
      if (!target) { bad(res, 404, 'No such person.'); return true; }
      const list = users();
      const self = target.id === req.user.id;
      const who = `${target.name} (${target.username})`;
      const action = String(body.action || '');
      const endAll = () => endSessions((s) => s.userId === target.id);

      if (action === 'disable') {
        if (self) { bad(res, 400, "You can't disable your own account."); return true; }
        if (target.role === 'admin' && activeAdmins(list).length <= 1) { bad(res, 400, 'At least one Admin has to stay active.'); return true; }
        updateUser(target.id, { disabled: true });
        const n = endAll();
        record(req, req.user, 'Disabled user', { changes: [`Disabled ${who}; logged out of ${n} device${n === 1 ? '' : 's'}`] });
      } else if (action === 'remove') {
        // Takes the person off completely: their login is deleted, so their username and password no longer
        // work, and every device they were logged in on is ended. The record of what they did stays.
        if (self) { bad(res, 400, "You can't remove your own account."); return true; }
        if (target.role === 'admin') { bad(res, 400, "The Admin account can't be removed."); return true; }
        const n = endAll();
        saveUsers(list.filter((u) => u.id !== target.id));
        userFailures.delete(target.username);
        record(req, req.user, 'Removed user', { changes: [`Removed ${who} (${accessLabel(target)}); logged out of ${n} device${n === 1 ? '' : 's'}`] });
      } else if (action === 'enable') {
        updateUser(target.id, { disabled: false });
        record(req, req.user, 'Enabled user', { changes: [`Enabled ${who}`] });
      } else if (action === 'reset-password') {
        if (self) { bad(res, 400, 'To change your own password, use the reset-login script on the server.'); return true; }
        const temp = temporaryPassword();
        const updated = updateUser(target.id, { passwordHash: hashPassword(temp), mustChangePassword: true });
        endAll();
        const mail = await sendSetupEmail(req, updated, temp, 'reset');
        record(req, req.user, 'Reset password', { changes: [`Gave ${who} a new temporary password and logged them out`, mailNote(mail)] });
        sendJSON(res, 200, { ok: true, email: mail, ...(mail.status === 'sent' ? {} : { temporaryPassword: temp }) });
        return true;
      } else if (action === 'reset-authenticator') {
        if (self) { bad(res, 400, 'Ask another Admin to reset your authenticator.'); return true; }
        updateUser(target.id, { totpSecret: null, totpLastStep: -1 });
        endAll();
        record(req, req.user, 'Reset authenticator', { changes: [`Unlinked ${who}'s authenticator app; they link a new one at their next login`] });
      } else if (action === 'update-person') {
        // Name, email and access. The Admin account keeps its access (and is the only one with it).
        const change = {};
        const notes = [];
        if (body.name !== undefined) {
          const name = String(body.name || '').trim().slice(0, 60);
          if (!name) { bad(res, 400, "Please enter the person's name."); return true; }
          if (name !== target.name) { change.name = name; notes.push(`name to ${name}`); }
        }
        if (body.email !== undefined) {
          const email = cleanEmail(body.email);
          if (email === null) { bad(res, 400, 'That email address does not look right.'); return true; }
          if (email !== (target.email || '')) { change.email = email; notes.push(`email to ${email || 'none'}`); }
        }
        if (body.role !== undefined || body.departments !== undefined) {
          if (target.role === 'admin') { bad(res, 400, "The Admin account's access can't be changed."); return true; }
          const access = parseAccess(body);
          if (access.error) { bad(res, 400, access.error); return true; }
          const next = { ...target, ...access };
          if (accessLabel(next) !== accessLabel(target)) { Object.assign(change, access); notes.push(`access from ${accessLabel(target)} to ${accessLabel(next)}`); }
        }
        if (notes.length) {
          updateUser(target.id, change);
          if (change.role) endAll(); // their pages pick up the new access when they log in again
          record(req, req.user, change.role ? 'Changed access' : 'Updated person', { changes: [`Changed ${who}: ${notes.join(', ')}`] });
        }
      } else if (action === 'logout-everywhere') {
        const n = endAll();
        record(req, req.user, 'Ended sessions', { changes: [`Logged ${who} out of ${n} device${n === 1 ? '' : 's'}`] });
      } else {
        bad(res, 400, 'Unknown action.');
        return true;
      }
      ok(res);
      return true;
    }

    if (urlPath === '/api/sessions' && method === 'GET') {
      const byId = new Map(users().map((u) => [u.id, u]));
      const list = Object.values(sessionsMap())
        .filter((s) => s.stage === 'full' && s.expires > now() && byId.has(s.userId))
        .map((s) => ({
          id: s.id, user: publicUser(byId.get(s.userId)).label, device: s.device, ip: s.ip,
          created: new Date(s.created).toISOString(), lastSeen: new Date(s.lastSeen).toISOString(),
          expires: new Date(s.expires).toISOString(), current: s.id === req.sessionId,
        }))
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
      sendJSON(res, 200, list);
      return true;
    }

    const sessionMatch = urlPath.match(/^\/api\/sessions\/([a-f0-9]{16})\/end$/);
    if (sessionMatch && method === 'POST') {
      const n = endSessions((s) => s.id === sessionMatch[1]);
      if (n) record(req, req.user, 'Ended sessions', { changes: ['Logged one device out'] });
      ok(res);
      return true;
    }

    if (urlPath === '/api/sessions/end-others' && method === 'POST') {
      const n = endSessions((s) => s.id !== req.sessionId);
      record(req, req.user, 'Ended sessions', { changes: [`Logged everyone else out (${n} device${n === 1 ? '' : 's'})`] });
      ok(res);
      return true;
    }

    bad(res, 404, 'Not found');
    return true;
  }

  return { requireAuth, handleApi, emailConfig };
}

module.exports = {
  DEPARTMENTS,
  accessLabel,
  parseAccess,
  createAccounts,
  hashPassword,
  verifyPassword,
  passwordProblem,
  base32Encode,
  base32Decode,
  totpAt,
  matchTotp,
};

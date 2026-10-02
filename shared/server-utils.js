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

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
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

function credentialsMatch(header, username, password) {
  const [scheme, encoded] = String(header || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  // Both halves are always compared, so a right username with a wrong password takes just as long.
  const userOk = safeEqual(decoded.slice(0, sep), username);
  const passOk = safeEqual(decoded.slice(sep + 1), password);
  return userOk && passOk;
}

// Shared-password Basic Auth with a lockout: after `maxFailures` wrong passwords from one address
// within `windowMs`, that address is refused (429) until the window runs out, without its guesses
// even being checked. Returns requireAuth(req, res) -> true when the request may go ahead.
// Auth is off when username/password aren't both set (local dev).
function createAuth({ username, password, maxFailures = 20, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const failures = new Map(); // ip -> { count, since }

  function prune(t) {
    failures.forEach((f, ip) => { if (t - f.since > windowMs) failures.delete(ip); });
  }

  return function requireAuth(req, res) {
    if (!username || !password) return true;
    const t = now();
    const ip = clientIp(req);
    let f = failures.get(ip);
    if (f && t - f.since > windowMs) {
      failures.delete(ip);
      f = null;
    }
    if (f && f.count >= maxFailures) {
      const retryAfter = Math.ceil((f.since + windowMs - t) / 1000);
      send(res, 429, 'Too many wrong passwords. Try again in a few minutes.', {
        'Content-Type': 'text/plain', 'Retry-After': String(retryAfter),
      });
      return false;
    }
    const header = req.headers.authorization;
    if (credentialsMatch(header, username, password)) return true;
    // A request with no password at all is just the browser's first visit, not a wrong guess.
    if (header) {
      if (failures.size > 10000) prune(t);
      if (f) f.count += 1;
      else failures.set(ip, { count: 1, since: t });
    }
    send(res, 401, 'Authentication required.', {
      'WWW-Authenticate': 'Basic realm="UK Student NIEC", charset="UTF-8"',
      'Content-Type': 'text/plain',
    });
    return false;
  };
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
  TIME_ZONE,
  localDate,
  send,
  sendJSON,
  safeEqual,
  clientIp,
  createAuth,
  createStaticServer,
  readJSONBody,
  writeFileAtomic,
  snapshotDaily,
};

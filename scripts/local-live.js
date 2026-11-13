// See your REAL data in this portal on your own computer, without touching the live server.
//
//   1. On the live server, log in as Admin and open Admin > Restore (or the daily backup the server makes at 6 PM) and download a backup,
//      or use the two download buttons for the students and the Fact File. Put the downloaded files in any folder on your computer.
//   2. Run:   node scripts/local-live.js  <the downloaded file> [another file ...]
//      A file can be a daily backup (niec-daily-....json.gz, which holds everything), the students download (...-students-....json)
//      or the Fact File download (...-fact-file-....json).
//   3. Open http://localhost:8080. There is no login page: this copy opens straight into the portal as the owner (Admin).
//      It opens only on this computer (127.0.0.1), never from another computer on the Wi-Fi or office network.
//      To have the normal login page instead, add --login (then log in as "owner" with the password this script prints).
//      Another port: set PORT=<number> first.
//
// Everything is copied into the folder live-data/ (never in git: it is listed in .gitignore). Changes you make here do NOT go to the live
// server, and nothing from the live server is changed by running this. Delete the folder live-data/ when you are done, because it
// holds real student data.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const { hashPassword } = require('../shared/accounts');
const { writeFileAtomic } = require('../shared/server-utils');
const { ensureRowIds, migrateWorkbook } = require('../student-details/workbook');
const { createFacts } = require('../student-details/facts');
const { createDirect } = require('../student-details/direct');
const { createCards } = require('../student-details/cards');
const { createMessages } = require('../student-details/messages');
const { createPlanning } = require('../student-details/planning');
const { createSourceOptions } = require('../student-details/source-options');
const { createB2b } = require('../student-details/b2b');

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const withLogin = process.argv.includes('--login');
if (!files.length) { console.error('Give the downloaded backup file(s), for example:\n  node scripts/local-live.js ~/Downloads/niec-daily-2026-11-12.json.gz\nSee the top of scripts/local-live.js.'); process.exit(1); }

const root = path.join(__dirname, '..');
const dir = path.join(root, 'live-data');
const studentsDir = path.join(dir, 'student-details');
const port = Number(process.env.PORT || 8080);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(studentsDir, { recursive: true });
fs.mkdirSync(path.join(dir, 'counselor-incentive'), { recursive: true });

const read = (f) => { const raw = fs.readFileSync(f); const text = /\.gz$/i.test(f) ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8'); return JSON.parse(text); };
const looksLikeWorkbook = (o) => o && Array.isArray(o.sheets);
const snap = {};
for (const f of files) {
  let o;
  try { o = read(f); } catch (e) { console.error(`Could not read ${f}: ${e.message}`); process.exit(1); }
  if (looksLikeWorkbook(o)) snap.students = o;
  else if (o && Array.isArray(o.universities) && !o.students) snap.facts = o.universities;
  else if (o && typeof o === 'object') Object.assign(snap, o.data && typeof o.data === 'object' ? o.data : o);
}
if (!looksLikeWorkbook(snap.students)) { console.error('No students were found in the file(s). Use a daily backup or the students download.'); process.exit(1); }

const wb = migrateWorkbook({ sheets: snap.students.sheets, activeSheetId: snap.students.activeSheetId });
writeFileAtomic(path.join(studentsDir, 'data.json'), JSON.stringify(ensureRowIds({ revision: Number(snap.students.revision) || 1, sheets: wb.sheets, activeSheetId: wb.activeSheetId }), null, 1));
const counts = { students: wb.sheets.reduce((n, s) => n + s.rows.length, 0), sheets: wb.sheets.length };
const put = (label, fn, value) => { if (value === undefined || value === null) return; try { fn(value); counts[label] = Array.isArray(value) ? value.length : Object.keys(value).length; } catch (e) { console.error(`(skipped ${label}: ${e.message})`); } };
put('Fact File universities', (v) => createFacts(studentsDir).restoreAll(v), snap.facts);
put('Partner Universities', (v) => createDirect(studentsDir).restoreAll(v), snap.partners);
put('student cards', (v) => createCards(studentsDir).restoreAll(v), snap.cards);
put('B2B partners', (v) => createB2b(studentsDir).restoreAll(v), snap.b2b);
put('agents', (v) => createB2b(studentsDir, { file: 'agents.json', filesFolder: 'agent-files', what: 'agent' }).restoreAll(v), snap.agents);
put('records', (v) => createPlanning(studentsDir).restoreAll(v), snap.planning);
put('templates', (v) => createMessages(studentsDir).restoreAll(v), snap.templates);
put('source choices', (v) => createSourceOptions(studentsDir).restoreAll(v), snap.sourceOptions);

// Accounts are never part of a backup, so this copy has one account of its own.
const password = process.env.LIVE_PASSWORD || crypto.randomBytes(6).toString('hex');
writeFileAtomic(path.join(studentsDir, 'users.json'), JSON.stringify({ users: [{ id: crypto.randomBytes(8).toString('hex'), username: 'owner', name: 'Owner', email: '', role: 'admin', departments: [], passwordHash: hashPassword(password), mustChangePassword: false, disabled: false, createdAt: new Date().toISOString() }] }, null, 1));

const incentivePassword = process.env.INCENTIVE_PASSWORD || crypto.randomBytes(6).toString('hex');
console.log('\nLoaded your real data into live-data/ :', JSON.stringify(counts));

const startServer = (serverPort) => {
  const env = { ...process.env, PORT: String(serverPort), STUDENT_DETAILS_DATA_DIR: studentsDir, COUNSELOR_DATA_DIR: path.join(dir, 'counselor-incentive'), INCENTIVE_PASSWORD: incentivePassword };
  const child = spawn(process.execPath, [path.join(root, 'student-details', 'server.js')], { env, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code || 0));
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
};

if (withLogin) {
  console.log(`\nOpen http://localhost:${port}\nLog in as  owner  with the password  ${password}\nIncentive password:  ${incentivePassword}\nThis is a private copy on your computer: changes here never reach the live server. Press Ctrl+C to stop, then delete the folder live-data/.\n`);
  startServer(port);
} else {
  // No login page: the portal itself runs on a free inner port, and a small front door on 127.0.0.1:<port> (this computer only)
  // passes every request on with the owner's login added. The portal's own login code is not changed, so the live server is not.
  const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.unref(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const call = (inner, method, url, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ host: '127.0.0.1', port: inner, method, path: url, headers: { ...headers, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) } }, (res) => { res.resume(); res.on('end', () => resolve(res)); });
    r.on('error', reject);
    r.end(data);
  });
  let cookie = '';
  const logIn = async (inner) => {
    const res = await call(inner, 'POST', '/api/login', { username: 'owner', password });
    const set = [].concat(res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('niec_session='));
    if (res.statusCode !== 200 || !set) throw new Error(`the automatic login was refused (${res.statusCode})`);
    cookie = set;
  };
  const withCookie = (h) => ({ ...h, cookie: [String(h.cookie || '').split(';').map((c) => c.trim()).filter((c) => c && !c.startsWith('niec_session=')).join('; '), cookie].filter(Boolean).join('; ') });
  (async () => {
    const inner = await freePort();
    startServer(inner);
    for (let i = 0; ; i += 1) { // wait until the portal answers
      try { if ((await call(inner, 'GET', '/healthz')).statusCode === 200) break; } catch (e) { /* still starting */ }
      if (i > 100) { console.error('The portal did not start.'); process.exit(1); }
      await new Promise((r) => setTimeout(r, 200));
    }
    await logIn(inner);
    const front = http.createServer((req, res) => {
      // The login page and logging out have no meaning here: both go straight back into the portal.
      const urlPath = req.url.split('?')[0];
      if (req.method === 'GET' && (urlPath === '/login' || urlPath === '/login.html')) { res.writeHead(302, { Location: '/today' }); return res.end(); }
      if (urlPath === '/api/logout') { req.resume(); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const send = (retry) => {
          const up = http.request({ host: '127.0.0.1', port: inner, method: req.method, path: req.url, headers: withCookie(req.headers) }, (upRes) => {
            if (upRes.statusCode === 401 && retry) { upRes.resume(); return logIn(inner).then(() => send(false), () => { res.writeHead(502); res.end('The automatic login stopped working. Stop with Ctrl+C and start again.'); }); }
            const headers = { ...upRes.headers };
            delete headers['set-cookie']; // the browser never holds the login: the front door adds it
            res.writeHead(upRes.statusCode, headers);
            upRes.pipe(res);
          });
          up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
          res.on('close', () => { if (!res.writableEnded) up.destroy(); }); // a closed tab ends its live stream
          up.end(body);
        };
        send(true);
      });
    });
    front.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other program, or first run:  set PORT=8091` : e.message); process.exit(1); });
    front.listen(port, '127.0.0.1', () => {
      console.log(`\nOpen http://localhost:${port}\nNo login: it opens straight into the portal as the owner, and only on this computer.\nIncentive password:  ${incentivePassword}\nThis is a private copy on your computer: changes here never reach the live server. Press Ctrl+C to stop, then delete the folder live-data/.\n`);
    });
  })().catch((e) => { console.error(`Could not start: ${e.message}`); process.exit(1); });
}

// See your REAL data in this portal on your own computer, without touching the live server.
//
//   1. On the live server, log in as Admin and open Admin > Restore (or the daily backup the server makes at 6 PM) and download a backup,
//      or use the two download buttons for the students and the Fact File. Put the downloaded files in any folder on your computer.
//   2. Run:   node scripts/local-live.js  <the downloaded file> [another file ...]
//      A file can be a daily backup (niec-daily-....json.gz, which holds everything), the students download (...-students-....json)
//      or the Fact File download (...-fact-file-....json).
//   3. Open http://localhost:8090 and log in as "owner" with the password this script prints.
//
// Everything is copied into the folder live-data/ (never in git: it is listed in .gitignore). Changes you make here do NOT go to the live
// server, and nothing from the live server is changed by running this. Delete the folder live-data/ when you are done, because it
// holds real student data.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
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
if (!files.length) { console.error('Give the downloaded backup file(s), for example:\n  node scripts/local-live.js ~/Downloads/niec-daily-2026-11-12.json.gz\nSee the top of scripts/local-live.js.'); process.exit(1); }

const root = path.join(__dirname, '..');
const dir = path.join(root, 'live-data');
const studentsDir = path.join(dir, 'student-details');
const port = process.env.PORT || '8090';
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

console.log('\nLoaded your real data into live-data/ :', JSON.stringify(counts));
console.log(`\nOpen http://localhost:${port}\nLog in as  owner  with the password  ${password}\nThis is a private copy on your computer: changes here never reach the live server. Press Ctrl+C to stop, then delete the folder live-data/.\n`);
const env = { ...process.env, PORT: port, STUDENT_DETAILS_DATA_DIR: studentsDir, COUNSELOR_DATA_DIR: path.join(dir, 'counselor-incentive'), INCENTIVE_PASSWORD: process.env.INCENTIVE_PASSWORD || crypto.randomBytes(6).toString('hex') };
const child = spawn(process.execPath, [path.join(root, 'student-details', 'server.js')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

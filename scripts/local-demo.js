// Try the whole system on your own computer with made-up students, before anything goes to the server.
//
//   node scripts/local-demo.js            starts it at http://localhost:8080 with a fresh demo folder (demo-data/)
//   node scripts/local-demo.js --keep     starts it again on the demo folder as you left it
//   PORT=9000 node scripts/local-demo.js  another port
//
// Nothing here is a real student (see scripts/demo-data.js) and nothing leaves your computer: the server sends no email (the
// student card offers Open in my email program and Copy email text instead, until the office mailbox is set up).
// The demo folder is never in git. To start from nothing again, press Ctrl+C and run the command without --keep.
//
// Log in at /login with one of these (demo passwords only, they are nothing to do with the real site):
//   owner   Admin (sees everything, the Incentive page asks for "Demo Incentive 1")
//   chief   Manager (the Dashboard and every student, view only)
//   asha    Application Team      bikram   Mock Team      sunita   Follow-up Team
//   password for all of them: Demo-Password-2026

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { hashPassword } = require('../shared/accounts');
const { writeFileAtomic, localDate } = require('../shared/server-utils');
const { buildDemo } = require('./demo-data');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'demo-data');
const studentsDir = path.join(dir, 'student-details');
const port = process.env.PORT || '8080';
const keep = process.argv.includes('--keep') && fs.existsSync(path.join(studentsDir, 'data.json'));

function write(name, data) { writeFileAtomic(path.join(studentsDir, name), JSON.stringify(data, null, 1)); }

if (!keep) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'counselor-incentive'), { recursive: true });
  fs.mkdirSync(studentsDir, { recursive: true });
  const demo = buildDemo({ today: localDate() });
  write('data.json', demo.workbook);
  write('cards.json', { cards: demo.cards });
  write('planning.json', demo.planning);
  write('b2b-partners.json', { universities: demo.b2b });
  const hash = hashPassword('Demo-Password-2026');
  const person = (username, name, role, departments) => ({ id: require('crypto').randomBytes(8).toString('hex'), username, name, email: '', role, departments, passwordHash: hash, mustChangePassword: false, disabled: false, createdAt: new Date().toISOString() });
  write('users.json', { users: [
    person('owner', 'Owner Demo', 'admin', []), person('chief', 'Chief Demo', 'manager', []),
    person('asha', 'Asha Demo', 'staff', ['application']), person('bikram', 'Bikram Demo', 'staff', ['mock']), person('sunita', 'Sunita Demo', 'staff', ['followup']),
  ] });
  console.log('Made a fresh demo folder with', demo.workbook.sheets.reduce((n, s) => n + s.rows.length, 0), 'made-up students.');
}

console.log(`\nStarting the system at http://localhost:${port}\nLog in as owner (Admin), chief (Manager), asha, bikram or sunita. Password: Demo-Password-2026\nPress Ctrl+C to stop.\n`);
const env = { ...process.env, PORT: port, STUDENT_DETAILS_DATA_DIR: studentsDir, COUNSELOR_DATA_DIR: path.join(dir, 'counselor-incentive'), INCENTIVE_PASSWORD: process.env.INCENTIVE_PASSWORD || 'Demo Incentive 1' };
const child = spawn(process.execPath, [path.join(root, 'student-details', 'server.js')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

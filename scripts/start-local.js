'use strict';
// Starts ISR on this computer, on http://localhost:8080, with the data in ONE fixed folder (default C:\ISR-data), so nothing has to be
// set in the command window and the same login works every time. Used by start-isr.bat.
//   - The first time, the folder gets one login: owner / isr-local-2026 (a private copy on this computer only; the live server is never touched).
//   - After that the folder is left as it is, so any login made in it stays.
// To use another folder: set ISR_DATA=<folder>. To use another port: set PORT=<number>.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { hashPassword } = require('../shared/accounts');
const { writeFileAtomic } = require('../shared/server-utils');

const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.ISR_DATA || (process.platform === 'win32' ? path.join(path.parse(root).root, 'ISR-data') : path.join(os.homedir(), 'ISR-data')));
const port = String(process.env.PORT || 8080);
const PASSWORD = 'isr-local-2026';

fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const usersFile = path.join(dataDir, 'users.json');
let made = false;
let existing = null;
try { existing = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch (e) { /* none yet */ }
if (!existing || !Array.isArray(existing.users) || !existing.users.length) {
  writeFileAtomic(usersFile, JSON.stringify({ users: [{ id: crypto.randomBytes(8).toString('hex'), username: 'owner', name: 'Owner', email: '', role: 'admin', departments: [], passwordHash: hashPassword(PASSWORD), mustChangePassword: false, disabled: false, createdAt: new Date().toISOString() }] }, null, 1));
  made = true;
}
try { fs.unlinkSync(path.join(dataDir, 'first-admin-code.txt')); } catch (e) { /* not there */ }

console.log(`\nData folder : ${dataDir}`);
console.log(`Open        : http://localhost:${port}`);
console.log(made ? `Log in as   : owner   password: ${PASSWORD}   (this private copy on your computer only)` : 'Log in as   : the login you already use in this folder (first time ever: owner / ' + PASSWORD + ')');
console.log('Keep this window open while you use the portal. Press Ctrl+C to stop.\n');

const env = { ...process.env, PORT: port, STUDENT_DETAILS_DATA_DIR: dataDir, COUNSELOR_DATA_DIR: path.join(dataDir, 'counselor-incentive'), INCENTIVE_PASSWORD: process.env.INCENTIVE_PASSWORD || PASSWORD };
const child = spawn(process.execPath, [path.join(root, 'student-details', 'server.js')], { env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
setTimeout(() => {
  const open = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', `http://localhost:${port}`]] : null;
  if (open) { try { spawn(open[0], open[1], { stdio: 'ignore', detached: true }).unref(); } catch (e) { /* the address above works too */ } }
}, 1500);

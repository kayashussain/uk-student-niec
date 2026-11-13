'use strict';
// Starts ISR on this computer, on http://localhost:8080, with the data in ONE fixed folder (default C:\ISR-data), so nothing has to be
// set in the command window and the same login works every time. Used by start-isr.bat.
//   - The login owner / isr-local-2026 is made (or set right again) every time it starts: a private copy on this computer only; the live server is never touched.
//   - Any other login in the folder stays as it is.
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
let existing = null;
try { existing = JSON.parse(fs.readFileSync(usersFile, 'utf8')); } catch (e) { /* none yet */ }
const users = existing && Array.isArray(existing.users) ? existing.users : [];
// The login "owner" always exists here and always has the password below, so it can never be locked out of this private copy.
// Any other login in the folder is left as it is.
const mine = users.find((u) => u && String(u.username).toLowerCase() === 'owner');
const owner = { id: (mine && mine.id) || crypto.randomBytes(8).toString('hex'), username: 'owner', name: (mine && mine.name) || 'Owner', email: (mine && mine.email) || '', role: 'admin', departments: [], passwordHash: hashPassword(PASSWORD), mustChangePassword: false, disabled: false, createdAt: (mine && mine.createdAt) || new Date().toISOString() };
writeFileAtomic(usersFile, JSON.stringify({ ...(existing || {}), users: [owner, ...users.filter((u) => u !== mine)] }, null, 1));
try { fs.unlinkSync(path.join(dataDir, 'first-admin-code.txt')); } catch (e) { /* not there */ }

console.log(`\nData folder : ${dataDir}`);
console.log(`Open        : http://localhost:${port}`);
console.log(`Log in as   : owner   password: ${PASSWORD}   (this private copy on your computer only)`);
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

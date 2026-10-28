// Emergency only, run on the server: gives one person a new temporary password, unlinks their
// authenticator app, re-enables them and logs them out everywhere. For when the only Admin has lost
// their phone or password (otherwise another Admin does this on the Users page).
//
//   STUDENT_DETAILS_DATA_DIR=/path/to/student-details-data node scripts/reset-login.js <username>
//
// Without STUDENT_DETAILS_DATA_DIR it uses student-details/ (where local data lives).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPassword } = require('../shared/accounts');
const { writeFileAtomic } = require('../shared/server-utils');

const dir = process.env.STUDENT_DETAILS_DATA_DIR || path.join(__dirname, '..', 'student-details');
const username = String(process.argv[2] || '').trim().toLowerCase();
const usersFile = path.join(dir, 'users.json');

if (!username) {
  console.error('Usage: node scripts/reset-login.js <username>');
  process.exit(1);
}
let data;
try {
  data = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
} catch (e) {
  console.error(`Could not read ${usersFile}. Is STUDENT_DETAILS_DATA_DIR right?`);
  process.exit(1);
}
const user = data.users.find((u) => u.username === username);
if (!user) {
  console.error(`No account "${username}". Accounts: ${data.users.map((u) => u.username).join(', ')}`);
  process.exit(1);
}

const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const temp = Array.from(crypto.randomBytes(14), (b) => chars[b % chars.length]).join('');
Object.assign(user, { passwordHash: hashPassword(temp), mustChangePassword: true, totpSecret: null, totpLastStep: -1, disabled: false });
writeFileAtomic(usersFile, JSON.stringify(data, null, 2));

const sessionsFile = path.join(dir, 'sessions.json');
try {
  const s = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
  Object.keys(s.sessions).forEach((k) => { if (s.sessions[k].userId === user.id) delete s.sessions[k]; });
  writeFileAtomic(sessionsFile, JSON.stringify(s, null, 2));
} catch (e) { /* no sessions file yet */ }

fs.appendFileSync(path.join(dir, 'activity.jsonl'), JSON.stringify({
  time: new Date().toISOString(), account: 'Server terminal', accountId: null, device: 'reset-login script', ip: '',
  action: 'Reset password', changes: [`Reset ${user.name} (${user.username}): new temporary password, authenticator unlinked`],
}) + '\n');

console.log(`Done. Temporary password for ${user.name} (${user.username}): ${temp}`);
console.log('At the next login they choose a new password and link their authenticator app again.');

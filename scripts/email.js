// Sets up and tests the email the system sends (setup details for new people). Run on the server:
//
//   node scripts/email.js setup              asks for the mailbox password and saves mail.json (private)
//   node scripts/email.js test you@example.com   sends a test message and says what happened
//
// The password is typed here, on the server, never on a web page, and is saved only in mail.json in the
// data folder (STUDENT_DETAILS_DATA_DIR, else student-details/), which is never served and not in git.
// Defaults suit niecedu.com.np; change them with the MAIL_* variables listed in shared/mailer.js.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mailer = require('../shared/mailer');

const dir = process.env.STUDENT_DETAILS_DATA_DIR || path.join(__dirname, '..', 'student-details');
const file = path.join(dir, 'mail.json');
const [command, arg] = process.argv.slice(2);

// Reads a line from the terminal; hidden: nothing is echoed while typing.
function ask(question, { hidden = false, fallback = '' } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (text) => { if (text.includes(question)) rl.output.write(text); };
    }
    rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim() || fallback);
    });
  });
}

async function setup() {
  const old = mailer.loadConfig(dir, {});
  const user = await ask('Mailbox (also the address emails are sent from)', { fallback: old.user || 'kayas@niecedu.com.np' });
  const pass = await ask('Mailbox password (typing is hidden)', { hidden: true });
  if (!pass && !old.pass) { console.error('No password entered. Nothing saved.'); process.exit(1); }
  const host = await ask('Mail server', { fallback: old.host });
  const port = await ask('Port (465 for SSL, 587 for STARTTLS)', { fallback: String(old.port) });
  const siteUrl = await ask('Website address people open to log in', { fallback: old.siteUrl || 'https://niec.duckdns.org' });
  const config = {
    host, port: Number(port), security: Number(port) === 587 ? 'starttls' : 'ssl', user, pass: pass || old.pass,
    from: user, fromName: old.fromName, siteUrl,
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  console.log(`\nSaved to ${file}. Now send a test:\n  node scripts/email.js test you@example.com`);
}

async function test(to) {
  const cfg = mailer.loadConfig(dir);
  if (!cfg.from || !cfg.pass) { console.error('Email is not set up yet. Run: node scripts/email.js setup'); process.exit(1); }
  if (!mailer.isAddress(to)) { console.error('Usage: node scripts/email.js test you@example.com'); process.exit(1); }
  console.log(`Sending a test email to ${to} through ${cfg.host}:${cfg.port} as ${cfg.from} ...`);
  try {
    await mailer.sendMail(cfg, { to, ...mailer.testEmail() });
    console.log('Sent. Check the inbox (and the spam folder).');
  } catch (e) {
    console.error(`Could not send: ${e.message}`);
    process.exit(1);
  }
}

if (command === 'setup') setup();
else if (command === 'test') test(arg);
else { console.error('Usage:\n  node scripts/email.js setup\n  node scripts/email.js test you@example.com'); process.exit(1); }

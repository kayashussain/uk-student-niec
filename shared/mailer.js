// Sends email through the company's own mail server (SMTP), so the system can tell a new person how
// to set up their account. No packages needed: a small SMTP client over Node's net/tls.
//
// security: 'ssl'      the connection is encrypted from the start (usually port 465)
//           'starttls' starts plain, then switches to encrypted before logging in (usually port 587)
//           'none'     no encryption (only for tests on this machine; the settings page never offers it)

const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

const ADDRESS = /^[^\s<>@"',;:\\]+@[^\s<>@"',;:\\]+\.[^\s<>@"',;:\\]+$/;
const isAddress = (s) => typeof s === 'string' && s.length <= 254 && ADDRESS.test(s);
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A header value with non-ASCII characters is sent as an RFC 2047 encoded word.
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const base64Lines = (text) => (Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g) || ['']).join('\r\n');

// The full message text (CRLF line endings): plain text and HTML versions of the same email.
function buildMessage({ from, fromName, to, subject, text, html, now = new Date() }) {
  const boundary = '=_niec_' + crypto.randomBytes(12).toString('hex');
  const domain = from.split('@')[1];
  const sender = fromName ? `${encodeHeader(oneLine(fromName).replace(/"/g, ''))} <${from}>` : from;
  const lines = [
    `From: ${sender}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(oneLine(subject))}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'Auto-Submitted: auto-generated',
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(html),
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

// One SMTP conversation: reads whole replies (a reply may span several lines) and sends commands.
class Connection {
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';
    this.waiter = null;
    this.error = null;
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { this.buffer += chunk; this.check(); });
    socket.on('error', (e) => { this.error = e; this.check(); });
    socket.on('close', () => { this.error = this.error || new Error('The mail server closed the connection.'); this.check(); });
  }

  // A complete reply is the last line of the form "250 text" (a space after the code, not a dash).
  check() {
    if (!this.waiter) return;
    const lines = this.buffer.split('\r\n');
    const last = lines.length - 1; // the unfinished piece after the final CRLF
    const end = lines.findIndex((l, i) => i < last && /^\d{3} /.test(l));
    if (end !== -1) {
      const got = lines.slice(0, end + 1);
      this.buffer = lines.slice(end + 1).join('\r\n');
      const { resolve } = this.waiter;
      this.waiter = null;
      resolve({ code: Number(got[0].slice(0, 3)), lines: got.map((l) => l.slice(4)) });
    } else if (this.error) {
      const { reject } = this.waiter;
      this.waiter = null;
      reject(this.error);
    }
  }

  reply() {
    return new Promise((resolve, reject) => { this.waiter = { resolve, reject }; this.check(); });
  }

  async command(line, expect) {
    this.socket.write(line + '\r\n');
    const r = await this.reply();
    if (!expect.includes(r.code)) {
      const e = new Error(r.lines.join(' '));
      e.smtpCode = r.code;
      throw e;
    }
    return r;
  }
}

// Turns low-level errors into sentences a person can act on.
function friendlyError(e, host) {
  const code = e && (e.code || e.smtpCode);
  const msg = String((e && e.message) || e);
  if (code === 'ENOTFOUND') return `The mail server "${host}" was not found. Check the address.`;
  if (code === 'ECONNREFUSED') return `The mail server "${host}" refused the connection. Check the port number.`;
  if (code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `Could not reach the mail server "${host}". The web server may be blocked from sending email, or the address or port is wrong.`;
  }
  if (/certificate|self.signed|altnames|hostname/i.test(msg) || /^ERR_TLS|CERT/.test(String(code))) {
    return `The mail server's security certificate does not match "${host}". Use the exact server name your email provider gives you.`;
  }
  if (code === 535 || code === 534 || code === 530) return 'The mail server refused the username or password.';
  if (code === 553 || code === 550 || code === 554) return `The mail server refused the message: ${msg}`;
  return msg;
}

// Sends one message. cfg: { host, port, security, user, pass, from, fromName }.
// Resolves when the server accepts it; rejects with a readable Error.
async function sendMail(cfg, { to, subject, text, html }, { timeoutMs = 20000, rejectUnauthorized = true } = {}) {
  if (!cfg || !cfg.host || !cfg.port || !isAddress(cfg.from)) throw new Error('The mail server settings are incomplete.');
  if (!isAddress(to)) throw new Error('That is not a valid email address.');
  const host = String(cfg.host).trim();
  const port = Number(cfg.port);
  const message = buildMessage({ from: cfg.from, fromName: cfg.fromName, to, subject, text, html });
  const localName = cfg.from.split('@')[1];
  const tlsOptions = { host, port, servername: host, rejectUnauthorized };

  let socket;
  const work = (async () => {
    socket = await new Promise((resolve, reject) => {
      const s = cfg.security === 'ssl' ? tls.connect(tlsOptions) : net.connect({ host, port });
      s.once(cfg.security === 'ssl' ? 'secureConnect' : 'connect', () => { s.removeListener('error', reject); resolve(s); });
      s.once('error', reject);
    });
    let conn = new Connection(socket);
    const greeting = await conn.reply();
    if (greeting.code !== 220) throw new Error(greeting.lines.join(' '));
    let hello = await conn.command(`EHLO ${localName}`, [250]);

    if (cfg.security === 'starttls') {
      await conn.command('STARTTLS', [220]);
      socket.removeAllListeners('data');
      socket = await new Promise((resolve, reject) => {
        const s = tls.connect({ ...tlsOptions, socket });
        s.once('secureConnect', () => resolve(s));
        s.once('error', reject);
      });
      conn = new Connection(socket);
      hello = await conn.command(`EHLO ${localName}`, [250]);
    }

    if (cfg.user) {
      const methods = hello.lines.join(' ').toUpperCase();
      if (/\bAUTH\b[^\r\n]*\bPLAIN\b/.test(methods) || !/\bLOGIN\b/.test(methods)) {
        await conn.command('AUTH PLAIN ' + Buffer.from(`\0${cfg.user}\0${cfg.pass || ''}`).toString('base64'), [235]);
      } else {
        await conn.command('AUTH LOGIN', [334]);
        await conn.command(Buffer.from(cfg.user).toString('base64'), [334]);
        await conn.command(Buffer.from(cfg.pass || '').toString('base64'), [235]);
      }
    }

    await conn.command(`MAIL FROM:<${cfg.from}>`, [250]);
    await conn.command(`RCPT TO:<${to}>`, [250, 251]);
    await conn.command('DATA', [354]);
    // A line that starts with a dot gets a second one, so it can't end the message early.
    socket.write(message.replace(/^\./gm, '..') + '\r\n.\r\n');
    const accepted = await conn.reply();
    if (accepted.code !== 250) {
      const e = new Error(accepted.lines.join(' '));
      e.smtpCode = accepted.code;
      throw e;
    }
    try { socket.write('QUIT\r\n'); } catch (e) { /* already closing */ }
    return { response: accepted.lines.join(' ') };
  })();

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('The mail server did not answer in time.'), { code: 'ETIMEDOUT' })), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch (e) {
    throw new Error(friendlyError(e, host));
  } finally {
    clearTimeout(timer);
    if (socket) socket.destroy();
  }
}

// ---------------------------------------------------------------------------------------------
// The emails the system sends.
// ---------------------------------------------------------------------------------------------

// "Set up your account": the link, username and temporary password, and the steps to follow.
// kind 'new' for a new person, 'reset' when Admin gave an existing person a new temporary password.
function setupEmail({ name, username, temporaryPassword, access, siteUrl, kind = 'new' }) {
  const link = siteUrl.replace(/\/+$/, '') + '/login';
  const intro = kind === 'reset'
    ? 'Your password for the UK Student NIEC system has been reset. Use the temporary password below to log in and choose a new one.'
    : `An account has been created for you on the UK Student NIEC system (${access}).`;
  const steps = [
    'Open the website and log in with the username and temporary password above.',
    'Choose your own password (at least 10 characters).',
    'Install Google Authenticator or Microsoft Authenticator on your phone, scan the QR code shown on the screen, and type the 6 digit code the app shows.',
  ];
  const safety = 'From then on you need your password and the code from your phone every time you log in. '
    + 'The temporary password stops working once you have chosen your own, so please do this soon. '
    + 'Never share your password or your codes with anyone, including colleagues and managers.';
  const ignore = 'If you were not expecting this email, please ignore it and tell your manager.';

  const text = [
    `Hello ${name},`, '', intro, '',
    'Your login details',
    `Website: ${link}`,
    `Username: ${username}`,
    `Temporary password: ${temporaryPassword}`, '',
    'To finish setting up',
    ...steps.map((s, i) => `${i + 1}. ${s}`), '',
    safety, '', ignore, '',
    'Nepal International Education Consultancy',
  ].join('\n');

  const row = (label, value, mono = false) => `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap">${label}</td>`
    + `<td style="padding:6px 0;font-weight:600;${mono ? 'font-family:Consolas,Menlo,monospace;font-size:16px;letter-spacing:.03em' : ''}">${value}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6fa;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#1c2126">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border-top:4px solid #00adef">
<tr><td style="padding:24px 28px 8px"><img src="${escapeHtml(siteUrl.replace(/\/+$/, ''))}/niec-logo.png" alt="NIEC" height="48" style="display:block;border:0"></td></tr>
<tr><td style="padding:8px 28px 4px;font-size:15px;line-height:1.5">
<p style="margin:0 0 12px">Hello ${escapeHtml(name)},</p>
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="background:#eef7fc;border-radius:10px;padding:10px 16px;margin:0 0 18px">
${row('Website', `<a href="${escapeHtml(link)}" style="color:#0077a8">${escapeHtml(link)}</a>`)}
${row('Username', escapeHtml(username))}
${row('Temporary password', escapeHtml(temporaryPassword), true)}
</table>
<p style="margin:0 0 6px;font-weight:700">To finish setting up</p>
<ol style="margin:0 0 16px;padding-left:20px">${steps.map((s) => `<li style="margin:4px 0">${escapeHtml(s)}</li>`).join('')}</ol>
<p style="margin:0 0 12px;color:#4b5563;font-size:14px">${escapeHtml(safety)}</p>
<p style="margin:0 0 20px;color:#6b7280;font-size:13px">${escapeHtml(ignore)}</p>
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">Nepal International Education Consultancy</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: kind === 'reset' ? 'Your UK Student NIEC password was reset' : 'Set up your UK Student NIEC account', text, html };
}

// The message the "send a test email" button sends.
function testEmail() {
  return {
    subject: 'UK Student NIEC email test',
    text: 'This is a test message from the UK Student NIEC system. If you can read it, setup emails will reach people.',
    html: '<p style="font-family:Segoe UI,Arial,sans-serif">This is a test message from the UK Student NIEC system. If you can read it, setup emails will reach people.</p>',
  };
}

// The mail server settings for a data folder: the file mail.json (written by `node scripts/email.js setup`,
// never served, not in git) with these environment variables on top: MAIL_HOST, MAIL_PORT, MAIL_SECURITY
// (ssl or starttls), MAIL_USER, MAIL_PASSWORD, MAIL_FROM, MAIL_FROM_NAME and SITE_URL.
function loadConfig(dir, env = process.env) {
  let file = {};
  try { file = JSON.parse(require('fs').readFileSync(require('path').join(dir, 'mail.json'), 'utf8')); } catch (e) { /* none yet */ }
  return {
    host: env.MAIL_HOST || file.host || 'mail.niecedu.com.np',
    port: Number(env.MAIL_PORT || file.port || 465),
    security: env.MAIL_SECURITY || file.security || 'ssl',
    user: env.MAIL_USER || file.user || '',
    pass: env.MAIL_PASSWORD || file.pass || '',
    from: String(env.MAIL_FROM || file.from || '').toLowerCase(),
    fromName: env.MAIL_FROM_NAME || file.fromName || 'UK Student NIEC',
    siteUrl: String(env.SITE_URL || file.siteUrl || '').replace(/\/+$/, ''),
  };
}

module.exports = { loadConfig, sendMail, buildMessage, setupEmail, testEmail, isAddress, friendlyError };

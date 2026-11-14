// Each person's own mailbox (the owner, 14 Nov 2026): a team member who emails students sends from their own address, set up once
// on the My email page (reached from Message templates and wherever an email is sent). Admin sends from their own mailbox if they set one, else from the office mailbox (mail.json, set
// up with `node scripts/email.js setup`). Nobody else sends from the office mailbox.
//
// Kept in user-mail.json in the data folder (never in git, never served, never in the daily backups). The password is encrypted with
// a key kept beside it in mail-key (made once, readable only by the server's user), so the file alone gives nothing away. The
// password is never sent back to a page: a page only learns that one is saved.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic } = require('../shared/server-utils');

const SECURITIES = ['ssl', 'starttls'];
// What a picture really is, from its first bytes (a renamed file is refused).
const pictureType = (b) => (b && b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png' : b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg' : '');
const safeId = (v) => (/^[\w-]{1,64}$/.test(String(v || '')) ? String(v) : '');
const str = (v, max) => String(v ?? '').trim().slice(0, max);

function createUserMail(dir) {
  const file = path.join(dir, 'user-mail.json');
  const keyFile = path.join(dir, 'mail-key');
  function key() {
    try { const k = fs.readFileSync(keyFile); if (k.length === 32) return k; } catch (e) { /* made below */ }
    const k = crypto.randomBytes(32);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(keyFile, k, { mode: 0o600 });
    return k;
  }
  const seal = (plain) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
  };
  const open = (sealed) => {
    try {
      const [iv, tag, data] = String(sealed).split('.').map((s) => Buffer.from(s, 'base64'));
      const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(data), d.final()]).toString('utf8');
    } catch (e) { return ''; }
  };
  const read = () => { try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); return d && typeof d.boxes === 'object' && d.boxes ? d : { boxes: {} }; } catch (e) { return { boxes: {} }; } };
  const write = (d) => { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); writeFileAtomic(file, JSON.stringify(d, null, 1)); try { fs.chmodSync(file, 0o600); } catch (e) { /* not on every system */ } };

  return {
    // What a page may know about a person's mailbox: never the password.
    info(userId) {
      const b = read().boxes[userId];
      const signature = Boolean(this.picture(userId));
      return b ? { set: true, from: b.from, user: b.user, host: b.host, port: b.port, security: b.security, phone: b.phone || '', checkedAt: b.checkedAt, signature } : { set: false, signature };
    },
    // The settings to send with, password included (only inside the server).
    config(userId) {
      const b = read().boxes[userId];
      if (!b) return null;
      const pass = open(b.pass);
      return pass ? { host: b.host, port: b.port, security: b.security, user: b.user || b.from, pass, from: b.from } : null;
    },
    // The settings as typed, checked; `defaults` are the office mail server's (the same server for every address of the office).
    // Returns { error } or { box } (the box to try before it is saved).
    clean(input, defaults, isAddress) {
      const from = str(input && input.from, 254).toLowerCase();
      if (!isAddress(from)) return { error: 'Type your own email address, for example asha@niecedu.com.np.' };
      const pass = String((input && input.password) ?? '').replace(/[\r\n]/g, '').slice(0, 300);
      if (!pass) return { error: 'Type the password of that mailbox.' };
      const host = str(input && input.host, 200) || defaults.host;
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return { error: 'The mail server name does not look right.' };
      const port = Number(input && input.port) || Number(defaults.port) || 465;
      if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'The port must be a number such as 465 or 587.' };
      const security = SECURITIES.includes(input && input.security) ? input.security : (port === 587 ? 'starttls' : (defaults.security || 'ssl'));
      // Their own phone or WhatsApp number, for the signature of the emails they send (optional, not secret).
      const phone = str(input && input.phone, 40);
      if (phone && !/^\+?[\d\s()-]{6,25}$/.test(phone)) return { error: 'The phone number does not look right. Use digits, for example +977 9800000001.' };
      return { box: { from, user: str(input && input.user, 254) || from, pass, host, port, security, phone } };
    },
    save(userId, box) {
      const d = read();
      d.boxes[userId] = { ...box, pass: seal(box.pass), checkedAt: new Date().toISOString() };
      write(d);
    },
    // A person's own signature picture (PNG or JPG, at most 1 MB), put at the end of the emails they send, as the office signature
    // picture is for Admin (the owner, 14 Nov 2026). Kept in user-signatures/ in the data folder.
    savePicture(userId, bytes) {
      const type = pictureType(bytes);
      if (!type) return { error: 'Please choose a PNG or JPG picture of your signature.' };
      if (bytes.length > 1024 * 1024) return { error: 'That picture is too large (the limit is 1 MB).' };
      const id = safeId(userId);
      if (!id) return { error: 'No such person.' };
      fs.mkdirSync(path.join(dir, 'user-signatures'), { recursive: true, mode: 0o700 });
      ['png', 'jpg'].forEach((e) => { try { fs.rmSync(path.join(dir, 'user-signatures', `${id}.${e}`), { force: true }); } catch (err) { /* none */ } });
      writeFileAtomic(path.join(dir, 'user-signatures', `${id}.${type === 'image/png' ? 'png' : 'jpg'}`), bytes);
      return { ok: true };
    },
    picture(userId) {
      const id = safeId(userId);
      if (!id) return null;
      for (const [e, type] of [['png', 'image/png'], ['jpg', 'image/jpeg']]) {
        try { return { data: fs.readFileSync(path.join(dir, 'user-signatures', `${id}.${e}`)), type }; } catch (err) { /* try the next */ }
      }
      return null;
    },
    removePicture(userId) {
      const id = safeId(userId);
      if (!id) return false;
      let gone = false;
      ['png', 'jpg'].forEach((e) => { const f = path.join(dir, 'user-signatures', `${id}.${e}`); if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); gone = true; } });
      return gone;
    },
    remove(userId) {
      const d = read();
      if (!d.boxes[userId]) return false;
      delete d.boxes[userId];
      write(d);
      return true;
    },
  };
}

module.exports = { createUserMail };

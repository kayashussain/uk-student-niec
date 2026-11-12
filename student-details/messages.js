// The messages NIEC sends to a student from the student card: ready-made templates for each step of the journey
// (university options and documents, application submitted, offer, mock interview, deferred), filled in with the
// student's own details, sent by email from the office mailbox with the signature, or opened in WhatsApp.
//
// The system only sends. A student's reply goes to the office mailbox (or WhatsApp) like any other message; nothing
// here reads replies.
//
// Templates and the signature are kept in message-templates.json in the data folder (never in git). Admin edits them
// on the Message templates page. The built-in ones below are the starting text: a template Admin has saved is never
// overwritten, and one Admin has not touched follows the text here.
//
// A template is plain text: a blank line starts a new paragraph, a line that starts with "- " is a bullet and one
// that starts with "## " is a small heading. {curly} words are filled in from the student (see FIELDS).

const fs = require('fs');
const path = require('path');
const { writeFileAtomic, localDate } = require('../shared/server-utils');
const Fields = require('./card-fields');
const { isoDate } = require('./dashboard-stats');

const COMPANY = 'Nepal International Educational Consultancy';
const LIMITS = { name: 80, subject: 200, body: 8000, whatsapp: 3000, templates: 80, short: 200 };

// The words that can be used in a template, and what each stands for.
const FIELDS = [
  ['first_name', "The student's first name"], ['last_name', "The student's last name"], ['full_name', "The student's full name"],
  ['university', 'University name (from the sheet)'], ['course', 'Course name (from the sheet)'], ['intake', 'The intake (the name of the sheet)'],
  ['stage', 'The stage the student is at'], ['counselor', "The student's counselor (the sender when none is set)"], ['sender_name', 'The person sending the message'],
  ['application_date', 'Application submitted day'], ['offer_date', 'Offer received day'], ['mock_date', 'The latest mock interview day'],
  ['payment_date', 'Payment day'], ['cas_date', 'CAS received day'], ['visa_date', 'Visa received day'],
  ['gross_fee', 'Gross fee'], ['scholarship', 'Scholarship'], ['fee_after_scholarship', 'Fee after scholarship'], ['remaining_fee', 'Remaining tuition fee'],
  ['student_id', 'Student ID'], ['today', "Today's date"],
  ['options_table', 'The university options prepared on the card (university, course, fee, scholarship and link), on a line of its own'],
  ['documents_list', 'The checklist of documents needed to apply, on a line of its own'],
];
// The short name of each word, for the note that tells the sender which details are still empty.
const FIELD_LABEL = Object.fromEntries(FIELDS.map(([k, label]) => [k, label.replace(/\s*\(.*\)$/, '')]));
const BLOCK_FIELDS = new Set(['options_table', 'documents_list']);

// The built-in templates. `stages`: the stages at which the card offers the template first.
const DEFAULTS = [
  {
    key: 'options', name: 'University options and documents needed', stages: ['Inquiry', 'Application Stage'],
    subject: 'Your UK university options from NIEC',
    body: [
      'Dear {first_name},',
      'Thank you for your interest in studying in the UK. Based on your academic background and what you are looking for, these are the options we recommend for you:',
      '{options_table}',
      'Fees and scholarships are as published by each university for this intake and can change, so we confirm them again at the time of your offer.',
      '## Documents needed to apply',
      '{documents_list}',
      'Please tell us which options you like, and send us the documents above. We can submit your application as soon as we have them.',
    ].join('\n\n'),
    whatsapp: 'Namaste {first_name}, here are your UK university options from NIEC:\n\n{options_table}\n\nDocuments needed to apply:\n{documents_list}\n\nPlease tell us which option you like. - {sender_name}, NIEC',
  },
  {
    key: 'documents_needed', name: 'Documents needed for the application', stages: ['Application Stage'],
    subject: 'Documents needed for your UK university application',
    body: [
      'Dear {first_name},',
      'To submit your application{university_phrase}, we need the following documents. Clear scans or photos are fine.',
      '{documents_list}',
      'Please send them by replying to this email or on WhatsApp. If any document is not ready yet, tell us and we will advise you.',
    ].join('\n\n'),
    whatsapp: 'Namaste {first_name}, to submit your application we need these documents:\n{documents_list}\n\nPlease send clear scans or photos here. - {sender_name}, NIEC',
  },
  {
    key: 'application_submitted', name: 'Application submitted', stages: ['Application Stage'],
    subject: 'Your application to {university} has been submitted',
    body: [
      'Dear {first_name},',
      'We are pleased to tell you that your application for {course} at {university} has been submitted{application_date_phrase}.',
      'The university usually takes one to three weeks to give a decision. We will contact you as soon as we hear from them.',
      'While you wait:',
      '- Keep your phone and email active, as the university may contact you directly',
      '- Tell us at once if you receive any email from the university',
      '- Start preparing for the credibility interview that most universities hold after the offer',
      'If you have any question, simply reply to this email.',
    ].join('\n\n').replace(/\n\n- /g, '\n- '),
    whatsapp: 'Namaste {first_name}, your application for {course} at {university} has been submitted. The decision usually takes one to three weeks. Please tell us if the university emails you. - {sender_name}, NIEC',
  },
  {
    key: 'offer_received', name: 'Offer received', stages: ['Application Stage', 'Mock Stage'],
    subject: 'Good news: your offer from {university}',
    body: [
      'Dear {first_name},',
      'Congratulations. {university} has offered you a place on {course}{offer_date_phrase}.',
      'These are your next steps:',
      '- Read the offer letter carefully and tell us if anything is not clear',
      '- Send us any document the offer asks for (the conditions of the offer)',
      '- Prepare for the credibility interview. We will arrange mock interviews with you before the real one',
      '- Start arranging your funds for the tuition deposit and the bank balance needed for the visa',
      'We will guide you at every step. Please confirm that you have received this email.',
    ].join('\n\n').replace(/\n\n- /g, '\n- '),
    whatsapp: 'Congratulations {first_name}! {university} has offered you a place on {course}. Next: check the offer conditions, prepare for the credibility interview (we will hold mock interviews with you) and start arranging your funds. - {sender_name}, NIEC',
  },
  {
    key: 'mock_interview', name: 'Mock interview schedule', stages: ['Mock Stage'],
    subject: 'Your mock interview with NIEC{mock_date_phrase}',
    body: [
      'Dear {first_name},',
      'Your mock interview for {university} is scheduled{mock_date_phrase}. It prepares you for the credibility interview that the university holds before it issues your CAS.',
      'Please be ready to talk about:',
      '- Why you chose this course and this university, and how it fits what you studied before',
      '- The modules of your course, the campus and the city',
      '- Your tuition fee, your living costs and who is paying for your studies',
      '- Your career plan after the course, and why you chose the UK',
      'Join from a quiet place with a good internet connection, and keep your passport and offer letter with you.',
      'If the time does not suit you, tell us today so that we can change it.',
    ].join('\n\n').replace(/\n\n- /g, '\n- '),
    whatsapp: 'Namaste {first_name}, your mock interview for {university} is scheduled{mock_date_phrase}. Please prepare: why this course and university, your modules, fees and funding, and your career plan. Join from a quiet place with good internet. - {sender_name}, NIEC',
  },
  {
    key: 'defer', name: 'Deferred to the next intake', stages: ['Defer'],
    subject: 'Your UK study plan for the next intake',
    body: [
      'Dear {first_name},',
      'As we discussed, your plan to study in the UK is moved to the next intake. This gives you time to prepare well.',
      'To be ready early, we suggest:',
      '- Completing any document or English test that is still missing',
      '- Keeping your funds ready, as the bank balance must be held for at least 28 days before the visa application',
      '- Telling us if you would like to look at other universities or courses',
      'We will contact you when applications for the next intake open. You can also write to us at any time.',
    ].join('\n\n').replace(/\n\n- /g, '\n- '),
    whatsapp: 'Namaste {first_name}, your UK plan is moved to the next intake. To be ready early, please complete any missing document or English test and keep your funds ready. We will contact you when applications open. - {sender_name}, NIEC',
  },
];

const text = (v) => String(v ?? '').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');

// "2026-11-12" or "11/12/2026" (month first, as the sheet stores imported dates) as "12 November 2026"; '' when it is no date.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate(v) {
  const iso = isoDate(v);
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
const money = (v) => { const s = text(v); return !s ? '' : (/^[\d,.\s]+$/.test(s) ? `£${s}` : s); };

// The values of every {word} for one student. `row`: the student's row of the sheet; `card`: the student card.
function valuesFor({ row = {}, sheetName = '', card = {}, sender = '', today = new Date() }) {
  const first = text(row['FIRST NAME']);
  const last = text(row['LAST NAME']);
  const mock = [4, 3, 2, 1].map((n) => longDate(row[`MOCK SCHEDULE ${n}`])).find(Boolean) || '';
  const v = {
    first_name: first || last, last_name: last, full_name: [first, last].filter(Boolean).join(' '),
    university: text(row['UNIVERSITY NAME']), course: text(row['COURSE NAME']), intake: text(sheetName),
    stage: text(row['APPLICATION STATUS']), counselor: text(card.profile && card.profile.counselor) || text(sender), sender_name: text(sender),
    application_date: longDate(row['APPLICATION SUBMISSION DATE']), offer_date: longDate(row['OFFER RECEIVED DATE']), mock_date: mock,
    payment_date: longDate(row['PAYMENT DATE']), cas_date: longDate(row['CAS RECEIVED DATE']), visa_date: longDate(row['VISA RECEIVED DATE']),
    gross_fee: money(row['GROSS FEE']), scholarship: text(row.SCHOLARSHIP), fee_after_scholarship: money(row['FEE AFTER SCHOLARSHIP']),
    remaining_fee: money(row['REMAINING TUITION FEE']), student_id: text(row['STUDENT ID']),
    today: longDate(localDate(today)),
  };
  // Small joining phrases, so a sentence still reads well when a detail is not filled in yet ("submitted on 3 May 2026" or just "submitted").
  v.application_date_phrase = v.application_date ? ` on ${v.application_date}` : '';
  v.offer_date_phrase = v.offer_date ? ` (offer dated ${v.offer_date})` : '';
  v.mock_date_phrase = v.mock_date ? ` on ${v.mock_date}` : '';
  v.cas_date_phrase = v.cas_date ? ` on ${v.cas_date}` : '';
  v.university_phrase = v.university ? ` to ${v.university}` : '';
  return v;
}

// Fills the {words} of a line. A word with nothing to show is left out and its name is added to `missing`.
function fill(line, values, missing) {
  return String(line).replace(/\{([a-z_]+)\}/g, (whole, key) => {
    if (BLOCK_FIELDS.has(key)) return whole; // handled as a block by the caller
    if (!Object.prototype.hasOwnProperty.call(values, key)) return whole; // not one of ours: left as typed
    const v = values[key];
    if (!v && FIELD_LABEL[key]) missing.add(key);
    return v || '';
  }).replace(/[ \t]{2,}/g, ' ').replace(/ ([,.;:])/g, '$1');
}

const optionFee = (o) => text(o.fee) || 'To be confirmed';
const optionScholarship = (o) => text(o.scholarship) || 'To be confirmed';

// The blocks ({options_table}, {documents_list}, {missing_documents}) as plain text lines.
function blockText(key, ctx) {
  if (key === 'options_table') {
    if (!ctx.options.length) return ['(no university option has been added on the card yet)'];
    return ctx.options.flatMap((o, i) => [
      `${i + 1}. ${[o.university, o.course].filter(Boolean).join(': ')}${o.intake ? ` (${o.intake})` : ''}`,
      `   Tuition fee: ${optionFee(o)}`,
      ...(o.deposit ? [`   Minimum cash deposit: ${o.deposit}`] : []),
      `   Scholarship: ${optionScholarship(o)}`,
      ...(o.link ? [`   Course page: ${o.link}`] : []),
      ...(o.note ? [`   Note: ${o.note}`] : []),
    ]);
  }
  return ctx.documents.map((d) => `- ${d}`);
}

function blockHtml(key, ctx) {
  if (key === 'options_table') {
    if (!ctx.options.length) return '<p style="margin:0 0 14px;color:#8a2b25">(no university option has been added on the card yet)</p>';
    const th = (t) => `<th align="left" style="padding:9px 10px;border-bottom:2px solid #00adef;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#3b4757">${t}</th>`;
    const td = (t, extra = '') => `<td valign="top" style="padding:10px;border-bottom:1px solid #e3e8ee;font-size:14px;line-height:1.45;${extra}">${t}</td>`;
    const small = (t) => `<br><span style="color:#5b6472;font-size:12px">${esc(t)}</span>`;
    // A column for the minimum cash deposit is added when any option carries one (asked for in the remarks of the options box).
    const withDeposit = ctx.options.some((o) => o.deposit);
    const rows = ctx.options.map((o) => {
      const cells = [
        td(`<b>${esc(o.university)}</b>${o.intake ? small(o.intake) : ''}`),
        td(`${esc(o.course)}${o.level ? small(o.level) : ''}${o.note ? small(o.note) : ''}`),
        td(esc(optionFee(o)).replace(/\n/g, '<br>')),
        ...(withDeposit ? [td(esc(o.deposit || 'Ask us').replace(/\n/g, '<br>'))] : []),
        td(esc(optionScholarship(o)).replace(/\n/g, '<br>')),
        td(o.link ? `<a href="${esc(o.link)}" style="color:#066a97">View course</a>` : '<span style="color:#5b6472">Ask us</span>', 'white-space:nowrap'),
      ];
      return `<tr>${cells.join('')}</tr>`;
    }).join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 18px;border:1px solid #e3e8ee;border-radius:8px">`
      + `<tr style="background:#eef7fc">${th('University')}${th('Course')}${th('Tuition fee')}${withDeposit ? th('Minimum cash deposit') : ''}${th('Scholarship')}${th('Link')}</tr>${rows}</table>`;
  }
  return `<ul style="margin:0 0 14px;padding-left:22px">${ctx.documents.map((d) => `<li style="margin:4px 0">${esc(d)}</li>`).join('')}</ul>`;
}

// Web addresses in a paragraph become links (only http and https ones).
const linkify = (escaped) => escaped.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" style="color:#066a97">${url}</a>`);

// The signature block as lines of text: name, title, company, then the ways to reach the office.
function signatureLines(sig) {
  const s = sig || {};
  return [
    text(s.name), text(s.title), text(s.company) || COMPANY,
    text(s.phone) ? `Phone: ${text(s.phone)}` : '', text(s.whatsapp) ? `WhatsApp: ${text(s.whatsapp)}` : '',
    text(s.email) ? `Email: ${text(s.email)}` : '', text(s.website), text(s.address),
  ].filter(Boolean);
}

// One message, ready to send: the subject, the plain text and the HTML, with the signature. `missing` lists the
// {words} that had nothing to show, by their names, so the sender can fill the gap before sending.
function renderEmail({ subject, body, values, signature, options = [], documents = [], siteUrl = '' }) {
  const missing = new Set();
  const ctx = { options, documents };
  const subj = fill(str(subject, LIMITS.subject), values, missing).replace(/\s+/g, ' ').trim();
  const textOut = [];
  const html = [];
  let list = null; // bullet lines being collected
  const closeList = () => { if (list) { html.push(`<ul style="margin:0 0 14px;padding-left:22px">${list.join('')}</ul>`); list = null; } };
  str(body, LIMITS.body).split('\n').forEach((raw) => {
    const line = raw.trim();
    const block = /^\{(options_table|documents_list)\}$/.exec(line);
    if (block) {
      closeList();
      textOut.push(...blockText(block[1], ctx));
      html.push(blockHtml(block[1], ctx));
      return;
    }
    if (!line) { closeList(); textOut.push(''); return; }
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const h = fill(heading[1], values, missing);
      textOut.push(h.toUpperCase());
      html.push(`<p style="margin:18px 0 8px;font-weight:700;font-size:15px;color:#17324d">${esc(h)}</p>`);
      return;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const b = fill(bullet[1], values, missing);
      textOut.push(`- ${b}`);
      (list = list || []).push(`<li style="margin:4px 0">${linkify(esc(b))}</li>`);
      return;
    }
    closeList();
    const p = fill(line, values, missing);
    textOut.push(p);
    html.push(`<p style="margin:0 0 14px">${linkify(esc(p))}</p>`);
  });
  closeList();
  const sig = signatureLines(signature);
  const plain = `${textOut.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n\nKind regards,\n${sig.join('\n')}\n`;
  const logo = siteUrl ? `<tr><td style="padding:22px 28px 6px"><img src="${esc(siteUrl.replace(/\/+$/, ''))}/niec-logo.png" alt="NIEC" height="44" style="display:block;border:0"></td></tr>` : '';
  const sigHtml = sig.map((l, i) => (i === 0 && text(signature && signature.name)
    ? `<div style="font-weight:700;color:#17324d;font-size:15px">${esc(l)}</div>` : `<div>${linkify(esc(l))}</div>`)).join('');
  const page = `<!doctype html><html><body style="margin:0;background:#eef1f5;padding:24px 12px;font-family:Segoe UI,Arial,Helvetica,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;border-top:4px solid #00adef">
${logo}<tr><td style="padding:${logo ? '12px' : '26px'} 28px 6px;font-size:15px;line-height:1.6">
${html.join('\n')}
<p style="margin:18px 0 4px">Kind regards,</p>
<div style="margin:0 0 18px;padding:12px 0 0 14px;border-left:3px solid #fc6e1f;font-size:13px;line-height:1.55;color:#4f5b69">${sigHtml}</div>
</td></tr>
<tr><td style="padding:14px 28px 20px;border-top:1px solid #e3e8ee;color:#6b7280;font-size:12px;line-height:1.5">${esc(COMPANY)}. To ask anything about this message, simply reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: subj, text: plain, html: page, missing: [...missing].map((k) => FIELD_LABEL[k] || k) };
}

// The WhatsApp version: short plain text (WhatsApp shows *stars* as bold).
function renderWhatsApp({ body, values, options = [], documents = [] }) {
  const missing = new Set();
  const ctx = { options, documents };
  const out = [];
  str(body, LIMITS.whatsapp).split('\n').forEach((raw) => {
    const line = raw.trim();
    const block = /^\{(options_table|documents_list)\}$/.exec(line);
    if (block) { out.push(...blockText(block[1], ctx)); return; }
    out.push(fill(line.replace(/^##\s+/, ''), values, missing));
  });
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), missing: [...missing].map((k) => FIELD_LABEL[k] || k) };
}

// What is kept for a template, whatever was sent.
function cleanTemplate(input, old = {}) {
  const stages = Array.isArray(input.stages) ? input.stages.map((s) => str(s, 40).trim()).filter(Boolean).slice(0, 12) : (old.stages || []);
  return {
    key: old.key,
    name: str(input.name, LIMITS.name).trim() || old.name || '',
    stages,
    subject: str(input.subject, LIMITS.subject).trim(),
    body: str(input.body, LIMITS.body).trim(),
    whatsapp: str(input.whatsapp, LIMITS.whatsapp).trim(),
  };
}
function cleanSignature(input, old = {}) {
  const pick = (k) => (input && Object.prototype.hasOwnProperty.call(input, k) ? str(input[k], LIMITS.short).trim() : (old[k] || ''));
  return {
    name: pick('name'), title: pick('title'), company: pick('company') || COMPANY, phone: pick('phone'), whatsapp: pick('whatsapp'),
    email: pick('email'), website: pick('website'), address: pick('address'),
    // A copy of every email also goes to the office mailbox (so it is found there with the student's replies) unless switched off.
    copyToOffice: input && Object.prototype.hasOwnProperty.call(input, 'copyToOffice') ? Boolean(input.copyToOffice) : (old.copyToOffice !== false),
  };
}

function createMessages(dir, { now = () => new Date() } = {}) {
  const file = path.join(dir, 'message-templates.json');
  let cache = null;

  function read() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return null; }
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && Array.isArray(data.templates)) { cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }; return data; }
    } catch (e) { /* unreadable: set aside below */ }
    try { fs.renameSync(file, path.join(dir, `message-templates.damaged-${now().toISOString().replace(/[:.]/g, '-')}.json`)); } catch (e) { /* ignore */ }
    return null;
  }
  function write(data) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileAtomic(file, JSON.stringify(data, null, 2));
    const stat = fs.statSync(file);
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
  }
  // The saved templates on top of the built-in ones: a built-in one nobody has edited follows the text in this file.
  function load() {
    const data = read() || { templates: [], signature: cleanSignature({}) };
    const saved = new Map(data.templates.map((t) => [t.key, t]));
    const builtIn = DEFAULTS.map((d) => (saved.has(d.key) ? { ...saved.get(d.key), builtIn: true, edited: true } : { ...d, builtIn: true, edited: false }));
    const own = data.templates.filter((t) => !DEFAULTS.some((d) => d.key === t.key)).map((t) => ({ ...t, builtIn: false, edited: true }));
    return { templates: [...builtIn, ...own], signature: cleanSignature(data.signature || {}), stored: data };
  }

  return {
    list: () => load().templates,
    get: (key) => load().templates.find((t) => t.key === key) || null,
    signature: () => load().signature,
    saveTemplate(key, input, by) {
      const { stored, templates } = load();
      const old = templates.find((t) => t.key === key);
      if (!old) return { error: 'No such template.' };
      const cleaned = { ...cleanTemplate(input, old), key, updatedAt: now().toISOString(), updatedBy: by || '' };
      if (!cleaned.name) return { error: 'Please give the template a name.' };
      if (!cleaned.subject || !cleaned.body) return { error: 'A template needs a subject and a message.' };
      write({ ...stored, templates: [...stored.templates.filter((t) => t.key !== key), cleaned] });
      return { template: cleaned };
    },
    addTemplate(input, by) {
      const { stored, templates } = load();
      if (templates.length >= LIMITS.templates) return { error: 'The template list is full.' };
      const cleaned = cleanTemplate(input, {});
      if (!cleaned.name) return { error: 'Please give the template a name.' };
      if (!cleaned.subject || !cleaned.body) return { error: 'A template needs a subject and a message.' };
      if (templates.some((t) => t.name.toLowerCase() === cleaned.name.toLowerCase())) return { error: 'Another template already has that name.' };
      const key = 'own_' + require('crypto').randomBytes(5).toString('hex');
      const made = { ...cleaned, key, updatedAt: now().toISOString(), updatedBy: by || '' };
      write({ ...stored, templates: [...stored.templates, made] });
      return { template: made };
    },
    // A template of your own is deleted; a built-in one goes back to its original text.
    removeTemplate(key) {
      const { stored, templates } = load();
      const old = templates.find((t) => t.key === key);
      if (!old) return { error: 'No such template.' };
      write({ ...stored, templates: stored.templates.filter((t) => t.key !== key) });
      return { removed: old, reset: Boolean(old.builtIn) };
    },
    // The saved templates and signature as they are kept (for the backup), and putting them back from one.
    stored: () => load().stored,
    restoreAll(data) {
      if (!data || typeof data !== 'object' || !Array.isArray(data.templates)) return { error: 'The backup has no message templates in it.' };
      write({ templates: data.templates.filter((t) => t && typeof t.key === 'string').map((t) => ({ ...cleanTemplate(t, { key: t.key, name: t.name, stages: t.stages }), key: t.key })), signature: cleanSignature(data.signature || {}) });
      return { ok: true };
    },
    saveSignature(input) {
      const { stored, signature } = load();
      const cleaned = cleanSignature(input, signature);
      write({ ...stored, templates: stored.templates || [], signature: cleaned });
      return { signature: cleaned };
    },
  };
}

// The checklist of documents to apply, for a student of a study level.
function documentLists(card) {
  const level = card && card.profile ? card.profile.studyLevel : '';
  return { documents: Fields.documentsFor(level).map((d) => d.text) };
}

module.exports = {
  createMessages, renderEmail, renderWhatsApp, valuesFor, documentLists, cleanTemplate, cleanSignature, longDate, DEFAULTS, FIELDS, COMPANY,
};

// The requests behind the portal pages around the sheet: the student card (details, notes, follow-ups, documents,
// university options, messages), adding a student from the card form, the Follow-ups page, the course finder over the
// Fact File, the message templates, the B2B partners and the management records of the Dashboard.
//
// Who may see or change a student here is decided by the very same rules as on the sheet (shared/teams.js): Admin
// everything, the Manager every student but view only, a team its own students in the current intake. A student the
// sheet would not show an account is "not found" here too.
//
// server.js creates this once and passes every request it does not answer itself to handle(); true means answered.

const fs = require('fs');
const path = require('path');
const { sendJSON, send, readJSONBody } = require('../shared/server-utils');
const Teams = require('../shared/teams');
const mailer = require('../shared/mailer');
const Fields = require('./card-fields');
const { ROW_ID } = require('./cards');
const Messages = require('./messages');
const { buildIndex, searchCourses } = require('./course-index');
const { EVENT_TYPES, DECISION_STATUS, MARKET_KINDS, LISTS: PLANNING_LISTS } = require('./planning');
const { KINDS: B2B_KINDS } = require('./b2b');
const { MAX_FILE_BYTES, STATUSES: PARTNER_STATUSES } = require('./direct');

const text = (v) => String(v ?? '').trim();
const STATUS = Teams.STATUS;
const MAX_CELL_CHARS = 5000;
// The columns the Add student form may fill in (for Admin; a team is further held to what its own rules allow).
const NEW_STUDENT_COLUMNS = ['FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER', 'STUDENT SOURCE', 'REMARKS', 'UNIVERSITY NAME', 'COURSE NAME'];

function createPortalApi({
  getWorkbook, writeWorkbook, recordChanges, teamSave, cards, messages, courseLinks, facts, direct, b2b, planning, accounts, activity,
  insights = null, finder = null, ai = null, jobs = null, calculated = [],
}) {
  // ---- finding a student, and who may see or change them ----
  let indexed = { wb: null, map: new Map() };
  function rowIndex() {
    const wb = getWorkbook();
    if (!wb) return new Map();
    if (indexed.wb !== wb) {
      const map = new Map();
      wb.sheets.forEach((sheet) => sheet.rows.forEach((row) => { if (row && row._id && !map.has(row._id)) map.set(row._id, { sheet, row }); }));
      indexed = { wb, map };
    }
    return indexed.map;
  }
  const currentIntake = () => { const wb = getWorkbook(); return wb ? Teams.newestSheet(wb.sheets.filter((s) => !s.hidden)) : null; };
  function canSee(user, found) {
    if (!found) return false;
    if (Teams.isAdmin(user) || Teams.isManager(user)) return true;
    const intake = currentIntake();
    return Boolean(intake) && found.sheet.id === intake.id && Teams.seesRow(user, found.row);
  }
  function canChange(user, found) {
    if (!found) return false;
    if (Teams.isAdmin(user)) return true;
    if (Teams.isReadOnly(user)) return false;
    const intake = currentIntake();
    return Boolean(intake) && found.sheet.id === intake.id && Teams.seesRow(user, found.row) && Teams.canColor(user, found.row);
  }
  const nameOf = (row) => [text(row['FIRST NAME']), text(row['LAST NAME'])].filter(Boolean).join(' ');
  const isStudent = (row) => text(row['FIRST NAME']) !== '' || text(row['LAST NAME']) !== '';
  const brief = (sheet, row) => ({
    id: row._id, sheetId: sheet.id, intake: sheet.name, name: nameOf(row) || 'Student with no name yet', stage: text(row[STATUS]),
    university: text(row['UNIVERSITY NAME']), course: text(row['COURSE NAME']), email: text(row.EMAIL), phone: text(row['CONTACT NUMBER']),
    source: text(row['STUDENT SOURCE']),
  });
  // Every student this account sees, as the sheet would send them.
  function visibleStudents(user) {
    const wb = getWorkbook();
    if (!wb) return [];
    const out = [];
    Teams.viewFor(user, wb).sheets.forEach((sheet) => sheet.rows.forEach((row) => { if (row && row._id && isStudent(row)) out.push({ sheet, row }); }));
    return out;
  }

  const by = (req) => req.user.name;
  const note = (req, changes, action = 'Edited student card', app = 'Student card') => activity.record(req, req.user, action, { app, changes });
  async function bodyOf(req, res, max = 256 * 1024) {
    try { return await readJSONBody(req, max); } catch (e) { sendJSON(res, e.statusCode || 400, { error: e.message }); return null; }
  }
  const adminOnly = (req, res, what) => {
    if (Teams.isAdmin(req.user)) return true;
    sendJSON(res, 403, { error: `${what} is for Admin only.` });
    return false;
  };
  const managers = (req, res, what) => {
    if (Teams.isAdmin(req.user) || Teams.isManager(req.user)) return true;
    sendJSON(res, 403, { error: `${what} is for Admin and the Manager.` });
    return false;
  };

  // ---- the lists the card's dropdowns are filled from ----
  function cardLists(user) {
    const counselors = new Set(accounts.people().map((p) => p.name));
    Object.values(cards.all()).forEach((c) => { if (c.profile && c.profile.counselor) counselors.add(c.profile.counselor); });
    const plan = planning.all();
    return {
      people: [...counselors].sort((a, b) => a.localeCompare(b)),
      // Only the names: the terms agreed with a partner stay on the Admin-only page.
      subAgents: b2b.list().filter((p) => p.kind === 'Sub-agent' && p.status !== 'Ended').map((p) => p.name),
      events: [...plan.events].sort((a, b) => b.date.localeCompare(a.date)).map((e) => e.name),
      campaigns: [...new Set(plan.spend.map((s) => s.campaign).filter(Boolean))].sort(),
      intakes: (() => { const wb = getWorkbook(); return wb ? Teams.viewFor(user, wb).sheets.map((s) => ({ id: s.id, name: s.name })) : []; })(),
      stages: Teams.ALL_STATUSES,
      departments: Teams.addableDepartments(user).map((d) => ({ id: d, label: Teams.DEPARTMENTS[d].label, start: Teams.DEPARTMENTS[d].start, source: Teams.DEPARTMENTS[d].source || '' })),
    };
  }

  // ---- messages ----
  const mailConfig = () => accounts.emailConfig();
  function messageContext(req, found, card, optionIds) {
    const picked = Array.isArray(optionIds) && optionIds.length ? card.options.filter((o) => optionIds.includes(o.id)) : card.options;
    return {
      values: Messages.valuesFor({ row: found.row, sheetName: found.sheet.name, card, sender: req.user.name }),
      options: picked,
      ...Messages.documentLists(card),
    };
  }
  // The newest sends of each account, so a slip of the finger (or a script) cannot send hundreds of emails.
  const sends = new Map(); // account id -> [times]
  function tooManySends(userId) {
    const now = Date.now();
    const recent = (sends.get(userId) || []).filter((t) => now - t < 10 * 60 * 1000);
    sends.set(userId, recent);
    if (recent.length >= 60) return true;
    recent.push(now);
    return false;
  }

  async function handleMessages(req, res, found, card, action) {
    const body = await bodyOf(req, res);
    if (!body) return true;
    const template = messages.get(text(body.template)) || null;
    const subject = typeof body.subject === 'string' ? body.subject : (template ? template.subject : '');
    const emailBody = typeof body.body === 'string' ? body.body : (template ? template.body : '');
    const whatsappBody = typeof body.whatsapp === 'string' ? body.whatsapp : (template ? template.whatsapp : '');
    const ctx = messageContext(req, found, card, body.optionIds);
    const cfg = mailConfig();
    const signature = messages.signature();
    const email = Messages.renderEmail({ subject, body: emailBody, signature, siteUrl: cfg ? cfg.siteUrl : '', ...ctx });
    const whatsapp = Messages.renderWhatsApp({ body: whatsappBody, ...ctx });
    const to = text(body.to) || text(found.row.EMAIL).toLowerCase();
    const number = Fields.whatsappNumber(found.row['CONTACT NUMBER']);

    if (action === 'preview') {
      return sendJSON(res, 200, {
        subject: email.subject, text: email.text, html: email.html, missing: email.missing, to,
        whatsapp: { text: whatsapp.text, number, missing: whatsapp.missing },
        mail: { ready: Boolean(cfg), from: cfg ? cfg.from : '' },
        options: ctx.options.length,
      });
    }
    // Sending.
    const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const usesOptions = /\{options_table\}/.test(channel === 'email' ? emailBody : whatsappBody);
    if (usesOptions && !ctx.options.length) return sendJSON(res, 400, { error: 'Add at least one university option to the card first.' });
    const who = nameOf(found.row) || 'a student';
    if (channel === 'whatsapp') {
      if (!number) return sendJSON(res, 400, { error: 'This student has no WhatsApp number on the sheet.' });
      if (!whatsapp.text) return sendJSON(res, 400, { error: 'The message is empty.' });
      const logged = cards.logMessage(found.row._id, { channel, template: template ? template.name : 'Own message', subject: '', to: number, status: 'opened', text: whatsapp.text, options: usesOptions ? ctx.options.length : 0 }, by(req));
      if (logged.error) return sendJSON(res, 400, { error: logged.error });
      note(req, [`Opened WhatsApp for ${who} with the message "${template ? template.name : 'Own message'}"`], 'Sent message');
      return sendJSON(res, 200, { status: 'opened', message: logged.message, card: logged.card });
    }
    if (!email.subject || !emailBody.trim()) return sendJSON(res, 400, { error: 'The email needs a subject and a message.' });
    if (!mailer.isAddress(to)) return sendJSON(res, 400, { error: to ? 'That email address does not look right.' : 'This student has no email address on the sheet.' });
    if (tooManySends(req.user.id)) return sendJSON(res, 429, { error: 'Too many emails in a short time. Please wait a few minutes.' });
    const entry = { channel, template: template ? template.name : 'Own message', subject: email.subject, to, text: email.text, options: usesOptions ? ctx.options.length : 0 };
    if (usesOptions) ctx.options.forEach((o) => courseLinks.remember(o.universityId, o.course, o.link));
    if (!cfg) {
      // Email is not set up on this server (always the case on a test computer): nothing leaves, and the card keeps the
      // message as a preview so the whole step can still be checked.
      const logged = cards.logMessage(found.row._id, { ...entry, status: 'preview' }, by(req));
      return sendJSON(res, 200, { status: 'not-configured', message: logged.message, card: logged.card });
    }
    try {
      await mailer.sendMail({ ...cfg, fromName: signature.company || Messages.COMPANY }, {
        to, subject: email.subject, text: email.text, html: email.html, auto: false, bcc: signature.copyToOffice ? [cfg.from] : [],
      });
    } catch (e) {
      const logged = cards.logMessage(found.row._id, { ...entry, status: 'failed', error: e.message }, by(req));
      note(req, [`An email to ${who} could not be sent: ${e.message}`], 'Sent message');
      return sendJSON(res, 502, { error: `The email could not be sent. ${e.message}`, status: 'failed', card: logged.card });
    }
    const logged = cards.logMessage(found.row._id, { ...entry, status: 'sent' }, by(req));
    note(req, [`Emailed "${email.subject}" to ${who} (${to})`], 'Sent message');
    return sendJSON(res, 200, { status: 'sent', message: logged.message, card: logged.card, from: cfg.from });
  }

  // ---- one student's card ----
  async function handleCard(req, res, urlPath) {
    const m = /^\/api\/cards\/([\w-]{1,64})(?:\/(profile|follow-up|notes|documents|options|messages)(?:\/([a-f0-9]{12}|preview|send))?(\/delete)?)?$/.exec(urlPath);
    if (!m) return false;
    const [, rowId, part, sub, del] = m;
    const found = rowIndex().get(rowId);
    if (!canSee(req.user, found)) { sendJSON(res, 404, { error: 'No such student, or the student is not in your list.' }); return true; }
    const editable = canChange(req.user, found);
    const card = cards.get(rowId);

    if (req.method === 'GET') {
      if (!part) {
        const cfg = mailConfig();
        sendJSON(res, 200, {
          student: { ...brief(found.sheet, found.row), color: found.row._color || '', remarks: text(found.row.REMARKS), columns: found.sheet.columns, row: Object.fromEntries(found.sheet.columns.map((c) => [c, found.row[c] ?? ''])) },
          card,
          can: { edit: editable, removeAnyNote: Teams.isAdmin(req.user) },
          me: { name: req.user.name },
          mail: { ready: Boolean(cfg), from: cfg ? cfg.from : '' },
          today: cards.today(),
        });
        return true;
      }
      if (part === 'messages' && sub && sub.length === 12) {
        const entry = card.messages.find((x) => x.id === sub);
        const words = entry ? cards.messageText(rowId, sub) : null;
        if (!entry) sendJSON(res, 404, { error: 'No such message.' });
        else sendJSON(res, 200, { message: entry, text: words || '' });
        return true;
      }
      send(res, 405, 'Method not allowed');
      return true;
    }
    if (req.method !== 'POST') { send(res, 405, 'Method not allowed'); return true; }
    if (!editable) { sendJSON(res, 403, { error: Teams.isReadOnly(req.user) ? 'Your account can only view students.' : 'Your team cannot change this student.' }); return true; }
    const who = nameOf(found.row) || 'a student';

    if (part === 'messages' && (sub === 'preview' || sub === 'send')) { await handleMessages(req, res, found, card, sub); return true; }
    const body = await bodyOf(req, res);
    if (!body) return true;
    let out;
    if (part === 'profile') {
      out = cards.setProfile(rowId, body, by(req));
      if (!out.error) {
        const changed = Fields.PROFILE_FIELDS.filter((f) => (card.profile[f.key] || '') !== (out.card.profile[f.key] || ''))
          .map((f) => `${who} › ${f.label}: "${card.profile[f.key] || '(blank)'}" → "${out.card.profile[f.key] || '(blank)'}"`);
        if (changed.length) note(req, changed);
      }
    } else if (part === 'follow-up') {
      out = body.done ? cards.finishFollowUp(rowId, body, by(req)) : cards.setFollowUp(rowId, body, by(req));
      if (!out.error) note(req, [body.done ? `${who}: follow-up done${out.card.followUp ? `, next on ${out.card.followUp.date}` : ''}` : (out.card.followUp ? `${who}: next follow-up on ${out.card.followUp.date}` : `${who}: follow-up cleared`)]);
    } else if (part === 'notes' && sub && del) {
      out = cards.removeNote(rowId, sub, by(req), Teams.isAdmin(req.user));
      if (!out.error) note(req, [`${who}: removed a note`]);
    } else if (part === 'notes' && !sub) {
      out = cards.addNote(rowId, body, by(req));
      if (!out.error) note(req, [`${who}: added a note`]);
    } else if (part === 'documents') {
      out = cards.setDocument(rowId, text(body.key), Boolean(body.received), by(req));
    } else if (part === 'options' && sub && del) {
      out = cards.removeOption(rowId, sub, by(req));
    } else if (part === 'options' && sub) {
      out = cards.updateOption(rowId, sub, body, by(req));
    } else if (part === 'options') {
      out = cards.addOption(rowId, body, by(req));
      if (!out.error) note(req, [`${who}: added the option ${[out.option.university, out.option.course].filter(Boolean).join(', ')}`]);
    } else {
      send(res, 404, 'Not found');
      return true;
    }
    if (out.error) sendJSON(res, out.duplicate ? 409 : 400, { error: out.error });
    else sendJSON(res, 200, { ok: true, card: out.card, ...(out.note ? { note: out.note } : {}), ...(out.option ? { option: out.option } : {}) });
    return true;
  }

  // ---- adding a student from the card form ----
  // The student goes on the sheet exactly as if the row had been typed there: Admin chooses the intake and the stage; a
  // team's student goes to the current intake at the team's own stage, with only what the team may fill in (teamSave
  // checks it with the same rules as a save from the sheet). The card details are kept with the new student.
  async function handleNewStudent(req, res) {
    const body = await bodyOf(req, res);
    if (!body) return true;
    const wb = getWorkbook();
    if (!wb) { sendJSON(res, 500, { error: 'Could not read the data file' }); return true; }
    if (Teams.isReadOnly(req.user)) { sendJSON(res, 403, { error: 'Your account can only view students.' }); return true; }
    const given = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const fields = {};
    NEW_STUDENT_COLUMNS.forEach((col) => {
      const v = typeof given[col] === 'string' ? given[col].replace(/\s+/g, ' ').trim().slice(0, col === 'REMARKS' ? MAX_CELL_CHARS : 300) : '';
      if (v) fields[col] = col === 'EMAIL' ? v.toLowerCase() : v;
    });
    if (!fields['FIRST NAME'] && !fields['LAST NAME']) { sendJSON(res, 400, { error: "Please enter the student's name." }); return true; }
    if (fields.EMAIL && !mailer.isAddress(fields.EMAIL)) { sendJSON(res, 400, { error: 'That email address does not look right.' }); return true; }
    const rowId = 'row-' + Date.now().toString(36) + require('crypto').randomBytes(4).toString('hex');
    let sheet;
    if (Teams.isAdmin(req.user)) {
      sheet = wb.sheets.find((s) => s.id === body.sheetId) || currentIntake() || wb.sheets[0];
      const stage = Teams.ALL_STATUSES.includes(text(body.stage)) ? text(body.stage) : 'Inquiry';
      const row = { _id: rowId };
      sheet.columns.forEach((c) => { row[c] = ''; });
      Object.keys(fields).forEach((c) => { if (sheet.columns.includes(c)) row[c] = fields[c]; });
      if (sheet.columns.includes(STATUS)) row[STATUS] = stage;
      const next = { ...wb, revision: wb.revision + 1, sheets: wb.sheets.map((s) => (s.id === sheet.id ? { ...s, rows: [...s.rows, row] } : s)) };
      try { writeWorkbook(next); } catch (e) { console.error('[new student]', e); sendJSON(res, 500, { error: 'save failed' }); return true; }
      recordChanges(req, wb, next);
    } else {
      const depts = Teams.addableDepartments(req.user);
      const dept = depts.includes(body.dept) ? body.dept : (depts.length === 1 ? depts[0] : null);
      if (!dept) { sendJSON(res, 400, { error: 'Choose which team the new student is for.' }); return true; }
      const view = Teams.viewFor(req.user, wb);
      sheet = currentIntake();
      const mine = view.sheets.find((s) => sheet && s.id === sheet.id);
      if (!mine) { sendJSON(res, 409, { error: 'There is no current intake to add the student to.' }); return true; }
      // Only what this team may fill in on a student it adds; anything else typed in the form is left out, not refused.
      const stub = { _id: rowId, [STATUS]: Teams.DEPARTMENTS[dept].start, _addedByTeam: dept };
      const row = { ...stub };
      Object.keys(fields).forEach((c) => { if (mine.columns.includes(c) && Teams.canEdit(req.user, c, stub)) row[c] = fields[c]; });
      const out = teamSave(req, { baseRevision: wb.revision, sheets: view.sheets.map((s) => (s.id === mine.id ? { ...s, rows: [...s.rows, row] } : s)) });
      if (out.status !== 200) { sendJSON(res, out.status, out.body.error === 'conflict' ? { error: 'The sheet changed at the same moment. Please try again.' } : out.body); return true; }
    }
    // The card: where the student came from and the rest of what the form asked.
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : {};
    const saved = cards.setProfile(rowId, profile, by(req));
    if (!saved.error && body.followUp && body.followUp.date) cards.setFollowUp(rowId, body.followUp, by(req));
    if (!saved.error && text(body.note)) cards.addNote(rowId, { text: body.note, kind: 'note' }, by(req));
    sendJSON(res, 200, { ok: true, id: rowId, sheetId: sheet.id, revision: getWorkbook().revision });
    return true;
  }

  // ---- lists across students ----
  function searchStudents(user, q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
    const digits = String(q || '').replace(/\D/g, '');
    const out = [];
    for (const { sheet, row } of visibleStudents(user)) {
      const b = brief(sheet, row);
      const hay = `${b.name} ${b.email} ${b.university} ${b.course}`.toLowerCase();
      const phone = b.phone.replace(/\D/g, '');
      const hit = words.length ? (words.every((w) => hay.includes(w)) || (digits.length >= 5 && phone.includes(digits))) : true;
      if (hit) out.push(b);
      if (out.length >= 400) break;
    }
    // The newest intake first, then by name.
    const order = new Map((getWorkbook() ? getWorkbook().sheets : []).map((s, i) => [s.id, i]));
    out.sort((a, b) => (order.get(b.sheetId) - order.get(a.sheetId)) || a.name.localeCompare(b.name));
    return out.slice(0, 30);
  }

  function followUps(user) {
    const today = cards.today();
    const all = cards.all();
    const due = [];
    const unplanned = [];
    const dayNumber = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
    for (const { sheet, row } of visibleStudents(user)) {
      const card = all[row._id];
      const stage = text(row[STATUS]);
      const last = card && card.notes.length ? card.notes[card.notes.length - 1] : null;
      const base = {
        ...brief(sheet, row), counselor: (card && card.profile.counselor) || '', quality: (card && card.profile.leadQuality) || '',
        lastNote: last ? { at: last.at, by: last.by, text: last.text.slice(0, 200) } : null, remarks: text(row.REMARKS).slice(0, 200),
        editable: canChange(user, { sheet, row }),
      };
      if (card && card.followUp) {
        due.push({ ...base, date: card.followUp.date, what: card.followUp.note, days: dayNumber(today) - dayNumber(card.followUp.date) });
      } else if (['Inquiry', 'Hold', 'Defer'].includes(stage) && sheet.id === (currentIntake() || {}).id) {
        unplanned.push(base);
      }
    }
    due.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    return { today, due, unplanned: unplanned.slice(0, 300), me: user.name };
  }

  // ---- the course finder over the Fact File ----
  let courseCache = { facts: null, links: null, index: [] };
  function courseIndex() {
    const all = facts.all();
    const links = courseLinks.all();
    if (courseCache.facts !== all || courseCache.links !== links) courseCache = { facts: all, links, index: buildIndex(all, links) };
    return courseCache.index;
  }

  // ---- B2B partners (Admin only): the list, one partner, its agreement files ----
  function readRaw(req, maxBytes) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let failed = false;
      req.on('data', (chunk) => {
        if (failed) return;
        size += chunk.length;
        if (size > maxBytes) { failed = true; const err = new Error('Payload too large'); err.statusCode = 413; reject(err); return; }
        chunks.push(chunk);
      });
      req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
      req.on('error', reject);
    });
  }
  async function handleB2b(req, res, urlPath) {
    if (!adminOnly(req, res, 'B2B Partners')) return true;
    const id = (urlPath.match(/^\/api\/b2b\/([a-f0-9]{12})/) || [])[1];
    const record = (line) => activity.record(req, req.user, 'Edited partners', { app: 'B2B Partners', changes: [line] });
    const fileMatch = urlPath.match(/^\/api\/b2b\/[a-f0-9]{12}\/files(?:\/([a-f0-9]{12})(\/delete)?)?$/);
    if (fileMatch) {
      const fid = fileMatch[1];
      if (req.method === 'GET' && fid && !fileMatch[2]) {
        const file = b2b.agreementFile(id, fid);
        if (!file) { sendJSON(res, 404, { error: 'No such file.' }); return true; }
        record(`Downloaded ${file.name}`);
        send(res, 200, fs.readFileSync(file.path), {
          'Content-Type': file.type, 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'",
          'Content-Disposition': `attachment; filename="agreement${path.extname(file.path)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        });
        return true;
      }
      if (req.method !== 'POST') { send(res, 405, 'Method not allowed'); return true; }
      if (!fid) {
        const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
        let bytes;
        try { bytes = await readRaw(req, MAX_FILE_BYTES); } catch (e) {
          sendJSON(res, e.statusCode || 400, { error: e.statusCode === 413 ? 'That file is too large (the limit is 10 MB).' : e.message });
          return true;
        }
        const added = b2b.addAgreement(id, name, bytes, req.user.label);
        if (added.error) { sendJSON(res, 400, { error: added.error }); return true; }
        record(`Uploaded the agreement ${added.agreement.name} for ${added.university.name}`);
        sendJSON(res, 200, added.university);
        return true;
      }
      const gone = b2b.removeAgreement(id, fid, req.user.label);
      if (gone.error) { sendJSON(res, 404, { error: gone.error }); return true; }
      record(`Removed the agreement ${gone.removed.name} from ${gone.university.name}`);
      sendJSON(res, 200, gone.university);
      return true;
    }
    if (req.method === 'GET') {
      if (!id) { sendJSON(res, 200, { partners: b2b.list(), kinds: B2B_KINDS, statuses: PARTNER_STATUSES }); return true; }
      const one = b2b.get(id);
      if (one) sendJSON(res, 200, one); else sendJSON(res, 404, { error: 'No such partner.' });
      return true;
    }
    if (req.method !== 'POST') { send(res, 405, 'Method not allowed'); return true; }
    const body = await bodyOf(req, res, 1024 * 1024);
    if (!body) return true;
    if (!id) {
      const made = b2b.create(body.name, req.user.label);
      if (made.error) { sendJSON(res, 400, { error: made.error }); return true; }
      const withKind = b2b.update(made.university.id, { ...made.university, kind: body.kind }, req.user.label);
      record(`Added ${made.university.name} to B2B Partners`);
      sendJSON(res, 200, withKind.university || made.university);
      return true;
    }
    if (urlPath.endsWith('/delete')) {
      const gone = b2b.remove(id);
      if (gone.error) { sendJSON(res, 404, { error: gone.error }); return true; }
      record(`Removed ${gone.removed.name} from B2B Partners`);
      sendJSON(res, 200, { ok: true });
      return true;
    }
    const saved = b2b.update(id, body, req.user.label);
    if (saved.error) { sendJSON(res, 400, { error: saved.error }); return true; }
    record(`Updated ${saved.university.name} in B2B Partners`);
    sendJSON(res, 200, saved.university);
    return true;
  }

  // ---- the management records of the Dashboard ----
  async function handlePlanning(req, res, urlPath) {
    if (!managers(req, res, 'Planning')) return true;
    const admin = Teams.isAdmin(req.user);
    if (req.method === 'GET' && urlPath === '/api/planning') {
      const p = planning.all();
      // What a student with a visa is worth is an assumption about money: Admin only.
      const settings = admin ? p.settings : { maxCostPerLead: p.settings.maxCostPerLead };
      sendJSON(res, 200, { targets: p.targets, spend: p.spend, events: p.events, decisions: p.decisions, market: p.market, settings, canEdit: admin, lists: { EVENT_TYPES, DECISION_STATUS, MARKET_KINDS, sources: sourceChoices() } });
      return true;
    }
    if (req.method !== 'POST') { send(res, 405, 'Method not allowed'); return true; }
    if (!adminOnly(req, res, 'Changing the planning records')) return true;
    const body = await bodyOf(req, res);
    if (!body) return true;
    const record = (line) => activity.record(req, req.user, 'Edited planning', { app: 'Dashboard', changes: [line] });
    let m = /^\/api\/planning\/targets\/([\w-]{1,80})$/.exec(urlPath);
    if (m) {
      const out = planning.setTarget(m[1], body, req.user.label);
      if (out.error) { sendJSON(res, 400, { error: out.error }); return true; }
      record(out.target ? `Set the target of an intake: ${out.target.visas} visas${out.target.byDate ? ` by ${out.target.byDate}` : ''}` : 'Removed the target of an intake');
      sendJSON(res, 200, { ok: true, target: out.target });
      return true;
    }
    if (urlPath === '/api/planning/settings') {
      const out = planning.saveSettings(body);
      record('Changed the planning assumptions');
      sendJSON(res, 200, { ok: true, settings: out.settings });
      return true;
    }
    m = /^\/api\/planning\/(spend|events|decisions|market)(?:\/([a-f0-9]{12})\/delete)?$/.exec(urlPath);
    if (!m || !PLANNING_LISTS[m[1]]) { send(res, 404, 'Not found'); return true; }
    const label = { spend: 'marketing spend', events: 'events', decisions: 'decision log', market: 'market notes' }[m[1]];
    if (m[2]) {
      const gone = planning.remove(m[1], m[2]);
      if (gone.error) { sendJSON(res, 404, { error: gone.error }); return true; }
      record(`Removed an entry from the ${label}`);
      sendJSON(res, 200, { ok: true });
      return true;
    }
    const out = planning.save(m[1], body, req.user.label);
    if (out.error) { sendJSON(res, 400, { error: out.error }); return true; }
    record(`${body.id ? 'Changed' : 'Added'} an entry in the ${label}: ${out.entry.title || out.entry.name || out.entry.campaign || out.entry.source || out.entry.month}`);
    sendJSON(res, 200, { ok: true, entry: out.entry });
    return true;
  }
  // The Student Sources in use (the sheet's own list, plus anything typed in a sheet), for the spend table.
  function sourceChoices() {
    const set = new Set(Object.keys(Fields.SOURCE_DETAILS));
    const wb = getWorkbook();
    if (wb) wb.sheets.forEach((s) => s.rows.forEach((r) => { const v = text(r['STUDENT SOURCE']); if (v) set.add(v); }));
    return [...set].sort();
  }

  // ---- message templates ----
  async function handleTemplates(req, res, urlPath) {
    if (req.method === 'GET' && urlPath === '/api/templates') {
      const cfg = mailConfig();
      sendJSON(res, 200, { templates: messages.list(), fields: Messages.FIELDS, signature: messages.signature(), stages: Teams.ALL_STATUSES, canEdit: Teams.isAdmin(req.user), mail: { ready: Boolean(cfg), from: cfg ? cfg.from : '' } });
      return true;
    }
    if (req.method !== 'POST') { send(res, 405, 'Method not allowed'); return true; }
    if (!adminOnly(req, res, 'Changing the message templates')) return true;
    const body = await bodyOf(req, res);
    if (!body) return true;
    const record = (line) => activity.record(req, req.user, 'Edited templates', { app: 'Messages', changes: [line] });
    if (urlPath === '/api/templates/signature') {
      const out = messages.saveSignature(body);
      record('Changed the email signature');
      sendJSON(res, 200, { ok: true, signature: out.signature });
      return true;
    }
    if (urlPath === '/api/templates') {
      const out = messages.addTemplate(body, req.user.label);
      if (out.error) { sendJSON(res, 400, { error: out.error }); return true; }
      record(`Added the message template "${out.template.name}"`);
      sendJSON(res, 200, { ok: true, template: out.template });
      return true;
    }
    const m = /^\/api\/templates\/([a-z0-9_]{1,40})(\/delete)?$/.exec(urlPath);
    if (!m) { send(res, 404, 'Not found'); return true; }
    if (m[2]) {
      const out = messages.removeTemplate(m[1]);
      if (out.error) { sendJSON(res, 404, { error: out.error }); return true; }
      record(out.reset ? `Put the message template "${out.removed.name}" back to its original text` : `Deleted the message template "${out.removed.name}"`);
      sendJSON(res, 200, { ok: true, reset: out.reset });
      return true;
    }
    const out = messages.saveTemplate(m[1], body, req.user.label);
    if (out.error) { sendJSON(res, 400, { error: out.error }); return true; }
    record(`Changed the message template "${out.template.name}"`);
    sendJSON(res, 200, { ok: true, template: out.template });
    return true;
  }

  // "Ask the analyst": a question about the business, answered from the Dashboard's own figures (totals only: no student
  // is named in them) and the management records.
  const ANALYST = [
    'You are the business analyst of the UK recruitment department of Nepal International Educational Consultancy (NIEC), an education consultancy in Nepal that places students in UK universities.',
    'The head of UK recruitment, the CEO and the chairman ask you questions. Answer from the figures given below, which come from NIEC\'s own portal: the student sheet, the student cards, the marketing spend, the events, the targets, the decision log and the market notes.',
    '',
    'Rules:',
    '- Every claim rests on a number from the figures. Quote the number. Never invent a figure, a market statistic, a competitor fact or a rule: when the figures do not hold the answer, say so plainly and name the exact record that would answer it.',
    '- A rate marked low, or built on fewer than 10 students, is weak evidence: say so and do not build a decision on it alone.',
    '- Lead with the decision. Then the evidence, the reason, what to do this week, and how to tell in a month whether it worked.',
    '- Do not blame counselors for a low conversion without evidence: in Nepal students talk to several consultancies, and many inquiries are cold.',
    '- Do not give obvious advice (follow up more, advertise more) without saying exactly what changes, for whom, and by how much.',
    '- Write for a busy owner who is not an analyst: plain English, short sentences, no jargon, no dashes used as punctuation. Money is in Nepali rupees (Rs) unless it is a UK fee (GBP).',
  ].join('\n');
  const ANALYST_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['answer', 'decisions', 'data_needed'],
    properties: {
      answer: { type: 'string', description: 'The answer in short paragraphs. A line that starts with "- " is a bullet.' },
      decisions: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['title', 'evidence', 'why', 'action', 'measure'],
          properties: { title: { type: 'string' }, evidence: { type: 'string' }, why: { type: 'string' }, action: { type: 'string' }, measure: { type: 'string' } },
        },
      },
      data_needed: { type: 'array', items: { type: 'string' }, description: 'What is missing from the records that would make the answer firmer. Empty when nothing is.' },
    },
  };
  async function askAnalyst(question, figuresJson) {
    const p = planning.all();
    const records = JSON.stringify({ decisions: p.decisions, market: p.market });
    const answer = await ai.askJson({
      system: [{ text: ANALYST }, { text: `THE FIGURES (from the Dashboard, as JSON)\n${figuresJson}\n\nTHE DECISION LOG AND MARKET NOTES (as JSON)\n${records}`, cache: true }],
      user: question, schema: ANALYST_SCHEMA, effort: 'high',
    });
    const d = answer.data || {};
    return {
      answer: text(d.answer).slice(0, 8000),
      decisions: (Array.isArray(d.decisions) ? d.decisions : []).slice(0, 8).map((x) => ({ title: text(x.title), evidence: text(x.evidence), why: text(x.why), action: text(x.action), measure: text(x.measure) })),
      dataNeeded: (Array.isArray(d.data_needed) ? d.data_needed : []).slice(0, 10).map((x) => text(x)).filter(Boolean),
    };
  }

  async function handle(req, res, urlPath) {
    if (!urlPath.startsWith('/api/')) return false;
    const query = () => new URL(req.url, 'http://x').searchParams;
    if (urlPath === '/api/card-lists' && req.method === 'GET') { sendJSON(res, 200, cardLists(req.user)); return true; }
    if (urlPath === '/api/students/search' && req.method === 'GET') { sendJSON(res, 200, { students: searchStudents(req.user, (query().get('q') || '').slice(0, 100)) }); return true; }
    if (urlPath === '/api/students/new' && req.method === 'POST') return handleNewStudent(req, res);
    if (urlPath === '/api/follow-ups' && req.method === 'GET') { sendJSON(res, 200, followUps(req.user)); return true; }
    if (urlPath.startsWith('/api/cards/')) return handleCard(req, res, urlPath);
    if (urlPath === '/api/courses' && req.method === 'GET') {
      const q = query();
      const index = courseIndex();
      const found = searchCourses(index, { q: (q.get('q') || '').slice(0, 100), level: q.get('level') || '', intake: (q.get('intake') || '').slice(0, 60), universityId: q.get('university') || '', limit: 80 });
      sendJSON(res, 200, { ...found, levels: Fields.STUDY_LEVELS, intakes: [...new Set(index.flatMap((o) => o.intake.split(',').map((s) => s.trim())).filter(Boolean))].sort() });
      return true;
    }
    if (urlPath === '/api/templates' || urlPath.startsWith('/api/templates/')) return handleTemplates(req, res, urlPath);
    if (urlPath === '/api/b2b' || urlPath.startsWith('/api/b2b/')) return handleB2b(req, res, urlPath);
    if (urlPath === '/api/planning' || urlPath.startsWith('/api/planning/')) return handlePlanning(req, res, urlPath);
    if (urlPath === '/api/insights' && req.method === 'GET') {
      if (!managers(req, res, 'The Dashboard')) return true;
      if (!getWorkbook()) { sendJSON(res, 500, { error: 'Could not read the data file' }); return true; }
      send(res, 200, insights(req.user, query().get('intake') || ''), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return true;
    }
    // The AI helper: whether it is switched on, the option finder and "Ask the analyst". A question that goes to the AI is
    // answered in the background: the page gets a ticket and asks for the answer every few seconds.
    if (urlPath === '/api/ai/status' && req.method === 'GET') {
      const state = ai.status();
      sendJSON(res, 200, { ready: state.ready, message: ai.offMessage() });
      return true;
    }
    if (urlPath === '/api/finder' && req.method === 'POST') {
      const body = await bodyOf(req, res);
      if (!body) return true;
      const student = body.studentId && ROW_ID.test(String(body.studentId)) ? rowIndex().get(body.studentId) : null;
      const seen = student && canSee(req.user, student) ? student : null;
      const work = () => finder({ body, index: courseIndex(), universities: facts.all(), card: seen ? cards.get(seen.row._id) : null });
      if (!ai.status().ready || body.useAi === false) {
        const out = await work();
        sendJSON(res, out.error ? 400 : 200, out);
        return true;
      }
      const started = jobs.start(req.user.id, work);
      if (started.error) sendJSON(res, started.status || 429, { error: started.error });
      else sendJSON(res, 202, { job: started.id });
      return true;
    }
    if (urlPath === '/api/analyst' && req.method === 'POST') {
      if (!managers(req, res, 'Ask the analyst')) return true;
      const body = await bodyOf(req, res);
      if (!body) return true;
      const question = text(body.question).slice(0, 1500);
      if (!question) { sendJSON(res, 400, { error: 'Type your question first.' }); return true; }
      if (!ai.status().ready) { sendJSON(res, 409, { error: ai.offMessage(), off: true }); return true; }
      if (!getWorkbook()) { sendJSON(res, 500, { error: 'Could not read the data file' }); return true; }
      const figures = insights(req.user, text(body.intake));
      const started = jobs.start(req.user.id, () => askAnalyst(question, figures));
      if (started.error) sendJSON(res, started.status || 429, { error: started.error });
      else sendJSON(res, 202, { job: started.id });
      return true;
    }
    const jobMatch = /^\/api\/(?:finder|analyst)\/([a-f0-9]{16})$/.exec(urlPath);
    if (jobMatch && req.method === 'GET') {
      const job = jobs.get(req.user.id, jobMatch[1]);
      if (!job) sendJSON(res, 404, { error: 'That question is no longer kept. Please ask again.' });
      else if (job.status === 'working') sendJSON(res, 200, { status: 'working' });
      else if (job.status === 'failed') sendJSON(res, 200, { status: 'failed', error: job.error });
      else sendJSON(res, 200, { status: 'done', result: job.result });
      return true;
    }
    return false;
  }

  return { handle, rowIndex, canSee, canChange, visibleStudents, courseIndex, brief };
}

module.exports = { createPortalApi, NEW_STUDENT_COLUMNS };

// The requests behind the portal pages around the sheet: the student card (notes, university options, messages), adding a
// student from the card form, the course finder over the
// Fact File, the message templates, the B2B partners and the management records of the Dashboard.
//
// Who may see or change a student here is decided by the very same rules as on the sheet (shared/teams.js): Admin
// everything, the Manager every student but view only, a team its own students in the current intake. A student the
// sheet would not show an account is "not found" here too.
//
// server.js creates this once and passes every request it does not answer itself to handle(); true means answered.

const fs = require('fs');
const path = require('path');
const { sendJSON, send, readJSONBody, localDate } = require('../shared/server-utils');
const { isoDate } = require('./dashboard-stats');
const Teams = require('../shared/teams');
const mailer = require('../shared/mailer');
const Fields = require('./card-fields');
const { eventLabel, eventFor } = require('./source-options');
const { ROW_ID } = require('./cards');
const Messages = require('./messages');
const { buildIndex, searchCourses, linkKey, parseCourses } = require('./course-index');
const { hostsOf, onHosts } = require('./university-websites');
const { EVENT_TYPES, MARKETING_TYPES, CHANNELS, channelOf, DECISION_STATUS, MARKET_KINDS, LISTS: PLANNING_LISTS } = require('./planning');
const { MAX_FILE_BYTES, STATUSES: PARTNER_STATUSES } = require('./direct');
const { partnerAccess, shapePartner } = require('./partner-access');

const text = (v) => String(v ?? '').trim();
const STATUS = Teams.STATUS;
const MAX_CELL_CHARS = 5000;
// The columns the Add student form may fill in (for Admin; a team is further held to what its own rules allow).
const NEW_STUDENT_COLUMNS = ['FIRST NAME', 'LAST NAME', 'EMAIL', 'CONTACT NUMBER', 'STUDENT SOURCE'];

function createPortalApi({
  getWorkbook, writeWorkbook, recordChanges, teamSave, cards, messages, courseLinks, sourceOptions, courseLinker = null, courseWatch = () => null, facts, direct, b2b, agents, planning, accounts, activity,
  insights = null, finder = null, calculated = [], userMail = null, officeMailSettings = () => ({}),
}) {
  // ---- where to send a student's application: the portal link and email saved on Partner Universities ----
  // The student's university is matched to a partner by name, ignoring case, spaces and punctuation; a partner name with a
  // delivery partner in brackets ("Ulster University (QA)") also matches the plain name. Only these two fields leave
  // Partner Universities (never the commission or the agreement), and a partner marked Ended is left out. The portal's
  // login (username and password) goes only to an account that may work on the student (not the view-only Manager).
  const squash = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, '');
  // A student whose University Partner is one of the B2B partners is applied for through that partner: its portal or email wins.
  function partnerRouteFor(partner, withLogin) {
    const want = squash(partner);
    if (!want || !b2b || !b2b.all) return null;
    const hit = b2b.all().find((p) => p.status !== 'Ended' && (p.applyPortal || p.applyEmail) && squash(p.name) === want);
    if (!hit) return null;
    const route = { university: '', via: hit.name, portal: hit.applyPortal || '', email: hit.applyEmail || '' };
    if (withLogin && hit.applyPortal) Object.assign(route, { user: hit.applyUser || '', password: hit.applyPassword || '' });
    return route;
  }
  function applyRouteFor(university, withLogin) {
    const want = squash(university);
    if (!want || !direct || !direct.all) return null;
    const hit = direct.all().find((u) => u.status !== 'Ended' && (u.applyPortal || u.applyEmail) && squash(u.name) === want);
    if (!hit) return null;
    const route = { university: hit.name, via: '', portal: hit.applyPortal || '', email: hit.applyEmail || '' };
    if (withLogin && hit.applyPortal) Object.assign(route, { user: hit.applyUser || '', password: hit.applyPassword || '' });
    return route;
  }

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
  // The student already on the sheet with this email or phone number (any intake), or null.
  // A phone number compared by its last 10 digits, so "+977 980-1234567" and "9801234567" are the same student. '' when too short to compare.
  const phoneKey = (v) => { const d = text(v).replace(/\D/g, ''); return d.length >= 7 ? d.slice(-10) : ''; };
  function existingStudent(email, phone) {
    const em = text(email).toLowerCase(); const ph = phoneKey(phone);
    if (!em && !ph) return null;
    for (const { row } of rowIndex().values()) {
      if ((em && text(row.EMAIL).toLowerCase() === em) || (ph && phoneKey(row['CONTACT NUMBER']) === ph)) return row;
    }
    return null;
  }
  const currentIntake = () => { const wb = getWorkbook(); return wb ? Teams.newestSheet(wb.sheets.filter((s) => !s.hidden)) : null; };
  // The teams a person belongs to (department keys); a task given to one of them can be seen and marked by that person.
  const teamsOf = (user) => (Array.isArray(user && user.departments) ? user.departments : []);
  const TASK_TEAMS = () => Object.entries(Teams.DEPARTMENTS).map(([id, d]) => ({ id, label: d.label }));
  const teamLabel = (id) => (Teams.DEPARTMENTS[id] ? Teams.DEPARTMENTS[id].label : id);
  const canAssign = (user) => Teams.isAdmin(user) || Teams.isManager(user);
  // A branch gives tasks too, about its own students, to the Application Team and the Mock Team (the owner, 14 Nov 2026). It removes
  // only the tasks it gave; Admin and the Manager remove any.
  const isBranchUser = (user) => teamsOf(user).some((d) => Teams.DEPARTMENTS[d] && Teams.DEPARTMENTS[d].source);
  const BRANCH_TASK_TEAMS = ['application', 'mock'];
  const assignTeamsFor = (user) => (canAssign(user) ? TASK_TEAMS() : isBranchUser(user) ? TASK_TEAMS().filter((t) => BRANCH_TASK_TEAMS.includes(t.id)) : []);
  const hasTaskFor = (user, rowId) => { const mine = teamsOf(user); if (!mine.length) return false; const c = cards.has(rowId) ? cards.get(rowId) : null; const recent = Date.now() - 7 * 86400000; return Boolean(c && (c.tasks || []).some((t) => mine.includes(t.team) && (!t.done || Date.parse(t.doneAt) > recent))); };
  function canSee(user, found) {
    if (!found) return false;
    if (Teams.isAdmin(user) || Teams.isManager(user)) return true;
    // A team given a task about a student sees that student while the task is open and for 7 days after it is done (to undo a
    // mistaken tick), wherever the student is.
    if (hasTaskFor(user, found.row._id)) return true;
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
    const plan = planning.all();
    // The events Admin recorded on the Dashboard are offered too, with their day, as "Name, 21 Nov 2026".
    const newest = [...plan.events].sort((a, b) => b.date.localeCompare(a.date));
    const planned = newest.map((e) => eventLabel(e.name, e.date));
    const options = sourceOptions.all(planned);
    // Social media campaigns are offered under "Social Media" too (first), so a student who came from one is counted in its cost.
    const campaigns = newest.filter((e) => channelOf(e) === 'Social media').map((e) => eventLabel(e.name, e.date));
    if (campaigns.length && options['Social Media']) { const seen = new Set(campaigns.map((x) => x.toLowerCase())); options['Social Media'] = [...campaigns, ...options['Social Media'].filter((x) => !seen.has(x.toLowerCase()))]; }
    return {
      sourceOptions: options,
      sourceLabels: Fields.SOURCE_DETAIL_LABEL, sourceCanAdd: Fields.SOURCE_CAN_ADD,
      // Only the names: the terms agreed with a partner stay on the Admin-only page.
      partners: [...new Set([...agents.list().filter((p) => p.status !== 'Ended').map((p) => p.name), ...sheetAgents().map((p) => p.name)])],
      intakes: (() => { const wb = getWorkbook(); return wb ? Teams.viewFor(user, wb).sheets.map((s) => ({ id: s.id, name: s.name })) : []; })(),
      stages: Teams.ALL_STATUSES,
      departments: Teams.addableDepartments(user).map((d) => ({ id: d, label: Teams.DEPARTMENTS[d].label, start: Teams.DEPARTMENTS[d].start, source: Teams.DEPARTMENTS[d].source || '' })),
    };
  }

  // ---- messages ----
  // The office signature (the picture the owner supplied) goes at the end of every email: inline in the email that is sent, and as a
  // data address in the preview (the preview window has no login, so it cannot fetch a picture from the server).
  let signaturePicture = null;
  // A consultancy's own picture in the data folder wins; the file shipped here is only the first installation's starting picture.
  for (const dir of [process.env.STUDENT_DETAILS_DATA_DIR, __dirname]) {
    if (signaturePicture || !dir) continue;
    try { signaturePicture = require('fs').readFileSync(require('path').join(dir, 'email-signature.png')); } catch (e) { signaturePicture = null; }
  }
  const inlinePictures = () => (signaturePicture ? [{ cid: 'niec-signature', type: 'image/png', data: signaturePicture }] : []);
  const signatureSrc = (preview) => (signaturePicture ? (preview ? `data:image/png;base64,${signaturePicture.toString('base64')}` : 'cid:niec-signature') : '');
  // The mailbox a person sends from: their own (set up under My email) or, for Admin only, the office mailbox. A team member who has
  // not set up their own mailbox cannot email (the owner, 14 Nov 2026). `personal` marks a person's own mailbox.
  function mailFor(user) {
    const own = userMail && user ? userMail.config(user.id) : null;
    const office = accounts.emailConfig();
    if (own) return { ...own, siteUrl: (office && office.siteUrl) || officeMailSettings().siteUrl || '', personal: true };
    return Teams.isAdmin(user) ? office : null;
  }
  // What a page is told about the sender's mailbox.
  const mailInfo = (user) => { const cfg = mailFor(user); return { ready: Boolean(cfg), from: cfg ? cfg.from : '', own: !Teams.isAdmin(user), setUp: '/my-email' }; };
  // A team member's email is signed with their own name, team and address (the office picture carries Admin's name, so it is left out).
  function signatureFor(user, cfg) {
    const sig = messages.signature();
    if (Teams.isAdmin(user) || !cfg || !cfg.personal) return { sig, picture: true };
    const team = teamsOf(user).map((d) => (Teams.DEPARTMENTS[d] ? Teams.DEPARTMENTS[d].label : '')).filter(Boolean).join(', ');
    const box = userMail.info(user.id);
    return { sig: { ...sig, name: user.name, title: team, email: cfg.from, ...(box.phone ? { phone: box.phone, whatsapp: box.phone } : {}) }, picture: false };
  }
  // Who gets a copy: the sender's own mailbox (their sent copy) and, for a team member, the office mailbox, unless Admin switched copies off.
  const copiesFor = (cfg) => { const office = accounts.emailConfig(); return messages.signature().copyToOffice ? [...new Set([cfg.from, ...(cfg.personal && office ? [office.from] : [])])] : []; };
  function messageContext(req, found, card, optionIds) {
    const picked = Array.isArray(optionIds) && optionIds.length ? card.options.filter((o) => optionIds.includes(o.id)) : card.options;
    return {
      values: Messages.valuesFor({ row: found.row, sheetName: found.sheet.name, card, sender: req.user.name, company: messages.signature().company, short: messages.signature().short }),
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
    const body = await bodyOf(req, res, action === 'send' ? 24 * 1024 * 1024 : 256 * 1024);
    if (!body) return true;
    const template = messages.get(text(body.template)) || null;
    const subject = typeof body.subject === 'string' ? body.subject : (template ? template.subject : '');
    const own = text(body.template) === 'custom'; // "Other": the sender writes everything
    const emailBody = typeof body.body === 'string' ? body.body : (template ? template.body : (own ? 'Dear {first_name},\n\n' : ''));
    const whatsappBody = typeof body.whatsapp === 'string' ? body.whatsapp : (template ? template.whatsapp : (own ? 'Hello {first_name}, ' : ''));
    const ctx = messageContext(req, found, card, body.optionIds);
    const cfg = mailFor(req.user);
    const signed = signatureFor(req.user, cfg);
    const signature = signed.sig;
    const email = Messages.renderEmail({ subject, body: emailBody, signature, siteUrl: cfg ? cfg.siteUrl : '', signatureSrc: signed.picture ? signatureSrc(action === 'preview') : '', ...ctx });
    const whatsapp = Messages.renderWhatsApp({ body: whatsappBody, ...ctx });
    const ownTo = text(found.row.EMAIL).toLowerCase();
    const to = text(body.to) || ownTo;
    if (to !== ownTo && /^[^\s@]+@[^\s@]+$/.test(to) && !Teams.isAdmin(req.user)) { sendJSON(res, 403, { error: 'Only the student\'s own address can be used from your account.' }); return true; }
    const number = Fields.whatsappNumber(found.row['CONTACT NUMBER']);

    if (action === 'preview') {
      return sendJSON(res, 200, {
        subject: email.subject, text: email.text, html: email.html, missing: email.missing, to,
        whatsapp: { text: whatsapp.text, number, missing: whatsapp.missing },
        mail: mailInfo(req.user),
        options: ctx.options.length, source: { subject, body: emailBody, whatsapp: whatsappBody },
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
    // Files to send with this one email: decoded here, held in memory for the length of the send, never written to disk.
    const files = [];
    let total = 0;
    for (const f of (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 8)) {
      const data = Buffer.from(String(f && f.data || ''), 'base64');
      total += data.length;
      if (!data.length) continue;
      files.push({ name: text(f.name).replace(/[\\/\u0000-\u001f]/g, '').slice(0, 120) || 'attachment', type: text(f.type).slice(0, 80), data });
    }
    if (total > 15 * 1024 * 1024) return sendJSON(res, 413, { error: 'The files are too large to send together (the limit is 15 MB).' });
    const entry = { channel, template: template ? template.name : 'Own message', subject: email.subject, to, text: email.text, options: usesOptions ? ctx.options.length : 0, attachments: files.map((f) => f.name) };
    if (usesOptions) {
      // A link typed on a card is only remembered for the Fact File when it is on that university's own website.
      const unis = facts.all();
      ctx.options.forEach((o) => { const u = unis.find((x) => x.id === o.universityId); if (u && hostsOf(u).length && onHosts(o.link, hostsOf(u))) courseLinks.remember(o.universityId, o.course, o.link); });
    }
    if (!cfg) {
      // Email is not set up on this server (always the case on a test computer): nothing leaves, and the card keeps the
      // message as a preview so the whole step can still be checked.
      const logged = cards.logMessage(found.row._id, { ...entry, status: 'preview' }, by(req));
      return sendJSON(res, 200, { status: 'not-configured', ownMailNeeded: !Teams.isAdmin(req.user), message: logged.message, card: logged.card });
    }
    try {
      await mailer.sendMail({ ...cfg, fromName: cfg.personal && !Teams.isAdmin(req.user) ? `${req.user.name}, ${signature.short || signature.company || Messages.COMPANY}` : (signature.company || Messages.COMPANY) }, {
        to, subject: email.subject, text: email.text, html: email.html, auto: false, bcc: copiesFor(cfg), attachments: files, inline: signed.picture ? inlinePictures() : [],
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

  // The Student Source is a column of the sheet (hidden there: it is chosen on the card). Changed with the same rules as on the
  // sheet: Admin any time; a team only while it is blank on a student its own team added (shared/teams.js).
  function setSource(req, found, value) {
    if (value && !Fields.STORED_SOURCES.includes(value) && !Fields.isBranchValue(value)) return { error: 'That is not one of the sources.', status: 400 };
    const done = setColumns(req, found, { 'STUDENT SOURCE': value });
    return done.error ? done : { source: value };
  }

  // Columns of the sheet that can be changed from the student card, and how each is kept.
  // A real calendar day as YYYY-MM-DD (or empty); anything else is refused (null).
  const realDay = (v) => {
    const t = text(v);
    if (t === '') return t;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
  };
  const phoneOk = (t) => t === '' || (/^\+?[\d\s()-]{6,25}$/.test(t) && t.replace(/\D/g, '').length >= 6);
  const CARD_EDITABLE = {
    'FIRST NAME': (v) => text(v).slice(0, 80), 'LAST NAME': (v) => text(v).slice(0, 80), EMAIL: (v) => text(v).toLowerCase().slice(0, 120),
    'CONTACT NUMBER': (v) => { const t = text(v).slice(0, 40); return phoneOk(t) ? t : null; }, 'UNIVERSITY NAME': (v) => text(v).slice(0, 160), 'COURSE NAME': (v) => text(v).slice(0, 240),
    'APPLICATION SUBMISSION DATE': (v) => realDay(v),
    'OFFER RECEIVED DATE': (v) => realDay(v),
  };
  // Changes columns of one student with the rules of the sheet: Admin any time; a team only the columns it may edit on a student it sees.
  function setColumns(req, found, changes) {
    const wb = getWorkbook();
    for (const col of Object.keys(changes)) {
      if (col !== 'STUDENT SOURCE' && !CARD_EDITABLE[col]) return { error: 'That detail cannot be changed here.', status: 400 };
      if (!Teams.canEdit(req.user, col, found.row)) return { error: col === 'STUDENT SOURCE' ? "This student's source cannot be changed from your account." : `${col} cannot be changed from your account.`, status: 403 };
    }
    const apply = (rows) => rows.map((r) => (r._id === found.row._id ? { ...r, ...changes } : r));
    if (Teams.isAdmin(req.user)) {
      const next = { ...wb, revision: wb.revision + 1, sheets: wb.sheets.map((sh) => (sh.id !== found.sheet.id ? sh : { ...sh, rows: apply(sh.rows) })) };
      writeWorkbook(next);
      recordChanges(req, wb, next);
      return { ok: true };
    }
    const view = Teams.viewFor(req.user, wb);
    const out = teamSave(req, { baseRevision: wb.revision, sheets: view.sheets.map((sh) => (sh.id !== found.sheet.id ? sh : { ...sh, rows: apply(sh.rows) })) });
    return out.status === 200 ? { ok: true } : { error: out.body.error === 'conflict' ? 'The sheet changed at the same moment. Please try again.' : out.body.error, status: out.status };
  }

  // ---- Today: what needs a person's attention now, for the students this account sees ----
  // The home screen of each kind of account (Teams.kindOf): the same facts, but each team sees the work that is its own, in its own words.
  const WORKSPACES = {
    admin: { title: 'Everything at a glance', tagline: 'Here is what needs attention across the whole consultancy today.', sections: ['inquiries', 'apply', 'mock', 'offers', 'cas'], tiles: ['active', 'applied', 'visas'] },
    manager: { title: 'The consultancy at a glance', tagline: 'The numbers and the students waiting, to look at. Open the Dashboard for the full picture.', sections: ['inquiries', 'apply', 'mock', 'offers', 'cas'], tiles: ['active', 'applied', 'visas'] },
    application: { title: 'Application Team', tagline: 'Applications to submit, to chase and to complete.', sections: ['apply', 'noUni', 'noOffer', 'offers'], tiles: ['toSubmit', 'waitingOffer', 'applied'] },
    mock: { title: 'Mock Team', tagline: 'Mock interviews to schedule and feedback still to write.', sections: ['mock', 'mockFeedback', 'preCas'], tiles: ['atMock', 'toSchedule', 'feedbackMissing'] },
    followup: { title: 'Follow-up Team', tagline: 'Inquiries that have gone quiet and students who deferred.', sections: ['inquiries', 'defer'], tiles: ['inquiries', 'toFollow', 'deferred'] },
    branch: { title: 'Your branch', tagline: 'Your branch students: who to call, what to submit and who is close to a visa.', sections: ['inquiries', 'apply', 'mock', 'offers', 'cas'], tiles: ['active', 'applied', 'visas'] },
    team: { title: 'Your teams', tagline: 'The work of all your teams in one place.', sections: ['inquiries', 'apply', 'mock', 'mockFeedback', 'defer'], tiles: ['active', 'applied', 'visas'] },
  };
  const TILE_LABEL = {
    active: 'Students in progress', applied: 'Applications submitted', visas: 'Visas issued (all intakes)', toSubmit: 'Applications to submit', waitingOffer: 'Waiting for an offer',
    atMock: 'Students at Mock Stage', toSchedule: 'Interviews to schedule', feedbackMissing: 'Feedback to write', inquiries: 'Open inquiries', toFollow: 'To follow up now', deferred: 'Deferred students',
  };
  function todayFor(user) {
    const all = cards.all();
    const today = cards.today();
    const dayNo = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
    const now = dayNo(today);
    const kind = Teams.kindOf(user);
    const space = WORKSPACES[kind] || WORKSPACES.team;
    const sections = [
      { key: 'inquiries', title: 'Inquiries to follow up', hint: 'No contact in the last 3 days', stage: 'Inquiry', rows: [] },
      { key: 'defer', title: 'Deferred students to check', hint: 'Deferred and not contacted for 14 days', stage: 'Defer', rows: [] },
      { key: 'apply', title: 'Applications to submit', hint: 'At Application Stage, not submitted yet', stage: 'Application Stage', rows: [] },
      { key: 'noUni', title: 'Applications without a university or course', hint: 'At Application Stage: choose where to apply first', stage: 'Application Stage', rows: [] },
      { key: 'noOffer', title: 'Applications waiting for an offer', hint: 'Submitted over 10 days ago, no offer yet: chase the university', stage: '', rows: [] },
      { key: 'mock', title: 'Mock interviews to schedule', hint: 'At Mock Stage with no mock date', stage: 'Mock Stage', rows: [] },
      { key: 'mockFeedback', title: 'Mock feedback to write', hint: 'The interview date has passed and no feedback is recorded', stage: '', rows: [] },
      { key: 'preCas', title: 'Pre-CAS interview to record', hint: 'All mock feedback is in, the Pre-CAS result is not', stage: '', rows: [] },
      { key: 'offers', title: 'Offers waiting for the deposit', hint: 'Offer received, payment not made', stage: '', rows: [] },
      { key: 'cas', title: 'CAS received, visa not lodged', hint: 'The next step is the visa application', stage: '', rows: [] },
    ];
    const by = Object.fromEntries(sections.map((x) => [x.key, x]));
    const totals = { active: 0, applied: 0, visas: 0, atMock: 0, deferred: 0, inquiries: 0 };
    const dateOf = (v) => isoDate(v);
    for (const { sheet, row } of visibleStudents(user)) {
      const stage = text(row[STATUS]);
      const card = all[row._id] || { notes: [], messages: [] };
      const last = [...(card.notes || []).map((n) => n.at), ...(card.messages || []).map((m) => m.at)].filter(Boolean).sort().pop();
      const lastDay = last ? dayNo(localDate(new Date(last))) : null;
      const add = (key, detail, waited) => by[key].rows.push({ id: row._id, name: nameOf(row), stage, intake: sheet.name, detail, waited });
      if (stage === 'Defer') {
        totals.deferred += 1;
        if (lastDay === null || now - lastDay >= 14) add('defer', lastDay === null ? 'No contact recorded' : `Last contact ${now - lastDay} days ago`, lastDay === null ? 999 : now - lastDay);
        continue;
      }
      if (['Withdrawn', 'Hold', 'Visa Rejected'].includes(stage)) continue;
      const visa = stage === 'Visa Issued' || text(row['VISA RECEIVED DATE']);
      if (visa) { totals.visas += 1; continue; }
      totals.active += 1;
      if (text(row['APPLICATION SUBMISSION DATE'])) totals.applied += 1;
      const created = dateOf(row['APPLICATION SUBMISSION DATE']);
      if (stage === 'Inquiry') totals.inquiries += 1;
      if (stage === 'Mock Stage') totals.atMock += 1;
      if (stage === 'Inquiry' && (lastDay === null || now - lastDay >= 3)) add('inquiries', lastDay === null ? 'No contact recorded' : `Last contact ${now - lastDay} days ago`, lastDay === null ? 999 : now - lastDay);
      if (stage === 'Application Stage' && !created) add('apply', text(row['UNIVERSITY NAME']) || 'No university chosen yet', 0);
      if (stage === 'Application Stage' && (!text(row['UNIVERSITY NAME']) || !text(row['COURSE NAME']))) add('noUni', !text(row['UNIVERSITY NAME']) ? 'No university chosen' : 'No course chosen', 0);
      if (created && !dateOf(row['OFFER RECEIVED DATE']) && now - dayNo(created) > 10 && ['Application Stage', 'Mock Stage'].includes(stage)) add('noOffer', `Submitted ${now - dayNo(created)} days ago`, now - dayNo(created));
      if (stage === 'Mock Stage' && ![1, 2, 3, 4].some((n) => text(row[`MOCK SCHEDULE ${n}`]))) add('mock', text(row['UNIVERSITY NAME']) || 'No university', 0);
      for (const n of [1, 2, 3, 4]) {
        const d = dateOf(row[`MOCK SCHEDULE ${n}`]);
        if (d && dayNo(d) <= now && !text(row[`FEEDBACK ${n}`])) { add('mockFeedback', `Mock ${n} was ${now - dayNo(d)} days ago`, now - dayNo(d)); break; }
      }
      if (stage === 'Mock Stage' && [1, 2, 3, 4].some((n) => text(row[`FEEDBACK ${n}`])) && !text(row['PRE CAS INTERVIEW'])) add('preCas', 'Feedback is in', 0);
      const offer = dateOf(row['OFFER RECEIVED DATE']);
      if (offer && !text(row['PAYMENT DATE'])) add('offers', `Offer received ${Math.max(0, now - dayNo(offer))} days ago`, Math.max(0, now - dayNo(offer)));
      const cas = dateOf(row['CAS RECEIVED DATE']);
      if (cas && !text(row['VISA LODGE DATE'])) add('cas', `CAS received ${Math.max(0, now - dayNo(cas))} days ago`, Math.max(0, now - dayNo(cas)));
    }
    const counts = { toSubmit: by.apply.rows.length, waitingOffer: by.noOffer.rows.length, toSchedule: by.mock.rows.length, feedbackMissing: by.mockFeedback.rows.length, toFollow: by.inquiries.rows.length };
    const value = { ...totals, ...counts };
    return {
      today, name: user.name, totals, kind, title: space.title, tagline: space.tagline,
      tiles: space.tiles.map((k) => ({ key: k, label: TILE_LABEL[k], value: value[k] })),
      sections: space.sections.map((k) => by[k]).map((x) => ({ key: x.key, title: x.title, hint: x.hint, stage: x.stage, count: x.rows.length, students: x.rows.sort((a, b) => b.waited - a.waited).slice(0, 6) })),
    };
  }

  // ---- My dashboard: each team's own page of how its work is going (Admin and the Manager have the full Dashboard) ----
  // The figures of the Application, Mock and Follow-up teams count the whole current intake (a student the team helped moves on to
  // the next stage and leaves its sheet, and the team should still see that it went on); names are only ever those of the students
  // the account sees on its sheet. A branch counts its own students.
  // "This week" is the last 7 days, compared with the 7 days before, so a team sees its own rhythm without any ranking of people.
  const MY_DASH = {
    application: {
      title: 'Application Team', lead: 'How the applications are moving.',
      kpis: ['toSubmit', 'submitted', 'waitingOffer', 'offers'],
      week: [['APPLICATION SUBMISSION DATE', 'Applications submitted'], ['OFFER RECEIVED DATE', 'Offers received']],
      stages: ['Application Stage', 'Mock Stage', 'Payment Stage', 'CAS Stage', 'CAS Issued', 'Visa Lodge', 'Visa Issued'],
    },
    mock: {
      title: 'Mock Team', lead: 'Mock interviews and students getting ready for the Pre-CAS interview.',
      kpis: ['atMock', 'toSchedule', 'feedbackMissing', 'mocksWeek'],
      week: [['MOCK', 'Mock interviews held'], ['PAYMENT DATE', 'Moved on to payment']],
      stages: ['Mock Stage', 'Payment Stage', 'CAS Stage', 'CAS Issued', 'Visa Lodge', 'Visa Issued'],
    },
    followup: {
      title: 'Follow-up Team', lead: 'Inquiries kept warm and deferred students brought back.',
      kpis: ['inquiries', 'toFollow', 'contactedWeek', 'deferred'],
      week: [['CONTACT', 'Students contacted'], ['INQUIRY', 'New inquiries']],
      stages: ['Inquiry', 'Defer', 'Application Stage', 'Withdrawn'],
    },
    branch: {
      title: 'Your branch', lead: 'Your branch students, from the first inquiry to the visa.',
      kpis: ['active', 'submitted', 'offers', 'visas'],
      week: [['INQUIRY', 'New inquiries'], ['APPLICATION SUBMISSION DATE', 'Applications submitted'], ['OFFER RECEIVED DATE', 'Offers received'], ['VISA RECEIVED DATE', 'Visas received']],
      stages: Teams.ALL_STATUSES,
    },
    team: {
      title: 'Your teams', lead: 'The work of all your teams together.',
      kpis: ['active', 'submitted', 'offers', 'visas'],
      week: [['APPLICATION SUBMISSION DATE', 'Applications submitted'], ['OFFER RECEIVED DATE', 'Offers received'], ['CONTACT', 'Students contacted']],
      stages: Teams.ALL_STATUSES,
    },
  };
  const MY_KPI = {
    toSubmit: ['Applications to submit', 'At Application Stage, not submitted yet'], submitted: ['Applications submitted', 'In this intake'],
    waitingOffer: ['Waiting for an offer', 'Submitted over 10 days ago'], offers: ['Offers received', 'In this intake'],
    atMock: ['At Mock Stage', 'Students with you now'], toSchedule: ['Mocks to schedule', 'No mock date yet'], feedbackMissing: ['Feedback to write', 'The mock date has passed'],
    mocksWeek: ['Mocks this week', 'Held in the last 7 days'], inquiries: ['Open inquiries', 'At Inquiry now'], toFollow: ['To follow up', 'No contact for 3 days'],
    contactedWeek: ['Contacted this week', 'A note or a message in 7 days'], deferred: ['Deferred students', 'To bring back'],
    active: ['Students in progress', 'Not left, no visa yet'], visas: ['Visas issued', 'In this intake'],
  };
  function myDashboard(user) {
    const kind = Teams.kindOf(user);
    const plan = MY_DASH[kind] || MY_DASH.team;
    const today = cards.today();
    const dayNo = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
    const now = dayNo(today);
    const all = cards.all();
    const t = todayFor(user);
    const counts = Object.fromEntries(t.sections.map((x) => [x.key, x.count]));
    const students = visibleStudents(user);
    const v = { ...t.totals, toSubmit: counts.apply || 0, waitingOffer: counts.noOffer || 0, toSchedule: counts.mock || 0, feedbackMissing: counts.mockFeedback || 0, toFollow: counts.inquiries || 0, submitted: 0, offers: 0, visas: 0, mocksWeek: 0, contactedWeek: 0 };
    // Per day of the last 14: how many of each "done" thing happened.
    const weekNow = {}; const weekBefore = {};
    const bump = (key, iso) => {
      if (!iso) return;
      const ago = now - dayNo(iso);
      if (ago >= 0 && ago < 7) weekNow[key] = (weekNow[key] || 0) + 1;
      else if (ago >= 7 && ago < 14) weekBefore[key] = (weekBefore[key] || 0) + 1;
    };
    const stageCount = new Map(plan.stages.map((st) => [st, 0]));
    const wins = []; const upcoming = [];
    const seen = new Set(students.map((x) => x.row._id));
    const intakeSheet = currentIntake();
    const scope = ['application', 'mock', 'followup'].includes(kind) && intakeSheet
      ? intakeSheet.rows.filter((r) => r && r._id && isStudent(r)).map((row) => ({ sheet: intakeSheet, row })) : students;
    for (const { sheet, row } of scope) {
      const mineToName = seen.has(row._id);
      const stage = text(row[STATUS]);
      const card = all[row._id] || { notes: [], messages: [], profile: {} };
      if (stageCount.has(stage)) stageCount.set(stage, stageCount.get(stage) + 1);
      if (isoDate(row['APPLICATION SUBMISSION DATE'])) v.submitted += 1;
      if (isoDate(row['OFFER RECEIVED DATE'])) v.offers += 1;
      if (stage === 'Visa Issued' || isoDate(row['VISA RECEIVED DATE'])) v.visas += 1;
      ['APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE', 'PAYMENT DATE', 'VISA RECEIVED DATE', 'CAS RECEIVED DATE'].forEach((c) => bump(c, isoDate(row[c])));
      [1, 2, 3, 4].forEach((n) => {
        const d = isoDate(row[`MOCK SCHEDULE ${n}`]);
        if (!d) return;
        bump('MOCK', d);
        if (now - dayNo(d) >= 0 && now - dayNo(d) < 7) v.mocksWeek += 1;
        const ahead = dayNo(d) - now;
        if (mineToName && ahead >= 0 && ahead <= 7 && !text(row[`FEEDBACK ${n}`])) upcoming.push({ id: row._id, name: nameOf(row), date: d, what: `Mock interview ${n}`, stage });
      });
      const lt = isoDate(row['LANGUAGE TEST DATE']);
      if (mineToName && lt && dayNo(lt) - now >= 0 && dayNo(lt) - now <= 7) upcoming.push({ id: row._id, name: nameOf(row), date: lt, what: 'English test', stage });
      bump('INQUIRY', isoDate(card.profile && card.profile.inquiryDate));
      const touched = [...(card.notes || []).map((n) => n.at), ...(card.messages || []).map((m) => m.at)].filter(Boolean).map((at) => localDate(new Date(at)));
      const lastTouch = touched.sort().pop();
      bump('CONTACT', lastTouch);
      if (lastTouch && now - dayNo(lastTouch) < 7) v.contactedWeek += 1;
      // The good news of the last 30 days, newest first.
      [['VISA RECEIVED DATE', 'Visa received'], ['CAS RECEIVED DATE', 'CAS received'], ['OFFER RECEIVED DATE', 'Offer received'], ['PAYMENT DATE', 'Deposit paid']].some(([c, what]) => {
        const d = isoDate(row[c]);
        if (mineToName && d && now - dayNo(d) >= 0 && now - dayNo(d) < 30) { wins.push({ id: row._id, name: nameOf(row), date: d, what, intake: sheet.name }); return true; }
        return false;
      });
    }
    // The tasks of this person's teams.
    const mine = teamsOf(user);
    let open = 0; let late = 0; let doneWeek = 0;
    for (const { row } of rowIndex().values()) {
      const c = all[row._id];
      (c && c.tasks ? c.tasks : []).forEach((x) => {
        if (!mine.includes(x.team)) return;
        if (!x.done) { open += 1; if (x.due && x.due < today) late += 1; } else if (x.doneAt && now - dayNo(localDate(new Date(x.doneAt))) < 7) doneWeek += 1;
      });
    }
    const intake = intakeSheet;
    return {
      kind, title: plan.title, lead: plan.lead, name: user.name, today, intake: intake ? intake.name : '',
      kpis: plan.kpis.map((k) => ({ key: k, label: MY_KPI[k][0], note: MY_KPI[k][1], value: v[k] || 0 })),
      week: plan.week.map(([key, label]) => ({ key, label, now: weekNow[key] || 0, before: weekBefore[key] || 0 })),
      stages: [...stageCount.entries()].map(([stage, count]) => ({ stage, count })),
      stagesNote: scope === students ? 'Your students, by stage.' : 'Everyone in this intake, by stage (the numbers only).',
      tasks: { open, late, doneWeek },
      upcoming: upcoming.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8),
      wins: wins.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8),
    };
  }

  // ---- events and marketing: what was run to find students, and what each brought ----
  // The tag on a student ("where exactly") names the event or the marketing; it matches an activity by its name (with or without the date).
  const eventOf = (detail) => {
    const d = text(detail).toLowerCase();
    if (!d) return null;
    return eventFor(planning.all().events, detail);
  };
  function activities(user) {
    const wb = getWorkbook();
    const plan = planning.all();
    const all = cards.all();
    const list = plan.events.map((e) => ({ ...e, leads: 0, applied: 0, visas: 0, students: [] }));
    const byName = (detail) => eventFor(list, detail);
    let unlinkedSocial = 0; // students from social media not tagged with any campaign: in no cost per student
    if (wb) wb.sheets.forEach((sheet) => sheet.rows.forEach((row) => {
      if (!isStudent(row)) return;
      const card = all[row._id];
      const e = card && byName(card.profile.sourceDetail);
      if (!e) { if (text(row['STUDENT SOURCE']) === 'Social Media') unlinkedSocial += 1; return; }
      e.leads += 1;
      const stage = text(row[STATUS]);
      if (!['Inquiry', 'Defer', 'Hold', 'Withdrawn'].includes(stage) || text(row['APPLICATION SUBMISSION DATE'])) e.applied += 1;
      if (stage === 'Visa Issued' || text(row['VISA RECEIVED DATE'])) e.visas += 1;
      if (e.students.length < 60) e.students.push({ id: row._id, name: nameOf(row), stage, intake: sheet.name });
    }));
    const day = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000);
    const shaped = list.sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({
      id: e.id, name: e.name, kind: e.kind || 'Event', type: e.type, channel: channelOf(e), place: e.place, date: e.date, endDate: e.endDate || '',
      days: e.date ? (e.endDate ? day(e.endDate) - day(e.date) + 1 : 1) : 0, note: e.note, cost: e.cost, leads: e.leads, applied: e.applied, visas: e.visas,
      costPerLead: e.cost > 0 && e.leads > 0 ? Math.round(e.cost / e.leads) : null, costPerVisa: e.cost > 0 && e.visas > 0 ? Math.round(e.cost / e.visas) : null,
      students: e.students, registered: e.registered, attended: e.attended,
    }));
    return { list: shaped, unlinkedSocial };
  }

  // ---- one student's card ----
  async function handleCard(req, res, urlPath) {
    const m = /^\/api\/cards\/([\w-]{1,64})(?:\/(profile|notes|options|messages|source|sheet|tasks)(?:\/([a-f0-9]{12}|preview|send))?(\/delete)?)?$/.exec(urlPath);
    if (!m) return false;
    const [, rowId, part, sub, del] = m;
    const found = rowIndex().get(rowId);
    if (!canSee(req.user, found)) { sendJSON(res, 404, { error: 'No such student, or the student is not in your list.' }); return true; }
    const editable = canChange(req.user, found);
    const card = cards.get(rowId);

    if (req.method === 'GET') {
      if (!part) {
        sendJSON(res, 200, {
          student: { ...brief(found.sheet, found.row), color: found.row._color || '', remarks: text(found.row.REMARKS), columns: found.sheet.columns, row: Object.fromEntries(found.sheet.columns.map((c) => [c, found.row[c] ?? ''])) },
          card,
          can: { edit: editable, removeAnyNote: Teams.isAdmin(req.user), source: editable && Teams.canEdit(req.user, 'STUDENT SOURCE', found.row), assign: assignTeamsFor(req.user).length > 0, removeAnyTask: canAssign(req.user), myTeams: teamsOf(req.user) },
          taskTeams: TASK_TEAMS(),
          assignTeams: assignTeamsFor(req.user),
          me: { name: req.user.name },
          event: (() => { const e = eventOf(card.profile.sourceDetail); return e ? { name: e.name, kind: e.kind || 'Event', type: e.type, place: e.place, date: e.date, endDate: e.endDate } : null; })(),
          mail: mailInfo(req.user),
          apply: partnerRouteFor(found.row['UNIVERSITY PARTNER'], editable) || applyRouteFor(found.row['UNIVERSITY NAME'], editable),
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
    // Tasks: Admin and the Manager give one to a team (and remove it); the team (or Admin and the Manager) marks it complete or not.
    if (part === 'tasks') {
      const body = await bodyOf(req, res);
      if (!body) return true;
      const who2 = nameOf(found.row) || 'a student';
      let out;
      if (!sub) {
        const allowedTeams = assignTeamsFor(req.user).map((t) => t.id);
        if (!allowedTeams.length) { sendJSON(res, 403, { error: 'Only Admin, the Manager and the branches give tasks.' }); return true; }
        if (!allowedTeams.includes(text(body.team))) { sendJSON(res, 400, { error: 'Choose the team.' }); return true; }
        out = cards.addTask(rowId, body, by(req));
        if (!out.error) note(req, [`${who2}: gave ${teamLabel(out.task.team)} a task: ${out.task.text.slice(0, 120)}`], 'Gave a task');
      } else {
        const task = (card.tasks || []).find((t) => t.id === sub);
        if (!task) { sendJSON(res, 404, { error: 'No such task.' }); return true; }
        if (del) {
          if (!canAssign(req.user) && !(isBranchUser(req.user) && task.by === by(req))) { sendJSON(res, 403, { error: 'Only Admin, the Manager or whoever gave the task removes it.' }); return true; }
          out = cards.removeTask(rowId, sub, by(req));
          if (!out.error) note(req, [`${who2}: removed the task for ${teamLabel(task.team)}`], 'Removed a task');
        } else {
          if (!canAssign(req.user) && !teamsOf(req.user).includes(task.team)) { sendJSON(res, 403, { error: 'This task is for another team.' }); return true; }
          out = cards.setTask(rowId, sub, Boolean(body.done), by(req));
          if (!out.error) note(req, [`${who2}: marked the task for ${teamLabel(task.team)} as ${body.done ? 'complete' : 'not complete'}`], 'Task');
        }
      }
      if (out.error) sendJSON(res, 400, { error: out.error }); else sendJSON(res, 200, { ok: true, card: out.card });
      return true;
    }
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
    } else if (part === 'notes' && sub && del) {
      out = cards.removeNote(rowId, sub, by(req), Teams.isAdmin(req.user));
      if (!out.error) note(req, [`${who}: removed a note`]);
    } else if (part === 'notes' && !sub) {
      out = cards.addNote(rowId, body, by(req));
      if (!out.error) note(req, [`${who}: added a note`]);
    } else if (part === 'sheet') {
      const changes = {};
      for (const [col, clean] of Object.entries(CARD_EDITABLE)) {
        if (body.fields && Object.prototype.hasOwnProperty.call(body.fields, col)) {
          const v = clean(body.fields[col]);
          if (v === null) { sendJSON(res, 400, { error: col === 'CONTACT NUMBER' ? 'That phone number does not look right. Use digits, for example 9800000001.' : `${col} is not a real date.` }); return true; }
          if (v !== text(found.row[col])) changes[col] = v;
        }
      }
      if ((changes['FIRST NAME'] === '' && !text(found.row['LAST NAME']) && !('LAST NAME' in changes)) || ('FIRST NAME' in changes && changes['FIRST NAME'] === '' && 'LAST NAME' in changes && changes['LAST NAME'] === '')) { sendJSON(res, 400, { error: 'A student needs a name.' }); return true; }
      const sub = 'APPLICATION SUBMISSION DATE' in changes ? changes['APPLICATION SUBMISSION DATE'] : realDay(found.row['APPLICATION SUBMISSION DATE']) || '';
      const off = 'OFFER RECEIVED DATE' in changes ? changes['OFFER RECEIVED DATE'] : realDay(found.row['OFFER RECEIVED DATE']) || '';
      if (sub && off && off < sub && ('APPLICATION SUBMISSION DATE' in changes || 'OFFER RECEIVED DATE' in changes)) { sendJSON(res, 400, { error: 'The offer cannot be received before the application was submitted.' }); return true; }
      if (changes.EMAIL && !mailer.isAddress(changes.EMAIL)) { sendJSON(res, 400, { error: 'That email address does not look right.' }); return true; }
      if (Object.keys(changes).length) {
        const done = setColumns(req, found, changes);
        if (done.error) { sendJSON(res, done.status, { error: done.error }); return true; }
      }
      sendJSON(res, 200, { ok: true, changed: Object.keys(changes) });
      return true;
    } else if (part === 'source') {
      const done = setSource(req, found, text(body.source).slice(0, 60));
      if (done.error) { sendJSON(res, done.status, { error: done.error }); return true; }
      sendJSON(res, 200, { ok: true, source: done.source, card });
      return true;
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
  // Adds one student (the sheet row and the card) with the rules of the sheet. Returns { status, json }.
  function addStudent(req, body) {
    const wb = getWorkbook();
    if (!wb) { return { status: 500, json: { error: 'Could not read the data file' } }; }
    if (Teams.isReadOnly(req.user)) { return { status: 403, json: { error: 'Your account can only view students.' } }; }
    const given = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const fields = {};
    NEW_STUDENT_COLUMNS.forEach((col) => {
      const v = typeof given[col] === 'string' ? given[col].replace(/\s+/g, ' ').trim().slice(0, col === 'REMARKS' ? MAX_CELL_CHARS : 300) : '';
      if (v) fields[col] = col === 'EMAIL' ? v.toLowerCase() : v;
    });
    if (!fields['FIRST NAME'] && !fields['LAST NAME']) { return { status: 400, json: { error: "Please enter the student's name." } }; }
    if (fields.EMAIL && !mailer.isAddress(fields.EMAIL)) { return { status: 400, json: { error: 'That email address does not look right.' } }; }
    if (fields['CONTACT NUMBER'] && !phoneOk(fields['CONTACT NUMBER'])) { return { status: 400, json: { error: 'That phone number does not look right. Use digits, for example 9800000001 or +977 9800000001.' } }; }
    if (!body.allowDuplicate) {
      const dup = existingStudent(fields.EMAIL, fields['CONTACT NUMBER']);
      if (dup) return { status: 409, json: { error: `${(Teams.isAdmin(req.user) && [dup['FIRST NAME'], dup['LAST NAME']].filter(Boolean).join(' ')) || 'A student'} is already on the sheet with this email or phone number, so nobody was added.` } };
    }
    const rowId = 'row-' + Date.now().toString(36) + require('crypto').randomBytes(4).toString('hex');
    let sheet;
    if (Teams.isAdmin(req.user)) {
      // The sheet the person is on: the student goes into that intake.
      sheet = wb.sheets.find((s) => s.id === body.sheetId) || currentIntake() || wb.sheets[0];
      const stage = Teams.ALL_STATUSES.includes(text(body.stage)) ? text(body.stage) : 'Inquiry';
      const row = { _id: rowId };
      sheet.columns.forEach((c) => { row[c] = ''; });
      Object.keys(fields).forEach((c) => { if (sheet.columns.includes(c)) row[c] = fields[c]; });
      if (sheet.columns.includes(STATUS)) row[STATUS] = stage;
      const next = { ...wb, revision: wb.revision + 1, sheets: wb.sheets.map((s) => (s.id === sheet.id ? { ...s, rows: [...s.rows, row] } : s)) };
      try { writeWorkbook(next); } catch (e) { console.error('[new student]', e); return { status: 500, json: { error: 'save failed' } }; }
      recordChanges(req, wb, next);
    } else {
      const depts = Teams.addableDepartments(req.user);
      const dept = depts.includes(body.dept) ? body.dept : (depts.length === 1 ? depts[0] : null);
      if (!dept) { return { status: 400, json: { error: 'Choose which team the new student is for.' } }; }
      const view = Teams.viewFor(req.user, wb);
      sheet = currentIntake();
      const mine = view.sheets.find((s) => sheet && s.id === sheet.id);
      if (!mine) { return { status: 409, json: { error: 'There is no current intake to add the student to.' } }; }
      // Only what this team may fill in on a student it adds; anything else typed in the form is left out, not refused.
      const stub = { _id: rowId, [STATUS]: Teams.DEPARTMENTS[dept].start, _addedByTeam: dept };
      const row = { ...stub };
      Object.keys(fields).forEach((c) => { if (mine.columns.includes(c) && Teams.canEdit(req.user, c, stub)) row[c] = fields[c]; });
      const out = teamSave(req, { baseRevision: wb.revision, sheets: view.sheets.map((s) => (s.id === mine.id ? { ...s, rows: [...s.rows, row] } : s)) });
      if (out.status !== 200) { return { status: out.status, json: out.body.error === 'conflict' ? { error: 'The sheet changed at the same moment. Please try again.' } : out.body }; }
    }
    // The card: where the student came from and the rest of what the form asked.
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : {};
    // The first inquiry day is the day the student is added.
    const saved = cards.setProfile(rowId, { sourceDetail: profile.sourceDetail, sourceRemarks: profile.sourceRemarks || '', inquiryDate: cards.today() }, by(req));
    if (!saved.error && text(body.note)) cards.addNote(rowId, { text: body.note, kind: 'note' }, by(req));
    return { status: 200, json: { ok: true, id: rowId, sheetId: sheet.id, revision: getWorkbook().revision } };
  }

  async function handleNewStudent(req, res) {
    const body = await bodyOf(req, res);
    if (!body) return true;
    const out = addStudent(req, body);
    sendJSON(res, out.status, out.json);
    return true;
  }

  // Many students at once, all with the same stage, source and event or marketing tag: one line each (name, email, phone).
  async function handleBulkStudents(req, res) {
    if (Teams.isReadOnly(req.user)) { sendJSON(res, 403, { error: 'Your account can only view students.' }); return true; }
    const body = await bodyOf(req, res, 1024 * 1024);
    if (!body) return true;
    const lines = (Array.isArray(body.rows) ? body.rows : []).filter((r) => r && typeof r === 'object').slice(0, 200);
    if (!lines.length) { sendJSON(res, 400, { error: 'Add at least one student.' }); return true; }
    const results = [];
    const existing = new Set();
    for (const { row } of visibleStudents(req.user)) {
      const em = text(row.EMAIL).toLowerCase(); const ph = phoneKey(row['CONTACT NUMBER']);
      if (em) existing.add('e:' + em);
      if (ph) existing.add('p:' + ph);
    }
    for (const r of lines) {
      const em = text(r.email).toLowerCase(); const ph = phoneKey(r.phone);
      if (existingStudent(r.email, r.phone) || (em && existing.has('e:' + em)) || (ph && existing.has('p:' + ph))) { results.push({ ok: false, name: [r.first, r.last].filter(Boolean).join(' '), error: 'Already on the sheet (same email or phone), not added again.' }); continue; }
      if (em) existing.add('e:' + em);
      if (ph) existing.add('p:' + ph);
      const fields = { 'FIRST NAME': text(r.first), 'LAST NAME': text(r.last), EMAIL: text(r.email), 'CONTACT NUMBER': text(r.phone), 'STUDENT SOURCE': text(body.source) };
      const out = addStudent(req, { fields, profile: { sourceDetail: text(body.sourceDetail), sourceRemarks: text(body.sourceRemarks) }, stage: body.stage, sheetId: body.sheetId, dept: body.dept });
      results.push(out.status === 200 ? { ok: true, id: out.json.id, name: [r.first, r.last].filter(Boolean).join(' ') } : { ok: false, name: [r.first, r.last].filter(Boolean).join(' '), error: out.json.error || 'Could not add.' });
    }
    note(req, [`Added ${results.filter((x) => x.ok).length} students at once${text(body.sourceDetail) ? ` (${text(body.sourceDetail)})` : ''}`], 'Added students');
    sendJSON(res, 200, { results });
    return true;
  }

  // ---- the students of an event or a campaign, uploaded by Admin from its list (Excel or CSV) ----
  // The list Admin uploads is the truth of who came from it, whatever was picked when the student was added. Each line is:
  //   new: added to the chosen intake at Inquiry, Student Source "Events", tagged with the event;
  //   link: already on the sheet (same phone or email, any intake) and in no event yet: tagged with this event, the earlier source is
  //         kept in the remarks and a note says so on the card (the team may have added the student before the campaign was entered);
  //   already: already tagged with this event (uploading the same list twice changes nothing);
  //   other: already tagged with another event: left as it is and listed, so Admin decides on the card (never moved quietly);
  //   problem: no name, or neither a phone nor an email (a student who cannot be matched later is not added).
  // { preview: true } only sorts the lines; without it the new and link lines are carried out.
  const digitsOf = (v) => text(v).replace(/\D/g, '');
  function eventImport(req, ev, body) {
    const plan = planning.all();
    const label = eventLabel(ev.name, ev.date);
    const all = cards.all();
    const byPhone = new Map(); const byEmail = new Map();
    for (const { sheet, row } of rowIndex().values()) {
      if (!isStudent(row)) continue;
      const d = digitsOf(row['CONTACT NUMBER']); const em = text(row.EMAIL).toLowerCase();
      if (d.length >= 7 && !byPhone.has(d.slice(-10))) byPhone.set(d.slice(-10), { sheet, row });
      if (em && !byEmail.has(em)) byEmail.set(em, { sheet, row });
    }
    const seen = new Set();
    const out = [];
    const lines = (Array.isArray(body.rows) ? body.rows : []).filter((r) => r && typeof r === 'object').slice(0, 1000);
    for (const r of lines) {
      const first = text(r.first).slice(0, 80); const last = text(r.last).slice(0, 80);
      const email = text(r.email).toLowerCase().slice(0, 120); const phone = text(r.phone).slice(0, 40);
      const name = [first, last].filter(Boolean).join(' ');
      const d = digitsOf(phone).slice(-10);
      const line = { name, first, last, email, phone };
      if (!name) { out.push({ ...line, action: 'problem', note: 'No name' }); continue; }
      if (d.length < 7 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.push({ ...line, action: 'problem', note: 'No phone or email to match the student by' }); continue; }
      const key = d.length >= 7 ? 'p' + d : 'e' + email;
      if (seen.has(key) || (email && seen.has('e' + email))) { out.push({ ...line, action: 'problem', note: 'Same phone or email as an earlier line' }); continue; }
      seen.add(key); if (email) seen.add('e' + email);
      const found = (d.length >= 7 && byPhone.get(d)) || (email && byEmail.get(email)) || null;
      if (!found) { out.push({ ...line, action: 'new', note: 'Will be added at Inquiry' }); continue; }
      const card = all[found.row._id];
      const tagged = card && eventFor(plan.events, card.profile.sourceDetail);
      const at = { id: found.row._id, intake: found.sheet.name, stage: text(found.row[STATUS]), name: nameOf(found.row) };
      if (tagged && tagged.id === ev.id) out.push({ ...line, ...at, action: 'already', note: `Already linked to this event (${at.intake}, ${at.stage || 'no stage'})` });
      else if (tagged) out.push({ ...line, ...at, action: 'other', note: `Already linked to ${tagged.name}. Left as is; change it on the student card if needed.` });
      else {
        const before = [text(found.row['STUDENT SOURCE']), card && card.profile.sourceDetail].filter(Boolean).join(': ');
        out.push({ ...line, ...at, before, action: 'link', note: `Already on the sheet (${at.intake}, ${at.stage || 'no stage'})${before ? `, source was "${before}"` : ''}: will be linked to this event` });
      }
    }
    const count = (a) => out.filter((x) => x.action === a).length;
    if (body.preview) return { status: 200, json: { preview: true, label, rows: out, counts: { new: count('new'), link: count('link'), already: count('already'), other: count('other'), problem: count('problem') } } };
    // Carry out: add the new ones, tag the ones already on the sheet.
    let added = 0; let linked = 0; const failed = [];
    for (const x of out) {
      if (x.action === 'new') {
        const r = addStudent(req, { fields: { 'FIRST NAME': x.first, 'LAST NAME': x.last, EMAIL: x.email, 'CONTACT NUMBER': x.phone, 'STUDENT SOURCE': 'Events' }, profile: { sourceDetail: label }, stage: 'Inquiry', sheetId: body.sheetId, note: `Enquiry from ${ev.name}, from its enquiry list.` });
        if (r.status === 200) { added += 1; x.id = r.json.id; } else failed.push(`${x.name}: ${r.json.error || 'could not be added'}`);
      } else if (x.action === 'link') {
        const found = rowIndex().get(x.id);
        const src = setColumns(req, found, { 'STUDENT SOURCE': 'Events' });
        if (src.error) { failed.push(`${x.name}: ${src.error}`); continue; }
        const card = cards.get(x.id);
        cards.setProfile(x.id, { sourceDetail: label, sourceRemarks: [card.profile.sourceRemarks, x.before ? `Previous source: ${x.before}` : ''].filter(Boolean).join(' | ').slice(0, 160) }, by(req));
        cards.addNote(x.id, { kind: 'note', text: `Linked to ${ev.name} from its enquiry list.${x.before ? ` Previous source: ${x.before}.` : ''}` }, by(req));
        linked += 1;
      }
    }
    note(req, [`${ev.name}: uploaded its list (${added} added at Inquiry, ${linked} already on the sheet tagged with it, ${count('already')} already tagged, ${count('other')} in another event left as they were, ${count('problem')} lines skipped)`], 'Uploaded event students');
    return { status: 200, json: { done: true, added, linked, failed, rows: out, counts: { new: count('new'), link: count('link'), already: count('already'), other: count('other'), problem: count('problem') } } };
  }

  // Every student of one event, for its page on Events and marketing: who, the phone, the stage, the intake and the latest note, so the
  // team can work through the list (open the card, call, write the note) without looking through the intakes one by one.
  function eventStudents(user, ev) {
    const plan = planning.all();
    const all = cards.all();
    const out = [];
    for (const { sheet, row } of visibleStudents(user)) {
      const card = all[row._id];
      const e = card && eventFor(plan.events, card.profile.sourceDetail);
      if (!e || e.id !== ev.id) continue;
      const last = card.notes && card.notes.length ? card.notes[card.notes.length - 1] : null;
      out.push({ id: row._id, name: nameOf(row), phone: text(row['CONTACT NUMBER']), email: text(row.EMAIL), stage: text(row[STATUS]), intake: sheet.name, visa: text(row[STATUS]) === 'Visa Issued' || Boolean(text(row['VISA RECEIVED DATE'])), lastNote: last ? { at: last.at, by: last.by, text: String(last.text).slice(0, 160) } : null });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Which event or campaign each student came from, for the "Came from" filter of All Students: only the students the account
  // sees, and only the event's name and day (no cost).
  function eventTags(user) {
    const plan = planning.all();
    const all = cards.all();
    const rows = {};
    const used = new Map();
    for (const { row } of visibleStudents(user)) {
      const card = all[row._id];
      const e = card && eventFor(plan.events, card.profile.sourceDetail);
      if (!e) continue;
      const label = eventLabel(e.name, e.date);
      rows[row._id] = label;
      used.set(label, { label, name: e.name, date: e.date, count: (used.get(label) || { count: 0 }).count + 1 });
    }
    return { rows, events: [...used.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))) };
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

  // ---- the course finder over the Fact File ----
  let courseCache = { facts: null, links: null, index: [] };
  function courseIndex() {
    const all = facts.all();
    const links = courseLinks.all(all);
    if (courseCache.facts !== all || courseCache.links !== links) courseCache = { facts: all, links, index: buildIndex(all, links) };
    return courseCache.index;
  }

  // ---- B2B partners and agents (Admin changes them, others look as partner-access.js allows): the list, one partner, its files ----
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
  // What each partner has brought: the students of a B2B partner (Student Source Agent, and the partner named on the card) and the
  // students applied for through a B2B platform (the sheet's University Partner column). Matched by name, ignoring capitals.
  // What each partner has brought, by intake: visas first (that is what pays), and the students. B2B partners are the businesses you send
  // applications to (the sheet's University Partner column); Agents are the ones that send students (Student Source "Agent", and the agent named
  // on the student card). Matched by name, ignoring capitals.
  function partnerPerformance(kind) {
    const out = {};
    const wb = getWorkbook();
    if (!wb) return out;
    const all = cards.all();
    const bump = (name, row, sheetName) => {
      const key = text(name).toLowerCase();
      if (!key) return;
      const e = out[key] || (out[key] = { students: 0, visas: 0, intakes: {} });
      const it = e.intakes[sheetName] || (e.intakes[sheetName] = { students: 0, visas: 0 });
      e.students += 1; it.students += 1;
      if (text(row[STATUS]) === 'Visa Issued' || text(row['VISA RECEIVED DATE'])) { e.visas += 1; it.visas += 1; }
    };
    wb.sheets.forEach((sheet) => sheet.rows.forEach((row) => {
      if (!isStudent(row)) return;
      const card = all[row._id];
      if (kind === 'agents') { const rp = text(row['RECEIVING PARTNER']); if (rp && !isOffice(rp)) bump(rp, row, sheet.name); else if (text(row['STUDENT SOURCE']) === 'Agent' && card && card.profile.sourceDetail) bump(card.profile.sourceDetail, row, sheet.name); } else if (text(row['UNIVERSITY PARTNER'])) bump(row['UNIVERSITY PARTNER'], row, sheet.name);
    }));
    return out;
  }
  // B2B Partners (the businesses you send applications to) and Agents (the businesses that send you their students): the same kind of record.
  // The B2B partners named in the University Partner column of the sheet that are not set up on B2B Partners yet: every name that is
  // not a university (the Fact File, Partner Universities, or a name with University or College in it) and that Admin did not mark as
  // not a partner. They are shown on B2B Partners and offered in the dropdown, so no partner on the sheet is missing.
  // The Receiving Partner column: the head office and the branches are NIEC itself; any other name is an agent.
  const OFFICES = ['Head Office', ...Fields.BRANCHES.map(Fields.branchValue)];
  const isOffice = (v) => { const k = squash(v); return k === squash('Head Office') || Fields.BRANCHES.some((b) => k === squash(b) || k === squash(Fields.branchValue(b))); };
  // The agents named in the Receiving Partner column that are not set up on Agents yet and not marked as not an agent.
  function sheetAgents() {
    const wb = getWorkbook();
    const known = new Set((agents ? agents.list() : []).map((p) => squash(p.name)));
    const hidden = new Set((planning.all().settings.notAgents || []).map(squash));
    const found = new Map();
    (wb ? wb.sheets : []).forEach((sh) => sh.rows.forEach((row) => {
      if (!isStudent(row)) return;
      const name = text(row['RECEIVING PARTNER']).replace(/\s+/g, ' ');
      const key = squash(name);
      if (!key || isOffice(name) || known.has(key) || hidden.has(key)) return;
      const f = found.get(key) || { name, students: 0 };
      f.students += 1; found.set(key, f);
    }));
    return [...found.values()].sort((x, y) => y.students - x.students || x.name.localeCompare(y.name));
  }
  function sheetPartners() {
    const wb = getWorkbook();
    const known = new Set((b2b ? b2b.list() : []).map((p) => squash(p.name)));
    const unis = new Set([...facts.all().map((u) => squash(u.name)), ...direct.all().map((u) => squash(u.name))].filter(Boolean));
    const hidden = new Set((planning.all().settings.notPartners || []).map(squash));
    const found = new Map();
    (wb ? wb.sheets : []).forEach((sh) => sh.rows.forEach((row) => {
      if (!isStudent(row)) return;
      const name = text(row['UNIVERSITY PARTNER']).replace(/\s+/g, ' ');
      const key = squash(name);
      if (!key || known.has(key) || unis.has(key) || hidden.has(key) || /universit|college/i.test(name)) return;
      const f = found.get(key) || { name, students: 0 };
      f.students += 1; found.set(key, f);
    }));
    return [...found.values()].sort((x, y) => y.students - x.students || x.name.localeCompare(y.name));
  }
  async function handleB2b(req, res, urlPath) {
    if (urlPath === '/api/b2b/not-partner' && req.method === 'POST') {
      if (!adminOnly(req, res, 'B2B Partners')) return true;
      const body = await bodyOf(req, res, 4096);
      if (!body) return true;
      const name = text(body.name).slice(0, 120);
      const now = planning.all().settings.notPartners || [];
      const next = body.undo ? now.filter((n) => squash(n) !== squash(name)) : [...now, name];
      planning.saveSettings({ notPartners: next });
      activity.record(req, req.user, 'Edited partners', { app: 'B2B Partners', changes: [body.undo ? `${name}: shown again as a B2B partner` : `${name}: marked as not a B2B partner`] });
      sendJSON(res, 200, { notPartners: planning.all().settings.notPartners });
      return true;
    } return handlePartnerStore(req, res, urlPath, { store: b2b, prefix: 'b2b', label: 'B2B Partners', kind: 'b2b' }); }
  async function handleAgents(req, res, urlPath) {
    if (urlPath === '/api/agents/not-partner' && req.method === 'POST') {
      if (!adminOnly(req, res, 'Agents')) return true;
      const body = await bodyOf(req, res, 4096);
      if (!body) return true;
      const name = text(body.name).slice(0, 120);
      const now = planning.all().settings.notAgents || [];
      planning.saveSettings({ notAgents: body.undo ? now.filter((n) => squash(n) !== squash(name)) : [...now, name] });
      activity.record(req, req.user, 'Edited partners', { app: 'Agents', changes: [body.undo ? `${name}: shown again as an agent` : `${name}: marked as not an agent`] });
      sendJSON(res, 200, { notPartners: planning.all().settings.notAgents });
      return true;
    }
    return handlePartnerStore(req, res, urlPath, { store: agents, prefix: 'agents', label: 'Agents', kind: 'agents' }); }
  async function handlePartnerStore(req, res, urlPath, { store: b2b, prefix, label, kind }) {
    // Admin changes the list; the Manager (with the commission) and the Application and Mock Teams (without it) look at it.
    const level = partnerAccess(req.user)[kind];
    const reading = req.method === 'GET' && !/\/delete$/.test(urlPath);
    if (!level || (level !== 'full' && !reading)) { if (!adminOnly(req, res, level ? `Changing ${label}` : label)) return true; }
    const id = (urlPath.match(new RegExp(`^/api/${prefix}/([a-f0-9]{12})`)) || [])[1];
    const record = (line) => activity.record(req, req.user, 'Edited partners', { app: label, changes: [line] });
    const fileMatch = urlPath.match(new RegExp(`^/api/${prefix}/[a-f0-9]{12}/files(?:/([a-f0-9]{12})(/delete)?)?$`));
    if (fileMatch) {
      const fid = fileMatch[1];
      if (req.method === 'GET' && fid && !fileMatch[2]) {
        if (level === 'team') { sendJSON(res, 403, { error: 'The commission lists and agreement files are not open to your account.' }); return true; }
        const file = b2b.agreementFile(id, fid);
        if (!file) { sendJSON(res, 404, { error: 'No such file.' }); return true; }
        // ?open=1 shows a PDF or a picture in the browser (a commission list opens when it is clicked); anything else is downloaded.
        const inline = new URL(req.url, 'http://x').searchParams.get('open') === '1' && /^(application\/pdf|image\/(png|jpeg))$/.test(file.type);
        record(`${inline ? 'Opened' : 'Downloaded'} ${file.name}`);
        send(res, 200, fs.readFileSync(file.path), {
          'Content-Type': file.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': inline ? "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:" : "sandbox; default-src 'none'",
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="agreement${path.extname(file.path)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
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
      if (!id && urlPath !== `/api/${prefix}`) { sendJSON(res, 404, { error: 'No such partner.' }); return true; }
      if (!id && level !== 'full') { sendJSON(res, 200, { access: level, partners: b2b.list().map((p) => shapePartner(p, level)), statuses: PARTNER_STATUSES, performance: partnerPerformance(kind), currentIntake: (currentIntake() || {}).name || '' }); return true; }
      if (!id) { sendJSON(res, 200, { access: level, partners: b2b.list(), ...(kind === 'b2b' ? { onSheet: sheetPartners(), notPartners: planning.all().settings.notPartners || [] } : { onSheet: sheetAgents(), notPartners: planning.all().settings.notAgents || [] }), statuses: PARTNER_STATUSES, performance: partnerPerformance(kind), currentIntake: (currentIntake() || {}).name || '', intakes: (() => { const wb = getWorkbook(); return wb ? wb.sheets.filter((x) => !x.hidden || true).map((x) => x.name) : []; })() }); return true; }
      const one = shapePartner(b2b.get(id), level);
      if (one) sendJSON(res, 200, one); else sendJSON(res, 404, { error: 'No such partner.' });
      return true;
    }
    if (req.method !== 'POST') { send(res, 405, 'Method not allowed'); return true; }
    const body = await bodyOf(req, res, 1024 * 1024);
    if (!body) return true;
    if (!id) {
      const made = b2b.create(body.name, req.user.label);
      if (made.error) { sendJSON(res, 400, { error: made.error }); return true; }
      record(`Added ${made.university.name} to ${label}`);
      sendJSON(res, 200, made.university);
      return true;
    }
    if (urlPath.endsWith('/delete')) {
      const gone = b2b.remove(id);
      if (gone.error) { sendJSON(res, 404, { error: gone.error }); return true; }
      record(`Removed ${gone.removed.name} from ${label}`);
      sendJSON(res, 200, { ok: true });
      return true;
    }
    const saved = b2b.update(id, body, req.user.label);
    if (saved.error) { sendJSON(res, 400, { error: saved.error }); return true; }
    record(`Updated ${saved.university.name} in ${label}`);
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
    const set = new Set(Fields.STORED_SOURCES);
    const wb = getWorkbook();
    if (wb) wb.sheets.forEach((s) => s.rows.forEach((r) => { const v = text(r['STUDENT SOURCE']); if (v) set.add(v); }));
    return [...set].sort();
  }

  // ---- message templates ----
  async function handleTemplates(req, res, urlPath) {
    if (req.method === 'GET' && urlPath === '/api/templates') {
      sendJSON(res, 200, { templates: messages.list(), hiddenCount: messages.hiddenCount(), fields: Messages.FIELDS, signature: messages.signature(), stages: Teams.ALL_STATUSES, canEdit: Teams.isAdmin(req.user), mail: mailInfo(req.user) });
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
    if (urlPath === '/api/templates/restore-hidden') {
      const out = messages.restoreHidden();
      record(`Brought back ${out.restored} deleted ready-made message template${out.restored === 1 ? '' : 's'}`);
      sendJSON(res, 200, { ok: true, restored: out.restored });
      return true;
    }
    const hideMatch = /^\/api\/templates\/([a-z0-9_]{1,40})\/hide$/.exec(urlPath);
    if (hideMatch) {
      const out = messages.hideTemplate(hideMatch[1]);
      if (out.error) { sendJSON(res, 404, { error: out.error }); return true; }
      record(`Deleted the ready-made message template "${out.removed.name}"`);
      sendJSON(res, 200, { ok: true });
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

  // ---- sending one message to many students (email or WhatsApp) ----
  const bulkSends = new Map();
  async function handleBulk(req, res, urlPath) {
    if (req.method === 'GET' && urlPath === '/api/bulk/students') {
      const params = new URL(req.url, 'http://x').searchParams;
      const sheet = text(params.get('sheet'));
      const stage = text(params.get('stage'));
      const list = [];
      for (const { sheet: sh, row } of visibleStudents(req.user)) {
        if (!canChange(req.user, rowIndex().get(row._id))) continue;
        const b = brief(sh, row);
        if (sheet && sh.id !== sheet) continue;
        if (stage && b.stage !== stage) continue;
        list.push({ id: b.id, name: b.name, stage: b.stage, intake: b.intake, sheetId: sh.id, email: b.email, phone: b.phone, whatsapp: Boolean(Fields.whatsappNumber(b.phone)) });
        if (list.length >= 1000) break;
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      sendJSON(res, 200, { students: list, ...(() => { const l = cardLists(req.user); return { intakes: l.intakes, stages: l.stages }; })(), mail: mailInfo(req.user) });
      return true;
    }
    if (req.method !== 'POST' || !/^\/api\/bulk\/(preview|send-email)$/.test(urlPath)) { send(res, 404, 'Not found'); return true; }
    if (urlPath === '/api/bulk/send-email' && Teams.isReadOnly(req.user)) { sendJSON(res, 403, { error: 'Your account can only view students.' }); return true; }
    const body = await bodyOf(req, res, 512 * 1024);
    if (!body) return true;
    const ids = [...new Set(Array.isArray(body.ids) ? body.ids.map(String) : [])].filter((i) => ROW_ID.test(i)).slice(0, 150);
    if (!ids.length) { sendJSON(res, 400, { error: 'Choose at least one student.' }); return true; }
    const template = messages.get(text(body.template)) || null;
    const subject = typeof body.subject === 'string' ? body.subject : (template ? template.subject : '');
    const emailBody = typeof body.body === 'string' ? body.body : (template ? template.body : '');
    const whatsappBody = typeof body.whatsapp === 'string' ? body.whatsapp : (template ? template.whatsapp : '');
    const cfg = mailFor(req.user);
    const signed = signatureFor(req.user, cfg);
    const signature = signed.sig;
    const preview = urlPath.endsWith('preview');
    if (!preview && !text(subject) && !text(emailBody)) { sendJSON(res, 400, { error: 'Write a subject and a message first.' }); return true; }
    const items = [];
    const sendOut = [];
    for (const id of ids) {
      const found = rowIndex().get(id);
      if (!canSee(req.user, found) || !canChange(req.user, found)) { (preview ? items : sendOut).push(preview ? { id, error: 'Not in your list.' } : { id, name: '', status: 'skipped', error: 'Not in your list.' }); continue; }
      const card = cards.get(id);
      const ctx = messageContext(req, found, card, null);
      const email = Messages.renderEmail({ subject, body: emailBody, signature, siteUrl: cfg ? cfg.siteUrl : '', signatureSrc: signed.picture ? signatureSrc(preview) : '', ...ctx });
      const wa = Messages.renderWhatsApp({ body: whatsappBody, ...ctx });
      const to = text(found.row.EMAIL).toLowerCase();
      const number = Fields.whatsappNumber(found.row['CONTACT NUMBER']);
      const needsOptions = /\{options_table\}/.test(emailBody + whatsappBody) && !ctx.options.length;
      const item = { id, name: nameOf(found.row), to, subject: email.subject, text: email.text, missing: email.missing, whatsapp: { number, text: wa.text }, problem: needsOptions ? 'No university option on the card.' : (!mailer.isAddress(to) ? 'No email address.' : '') };
      if (preview) { items.push(item); continue; }
      if (item.problem) { sendOut.push({ id, name: item.name, status: 'skipped', error: item.problem }); continue; }
      if (!cfg) { sendOut.push({ id, name: item.name, status: 'not-configured' }); continue; }
      const recent = (bulkSends.get(req.user.id) || []).filter((t) => Date.now() - t < 10 * 60 * 1000);
      if (recent.length >= 300) { sendOut.push({ id, name: item.name, status: 'skipped', error: 'Too many emails in a short time.' }); continue; }
      const entry = { channel: 'email', template: template ? template.name : 'Own message', subject: email.subject, to, text: email.text, options: needsOptions ? 0 : ctx.options.length, attachments: [] };
      try {
        await mailer.sendMail({ ...cfg, fromName: cfg.personal && !Teams.isAdmin(req.user) ? `${req.user.name}, ${signature.short || signature.company || Messages.COMPANY}` : (signature.company || Messages.COMPANY) }, { to, subject: email.subject, text: email.text, html: email.html, auto: false, bcc: copiesFor(cfg), inline: signed.picture ? inlinePictures() : [] });
        recent.push(Date.now()); bulkSends.set(req.user.id, recent);
        cards.logMessage(id, { ...entry, status: 'sent' }, by(req));
        sendOut.push({ id, name: item.name, status: 'sent' });
      } catch (e) {
        cards.logMessage(id, { ...entry, status: 'failed', error: e.message }, by(req));
        sendOut.push({ id, name: item.name, status: 'failed', error: e.message });
      }
    }
    if (preview) { sendJSON(res, 200, { items, mail: mailInfo(req.user) }); return true; }
    note(req, [`Bulk email "${subject}": ${sendOut.filter((r) => r.status === 'sent').length} sent, ${sendOut.filter((r) => r.status !== 'sent').length} not sent`], 'Sent message');
    sendJSON(res, 200, { results: sendOut });
    return true;
  }

  async function handle(req, res, urlPath) {
    if (!urlPath.startsWith('/api/')) return false;
    const query = () => new URL(req.url, 'http://x').searchParams;
    // My email: a person's own mailbox for emailing students (see user-mail.js). Saved only after a test email to that address went out.
    if (urlPath === '/api/my-mail' && req.method === 'GET') {
      const office = officeMailSettings();
      sendJSON(res, 200, { ...(userMail ? userMail.info(req.user.id) : { set: false }), admin: Teams.isAdmin(req.user), officeReady: Boolean(accounts.emailConfig()), defaults: { host: office.host || '', port: office.port || 465, security: office.security || 'ssl' } });
      return true;
    }
    if (urlPath === '/api/my-mail' && req.method === 'POST') {
      if (!userMail) { sendJSON(res, 500, { error: 'Not available.' }); return true; }
      const body = await bodyOf(req, res, 8 * 1024);
      if (!body) return true;
      const made = userMail.clean(body, officeMailSettings(), mailer.isAddress);
      if (made.error) { sendJSON(res, 400, { error: made.error }); return true; }
      if (tooManySends(req.user.id)) { sendJSON(res, 429, { error: 'Too many tries in a short time. Please wait a few minutes.' }); return true; }
      try {
        await mailer.sendMail({ ...made.box, fromName: req.user.name }, { to: made.box.from, subject: 'ISR: your email is set up', text: `Hello ${req.user.name},\n\nYour mailbox works with ISR. Emails you send to students from ISR now go from ${made.box.from}.\n`, auto: true });
      } catch (e) {
        activity.record(req, req.user, 'Test email failed', { app: 'My email', changes: [`Could not set up ${made.box.from}: ${mailer.friendlyError(e, made.box.host)}`] });
        sendJSON(res, 400, { error: `It did not work, so nothing was saved: ${mailer.friendlyError(e, made.box.host)}` });
        return true;
      }
      userMail.save(req.user.id, made.box);
      activity.record(req, req.user, 'Changed settings', { app: 'My email', changes: [`Set up their own mailbox ${made.box.from} for emailing students`] });
      sendJSON(res, 200, { ok: true, ...userMail.info(req.user.id) });
      return true;
    }
    if (urlPath === '/api/my-mail/delete' && req.method === 'POST') {
      const gone = userMail ? userMail.remove(req.user.id) : false;
      if (gone) activity.record(req, req.user, 'Changed settings', { app: 'My email', changes: ['Removed their own mailbox'] });
      sendJSON(res, 200, { ok: true, set: false });
      return true;
    }
    if (urlPath === '/api/my-dashboard' && req.method === 'GET') {
      if (Teams.isAdmin(req.user) || (Teams.isManager(req.user) && Teams.isReadOnly(req.user))) { sendJSON(res, 403, { error: 'Admin and the Manager have the full Dashboard.' }); return true; }
      sendJSON(res, 200, myDashboard(req.user));
      return true;
    }
    if (urlPath === '/api/today' && req.method === 'GET') { sendJSON(res, 200, { ...todayFor(req.user), readOnly: Teams.isReadOnly(req.user) }); return true; }
    if (urlPath === '/api/activities' && req.method === 'GET') {
      if (!managers(req, res, 'Events and marketing')) return true;
      const { list, unlinkedSocial } = activities(req.user);
      // The intakes new students from an uploaded list can go into: the current one first.
      const wbNow = getWorkbook(); const cur = currentIntake();
      const intakes = wbNow ? Teams.viewFor(req.user, wbNow).sheets.map((sh) => ({ id: sh.id, name: sh.name })).sort((x, y) => (cur && x.id === cur.id ? -1 : cur && y.id === cur.id ? 1 : 0)) : [];
      sendJSON(res, 200, { activities: list, unlinkedSocial, intakes, channels: CHANNELS, types: EVENT_TYPES, marketingTypes: MARKETING_TYPES, canEdit: Teams.isAdmin(req.user) });
      return true;
    }
    // The choices of the University Partner column: the Partner Universities and the B2B Partners (names only, no terms), for every
    // account that sees the sheet. A new partner is added on B2B Partners first, then it can be picked.
    if (urlPath === '/api/partner-choices' && req.method === 'GET') {
      const names = (store) => (store && store.list ? store.list().filter((x) => x.status !== 'Ended').map((x) => x.name).sort((x, y) => x.localeCompare(y)) : []);
      const partners = [...new Set([...names(b2b), ...sheetPartners().map((p) => p.name)])].sort((x, y) => x.localeCompare(y));
      const agentNames = [...new Set([...names(agents), ...sheetAgents().map((p) => p.name)])].sort((x, y) => x.localeCompare(y));
      sendJSON(res, 200, { universities: names(direct), partners, offices: OFFICES, agents: agentNames });
      return true;
    }
    // Tasks: a team member gets the tasks of their teams (and a branch the tasks it gave); Admin and the Manager get every task.
    if (urlPath === '/api/tasks' && req.method === 'GET') {
      const all = cards.all();
      const mine = teamsOf(req.user);
      const everyone = canAssign(req.user);
      const out = [];
      for (const { sheet, row } of rowIndex().values()) {
        const c = all[row._id];
        if (!c || !Array.isArray(c.tasks) || !c.tasks.length) continue;
        // A branch also gets the tasks it gave (marked `given`), to see whether they are done.
        const gaveIt = (t) => isBranchUser(req.user) && t.by === by(req);
        c.tasks.forEach((t) => { if (everyone || mine.includes(t.team) || gaveIt(t)) out.push({ ...t, given: !everyone && !mine.includes(t.team), teamLabel: teamLabel(t.team), studentId: row._id, student: nameOf(row) || 'Student', stage: text(row[STATUS]), intake: sheet.name }); });
      }
      out.sort((a, b) => (a.done - b.done) || String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(b.at).localeCompare(String(a.at)));
      sendJSON(res, 200, { tasks: out.slice(0, 500), canAssign: everyone, teams: TASK_TEAMS() });
      return true;
    }
    if (urlPath === '/api/event-tags' && req.method === 'GET') { sendJSON(res, 200, eventTags(req.user)); return true; }
    { const m = /^\/api\/activities\/([a-f0-9]{12})\/students$/.exec(urlPath);
      if (m && req.method === 'GET') {
        if (!managers(req, res, 'Events and marketing')) return true;
        const ev = planning.all().events.find((e) => e.id === m[1]);
        if (!ev) { sendJSON(res, 404, { error: 'No such event or marketing.' }); return true; }
        sendJSON(res, 200, { students: eventStudents(req.user, ev) });
        return true;
      }
      if (m && req.method === 'POST') {
        if (!Teams.isAdmin(req.user)) { sendJSON(res, 403, { error: 'Only Admin can upload the students of an event.' }); return true; }
        const ev = planning.all().events.find((e) => e.id === m[1]);
        if (!ev) { sendJSON(res, 404, { error: 'No such event or marketing.' }); return true; }
        const body = await bodyOf(req, res, 2 * 1024 * 1024);
        if (!body) return true;
        const r = eventImport(req, ev, body);
        sendJSON(res, r.status, r.json);
        return true;
      } }
    if (urlPath === '/api/card-lists' && req.method === 'GET') { sendJSON(res, 200, cardLists(req.user)); return true; }
    if (urlPath === '/api/students/search' && req.method === 'GET') { sendJSON(res, 200, { students: searchStudents(req.user, (query().get('q') || '').slice(0, 100)) }); return true; }
    if (urlPath === '/api/students/new' && req.method === 'POST') return handleNewStudent(req, res);
    if (urlPath === '/api/students/bulk' && req.method === 'POST') return handleBulkStudents(req, res);
    if (urlPath === '/api/students/check' && req.method === 'POST') {
      const body = await bodyOf(req, res, 256 * 1024);
      if (!body) return true;
      const list = (Array.isArray(body.rows) ? body.rows : []).slice(0, 200).map((r) => { const d = r && typeof r === 'object' ? existingStudent(r.email, r.phone) : null; return d ? { exists: true, name: Teams.isAdmin(req.user) ? [d['FIRST NAME'], d['LAST NAME']].filter(Boolean).join(' ') : ' ' } : { exists: false }; });
      sendJSON(res, 200, { results: list });
      return true;
    }
    // A missing platform, class or event (with its day) is added once and offered to everyone, so students are tagged the same way.
    if (urlPath === '/api/source-options' && req.method === 'POST') {
      if (Teams.isReadOnly(req.user)) { sendJSON(res, 403, { error: 'Your account can only view students.' }); return true; }
      const body = await bodyOf(req, res);
      if (!body) return true;
      const out = sourceOptions.add(text(body.source), body.name, body.date);
      if (out.error) { sendJSON(res, 400, { error: out.error }); return true; }
      if (!out.existed) note(req, [`Added "${out.value}" to the choices of ${text(body.source)}`], 'Edited student card', 'Student sources');
      sendJSON(res, 200, { ok: true, value: out.value, options: sourceOptions.all(planning.all().events.map((e) => eventLabel(e.name, e.date))) });
      return true;
    }
    if (urlPath.startsWith('/api/cards/')) return handleCard(req, res, urlPath);
    if (urlPath === '/api/bulk/students' || urlPath === '/api/bulk/preview' || urlPath === '/api/bulk/send-email') return handleBulk(req, res, urlPath);
    if (urlPath === '/api/courses' && req.method === 'GET') {
      const q = query();
      const index = courseIndex();
      const found = searchCourses(index, { q: (q.get('q') || '').slice(0, 100), level: q.get('level') || '', intake: (q.get('intake') || '').slice(0, 60), universityId: q.get('university') || '', limit: 80 });
      sendJSON(res, 200, { ...found, levels: Fields.STUDY_LEVELS, intakes: [...new Set(index.flatMap((o) => o.intake.split(',').map((s) => s.trim())).filter(Boolean))].sort() });
      return true;
    }
    if (urlPath === '/api/templates' || urlPath.startsWith('/api/templates/')) return handleTemplates(req, res, urlPath);
    if (urlPath === '/api/b2b' || urlPath.startsWith('/api/b2b/')) return handleB2b(req, res, urlPath);
    if (urlPath === '/api/agents' || urlPath.startsWith('/api/agents/')) return handleAgents(req, res, urlPath);
    if (urlPath === '/api/planning' || urlPath.startsWith('/api/planning/')) return handlePlanning(req, res, urlPath);
    // Where the applicants of an intake came from: the Receiving Partner of each applicant (Head Office, a branch or an agent), with
    // the applicants and visas of each. An applicant is a student past Inquiry (not Defer, Hold or Withdrawn) or with a submission
    // date. A student with no Receiving Partner is counted in the totals but not listed (nothing recorded is shown as a row).
    if (urlPath === '/api/applicants' && req.method === 'GET') {
      if (!managers(req, res, 'The Dashboard')) return true;
      const wb = getWorkbook();
      if (!wb) { sendJSON(res, 500, { error: 'Could not read the data file' }); return true; }
      const want = query().get('intake') || '';
      const sheet = wb.sheets.find((sh) => sh.id === want) || currentIntake() || wb.sheets[wb.sheets.length - 1];
      const allCards = cards.all();
      const events = planning.all().events;
      const directNames = new Set(direct.all().map((u) => squash(u.name)));
      const bump = (map, key, label, extra = {}) => { const g = map.get(key) || { label, students: 0, applicants: 0, visas: 0, people: [], ...extra }; map.set(key, g); return g; };
      // The students behind a figure (for the deepest level of the Dashboard's drill-down): at most 80 per group.
      const person = (row, stage, visa) => ({ id: row._id, name: nameOf(row), stage, university: text(row['UNIVERSITY NAME']), visa });
      const receiving = new Map(); const sources = new Map(); const partners = new Map(); const agentsMap = new Map();
      let applicants = 0;
      (sheet ? sheet.rows : []).forEach((row) => {
        if (!isStudent(row)) return;
        const stage = text(row[STATUS]);
        const applied = !['', 'Inquiry', 'Defer', 'Hold', 'Withdrawn'].includes(stage) || Boolean(text(row['APPLICATION SUBMISSION DATE']));
        const visa = stage === 'Visa Issued' || Boolean(text(row['VISA RECEIVED DATE']));
        const me = person(row, stage, visa);
        const add = (g) => { g.students += 1; if (applied) g.applicants += 1; if (visa) g.visas += 1; if (g.people.length < 80) g.people.push(me); };
        if (applied) applicants += 1;
        const card = allCards[row._id];
        // Where the student came from: the Student Source, and under it exactly which (the event, the platform, the agent ...).
        const src = text(row['STUDENT SOURCE']);
        if (src) {
          const group = Fields.isBranchValue(src) ? 'Branch' : src;
          const g = bump(sources, group, group, { details: new Map() }); add(g);
          let detail = Fields.isBranchValue(src) ? src : text(card && card.profile.sourceDetail);
          const ev = !Fields.isBranchValue(src) && detail ? eventFor(events, detail) : null;
          if (ev) detail = ev.name;
          if (detail) add(bump(g.details, squash(detail), detail));
        }
        // Where the application was received (Head Office, a branch, an agent).
        let from = text(row['RECEIVING PARTNER']);
        if (from && applied) {
          const k = squash(from);
          if (k === squash('Head Office')) from = 'Head Office';
          else { const b = Fields.BRANCHES.find((x) => k === squash(x) || k === squash(Fields.branchValue(x))); if (b) from = Fields.branchValue(b); }
          const kind = from === 'Head Office' ? 'office' : Fields.isBranchValue(from) ? 'branch' : 'agent';
          const g = bump(receiving, from, from, { kind }); g.students += 1; g.applicants += 1; if (visa) g.visas += 1; if (g.people.length < 80) g.people.push(me);
        }
        // The agent who sent the student: the Receiving Partner when it is not the head office or a branch, else the Agent source.
        const rp = text(row['RECEIVING PARTNER']);
        const agent = rp && !isOffice(rp) ? rp : (src === 'Agent' ? text(card && card.profile.sourceDetail) : '');
        if (agent) add(bump(agentsMap, squash(agent), agent));
        // Where the application was sent: a Partner University or a B2B partner (the University Partner column).
        const up = text(row['UNIVERSITY PARTNER']);
        if (up) {
          const k = squash(up); const pg = bump(partners, k, up, { kind: directNames.has(k) || /universit|college/i.test(up) ? 'university' : 'b2b', unis: new Map() }); add(pg);
          const uni = text(row['UNIVERSITY NAME']); if (uni) add(bump(pg.unis, squash(uni), uni));
        }
      });
      const list = (m) => [...m.values()].sort((x, y) => y.students - x.students || x.label.localeCompare(y.label));
      const order = { office: 0, branch: 1, agent: 2 };
      sendJSON(res, 200, {
        intake: sheet ? sheet.name : '', applicants,
        list: [...receiving.values()].sort((x, y) => order[x.kind] - order[y.kind] || y.applicants - x.applicants),
        sources: list(sources).map((g) => ({ ...g, details: list(g.details) })),
        partners: list(partners).map((g) => ({ ...g, unis: list(g.unis) })), agents: list(agentsMap),
      });
      return true;
    }
    if (urlPath === '/api/insights' && req.method === 'GET') {
      if (!managers(req, res, 'The Dashboard')) return true;
      if (!getWorkbook()) { sendJSON(res, 500, { error: 'Could not read the data file' }); return true; }
      send(res, 200, insights(req.user, query().get('intake') || ''), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return true;
    }
    // The Fact File assistant: describe a student, get the options they are eligible for (finder.js, eligibility.js).
    // The weekly check of the course pages: the warnings, and a person confirming one.
    if (urlPath === '/api/course-watch' && req.method === 'GET') {
      const w = courseWatch();
      sendJSON(res, 200, w ? { warnings: w.warnings(text(new URL(req.url, 'http://x').searchParams.get('university'))), summary: w.summary(), running: w.isRunning(), admin: Teams.isAdmin(req.user) } : { warnings: [], summary: {}, running: false });
      return true;
    }
    if (urlPath === '/api/course-watch/confirm' && req.method === 'POST') {
      if (!adminOnly(req, res, 'Confirming a course page warning')) return true;
      const body = await bodyOf(req, res, 4096);
      if (!body) return true;
      sendJSON(res, 200, { ok: Boolean(courseWatch() && courseWatch().confirm(text(body.key))) });
      return true;
    }
    if (urlPath === '/api/course-watch/run' && req.method === 'POST') {
      if (!adminOnly(req, res, 'Checking the course pages')) return true;
      const w = courseWatch();
      if (w && !w.isRunning()) w.run().catch(() => {});
      sendJSON(res, 200, { started: Boolean(w && !w.isRunning()) });
      return true;
    }
    // The page of a course on the university's website (course-finder.js), remembered once found.
    // The courses of one university as the Fact File lists them (the general list and each intake), each with the page of the course
    // when it is known, so a course in the Fact File opens its own page.
    if (urlPath === '/api/fact-courses' && req.method === 'GET') {
      const uid = text(new URL(req.url, 'http://x').searchParams.get('university'));
      const uni = facts.all().find((u) => u.id === uid);
      if (!uni) { sendJSON(res, 404, { error: 'No such university.' }); return true; }
      const links = courseLinks.all(facts.all());
      const shape = (block) => parseCourses(block).map((c) => ({ course: c.course, group: c.group, link: links[linkKey(uid, c.course)] || '' }));
      sendJSON(res, 200, { id: uid, general: shape(uni.courses), intakes: Object.fromEntries((uni.intakes || []).map((i) => [i.name, shape(i.courses)])), canFind: !Teams.isReadOnly(req.user) });
      return true;
    }
    if (urlPath === '/api/course-link' && req.method === 'POST') {
      if (Teams.isReadOnly && Teams.isReadOnly(req.user)) { sendJSON(res, 403, { error: 'Your account can only look.' }); return true; }
      const body = await bodyOf(req, res, 16 * 1024);
      if (!body) return true;
      const university = text(body.university).slice(0, 160);
      const course = text(body.course).slice(0, 240);
      if (!university || !course) { sendJSON(res, 400, { error: 'The university and the course are needed.' }); return true; }
      const known = courseLinks.all(facts.all())[linkKey(body.universityId, course)];
      if (known) { sendJSON(res, 200, { link: known, remembered: true }); return true; }
      const uni = facts.all().find((u) => u.id === body.universityId);
      const found = courseLinker ? await courseLinker.lookup({ university, course, hosts: uni ? hostsOf(uni) : [] }) : { link: '', error: 'Not available.' };
      if (found.link && (!uni || !hostsOf(uni).length || onHosts(found.link, hostsOf(uni)))) courseLinks.remember(body.universityId, course, found.link);
      sendJSON(res, 200, found);
      return true;
    }
    if (urlPath === '/api/finder' && req.method === 'POST') {
      const body = await bodyOf(req, res);
      if (!body) return true;
      const student = body.studentId && ROW_ID.test(String(body.studentId)) ? rowIndex().get(body.studentId) : null;
      const seen = student && canSee(req.user, student) ? student : null;
      const out = await finder({ body, index: courseIndex(), card: seen ? cards.get(seen.row._id) : null });
      sendJSON(res, out.error ? 400 : 200, out);
      return true;
    }
    return false;
  }

  return { handle, rowIndex, canSee, canChange, visibleStudents, courseIndex, brief };
}

module.exports = { createPortalApi, NEW_STUDENT_COLUMNS };

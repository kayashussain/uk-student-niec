// The B2B Partners list: the other businesses NIEC works with to recruit students or to apply to universities. Each has its contact
// people, agreement dates and files, the commission structure of each intake and notes. Admin changes them; the Manager and the
// Application and Mock Teams look at them, with what partner-access.js allows. Kept in b2b-partners.json in the data folder, with the agreement files in b2b-files/
// (never in git, never served as pages). The store itself is the one the Partner Universities use (direct.js).

const { createDirect, applyRoute, STATUSES, LIMITS } = require('./direct');

const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');

// What is kept for a partner, whatever was sent: only the known fields, as text, within limits.
function cleanPartner(input, old = {}) {
  const contacts = (Array.isArray(input.contacts) ? input.contacts : []).slice(0, LIMITS.contacts).map((c) => ({
    name: str(c && c.name, LIMITS.short).trim(), email: str(c && c.email, LIMITS.short).trim(), phone: str(c && c.phone, LIMITS.short).trim(),
  })).filter((c) => c.name || c.email || c.phone);
  // The commission structure of each intake: a link to where it is written (the PDF files are uploaded beside it).
  const commissions = (Array.isArray(input.commissions) ? input.commissions : []).slice(0, 40).map((c) => {
    const link = str(c && c.link, 500).trim();
    // The PDF of the intake's commission list is one of the files uploaded for the partner (named by its id).
    const fileId = /^[a-f0-9]{12}$/.test(String(c && c.fileId)) && (old.agreements || []).some((a) => a.id === c.fileId) ? c.fileId : '';
    return { intake: str(c && c.intake, LIMITS.short).trim(), link: /^https?:\/\/[^\s<>"']+$/i.test(link) ? link : '', fileId, note: str(c && c.note, LIMITS.short).trim() };
  }).filter((c) => c.intake || c.link || c.fileId || c.note);
  return {
    id: old.id,
    name: str(input.name, LIMITS.name).trim() || old.name || '',
    status: STATUSES.includes(input.status) ? input.status : (STATUSES.includes(old.status) ? old.status : 'Active'),
    city: str(input.city, LIMITS.short).trim(),
    agreementStart: str(input.agreementStart, 40).trim(),
    agreementEnd: str(input.agreementEnd, 40).trim(),
    contacts,
    commissions,
    // Where the team sends a student's application through this partner: a portal (with its login) or an email, as on Partner Universities.
    ...applyRoute(input),
    notes: str(input.notes, LIMITS.text),
  };
}

const summary = (p) => ({
  id: p.id, name: p.name, status: p.status, city: p.city,
  agreementStart: p.agreementStart, agreementEnd: p.agreementEnd, agreementCount: p.agreements.length, updatedAt: p.updatedAt,
  contact: p.contacts[0] || { name: '', email: '', phone: '' }, contactCount: p.contacts.length, commissionCount: (p.commissions || []).length,
  // The login is carried for Admin, to copy from the list; partner-access.js removes it for everyone else.
  applyPortal: p.applyPortal || '', applyEmail: p.applyEmail || '', applyUser: p.applyUser || '', applyPassword: p.applyPassword || '',
  commissions: (p.commissions || []).map((c) => { const f = (p.agreements || []).find((a) => a.id === c.fileId); return { intake: c.intake, link: c.link || '', fileId: c.fileId || '', fileName: f ? f.name : '' }; }),
});

const createB2b = (dir, options = {}) => createDirect(dir, {
  starters: [], file: 'b2b-partners.json', filesFolder: 'b2b-files', clean: cleanPartner, summary, what: 'partner', ...options,
});

module.exports = { createB2b, cleanPartner };

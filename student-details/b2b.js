// The B2B Partners list: the other businesses NIEC recruits with. Two kinds are kept apart, because they are two
// different decisions:
//
//   Sub-agent           a consultancy, institute or person who sends students to NIEC (the students whose Student
//                       Source is Agent). NIEC shares what it earns with them.
//   B2B platform        a company NIEC applies through for universities it has no agreement of its own with (the name
//                       in the sheet's University Partner column). They share what they earn with NIEC.
//
// Each has its contact people, agreement dates and files, the terms agreed (who gets what, when) and notes. Admin only,
// like the Partner Universities: the server refuses every other account. Kept in b2b-partners.json in the data folder,
// with the agreement files in b2b-files/ (never in git, never served as pages). The store itself is the one the
// Partner Universities use (direct.js).

const { createDirect, STATUSES, LIMITS } = require('./direct');

const KINDS = ['Sub-agent', 'B2B platform'];
const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');

// What is kept for a partner, whatever was sent: only the known fields, as text, within limits.
function cleanPartner(input, old = {}) {
  const contacts = (Array.isArray(input.contacts) ? input.contacts : []).slice(0, LIMITS.contacts).map((c) => ({
    name: str(c && c.name, LIMITS.short).trim(), email: str(c && c.email, LIMITS.short).trim(), phone: str(c && c.phone, LIMITS.short).trim(),
  })).filter((c) => c.name || c.email || c.phone);
  // The terms: one row for each thing agreed, e.g. item "Postgraduate student with a visa", terms "Rs 40,000, paid after enrolment".
  const terms = (Array.isArray(input.terms) ? input.terms : []).slice(0, LIMITS.slabs).map((t) => ({
    item: str(t && t.item, LIMITS.short).trim(), terms: str(t && t.terms, LIMITS.short).trim(),
  })).filter((t) => t.item || t.terms);
  return {
    id: old.id,
    name: str(input.name, LIMITS.name).trim() || old.name || '',
    kind: KINDS.includes(input.kind) ? input.kind : (KINDS.includes(old.kind) ? old.kind : 'Sub-agent'),
    status: STATUSES.includes(input.status) ? input.status : (STATUSES.includes(old.status) ? old.status : 'Active'),
    city: str(input.city, LIMITS.short).trim(),
    agreementStart: str(input.agreementStart, 40).trim(),
    agreementEnd: str(input.agreementEnd, 40).trim(),
    contacts,
    terms,
    paymentTerms: str(input.paymentTerms, LIMITS.text),
    notes: str(input.notes, LIMITS.text),
  };
}

const summary = (p) => ({
  id: p.id, name: p.name, kind: p.kind, status: p.status, city: p.city,
  terms: p.terms.map((t) => [t.item, t.terms].filter(Boolean).join(': ')),
  agreementStart: p.agreementStart, agreementEnd: p.agreementEnd, agreementCount: p.agreements.length, updatedAt: p.updatedAt,
  contact: p.contacts[0] || { name: '', email: '', phone: '' }, contactCount: p.contacts.length,
});

const createB2b = (dir, options = {}) => createDirect(dir, {
  starters: [], file: 'b2b-partners.json', filesFolder: 'b2b-files', clean: cleanPartner, summary, what: 'partner', ...options,
});

module.exports = { createB2b, cleanPartner, KINDS };

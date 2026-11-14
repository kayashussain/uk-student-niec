// Who may look at Partner Universities, B2B Partners, Agents and Message templates, and how much of each they see (the owner, 14 Nov 2026):
//
//   Admin                     everything, and the only one who changes anything.
//   Manager                   every detail with the commission (slabs, payment terms, commission lists, agreement files), to look at.
//   Application and Mock Team Partner Universities, B2B Partners and Agents without the commission: no slabs, payment terms,
//                             commission lists, agreement files or notes, and no portal username or password.
//   A branch                  Partner Universities the same way (without the commission). No B2B Partners or Agents.
//   Follow-up Team            none of these pages.
//   Message templates         Admin changes them; the Manager, the Application and Mock Teams and the branches read them.
//
// The server strips what an account may not see before anything is sent, so it is never in the page, not even hidden.
const Teams = require('../shared/teams');

function partnerAccess(user) {
  const w = Teams.who(user);
  if (w.role === 'admin') return { direct: 'full', b2b: 'full', agents: 'full', templates: 'edit' };
  const manager = w.role === 'manager';
  const appMock = w.departments.some((d) => d === 'application' || d === 'mock');
  const branch = w.departments.some((d) => Teams.DEPARTMENTS[d] && Teams.DEPARTMENTS[d].source);
  const team = appMock ? 'team' : null;
  return {
    direct: manager ? 'commission' : (appMock || branch ? 'team' : null),
    b2b: manager ? 'commission' : team,
    agents: manager ? 'commission' : team,
    templates: manager || appMock || branch ? 'view' : null,
  };
}

const omit = (o, keys) => { const out = { ...o }; keys.forEach((k) => { delete out[k]; }); return out; };
// The portal login goes to Admin only on these pages (the team uses it from the student's card, see portal-api.js).
const LOGIN = ['applyUser', 'applyPassword', 'applyLogin'];
// A Partner University as an account may see it (one from the list, or the whole record).
function shapeDirect(u, level) {
  if (!u || level === 'full') return u;
  if (level === 'commission') return omit(u, LOGIN);
  return omit(u, [...LOGIN, 'slabs', 'slabCount', 'paymentTerms', 'agreements', 'agreementCount', 'notes']);
}
// A B2B partner or an agent as an account may see it.
function shapePartner(p, level) {
  if (!p || level === 'full') return p;
  if (level === 'commission') return omit(p, LOGIN);
  return omit(p, [...LOGIN, 'commissions', 'commissionCount', 'agreements', 'agreementCount', 'notes']);
}

module.exports = { partnerAccess, shapeDirect, shapePartner };

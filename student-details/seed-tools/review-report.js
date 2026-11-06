// Writes FACT-FILE-REVIEW.md from what the OIEG merge really did (node seed-tools/review-report.js > ../FACT-FILE-REVIEW.md).
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createFacts, OIEG_REPORT } = require('../facts');
const { courseKey } = require('../fact-merge');

const facts = createFacts(fs.mkdtempSync(path.join(os.tmpdir(), 'ff-review-')));
const pages = facts.all();
const by = (name) => OIEG_REPORT.added.filter((a) => a.where === name || a.where.startsWith(name + ' / '));
const out = [];
out.push('# Fact File review: OIEG requirement sheets', '');
out.push('Sources: the Nov to Jan Oxford Direct requirement sheet and the Nov to Jan Pathways requirement sheet (Oxford International Education Group).');
out.push('Rules used: nothing already on a page is overwritten; a fact that is already there is not added again however it is worded; a new fact is added once; where a sheet disagrees with a page, the page keeps its value and the difference is listed below for a person to decide.', '');

out.push('## Universities added', '');
['Lincoln Bishop University', 'Sheffield Hallam University'].forEach((n) => {
  const p = pages.find((x) => x.name === n);
  out.push(`- ${n}: ${p.programs.length} requirement row(s), ${p.intakes.map((i) => i.name).join(', ')}, ${[p.courses, ...p.intakes.map((i) => i.courses)].join('\n').split('\n').filter((l) => l && !l.startsWith('##')).length} course(s).`);
});
out.push('', '## What was added to existing pages', '');
const names = [...new Set(OIEG_REPORT.added.map((a) => a.where.split(' / ')[0]))].filter((n) => !['Lincoln Bishop University', 'Sheffield Hallam University'].includes(n)).sort();
names.forEach((n) => {
  const items = by(n);
  const programs = OIEG_REPORT.addedPrograms.filter((w) => w.startsWith(n + ' / ')).map((w) => w.split(' / ')[1]);
  const fields = {};
  items.forEach((a) => { if (!['courses', 'notes', 'deadline'].includes(a.field)) fields[a.where.split(' / ')[1]] = [...(fields[a.where.split(' / ')[1]] || []), a.field]; });
  const courses = items.filter((a) => a.field === 'courses').reduce((s, a) => s + parseInt(a.text, 10), 0);
  const dates = items.filter((a) => a.field === 'notes' && /key date/.test(a.text) || a.field === 'deadline').length;
  const bits = [];
  if (programs.length) bits.push(`new row(s): ${programs.join(', ')}`);
  Object.keys(fields).forEach((k) => bits.push(`${k}: filled ${[...new Set(fields[k])].join(', ')}`));
  if (courses) bits.push(`${courses} course(s) that were missing`);
  if (dates) bits.push('CAS deadlines and key dates per intake');
  if (bits.length) out.push(`- ${n}: ${bits.join('; ')}.`);
});

out.push('', '## Decided by the owner (5 November 2026)', '');
OIEG_REPORT.decided.forEach((c) => out.push(`- ${c.where}, ${c.field}: ${c.decision} (the sheet said "${c.other}").`));
out.push('- University of Roehampton Postgraduate IELTS is 6.5 overall (the sheet figure, replacing 6.0), and the Health Science University scholarship is £2,000 (the sheet figure, replacing £2,500), because the updated sheets are the truth unless the owner chose the page.');
out.push('- Ravensbourne postgraduate: the band minimum stays 5.5 in each band, as both the page and the sheet say.');
out.push('', '## Still open', '');
OIEG_REPORT.conflicts.forEach((c) => out.push(`- ${c.where}, ${c.field}: the page says "${c.kept}", the sheet says "${c.other}".`));
out.push('- University of West London (see the note on its page): UG GPA 2.5+ against 2.6 or 65%, UG PTE 59 against 51, UG Duolingo 120 against 105, PG gap 5 to 7 years against up to 10 years with work experience, Enhanced Extended 40%+ against any percentage, gap 8 against 10 years, and a £700 early payment discount on Enhanced Extended (the table says none).');

out.push('', '## Repeats removed so each fact is shown once', '');
out.push('- University of West London: the fees table, the February block and the January block all gave the requirements. They are now one table (UG, PG, Enhanced Extended PG, PG Placement Year, Extended Nursing Studies Top Up). The two course lists are now one list, and a course that runs in one intake only says so.');
out.push('- York St John University: the January requirements are now a row of the fees table instead of a second block under the intake.');
out.push('- A course listed twice under the same heading, or in an intake and again in the page course list, is kept once (for example MSc Global Sustainable Management at Worcester).');

let stage = 0;
let stagePages = 0;
pages.forEach((u) => {
  const seen = new Set();
  let d = 0;
  [u.courses, ...u.intakes.map((i) => i.courses)].forEach((t) => String(t || '').split('\n').forEach((l) => { l = l.trim(); if (!l || l.startsWith('##')) return; const k = courseKey(l); if (seen.has(k)) d += 1; else seen.add(k); }));
  if (d) { stage += d; stagePages += 1; }
});
out.push('', '## Left as it is, on purpose', '');
out.push(`- ${stage} course lines on ${stagePages} pathway pages appear under more than one stage heading (a degree that can be reached from both Year Zero and Year One, for example). That shows both routes, so they were not merged.`);
out.push('- Where a pathway page keeps one combined row for several stages (for example "Undergraduate"), a new fact is added to that row with its stage named in front of it.');
out.push('- A check of the university websites (Roehampton, Ravensbourne, Winchester) found no single clear official figure for these courses: the official pages point to course pages and the fee and score pages that third party sites quote contradict each other. No web figure was written into the Fact File. Each page says it was filled from the sheets, with the date.');
out.push('- Dates in the sheets that Excel had turned into nonsense (a university end date of 1930) were not copied.');
process.stdout.write(out.join('\n') + '\n');

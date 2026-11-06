// The Incentive page's student list, built from a Student Details workbook: every sheet is an intake, and only the
// students whose Application Status is exactly "Visa Issued" are listed. Used by the Incentive page and by the Claude
// connector (student-details/advisor-mcp.js), so both always show the same students.

const { round2, groupByUniversity, displayDate } = require('./calc');
// Student Details' own fee math, so the tuition fee shown always matches what's shown over there.
const { netTuitionFee } = require('../student-details/calc');

// Student Details -> the fields Incentive cares about. Everything else (visa lodge dates, language test, other tuition
// figures, etc.) stays over there. `agent` is the University Partner column: the agent's name; `source` is the Student Source column.
function normalizeStudent(row, intake) {
  return {
    id: row._id,
    intake,
    name: [row['FIRST NAME'], row['LAST NAME']].filter(Boolean).join(' ').trim(),
    course: row['COURSE NAME'] || '',
    university: row['UNIVERSITY NAME'] || '',
    agent: String(row['UNIVERSITY PARTNER'] || '').trim(),
    source: String(row['STUDENT SOURCE'] || '').trim(), // the Student Source column of Student Details
    studentId: row['STUDENT ID'] || '',
    tuitionFee: String(row['GROSS FEE'] || '').trim() ? round2(netTuitionFee(row)) : 0,
    visaIssuedDate: displayDate(row['VISA RECEIVED DATE']),
  };
}

// { ok, intakes, byIntake }: byIntake[sheetName] only ever contains students whose APPLICATION STATUS is exactly
// "Visa Issued" right now. Every sheet becomes an intake, even one with no visa-issued students.
// One name per intake: two sheets that share a name would otherwise be shown as the same intake (the second one's students
// replacing the first one's). The second is called "Name (2)", the third "Name (3)", and so on, the same everywhere.
function uniqueNames(sheets) {
  const used = new Set();
  return sheets.map((sheet) => {
    const base = String(sheet && sheet.name !== undefined ? sheet.name : '');
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base} (${n})`;
    used.add(name);
    return name;
  });
}

function syncFromWorkbook(workbook) {
  const sheets = Array.isArray(workbook && workbook.sheets) ? workbook.sheets : [];
  const names = uniqueNames(sheets);
  const byIntake = {};
  sheets.forEach((sheet, i) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    byIntake[names[i]] = groupByUniversity(rows
      .filter((r) => r['APPLICATION STATUS'] === 'Visa Issued' && r._id)
      .map((r) => normalizeStudent(r, names[i])));
  });
  return { ok: true, intakes: names, byIntake };
}

module.exports = { normalizeStudent, syncFromWorkbook, uniqueNames };

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
function syncFromWorkbook(workbook) {
  const sheets = Array.isArray(workbook && workbook.sheets) ? workbook.sheets : [];
  const byIntake = {};
  sheets.forEach((sheet) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    byIntake[sheet.name] = groupByUniversity(rows
      .filter((r) => r['APPLICATION STATUS'] === 'Visa Issued' && r._id)
      .map((r) => normalizeStudent(r, sheet.name)));
  });
  return { ok: true, intakes: sheets.map((s) => s.name), byIntake };
}

module.exports = { normalizeStudent, syncFromWorkbook };

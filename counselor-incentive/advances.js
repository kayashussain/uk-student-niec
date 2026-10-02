// Previous Advance figures are stored by the Student Details sheet's id, so renaming a sheet keeps its
// advance. The page still talks in intake (sheet) names; these translate between the two. Entries saved
// before this change are keyed by name, and are still found (and moved to the id on their next save).

// sheets: [{ id, name }] from Student Details. Returns { [intakeName]: entry } for the page.
function advancesByName(stored, sheets) {
  const out = {};
  sheets.forEach((s) => {
    const entry = stored[s.id] || stored[s.name];
    if (entry) out[s.name] = entry;
  });
  return out;
}

// Stores `entry` for the named intake, returning the updated object. An intake name no current sheet
// has (e.g. renamed a moment ago in another tab) is kept under the name, as before.
function setAdvance(stored, sheets, intake, entry) {
  const sheet = sheets.find((s) => s.name === intake);
  const next = { ...stored };
  if (sheet) {
    next[sheet.id] = entry;
    delete next[sheet.name];
  } else {
    next[intake] = entry;
  }
  return next;
}

module.exports = { advancesByName, setAdvance };

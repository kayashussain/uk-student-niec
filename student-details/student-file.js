// Reading a list of students from an Excel (.xlsx) or CSV file, and checking each line: used by Add many students and by the upload of
// an event's students on Events and marketing, so both read a file the same way. window.StudentFile = { readFile(file, max), checkRows, parse }.
(function (root) {
  // Splits one line at commas, semicolons or tabs, keeping "quoted, parts" together.
  function splitLine(line) {
    const out = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') { q = !q; continue; }
      if (!q && (ch === ',' || ch === ';' || ch === '\t')) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // What is wrong with a line, if anything: { skip, note }. Skipped lines are not added.
  function checkRows(list) {
    const seen = new Set();
    return list.map((r) => {
      const name = `${r.first} ${r.last}`.trim();
      if (r.exists) return { skip: true, note: `Already on the sheet${r.exists.trim() ? ' (' + r.exists + ')' : ''}, will be skipped` };
      if (r.badPhone) return { skip: true, note: `The phone number "${r.badPhone}" looks too short, skipped` };
      if (r.badBit) return { skip: true, note: `"${r.badBit}" does not look like a name, an email or a phone number, skipped` };
      if (!name) return { skip: true, note: 'No name, skipped' };
      if (r.phone && r.phone.replace(/\D/g, '').length < 6) return { skip: true, note: 'The phone number looks too short, skipped' };
      if (r.email && !EMAIL_OK.test(r.email)) return { skip: true, note: 'The email does not look right, skipped' };
      const keys = [];
      if (r.email) keys.push('e:' + r.email.toLowerCase());
      const digits = (r.phone || '').replace(/\D/g, '');
      if (digits.length >= 7) keys.push('p:' + digits);
      if (!keys.length) keys.push('n:' + name.toLowerCase());
      if (keys.some((k) => seen.has(k))) return { skip: true, note: 'Same email or phone as an earlier line, skipped' };
      keys.forEach((k) => seen.add(k));
      if (!r.email && !r.phone) return { skip: false, note: 'No email or phone yet' };
      return { skip: false, note: '' };
    });
  }
  // One line to a student: full name (or first and last name), email, phone, in any order.
  function parse(text, max = 200) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, max).map((line) => {
      const parts = splitLine(line).map((p) => p.trim()).filter(Boolean);
      const email = parts.find((p) => /@/.test(p)) || '';
      const phone = parts.find((p) => /^[+\d][\d\s()-]{6,}$/.test(p)) || '';
      const badPhone = parts.find((p) => p !== email && p !== phone && /^[+\d][\d\s()-]*$/.test(p)) || '';
      const badBit = parts.find((p) => p !== email && p !== phone && p !== badPhone && (/\d/.test(p) || (/mail/i.test(p) && !/\s/.test(p)))) || '';
      const names = parts.filter((p) => p !== email && p !== phone && p !== badBit && p !== badPhone);
      let first = names[0] || '';
      let last = names[1] || '';
      if (!last && /\s/.test(first)) { const w = first.split(/\s+/); first = w[0]; last = w.slice(1).join(' '); }
      return { first, last, email, phone, badBit, badPhone };
    });
  }


  // Rows of a spreadsheet (arrays of cells) to students. A first row with headings (First name, Last name, Name, Email, Phone ...) names the
  // columns; without headings each row is read like a pasted line.
  function fromGrid(grid, max = 200) {
    const cells = grid.map((r) => r.map((c) => String(c === null || c === undefined ? '' : (c.text || c.result || c)).trim()));
    const head = (cells[0] || []).map((c) => c.toLowerCase());
    const find = (re) => head.findIndex((c) => re.test(c));
    const col = { first: find(/first\s*name|given/), last: find(/last\s*name|surname|family/), name: find(/^(full\s*)?name$|student/), email: find(/e-?mail/), phone: find(/phone|mobile|contact|whatsapp|number/) };
    const hasHead = Object.values(col).some((i) => i >= 0);
    return (hasHead ? cells.slice(1) : cells).filter((r) => r.some(Boolean)).slice(0, max).map((r) => {
      if (!hasHead) return parse(r.filter(Boolean).join('\t'), 1)[0] || { first: '', last: '', email: '', phone: '' };
      let first = col.first >= 0 ? r[col.first] : '';
      let last = col.last >= 0 ? r[col.last] : '';
      if (!first && !last && col.name >= 0) { const w = (r[col.name] || '').split(/\s+/); first = w[0] || ''; last = w.slice(1).join(' '); }
      return { first, last, email: col.email >= 0 ? r[col.email] : '', phone: col.phone >= 0 ? r[col.phone] : '' };
    });
  }
  // A file the person chose: .xlsx is read with the Excel library (downloaded once, as for Export Excel), .csv as text.
  async function readFile(file, max = 200) {
    if (/\.csv$/i.test(file.name)) return fromGrid((await file.text()).split(/\r?\n/).filter(Boolean).map((l) => splitLine(l)), max);
    const ExcelJS = await window.NiecSession.loadExcel();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const sheet = wb.worksheets[0];
    const grid = [];
    sheet.eachRow({ includeEmpty: false }, (row) => { grid.push(row.values.slice(1)); });
    return fromGrid(grid, max);
  }

  root.StudentFile = { readFile, checkRows, parse };
})(this);

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
  // columns; without headings each row is read like a pasted line. Other columns a lead list often has are kept too: the programme
  // (as the study level), the day of the enquiry, the intake the student asked for, and anything else as a line for the first note.
  const dayOf = (c, isDate) => {
    if (c instanceof Date && !Number.isNaN(c.getTime())) return c.toISOString().slice(0, 10);
    const n = Number(c);
    // An Excel day number (46338.9 is 12 Nov 2026) in a column about a date.
    if (isDate && Number.isFinite(n) && n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(c || ''));
    return m ? m[0] : '';
  };
  const levelOf = (v) => (/master|post\s*grad|msc|\bma\b|mba/i.test(v) ? 'Postgraduate' : /bachelor|under\s*grad|bsc|\bba\b|degree/i.test(v) ? 'Undergraduate' : /foundation/i.test(v) ? 'Foundation' : /top.?up/i.test(v) ? 'Top-up (final year)' : '');
  function fromGrid(grid, max = 200) {
    const heads = (grid[0] || []).map((c) => String(c === null || c === undefined ? '' : (c.text || c.result || c)).trim());
    const head = heads.map((c) => c.toLowerCase());
    const find = (re) => head.findIndex((c) => re.test(c));
    const col = { first: find(/first\s*name|given/), last: find(/last\s*name|surname|family/), name: find(/^(full\s*)?name$|student/), email: find(/e-?mail/), phone: find(/phone|mobile|contact|whatsapp|number/) };
    const hasHead = Object.values(col).some((i) => i >= 0);
    const more = { level: find(/programme|program|level|degree|course/), intake: find(/intake/), date: find(/date|when|time/) };
    const used = new Set([...Object.values(col), ...Object.values(more)].filter((i) => i >= 0));
    const cellText = (c) => String(c === null || c === undefined ? '' : (c instanceof Date ? dayOf(c) : (c.text || c.result || c))).trim();
    return (hasHead ? grid.slice(1) : grid).filter((r) => r.some((c) => cellText(c))).slice(0, max).map((raw) => {
      const r = raw.map(cellText);
      if (!hasHead) return parse(r.filter(Boolean).join('\t'), 1)[0] || { first: '', last: '', email: '', phone: '' };
      let first = col.first >= 0 ? r[col.first] : '';
      let last = col.last >= 0 ? r[col.last] : '';
      if (!first && !last && col.name >= 0) { const w = (r[col.name] || '').split(/\s+/); first = w[0] || ''; last = w.slice(1).join(' '); }
      const programme = more.level >= 0 ? r[more.level] : '';
      const asked = more.intake >= 0 ? r[more.intake] : '';
      const when = more.date >= 0 ? dayOf(raw[more.date], true) : '';
      const extra = [programme && `${heads[more.level]}: ${programme}`, asked && `${heads[more.intake]}: ${asked}`,
        ...heads.map((hd, i) => (!used.has(i) && hd && r[i] ? `${hd}: ${r[i]}` : '')).filter(Boolean)].filter(Boolean).join('. ');
      return { first, last, email: col.email >= 0 ? r[col.email] : '', phone: col.phone >= 0 ? r[col.phone] : '', level: levelOf(programme), intake: asked, inquiryDate: when, extra };
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

  root.StudentFile = { readFile, checkRows, parse, fromGrid };
})(this);

// Lead lists in Excel are read by ISR itself (student-details/student-file.js), without the Excel library, which cannot read some
// files (a sheet formatted as a table failed with "Cannot read properties of undefined (reading 'name')", the owner, 14 Nov 2026).
// A small .xlsx is built here (made-up people) with shared strings, inline strings, a number and an Excel day number.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

function zip(files) {
  const parts = []; const dir = []; let at = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text); const packed = zlib.deflateRawSync(data); const n = Buffer.from(name); const crc = zlib.crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(at, 42);
    parts.push(local, n, packed); dir.push(central, n); at += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(dir); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(dir.length / 2, 8); end.writeUInt16LE(dir.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...parts, cd, end]);
}

test('an .xlsx lead list is read without the Excel library: names, contacts, level, intake, enquiry day', async () => {
  const ctx = { TextDecoder, Response, Blob, DecompressionStream };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'student-details', 'student-file.js'), 'utf8').replace('})(this);', '})(globalThis);'), ctx);
  const file = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/leads.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Student Name</t></si><si><t>Email Address</t></si><si><t>Phone Number</t></si><si><t>Programme</t></si><si><t>Intended UK Study Intake</t></si><si><t>Enquiry Date</t></si><si><t>Asha Example</t></si><si><t xml:space="preserve">Master&apos;s Degree</t></si></sst>',
    'xl/worksheets/leads.xml': '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="inlineStr"><is><t>asha@example.com</t></is></c><c r="C2" t="inlineStr"><is><t>+9779800000001</t></is></c><c r="D2" t="s"><v>7</v></c><c r="E2" t="inlineStr"><is><t>January 2027</t></is></c><c r="F2"><v>46338.91</v></c></row>'
      + '<row r="3"><c r="A3" t="inlineStr"><is><t>Bina</t></is></c><c r="C3"><v>9800000002</v></c></row>'
      + '</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>',
  });
  const grid = await ctx.StudentFile.readXlsx(file.buffer.slice(file.byteOffset, file.byteOffset + file.length));
  const rows = ctx.StudentFile.fromGrid(grid, 100);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rows[0])), { first: 'Asha', last: 'Example', email: 'asha@example.com', phone: '+9779800000001', level: 'Postgraduate', intake: 'January 2027', inquiryDate: '2026-11-12', extra: "Programme: Master's Degree. Intended UK Study Intake: January 2027" });
  assert.deepStrictEqual([rows[1].first, rows[1].phone, rows[1].email], ['Bina', '9800000002', ''], 'a short row, a number cell');
});

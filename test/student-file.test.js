// Reading a lead list (student-file.js) as different lists write it (the owner, 14 Nov 2026): the inquiry date in words and its time in
// its own column become the first inquiry day and time; the inquiry number, links and the campaign, ad and platform names are not
// copied into the note; the programme, the intake and any comment are. The names and numbers below are made up.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'student-details', 'student-file.js'), 'utf8'), ctx);
const { fromGrid } = ctx.StudentFile;

test('a lead list: the date and time go to the inquiry, only what is about the student goes to the note', () => {
  const grid = [
    ['Inquiry No.', 'Inquiry Date', 'Inquiry Time (NPT)', 'Student Name', 'Contact Number', 'Email Address', 'Programme Level', 'Intended Intake', 'Inquiry Platform', 'Campaign Name', 'Ad Name', 'Facebook/Instagram Inbox Link', 'Comments'],
    ['55', '12 November 2026', '09:21:33 PM', 'Test Student', '9800000000', 'test@example.com', "Master's Degree", 'January 2027', 'Facebook', 'Example campaign', 'Example ad', 'https://business.facebook.com/x/1', 'Wants a scholarship'],
  ];
  const [r] = fromGrid(grid);
  assert.deepStrictEqual([r.first, r.last, r.phone, r.email], ['Test', 'Student', '9800000000', 'test@example.com']);
  assert.deepStrictEqual([r.inquiryDate, r.inquiryTime, r.level], ['2026-11-12', '9:21 pm', 'Postgraduate']);
  assert.strictEqual(r.extra, "Programme Level: Master's Degree. Intended Intake: January 2027. Comments: Wants a scholarship");
});

test('dates as lists write them', () => {
  const day = (v) => fromGrid([['Name', 'Phone', 'Date'], ['A B', '9800000000', v]])[0].inquiryDate;
  assert.strictEqual(day('2026-11-12'), '2026-11-12');
  assert.strictEqual(day('12/11/2026'), '2026-11-12', 'day first, as in Nepal');
  assert.strictEqual(day('11/25/2026'), '2026-11-25', 'month first only when it cannot be a day');
  assert.strictEqual(day('Nov 12, 2026'), '2026-11-12');
  assert.strictEqual(day('12-Nov-26'), '2026-11-12');
  assert.strictEqual(day(46338.9), '2026-11-12', 'an Excel date');
  assert.strictEqual(day('soon'), '');
  const meta = fromGrid([['id', 'created_time', 'ad_name', 'campaign_name', 'form_name', 'platform', 'full_name', 'phone_number', 'email', 'what_would_you_like_to_study?'], ['l:1', '2026-11-08T14:05:00+0545', 'x', 'y', 'z', 'fb', 'A B', '+9779800000000', 'a@example.com', 'Nursing']])[0];
  assert.deepStrictEqual([meta.inquiryDate, meta.inquiryTime, meta.extra], ['2026-11-08', '2:05 pm', 'what_would_you_like_to_study?: Nursing'], 'a Facebook lead export: only the question answered goes to the note');
});

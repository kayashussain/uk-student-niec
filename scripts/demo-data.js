// Made-up data for trying the system on your own computer (see scripts/local-demo.js) and for the tests of the
// Dashboard figures. Nothing here is a real student: the names are put together at random, every email ends in
// example.com and every phone number starts with 98000. The same seed always gives the same data.

const { DEFAULT_COLUMNS } = require('../student-details/workbook');

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Aarav', 'Sita', 'Ram', 'Gita', 'Hari', 'Maya', 'Bikash', 'Anju', 'Suresh', 'Puja', 'Nabin', 'Sarita', 'Dipak', 'Rina', 'Kiran', 'Asmita', 'Roshan', 'Bina', 'Sagar', 'Nisha',
  'Prakash', 'Sabina', 'Anil', 'Kabita', 'Rajan', 'Sunita', 'Manoj', 'Laxmi', 'Sandip', 'Pramila', 'Ujjwal', 'Srijana', 'Bishal', 'Alisha', 'Niraj', 'Samjhana', 'Pawan', 'Karuna', 'Sujan', 'Rekha'];
const LAST = ['Sharma', 'Thapa', 'Gurung', 'Shrestha', 'Adhikari', 'Karki', 'Rai', 'Tamang', 'Poudel', 'Bhandari', 'KC', 'Magar', 'Lama', 'Neupane', 'Basnet', 'Khadka', 'Acharya', 'Subedi', 'Maharjan', 'Pandey'];
const COUNSELORS = ['Asha Demo', 'Bikram Demo', 'Sunita Demo'];
const DISTRICTS = ['Kathmandu', 'Lalitpur', 'Bhaktapur', 'Chitwan', 'Kaski', 'Rupandehi', 'Morang', 'Jhapa', 'Sunsari', 'Dang', 'Kailali', 'Makwanpur'];
const UNIVERSITIES = [
  [['University of West London', 'Official Rep'], 0.42], [['Ulster University', 'QA'], 0.15], [['University of Roehampton', 'OIEG'], 0.11], [['Bangor University', 'Official Rep'], 0.1],
  [['York St John University', 'Adventus'], 0.09], [['Middlesex University', 'Official Rep'], 0.07], [['University of East London', 'Adventus'], 0.06],
];
const COURSES = {
  Postgraduate: ['MSc Cyber Security', 'MSc Data Science', 'MSc International Business', 'MSc Project Management', 'MSc Public Health', 'MSc Digital Marketing', 'MSc Computer Science'],
  MBA: ['MBA', 'MBA Healthcare Management'],
  Undergraduate: ['BSc (Hons) Business Management', 'BSc (Hons) Computer Science', 'BSc (Hons) Nursing - Adult', 'BA (Hons) Accounting and Finance'],
  'Top-up (final year)': ['BSc (Hons) Nursing Top-up', 'BA (Hons) Business Top-up'],
};
const SOURCES = [
  ['Social Media', 0.3, ['Facebook or Instagram advert (Meta Ads)', 'Facebook or Instagram advert (Meta Ads)', 'TikTok', 'Instagram', 'WhatsApp', 'Facebook page', 'Messenger']],
  ['Reference', 0.2, ['Current or past student', 'Friend or family of the student', 'Staff member', 'Teacher or college']],
  ['Visitor', 0.14, ['Walked in', 'Phone call', 'Website form', 'Google search or Maps']],
  ['Events', 0.11, []],
  ['Agent', 0.1, []],
  ['Language Classes', 0.05, ['IELTS class', 'PTE class']],
  ['Chitwan Branch', 0.05, ['Walked in', 'Facebook page', 'Reference']],
  ['Pokhara Branch', 0.05, ['Walked in', 'TikTok', 'Reference']],
];
const SOCIAL_CAMPAIGNS = ['Nepal Bandha awareness campaign', 'UK scholarship video ad', 'Study in the UK reels', 'Partner page share (college)', 'IELTS free class promotion'];
// How likely a student of each source is to go all the way, so the channels differ the way they do in real life.
const SOURCE_STRENGTH = { 'Social Media': 0.75, Reference: 1.35, Visitor: 1.1, Events: 1.0, Agent: 1.15, 'Language Classes': 1.25, 'Chitwan Branch': 0.95, 'Pokhara Branch': 0.95 };
const EVENTS = [
  { name: 'UK Study Seminar, Pokhara (March 2026)', date: '2026-03-14', endDate: '2026-03-14', type: 'Seminar or information session', place: 'Pokhara', cost: 85000, registered: 140, attended: 82, universities: 'University of West London, Bangor University', note: 'Joint session with two university representatives.' },
  { name: 'UK Education Fair, Kathmandu (August 2026)', date: '2026-08-08', endDate: '2026-08-10', type: 'Education fair', place: 'Kathmandu', cost: 240000, registered: 420, attended: 265, universities: 'UWL, Ulster, Roehampton, Middlesex, York St John', note: 'Held one week after the +2 results.' },
  { name: 'Spot Assessment Day (October 2026)', date: '2026-10-03', type: 'University visit or spot assessment', place: 'the head office', cost: 60000, registered: 95, attended: 71, universities: 'University of West London, Ulster University', note: 'Offers given on the day to students with complete documents.' },
];
const PARTNERS = ['Himal Education Hub (demo)', 'Lumbini Study Point (demo)', 'Koshi Career Centre (demo)'];
const CAMPAIGNS = ['Scholarship advert, January 2027 intake', 'Nursing top-up advert', 'MBA without IELTS advert'];
const LOST = [
  ['Chose another consultancy', 0.24], ['Funds or bank balance not ready', 0.2], ['Fees or deposit too high', 0.14], ['Stopped answering', 0.12], ['English score not enough', 0.08],
  ['Course or university not available with us', 0.08], ['Postponed to a later intake', 0.06], ['Family or personal decision', 0.05], ['Chose another country', 0.03],
];
const WANTED = ['MSc Pharmacy with a placement year', 'Nursing degree with no IELTS', 'Aviation management in London under £12,000', 'MSc Physiotherapy (pre-registration)', 'Foundation in medicine pathway', 'Hotel management with paid placement'];
const NOTES = ['Called. Interested, will send documents this week.', 'Visited the office with parents. Explained fees and scholarship.', 'Sent the options on WhatsApp. Waiting for the choice.',
  'Asked about the bank balance needed. Explained the 28-day rule.', 'Did not pick up. Try again in the evening.', 'Documents received except the recommendation letters.', 'IELTS booked for next month. Follow up after the result.'];

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;
const at = (isoDay) => Date.parse(isoDay + 'T00:00:00Z');

// today: 'YYYY-MM-DD'. Returns { workbook, cards, planning, b2b } ready to write to the data folder.
function buildDemo({ today = '2026-11-11', seed = 20261111 } = {}) {
  const rnd = mulberry32(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const weighted = (pairs) => { let r = rnd() * pairs.reduce((n, p) => n + p[1], 0); for (const p of pairs) { r -= p[1]; if (r <= 0) return p; } return pairs[pairs.length - 1]; };
  const now = at(today);
  let counter = 0;
  const cards = {};
  const usedNames = new Set();

  // The furthest step each student of an intake reached, by plan: [step, how many]. Steps: 0 inquiry only, 1 applied,
  // 2 offer and mock, 3 waiting to pay, 4 paid (CAS stage), 5 CAS issued, 6 visa lodged, 7 visa issued, R refused, W/H/D left.
  const INTAKES = [
    { id: 'sheet-mf0k2a00demo1', name: 'Jan Intake 2026', start: '2026-01-20', filled: 0.25, plan: { 0: 20, 7: 24, R: 3, W: 9, H: 3, D: 0 } },
    { id: 'sheet-mk5q7c00demo2', name: 'Sep Intake 2026', start: '2026-09-20', filled: 0.55, plan: { 0: 30, 7: 34, R: 4, W: 12, H: 4, D: 0 } },
    { id: 'sheet-mq9v1e00demo3', name: 'Jan Intake 2027', start: '2027-01-20', filled: 0.82, plan: { 0: 42, 1: 19, 2: 14, 3: 10, 4: 8, 5: 6, 6: 5, 7: 3, R: 1, W: 6, H: 2, D: 0 } },
  ];

  const sheets = INTAKES.map((intake, intakeIndex) => {
    const rows = [];
    const current = intakeIndex === INTAKES.length - 1;
    const start = at(intake.start);
    Object.entries(intake.plan).forEach(([step, howMany]) => {
      for (let i = 0; i < howMany; i += 1) {
        counter += 1;
        let first; let last;
        do { first = pick(FIRST); last = pick(LAST); } while (usedNames.has(`${first} ${last}`) && usedNames.size < FIRST.length * LAST.length);
        usedNames.add(`${first} ${last}`);
        const id = `row-demo${String(counter).padStart(4, '0')}`;
        const row = { _id: id };
        DEFAULT_COLUMNS.forEach((c) => { row[c] = ''; });
        const [source, , details] = weighted(SOURCES);
        const strength = SOURCE_STRENGTH[source];
        // A weak channel keeps more of its students at the inquiry step; a strong one moves them on.
        let reached = step;
        if (step !== '0' && rnd() > strength / 1.35 && rnd() < 0.35) reached = '0';
        if (step === '0' && rnd() < (strength - 1) * 0.5) reached = current ? '1' : 'W';
        const leftKind = ['W', 'H', 'D', 'R'].includes(reached) ? reached : null;
        const furthest = leftKind === 'R' ? 6 : (leftKind ? between(0, 3) : Number(reached));
        const level = weighted([['Postgraduate', 0.55], ['MBA', 0.1], ['Undergraduate', 0.28], ['Top-up (final year)', 0.07]])[0];
        const [university, partner] = weighted(UNIVERSITIES)[0];
        row['FIRST NAME'] = first;
        row['LAST NAME'] = last;
        row.EMAIL = `${first}.${last}${counter}@example.com`.toLowerCase();
        row['CONTACT NUMBER'] = `98000${String(10000 + counter).slice(-5)}`;
        row['STUDENT SOURCE'] = source;
        // The dates, forward from the first inquiry; a current student's dates never lie in the future.
        let t = start - between(140, 250) * DAY;
        const dates = { inquiry: t };
        const stepDays = [[7, 40], [5, 24], [6, 16], [14, 40], [8, 21], [3, 12], [12, 28]];
        const keys = ['applied', 'offer', 'mock', 'paid', 'cas', 'lodged', 'visa'];
        for (let k = 0; k < furthest; k += 1) { t += between(stepDays[k][0], stepDays[k][1]) * DAY; dates[keys[k]] = t; }
        const lastDate = Math.max(...Object.values(dates));
        const limit = current ? now - between(0, 9) * DAY : start - between(5, 20) * DAY;
        if (lastDate > limit) { const shift = lastDate - limit; Object.keys(dates).forEach((k) => { dates[k] -= shift; }); }
        if (furthest >= 1) {
          row['UNIVERSITY NAME'] = university;
          row['COURSE NAME'] = pick(COURSES[level]);
          row['UNIVERSITY PARTNER'] = partner;
          row['APPLICATION SUBMISSION DATE'] = iso(dates.applied);
          row['LANGUAGE TEST DATE'] = rnd() < 0.2 ? 'Waiver' : iso(dates.applied - between(20, 300) * DAY);
        }
        if (furthest >= 2) { row['OFFER RECEIVED DATE'] = iso(dates.offer); row['STUDENT ID'] = String(21000000 + counter * 37); }
        if (furthest >= 3) {
          row['MOCK SCHEDULE 1'] = iso(dates.mock);
          row['FEEDBACK 1'] = pick(['Good. Needs to know the modules better.', 'Confident. Clear about funding.', 'Weak on career plan. Second mock needed.']);
          if (rnd() < 0.5) { row['MOCK SCHEDULE 2'] = iso(dates.mock + between(2, 6) * DAY); row['FEEDBACK 2'] = 'Much better. Ready for the university interview.'; }
          row['PRE CAS INTERVIEW'] = 'Passed';
          const gross = pick([16750, 17250, 16200, 18980, 15500, 19000]);
          row['GROSS FEE'] = String(gross);
          row.SCHOLARSHIP = pick(['3500', '2000', '15%', '4000']);
        }
        if (furthest >= 4) {
          row['TUITION FEE DEPOSIT(1st Installment)'] = pick(['8000', '10000', '9750', '6000']);
          row['PAYMENT DATE'] = iso(dates.paid);
          row.NOC = 'Submitted';
          row['NOC NUMBER'] = `NOC-${between(100000, 999999)}`;
          row['CAS REQUESTED DATE'] = iso(dates.paid + between(1, 6) * DAY);
        }
        if (furthest >= 5) { row['CAS RECEIVED DATE'] = iso(dates.cas); row['MEDICAL REPORT'] = 'Received'; }
        if (furthest >= 6) { row['VISA LODGE DATE'] = iso(dates.lodged); row['VFS ATTENDED DATE'] = iso(dates.lodged + between(1, 5) * DAY); }
        if (furthest >= 7) { row['VISA RECEIVED DATE'] = iso(dates.visa); row['E-VISA'] = 'Received'; }
        const stage = leftKind === 'R' ? 'Visa Rejected' : leftKind === 'W' ? 'Withdrawn' : leftKind === 'H' ? 'Hold' : leftKind === 'D' ? 'Defer'
          : ['Inquiry', 'Application Stage', 'Mock Stage', 'Payment Stage', 'CAS Stage', 'CAS Issued', 'Visa Lodge', 'Visa Issued'][furthest];
        row['APPLICATION STATUS'] = stage;
        if (rnd() < 0.3) row.REMARKS = pick(['Parents involved', 'Needs loan', 'Strong profile', 'Call after 5 pm', 'Has UK relative']);
        rows.push(row);

        // The card. Older intakes have fewer details filled in, as they would in real use.
        const know = () => rnd() < intake.filled;
        const profile = {};
        if (know()) {
          if (source === 'Events') profile.sourceDetail = pick(EVENTS).name;
          else if (source === 'Agent') profile.sourceDetail = pick(PARTNERS);
          else profile.sourceDetail = pick(details);
          if (source === 'Social Media') profile.sourceRemarks = SOCIAL_CAMPAIGNS[profile.sourceDetail.length % SOCIAL_CAMPAIGNS.length];
        }
        if (know()) profile.inquiryDate = iso(dates.inquiry);
        if (know()) profile.studyLevel = level === 'MBA' ? 'MBA' : level;
        if (know()) profile.subject = pick(COURSES[level]).replace(/^(MSc|BSc \(Hons\)|BA \(Hons\)|MBA)\s*/, '') || 'Business';
        if (know()) { profile.gapYears = String(pick([0, 0, 1, 2, 3])); profile.location = pick(['', 'London', 'Manchester', 'Scotland', 'Birmingham', 'anywhere']); profile.budget = pick(['14000', '16000', '18000', '20000']); }
        if (know()) { profile.qualification = level === 'Undergraduate' ? '+2 or Grade 12' : (level === 'Top-up (final year)' ? 'Diploma or PCL' : 'Bachelor (4 years)'); profile.grade = pick(['2.6 GPA', '2.9 GPA', '3.2 GPA', '58%', '64%', '71%']); profile.passedYear = String(between(2019, 2026)); }
        if (know()) { profile.englishTest = pick(['IELTS Academic', 'PTE Academic', 'Not taken yet', 'MOI or waiver']); if (profile.englishTest.startsWith('IELTS')) profile.englishScore = pick(['6.0', '6.5', '5.5']); if (profile.englishTest.startsWith('PTE')) profile.englishScore = pick(['56', '59', '62']); }
        if (leftKind && leftKind !== 'R' && know()) { profile.lostReason = weighted(LOST)[0]; if (profile.lostReason === 'Course or university not available with us') profile.subject = pick(WANTED); }
        if (leftKind === 'R' && know()) profile.lostReason = 'Visa refused';
        const card = { profile, notes: [], options: [], messages: [], createdAt: new Date(dates.inquiry).toISOString(), createdBy: 'Demo Admin' };
        const noteCount = current ? between(0, 3) : (rnd() < 0.3 ? 1 : 0);
        for (let k = 0; k < noteCount; k += 1) {
          const when = Math.min(now - between(0, 20) * DAY, lastDate + between(1, 30) * DAY);
          card.notes.push({ id: `demo${String(counter).padStart(4, '0')}n${k}`.padEnd(12, '0').slice(0, 12), at: new Date(when + between(9, 16) * 3600000).toISOString(), by: COUNSELORS[0], kind: pick(['note', 'call', 'meeting']), text: pick(NOTES) });
        }
        card.notes.sort((a, b) => a.at.localeCompare(b.at));
        if (Object.keys(profile).length || card.notes.length) cards[id] = card;
        if (furthest >= 1 && rnd() < 0.4) card.options.push({ id: `demo${String(counter).padStart(4, '0')}o0`.padEnd(12, '0').slice(0, 12), universityId: '', university: row['UNIVERSITY NAME'] || 'Demo University', course: row['COURSE NAME'] || 'Demo course', level: '', intake: '', fee: '', deposit: '', scholarship: '', link: '', note: '', addedAt: new Date(dates.inquiry).toISOString(), addedBy: 'Demo Admin' });
      }
    });
    return { id: intake.id, name: intake.name, columns: [...DEFAULT_COLUMNS], rows, hidden: false, leadColumnsApplied: true, columnOrderVersion: 2 };
  });

  const spend = [];
  const line = (month, intake, source, detail, campaign, amount, leads, note = '') => spend.push({ id: `a1${String(spend.length).padStart(10, '0')}`, month, intake, source, detail, campaign, amount, leads, note });
  ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].forEach((m, i) => line(m, INTAKES[1].id, 'Social Media', 'Facebook or Instagram advert (Meta Ads)', 'Scholarship advert, September 2026 intake', 38000 + i * 4000, 60 + i * 9));
  ['2026-08', '2026-09', '2026-10', '2026-11'].forEach((m, i) => line(m, INTAKES[2].id, 'Social Media', 'Facebook or Instagram advert (Meta Ads)', CAMPAIGNS[i % 3], 52000 + i * 6000, 85 + i * 12));
  ['2026-08', '2026-09', '2026-10'].forEach((m, i) => line(m, INTAKES[2].id, 'Social Media', 'TikTok', '', 18000 + i * 2000, 40 + i * 5, 'Boosted videos'));
  line('2026-03', INTAKES[1].id, 'Events', EVENTS[0].name, '', EVENTS[0].cost, EVENTS[0].attended);
  line('2026-08', INTAKES[2].id, 'Events', EVENTS[1].name, '', EVENTS[1].cost, EVENTS[1].attended);
  line('2026-10', INTAKES[2].id, 'Events', EVENTS[2].name, '', EVENTS[2].cost, EVENTS[2].attended);
  line('2026-09', INTAKES[2].id, 'Visitor', 'Signboard or hoarding', '', 45000, 0, 'New hoarding at the office junction');
  const planning = {
    targets: {
      [INTAKES[2].id]: { visas: 45, applications: 0, byDate: '2027-01-10', startDate: INTAKES[2].start, note: 'Agreed with the CEO in September.' },
      [INTAKES[1].id]: { visas: 35, applications: 0, byDate: '2026-09-10', startDate: INTAKES[1].start, note: '' },
    },
    spend,
    events: EVENTS.map((e, i) => ({ ...e, id: `e0${String(i).padStart(10, '0')}` })),
    decisions: [
      { id: 'de0000000001', date: '2026-08-15', title: 'Move 30% of the advert budget from general posts to the scholarship advert', problem: 'General adverts brought many inquiries but few applications.', evidence: 'September intake: adverts gave the most inquiries and the lowest share of applications.', decision: 'Run one advert built around fees and scholarships, aimed at Bachelor graduates.', expected: '25 qualified inquiries a month at a lower cost per inquiry.', measure: 'Qualified inquiries and cost per inquiry from Meta Ads', reviewDate: '2026-11-01', outcome: '', lesson: '', status: 'Under way' },
      { id: 'de0000000002', date: '2026-09-28', title: 'Hold a spot assessment day with two universities', problem: 'Offers took three weeks, and students went elsewhere while waiting.', evidence: 'Typical time from application to offer was 16 days.', decision: 'Invite UWL and Ulster for one day of on-the-spot offers.', expected: '20 offers on the day.', measure: 'Offers given on the day, and how many paid', reviewDate: '2026-12-15', outcome: '', lesson: '', status: 'Under way' },
    ],
    market: [],
    settings: { valuePerVisa: 150000, maxCostPerLead: 0 },
  };
  const stamp = new Date(now).toISOString();
  const common = { status: 'Active', agreementStart: '2026-01-01', commissions: [{ intake: 'Jan Intake 2027', link: 'https://example.org/commission-demo', note: 'Demo link' }], notes: '', agreements: [], updatedAt: stamp, updatedBy: 'Demo Admin' };
  // Agents send you their students; B2B partners are the ones you send applications to.
  const agents = PARTNERS.map((name, i) => ({ ...common, id: `ag0000000${i}0`.slice(0, 12), name, city: ['Pokhara', 'Butwal', 'Biratnagar'][i], agreementEnd: ['2026-12-31', '2027-06-30', ''][i], contacts: [{ name: `${pick(FIRST)} ${pick(LAST)} (demo)`, email: `agent${i}@example.com`, phone: `98000990${i}0` }] }));
  const b2b = [{ ...common, id: 'b2b000000009', name: 'Adventus', city: 'Online', agreementStart: '2025-06-01', agreementEnd: '2027-01-31', contacts: [{ name: 'Partner manager (demo)', email: 'manager@example.com', phone: '9800099999' }] }];
  return { workbook: { revision: 1, sheets, activeSheetId: sheets[sheets.length - 1].id }, cards, planning, b2b, agents, counselors: COUNSELORS };
}

module.exports = { buildDemo };

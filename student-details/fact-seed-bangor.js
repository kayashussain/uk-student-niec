// Bangor University's Fact File page, from its January 2027 intake flyer. Used as the starting content for
// Bangor University, the same way as fact-seed-uwl.js: when the list is first created, and (once) for an
// existing Bangor page that is still empty. A page Admin has saved is never touched.
// A line starting with "- " is a bullet and "## " is a sub-heading (see richText in fact-university.js).

const JAN_2027_COURSES = [
  '## Accounting, Banking and Finance, Business, Management and Marketing: Undergraduate (£19,000)',
  'Accounting and Finance BSc (Hons): £19,000',
  'Business Management BSc (Hons): £19,000',
  'Business Data Analytics BSc (Hons): £19,000',
  'Business Enterprise and Entrepreneurship BSc (Hons): £19,000',
  'Tourism Management BSc (Hons): £19,000',
  '## Accounting, Banking and Finance, Business, Management and Marketing: MBA (£20,500)',
  'Banking and Finance MBA',
  'Finance MBA',
  'International Business MBA',
  'International Marketing MBA',
  'Management MBA',
  'Environmental Management MBA',
  'Law and Management MBA',
  '## Accounting, Banking and Finance, Business, Management and Marketing: MSc (£20,500)',
  'Accounting MSc',
  'Accounting and Banking MSc',
  'Accounting and Finance MSc',
  'Banking and Finance MSc',
  'Finance MSc',
  'Business Data Analytics MSc',
  'Investment Management MSc',
  'Management and Finance MSc',
  'Consumer and Digital Marketing Analytics MSc',
  '## Accounting, Banking and Finance, Business, Management and Marketing: MA (£20,500)',
  'Business & Marketing MA',
  'Management for Climate Change MA',
  '## Computer Science and Engineering',
  'Advanced Computer Science MSc: £20,500',
  'Advanced Data Science MSc: £20,500',
  'Broadband and Optical Communications MSc: £20,500',
  'Computing MSc: £20,500',
  'Computing for Data Science MSc: £20,500',
  'Artificial Intelligence and Data Science MSc: £20,500',
  'Electronic Engineering MSc: £22,500',
  '## History and Archaeology (£19,000)',
  'Global Heritage MA',
  'History MA',
  'Welsh History MA',
  '## Health Sciences (£19,000)',
  'Public Health and Health Promotion MSc',
  '## Law (£19,000)',
  'International Criminal Law and International Human Rights Law LLM',
  'International Law and Human Rights Law LLM',
  'Law LLM',
  '## Social Sciences (£19,000)',
  'Criminology and Criminal Justice MA',
  'Criminology and Law MA',
  'Criminology and Sociology MA',
  'Social Policy MA',
  'Sociology MA',
].join('\n');

const SCHOLARSHIPS = [
  '- Vice Chancellor Scholarship: £10,000.',
  '- Deans Scholarship: £6,000*.',
  '- International Scholarship: £4,000* (minimum).',
  '- *Per year of study for undergraduate programmes.',
  '- Various scholarships valued up to £10,000. More at www.bangor.ac.uk/int-scholarships.',
].join('\n');

const KEY_DATES = [
  '- Application deadline: 4 December 2026.',
  '- Deposit deadline: 15 December 2026.',
  '- CAS deadline: 23 December 2026.',
  '- Arrival date: 18 January 2027.',
  '- Class starts: 25 January 2027.',
].join('\n');

const BANGOR_DETAILS = {
  city: 'Bangor, Wales',
  website: 'https://www.bangor.ac.uk',
  location: 'Bangor, Wales, UK.',
  overview: [
    '- Institution: Bangor University (Prifysgol Bangor), Wales, UK.',
    '- Intake: January 2027 entry (Undergraduate and Postgraduate).',
    '- Living costs: budget £1,171 for each calendar month of the course, approximately £10,539 per year (based on 9 months).',
    '- Course information: www.bangor.ac.uk/international/courses/january-start',
    '- International enquiries: international@bangor.ac.uk',
  ].join('\n'),
  programs: [
    {
      name: 'Undergraduate', duration: '',
      academic: '', english: '',
      tuition: '£19,000',
      scholarship: SCHOLARSHIPS,
      deposit: '',
    },
    {
      name: 'Postgraduate', duration: '',
      academic: '', english: '',
      tuition: '£19,000 to £22,500, depending on the course (see the course list under January 2027).',
      scholarship: 'Various scholarships valued up to £10,000. More at www.bangor.ac.uk/int-scholarships.',
      deposit: '',
    },
  ],
  entryRequirements: 'The January 2027 flyer gives fees and dates only. Check the entry requirements for the course on the Bangor website before applying.',
  languageTests: '',
  courses: 'The January 2027 course list and fees are under the intakes below.',
  interview: '',
  notes: [
    '## Bangor regional team (from the flyer)',
    '- Braj Jha, Regional Manager: b.jha@bangor.ac.uk, +44 7833769210.',
    '- Rajinder Kaur, Senior Regional Officer: r.kaur@bangor.ac.uk, +91 98770 80865.',
    '- Swathy Nair, Regional Officer: s.nair@bangor.ac.uk, +91 98714 92221.',
  ].join('\n'),
  process: [
    { title: 'Application submitted', detail: '- Application deadline for January 2027: 4 December 2026.' },
    { title: 'Offer letter received' },
    { title: 'Pre-CAS interview' },
    { title: 'Tuition deposit paid', detail: '- Deposit deadline for January 2027: 15 December 2026.' },
    { title: 'CAS issued', detail: '- CAS deadline for January 2027: 23 December 2026.' },
    { title: 'Visa application', detail: '- Arrival date: 18 January 2027.\n- Class starts: 25 January 2027.' },
  ],
  intakes: [
    {
      id: 'ba2027010001',
      name: 'January 2027',
      deadline: 'Application deadline: 4 December 2026',
      requirements: KEY_DATES,
      notes: ['## Scholarships', SCHOLARSHIPS].join('\n'),
      courses: JAN_2027_COURSES,
    },
  ],
};

module.exports = { BANGOR_DETAILS };

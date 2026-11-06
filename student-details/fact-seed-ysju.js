// York St John University's Fact File page, from its MRes February 2027 intake flyer. Used as the starting
// content for York St John, the same way as fact-seed-uwl.js. A line starting with "- " is a bullet and
// "## " is a sub-heading.

const MRES_PROGRAMMES = [
  '## York Campus',
  'MRes in Business',
  '## London Campus',
  'MRes Management Studies',
].join('\n');

const YSJU_DETAILS = {
  city: 'York and London',
  website: 'https://www.yorksj.ac.uk',
  location: 'Two campuses: York and London. The English language requirements differ between them.',
  overview: [
    '- Institution: York St John University (YSJU).',
    '- Programme: MRes, February 2027 intake.',
    '- Campuses: York and London.',
    '- Tuition fee: £11,800. Duration: 1 year.',
    '- Supervisors are allocated for each student.',
  ].join('\n'),
  programs: [
    {
      name: 'MRes', duration: '1 Year',
      academic: 'First Division in Bachelor\'s or Master\'s degree',
      english: 'IELTS 6.5 overall, PTE 64 overall, Duolingo 120 overall. The component scores differ by campus: see the language test section.',
      tuition: '£11,800',
      scholarship: '',
      deposit: '',
    },
    {
      name: 'Postgraduate (MBA, MSc, LLM, MFA)', duration: '1 or 2 Years',
      academic: [
        '- 4-year Bachelor\'s degree (Nepal), at least:',
        '- Tribhuvan University: 45%, or 2:2, or Second Division',
        '- Purbanchal University: 2.5 GPA, or 2:2, or Second Division',
        '- Pokhara University: 2.3 GPA, or 2:2, or Second Division',
        '- Kathmandu University: 55%, or 2.3 GPA, or Second Division',
        '- Far Western University: 2.5 CGPA, or 2:2, or Second Division',
        '- Midwest University: 2.5 CGPA, or 2:2, or Second Division',
        '- Lumbini Buddhist University: 2.7 GPA',
        '- GAP: can be considered',
      ].join('\n'),
      english: [
        '- IELTS: 6.0 overall (min 5.5 each band)',
        '- PTE: 59 overall (min 59 each band)',
        '- Skills for English: B2',
        '- Duolingo: 105 (Reading), 100 (Speaking, Writing, Listening 95)',
        '- LanguageCert Academic: 60 overall, minimum 65',
        '- Oxford ELLT: 6 overall (min 5 each band)',
        '- English waiver: Tribhuvan University 60% or CGPA B or First Division; Purbanchal University 3.0 CGPA or First Division; Pokhara University 3.0 CGPA or First Division; Kathmandu University 3.0 CGPA, or 65%, or First Division; Far Western University 3.0 CGPA or First Division; Mid-West University 3.0 CGPA or First Division; Lumbini Buddhist University 3.0 CGPA',
        '- Waiver also for graduates of a UK university or a TNE partner, with the medium of instruction valid from 2021 onwards',
      ].join('\n'),
      tuition: 'MBA: 1 year £12,000, 2 years £15,600\n\nMSc courses: 1 year £11,800, 2 years £15,400\n\nLLM courses: 1 year £14,900\n\nMFA Creative Writing: 1 year £14,900',
      scholarship: '5% early payment discount if the full fees are paid.',
      deposit: '50% of the total fees to issue the CAS',
    },
  ],
  entryRequirements: [
    '- Academic: First Division in Bachelor\'s or Master\'s degree.',
    '- Tuition fee: £11,800. Duration: 1 year.',
    '- Research proposal: mandatory (up to 1,500 words).',
    '- SOP: up to 1,000 words, in the university format.',
    '- MRes consent form: required.',
    '- General consent form: required.',
    '- Supervisors are allocated for each student.',
  ].join('\n'),
  languageTests: [
    '## York Campus',
    '- IELTS: overall 6.5. Writing 6.5. Reading, Listening and Speaking: minimum 6.0 each.',
    '- PTE: overall 64. Writing 64. Reading, Listening and Speaking: minimum 59 each.',
    '- Duolingo: overall 120. Writing 130. Reading, Listening and Speaking: minimum 110 each.',
    '## London Campus',
    '- IELTS: overall 6.5. Minimum 6.0 in each component.',
    '- PTE: overall 64. Minimum 59 in each component.',
    '- Duolingo: overall 120. Minimum 110 in each component.',
    '## Important',
    '- No English language waiver is available, including for graduates from UK-affiliated universities.',
    '- A compulsory IELTS, PTE or Duolingo score (EPT) is required.',
  ].join('\n'),
  courses: MRES_PROGRAMMES,
  notes: [
    '- No English language waiver is available, including for graduates from UK-affiliated universities.',
    '- Make sure applicants meet the academic, English language and documentation requirements before submitting the application.',
  ].join('\n'),
  process: [
    { title: 'Application submitted', detail: [
      '- All academic documents.',
      '- Passport.',
      '- Compulsory IELTS, PTE or Duolingo score (EPT).',
      '- Research proposal: up to 1,500 words.',
      '- 1 reference dated within the last 12 months (academic or professional).',
      '- Updated CV.',
      '- SOP: up to 1,000 words, in the university format.',
      '- Consent forms: the MRes consent form and the general consent form.',
    ].join('\n') },
    { title: 'Offer letter received' },
    { title: 'Pre-CAS interview' },
    { title: 'Tuition deposit paid' },
    { title: 'CAS issued' },
    { title: 'Visa application' },
  ],
  intakes: [
    { id: 'fe2027000002', name: 'February 2027', deadline: '', requirements: '', notes: '', courses: MRES_PROGRAMMES },
  ],
};

module.exports = { YSJU_DETAILS };

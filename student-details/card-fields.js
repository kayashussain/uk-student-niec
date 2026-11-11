// What a student card holds besides the sheet: the choices of every dropdown on the card, the documents a
// student is asked for, and the names of the details. Kept in one place so the card page, the server and the
// Dashboard all read the same lists (a choice added here appears everywhere at once).
// Loaded by the pages as window.CardFields and by the server and the tests with require.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardFields = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  // How a student who did not walk in found NIEC. Used on its own for a branch's students too.
  const CHANNELS = [
    'Facebook page', 'Facebook or Instagram advert (Meta Ads)', 'Instagram', 'TikTok', 'WhatsApp', 'Messenger',
    'YouTube', 'LinkedIn', 'Viber', 'Website form', 'Google search or Maps', 'Other',
  ];
  // "Where exactly": the second step of each Student Source on the sheet. An empty list means the name is typed
  // or picked from another list (an event from the Events list, a B2B partner from the B2B Partners page).
  const SOURCE_DETAILS = {
    'Social Media': ['Facebook page', 'Facebook or Instagram advert (Meta Ads)', 'Instagram', 'TikTok', 'WhatsApp', 'Messenger', 'YouTube', 'LinkedIn', 'Viber', 'Other social media'],
    Visitor: ['Walked in', 'Phone call', 'Website form', 'Google search or Maps', 'Signboard or hoarding', 'Newspaper, radio or TV', 'Other'],
    Reference: ['Current or past NIEC student', 'Friend or family of the student', 'NIEC staff member', 'Teacher or college', 'Other person'],
    'Language Classes': ['IELTS class', 'PTE class', 'Other class'],
    Events: [],
    Agent: [],
    'Chitwan Branch': CHANNELS.concat(['Walked in', 'Phone call', 'Reference', 'Event']),
    'Pokhara Branch': CHANNELS.concat(['Walked in', 'Phone call', 'Reference', 'Event']),
  };
  // What the "where exactly" box is called for each source.
  const SOURCE_DETAIL_LABEL = {
    'Social Media': 'Which platform', Visitor: 'How they reached us', Reference: 'Who referred them', 'Language Classes': 'Which class',
    Events: 'Which event', Agent: 'Which B2B partner (sub-agent)', 'Chitwan Branch': 'How the branch got them', 'Pokhara Branch': 'How the branch got them',
  };

  const LEAD_QUALITY = [
    { key: 'Hot', text: 'Hot: ready to apply now' },
    { key: 'Warm', text: 'Warm: interested, needs follow-up' },
    { key: 'Cold', text: 'Cold: only asking for now' },
    { key: 'Not eligible', text: 'Not eligible yet (grades, English or funds)' },
    { key: 'Unreachable', text: 'Not reachable' },
  ];
  const STUDY_LEVELS = ['Foundation', 'Undergraduate', 'Top-up (final year)', 'Pre-Masters', 'Postgraduate', 'MBA', 'MRes or PhD'];
  const QUALIFICATIONS = ['SEE (Grade 10)', '+2 or Grade 12', 'A Levels', 'Diploma or PCL', 'Bachelor (3 years)', 'Bachelor (4 years)', 'Masters'];
  const ENGLISH_TESTS = ['IELTS Academic', 'IELTS UKVI', 'PTE Academic', 'PTE UKVI', 'Duolingo', 'TOEFL iBT', 'OET', 'University internal test', 'MOI or waiver', 'Not taken yet'];
  // Why a student did not go on. Fixed choices, so the Dashboard can count them (free typing would give ten spellings of one reason).
  const LOST_REASONS = [
    'Chose another consultancy', 'Applied by themselves', 'Chose another country', 'Fees or deposit too high',
    'Funds or bank balance not ready', 'English score not enough', 'Grades or study gap not accepted',
    'Course or university not available with us', 'University rejected the application', 'Failed the credibility or Pre-CAS interview',
    'Visa refused', 'Family or personal decision', 'Postponed to a later intake', 'Stopped answering', 'Duplicate or wrong entry', 'Other',
  ];
  // The stages at which a lost reason is asked for.
  const LOST_STAGES = ['Withdrawn', 'Hold', 'Defer', 'Visa Rejected'];
  const NOTE_KINDS = [
    { key: 'note', text: 'Note' }, { key: 'call', text: 'Phone call' }, { key: 'meeting', text: 'Office visit' }, { key: 'message', text: 'Message' },
  ];

  // The documents a student is asked for. `when`: the step it is needed at; `levels`: who needs it (all levels when left out).
  const DOCUMENTS = [
    { key: 'passport', text: 'Passport (the page with the photo)', when: 'Application' },
    { key: 'see', text: 'SEE (Grade 10) mark sheet and certificate', when: 'Application' },
    { key: 'plus2', text: '+2 (Grade 12) transcript, certificate and character certificate', when: 'Application' },
    { key: 'bachelor', text: 'Bachelor transcript, degree certificate and character certificate', when: 'Application', levels: ['Pre-Masters', 'Postgraduate', 'MBA', 'MRes or PhD'] },
    { key: 'english', text: 'English test result (IELTS, PTE or other), or the MOI letter', when: 'Application' },
    { key: 'cv', text: 'CV (up to date)', when: 'Application' },
    { key: 'sop', text: 'Statement of purpose (SOP)', when: 'Application' },
    { key: 'lor', text: 'Two recommendation letters (teacher or employer)', when: 'Application', levels: ['Top-up (final year)', 'Pre-Masters', 'Postgraduate', 'MBA', 'MRes or PhD'] },
    { key: 'work', text: 'Work experience letters (for any study gap)', when: 'Application' },
    { key: 'refusal', text: 'Any earlier visa refusal letter (any country)', when: 'Application' },
    { key: 'deposit', text: 'Tuition deposit receipt', when: 'CAS' },
    { key: 'bank', text: 'Bank statement or loan letter (funds held for 28 days)', when: 'CAS' },
    { key: 'noc', text: 'No Objection Certificate (NOC) from the Ministry of Education', when: 'CAS' },
    { key: 'tb', text: 'TB test certificate from an approved clinic', when: 'Visa' },
    { key: 'cas', text: 'CAS statement from the university', when: 'Visa' },
  ];
  // The documents for a study level. With no level known, only the ones every student needs (`all`: every document,
  // for the checklist on the card, where a tick can be put on any of them).
  const documentsFor = (level, { all = false } = {}) => DOCUMENTS.filter((d) => all || !d.levels || (level && d.levels.includes(level)));

  // The details kept on the card, with the name shown and how each is typed. `list` names one of the lists above.
  const PROFILE_FIELDS = [
    { key: 'sourceDetail', label: 'Where exactly', max: 120 },
    { key: 'referredBy', label: 'Name of the person, event or partner', max: 120 },
    { key: 'campaign', label: 'Campaign or advert', max: 120 },
    { key: 'inquiryDate', label: 'First inquiry day', type: 'date' },
    { key: 'counselor', label: 'Counselor', max: 60 },
    { key: 'leadQuality', label: 'Lead quality', list: 'LEAD_QUALITY' },
    { key: 'studyLevel', label: 'Study level wanted', list: 'STUDY_LEVELS' },
    { key: 'courseInterest', label: 'Course or subject wanted', max: 160 },
    { key: 'preferredIntake', label: 'Intake wanted', max: 60 },
    { key: 'budget', label: 'Budget for the first year (GBP)', max: 60 },
    { key: 'district', label: 'Home district', max: 60 },
    { key: 'qualification', label: 'Highest qualification', list: 'QUALIFICATIONS' },
    { key: 'grade', label: 'GPA or percentage', max: 40 },
    { key: 'passedYear', label: 'Year passed', max: 10 },
    { key: 'englishTest', label: 'English test', list: 'ENGLISH_TESTS' },
    { key: 'englishScore', label: 'English score', max: 60 },
    { key: 'lostReason', label: 'Why the student did not go on', list: 'LOST_REASONS' },
    { key: 'wanted', label: 'What the student wanted that we could not offer', max: 300 },
  ];

  // The 77 districts of Nepal, for the Home district box.
  const DISTRICTS = [
    'Achham', 'Arghakhanchi', 'Baglung', 'Baitadi', 'Bajhang', 'Bajura', 'Banke', 'Bara', 'Bardiya', 'Bhaktapur', 'Bhojpur', 'Chitwan',
    'Dadeldhura', 'Dailekh', 'Dang', 'Darchula', 'Dhading', 'Dhankuta', 'Dhanusha', 'Dolakha', 'Dolpa', 'Doti', 'Eastern Rukum', 'Gorkha',
    'Gulmi', 'Humla', 'Ilam', 'Jajarkot', 'Jhapa', 'Jumla', 'Kailali', 'Kalikot', 'Kanchanpur', 'Kapilvastu', 'Kaski', 'Kathmandu',
    'Kavrepalanchok', 'Khotang', 'Lalitpur', 'Lamjung', 'Mahottari', 'Makwanpur', 'Manang', 'Morang', 'Mugu', 'Mustang', 'Myagdi',
    'Nawalpur', 'Nuwakot', 'Okhaldhunga', 'Palpa', 'Panchthar', 'Parasi', 'Parbat', 'Parsa', 'Pyuthan', 'Ramechhap', 'Rasuwa', 'Rautahat',
    'Rolpa', 'Rupandehi', 'Salyan', 'Sankhuwasabha', 'Saptari', 'Sarlahi', 'Sindhuli', 'Sindhupalchok', 'Siraha', 'Solukhumbu', 'Sunsari',
    'Surkhet', 'Syangja', 'Tanahun', 'Taplejung', 'Terhathum', 'Udayapur', 'Western Rukum',
  ];

  // The sheet's columns in the groups the card shows them in (the card never changes them: the sheet does).
  const SHEET_SECTIONS = [
    { title: 'Application', columns: ['APPLICATION STATUS', 'APPLICATION SUBMISSION DATE', 'OFFER RECEIVED DATE', 'UNIVERSITY NAME', 'COURSE NAME', 'RECEIVING PARTNER', 'UNIVERSITY PARTNER', 'LANGUAGE TEST DATE', 'STUDENT ID'] },
    { title: 'Interviews and documents', columns: ['NOC', 'NOC NUMBER', 'MOCK SCHEDULE 1', 'FEEDBACK 1', 'MOCK SCHEDULE 2', 'FEEDBACK 2', 'MOCK SCHEDULE 3', 'FEEDBACK 3', 'MOCK SCHEDULE 4', 'FEEDBACK 4', 'PRE CAS INTERVIEW', 'MEDICAL REPORT'] },
    { title: 'Fees and payment', columns: ['GROSS FEE', 'SCHOLARSHIP', 'FEE AFTER SCHOLARSHIP', 'EARLY BIRD DISCOUNT', 'ADDITIONAL DISCOUNT', 'TUITION FEE DEPOSIT(1st Installment)', 'TUITION FEE DEPOSIT(2nd Installment)', 'TUITION FEE DEPOSIT(3rd Installment)', 'REMAINING TUITION FEE', 'PAYMENT DATE'] },
    { title: 'CAS and visa', columns: ['CAS REQUESTED DATE', 'CAS RECEIVED DATE', 'VISA LODGE DATE', 'VFS ATTENDED DATE', 'VISA RECEIVED DATE', 'E-VISA', 'UK CONTACT NUMBER'] },
  ];
  const COLUMN_LABELS = {
    'APPLICATION STATUS': 'Stage', 'APPLICATION SUBMISSION DATE': 'Application submitted', 'OFFER RECEIVED DATE': 'Offer received',
    'CONTACT NUMBER': 'Contact number (WhatsApp)', 'LANGUAGE TEST DATE': 'Language test', 'GROSS FEE': 'Gross fee (£)', SCHOLARSHIP: 'Scholarship (£ or %)',
    'FEE AFTER SCHOLARSHIP': 'Fee after scholarship (£)', 'EARLY BIRD DISCOUNT': 'Early bird discount (£ or %)', 'ADDITIONAL DISCOUNT': 'Additional discount (£)',
    'TUITION FEE DEPOSIT(1st Installment)': '1st installment paid (£)', 'TUITION FEE DEPOSIT(2nd Installment)': '2nd installment paid (£)',
    'TUITION FEE DEPOSIT(3rd Installment)': '3rd installment paid (£)', 'REMAINING TUITION FEE': 'Remaining tuition fee (£)',
    'PRE CAS INTERVIEW': 'Pre-CAS interview', 'E-VISA': 'E-Visa',
  };
  const KEEP_CAPS = new Set(['CAS', 'NOC', 'UK', 'VFS', 'ID']);
  const columnLabel = (col) => COLUMN_LABELS[col] || String(col).split(' ')
    .map((w, i) => (KEEP_CAPS.has(w) ? w : (i === 0 ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase()))).join(' ');

  // A Nepal mobile number as WhatsApp wants it (country code, digits only): "9801234567" and "+977 980-1234567"
  // both become "9779801234567". A number that already carries another country code is kept. '' when it is not a number.
  function whatsappNumber(raw) {
    let d = String(raw ?? '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    else if (d.startsWith('00')) d = d.slice(2);
    else if (/^9[678]\d{8}$/.test(d)) d = '977' + d; // a Nepal mobile typed without the country code
    else if (/^0\d{9,10}$/.test(d)) d = '977' + d.slice(1);
    d = d.replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 ? d : '';
  }

  return {
    CHANNELS, SOURCE_DETAILS, SOURCE_DETAIL_LABEL, LEAD_QUALITY, STUDY_LEVELS, QUALIFICATIONS, ENGLISH_TESTS, LOST_REASONS, LOST_STAGES,
    NOTE_KINDS, DOCUMENTS, documentsFor, PROFILE_FIELDS, DISTRICTS, SHEET_SECTIONS, columnLabel, whatsappNumber,
  };
});

// What a student card holds besides the sheet: the choices of every dropdown on the card, the documents a
// student is asked for, and the names of the details. Kept in one place so the card page, the server and the
// Dashboard all read the same lists (a choice added here appears everywhere at once).
// Loaded by the pages as window.CardFields and by the server and the tests with require.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardFields = factory();
})(typeof self !== 'undefined' ? self : this, () => {
  // "Where exactly": the second step of each Student Source. Each list is only the starting choices: anyone can add a choice
  // that is missing (a new platform, a new event with its date) and it is then offered to everyone, so every student of the
  // same platform or event is tagged with the very same words (see source-options.js). Events and B2B partners have no
  // starting choices: an event is added with its date, a B2B partner comes from the B2B Partners page.
  // The branches. To add a branch, add its name here and in the Users page list of branch teams (shared/teams.js reads this list):
  // the Student Source is then "<name> Branch" (for example "Chitwan Branch"), which is how the incentive sums and the branch
  // accounts have always recognised a branch student.
  const BRANCHES = ['Chitwan', 'Pokhara', 'Palpa', 'Butwal'];
  const branchValue = (name) => `${name} Branch`;
  const isBranchValue = (v) => /\S\s+branch$/i.test(String(v || '').trim());
  // The Student Source as the forms show it (Branch is one choice with a second dropdown) and as the sheet keeps it ("Chitwan Branch").
  const sourceGroup = (stored) => (isBranchValue(stored) ? 'Branch' : String(stored || '').trim());
  const branchName = (stored) => String(stored || '').trim().replace(/\s+branch$/i, '');
  const storedSource = (group, detail) => (group === 'Branch' ? (detail ? branchValue(detail) : '') : group);
  const SOURCE_DETAILS = {
    // The platforms students really come from (the owner, 14 Nov 2026: Messenger is Facebook; no leads from YouTube, LinkedIn or Viber).
    // Then the form asks whether it was organic or an advert, and an advert is one of the campaigns on Events and marketing.
    'Social Media': ['Facebook', 'Instagram', 'TikTok', 'WhatsApp'],
    Visitor: ['Walked in', 'Phone call', 'Website form', 'Google search or Maps', 'Signboard or hoarding', 'Newspaper, radio or TV'],
    Reference: ['Current or past student', 'Friend or family of the student', 'Staff member', 'Teacher or college'],
    'Language Classes': ['IELTS class', 'PTE class'],
    Events: [],
    Agent: [],
    Branch: BRANCHES,
  };
  // What the "where exactly" box is called for each source, and the sources a new choice can be added to.
  // The values the sheet's Student Source column holds: the sources, and one "<name> Branch" for each branch.
  const STORED_SOURCES = [...Object.keys(SOURCE_DETAILS).filter((k) => k !== 'Branch'), ...BRANCHES.map(branchValue)];
  const SOURCE_DETAIL_LABEL = {
    'Social Media': 'Which platform or page', Visitor: 'How they reached us', Reference: 'Who referred them', 'Language Classes': 'Which class',
    Events: 'Which event or marketing', Agent: 'Which agent', Branch: 'Which branch',
  };
  const SOURCE_CAN_ADD = ['Social Media', 'Visitor', 'Reference', 'Language Classes', 'Events'];

  // Nepal's 77 districts, for where a student lives (the owner, 14 Nov 2026: the Dashboard's map of where students come from).
  const DISTRICTS = ["Achham", "Arghakhanchi", "Baglung", "Baitadi", "Bajhang", "Bajura", "Banke", "Bara", "Bardiya", "Bhaktapur", "Bhojpur", "Chitwan", "Dadeldhura", "Dailekh", "Dang", "Darchula", "Dhading", "Dhankuta", "Dhanusha", "Dolakha", "Dolpa", "Doti", "Gorkha", "Gulmi", "Humla", "Ilam", "Jajarkot", "Jhapa", "Jumla", "Kailali", "Kalikot", "Kanchanpur", "Kapilvastu", "Kaski", "Kathmandu", "Kavrepalanchok", "Khotang", "Lalitpur", "Lamjung", "Mahottari", "Makwanpur", "Manang", "Morang", "Mugu", "Mustang", "Myagdi", "Nawalpur (Nawalparasi East)", "Nuwakot", "Okhaldhunga", "Palpa", "Panchthar", "Parasi (Nawalparasi West)", "Parbat", "Parsa", "Pyuthan", "Ramechhap", "Rasuwa", "Rautahat", "Rolpa", "Rukum East", "Rukum West", "Rupandehi", "Salyan", "Sankhuwasabha", "Saptari", "Sarlahi", "Sindhuli", "Sindhupalchok", "Siraha", "Solukhumbu", "Sunsari", "Surkhet", "Syangja", "Tanahun", "Taplejung", "Terhathum", "Udayapur"];
  // The district of a place as people write it ("Butwal", "Pokhara-8, Kaski", "kathmandu"): a district named in it, or the district of
  // a big town. '' when it cannot be told.
  const TOWNS = { butwal: 'Rupandehi', bhairahawa: 'Rupandehi', siddharthanagar: 'Rupandehi', pokhara: 'Kaski', bharatpur: 'Chitwan', narayangarh: 'Chitwan', biratnagar: 'Morang', birgunj: 'Parsa', dharan: 'Sunsari', itahari: 'Sunsari', nepalgunj: 'Banke', dhangadhi: 'Kailali', hetauda: 'Makwanpur', janakpur: 'Dhanusha', damak: 'Jhapa', birtamod: 'Jhapa', tansen: 'Palpa', ghorahi: 'Dang', tulsipur: 'Dang', patan: 'Lalitpur', kirtipur: 'Kathmandu', banepa: 'Kavrepalanchok', dhulikhel: 'Kavrepalanchok', kavre: 'Kavrepalanchok', mahendranagar: 'Kanchanpur', birendranagar: 'Surkhet', gaur: 'Rautahat', kalaiya: 'Bara', lahan: 'Siraha', rajbiraj: 'Saptari', waling: 'Syangja', damauli: 'Tanahun', baglung: 'Baglung', besisahar: 'Lamjung', gorkha: 'Gorkha', bidur: 'Nuwakot', ilam: 'Ilam', nawalparasi: 'Nawalpur (Nawalparasi East)', kawasoti: 'Nawalpur (Nawalparasi East)', parasi: 'Parasi (Nawalparasi West)', ktm: 'Kathmandu' };
  function districtOf(place) {
    const t = String(place || '').toLowerCase();
    if (!t.trim()) return '';
    const named = DISTRICTS.find((d) => t.includes(d.toLowerCase().replace(/\s*\(.*\)$/, '')));
    if (named) return named;
    const town = Object.keys(TOWNS).find((k) => new RegExp(`\\b${k}\\b`).test(t));
    return town ? TOWNS[town] : '';
  }
  const NATIONALITIES = ['Nepali', 'Indian', 'Chinese', 'Bangladeshi', 'Bhutanese', 'Sri Lankan', 'Pakistani', 'Other'];
  const SOURCE_WAYS = ['Organic', 'Advert'];
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
  // The kinds notes were once kept with. A new note is always a plain note (the owner, 14 Nov 2026); the others stay readable.
  const NOTE_KINDS = [
    { key: 'note', text: 'Note' }, { key: 'call', text: 'Phone call' }, { key: 'meeting', text: 'Office visit' }, { key: 'message', text: 'Message' },
  ];

  // The documents a student is asked for to apply (the checklist that goes in the email). CAS and visa documents are asked
  // for later, in person.
  const DOCUMENTS = [
    { key: 'passport', text: 'Passport (the page with the photo)' },
    { key: 'see', text: 'SEE (Grade 10) mark sheet and certificate' },
    { key: 'plus2', text: '+2 (Grade 12) transcript, certificate and character certificate' },
    { key: 'bachelor', text: 'Bachelor transcript, degree certificate and character certificate', levels: ['Pre-Masters', 'Postgraduate', 'MBA', 'MRes or PhD'] },
    { key: 'english', text: 'English test result (IELTS, PTE or other), or the MOI letter' },
    { key: 'cv', text: 'CV (up to date)' },
    { key: 'sop', text: 'Statement of purpose (SOP)' },
    { key: 'lor', text: 'Two recommendation letters (teacher or employer)', levels: ['Top-up (final year)', 'Pre-Masters', 'Postgraduate', 'MBA', 'MRes or PhD'] },
    { key: 'work', text: 'Work experience letters (for any study gap)' },
    { key: 'refusal', text: 'Any earlier visa refusal letter (any country)' },
  ];
  // The documents for a study level. With no level known, only the ones every student needs.
  const documentsFor = (level) => DOCUMENTS.filter((d) => !d.levels || (level && d.levels.includes(level)));

  // The details kept on the card, with the name shown and how each is typed. `list` names one of the lists above.
  const PROFILE_FIELDS = [
    { key: 'sourceDetail', label: 'Where exactly', max: 120 },
    { key: 'sourceRemarks', label: 'Campaign or remarks', max: 160 },
    { key: 'inquiryDate', label: 'First inquiry day', type: 'date' },
    { key: 'studyLevel', label: 'Study level', list: 'STUDY_LEVELS' },
    { key: 'qualification', label: 'Highest qualification', list: 'QUALIFICATIONS' },
    { key: 'grade', label: 'GPA or percentage', max: 40 },
    { key: 'passedYear', label: 'Year passed', max: 10 },
    { key: 'gapYears', label: 'Study gap (years)', max: 4 },
    { key: 'englishTest', label: 'English test', list: 'ENGLISH_TESTS' },
    { key: 'englishScore', label: 'English score', max: 60 },
    { key: 'budget', label: 'Budget for the first year (GBP)', max: 60 },
    { key: 'location', label: 'Where in the UK', max: 120 },
    { key: 'subject', label: 'Subject or course wanted', max: 160 },
    { key: 'lostReason', label: 'Why the student did not go on', list: 'LOST_REASONS' },
    // From the passport (the owner, 14 Nov 2026): the date of birth, the passport number, the address as written in it and the
    // nationality. The address gives the district for the Dashboard's map; the nationality counts the students from outside Nepal.
    { key: 'dob', label: 'Date of birth', type: 'date' },
    { key: 'passportNo', label: 'Passport number', max: 20 },
    { key: 'address', label: 'Address (as in the passport)', max: 200 },
    { key: 'nationality', label: 'Nationality', list: 'NATIONALITIES' },
    // How a Social Media student came: the platform, and whether by itself or from an advert (the advert is the campaign in
    // sourceDetail, so it is counted in its cost).
    { key: 'sourcePlatform', label: 'Platform', max: 40 },
    { key: 'sourceWay', label: 'Organic or advert', list: 'SOURCE_WAYS' },
    // Kept only so the few values saved on 14 Nov 2026 are not lost; no longer asked (the address replaces them).
    { key: 'livesIn', label: 'Lived in (district)', list: 'DISTRICTS' },
    { key: 'homeDistrict', label: 'Home district', list: 'DISTRICTS' },
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
  // A search for the course page, for a course with no link written down yet (the first result is normally the university's own course page).
  const courseSearchUrl = (o) => 'https://www.google.com/search?q=' + encodeURIComponent(`${o.course || ''} ${o.university || ''} course page UK`.replace(/\s+/g, ' ').trim());
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
    BRANCHES, STORED_SOURCES, branchValue, isBranchValue, sourceGroup, branchName, storedSource,
    SOURCE_DETAILS, SOURCE_DETAIL_LABEL, SOURCE_CAN_ADD, STUDY_LEVELS, QUALIFICATIONS, ENGLISH_TESTS, LOST_REASONS, LOST_STAGES,
    DISTRICTS, districtOf, NATIONALITIES, SOURCE_WAYS, NOTE_KINDS, DOCUMENTS, documentsFor, PROFILE_FIELDS, SHEET_SECTIONS, columnLabel, whatsappNumber, courseSearchUrl,
  };
});

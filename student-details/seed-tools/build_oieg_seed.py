#!/usr/bin/env python3
"""Reads the two OIEG requirement sheets (Oxford Direct and Pathways) and writes fact-seed-oieg.json.

Usage: python3 build_oieg_seed.py OXFORD.xlsx PATHWAYS.xlsx ../fact-seed-oieg.json

The output holds, for each university: its requirement rows (programs), the key dates per intake, the courses
that are offered per intake, and notes. facts.js adds this to the Fact File without overwriting anything that is
already there (see fact-merge.js). No dashes are written (the project does not allow them).
"""
import json
import re
import sys
from datetime import datetime

import openpyxl

MONTHS = {'jan': 'January', 'feb': 'February', 'mar': 'March', 'apr': 'April', 'may': 'May', 'jun': 'June', 'jul': 'July',
          'aug': 'August', 'sep': 'September', 'oct': 'October', 'nov': 'November', 'dec': 'December'}


def plain(v):
    """A cell as clean text: no dashes, no stray spaces, amounts like 16950 GBP written as £16,950."""
    if v is None:
        return ''
    if isinstance(v, datetime):
        return fmt_date(v)
    s = str(v).replace('\u2014', '-').replace('\u2013', '-').replace('’', "'").replace('‘', "'")
    s = s.replace('“', '"').replace('”', '"').replace('•', '-').replace('\xa0', ' ')
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\s*\n\s*', '\n', s).strip()
    for wrong, right in (('evidience', 'evidence'), ('Tution', 'Tuition'), ('remaning', 'remaining'), ('recognied', 'recognised'),
                         ('Univeristy', 'University'), ('Interational', 'International'), ('compulsiory', 'compulsory'), ('Architechture', 'Architecture')):
        s = s.replace(wrong, right)
    s = re.sub(r'\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day,?\s+', '', s)
    s = re.sub(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(\d{4})', lambda m: f"{int(m.group(2))} {m.group(1)} {m.group(3)}", s)
    s = re.sub(r'\b(\d{1,2})(?:st|nd|rd|th)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})', lambda m: f"{int(m.group(1))} {m.group(2)} {m.group(3)}", s)
    return money(s)


def money(s):
    def amount(m):
        return '£' + format(int(m.group(1).replace(',', '')), ',')
    s = re.sub(r'(?<![\d.,£])(\d{1,3}(?:,\d{3})+|\d{3,6})\s*GBP\b', amount, s)
    s = re.sub(r'\bGBP\s*(\d{1,3}(?:,\d{3})+|\d{3,6})\b', amount, s)
    s = re.sub(r'(?<![£\d,.])(\d{4,5})(?=\s+to\s+£)', lambda m: '£' + format(int(m.group(1)), ','), s)
    s = re.sub(r'(?<![£\d,.])(\d{4,5})(?=\s+and\s+(?:full|Full)\s+fees)', lambda m: '£' + format(int(m.group(1)), ','), s)
    s = re.sub(r'£\s+', '£', s)
    return s


def fmt_date(d):
    return f"{d.day} {d.strftime('%b %Y')}"


def valid_date(v):
    return isinstance(v, datetime) and 2025 <= v.year <= 2035


def cell(row, i):
    return plain(row[i]) if i < len(row) else ''


def one_line(s):
    return re.sub(r'\s*\n\s*', '; ', s).strip()


# ---- which Fact File page a name in the sheets belongs to ----
EXISTING = {
    'roehampton': 'university of roehampton',
    'ravensbourne': 'university of ravensbourne',
    'winchester': 'winchester university',
    'health sciences university': 'health science university',
    'hsu': 'health science university',
    'bgu': 'lincoln bishop university',
    'lincoln': 'lincoln bishop university',
    'greenwich': 'university of greenwich international college (ugic)',
    'ugic': 'university of greenwich international college (ugic)',
    'bangor university international': 'bangor university international college (buic)',
    'buic': 'bangor university international college (buic)',
    'bradford international': 'university of bradford international college (ubic)',
    'ubic': 'university of bradford international college (ubic)',
    'edinburgh napier university international': 'edinburgh napier university international college (enuic)',
    'enuic': 'edinburgh napier university international college (enuic)',
    'dundee': 'international college of dundee (icd)-scotland',
    'icd': 'international college of dundee (icd)-scotland',
    'kent': 'university of kent international college (ukic)',
    'ukic': 'university of kent international college (ukic)',
    'ulster': 'ulster university',
    'shu': 'sheffield hallam university',
    'sheffield hallam': 'sheffield hallam university',
    'bradford': 'university of bradford',
}
NEW_NAMES = {
    'lincoln bishop university': ('Lincoln Bishop University', 'Lincoln'),
    'sheffield hallam university': ('Sheffield Hallam University', 'Sheffield'),
}


def key_for(text):
    t = text.lower()
    if 'bradford' in t and ('international college' in t or 'ubic' in t):
        return EXISTING['ubic']
    for frag in sorted(EXISTING, key=len, reverse=True):
        if re.search(r'\b' + re.escape(frag) + r'\b', t):
            return EXISTING[frag]
    return None


OUT = {}


def entry(key):
    if key not in OUT:
        name, city = NEW_NAMES.get(key, ('', ''))
        OUT[key] = {'name': name, 'isNew': key in NEW_NAMES, 'city': city, 'programs': [], 'intakes': {}, 'courses': [], 'notes': []}
    return OUT[key]


def add_note(key, line):
    line = line.strip()
    if line and line not in entry(key)['notes']:
        entry(key)['notes'].append(line)


def intake(key, label):
    return entry(key)['intakes'].setdefault(label, {'deadline': '', 'keyDates': []})


# ---- levels ----
def level_name(s):
    t = s.strip().rstrip('/').strip()
    low = t.lower()
    fixed = {'post-graduate': 'Postgraduate', 'post graduate': 'Postgraduate', 'under-graduate': 'Undergraduate', 'under graduate': 'Undergraduate'}
    if low in fixed:
        return fixed[low]
    return re.sub(r'^(BSC|MSC|MBA)\b', lambda m: {'BSC': 'BSc', 'MSC': 'MSc', 'MBA': 'MBA'}[m.group(1)], t)


GAP_BOILER = re.compile(r"recent uk visa refusal won't be accepted", re.I)


def short_refusal(s):
    if GAP_BOILER.search(s):
        return ("Recent UK visa refusal is not accepted; a refusal of at least 12 months ago can be considered with the refusal letter. "
                "A refusal from another country is accepted with no time limit, but the refusal letter is strictly needed.")
    return s


def program(key, name, academic='', english='', gap='', refusal='', tuition='', scholarship='', deposit='', extra=''):
    p = {'name': level_name(name), 'academic': academic, 'english': english, 'gap': gap, 'refusal': short_refusal(refusal),
         'tuition': tuition, 'scholarship': scholarship, 'deposit': deposit, 'extra': extra}
    if p['name']:
        entry(key)['programs'].append(p)


# ---- Oxford Direct: Entry Requirement ----
def oxford_requirements(ws):
    current = None
    for row in ws.iter_rows(values_only=True):
        c = [plain(v) for v in row]
        while len(c) < 12:
            c.append('')
        if not any(c):
            continue
        if c[1] == 'Programs':
            current = key_for(c[0])
            continue
        k = key_for(c[0]) or current
        if not k:
            continue
        if not c[1] and c[0].lower().startswith('ravensbourne 12th'):
            add_note(k, 'English waiver calculation for the 12th grade: ' + one_line(c[0].split('=', 1)[0].replace('Ravensbourne 12th English Calculation', '').strip() + ' ' + c[0].split('=', 1)[-1]) if False else
                     'English waiver: the 12th grade English score is worked out as theory x 75% + internal x 25%, and must be at least 2.8.')
            continue
        if not c[1] or not (c[2] or c[3]):
            continue
        extra = ''
        if c[10]:
            extra = c[10]
        program(k, c[1], academic=c[2], english=join_english(c[3], c[4]), gap=c[5], refusal=c[6], tuition=c[7], scholarship=c[8], deposit=c[9], extra=extra)


def join_english(ielts, pte):
    parts = []
    if ielts:
        parts.append(ielts if re.search(r'ielts', ielts, re.I) else 'IELTS: ' + ielts)
    if pte:
        parts.append(pte if re.search(r'pte', pte, re.I) else 'PTE: ' + pte)
    return '\n'.join(parts)


# ---- Pathways: requirements ----
def pathways_requirements(ws):
    waiver = ''
    for row in ws.iter_rows(min_row=2, values_only=True):
        c = [plain(v) for v in row]
        while len(c) < 10:
            c.append('')
        if not any(c):
            continue
        k = key_for(c[0])
        if c[0].lower().startswith('ielts waiver') and not c[1]:
            waiver = c[0]
            continue
        if c[1].lower().startswith('ielts waiver') and k:
            add_note(k, 'English waiver: ' + c[1].replace('IELTS Waiver', 'IELTS is waived').replace('Applicable for', 'applies to'))
            continue
        if not k or not c[1] or not c[2]:
            continue
        if waiver:
            add_note(k, 'English waiver: ' + waiver.replace('IELTS Waiver if', 'IELTS is waived if').replace('(Applicable for all programs including premasters)', '(applies to all programs including pre masters)'))
        tuition = '\n'.join(x for x in [('Pathway fee: ' + c[5]) if c[5] else '', ('University fee: ' + c[7]) if c[7] else ''] if x)
        scholarship = '\n'.join(x for x in [('Pathway scholarship: ' + c[6]) if c[6] else '', ('Progression scholarship: ' + c[8]) if c[8] else ''] if x)
        program(k, c[1], academic=c[2], english=c[3], gap=c[4], tuition=tuition, scholarship=scholarship, deposit=c[9])


# ---- key dates and CAS deadlines ----
def label_for(h):
    h = h.lower()
    if 'uo request' in h and 'priority' in h:
        return 'priority UO request by'
    if 'uo request' in h:
        return 'UO request by'
    if 'cas' in h and 'priority' in h:
        return 'priority CAS request by'
    if 'cas' in h and 'standard' in h:
        return 'standard CAS request by'
    if 'cas issuance' in h:
        return 'CAS issued by'
    if 'cas req' in h or ('cas' in h and 'deadline' in h):
        return 'CAS request by'
    if 'differential' in h:
        return 'CAS request with extra evidence by'
    if 'unconditional offer' in h:
        return 'unconditional offer (no CAS) by'
    if 'early bird' in h:
        return 'early bird until'
    if 'enrolment' in h or 'enrollment' in h:
        return 'latest enrolment'
    if 'welcome' in h or 'induction' in h and 'start' in h:
        return 'welcome week'
    if h.startswith('uni') and 'start' in h:
        return 'university starts'
    if h.startswith('uni') and 'end' in h:
        return 'university ends'
    if 'start' in h or 'teaching' in h:
        return 'starts'
    if 'end' in h:
        return 'ends'
    if 'ielts' in h:
        return 'English'
    return ''


def month_year(text, fallback=None):
    m = re.search(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*(\d{1,2}(?:st|nd|rd|th)?,?\s*)?(\d{4}|\d{2})\b', text, re.I)
    if m:
        y = m.group(3)
        y = int(y) + (2000 if len(y) == 2 else 0)
        return f"{MONTHS[m.group(1).lower()[:3]]} {y}"
    m = re.search(r'\b(\d{1,2})(?:st|nd|rd|th|h)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{4}|\d{2})\b', text, re.I)
    if m:
        y = m.group(3)
        y = int(y) + (2000 if len(y) == 2 else 0)
        return f"{MONTHS[m.group(2).lower()[:3]]} {y}"
    if isinstance(fallback, datetime) and valid_date(fallback):
        return f"{fallback.strftime('%B')} {fallback.year}"
    return ''


def key_dates(ws):
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    current, header, pending_intake = None, None, ''
    for r in rows:
        cells = [plain(v) for v in r]
        filled = [(i, v) for i, v in enumerate(r) if v not in (None, '')]
        if not filled:
            continue
        texts = [(i, plain(v)) for i, v in filled if not isinstance(v, datetime)]
        # A title row: names the university, nothing else on the row (apart from a date that names the intake).
        non_title_cells = [(i, v) for i, v in filled if not isinstance(v, datetime)]
        title_key = None
        if len(non_title_cells) == 1:
            title_key = key_for(plain(non_title_cells[0][1]))
            if title_key is None and 'cas deadline' in plain(non_title_cells[0][1]).lower():
                title_key = key_for(plain(non_title_cells[0][1]).replace('CAS Deadline', ''))
        if title_key and len(filled) <= 2:
            current, header = title_key, None
            dt = next((v for i, v in filled if isinstance(v, datetime)), None)
            pending_intake = month_year('', dt) if dt else ''
            continue
        first = cells[0].lower() if cells else ''
        names = [c.lower() for c in cells]
        if any(n in ('intake', 'level') or n.startswith('course') for n in names[:3]) and sum(1 for c in cells if c) >= 3 and not any(isinstance(v, datetime) for v in r):
            header = cells
            continue
        if not current or not header:
            continue
        # a data row
        course_col = next((i for i, h in enumerate(header) if h.lower().startswith('course') or h.lower() in ('level', 'faculty')), 1)
        course = cells[course_col] if course_col < len(cells) else ''
        if course.lower() == 'all' and len(cells) > 0 and cells[0]:
            course = cells[0]
        if not course:
            continue
        start_i = next((i for i, h in enumerate(header) if 'start' in h.lower() and not h.lower().startswith('uni')), None)
        start_text = cells[start_i] if start_i is not None and start_i < len(cells) else ''
        fb = r[0] if isinstance(r[0], datetime) else None
        # The Intake column holds a date; "Nov-26" or "Jan-27" typed into Excel became the 26th of November or the 27th of
        # January, so a date that is not the 1st of a month means month and (20)day-of-month as the year.
        label = ''
        if fb is not None and fb.year >= 2025:
            label = f"{fb.strftime('%B')} {fb.year if fb.day == 1 else 2000 + fb.day}"
        label = label or month_year(start_text, None) or pending_intake or month_year(cells[3] if len(cells) > 3 else '')
        if not label:
            continue
        parts = []
        for i, h in enumerate(header):
            if i == course_col or i >= len(r):
                continue
            lab = label_for(h)
            v = r[i]
            if not lab or v in (None, ''):
                continue
            if isinstance(v, datetime):
                if not valid_date(v):
                    continue
                txt = fmt_date(v)
            else:
                txt = plain(v)
                if txt.lower() in ('n/a', 'na', '-'):
                    continue
                if re.fullmatch(r'\d{4}-\d{2}-\d{2}.*', txt):
                    continue
            parts.append(f'{lab} {txt}')
        # Sheffield Hallam has no requirements table: its English requirement per course is in this sheet.
        if current == 'sheffield hallam university':
            eng = next((plain(r[i]) for i, h in enumerate(header) if 'ielts' in h.lower() and i < len(r) and r[i] not in (None, '')), '')
            if eng and not any(p['name'] == level_name(course) for p in entry(current)['programs']):
                program(current, course, english=eng)
        if parts:
            slot = intake(current, label)
            line = f"{course}: " + ', '.join(parts)
            if line not in slot['keyDates']:
                slot['keyDates'].append(line)
            std = next((p for p in parts if p.startswith('standard CAS request by') or p.startswith('CAS request by')), '')
            if std and not slot['deadline'] and not std.rstrip().upper().endswith('TBC'):
                slot['deadline'] = std[0].upper() + std[1:]


# ---- courses ----
INTAKE_BY_COLUMN = {'jan': 'January 2027', 'apr': 'April 2027', 'sep': 'September 2027', 'nov': 'November 2026', 'jun': 'June 2027'}


def intake_columns(header_cell):
    t = plain(header_cell).lower()
    if not t:
        return []
    if t.startswith('nov/jan'):
        return ['November 2026', 'January 2027']
    for frag, label in INTAKE_BY_COLUMN.items():
        if t.startswith(frag):
            return [label]
    return []


def clean_course(s):
    s = plain(s).replace(';', '').strip()
    s = re.sub(r'\s*\(Changed from[^)]*\)', '', s)
    return s


def course_matrix(ws, key, ug_label='Undergraduate'):
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    hi = next((i for i, r in enumerate(rows) if r and plain(r[0]).upper() in ('CENTRE', 'FACULTY')), None)
    if hi is None:
        return
    header = rows[hi]
    width = max(len(header), 1)
    stage_row = None
    for j in range(hi - 1, -1, -1):
        cells = [plain(v) for v in rows[j][3:width]]
        if any(c and not re.search(r'term', c, re.I) for c in cells):
            stage_row = rows[j]
            break
    stages = {}
    current = ''
    for ci in range(3, width):
        v = plain(stage_row[ci]) if stage_row and ci < len(stage_row) else ''
        if v and not re.search(r'term', v, re.I):
            current = v
        stages[ci] = current
    for r in rows[hi + 1:]:
        if len(r) < 3:
            continue
        course = clean_course(r[2])
        stream = plain(r[1])
        if not course or course.endswith(':') or not any(v not in (None, '') for v in r[3:width]):
            continue
        for ci in range(3, width):
            v = plain(r[ci]) if ci < len(r) else ''
            if v.lower() != 'y':
                continue
            for lab in intake_columns(header[ci]):
                stage = stages.get(ci, '') or ug_label
                heading = stage + (' - ' + stream if stream and not stream.lower().startswith(('ugic', 'ukic', 'buic')) else '')
                entry(key)['courses'].append({'intake': lab, 'heading': heading, 'course': course})


def oxford_course_sheets(wb):
    # Ravensbourne: Nov 2026 and Jan 2027 postgraduate lists, and the undergraduate courses with International Year One
    ws = wb['Ravensbourne ']
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    key = 'university of ravensbourne'
    for r in rows:
        r = (r + [None] * 4)[:4]
        a, d = plain(r[0]), plain(r[3])
        if r[1] == 'Y' and a:
            entry(key)['courses'].append({'intake': 'January 2027', 'heading': 'Undergraduate', 'course': a})
        if a and not a.startswith(('Subject', 'Undergraduate')) and r[1] != 'Y' and not d == '' and False:
            pass
    start = next((i for i, r in enumerate(rows) if plain(r[0]).startswith('Subject for Nov')), None)
    if start is not None:
        for r in rows[start + 1:]:
            r = (r + [None] * 4)[:4]
            if plain(r[0]):
                entry(key)['courses'].append({'intake': 'November 2026', 'heading': 'Postgraduate', 'course': plain(r[0])})
            if plain(r[3]):
                entry(key)['courses'].append({'intake': 'January 2027', 'heading': 'Postgraduate', 'course': plain(r[3])})
    # Roehampton: programme table [title, Nov, Jan | UG title, Jan | IY1 title, Nov, Jan]
    ws = wb['Roehampton']
    key = 'university of roehampton'
    for r in ws.iter_rows(min_row=2, values_only=True):
        r = list(r) + [None] * 12
        t1, n1, j1 = plain(r[0]), plain(r[1]), plain(r[2])
        if t1:
            for lab, v in (('November 2026', n1), ('January 2027', j1)):
                if v.lower() == 'yes':
                    entry(key)['courses'].append({'intake': lab, 'heading': 'Postgraduate', 'course': t1})
        t2, j2 = plain(r[4]), plain(r[5])
        if t2 and j2.lower() == 'yes':
            entry(key)['courses'].append({'intake': 'January 2027', 'heading': 'Undergraduate (with integrated foundation where shown)', 'course': t2})
        t3, n3, j3 = plain(r[8]), plain(r[9]), plain(r[10])
        if t3:
            for lab, v in (('November 2026', n3), ('January 2027', j3)):
                if v.lower() == 'yes':
                    entry(key)['courses'].append({'intake': lab, 'heading': 'International Year One', 'course': t3})
    # Bradford (UoB): [University, Faculty, Degree programme, January]
    ws = wb['UoB']
    key = 'university of bradford'
    last = None
    for r in ws.iter_rows(min_row=2, values_only=True):
        r = list(r) + [None] * 4
        uni, fac, prog, jan = plain(r[0]), plain(r[1]), plain(r[2]), plain(r[3])
        if not uni and prog and last is not None:
            last['course'] = (last['course'] + ' ' + prog).strip()  # a course name that continues on the next row
            continue
        if uni and prog and jan.lower() == 'y':
            last = {'intake': 'January 2027', 'heading': 'Postgraduate - ' + fac, 'course': prog}
            entry(key)['courses'].append(last)
        else:
            last = None


def admission_rules(ws, key):
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    hi = next((i for i, r in enumerate(rows) if plain(r[0]).lower() == 'category'), None)
    if hi is None:
        return
    header = [plain(h) for h in rows[hi]]
    courses = []
    category = ''
    for r in rows[hi + 1:]:
        title = plain(r[2]) if len(r) > 2 else ''
        if plain(r[0]) and not title:
            category = plain(r[0])
        if not title:
            continue
        if plain(r[0]):
            category = plain(r[0])
        level = 'Postgraduate' if re.search(r'master|msc|ma\b|pg', category, re.I) else 'Undergraduate'
        entry(key)['courses'].append({'intake': 'January 2027', 'heading': level, 'course': title})
        needs = [header[i] for i in range(3, len(header)) if i < len(r) and r[i] is True and header[i]]
        remark = ''
        for i in range(len(header), len(r)):
            if r[i] not in (None, '') and not isinstance(r[i], bool):
                remark = plain(r[i])
        courses.append((title, needs, remark))
    if not courses:
        return
    common = set(courses[0][1])
    for _, n, _ in courses[1:]:
        common &= set(n)
    pretty = lambda n: n.replace('Reference (1 required)', 'one reference').replace('SOP', 'Statement of Purpose (SOP)')
    if common:
        add_note(key, 'Documents needed for every course: ' + ', '.join(pretty(n) for n in sorted(common, key=lambda x: header.index(x))) + '.')
    for title, needs, remark in courses:
        extra = [n for n in needs if n not in common]
        bits = []
        if extra:
            bits.append('also needs ' + ', '.join(extra))
        if remark:
            bits.append(remark)
        if bits:
            add_note(key, f'{title}: ' + '; '.join(bits) + ('' if bits[-1].endswith('.') else '.'))


def main(oxford, pathways, out):
    ox = openpyxl.load_workbook(oxford, data_only=True)
    pw = openpyxl.load_workbook(pathways, data_only=True)
    oxford_requirements(ox['Entry Requirement'])
    pathways_requirements(pw['Pathways'])
    key_dates(ox['CAS Deadlines'])
    key_dates(pw['CAS deadline'])
    for sheet, key in (('UGIC', 'university of greenwich international college (ugic)'), ('BUIC', 'bangor university international college (buic)'),
                       ('UBIC', 'university of bradford international college (ubic)'), ('ICD', 'international college of dundee (icd)-scotland'),
                       ('ENUIC', 'edinburgh napier university international college (enuic)'), ('UKIC', 'university of kent international college (ukic)'),
                       ('Ulster', 'ulster university')):
        course_matrix(pw[sheet], key)
    shu = pw['SHU']
    course_matrix(shu, 'sheffield hallam university')
    oxford_course_sheets(ox)
    admission_rules(ox['Winchester'], 'winchester university')
    admission_rules(ox['Lincoln Bishop University'], 'lincoln bishop university')
    # the intake of a key dates block must exist even with no course
    result = {}
    for k, e in OUT.items():
        e['intakes'] = {n: v for n, v in e['intakes'].items() if v['keyDates'] or v['deadline']}
        result[k] = e
    text = json.dumps(result, indent=1, ensure_ascii=False)
    assert '\u2014' not in text and '\u2013' not in text
    with open(out, 'w', encoding='utf-8') as f:
        f.write(text + '\n')
    for k, e in sorted(result.items()):
        print(f"{k[:62]:62} programs {len(e['programs']):2}  intakes {len(e['intakes']):2}  courses {len(e['courses']):3}  notes {len(e['notes']):2}")


if __name__ == '__main__':
    main(*sys.argv[1:4])

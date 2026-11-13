// The management records behind the Dashboard's decision pages: the visa target of each intake, what was spent on
// marketing, the events that were run, the decisions that were taken (with what was expected and what really
// happened) and the notes on the market (UK and Nepal rules, universities, competitors).
//
// Admin writes them; the Manager reads them. None of this is shown to the teams, and nothing here is on the sheet.
// Kept in planning.json in the data folder (never in git), written whole and atomically; the first save of each day
// first copies the file as it was into backups/planning-YYYY-MM-DD.json, and the 6 p.m. backup holds it too.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeFileAtomic, snapshotDaily } = require('../shared/server-utils');
const { isoDay } = require('./cards');

const newId = () => crypto.randomBytes(6).toString('hex');
const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\r\n?/g, '\n').slice(0, max).trim() : '');
// A whole amount, never negative and never silly: "25,000" and 25000 are both 25000; anything else is 0.
const amount = (v, max = 1e12) => {
  const n = Number(String(v ?? '').replace(/[£$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : 0;
};
const month = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(str(v, 7)) ? str(v, 7) : '');

// What was run to find students: events and marketing. The last six are marketing; the rest are events.
const MARKETING_TYPES = ['Meta campaign (Facebook or Instagram)', 'Campaign on a partner page (another Facebook page)', 'Campus or college campaign (not a school)', 'Community or organisation campaign', 'Facebook or Instagram advert', 'TikTok campaign', 'Google or YouTube ads', 'Signboard or hoarding', 'Newspaper, radio or TV', 'Other marketing'];
const EVENT_TYPES = ['Education fair', 'Seminar or information session', 'Webinar', 'University visit or spot assessment', 'School or college visit', 'Open day at the office', 'Other', 'Meta campaign (Facebook or Instagram)', 'Campaign on a partner page (another Facebook page)', 'Campus or college campaign (not a school)', 'Community or organisation campaign', 'Facebook or Instagram advert', 'TikTok campaign', 'Google or YouTube ads', 'Signboard or hoarding', 'Newspaper, radio or TV', 'Other marketing'];
const DECISION_STATUS = ['Open', 'Under way', 'Worked: keep it', 'Changed', 'Stopped'];
// Where an event or a piece of marketing ran: the one choice the page asks for (the long list of types above is only read
// from older entries). Social media campaigns are also offered under "Social Media" when a student is added, so a student
// who came from the campaign is counted in its cost per student.
const CHANNELS = ['Social media', 'Our office', 'A college or school', 'Another venue (hall or hotel)', 'Newspaper, radio or TV', 'Online ads (Google, YouTube)', 'Other'];
const MARKETING_CHANNELS = ['Social media', 'Newspaper, radio or TV', 'Online ads (Google, YouTube)'];
// An older entry has only its type: where it ran is read from that.
const CHANNEL_OF_TYPE = {
  'Meta campaign (Facebook or Instagram)': 'Social media', 'Campaign on a partner page (another Facebook page)': 'Social media', 'Facebook or Instagram advert': 'Social media', 'TikTok campaign': 'Social media',
  'Google or YouTube ads': 'Online ads (Google, YouTube)', 'Newspaper, radio or TV': 'Newspaper, radio or TV', 'Open day at the office': 'Our office',
  'School or college visit': 'A college or school', 'Campus or college campaign (not a school)': 'A college or school', 'Education fair': 'Another venue (hall or hotel)',
  'Seminar or information session': 'Another venue (hall or hotel)', 'University visit or spot assessment': 'Our office',
};
const channelOf = (e) => (e && CHANNELS.includes(e.channel) ? e.channel : (e && CHANNEL_OF_TYPE[e.type]) || 'Other');
const MARKET_KINDS = ['UK immigration rule', 'Nepal rule', 'University or partner', 'Competitor', 'Market'];

// Each list: how one entry is cleaned (only the known fields, as text or numbers, within limits) and what makes it worth keeping.
const LISTS = {
  spend: {
    max: 3000,
    clean: (x) => ({
      month: month(x.month), intake: str(x.intake, 80), source: str(x.source, 60), detail: str(x.detail, 120),
      amount: amount(x.amount), leads: amount(x.leads, 1e7), note: str(x.note, 300),
    }),
    valid: (x) => (x.month && x.amount > 0 ? null : 'A spend line needs a month and an amount.'),
  },
  events: {
    max: 1000,
    clean: (x) => ({
      name: str(x.name, 120), date: isoDay(x.date), endDate: (isoDay(x.endDate) >= isoDay(x.date) ? isoDay(x.endDate) : ''), type: EVENT_TYPES.includes(x.type) ? x.type : 'Other', channel: channelOf(x), kind: MARKETING_CHANNELS.includes(channelOf(x)) ? 'Marketing' : 'Event', place: str(x.place, 120),
      cost: amount(x.cost), registered: amount(x.registered, 1e6), attended: amount(x.attended, 1e6), universities: str(x.universities, 300), note: str(x.note, 600),
    }),
    check: (x) => {
      if (x.endDate && x.date && isoDay(x.endDate) && isoDay(x.endDate) < isoDay(x.date)) return 'The end date is before the start date.';
      if (x.cost !== undefined && x.cost !== null && String(x.cost).trim() !== '' && !/^[£$]?\s*\d[\d,\s]*(\.\d+)?$/.test(String(x.cost).trim())) return 'The cost must be a number, for example 25000.';
      return null;
    },
    valid: (x) => (x.name && x.date ? null : 'An event or a marketing activity needs a name and a start date.'),
  },
  decisions: {
    max: 1000,
    clean: (x) => ({
      date: isoDay(x.date), title: str(x.title, 160), problem: str(x.problem, 1200), evidence: str(x.evidence, 1200), decision: str(x.decision, 1200),
      expected: str(x.expected, 600), measure: str(x.measure, 300), reviewDate: isoDay(x.reviewDate), outcome: str(x.outcome, 1200), lesson: str(x.lesson, 600),
      status: DECISION_STATUS.includes(x.status) ? x.status : 'Open',
    }),
    valid: (x) => (x.title && x.date ? null : 'A decision needs a title and a date.'),
  },
  market: {
    max: 1000,
    clean: (x) => ({
      date: isoDay(x.date), kind: MARKET_KINDS.includes(x.kind) ? x.kind : 'Market', title: str(x.title, 200), detail: str(x.detail, 2000),
      source: str(x.source, 400), impact: str(x.impact, 800), action: str(x.action, 800), checkedOn: isoDay(x.checkedOn),
    }),
    valid: (x) => (x.title && x.date ? null : 'A note needs a title and a date.'),
  },
};

function cleanTarget(x) {
  return { visas: amount(x.visas, 100000), applications: amount(x.applications, 1000000), byDate: isoDay(x.byDate), startDate: isoDay(x.startDate), note: str(x.note, 300) };
}
function cleanSettings(x, old = {}) {
  const pick = (k, fn) => (x && Object.prototype.hasOwnProperty.call(x, k) ? fn(x[k]) : old[k]);
  return {
    // What one student with a visa brings in on average, in rupees. Typed by Admin and shown to Admin only: it is an
    // assumption for planning, not a figure read from the Incentive page.
    valuePerVisa: pick('valuePerVisa', (v) => amount(v, 1e9)) || 0,
    // The cost of a lead above which a channel is flagged, in rupees (0: no flag).
    maxCostPerLead: pick('maxCostPerLead', (v) => amount(v, 1e8)) || 0,
  };
}

function createPlanning(dir, { now = () => new Date() } = {}) {
  const file = path.join(dir, 'planning.json');
  let cache = null;
  const blank = () => ({ targets: {}, spend: [], events: [], decisions: [], market: [], settings: cleanSettings({}) });

  function load() {
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return blank(); }
    if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const data = blank();
        Object.keys(LISTS).forEach((k) => {
          data[k] = (Array.isArray(raw[k]) ? raw[k] : []).filter((x) => x && /^[a-f0-9]{12}$/.test(x.id))
            .map((x) => ({ ...LISTS[k].clean(x), id: x.id, updatedAt: str(x.updatedAt, 40), updatedBy: str(x.updatedBy, 80) }));
        });
        Object.keys(raw.targets && typeof raw.targets === 'object' ? raw.targets : {}).forEach((sheetId) => {
          if (/^[\w-]{1,80}$/.test(sheetId)) data.targets[sheetId] = { ...cleanTarget(raw.targets[sheetId]), updatedAt: str(raw.targets[sheetId].updatedAt, 40), updatedBy: str(raw.targets[sheetId].updatedBy, 80) };
        });
        data.settings = cleanSettings(raw.settings || {}, cleanSettings({}));
        cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
        return data;
      }
    } catch (e) { /* unreadable: set aside below */ }
    try { fs.renameSync(file, path.join(dir, `planning.damaged-${now().toISOString().replace(/[:.]/g, '-')}.json`)); } catch (e) { /* ignore */ }
    return blank();
  }
  function write(data) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    snapshotDaily(file, dir, 'planning');
    writeFileAtomic(file, JSON.stringify(data, null, 1));
    const stat = fs.statSync(file);
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
  }

  return {
    all: load,
    // Adds an entry to a list, or changes the one with `input.id`.
    save(list, input, by) {
      const spec = LISTS[list];
      if (!spec) return { error: 'No such list.' };
      const data = load();
      const cleaned = spec.clean(input || {});
      const problem = (spec.check && spec.check(input || {})) || spec.valid(cleaned);
      if (problem) return { error: problem };
      const id = /^[a-f0-9]{12}$/.test(input && input.id) ? input.id : '';
      const stamp = { updatedAt: now().toISOString(), updatedBy: by || '' };
      let entry;
      let items;
      if (id) {
        if (!data[list].some((x) => x.id === id)) return { error: 'That entry is no longer there.' };
        entry = { ...cleaned, id, ...stamp };
        items = data[list].map((x) => (x.id === id ? entry : x));
      } else {
        if (data[list].length >= spec.max) return { error: 'This list is full.' };
        entry = { ...cleaned, id: newId(), ...stamp };
        items = [...data[list], entry];
      }
      write({ ...data, [list]: items });
      return { entry };
    },
    remove(list, id) {
      if (!LISTS[list]) return { error: 'No such list.' };
      const data = load();
      const entry = data[list].find((x) => x.id === id);
      if (!entry) return { error: 'That entry is no longer there.' };
      write({ ...data, [list]: data[list].filter((x) => x.id !== id) });
      return { removed: entry };
    },
    // The target of one intake (by the id of its sheet). No visas and no applications: the target is taken away.
    setTarget(sheetId, input, by) {
      if (!/^[\w-]{1,80}$/.test(String(sheetId || ''))) return { error: 'Choose the intake first.' };
      const data = load();
      const raw = input || {};
      if (raw.visas !== undefined && String(raw.visas).trim() !== '' && !/^\d[\d,\s]*$/.test(String(raw.visas).trim())) return { error: 'The target must be a whole number of visas, for example 45.' };
      if (isoDay(raw.byDate) && isoDay(raw.startDate) && isoDay(raw.byDate) < isoDay(raw.startDate)) return { error: 'The end date is before the start date.' };
      const cleaned = cleanTarget(input || {});
      const targets = { ...data.targets };
      if (!cleaned.visas && !cleaned.applications && !cleaned.byDate && !cleaned.startDate && !cleaned.note) delete targets[sheetId];
      else targets[sheetId] = { ...cleaned, updatedAt: now().toISOString(), updatedBy: by || '' };
      write({ ...data, targets });
      return { target: targets[sheetId] || null };
    },
    saveSettings(input) {
      const data = load();
      const settings = cleanSettings(input || {}, data.settings);
      write({ ...data, settings });
      return { settings };
    },
    restoreAll(snapshot) {
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { error: 'The backup has no planning records in it.' };
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileAtomic(file, JSON.stringify(snapshot));
      cache = null;
      load(); // read back through the same checks as any file
      return { ok: true };
    },
  };
}

module.exports = { createPlanning, LISTS, EVENT_TYPES, MARKETING_TYPES, CHANNELS, MARKETING_CHANNELS, channelOf, DECISION_STATUS, MARKET_KINDS, cleanTarget, cleanSettings, amount };

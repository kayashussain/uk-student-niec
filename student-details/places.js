// A small map of the UK for the Fact File assistant: the towns and cities where universities have campuses, with their position and
// region, so "near Manchester", "within 30 miles of Leeds", "in Scotland" or "in London" are understood the way a person means them.
// Positions are approximate city centres (good to a few miles), enough for "near" and "area". A university whose campus city is
// not in this list is said to have an unknown location rather than guessed.

// name: [latitude, longitude, region]
const PLACES = {
  london: [51.507, -0.128, 'London'], ealing: [51.513, -0.305, 'London'], brentford: [51.488, -0.309, 'London'], croydon: [51.376, -0.098, 'London'], stratford: [51.541, -0.003, 'London'],
  greenwich: [51.482, 0.0, 'London'], harrow: [51.58, -0.342, 'London'], uxbridge: [51.546, -0.48, 'London'], kingston: [51.412, -0.3, 'London'], hounslow: [51.468, -0.361, 'London'],
  manchester: [53.481, -2.243, 'North West'], salford: [53.483, -2.292, 'North West'], bolton: [53.578, -2.429, 'North West'], oldham: [53.541, -2.112, 'North West'], stockport: [53.41, -2.158, 'North West'],
  rochdale: [53.616, -2.155, 'North West'], wigan: [53.545, -2.633, 'North West'], warrington: [53.39, -2.597, 'North West'], bury: [53.593, -2.298, 'North West'],
  liverpool: [53.408, -2.992, 'North West'], preston: [53.759, -2.699, 'North West'], lancaster: [54.047, -2.801, 'North West'], blackburn: [53.748, -2.482, 'North West'], blackpool: [53.817, -3.035, 'North West'],
  chester: [53.19, -2.891, 'North West'], crewe: [53.099, -2.443, 'North West'], carlisle: [54.892, -2.944, 'North West'],
  leeds: [53.8, -1.549, 'Yorkshire'], bradford: [53.795, -1.759, 'Yorkshire'], sheffield: [53.381, -1.47, 'Yorkshire'], huddersfield: [53.645, -1.785, 'Yorkshire'], york: [53.959, -1.081, 'Yorkshire'],
  hull: [53.744, -0.332, 'Yorkshire'], wakefield: [53.683, -1.499, 'Yorkshire'], doncaster: [53.523, -1.128, 'Yorkshire'], harrogate: [53.992, -1.542, 'Yorkshire'],
  newcastle: [54.978, -1.618, 'North East'], sunderland: [54.906, -1.381, 'North East'], durham: [54.778, -1.575, 'North East'], middlesbrough: [54.574, -1.235, 'North East'], gateshead: [54.962, -1.602, 'North East'],
  birmingham: [52.486, -1.89, 'Midlands'], coventry: [52.408, -1.511, 'Midlands'], wolverhampton: [52.587, -2.128, 'Midlands'], leicester: [52.637, -1.135, 'Midlands'], nottingham: [52.954, -1.15, 'Midlands'],
  derby: [52.922, -1.476, 'Midlands'], stoke: [53.003, -2.179, 'Midlands'], stafford: [52.806, -2.117, 'Midlands'], worcester: [52.192, -2.22, 'Midlands'], telford: [52.678, -2.445, 'Midlands'],
  shrewsbury: [52.707, -2.754, 'Midlands'], northampton: [52.24, -0.903, 'Midlands'], walsall: [52.586, -1.982, 'Midlands'], lincoln: [53.234, -0.538, 'Midlands'], loughborough: [52.772, -1.206, 'Midlands'],
  cambridge: [52.205, 0.119, 'East of England'], norwich: [52.63, 1.297, 'East of England'], luton: [51.879, -0.42, 'East of England'], hatfield: [51.763, -0.223, 'East of England'], bedford: [52.136, -0.467, 'East of England'],
  peterborough: [52.573, -0.24, 'East of England'], chelmsford: [51.736, 0.469, 'East of England'], colchester: [51.889, 0.903, 'East of England'], ipswich: [52.056, 1.148, 'East of England'], watford: [51.655, -0.396, 'East of England'],
  oxford: [51.752, -1.258, 'South East'], reading: [51.454, -0.978, 'South East'], brighton: [50.822, -0.137, 'South East'], canterbury: [51.28, 1.08, 'South East'], guildford: [51.236, -0.57, 'South East'],
  southampton: [50.909, -1.404, 'South East'], portsmouth: [50.819, -1.088, 'South East'], winchester: [51.063, -1.317, 'South East'], chatham: [51.381, 0.527, 'South East'], egham: [51.43, -0.557, 'South East'],
  bristol: [51.454, -2.588, 'South West'], bath: [51.381, -2.36, 'South West'], plymouth: [50.375, -4.143, 'South West'], exeter: [50.726, -3.527, 'South West'], gloucester: [51.864, -2.244, 'South West'],
  cheltenham: [51.899, -2.078, 'South West'], bournemouth: [50.72, -1.88, 'South West'], falmouth: [50.152, -5.066, 'South West'], swindon: [51.556, -1.779, 'South West'],
  cardiff: [51.481, -3.179, 'Wales'], swansea: [51.621, -3.944, 'Wales'], newport: [51.588, -2.998, 'Wales'], bangor: [53.228, -4.129, 'Wales'], wrexham: [53.046, -2.993, 'Wales'], aberystwyth: [52.415, -4.083, 'Wales'],
  glasgow: [55.864, -4.252, 'Scotland'], edinburgh: [55.953, -3.188, 'Scotland'], dundee: [56.462, -2.971, 'Scotland'], aberdeen: [57.149, -2.094, 'Scotland'], paisley: [55.846, -4.424, 'Scotland'],
  stirling: [56.116, -3.937, 'Scotland'], inverness: [57.478, -4.225, 'Scotland'], kirkcaldy: [56.112, -3.158, 'Scotland'], hamilton: [55.777, -4.039, 'Scotland'], ayr: [55.458, -4.629, 'Scotland'], dumfries: [55.07, -3.605, 'Scotland'],
  belfast: [54.597, -5.93, 'Northern Ireland'], derry: [54.997, -7.309, 'Northern Ireland'], coleraine: [55.133, -6.668, 'Northern Ireland'], jordanstown: [54.667, -5.93, 'Northern Ireland'],
};
// Words that mean a whole region, and the places they hold.
const REGIONS = {
  scotland: 'Scotland', scottish: 'Scotland', wales: 'Wales', welsh: 'Wales', 'northern ireland': 'Northern Ireland', 'north west': 'North West', northwest: 'North West', 'north east': 'North East',
  northeast: 'North East', yorkshire: 'Yorkshire', midlands: 'Midlands', 'west midlands': 'Midlands', 'east midlands': 'Midlands', 'south west': 'South West', southwest: 'South West', 'south east': 'South East',
  southeast: 'South East', 'east of england': 'East of England',
};
// Cities that sit in a named area people use ("Greater London", "Tyneside") are covered by the nearest city and the radius.

const R = 3958.8; // miles
const rad = (d) => (d * Math.PI) / 180;
function distanceMiles(a, b) {
  const [la, lo] = [rad(b[0] - a[0]), rad(b[1] - a[1])];
  const x = Math.sin(la / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(lo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const NAMES = Object.keys(PLACES).sort((x, y) => y.length - x.length);
const REGION_KEYS = Object.keys(REGIONS).sort((x, y) => y.length - x.length);
const pad = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ')} `;

// Every known town or city named in a text, in the order they appear.
function placesIn(text) {
  const t = pad(text);
  const found = [];
  NAMES.forEach((n) => { const i = t.indexOf(` ${n} `); if (i !== -1 && !found.some((f) => f.at === i)) found.push({ name: n, at: i }); });
  // "Stoke-on-Trent", "Newcastle upon Tyne", "Bangor Wales" read as their first word too: handled by the plain match above.
  return found.sort((a, b) => a.at - b.at).map((f) => f.name);
}
function regionIn(text) {
  const t = pad(text);
  const hit = REGION_KEYS.find((k) => t.includes(` ${k} `));
  return hit ? REGIONS[hit] : '';
}
// The words of a request about where: { place, region, miles, label } or null. "near", "around", "area" and "close to" widen the
// search to 35 miles; "within N miles" uses N; a bare "in Leeds" means the city and its edge (12 miles).
function readWhere(text) {
  const t = pad(text);
  const raw = ` ${String(text || '').toLowerCase()} `;
  const region = regionIn(text);
  const names = placesIn(text);
  if (!names.length && !region) return null;
  if (!names.length) return { region, label: region };
  const place = names[0];
  const within = /within\s+(\d{1,3})\s*(?:miles?|mi)\b/.exec(raw) || /(\d{1,3})\s*(?:miles?|mi)\s+(?:of|from|around)/.exec(raw);
  const wide = /\b(?:near|nearby|around|area|close to|surrounding|outside)\b/.test(t);
  const miles = within ? Number(within[1]) : (wide ? 35 : 12);
  return { place, miles, label: `${place.replace(/^./, (c) => c.toUpperCase())}${wide || within ? ` area (within ${miles} miles)` : ''}` };
}
// Where a course is, from the words that describe its campus. { name, position, region } or null when no known place is named.
function locate(...texts) {
  const names = placesIn(texts.join(' | '));
  if (names.length) { const n = names[0]; return { name: n, position: PLACES[n].slice(0, 2), region: PLACES[n][2], all: names }; }
  const region = regionIn(texts.join(' | '));
  return region ? { name: '', position: null, region, all: [] } : null;
}
// Does a course at `where` fit what was asked? 'yes' | 'no' | 'unknown'.
function fits(ask, where) {
  if (!ask) return 'yes';
  if (!where) return 'unknown';
  if (ask.region) return where.region === ask.region ? 'yes' : 'no';
  const target = PLACES[ask.place];
  const spots = (where.all || []).length ? where.all : (where.name ? [where.name] : []);
  if (!spots.length) return where.region && where.region === target[2] && ask.miles >= 35 ? 'yes' : (where.region ? 'no' : 'unknown');
  return spots.some((n) => distanceMiles(target, PLACES[n]) <= ask.miles) ? 'yes' : 'no';
}

module.exports = { PLACES, placesIn, regionIn, readWhere, locate, fits, distanceMiles };

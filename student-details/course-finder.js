// Finds the page of a course on the university's own website, for a course with no link written down yet. It asks a web search for
// "site:<the university's own website> <course>", keeps only results on that website and takes the one whose address and title
// match the words of the course best. The answer is a suggestion: the counselor can change the link on the card, and a link that is
// typed or found is remembered (course-index.js, createCourseLinks), so each course is looked up once.
//
// It needs the server to reach the internet. It runs one search at a time with a pause between, so a search engine is not hammered,
// and a failed or empty search is not repeated for an hour. Nothing about the student is sent: only the course and university names.

const SEARCH = 'https://html.duckduckgo.com/html/?q=';
const STOP = new Set(['the', 'of', 'and', 'in', 'for', 'with', 'a', 'an', 'at', 'university', 'hons', 'msc', 'ma', 'ba', 'bsc', 'mba', 'top', 'up', 'placement', 'year', 'full', 'time', 'part', 'london', 'campus']);
const words = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

// The result links of a search page: [{ url, title }].
function parseResults(html) {
  const out = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    let href = m[1].replace(/&amp;/g, '&');
    const wrapped = /[?&]uddg=([^&]+)/.exec(href);
    if (wrapped) { try { href = decodeURIComponent(wrapped[1]); } catch (e) { continue; } }
    if (href.startsWith('//')) href = 'https:' + href;
    if (!/^https?:\/\/[^\s<>"']+$/i.test(href)) continue;
    out.push({ url: href, title: m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim() });
  }
  return out;
}

// The best course page among the results, or null.
function pickResult(results, { university, course, hosts }) {
  const need = words(course);
  const uni = words(university);
  let best = null;
  results.forEach((r) => {
    let host;
    try { host = new URL(r.url).hostname.toLowerCase(); } catch (e) { return; }
    if (!hosts || !hosts.some((x) => host === x || host.endsWith('.' + x))) return; // only the university's own website
    const hay = `${decodeURIComponent(r.url.toLowerCase())} ${r.title.toLowerCase()}`;
    const hits = need.filter((w) => hay.includes(w)).length;
    const uniHit = uni.some((w) => host.includes(w) || hay.includes(w));
    const coursePath = /\/(course|courses|study|undergraduate|postgraduate|programme|program|degree)s?\b/.test(r.url.toLowerCase());
    const score = hits * 3 + (uniHit ? 2 : 0) + (coursePath ? 2 : 0);
    if (need.length && hits < Math.max(1, Math.ceil(need.length / 2))) return;
    if (!best || score > best.score) best = { score, link: r.url, title: r.title };
  });
  return best ? { link: best.link, title: best.title } : null;
}

function createCourseFinder({ fetchFn = (typeof fetch === 'function' ? fetch : null), pauseMs = 1200, now = () => Date.now() } = {}) {
  const tried = new Map(); // "university|course" -> { at, result }
  let queue = Promise.resolve();
  async function lookup({ university, course, hosts }) {
    if (!fetchFn) return { link: '', error: 'This server cannot reach the internet.' };
    if (!hosts || !hosts.length) return { link: '', error: 'The website of this university is not known yet.' };
    const key = `${String(university).toLowerCase()}|${String(course).toLowerCase()}`;
    const before = tried.get(key);
    if (before && now() - before.at < 60 * 60 * 1000) return before.result;
    const run = async () => {
      let result;
      try {
        const q = encodeURIComponent(`site:${hosts[0]} ${course}`);
        const res = await fetchFn(SEARCH + q, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Fly-portal)' }, signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`the search answered ${res.status}`);
        const found = pickResult(parseResults(await res.text()), { university, course, hosts });
        result = found ? { link: found.link, title: found.title } : { link: '', error: 'No course page found.' };
      } catch (e) { result = { link: '', error: `Could not search: ${e.message}` }; }
      tried.set(key, { at: now(), result });
      await new Promise((r) => setTimeout(r, pauseMs));
      return result;
    };
    const mine = queue.then(run, run);
    queue = mine.catch(() => {});
    return mine;
  }
  return { lookup };
}

module.exports = { createCourseFinder, parseResults, pickResult };

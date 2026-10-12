// Latest published release of the display image on GitHub, which displays can update to.
// Cached so the dashboard can ask often without hitting GitHub's rate limit.

const REPO = process.env.SIGNAGE_RELEASES_REPO || 'BJT1698/display-orchestrator';
const CACHE_MS = 30 * 60 * 1000;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;

let cached = null; // { value, at }
let inflight = null;

async function fetchLatest() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'display-orchestrator' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const body = await res.json();
  if (!RELEASE_TAG.test(body.tag_name || '')) throw new Error(`Unexpected tag '${body.tag_name}'`);
  return {
    tag: body.tag_name,
    version: body.tag_name.slice(1),
    publishedAt: body.published_at,
    url: body.html_url,
  };
}

export const releaseService = {
  isReleaseTag: (tag) => RELEASE_TAG.test(String(tag || '')),

  // Returns null when GitHub cannot be reached and nothing is cached yet
  async latest({ force = false } = {}) {
    if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
    if (!inflight) {
      inflight = fetchLatest()
        .then((value) => {
          cached = { value, at: Date.now() };
          return value;
        })
        .catch((err) => {
          console.error('Could not read the latest release:', err.message);
          return cached ? cached.value : null;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  },
};

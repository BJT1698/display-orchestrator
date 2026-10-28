import crypto from 'node:crypto';
import { db } from '../db/database.js';

// An Otter Wiki read through an account that can only read: how many pages,
// the newest pages and the latest changes. The address and password stay on the server: dashboards
// see the address and account, screens ask for the numbers by a random id. The wiki is read at
// most every 5 minutes, and the last good numbers are kept if it is unreachable.

const KEY = 'wiki';
const REFRESH_MS = 5 * 60 * 1000;
let cache = null; // { at, stats, error }
let cookies = new Map(); // wiki session cookies, name -> value

function stored() {
  const row = db.getOne('SELECT value FROM settings WHERE key = ?', KEY);
  try {
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

function save(value) {
  db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    KEY, JSON.stringify(value)
  );
}

const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

function keepCookies(res) {
  for (const line of res.headers.getSetCookie?.() || []) {
    const [pair] = line.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function request(base, path, options = {}) {
  const res = await fetch(new URL(path, base), {
    ...options,
    redirect: 'manual',
    headers: { ...options.headers, Cookie: cookieHeader() },
    signal: AbortSignal.timeout(20000),
  });
  keepCookies(res);
  return res;
}

const toLogin = (res) => res.status === 403 || (res.status >= 300 && res.status < 400 && /\/-\/login/.test(res.headers.get('location') || ''));

// Otter Wiki login form: session cookie and CSRF token from the form, then email and password
async function login(wiki) {
  cookies = new Map();
  const form = await request(wiki.url, '/-/login');
  if (!form.ok) throw new Error(`The wiki answered ${form.status}. Is this the address of an Otter Wiki?`);
  const csrf = /name="csrf_token"[^>]*value="([^"]+)"/.exec(await form.text())?.[1];
  if (!csrf) throw new Error('No login form at that address. Is it an Otter Wiki?');
  const res = await request(wiki.url, '/-/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf_token: csrf, email: wiki.email, password: wiki.password }).toString(),
  });
  // Success redirects away from the login page; a wrong password shows the form again (200)
  if (res.status < 300 || res.status >= 400 || /\/-\/login/.test(res.headers.get('location') || '')) {
    throw new Error('The wiki did not accept that email and password.');
  }
}

async function read(wiki, path) {
  let res = await request(wiki.url, path);
  if (toLogin(res)) {
    await login(wiki);
    res = await request(wiki.url, path);
  }
  if (toLogin(res)) throw new Error('This account cannot read the wiki.');
  if (!res.ok) throw new Error(`The wiki answered ${res.status} for ${path}`);
  return res.text();
}

const decodeXml = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&')
  .trim();

const tag = (xml, name) => decodeXml(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]);

// Page from a page link: "/Folder/Page" or "/Folder/Page/view/<revision>" -> its name, decoded,
// and a lower-case key to compare with the page list
function pageFromHref(href) {
  let path;
  try {
    path = decodeURIComponent(new URL(href, 'http://wiki/').pathname);
  } catch {
    return null;
  }
  const name = path.replace(/\/view(\/[^/]*)?$/, '').replace(/^\/+|\/+$/g, '') || 'Home';
  return { key: name.toLowerCase(), name };
}

// Every commit in the changelog feed (Otter Wiki puts the whole history in it), newest first
function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const pages = [];
    for (const [link] of e.matchAll(/<link\b[^>]*>/g)) {
      if (!/rel="enclosure"/.test(link) || !/type="text\/html"/.test(link)) continue;
      const href = decodeXml(/href="([^"]*)"/.exec(link)?.[1]);
      const page = pageFromHref(href);
      if (page) pages.push(page);
    }
    const message = tag(e, 'summary') || tag(e, 'content');
    return {
      at: tag(e, 'published') || tag(e, 'updated'),
      author: tag(/<author>([\s\S]*?)<\/author>/.exec(e)?.[1] || '', 'name'),
      pages,
      message: message === '-/-' ? '' : message,
    };
  }).filter((c) => c.at && !Number.isNaN(Date.parse(c.at)));
}

// Readable name for a page path: "Reparti/IT/Stampanti" -> "Stampanti", with its folder apart
function pageName(name) {
  const parts = name.split('/');
  return { title: parts[parts.length - 1] || 'Home', folder: parts.slice(0, -1).join(' / ') };
}

function buildStats(sitemapXml, feedXml) {
  const pages = new Set([...sitemapXml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)]
    .map(([, loc]) => pageFromHref(decodeXml(loc))?.key).filter(Boolean));
  const commits = parseFeed(feedXml).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  // The oldest commit that touches a page is the one that created it
  const created = new Map(); // key -> { at, author, name }
  for (const c of commits) {
    for (const p of c.pages) {
      if (pages.has(p.key)) created.set(p.key, { at: c.at, author: c.author, name: p.name }); // else deleted since
    }
  }
  const newest = [...created.entries()]
    .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
    .slice(0, 3)
    .map(([, c]) => ({ ...pageName(c.name), author: c.author, at: c.at }));

  const since = Date.now() - 30 * 24 * 3600 * 1000;
  const recentTimes = commits.map((c) => c.at).filter((at) => Date.parse(at) >= since);
  return {
    pages: pages.size,
    newest,
    recent: commits.slice(0, 8).map((c) => ({
      pages: c.pages.slice(0, 3).map((p) => pageName(p.name)),
      more: Math.max(0, c.pages.length - 3),
      author: c.author,
      at: c.at,
      message: c.message.slice(0, 140),
    })),
    // Edits of the last 30 days: the screen groups them by its own calendar days
    activity: recentTimes,
    authors30: new Set(commits.filter((c) => Date.parse(c.at) >= since).map((c) => c.author).filter(Boolean)).size,
  };
}

async function fetchStats(wiki) {
  const [sitemap, feed] = [await read(wiki, '/sitemap.xml'), await read(wiki, '/-/changelog/feed.atom')];
  if (!sitemap.includes('<urlset')) throw new Error('The wiki did not return its page list.');
  if (!feed.includes('<feed')) throw new Error('The wiki did not return its changelog.');
  return buildStats(sitemap, feed);
}

export const wikiService = {
  // What the dashboard may see: no password
  info() {
    const wiki = stored();
    return wiki ? { configured: true, url: wiki.url, email: wiki.email, feedId: wiki.feedId } : { configured: false };
  },

  // Checks the account against the wiki before saving. An empty password keeps the saved one.
  async configure(input) {
    const previous = stored();
    let url;
    try {
      url = new URL(String(input?.url || '').trim());
    } catch {
      throw new Error('That is not a valid address.');
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use the http or https address of the wiki.');
    const email = String(input?.email || '').trim();
    const password = String(input?.password || '') || (previous?.email === email ? previous.password : '');
    if (!email || !password) throw new Error('Enter the email and password of the wiki account.');
    const wiki = { url: url.origin, email, password, feedId: previous?.feedId || crypto.randomBytes(12).toString('hex') };
    await login(wiki);
    const stats = await fetchStats(wiki);
    save(wiki);
    cache = { at: Date.now(), stats, error: null };
    return this.info();
  },

  remove() {
    db.run('DELETE FROM settings WHERE key = ?', KEY);
    cache = null;
    cookies = new Map();
  },

  /** Numbers for a screen, by the random feed id */
  async stats(feedId) {
    const wiki = stored();
    if (!wiki || wiki.feedId !== feedId) return null;
    if (!cache || Date.now() - cache.at > REFRESH_MS) {
      try {
        cache = { at: Date.now(), stats: await fetchStats(wiki), error: null };
      } catch (err) {
        // Keep showing the last numbers; try again at the next refresh
        cache = { ...(cache || { stats: null }), at: Date.now(), error: err.message };
      }
    }
    return { ...(cache.stats || { pages: null, newest: [], recent: [], activity: [], authors30: 0 }), updatedAt: new Date(cache.at).toISOString(), error: cache.error };
  },
};


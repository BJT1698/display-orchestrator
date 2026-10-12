// Widgets are saved as ordinary HTML snippets, so screens play them like any other media. The
// widget's settings ride along in a leading comment, which lets the dashboard reopen it for editing.

const MARKER = /<!--\s*signage-widget:([A-Za-z0-9+/=]+)\s*-->/;

const toBase64 = (text) => btoa(unescape(encodeURIComponent(text)));
const fromBase64 = (b64) => decodeURIComponent(escape(atob(b64)));

export function readWidget(html) {
  const match = MARKER.exec(String(html || ''));
  if (!match) return null;
  try {
    return JSON.parse(fromBase64(match[1]));
  } catch {
    return null;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Values handed to the widget's script as data, never as code
export const asJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

// Same look as the screens' own pages: graphite ground, Archivo, sizes in vmin so a widget reads
// from a distance in landscape and portrait alike. fonts/ resolves to the viewer's bundled fonts
// on a screen and to the server's copy in the dashboard preview.
const BASE_CSS = `
@font-face{font-family:'Archivo Player';font-weight:100 900;font-stretch:62% 125%;src:url(fonts/archivo-latin-standard-normal.woff2) format('woff2-variations');}
@font-face{font-family:'Archivo Player';font-weight:100 900;font-stretch:62% 125%;src:url(fonts/archivo-latin-ext-standard-normal.woff2) format('woff2-variations');unicode-range:U+0100-02BA,U+1E00-1EFF;}
.w{position:fixed;inset:0;background:#16181C;color:#E6E8EB;font-family:'Archivo Player','Archivo Variable',system-ui,sans-serif;font-variant-numeric:tabular-nums;padding:7vmin;overflow:hidden;cursor:none;-webkit-font-smoothing:antialiased}
.w,.w *{box-sizing:border-box;margin:0}
.w-cond{font-stretch:80%;letter-spacing:-0.01em}
.w-muted{color:#9AA1AB}
.w-faint{color:#6B727C}
`;

export function wrapWidget(config, { css = '', body, script = '' }) {
  return [
    `<!-- signage-widget:${toBase64(JSON.stringify(config))} -->`,
    `<style>${BASE_CSS}${css}</style>`,
    body,
    script ? `<script>(function(){${script}})();</script>` : '',
  ].join('\n');
}

// Shared by clock-like widgets: Italian dates as people read them
export const DATE_SCRIPT = `
function itDate(d, tz){ var s = new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',timeZone:tz}).format(d); return s.charAt(0).toUpperCase()+s.slice(1); }
`;

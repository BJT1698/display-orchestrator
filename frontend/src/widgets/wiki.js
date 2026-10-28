import { wrapWidget, escapeHtml, asJson } from './base';

// Numbers come from the signage server, which reads the wiki with a read-only account (the
// password never reaches the screens). Same server lookup as the calendar: this page's origin in
// the dashboard preview, the server the agent talks to on a display.
const SCRIPT = `
var cfg = __CFG__;
var KEY = 'signage-wiki:' + cfg.feedId;
var data = null, fetchedAt = 0, stale = false;

var hm = new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'});
var dm = new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'});
var dmy = new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric'});
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function midnight(t){ var d = new Date(t); d.setHours(0,0,0,0); return +d; }

// "adesso", "12 min fa", "3 ore fa", "ieri alle 14:30", "4 giorni fa", "12 ott"
function ago(iso){
  var t = +new Date(iso), now = Date.now(), m = Math.round((now - t) / 60000);
  if (m < 2) return 'adesso';
  if (m < 60) return m + ' min fa';
  var days = Math.round((midnight(now) - midnight(t)) / 86400000);
  if (days === 0) { var h = Math.round(m / 60); return h === 1 ? "un'ora fa" : h + ' ore fa'; }
  if (days === 1) return 'ieri alle ' + hm.format(new Date(t));
  if (days < 7) return days + ' giorni fa';
  return new Date(t).getFullYear() === new Date(now).getFullYear() ? dm.format(new Date(t)) : dmy.format(new Date(t));
}
function where(p){ return p.folder ? '<span class="wk-folder">' + esc(p.folder) + ' / </span>' : ''; }

function serverBases(){
  return fetch('/api/agent/state').then(function(r){ return r.ok ? r.json() : null; }).then(function(s){
    var url = s && s.config && s.config.serverUrl;
    if (!url) return [''];
    return ['', url.replace(/^ws/, 'http').replace(/\\/ws\\/?$/, '')];
  }).catch(function(){ return ['']; });
}
var bases = null;
function load(){
  var path = '/wiki/' + cfg.feedId + '.json';
  function tryAt(i){
    if (i >= bases.length) return Promise.reject(new Error('unreachable'));
    return fetch(bases[i] + path).then(function(r){
      if (r.status === 404 && i + 1 < bases.length) return tryAt(i + 1);
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).catch(function(e){ if (i + 1 < bases.length) return tryAt(i + 1); throw e; });
  }
  (bases ? Promise.resolve(bases) : serverBases().then(function(b){ bases = b; return b; })).then(function(){
    return tryAt(0);
  }).then(function(d){
    data = d; fetchedAt = Date.now(); stale = Boolean(d.error);
    try { localStorage.setItem(KEY, JSON.stringify({ data: d, at: fetchedAt })); } catch (e) {}
    render();
  }).catch(function(){
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (saved && !data) { data = saved.data; fetchedAt = saved.at; }
    stale = true;
    render();
  });
}

function render(){
  var now = Date.now();
  var count = document.getElementById('count'), side = document.getElementById('side'), list = document.getElementById('list');
  if (!data || data.pages == null) {
    count.textContent = '–';
    side.innerHTML = '<div class="wk-empty w-muted">Wiki non raggiungibile</div>';
    list.innerHTML = '';
    document.getElementById('upd').textContent = '';
    return;
  }
  count.textContent = new Intl.NumberFormat('it-IT').format(data.pages);

  // Edits per day over the last 30 days, today on the right
  var today = midnight(now), bins = [], week = 0, i;
  for (i = 0; i < 30; i++) bins.push(0);
  (data.activity || []).forEach(function(at){
    var d = Math.round((today - midnight(at)) / 86400000);
    if (d >= 0 && d < 30) bins[29 - d]++;
    if (d >= 0 && d < 7) week++;
  });
  var max = Math.max.apply(null, bins.concat([1]));
  document.getElementById('bars').innerHTML = bins.map(function(n, k){
    return '<i class="' + (k === 29 ? 'is-today' : '') + (n ? '' : ' is-zero') + '" style="height:' + (n ? Math.max(8, n / max * 100) : 3).toFixed(1) + '%"></i>';
  }).join('');
  document.getElementById('week').textContent = week === 1 ? '1 modifica negli ultimi 7 giorni' : week + ' modifiche negli ultimi 7 giorni';
  document.getElementById('authors').textContent = data.authors30 === 1 ? '1 autore attivo nel mese' : (data.authors30 || 0) + ' autori attivi nel mese';

  // Newest article, then the two before it
  var nw = data.newest || [];
  var html = '<div class="wk-label w-faint">Ultimo articolo pubblicato</div>';
  if (nw.length) {
    var a = nw[0];
    html += '<div class="wk-new">' + (a.folder ? '<div class="wk-nfolder w-muted">' + esc(a.folder) + '</div>' : '') +
      '<div class="wk-ntitle w-cond">' + esc(a.title) + '</div>' +
      '<div class="wk-nmeta w-muted">' + (a.author ? esc(a.author) + '  ·  ' : '') + ago(a.at) + '</div></div>';
    if (nw.length > 1) {
      html += '<div class="wk-others">' + nw.slice(1).map(function(p){
        return '<div class="wk-other"><span class="wk-otitle">' + where(p) + esc(p.title) + '</span><span class="wk-oago w-faint">' + ago(p.at) + '</span></div>';
      }).join('') + '</div>';
    }
  } else {
    html += '<div class="wk-empty w-muted">Nessun articolo</div>';
  }
  side.innerHTML = html;

  // Latest changes
  list.innerHTML = (data.recent || []).map(function(c){
    var pages = c.pages.map(function(p){ return where(p) + esc(p.title); }).join(', ') + (c.more ? ' <span class="w-faint">+' + c.more + '</span>' : '');
    return '<div class="wk-row"><div class="wk-when">' + ago(c.at) + '</div><div class="wk-what">' +
      '<div class="wk-rtitle">' + (pages || '<span class="w-muted">Allegati</span>') + '</div>' +
      '<div class="wk-rmeta w-faint">' + esc(c.author || '') + (c.message ? (c.author ? '  ·  ' : '') + esc(c.message) : '') + '</div>' +
      '</div></div>';
  }).join('') || '<div class="wk-empty w-muted">Nessuna modifica</div>';
  document.getElementById('upd').textContent = fetchedAt ? (stale ? 'Ultimo aggiornamento ' : 'Aggiornato alle ') + hm.format(new Date(fetchedAt)) : '';
}

load(); setInterval(load, 2 * 60 * 1000); setInterval(render, 30 * 1000);
`;

export const wikiWidget = {
  type: 'wiki',
  label: 'Wiki',
  description: 'How many articles the wiki has, the newest one and the latest changes.',
  defaults: { feedId: '', wikiUrl: '', title: 'Wiki' },
  fields: [
    { key: 'feedId', label: 'Wiki', type: 'wiki', required: true },
    { key: 'title', label: 'Caption', type: 'text', placeholder: 'Wiki MVS', hint: 'Shown at the top.' },
  ],
  defaultName: (c) => `Wiki, ${c.title || 'statistiche'}`,

  render(c) {
    return wrapWidget({ type: 'wiki', ...c }, {
      css: `
        .wk{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:6vmin;height:100%}
        .wk-side{display:flex;flex-direction:column;min-height:0}
        .wk-cap{font-size:3.4vmin}
        .wk-count{font-size:22vmin;font-weight:600;line-height:.85;margin-top:2vmin}
        .wk-unit{font-size:4vmin;font-weight:600;margin-top:1.4vmin}
        .wk-bars{display:flex;align-items:flex-end;gap:.5vmin;height:9vmin;margin-top:4.5vmin}
        .wk-bars i{flex:1;background:#4A5059;border-radius:.3vmin .3vmin 0 0}
        .wk-bars i.is-zero{background:#262A30}
        .wk-bars i.is-today{background:#E6E8EB}
        .wk-axis{display:flex;justify-content:space-between;font-size:2vmin;margin-top:1vmin}
        .wk-stats{font-size:2.8vmin;margin-top:2.2vmin;line-height:1.5}
        .wk-newbox{margin-top:auto;padding-top:3.4vmin;border-top:1px solid #33383F}
        .wk-label{font-size:2.6vmin;text-transform:uppercase;letter-spacing:.06em}
        .wk-new{margin-top:1.6vmin}
        .wk-nfolder{font-size:2.8vmin}
        .wk-ntitle{font-size:6.4vmin;font-weight:600;line-height:1.04;margin-top:.6vmin;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .wk-nmeta{font-size:3vmin;margin-top:1.2vmin}
        .wk-others{margin-top:2.4vmin}
        .wk-other{display:flex;justify-content:space-between;gap:2vmin;font-size:2.8vmin;padding:.8vmin 0;border-top:1px solid #262A30}
        .wk-otitle{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .wk-oago{white-space:nowrap}
        .wk-folder{color:#6B727C}
        .wk-list{display:flex;flex-direction:column;min-height:0;background:#1E2126;border:1px solid #33383F;border-radius:1.4vmin;padding:3.4vmin 3.6vmin}
        .wk-rows{flex:1;min-height:0;overflow:hidden;margin-top:1.4vmin;-webkit-mask:linear-gradient(180deg,#000 85%,transparent);mask:linear-gradient(180deg,#000 85%,transparent)}
        .wk-row{display:grid;grid-template-columns:17vmin 1fr;gap:2vmin;padding:1.5vmin 0;border-bottom:1px solid #262A30}
        .wk-when{font-size:2.6vmin;color:#9AA1AB;padding-top:.5vmin}
        .wk-rtitle{font-size:3.3vmin;font-weight:600;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .wk-rmeta{font-size:2.4vmin;margin-top:.5vmin;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .wk-empty{font-size:3.4vmin;margin-top:1.6vmin}
        .wk-upd{font-size:2vmin;margin-top:2vmin}
        @media (orientation:portrait){.wk{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.wk-newbox{margin-top:4vmin}}
      `,
      body: `
        <div class="w"><div class="wk">
          <div class="wk-side">
            <div class="wk-cap w-muted">${escapeHtml(c.title || 'Wiki')}</div>
            <div class="wk-count w-cond" id="count"></div>
            <div class="wk-unit">articoli</div>
            <div class="wk-bars" id="bars"></div>
            <div class="wk-axis w-faint"><span>30 giorni fa</span><span>oggi</span></div>
            <div class="wk-stats w-muted"><div id="week"></div><div id="authors"></div></div>
            <div class="wk-newbox" id="side"></div>
          </div>
          <div class="wk-list">
            <div class="wk-label w-faint">Ultime modifiche</div>
            <div class="wk-rows" id="list"></div>
            <div class="wk-upd w-faint" id="upd"></div>
          </div>
        </div></div>`,
      script: SCRIPT.replace('__CFG__', asJson({ feedId: c.feedId })),
    });
  },
};

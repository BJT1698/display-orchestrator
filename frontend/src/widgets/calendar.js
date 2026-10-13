import { wrapWidget, escapeHtml, asJson } from './base';

// Events come from the signage server, which downloads the published calendar (the ICS link
// never reaches the screens). In the dashboard preview the server is this page's own origin; on
// a display the widget runs on the agent's origin, so it reads the server address from the agent.
const SCRIPT = `
var cfg = __CFG__;
var KEY = 'signage-calendar:' + cfg.calendarId;
var data = null, fetchedAt = 0, stale = false;

var hm = new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'});
var dayLong = new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long'});
function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function dayKey(d){ return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

function dayLabel(d, now){
  var t = new Date(now); t.setHours(0,0,0,0);
  var x = new Date(d); x.setHours(0,0,0,0);
  var diff = Math.round((x - t) / 86400000);
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Domani';
  return cap(dayLong.format(d));
}
var weekday = new Intl.DateTimeFormat('it-IT',{weekday:'long'});
function inMinutes(ms){
  var m = Math.max(1, Math.round(ms / 60000));
  if (m >= 12 * 60) {
    // Far away: say the day, not a pile of hours
    var at = new Date(Date.now() + ms);
    var label = dayLabel(at, Date.now());
    if (label === 'Oggi') label = 'oggi';
    else if (label === 'Domani') label = 'domani';
    else label = weekday.format(at);
    return label + ' alle ' + hm.format(at);
  }
  if (m < 60) return 'tra ' + m + ' min';
  var h = Math.floor(m / 60), r = m % 60;
  return 'tra ' + h + (h === 1 ? ' ora' : ' ore') + (r ? ' e ' + r + ' min' : '');
}
function span(e){ return e.allDay ? 'Tutto il giorno' : hm.format(new Date(e.start)) + ' – ' + hm.format(new Date(e.end)); }

function serverBases(){
  // 1) same origin (dashboard preview); 2) the server the display's agent talks to
  return fetch('/api/agent/state').then(function(r){ return r.ok ? r.json() : null; }).then(function(s){
    var url = s && s.config && s.config.serverUrl;
    if (!url) return [''];
    return ['', url.replace(/^ws/, 'http').replace(/\\/ws\\/?$/, '')];
  }).catch(function(){ return ['']; });
}
var bases = null;
function load(){
  var path = '/calendar/' + cfg.calendarId + '.json?days=' + (cfg.days || 7);
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
  var nowEl = document.getElementById('now'), agenda = document.getElementById('agenda');
  document.getElementById('today').textContent = cap(dayLong.format(new Date(now)));
  document.getElementById('clock').textContent = hm.format(new Date(now));
  if (!data) {
    nowEl.innerHTML = '<div class="cal-empty w-muted">Calendario non disponibile</div>';
    agenda.innerHTML = '';
    return;
  }
  var events = (data.events || []).filter(function(e){ return new Date(e.end) > now; });
  var timed = events.filter(function(e){ return !e.allDay; });
  var current = timed.filter(function(e){ return new Date(e.start) <= now; });
  var next = timed.filter(function(e){ return new Date(e.start) > now; })[0];

  var html = '';
  if (current.length) {
    current.slice(0, 2).forEach(function(e){
      var s = +new Date(e.start), en = +new Date(e.end);
      var pct = Math.min(100, Math.max(0, (now - s) / (en - s) * 100));
      html += '<div class="cal-live"><div class="cal-tag"><span class="cal-dot"></span>In corso</div>' +
        '<div class="cal-title w-cond">' + esc(e.title) + '</div>' +
        '<div class="cal-when w-muted">' + span(e) + (e.location ? '  ·  ' + esc(e.location) : '') + '</div>' +
        '<div class="cal-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<div class="cal-left w-faint">Termina ' + inMinutes(en - now) + '</div></div>';
    });
  } else {
    html += '<div class="cal-free"><div class="cal-tag cal-tag-free"><span class="cal-dot"></span>Libero</div></div>';
  }
  if (next) {
    html += '<div class="cal-next"><div class="cal-label w-faint">Prossimo · ' + inMinutes(+new Date(next.start) - now) + '</div>' +
      '<div class="cal-ntitle">' + esc(next.title) + '</div>' +
      '<div class="cal-when w-muted">' + (dayKey(new Date(next.start)) === dayKey(new Date(now)) ? '' : dayLabel(new Date(next.start), now) + ', ') + span(next) + (next.location ? '  ·  ' + esc(next.location) : '') + '</div></div>';
  }
  nowEl.innerHTML = html;

  // Agenda: everything still to come, grouped by day
  var rows = '', lastDay = '', shown = 0;
  events.forEach(function(e){
    if (shown >= 12) return;
    var d = new Date(e.allDay ? e.start : Math.max(+new Date(e.start), now));
    var k = dayKey(d);
    if (k !== lastDay) { rows += '<div class="cal-day">' + dayLabel(d, now) + '</div>'; lastDay = k; }
    var live = !e.allDay && new Date(e.start) <= now;
    rows += '<div class="cal-row' + (live ? ' is-live' : '') + '"><div class="cal-time">' + (e.allDay ? 'Giornata' : hm.format(new Date(e.start))) + '</div>' +
      '<div class="cal-what"><div class="cal-rtitle">' + esc(e.title) + '</div>' +
      (e.location || !e.allDay ? '<div class="cal-rmeta w-faint">' + (e.allDay ? '' : 'fino alle ' + hm.format(new Date(e.end))) + (e.location ? (e.allDay ? '' : '  ·  ') + esc(e.location) : '') + '</div>' : '') +
      '</div></div>';
    shown++;
  });
  agenda.innerHTML = rows || '<div class="cal-empty w-muted">Nessun impegno nei prossimi ' + (cfg.days || 7) + ' giorni</div>';
  document.getElementById('upd').textContent = fetchedAt ? (stale ? 'Ultimo aggiornamento ' : 'Aggiornato alle ') + hm.format(new Date(fetchedAt)) : '';
}

load(); setInterval(load, 2 * 60 * 1000); setInterval(render, 10 * 1000);
`;

export const calendarWidget = {
  type: 'calendar',
  label: 'Calendar',
  description: 'Meetings now, next and in the coming days, from a published Outlook calendar.',
  defaults: { calendarId: '', calendarName: '', title: '', days: 7 },
  fields: [
    { key: 'calendarId', label: 'Calendar', type: 'calendar', required: true },
    { key: 'title', label: 'Caption', type: 'text', placeholder: 'Sala riunioni', hint: 'Optional, shown at the top. The calendar name is used otherwise.' },
    { key: 'days', label: 'Days ahead', type: 'select', options: [[3, '3 days'], [7, 'A week'], [14, 'Two weeks']] },
  ],
  defaultName: (c) => `Calendar, ${c.title || c.calendarName || 'Outlook'}`,

  render(c) {
    return wrapWidget({ type: 'calendar', ...c }, {
      css: `
        .cal{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:6vmin;height:100%}
        .cal-side{display:flex;flex-direction:column;min-height:0}
        .cal-cap{font-size:3.4vmin}
        .cal-today{font-size:6vmin;font-weight:600;line-height:1.05;margin-top:1vmin}
        .cal-clock{font-size:17vmin;font-weight:600;line-height:.9;margin-top:2vmin;color:#E6E8EB}
        .cal-nowbox{margin-top:auto}
        .cal-tag{display:inline-flex;align-items:center;gap:1.4vmin;font-size:2.8vmin;font-weight:600;color:#3FB37F;text-transform:uppercase;letter-spacing:.06em}
        .cal-tag-free{color:#9AA1AB}
        .cal-dot{width:1.8vmin;height:1.8vmin;border-radius:50%;background:currentColor;animation:pulse 2.4s ease-in-out infinite}
        .cal-tag-free .cal-dot{animation:none}
        .cal-live + .cal-live{margin-top:4vmin}
        .cal-title{font-size:8vmin;font-weight:600;line-height:1.02;margin-top:1.6vmin;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .cal-when{font-size:3.3vmin;margin-top:1.4vmin}
        .cal-bar{height:.7vmin;background:#33383F;margin-top:2.6vmin;border-radius:1vmin;overflow:hidden}
        .cal-bar i{display:block;height:100%;background:#3FB37F;transition:width 1s linear}
        .cal-left{font-size:2.5vmin;margin-top:1.2vmin}
        .cal-next{margin-top:5vmin;padding-top:3.4vmin;border-top:1px solid #33383F}
        .cal-label{font-size:2.6vmin;text-transform:uppercase;letter-spacing:.06em}
        .cal-ntitle{font-size:5vmin;font-weight:600;line-height:1.1;margin-top:1.2vmin}
        .cal-list{display:flex;flex-direction:column;min-height:0;background:#1E2126;border:1px solid #33383F;border-radius:1.4vmin;padding:3.4vmin 3.6vmin}
        .cal-agenda{flex:1;min-height:0;overflow:hidden;-webkit-mask:linear-gradient(180deg,#000 85%,transparent);mask:linear-gradient(180deg,#000 85%,transparent)}
        .cal-day{font-size:2.5vmin;font-weight:600;color:#9AA1AB;text-transform:uppercase;letter-spacing:.06em;margin:3vmin 0 1vmin}
        .cal-day:first-child{margin-top:0}
        .cal-row{display:grid;grid-template-columns:11vmin 1fr;gap:2vmin;padding:1.3vmin 0;border-bottom:1px solid #262A30}
        .cal-row.is-live .cal-time{color:#3FB37F}
        .cal-time{font-size:3.2vmin;font-weight:600}
        .cal-allday{font-size:2.1vmin;line-height:1.15;color:#9AA1AB;text-transform:uppercase;letter-spacing:.04em;padding-top:.5vmin}
        .cal-rtitle{font-size:3.2vmin;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cal-rmeta{font-size:2.3vmin;margin-top:.4vmin;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cal-empty{font-size:3.4vmin}
        .cal-upd{font-size:2vmin;margin-top:2vmin}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @media (orientation:portrait){.cal{grid-template-columns:1fr;grid-template-rows:auto 1fr}.cal-nowbox{margin-top:5vmin}}
      `,
      body: `
        <div class="w"><div class="cal">
          <div class="cal-side">
            <div class="cal-cap w-muted">${escapeHtml(c.title || c.calendarName || '')}</div>
            <div class="cal-today w-cond" id="today"></div>
            <div class="cal-clock w-cond" id="clock"></div>
            <div class="cal-nowbox" id="now"></div>
          </div>
          <div class="cal-list">
            <div class="cal-agenda" id="agenda"></div>
            <div class="cal-upd w-faint" id="upd"></div>
          </div>
        </div></div>`,
      script: SCRIPT.replace('__CFG__', asJson({ calendarId: c.calendarId, days: Number(c.days) || 7 })),
    });
  },
};

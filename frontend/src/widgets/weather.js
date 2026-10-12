import { wrapWidget, escapeHtml, asJson } from './base';

// Runs on the screen: fetches Open-Meteo (free, no key) every 15 minutes and keeps the last
// answer, so a short network outage shows slightly old data instead of nothing.
const SCRIPT = `
var cfg = __CFG__;
var KEY = 'signage-weather:' + cfg.latitude + ',' + cfg.longitude;

// WMO weather codes -> [Italian text, icon]
function describe(code){
  if (code === 0) return ['Sereno','sun'];
  if (code === 1) return ['Prevalentemente sereno','sun'];
  if (code === 2) return ['Parzialmente nuvoloso','partly'];
  if (code === 3) return ['Coperto','cloud'];
  if (code === 45 || code === 48) return ['Nebbia','fog'];
  if (code >= 51 && code <= 57) return ['Pioviggine','rain'];
  if (code >= 61 && code <= 67) return ['Pioggia','rain'];
  if (code >= 71 && code <= 77) return ['Neve','snow'];
  if (code >= 80 && code <= 82) return ['Rovesci','rain'];
  if (code === 85 || code === 86) return ['Rovesci di neve','snow'];
  if (code >= 95) return ['Temporale','storm'];
  return ['','cloud'];
}

// Line icons drawn in the screens' muted ink, no emoji
var ICONS = {
  sun: '<circle cx="24" cy="24" r="9"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/>',
  partly: '<circle cx="18" cy="17" r="7"/><path d="M18 3v4M5 17H3M7.4 6.4l2.8 2.8M28.6 6.4l-2.8 2.8"/><path d="M16 40h20a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 1 13z"/>',
  cloud: '<path d="M14 38h22a9 9 0 0 0 0-18 12 12 0 0 0-23 3 7.5 7.5 0 0 0 1 15z"/>',
  fog: '<path d="M8 18h32M4 26h40M8 34h32"/>',
  rain: '<path d="M14 30h22a9 9 0 0 0 0-18 12 12 0 0 0-23 3 7.5 7.5 0 0 0 1 15z"/><path d="M16 36l-3 6M25 36l-3 6M34 36l-3 6"/>',
  snow: '<path d="M14 30h22a9 9 0 0 0 0-18 12 12 0 0 0-23 3 7.5 7.5 0 0 0 1 15z"/><path d="M16 38v4M14 40h4M25 38v4M23 40h4M34 38v4M32 40h4"/>',
  storm: '<path d="M14 30h22a9 9 0 0 0 0-18 12 12 0 0 0-23 3 7.5 7.5 0 0 0 1 15z"/><path d="M25 32l-5 8h7l-4 7"/>'
};
function icon(name){ return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.cloud) + '</svg>'; }

var dayFmt = new Intl.DateTimeFormat('it-IT',{weekday:'short'});
var timeFmt = new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'});
function round(n){ return Math.round(n); }

function render(data, at, stale){
  var cur = data.current, daily = data.daily;
  var d = describe(cur.weather_code);
  document.getElementById('icon').innerHTML = icon(d[1]);
  document.getElementById('temp').textContent = round(cur.temperature_2m) + '°';
  document.getElementById('cond').textContent = d[0];
  document.getElementById('meta').textContent = 'Umidità ' + round(cur.relative_humidity_2m) + '%   Vento ' + round(cur.wind_speed_10m) + ' km/h';
  var html = '';
  for (var i = 1; i < daily.time.length && i <= 3; i++) {
    var dd = describe(daily.weather_code[i]);
    var name = dayFmt.format(new Date(daily.time[i] + 'T12:00'));
    html += '<div class="wx-day"><div class="wx-dname w-muted">' + name.charAt(0).toUpperCase() + name.slice(1).replace('.','') + '</div>' +
      '<div class="wx-dicon">' + icon(dd[1]) + '</div>' +
      '<div class="wx-drange"><span>' + round(daily.temperature_2m_max[i]) + '°</span> <span class="w-faint">' + round(daily.temperature_2m_min[i]) + '°</span></div></div>';
  }
  document.getElementById('days').innerHTML = html;
  document.getElementById('upd').textContent = (stale ? 'Ultimo aggiornamento ' : 'Aggiornato alle ') + timeFmt.format(new Date(at));
}

function load(){
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + cfg.latitude + '&longitude=' + cfg.longitude +
    '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto';
  fetch(url).then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); }).then(function(data){
    var at = Date.now();
    render(data, at, false);
    try { localStorage.setItem(KEY, JSON.stringify({data:data, at:at})); } catch (e) {}
  }).catch(function(){
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (saved) render(saved.data, saved.at, true);
    else document.getElementById('cond').textContent = 'Meteo non disponibile';
  });
}
load(); setInterval(load, 15 * 60 * 1000);
`;

export const weatherWidget = {
  type: 'weather',
  label: 'Weather',
  description: 'Current weather and the next three days for a place, from Open-Meteo.',
  defaults: { place: '', latitude: null, longitude: null },
  fields: [
    { key: 'place', label: 'Place', type: 'place', required: true, hint: 'Search a town, then pick it from the list.' },
  ],
  isReady: (c) => typeof c.latitude === 'number' && typeof c.longitude === 'number',
  defaultName: (c) => (c.place ? `Weather, ${c.place.split(',')[0]}` : 'Weather'),

  render(c) {
    return wrapWidget({ type: 'weather', ...c }, {
      css: `
        .wx{display:flex;flex-direction:column;justify-content:space-between;height:100%}
        .wx-place{font-size:4vmin}
        .wx-now{display:flex;align-items:center;gap:5vmin}
        .wx-icon{width:24vmin;height:24vmin;color:#9AA1AB;flex:none}
        .wx-icon svg,.wx-dicon svg{width:100%;height:100%}
        .wx-temp{font-size:26vmin;font-weight:600;line-height:.9}
        .wx-cond{font-size:5vmin;margin-top:1vmin}
        .wx-meta{font-size:2.8vmin;margin-top:1.6vmin;white-space:pre}
        .wx-days{display:grid;grid-template-columns:repeat(3,1fr);gap:4vmin;border-top:1px solid #33383F;padding-top:3vmin}
        .wx-dname{font-size:3vmin}
        .wx-dicon{width:9vmin;height:9vmin;color:#9AA1AB;margin:1.4vmin 0}
        .wx-drange{font-size:4.4vmin;font-weight:600}
        .wx-upd{font-size:2.2vmin;margin-top:2vmin}
        @media (orientation:portrait){.wx-now{flex-direction:column;align-items:flex-start}}
      `,
      body: `
        <div class="w"><div class="wx">
          <div class="wx-place w-muted">${escapeHtml(c.place)}</div>
          <div class="wx-now">
            <div class="wx-icon" id="icon"></div>
            <div>
              <div class="wx-temp w-cond" id="temp">--°</div>
              <div class="wx-cond" id="cond"></div>
              <div class="wx-meta w-muted" id="meta"></div>
            </div>
          </div>
          <div>
            <div class="wx-days" id="days"></div>
            <div class="wx-upd w-faint" id="upd"></div>
          </div>
        </div></div>`,
      script: SCRIPT.replace('__CFG__', asJson({ latitude: c.latitude, longitude: c.longitude })),
    });
  },
};

// Used by the form: Open-Meteo's geocoding, called from the dashboard while editing
export async function searchPlaces(query) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=it`);
  if (!res.ok) throw new Error('Place search is not available right now.');
  const body = await res.json();
  return (body.results || []).map((r) => ({
    label: [r.name, r.admin2 || r.admin1, r.country].filter(Boolean).join(', '),
    latitude: Math.round(r.latitude * 1000) / 1000,
    longitude: Math.round(r.longitude * 1000) / 1000,
  }));
}

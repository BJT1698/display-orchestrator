import { wrapWidget, escapeHtml, asJson } from './base';

// Runs on the screen: fetches Open-Meteo (free, no key) every 15 minutes and keeps the last
// answer, so a short network outage shows slightly old data instead of nothing. The whole
// background is a scene matching the current weather and time of day: blue sky with sun, grey
// with clouds, rain, snow, fog, a storm, or a starry night. Animations use transforms, opacity
// and one canvas for falling rain or snow, light enough for the display laptops.
const SCRIPT = `
var cfg = __CFG__;
var KEY = 'signage-weather:' + cfg.latitude + ',' + cfg.longitude;

// WMO weather codes -> [Italian text, scene, intensity 0..1]
function describe(code){
  if (code === 0) return ['Sereno','clear',0];
  if (code === 1) return ['Prevalentemente sereno','clear',0.3];
  if (code === 2) return ['Parzialmente nuvoloso','partly',0.5];
  if (code === 3) return ['Coperto','overcast',1];
  if (code === 45 || code === 48) return ['Nebbia','fog',1];
  if (code >= 51 && code <= 57) return ['Pioviggine','rain',0.35];
  if (code === 61 || code === 66) return ['Pioggia debole','rain',0.55];
  if (code >= 62 && code <= 67) return ['Pioggia','rain',0.85];
  if (code === 71 || code === 77) return ['Neve debole','snow',0.5];
  if (code >= 72 && code <= 76) return ['Neve','snow',0.9];
  if (code === 80) return ['Rovesci','rain',0.7];
  if (code === 81 || code === 82) return ['Forti rovesci','rain',1];
  if (code === 85 || code === 86) return ['Rovesci di neve','snow',1];
  if (code >= 95) return ['Temporale','storm',1];
  return ['','overcast',0.6];
}

// Sky per scene, day and night: [top, bottom] of the gradient
var SKIES = {
  clear:    { day: ['#1E6FD0', '#7DB9F0'], night: ['#060B1F', '#1B2A55'] },
  partly:   { day: ['#3378C8', '#9CC3E8'], night: ['#0A1128', '#26365E'] },
  overcast: { day: ['#5D6773', '#98A1AC'], night: ['#181C23', '#363D48'] },
  fog:      { day: ['#8E959D', '#C3C8CD'], night: ['#24282E', '#474D55'] },
  rain:     { day: ['#3E4A58', '#6E7B89'], night: ['#11161E', '#2B3440'] },
  snow:     { day: ['#7C8DA2', '#C9D3DE'], night: ['#1C2433', '#3E4B5F'] },
  storm:    { day: ['#1E2430', '#454E5C'], night: ['#0A0C12', '#232833'] }
};

// Colored icons for the forecast strip and the big one next to the temperature
var SUN = '<g class="ic-sun"><circle cx="24" cy="24" r="9" fill="#FFC83D"/><g class="ic-rays" stroke="#FFC83D" stroke-width="3" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/></g></g>';
var MOON = '<path d="M30 8a16 16 0 1 0 10 26A13 13 0 0 1 30 8z" fill="#E8ECF5"/>';
var CLOUD = function(fill, y){ return '<path transform="translate(0 ' + (y || 0) + ')" d="M14 38h22a9 9 0 0 0 0-18 12 12 0 0 0-23 3 7.5 7.5 0 0 0 1 15z" fill="' + fill + '"/>'; };
var ICONS = {
  clear: function(day){ return day ? SUN : MOON; },
  partly: function(day){ return '<g transform="translate(-6 -7) scale(.8)">' + (day ? SUN : MOON) + '</g>' + CLOUD('#F4F6F9', 2); },
  overcast: function(){ return '<g transform="translate(6 -8) scale(.8)">' + CLOUD('#B9C0C9') + '</g>' + CLOUD('#E9ECF0', 2); },
  fog: function(){ return '<g stroke="#E9ECF0" stroke-width="3.2" stroke-linecap="round"><path d="M8 17h32M4 25h40M8 33h32"/></g>'; },
  rain: function(){ return CLOUD('#E9ECF0', -6) + '<g stroke="#7FC4FF" stroke-width="3" stroke-linecap="round"><path d="M16 38l-3 6M25 38l-3 6M34 38l-3 6"/></g>'; },
  snow: function(){ return CLOUD('#F4F6F9', -6) + '<g fill="#FFFFFF"><circle cx="15" cy="41" r="2.4"/><circle cx="24" cy="44" r="2.4"/><circle cx="33" cy="41" r="2.4"/></g>'; },
  storm: function(){ return CLOUD('#AEB6C1', -6) + '<path d="M26 31l-6 9h7l-4 8" fill="none" stroke="#FFD24A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'; }
};
function icon(scene, day){ return '<svg viewBox="0 0 48 48">' + (ICONS[scene] || ICONS.overcast)(day) + '</svg>'; }

var sceneEl = document.getElementById('scene');
var current = null;

function rnd(a, b){ return a + Math.random() * (b - a); }

// A cloud is a few overlapping round puffs; it crosses the screen slowly and loops
function cloud(color, opacity, top, size, duration, delay){
  var c = document.createElement('div');
  c.className = 'cl';
  c.style.top = top + '%';
  c.style.width = size + 'vmin';
  c.style.height = (size * 0.42) + 'vmin';
  c.style.opacity = opacity;
  c.style.animationDuration = duration + 's';
  c.style.animationDelay = (-delay) + 's';
  var puffs = [[0, 38, 46], [22, 8, 56], [50, 18, 48], [70, 40, 34]];
  puffs.forEach(function(p){
    var b = document.createElement('i');
    b.style.left = p[0] + '%'; b.style.top = p[1] + '%';
    b.style.width = p[2] + '%'; b.style.height = (p[2] * 2.3) + '%';
    b.style.background = 'radial-gradient(circle at 50% 40%, ' + color + ' 0 58%, transparent 71%)';
    c.appendChild(b);
  });
  return c;
}

function layer(scene, day, intensity){
  var sky = SKIES[scene][day ? 'day' : 'night'];
  var l = document.createElement('div');
  l.className = 'sc';
  l.style.background = 'linear-gradient(180deg,' + sky[0] + ' 0%,' + sky[1] + ' 100%)';

  if (scene === 'clear' || scene === 'partly') {
    if (day) {
      // Glare over the sky, then a white disc with a warm corona and faint shimmering rays
      var sun = document.createElement('div'); sun.className = 'sun';
      sun.innerHTML = '<i class="sun-glare"></i><i class="sun-rays"></i><i class="sun-rays sun-rays2"></i><i class="sun-disc"></i>';
      l.appendChild(sun);
    } else {
      var stars = document.createElement('div'); stars.className = 'stars';
      for (var i = 0; i < 90; i++) {
        var s = document.createElement('i');
        s.style.left = rnd(0, 100) + '%'; s.style.top = rnd(0, 70) + '%';
        s.style.width = s.style.height = rnd(0.15, 0.45) + 'vmin';
        s.style.animationDelay = (-rnd(0, 6)) + 's';
        s.style.animationDuration = rnd(3, 7) + 's';
        stars.appendChild(s);
      }
      l.appendChild(stars);
      var moon = document.createElement('div'); moon.className = 'moon'; l.appendChild(moon);
    }
  }

  // How many clouds, how light, how fast for each kind of sky
  var plan = {
    clear: [Math.round(intensity * 4), day ? '#FFFFFF' : '#8B97B5', 0.6],
    partly: [6, day ? '#FFFFFF' : '#7D89A6', 0.7],
    overcast: [16, day ? '#C9CFD7' : '#4A525E', 0.9],
    fog: [0, '#FFFFFF', 0],
    rain: [9, day ? '#8A95A3' : '#39414D', 0.92],
    snow: [8, day ? '#E4E9EF' : '#5A6578', 0.9],
    storm: [10, day ? '#4B5260' : '#272C36', 0.95]
  }[scene];
  // Spread them evenly along their path, so the sky never empties out; mostly in the upper part
  var heavy = scene === 'overcast' || scene === 'storm' || scene === 'rain';
  for (var k = 0; k < plan[0]; k++) {
    var duration = rnd(110, 180);
    l.appendChild(cloud(plan[1], plan[2] * rnd(0.6, 1), rnd(-10, heavy ? 42 : 26),
      rnd(heavy ? 45 : 30, heavy ? 85 : 60), duration, duration * (k + Math.random() * 0.6) / plan[0]));
  }

  if (scene === 'fog') {
    for (var f = 0; f < 5; f++) {
      var band = document.createElement('div'); band.className = 'fog';
      band.style.top = (12 + f * 17) + '%';
      band.style.animationDuration = rnd(50, 90) + 's';
      band.style.animationDelay = (-rnd(0, 90)) + 's';
      l.appendChild(band);
    }
  }
  if (scene === 'storm') {
    var flash = document.createElement('div'); flash.className = 'flash'; l.appendChild(flash);
  }
  return l;
}

// Rain and snow on one canvas shared by every scene
var canvas = document.getElementById('fx');
var ctx = canvas.getContext('2d');
var drops = [];
var fx = { kind: null, amount: 0 };
function sizeCanvas(){ canvas.width = innerWidth; canvas.height = innerHeight; }
sizeCanvas(); addEventListener('resize', sizeCanvas);
function spawn(top){
  var w = canvas.width, h = canvas.height;
  return fx.kind === 'snow'
    ? { x: Math.random() * w, y: top ? -10 : Math.random() * h, r: rnd(1.2, 3.6) * h / 1080, v: rnd(0.6, 1.6) * h / 1080, p: Math.random() * 6.28 }
    : { x: Math.random() * w, y: top ? -40 : Math.random() * h, l: rnd(14, 30) * h / 1080, v: rnd(14, 22) * h / 1080 };
}
function setFx(kind, amount){
  fx.kind = kind; fx.amount = amount; drops = [];
  var n = kind === 'rain' ? Math.round(80 + amount * 260) : kind === 'snow' ? Math.round(60 + amount * 160) : 0;
  for (var i = 0; i < n; i++) drops.push(spawn(false));
}
function frame(){
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (fx.kind === 'rain') {
    ctx.strokeStyle = 'rgba(200,225,255,0.45)'; ctx.lineWidth = Math.max(1, h / 900); ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.18, d.y + d.l);
      d.y += d.v; d.x -= d.v * 0.18;
      if (d.y > h) drops[i] = spawn(true);
    }
    ctx.stroke();
  } else if (fx.kind === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    for (var j = 0; j < drops.length; j++) {
      var s = drops[j];
      s.p += 0.01; s.y += s.v; s.x += Math.sin(s.p) * 0.5;
      ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, 6.283);
      if (s.y > h + 5) drops[j] = spawn(true);
    }
    ctx.fill();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Crossfade to a new scene only when the weather or day/night actually changes
function showScene(scene, day, intensity){
  var key = scene + (day ? 'd' : 'n') + intensity;
  if (key === current) return;
  current = key;
  var next = layer(scene, day, intensity);
  next.style.opacity = 0;
  sceneEl.appendChild(next);
  next.getBoundingClientRect();
  next.style.opacity = 1;
  setTimeout(function(){ while (sceneEl.children.length > 1) sceneEl.removeChild(sceneEl.firstChild); }, 3200);
  setFx(scene === 'snow' ? 'snow' : scene === 'rain' || scene === 'storm' ? 'rain' : null, scene === 'storm' ? 1 : intensity);
  document.body.dataset.scene = scene;
}

var dayFmt = new Intl.DateTimeFormat('it-IT',{weekday:'short'});
var timeFmt = new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'});
function round(n){ return Math.round(n); }

function render(data, at, stale){
  var cur = data.current, daily = data.daily;
  var d = describe(cur.weather_code);
  var day = cur.is_day !== 0;
  showScene(d[1], day, d[2]);
  document.getElementById('icon').innerHTML = icon(d[1], day);
  document.getElementById('temp').textContent = round(cur.temperature_2m) + '°';
  document.getElementById('cond').textContent = d[0];
  var meta = [];
  if (daily.temperature_2m_max) meta.push('Max ' + round(daily.temperature_2m_max[0]) + '°  Min ' + round(daily.temperature_2m_min[0]) + '°');
  if (cur.apparent_temperature != null) meta.push('Percepita ' + round(cur.apparent_temperature) + '°');
  meta.push('Umidità ' + round(cur.relative_humidity_2m) + '%');
  meta.push('Vento ' + round(cur.wind_speed_10m) + ' km/h');
  document.getElementById('meta').textContent = meta.join('   ');
  var html = '';
  for (var i = 1; i < daily.time.length && i <= 3; i++) {
    var dd = describe(daily.weather_code[i]);
    var name = dayFmt.format(new Date(daily.time[i] + 'T12:00'));
    var rain = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null;
    html += '<div class="wx-day"><div class="wx-dicon">' + icon(dd[1], true) + '</div><div>' +
      '<div class="wx-dname">' + name.charAt(0).toUpperCase() + name.slice(1).replace('.','') + '</div>' +
      '<div class="wx-drange">' + round(daily.temperature_2m_max[i]) + '° <span class="wx-min">' + round(daily.temperature_2m_min[i]) + '°</span></div>' +
      (rain != null && rain >= 20 ? '<div class="wx-rain">Pioggia ' + rain + '%</div>' : '') +
      '</div></div>';
  }
  document.getElementById('days').innerHTML = html;
  document.getElementById('upd').textContent = (stale ? 'Ultimo aggiornamento ' : 'Aggiornato alle ') + timeFmt.format(new Date(at));
}

function load(){
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + cfg.latitude + '&longitude=' + cfg.longitude +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=4&timezone=auto';
  fetch(url).then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); }).then(function(data){
    var at = Date.now();
    render(data, at, false);
    try { localStorage.setItem(KEY, JSON.stringify({data:data, at:at})); } catch (e) {}
  }).catch(function(){
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (saved) render(saved.data, saved.at, true);
    else { showScene('overcast', true, 0.6); document.getElementById('cond').textContent = 'Meteo non disponibile'; }
  });
}
// For previews and tests: show any weather code without waiting for it outside
window.signageWeatherPreview = function(code, isDay){
  render({ current: { weather_code: code, is_day: isDay ? 1 : 0, temperature_2m: 18, apparent_temperature: 17, relative_humidity_2m: 60, wind_speed_10m: 12 },
    daily: { time: ['2026-01-01','2026-01-02','2026-01-03','2026-01-04'], weather_code: [code, 0, 61, 3],
      temperature_2m_max: [21, 23, 17, 19], temperature_2m_min: [12, 13, 11, 10], precipitation_probability_max: [10, 0, 80, 30] } }, Date.now(), false);
};
load(); setInterval(load, 15 * 60 * 1000);
`;

export const weatherWidget = {
  type: 'weather',
  label: 'Weather',
  description: 'Current weather and the next three days for a place, on an animated sky that matches the weather.',
  defaults: { place: '', latitude: null, longitude: null },
  fields: [
    { key: 'place', label: 'Place', type: 'place', required: true, hint: 'Search a town, then pick it from the list.' },
  ],
  isReady: (c) => typeof c.latitude === 'number' && typeof c.longitude === 'number',
  defaultName: (c) => (c.place ? `Weather, ${c.place.split(',')[0]}` : 'Weather'),

  render(c) {
    return wrapWidget({ type: 'weather', ...c }, {
      css: `
        .w.wx-w{background:#3378C8;padding:0;color:#FFFFFF}
        #scene,.sc,#fx{position:absolute;inset:0}
        .sc{transition:opacity 3s ease;overflow:hidden}
        #fx{width:100%;height:100%;pointer-events:none}
        .sun{position:absolute;right:14vmin;top:12vmin;width:0;height:0}
        .sun i{position:absolute;left:0;top:0;border-radius:50%;transform:translate(-50%,-50%)}
        .sun-glare{width:120vmin;height:120vmin;
          background:radial-gradient(circle,rgba(255,255,248,.80) 0%,rgba(255,253,238,.50) 5%,rgba(255,250,232,.24) 13%,rgba(255,255,250,.09) 27%,rgba(255,255,255,.03) 40%,transparent 56%);
          mix-blend-mode:screen}
        .sun-disc{width:15vmin;height:15vmin;
          background:radial-gradient(circle,#FFFFFF 0 44%,rgba(255,255,252,.96) 50%,rgba(255,254,242,.70) 57%,rgba(255,252,232,.32) 66%,rgba(255,250,228,.10) 76%,transparent 86%);
          mix-blend-mode:screen}
        .sun-rays{width:70vmin;height:70vmin;will-change:transform;
          background:repeating-conic-gradient(from 0deg,rgba(255,250,232,.11) 0deg 1.2deg,transparent 1.2deg 9deg);
          -webkit-mask:radial-gradient(circle,transparent 8%,#000 12%,rgba(0,0,0,.35) 30%,transparent 50%);
          mask:radial-gradient(circle,transparent 8%,#000 12%,rgba(0,0,0,.35) 30%,transparent 50%);
          animation:spinc 240s linear infinite}
        .sun-rays2{width:58vmin;height:58vmin;opacity:.8;
          background:repeating-conic-gradient(from 4deg,rgba(255,250,232,.09) 0deg 0.8deg,transparent 0.8deg 13deg);
          animation:spinc 170s linear infinite reverse}
        @keyframes spinc{from{transform:translate(-50%,-50%) rotate(0)}to{transform:translate(-50%,-50%) rotate(360deg)}}
        .moon{position:absolute;right:12vmin;top:9vmin;width:13vmin;height:13vmin;border-radius:50%;
          background:radial-gradient(circle at 35% 35%,#FDFDF5,#D9DCE6 70%);
          box-shadow:0 0 6vmin 1vmin rgba(220,228,255,.18)}
        .stars i{position:absolute;border-radius:50%;background:#FFFFFF;animation:twinkle ease-in-out infinite alternate}
        .cl{position:absolute;left:0;z-index:1;animation:drift linear infinite;will-change:transform}
        .cl i{position:absolute;border-radius:50%}
        .fog{position:absolute;left:-50%;width:200%;height:34%;margin-top:-8%;
          background:linear-gradient(180deg,transparent,rgba(255,255,255,.22) 50%,transparent);
          animation:fogdrift ease-in-out infinite alternate}
        .flash{position:absolute;inset:0;background:#FFFFFF;opacity:0;animation:flash 11s linear infinite}
        @keyframes drift{from{transform:translateX(-80vmax)}to{transform:translateX(130vw)}}
        @keyframes fogdrift{from{transform:translateX(-12%)}to{transform:translateX(12%)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes twinkle{from{opacity:.2}to{opacity:1}}
        @keyframes flash{0%,61%,63.5%,66%,100%{opacity:0}62%{opacity:.55}64.5%{opacity:.35}}
        .ic-rays{transform-origin:24px 24px;animation:spin 40s linear infinite}

        /* A soft shade behind the text keeps white type readable on light skies and clouds */
        .shade{position:absolute;inset:0;z-index:1;pointer-events:none;
          background:linear-gradient(90deg,rgba(6,14,30,.30) 0%,rgba(6,14,30,.14) 45%,transparent 75%)}
        .wx{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:space-between;height:100%;padding:7vmin}
        .wx-place{font-size:4vmin;font-weight:500;opacity:.9}
        .wx-now{display:flex;align-items:center;gap:5vmin}
        .wx-icon{width:26vmin;height:26vmin;flex:none;animation:bob 6s ease-in-out infinite alternate}
        .wx-icon svg,.wx-dicon svg{width:100%;height:100%;overflow:visible}
        .wx-temp{font-size:28vmin;font-weight:600;line-height:.88}
        .wx-cond{font-size:5.4vmin;font-weight:500;margin-top:1.2vmin}
        .wx-meta{font-size:2.8vmin;margin-top:1.6vmin;white-space:pre-wrap;opacity:.88}
        .wx-strip{background:rgba(8,14,26,.30);border-radius:2vmin;padding:2.6vmin 3.4vmin}
        .wx-days{display:grid;grid-template-columns:repeat(3,1fr);gap:3vmin}
        .wx-day{display:flex;align-items:center;gap:2.2vmin}
        .wx-dicon{width:9vmin;height:9vmin;flex:none}
        .wx-dname{font-size:3vmin;opacity:.85}
        .wx-drange{font-size:4.4vmin;font-weight:600}
        .wx-min{opacity:.6}
        .wx-rain{font-size:2.3vmin;color:#BFE1FF}
        .wx-upd{font-size:2.1vmin;margin-top:1.6vmin;opacity:.7}
        @keyframes bob{from{transform:translateY(-1vmin)}to{transform:translateY(1vmin)}}
        @media (orientation:portrait){.wx-now{flex-direction:column;align-items:flex-start}.wx-days{grid-template-columns:1fr}}
      `,
      body: `
        <div class="w wx-w">
          <div id="scene"></div>
          <canvas id="fx"></canvas>
          <div class="shade"></div>
          <div class="wx">
            <div class="wx-place">${escapeHtml(c.place)}</div>
            <div class="wx-now">
              <div class="wx-icon" id="icon"></div>
              <div>
                <div class="wx-temp w-cond" id="temp">--°</div>
                <div class="wx-cond" id="cond"></div>
                <div class="wx-meta" id="meta"></div>
              </div>
            </div>
            <div class="wx-strip">
              <div class="wx-days" id="days"></div>
              <div class="wx-upd" id="upd"></div>
            </div>
          </div>
        </div>`,
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

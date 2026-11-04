import { wrapWidget, escapeHtml, asJson, DATE_SCRIPT } from './base';

// A brick fireplace in a dark room, for a warmer screen in the cold months. The room, bricks, mantel
// and logs are drawn once on a canvas (again on resize); the fire is a small heat field that rises and
// cools through a scrolling noise map (the classic demo effect), scaled up smoothly, with sparks on
// top. Its brightness drives the warm light thrown on the room. About 30 frames a second, cheap on
// the displays' integrated graphics. With the Christmas theme the mantel gets a garland and stockings.
const SCRIPT = `
var cfg = __CFG__;
var room = document.getElementById('fp-room'), fire = document.getElementById('fp-fire'), logs = document.getElementById('fp-logs');
var light = document.getElementById('fp-light'), head = document.getElementById('fp-head');
var G = {}; // geometry in CSS pixels

// Pseudo-random numbers that are the same on every draw, so bricks do not reshuffle on resize
function rng(seed){ return function(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

function layout(){
  var W = innerWidth, H = innerHeight, u = Math.min(W, H) / 100;
  var k = Math.min(1, (W * 0.92) / (112 * u)); // fit the mantel's width in portrait
  var s = u * k;
  var floor = H - 10 * u;
  G = { W: W, H: H, u: u, s: s, floor: floor, cx: W / 2,
    outerW: 100 * s, outerH: 55 * s, mantelW: 114 * s, mantelH: 4.2 * s,
    boxW: 60 * s, boxH: 35 * s, hearthW: 118 * s, hearthH: 3.4 * s };
  G.outerTop = floor - G.hearthH - G.outerH;
  G.mantelTop = G.outerTop - G.mantelH;
  G.boxL = G.cx - G.boxW / 2; G.boxB = floor - G.hearthH; G.boxT = G.boxB - G.boxH;
  // The text sits in the space above the mantel
  head.style.height = Math.max(0, G.mantelTop - 2 * u) + 'px';
}

function size(cv, w, h){
  var r = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(w * r); cv.height = Math.round(h * r);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  var g = cv.getContext('2d'); g.setTransform(r, 0, 0, r, 0, 0); return g;
}

function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// Firebox opening: straight sides, a shallow arch on top
function openingPath(g, inset){
  var l = G.boxL + inset, r = G.boxL + G.boxW - inset, b = G.boxB, t = G.boxT + inset, rise = G.boxW * 0.09;
  g.beginPath(); g.moveTo(l, b); g.lineTo(l, t + rise); g.quadraticCurveTo(G.cx, t - rise, r, t + rise); g.lineTo(r, b); g.closePath();
}

function drawRoom(){
  var g = size(room, G.W, G.H), s = G.s, rand = rng(7);
  // Wall: deep warm brown, a faint stripe paper, darker towards the corners
  var wall = g.createLinearGradient(0, 0, 0, G.floor);
  wall.addColorStop(0, '#120C09'); wall.addColorStop(1, '#1E140F');
  g.fillStyle = wall; g.fillRect(0, 0, G.W, G.floor);
  g.globalAlpha = 0.035; g.fillStyle = '#F2D9B8';
  for (var x = 0; x < G.W; x += 6 * G.u) g.fillRect(x, 0, 1.2 * G.u, G.floor);
  g.globalAlpha = 1;
  // Floor: planks, lit near the hearth
  var fl = g.createLinearGradient(0, G.floor, 0, G.H);
  fl.addColorStop(0, '#2A1A11'); fl.addColorStop(1, '#140C08');
  g.fillStyle = fl; g.fillRect(0, G.floor, G.W, G.H - G.floor);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(1, 0.15 * G.u);
  for (var py = G.floor + 2.4 * G.u, row = 0; py < G.H; py += 2.6 * G.u + row * 0.5 * G.u, row++) { g.beginPath(); g.moveTo(0, py); g.lineTo(G.W, py); g.stroke(); }

  // Brick surround
  var L = G.cx - G.outerW / 2, T = G.outerTop, BW = 8 * s, BH = 3.1 * s, M = 0.38 * s;
  g.save(); g.beginPath(); g.rect(L, T, G.outerW, G.outerH); g.clip();
  g.fillStyle = '#2B1C16'; g.fillRect(L, T, G.outerW, G.outerH);
  var tones = [[122,59,42],[138,68,48],[110,52,38],[147,80,58],[95,46,34],[128,62,40]];
  for (var y = T, r = 0; y < T + G.outerH; y += BH, r++) {
    for (var x0 = L - (r % 2 ? BW / 2 : 0); x0 < L + G.outerW; x0 += BW) {
      var c = tones[Math.floor(rand() * tones.length)], j = 0.85 + rand() * 0.25;
      g.fillStyle = 'rgb(' + Math.round(c[0] * j) + ',' + Math.round(c[1] * j) + ',' + Math.round(c[2] * j) + ')';
      g.fillRect(x0 + M / 2, y + M / 2, BW - M, BH - M);
      g.fillStyle = 'rgba(255,220,190,.06)'; g.fillRect(x0 + M / 2, y + M / 2, BW - M, (BH - M) * 0.28);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x0 + M / 2, y + BH - M / 2 - (BH - M) * 0.2, BW - M, (BH - M) * 0.2);
    }
  }
  // Only the fire lights the room: bricks fade to dark away from the opening
  var shade = g.createRadialGradient(G.cx, G.boxB - G.boxH * 0.3, G.boxW * 0.3, G.cx, G.boxB - G.boxH * 0.3, G.outerW * 0.85);
  shade.addColorStop(0, 'rgba(14,8,5,.25)'); shade.addColorStop(1, 'rgba(14,8,5,.78)');
  g.fillStyle = shade; g.fillRect(L, T, G.outerW, G.outerH);
  // Soot above the opening
  var soot = g.createRadialGradient(G.cx, G.boxT, 0, G.cx, G.boxT, G.boxW * 0.55);
  soot.addColorStop(0, 'rgba(10,6,4,.6)'); soot.addColorStop(1, 'rgba(10,6,4,0)');
  g.fillStyle = soot; g.fillRect(L, T, G.outerW, G.outerH);
  g.restore();

  // Opening: a stone lip, then the dark firebox with its back wall
  openingPath(g, -1.4 * s); g.fillStyle = '#3B2E28'; g.fill();
  openingPath(g, 0);
  var back = g.createLinearGradient(0, G.boxT, 0, G.boxB);
  back.addColorStop(0, '#050302'); back.addColorStop(0.55, '#140806'); back.addColorStop(1, '#2A0F08');
  g.fillStyle = back; g.fill();
  g.save(); openingPath(g, 0); g.clip();
  g.strokeStyle = 'rgba(255,120,60,.06)'; g.lineWidth = Math.max(1, 0.25 * s);
  for (var by = G.boxB - BH; by > G.boxT; by -= BH) { g.beginPath(); g.moveTo(G.boxL, by); g.lineTo(G.boxL + G.boxW, by); g.stroke(); }
  var inner = g.createLinearGradient(G.boxL, 0, G.boxL + G.boxW, 0);
  inner.addColorStop(0, 'rgba(0,0,0,.7)'); inner.addColorStop(0.18, 'rgba(0,0,0,0)'); inner.addColorStop(0.82, 'rgba(0,0,0,0)'); inner.addColorStop(1, 'rgba(0,0,0,.7)');
  g.fillStyle = inner; g.fillRect(G.boxL, G.boxT - G.boxW, G.boxW, G.boxH + G.boxW);
  g.restore();

  // Hearth slab and mantel shelf
  var hx = G.cx - G.hearthW / 2;
  var hs = g.createLinearGradient(0, G.boxB, 0, G.floor);
  hs.addColorStop(0, '#3E322D'); hs.addColorStop(1, '#241C19');
  g.fillStyle = hs; roundRect(g, hx, G.boxB, G.hearthW, G.hearthH, 0.4 * s); g.fill();
  var mx = G.cx - G.mantelW / 2;
  var ms = g.createLinearGradient(0, G.mantelTop, 0, G.mantelTop + G.mantelH);
  ms.addColorStop(0, '#6B4429'); ms.addColorStop(0.35, '#4E2F1B'); ms.addColorStop(1, '#2E1A0E');
  g.fillStyle = ms; roundRect(g, mx, G.mantelTop, G.mantelW, G.mantelH, 0.5 * s); g.fill();
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(G.cx - G.outerW / 2, G.mantelTop + G.mantelH, G.outerW, 0.8 * s);

  if (cfg.xmas) drawChristmas(g, mx);
}

// Garland of pine along the mantel's edge, berries and baubles, three stockings
function drawChristmas(g, mx){
  var s = G.s, rand = rng(42), y0 = G.mantelTop + G.mantelH * 0.85;
  var st = [0.22, 0.5, 0.78], colors = ['#B3261E', '#2E6B3F', '#B3261E'];
  for (var i = 0; i < 3; i++) {
    var sx = mx + G.mantelW * st[i], sy = y0 + 1.2 * s, len = (11 + (i % 2) * 2) * s, w = 5.2 * s;
    g.fillStyle = colors[i];
    g.beginPath(); g.moveTo(sx - w / 2, sy); g.lineTo(sx + w / 2, sy); g.lineTo(sx + w / 2, sy + len - w * 0.5);
    g.quadraticCurveTo(sx + w / 2, sy + len + w * 0.35, sx - w * 0.2, sy + len + w * 0.3);
    g.lineTo(sx - w * 1.15, sy + len + w * 0.25); g.quadraticCurveTo(sx - w * 1.6, sy + len - w * 0.15, sx - w * 1.05, sy + len - w * 0.55);
    g.lineTo(sx - w / 2, sy + len - w * 0.55); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(sx - w / 2, sy, w * 0.22, len - w * 0.55);
    g.fillStyle = '#EFE8DC'; roundRect(g, sx - w * 0.62, sy - 0.4 * s, w * 1.24, 2.6 * s, 0.6 * s); g.fill();
  }
  // Pine: many short needles along a gently swagging line
  var n = Math.round(G.mantelW / (0.32 * s));
  for (var k = 0; k < n; k++) {
    var t = k / n, x = mx + t * G.mantelW, sw = Math.sin(t * Math.PI * 6) * 0.8 * s + 1.2 * s;
    for (var q = 0; q < 3; q++) {
      var a = rand() * Math.PI * 2, l = (0.9 + rand() * 1.3) * s;
      g.strokeStyle = ['#1F4D2B', '#2C6B3C', '#173A21', '#3A7D49'][Math.floor(rand() * 4)];
      g.lineWidth = Math.max(1, 0.28 * s);
      g.beginPath(); g.moveTo(x, y0 + sw); g.lineTo(x + Math.cos(a) * l, y0 + sw + Math.sin(a) * l * 0.8); g.stroke();
    }
  }
  for (var b = 0; b < 26; b++) {
    var bx = mx + (0.02 + 0.96 * rand()) * G.mantelW, tb = (bx - mx) / G.mantelW, by = y0 + Math.sin(tb * Math.PI * 6) * 0.8 * s + 1.2 * s + (rand() - 0.5) * 1.6 * s;
    var big = b % 5 === 0, rr = (big ? 0.95 : 0.42) * s;
    var col = big ? '#D9A441' : '#C8241B';
    var gr = g.createRadialGradient(bx - rr * 0.35, by - rr * 0.35, 0, bx, by, rr);
    gr.addColorStop(0, '#FFF3D6'); gr.addColorStop(0.3, col); gr.addColorStop(1, '#3A0A06');
    g.fillStyle = gr; g.beginPath(); g.arc(bx, by, rr, 0, 6.283); g.fill();
  }
}

// Logs on the grate, in front of the flames' roots
function drawLogs(){
  var w = G.boxW, h = G.boxH, g = size(logs, w, h), s = G.s;
  function log(cx, cy, len, rad, ang){
    g.save(); g.translate(cx, cy); g.rotate(ang);
    var bark = g.createLinearGradient(0, -rad, 0, rad);
    bark.addColorStop(0, '#140A05'); bark.addColorStop(0.45, '#2C1A0F'); bark.addColorStop(1, '#0B0603');
    g.fillStyle = bark; roundRect(g, -len / 2, -rad, len, rad * 2, rad * 0.6); g.fill();
    // The fire lights the top of the bark
    var rim = g.createLinearGradient(0, -rad, 0, -rad * 0.3);
    rim.addColorStop(0, 'rgba(255,140,60,.38)'); rim.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = rim; roundRect(g, -len / 2, -rad, len, rad * 0.7, rad * 0.5); g.fill();
    // Charred cracks glowing from inside
    g.strokeStyle = 'rgba(255,110,30,.75)'; g.lineWidth = Math.max(1, 0.22 * s); g.shadowColor = '#FF6A1A'; g.shadowBlur = 1.2 * s;
    var r = rng(Math.round(len));
    for (var i = 0; i < 6; i++) { var x = -len / 2 + len * (0.12 + r() * 0.76); g.beginPath(); g.moveTo(x, -rad * 0.9); g.lineTo(x + (r() - 0.5) * 2 * s, -rad * 0.2); g.stroke(); }
    g.shadowBlur = 0;
    // Cut end with rings
    g.fillStyle = '#5E4329'; g.beginPath(); g.ellipse(len / 2, 0, rad * 0.45, rad * 0.95, 0, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(40,22,12,.6)'; g.lineWidth = Math.max(1, 0.15 * s);
    for (var q = 1; q <= 3; q++) { g.beginPath(); g.ellipse(len / 2, 0, rad * 0.45 * q / 4, rad * 0.95 * q / 4, 0, 0, 6.283); g.stroke(); }
    g.restore();
  }
  // Grate
  g.fillStyle = '#0B0807'; g.fillRect(w * 0.16, h - 1.2 * s, w * 0.68, 1.2 * s);
  g.fillRect(w * 0.2, h - 2.6 * s, 0.7 * s, 2.6 * s); g.fillRect(w * 0.79, h - 2.6 * s, 0.7 * s, 2.6 * s);
  log(w * 0.47, h - 6.2 * s, w * 0.58, 2.6 * s, -0.05);
  log(w * 0.53, h - 3.6 * s, w * 0.64, 2.9 * s, 0.04);
}

// Fire: heat field FW x FH, palette from transparent through deep red, orange and yellow
var FW = 96, FH = 72, heat = new Float32Array(FW * FH), next = new Float32Array(FW * FH);
var CW = FW, CH = FH * 3, cool = new Float32Array(CW * CH), coolOff = 0;
(function(){
  var r = rng(99), raw = new Float32Array(CW * CH), i, x, y;
  for (i = 0; i < raw.length; i++) raw[i] = r();
  for (var pass = 0; pass < 6; pass++) {
    for (y = 0; y < CH; y++) for (x = 0; x < CW; x++) {
      var a = raw[y * CW + ((x + 1) % CW)], b = raw[y * CW + ((x - 1 + CW) % CW)], c = raw[((y + 1) % CH) * CW + x], d = raw[((y - 1 + CH) % CH) * CW + x];
      cool[y * CW + x] = (a + b + c + d) / 4;
    }
    raw.set(cool);
  }
  var lo = 1, hi = 0; for (i = 0; i < cool.length; i++) { lo = Math.min(lo, cool[i]); hi = Math.max(hi, cool[i]); }
  for (i = 0; i < cool.length; i++) cool[i] = Math.pow((cool[i] - lo) / (hi - lo), 3) * 16;
})();
var pal = new Uint8ClampedArray(256 * 4);
(function(){
  var stops = [[0,0,0,0,0],[35,80,6,0,0],[70,170,25,4,150],[110,235,80,10,230],[150,255,150,35,255],[190,255,210,90,255],[230,255,245,200,255],[255,255,250,225,255]];
  for (var v = 0; v < 256; v++) {
    for (var i = 1; i < stops.length && stops[i][0] < v; i++);
    var a = stops[Math.max(0, i - 1)], b = stops[Math.min(stops.length - 1, i)], t = b[0] === a[0] ? 0 : (v - a[0]) / (b[0] - a[0]);
    for (var c = 0; c < 4; c++) pal[v * 4 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * t;
  }
})();
var small = document.createElement('canvas'); small.width = FW; small.height = FH;
var sg = small.getContext('2d'), img = sg.createImageData(FW, FH);
var fg = null, sparks = [], glow = 0.5, t0 = 0, rnd = Math.random;

function step(){
  var x, y;
  // Fuel under the logs: strongest in the middle, flickering
  for (x = 0; x < FW; x++) {
    var d = (x - FW / 2) / (FW * 0.34), base = Math.max(0, 1 - d * d);
    var v = base > 0 ? 255 * Math.pow(base, 0.6) * (0.72 + rnd() * 0.28) : 0;
    heat[(FH - 1) * FW + x] = v; heat[(FH - 2) * FW + x] = v * (0.9 + rnd() * 0.1);
  }
  coolOff = (coolOff + 1) % CH;
  var drift = Math.sin(t0 / 2300) * 0.6;
  for (y = 0; y < FH - 2; y++) {
    var cy = ((y + coolOff) % CH) * CW;
    for (x = 0; x < FW; x++) {
      var sx = Math.min(FW - 1, Math.max(0, x + Math.round(drift * rnd())));
      var l = sx > 0 ? sx - 1 : sx, r = sx < FW - 1 ? sx + 1 : sx;
      var v2 = (heat[(y + 1) * FW + l] + heat[(y + 1) * FW + sx] + heat[(y + 1) * FW + r] + heat[(y + 2) * FW + sx]) * 0.25;
      next[y * FW + x] = Math.max(0, v2 - cool[cy + x] - 1.5);
    }
  }
  for (x = 0; x < FW * 2; x++) next[(FH - 2) * FW + x] = heat[(FH - 2) * FW + x];
  var tmp = heat; heat = next; next = tmp;
}

function frame(t){
  requestAnimationFrame(frame);
  if (t - t0 < 33) return;
  t0 = t;
  step(); step();
  var d = img.data, sum = 0;
  for (var i = 0; i < FW * FH; i++) {
    var v = heat[i] | 0, p = v * 4;
    d[i * 4] = pal[p]; d[i * 4 + 1] = pal[p + 1]; d[i * 4 + 2] = pal[p + 2]; d[i * 4 + 3] = pal[p + 3];
    if (i > FW * FH * 0.4) sum += v;
  }
  sg.putImageData(img, 0, 0);
  var w = G.boxW, h = G.boxH * 1.02;
  fg.clearRect(0, 0, w, h);
  fg.globalCompositeOperation = 'source-over';
  fg.drawImage(small, -w * 0.06, h * 0.02, w * 1.12, h);
  // Sparks
  if (rnd() < 0.18) sparks.push({ x: w * (0.35 + rnd() * 0.3), y: h * 0.62, vx: (rnd() - 0.5) * 0.35 * G.s, vy: -(0.45 + rnd() * 0.6) * G.s, life: 1 });
  fg.globalCompositeOperation = 'lighter';
  for (var k = sparks.length - 1; k >= 0; k--) {
    var s = sparks[k];
    s.x += s.vx + Math.sin(t / 180 + k) * 0.08 * G.s; s.y += s.vy; s.life -= 0.022;
    if (s.life <= 0 || s.y < 0) { sparks.splice(k, 1); continue; }
    fg.fillStyle = 'rgba(255,' + Math.round(150 + 80 * s.life) + ',70,' + s.life.toFixed(2) + ')';
    fg.beginPath(); fg.arc(s.x, s.y, 0.22 * G.s, 0, 6.283); fg.fill();
  }
  // Light thrown on the room follows how strong the fire is right now
  var level = sum / (FW * FH * 0.6 * 120);
  glow += (Math.min(1, level) - glow) * 0.25;
  light.style.opacity = (0.55 + glow * 0.45).toFixed(3);
}

function place(){
  layout();
  drawRoom();
  fire.style.left = G.boxL + 'px'; fire.style.top = (G.boxT - G.boxH * 0.02) + 'px';
  fg = size(fire, G.boxW, G.boxH * 1.02);
  fire.style.clipPath = 'none';
  logs.style.left = G.boxL + 'px'; logs.style.top = G.boxT + 'px';
  drawLogs();
  light.style.background = 'radial-gradient(' + (G.boxW * 1.6) + 'px ' + (G.boxH * 2.2) + 'px at ' + G.cx + 'px ' + (G.boxB - G.boxH * 0.25) + 'px, rgba(255,140,50,.30), rgba(255,110,40,.10) 45%, rgba(255,100,30,0) 75%)';
}
place();
addEventListener('resize', place);
for (var warm = 0; warm < 160; warm++) step(); // start with the fire already burning
requestAnimationFrame(frame);

// Words and clock above the mantel
var clock = document.getElementById('fp-time');
if (clock) {
  var hm = new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'});
  var tick = function(){ var now = new Date(); clock.textContent = hm.format(now); document.getElementById('fp-date').textContent = itDate(now, 'Europe/Rome'); };
  tick(); setInterval(tick, 1000);
}
`;

export const fireplaceWidget = {
  type: 'fireplace',
  label: 'Fireplace',
  description: 'A crackling fireplace with an optional message and clock, for a warmer screen.',
  defaults: { greeting: 'Buone feste', showClock: true, theme: 'christmas' },
  fields: [
    { key: 'greeting', label: 'Message', type: 'text', placeholder: 'Buone feste', hint: 'Optional, shown above the fireplace.' },
    { key: 'showClock', label: 'Show the time and date', type: 'toggle' },
  ],
  defaultName: (c) => (c.greeting ? `Fireplace, ${c.greeting}` : 'Fireplace'),

  render(c) {
    const xmas = c.theme === 'christmas';
    return wrapWidget({ type: 'fireplace', ...c }, {
      // Snow does not fall indoors: the theme keeps only the lights and the warm glow
      themeOptions: { snow: false },
      css: `
        .w.fp{padding:0;background:#120C09}
        .fp canvas{position:absolute;left:0;top:0;display:block}
        #fp-fire{filter:blur(.22vmin) saturate(1.15)}
        .fp-light{position:absolute;inset:0;mix-blend-mode:screen;pointer-events:none}
        .fp-vig{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 70%,rgba(0,0,0,0) 45%,rgba(0,0,0,.55) 100%);pointer-events:none}
        .fp-head{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8vmin 6vmin 0}
        .fp-msg{font-size:7vmin;font-weight:600;line-height:1;color:#F6E7D2}
        .fp-time{font-size:5vmin;font-weight:600;color:#E9D3B6;margin-top:2vmin}
        .fp-date{font-size:2.8vmin;color:#A88D72;margin-top:.8vmin}
      `,
      body: `
        <div class="w fp">
          <canvas id="fp-room"></canvas>
          <canvas id="fp-fire"></canvas>
          <canvas id="fp-logs"></canvas>
          <div class="fp-light" id="fp-light"></div>
          <div class="fp-vig"></div>
          <div class="fp-head" id="fp-head">
            ${c.greeting ? `<div class="fp-msg w-cond">${escapeHtml(c.greeting)}</div>` : ''}
            ${c.showClock ? '<div class="fp-time w-cond" id="fp-time"></div><div class="fp-date" id="fp-date"></div>' : ''}
          </div>
        </div>`,
      script: DATE_SCRIPT + SCRIPT.replace('__CFG__', asJson({ xmas })),
    });
  },
};

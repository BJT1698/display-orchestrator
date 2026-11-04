import { wrapWidget, escapeHtml, asJson, DATE_SCRIPT } from './base';

// A brick fireplace in a dark room, for a warmer screen in the cold months. The room, bricks, mantel
// and logs are drawn once on a canvas (again on resize); the fire is a small heat field that rises and
// cools through a scrolling noise map (the classic demo effect), scaled up smoothly, with sparks on
// top. Its brightness drives the warm light thrown on the room. About 30 frames a second, cheap on
// the displays' integrated graphics. With the Christmas theme the mantel gets a garland, and a tree and a nativity join the room.
const SCRIPT = `
var cfg = __CFG__;
var room = document.getElementById('fp-room'), fire = document.getElementById('fp-fire'), logs = document.getElementById('fp-logs');
var light = document.getElementById('fp-light'), head = document.getElementById('fp-head');
var G = {}; // geometry in CSS pixels

// Pseudo-random numbers that are the same on every draw, so bricks do not reshuffle on resize
function rng(seed){ return function(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

function layout(){
  var W = innerWidth, H = innerHeight, u = Math.min(W, H) / 100;
  // With the Christmas scene the tree and the nativity need room: beside the fireplace when the
  // screen is wide enough, otherwise the fireplace shrinks to the left and the nativity goes on the mantel
  var wide = (W - 114 * u) / 2 >= 24 * u;
  var side = cfg.xmas && !wide;
  // Side layout: fireplace, nativity with its comet on the mantel (~104 units tall together) and the text above must fit
  var k = side ? Math.min(1, (W * 0.6) / (114 * u), (H - 42 * u) / (104 * u)) : Math.min(1, (W * 0.92) / (112 * u));
  var s = u * k;
  var floor = H - 10 * u;
  G = { W: W, H: H, u: u, s: s, floor: floor, cx: side ? W * 0.37 : W / 2, side: side,
    outerW: 100 * s, outerH: 55 * s, mantelW: 114 * s, mantelH: 4.2 * s,
    boxW: 60 * s, boxH: 35 * s, hearthW: 118 * s, hearthH: 3.4 * s };
  G.outerTop = floor - G.hearthH - G.outerH;
  G.mantelTop = G.outerTop - G.mantelH;
  G.boxL = G.cx - G.boxW / 2; G.boxB = floor - G.hearthH; G.boxT = G.boxB - G.boxH;
  // The text sits in the space above the mantel (and above the nativity when it stands there)
  head.style.height = Math.max(0, G.mantelTop - (side ? 40 * s : 2 * u)) + 'px';
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

// Garland of pine along the mantel's edge with berries and baubles, the tree and the nativity
function drawChristmas(g, mx){
  var s = G.s, rand = rng(42), y0 = G.mantelTop + G.mantelH * 0.85;
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
  var right = G.cx + G.mantelW / 2, left = G.cx - G.mantelW / 2;
  if (G.side) {
    var tw = Math.min(G.W - right - 2 * G.u, 34 * G.u);
    drawTree(g, (right + G.W) / 2, G.floor + 1.5 * G.u, Math.min(tw * 0.92 / 0.62, G.floor - 12 * G.u)); // the tree is 0.62 times as wide as tall
    drawNativity(g, G.cx, G.mantelTop, 46 * s);
  } else {
    var room = (G.W - G.mantelW) / 2;
    drawNativity(g, left / 2, G.floor + 1.2 * G.u, Math.min(room * 0.8, 40 * G.u));
    drawTree(g, (right + G.W) / 2, G.floor + 1.5 * G.u, Math.min(room * 0.82 / 0.62, G.floor - 14 * G.u));
  }
}

function star(g, x, y, r, inner){
  g.beginPath();
  for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}

// Christmas tree standing on the floor: tiers of pine, tinsel, baubles, a star; its lights are
// little elements that twinkle (see treeLights)
function drawTree(g, cx, base, h){
  var rand = rng(7 + Math.round(h)), w = h * 0.62, potH = h * 0.08, trunkH = h * 0.05;
  TREE = { cx: cx, base: base, h: h, w: w, top: base - h };
  // Pot and trunk
  g.fillStyle = '#3A2112'; g.fillRect(cx - h * 0.03, base - potH - trunkH, h * 0.06, trunkH + 2);
  var pot = g.createLinearGradient(cx - h * 0.1, 0, cx + h * 0.1, 0);
  pot.addColorStop(0, '#5E1410'); pot.addColorStop(0.5, '#9C2A1F'); pot.addColorStop(1, '#4A0F0C');
  g.fillStyle = pot; g.beginPath(); g.moveTo(cx - h * 0.1, base - potH); g.lineTo(cx + h * 0.1, base - potH); g.lineTo(cx + h * 0.08, base); g.lineTo(cx - h * 0.08, base); g.closePath(); g.fill();
  g.fillStyle = '#C9962E'; g.fillRect(cx - h * 0.1, base - potH, h * 0.2, h * 0.012);
  // Tiers from the bottom up, each a little narrower, with a scalloped hem
  var tiers = 5, bottom = base - potH - trunkH * 0.6, top = base - h * 0.93;
  for (var t = 0; t < tiers; t++) {
    var f = t / tiers, tb = bottom - (bottom - top) * f * 0.86, tt = tb - (bottom - top) * 0.36, tw = w * (1 - f * 0.78) / 2;
    var gr = g.createLinearGradient(cx - tw, 0, cx + tw, 0);
    gr.addColorStop(0, '#0E2A17'); gr.addColorStop(0.45, '#1E5230'); gr.addColorStop(0.6, '#22603A'); gr.addColorStop(1, '#0B2213');
    g.fillStyle = gr; g.beginPath(); g.moveTo(cx, tt);
    g.lineTo(cx + tw, tb);
    for (var q = 6; q >= 0; q--) { var x = cx - tw + (2 * tw) * q / 6; g.quadraticCurveTo(x + tw / 6, tb + h * 0.018, x, tb); }
    g.closePath(); g.fill();
    // Needles along the tier's edges
    g.lineWidth = Math.max(1, h * 0.003);
    for (var n = 0; n < 70; n++) {
      var v = rand(), ex = cx + (rand() < 0.5 ? -1 : 1) * tw * v, ey = tt + (tb - tt) * v + rand() * h * 0.02;
      g.strokeStyle = ['#2E7343', '#173F24', '#3B8A52'][Math.floor(rand() * 3)];
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + (rand() - 0.5) * h * 0.03, ey + h * 0.012 + rand() * h * 0.012); g.stroke();
    }
  }
  // Tinsel swags
  g.strokeStyle = 'rgba(232,190,90,.85)'; g.lineWidth = Math.max(1, h * 0.006); g.setLineDash([h * 0.006, h * 0.008]);
  for (var sw = 0; sw < 4; sw++) {
    var yy = top + (bottom - top) * (0.3 + sw * 0.19), half = w * (0.12 + sw * 0.075);
    g.beginPath(); g.moveTo(cx - half, yy - h * 0.03); g.quadraticCurveTo(cx, yy + h * 0.05, cx + half, yy - h * 0.01); g.stroke();
  }
  g.setLineDash([]);
  // Baubles inside the silhouette
  var cols = ['#C8241B', '#D9A441', '#C8241B', '#8FB3D9', '#D9A441'];
  for (var b = 0; b < 16; b++) {
    var fy = 0.2 + rand() * 0.75, by = top + (bottom - top) * fy, half2 = w * 0.5 * fy * 0.92, bx = cx + (rand() * 2 - 1) * half2 * 0.85, br = h * (0.014 + rand() * 0.008);
    var bg = g.createRadialGradient(bx - br * 0.4, by - br * 0.4, 0, bx, by, br);
    bg.addColorStop(0, '#FFF6E0'); bg.addColorStop(0.35, cols[b % cols.length]); bg.addColorStop(1, '#2A0A06');
    g.fillStyle = bg; g.beginPath(); g.arc(bx, by, br, 0, 6.283); g.fill();
  }
  // Star on top
  g.save(); g.shadowColor = '#FFD27A'; g.shadowBlur = h * 0.05;
  g.fillStyle = '#F2C14E'; star(g, cx, top - h * 0.02, h * 0.05, 0.45); g.fill(); g.restore();
}

// Nativity: a straw-roofed stable with Mary, Joseph, the child in the manger, ox and donkey,
// a warm light inside and the comet above. base is where it stands, w its width.
function drawNativity(g, cx, base, w){
  var h = w * 0.72, l = cx - w / 2, top = base - h;
  // Ground
  g.fillStyle = '#3A2A1A'; roundRect(g, l - w * 0.04, base - w * 0.035, w * 1.08, w * 0.05, w * 0.02); g.fill();
  g.fillStyle = '#4C6B36'; for (var m = 0; m < 9; m++) { g.beginPath(); g.ellipse(l + w * (0.04 + m * 0.115), base - w * 0.035, w * 0.04, w * 0.012, 0, Math.PI, 0); g.fill(); }
  // Back wall of planks, lit from the manger
  var wallTop = top + h * 0.28, wallL = l + w * 0.1, wallW = w * 0.8;
  g.fillStyle = '#2B1A0E'; g.fillRect(wallL, wallTop, wallW, base - w * 0.035 - wallTop);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(1, w * 0.004);
  for (var p = 1; p < 7; p++) { var px = wallL + wallW * p / 7; g.beginPath(); g.moveTo(px, wallTop); g.lineTo(px, base - w * 0.035); g.stroke(); }
  var glow = g.createRadialGradient(cx, base - h * 0.2, 0, cx, base - h * 0.2, w * 0.45);
  glow.addColorStop(0, 'rgba(255,200,110,.55)'); glow.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = glow; g.fillRect(wallL, wallTop, wallW, base - wallTop);
  // Posts and straw roof
  g.fillStyle = '#4A2E18';
  g.fillRect(wallL - w * 0.02, wallTop - h * 0.02, w * 0.035, base - wallTop); g.fillRect(wallL + wallW - w * 0.015, wallTop - h * 0.02, w * 0.035, base - wallTop);
  g.fillStyle = '#8C6A2F'; g.beginPath(); g.moveTo(l - w * 0.02, wallTop + h * 0.04); g.lineTo(cx, top + h * 0.02); g.lineTo(l + w * 1.02, wallTop + h * 0.04); g.lineTo(l + w * 0.98, wallTop + h * 0.1); g.lineTo(cx, top + h * 0.1); g.lineTo(l + w * 0.02, wallTop + h * 0.1); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(230,190,110,.5)'; g.lineWidth = Math.max(1, w * 0.003);
  var r2 = rng(5);
  for (var k2 = 0; k2 < 40; k2++) { var t2 = r2(), side = r2() < 0.5 ? -1 : 1, x0 = cx + side * t2 * w * 0.5, y0 = top + h * 0.04 + t2 * (wallTop - top); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + side * w * 0.03, y0 + h * 0.06); g.stroke(); }
  // Ox and donkey behind
  g.fillStyle = '#5B5048'; g.beginPath(); g.ellipse(cx - w * 0.2, base - h * 0.42, w * 0.07, w * 0.05, -0.3, 0, 6.283); g.fill();
  g.fillStyle = '#2E2723'; g.fillRect(cx - w * 0.27, base - h * 0.5, w * 0.03, w * 0.012); g.fillRect(cx - w * 0.15, base - h * 0.5, w * 0.03, w * 0.012);
  g.fillStyle = '#6E655C'; g.beginPath(); g.ellipse(cx + w * 0.2, base - h * 0.42, w * 0.05, w * 0.06, 0.25, 0, 6.283); g.fill();
  g.beginPath(); g.ellipse(cx + w * 0.17, base - h * 0.54, w * 0.012, w * 0.04, -0.2, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(cx + w * 0.22, base - h * 0.54, w * 0.012, w * 0.04, 0.2, 0, 6.283); g.fill();
  var fb = base - w * 0.035;
  // Mary, kneeling, blue mantle
  g.fillStyle = '#2C4F8C'; g.beginPath(); g.moveTo(cx - w * 0.26, fb); g.quadraticCurveTo(cx - w * 0.27, fb - h * 0.3, cx - w * 0.19, fb - h * 0.36); g.quadraticCurveTo(cx - w * 0.12, fb - h * 0.3, cx - w * 0.1, fb); g.closePath(); g.fill();
  g.fillStyle = '#F2EDE2'; g.beginPath(); g.arc(cx - w * 0.19, fb - h * 0.385, w * 0.036, Math.PI, 0); g.lineTo(cx - w * 0.15, fb - h * 0.31); g.lineTo(cx - w * 0.23, fb - h * 0.31); g.closePath(); g.fill();
  g.fillStyle = '#E9D2B4'; g.beginPath(); g.ellipse(cx - w * 0.183, fb - h * 0.375, w * 0.021, w * 0.026, 0, 0, 6.283); g.fill();
  // Joseph, standing, brown robe and staff
  g.fillStyle = '#6B4523'; g.beginPath(); g.moveTo(cx + w * 0.1, fb); g.lineTo(cx + w * 0.13, fb - h * 0.46); g.quadraticCurveTo(cx + w * 0.17, fb - h * 0.5, cx + w * 0.21, fb - h * 0.46); g.lineTo(cx + w * 0.25, fb); g.closePath(); g.fill();
  g.fillStyle = '#C08A3E'; g.fillRect(cx + w * 0.12, fb - h * 0.33, w * 0.1, w * 0.012);
  g.fillStyle = '#E2C29C'; g.beginPath(); g.arc(cx + w * 0.17, fb - h * 0.52, w * 0.028, 0, 6.283); g.fill();
  g.fillStyle = '#4A3424'; g.beginPath(); g.arc(cx + w * 0.17, fb - h * 0.505, w * 0.02, 0, Math.PI); g.fill();
  g.strokeStyle = '#8A6A40'; g.lineWidth = Math.max(1, w * 0.008); g.beginPath(); g.moveTo(cx + w * 0.27, fb); g.lineTo(cx + w * 0.255, fb - h * 0.6); g.stroke();
  // Manger with straw and the child, with a halo
  g.fillStyle = '#5A3A1E'; g.beginPath(); g.moveTo(cx - w * 0.08, fb - h * 0.16); g.lineTo(cx + w * 0.08, fb - h * 0.16); g.lineTo(cx + w * 0.055, fb - h * 0.06); g.lineTo(cx - w * 0.055, fb - h * 0.06); g.closePath(); g.fill();
  g.fillRect(cx - w * 0.06, fb - h * 0.06, w * 0.012, h * 0.06); g.fillRect(cx + w * 0.048, fb - h * 0.06, w * 0.012, h * 0.06);
  g.fillStyle = '#D9B25A'; g.fillRect(cx - w * 0.085, fb - h * 0.18, w * 0.17, h * 0.025);
  g.save(); g.shadowColor = '#FFE3A0'; g.shadowBlur = w * 0.06;
  g.fillStyle = 'rgba(255,215,120,.9)'; g.beginPath(); g.arc(cx - w * 0.03, fb - h * 0.215, w * 0.03, 0, 6.283); g.fill(); g.restore();
  g.fillStyle = '#F4EEE2'; g.beginPath(); g.ellipse(cx + w * 0.01, fb - h * 0.2, w * 0.055, w * 0.022, 0, 0, 6.283); g.fill();
  g.fillStyle = '#EED6B8'; g.beginPath(); g.arc(cx - w * 0.032, fb - h * 0.215, w * 0.018, 0, 6.283); g.fill();
  // Comet above the roof
  g.save(); g.shadowColor = '#FFE2A0'; g.shadowBlur = w * 0.05;
  var sx = cx + w * 0.14, sy = top - h * 0.12;
  var tail = g.createLinearGradient(sx, sy, sx - w * 0.3, sy - h * 0.12);
  tail.addColorStop(0, 'rgba(255,225,150,.8)'); tail.addColorStop(1, 'rgba(255,225,150,0)');
  g.fillStyle = tail; g.beginPath(); g.moveTo(sx, sy - w * 0.008); g.lineTo(sx - w * 0.3, sy - h * 0.12); g.lineTo(sx, sy + w * 0.012); g.closePath(); g.fill();
  g.fillStyle = '#FFE08A'; star(g, sx, sy, w * 0.035, 0.42); g.fill(); g.restore();
}

// Lights on the tree: spots that twinkle with CSS, placed again on every resize
var TREE = null;
function treeLights(){
  var box = document.getElementById('fp-tree');
  box.innerHTML = '';
  if (!cfg.xmas || !TREE) return;
  var r = rng(11), html = '', cols = ['#FFE9B8', '#FFC247', '#FF5A4E', '#FFE9B8', '#6FB6FF'];
  for (var i = 0; i < 34; i++) {
    var fy = 0.12 + r() * 0.78, y = TREE.top + TREE.h * 0.07 + (TREE.h * 0.78) * fy, half = TREE.w * 0.5 * fy * 0.95, x = TREE.cx + (r() * 2 - 1) * half * 0.9;
    html += '<i style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;--c:' + cols[i % cols.length] + ';animation-duration:' + (2 + r() * 2.5).toFixed(1) + 's;animation-delay:-' + (r() * 3).toFixed(1) + 's"></i>';
  }
  box.innerHTML = html;
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
  treeLights();
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
        .fp-tree i{position:absolute;width:.75vmin;height:.75vmin;margin:-.375vmin 0 0 -.375vmin;border-radius:50%;background:var(--c);
          box-shadow:0 0 .8vmin .15vmin var(--c),0 0 2.2vmin .2vmin var(--c);animation:fp-tw 3s ease-in-out infinite}
        @keyframes fp-tw{0%,100%{opacity:1}50%{opacity:.3}}
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
          <div class="fp-tree" id="fp-tree"></div>
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

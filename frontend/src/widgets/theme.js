// Seasonal decorations any widget can wear on top of its own content. They live in the widget's
// padding (lights along the top edge) or are faint enough to read through (snow, warm glow), and
// never catch clicks. Everything is drawn at authoring time except the snow, one small canvas.

export const THEME_OPTIONS = [['', 'None'], ['christmas', 'Christmas']];

const BULBS = ['#FF5A4E', '#FFC247', '#4FD47A', '#FFE9B8', '#6FB6FF'];

// A string of lights in swags across the top: the wire is one stretched SVG path, the bulbs sit on
// it at the same height in vmin, so they keep their shape at any screen ratio
function garland() {
  const swags = 6;
  const top = 0.6; // vmin
  const sag = 3.4; // vmin
  const y = (t) => top + sag * (1 - (2 * t - 1) ** 2);
  let wire = '';
  let bulbs = '';
  let n = 0;
  for (let s = 0; s < swags; s++) {
    const x0 = (s / swags) * 100;
    const x1 = ((s + 1) / swags) * 100;
    wire += `M${x0 * 10},${top * 10} Q${((x0 + x1) / 2) * 10},${(top + sag * 2) * 10} ${x1 * 10},${top * 10} `;
    for (let b = 1; b <= 5; b++) {
      const t = b / 6;
      const color = BULBS[n % BULBS.length];
      // Twinkle rhythm spread over the string, the same on every render
      const dur = (2.6 + ((n * 37) % 17) / 10).toFixed(1);
      const delay = (-((n * 53) % 29) / 10).toFixed(1);
      bulbs += `<i class="xm-b" style="left:${(x0 + (x1 - x0) * t).toFixed(2)}%;top:${y(t).toFixed(2)}vmin;--c:${color};animation-duration:${dur}s;animation-delay:${delay}s"></i>`;
      n++;
    }
  }
  return `<svg class="xm-wire" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d="${wire}" /></svg>${bulbs}`;
}

const SNOW_SCRIPT = `
(function(){
  var c = document.getElementById('xm-snow'); if (!c || !c.getContext) return;
  var g = c.getContext('2d'), flakes = [], w = 0, h = 0, last = 0;
  function size(){
    var r = Math.min(window.devicePixelRatio || 1, 1.5);
    w = c.width = Math.round(innerWidth * r); h = c.height = Math.round(innerHeight * r);
    var want = Math.round(w * h / 26000);
    while (flakes.length < want) flakes.push(make(true));
    flakes.length = want;
  }
  function make(anywhere){
    var u = Math.min(w, h) / 100;
    var z = Math.random();
    return { x: Math.random() * w, y: anywhere ? Math.random() * h : -u, r: u * (0.12 + z * 0.32),
      v: u * (0.05 + z * 0.12), a: 0.25 + z * 0.5, p: Math.random() * 6.28, s: 0.4 + Math.random() * 0.8 };
  }
  function frame(t){
    requestAnimationFrame(frame);
    if (t - last < 33) return; // about 30 frames a second is plenty for snow
    var dt = Math.min(3, (t - last) / 33); last = t;
    g.clearRect(0, 0, w, h);
    for (var i = 0; i < flakes.length; i++){
      var f = flakes[i];
      f.p += 0.012 * f.s * dt; f.y += f.v * dt; f.x += Math.sin(f.p) * f.r * 0.25 * dt;
      if (f.y > h + f.r) { flakes[i] = make(false); continue; }
      g.globalAlpha = f.a; g.beginPath(); g.arc(f.x, f.y, f.r, 0, 6.283); g.fillStyle = '#fff'; g.fill();
    }
  }
  size(); addEventListener('resize', size); requestAnimationFrame(frame);
})();
`;

/** CSS, markup and script to add to a widget for its theme, or null for none */
export function themeParts(theme, { snow = true } = {}) {
  if (theme !== 'christmas') return null;
  return {
    css: `
      .xm{position:fixed;inset:0;pointer-events:none;z-index:50;overflow:hidden}
      .xm-warm{position:absolute;inset:0;background:radial-gradient(120% 55% at 50% 112%,rgba(255,150,70,.13),rgba(255,150,70,0) 70%)}
      .xm-snow{position:absolute;inset:0;width:100%;height:100%;opacity:.8}
      .xm-wire{position:absolute;left:0;top:0;width:100%;height:6vmin;overflow:visible}
      .xm-wire path{fill:none;stroke:#2B3A2F;stroke-width:.35vmin;vector-effect:non-scaling-stroke;stroke-width:2px}
      .xm-b{position:absolute;width:1.15vmin;height:1.9vmin;margin-left:-.575vmin;border-radius:45% 45% 50% 50%/40% 40% 60% 60%;
        background:radial-gradient(circle at 40% 35%,#fff 0,var(--c) 45%,var(--c) 100%);
        box-shadow:0 0 1.2vmin .2vmin var(--c),0 0 3.4vmin .4vmin var(--c);
        animation:xm-tw 3s ease-in-out infinite}
      .xm-b::before{content:'';position:absolute;left:22%;top:-.55vmin;width:56%;height:.7vmin;background:#3A443C;border-radius:.15vmin}
      @keyframes xm-tw{0%,100%{opacity:1;filter:brightness(1)}45%{opacity:.55;filter:brightness(.7)}55%{opacity:.6;filter:brightness(.75)}}
    `,
    body: `<div class="xm" aria-hidden="true"><div class="xm-warm"></div>${snow ? '<canvas class="xm-snow" id="xm-snow"></canvas>' : ''}${garland()}</div>`,
    script: snow ? SNOW_SCRIPT : '',
  };
}

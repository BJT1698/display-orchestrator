import { wrapWidget, escapeHtml, asJson, DATE_SCRIPT } from './base';

// Same layout as the clock widget, made for screens left on overnight: pure black, softer text,
// a quiet line that fills over the minute instead of ticking seconds, and a slow drift of the
// whole block so no pixel stays lit in the same place all night.
const TONES = {
  dim: { time: '#8A9099', muted: '#5A616B', line: '#14161A' },
  normal: { time: '#E6E8EB', muted: '#9AA1AB', line: '#1E2126' },
};

export const nightClockWidget = {
  type: 'night-clock',
  label: 'Night clock',
  description: 'A dim clock on black for after hours, drifting slowly to spare the panel.',
  defaults: { title: '', showDate: true, tone: 'dim', timeZone: 'Europe/Rome' },
  fields: [
    { key: 'title', label: 'Caption', type: 'text', placeholder: 'Multi Vendor Service', hint: 'Optional, shown above the time.' },
    { key: 'showDate', label: 'Show the date', type: 'toggle' },
    { key: 'tone', label: 'Brightness', type: 'select', options: [['dim', 'Dim, for dark rooms'], ['normal', 'Normal']] },
    {
      key: 'timeZone', label: 'Time zone', type: 'select',
      options: [
        ['Europe/Rome', 'Italy'], ['Europe/London', 'London'], ['America/New_York', 'New York'],
        ['Asia/Shanghai', 'Shanghai'], ['Asia/Tokyo', 'Tokyo'], ['UTC', 'UTC'],
      ],
    },
  ],
  defaultName: (c) => (c.title ? `Night clock, ${c.title}` : 'Night clock'),

  render(c) {
    const tone = TONES[c.tone] || TONES.dim;
    return wrapWidget({ type: 'night-clock', ...c }, {
      css: `
        .w.nc{background:#000;color:${tone.time}}
        .nc-area{position:absolute;inset:7vmin;display:flex;align-items:center}
        .nc-block{transition:transform 50s linear;will-change:transform}
        .nc-cap{font-size:3.4vmin;margin-bottom:2vmin;color:${tone.muted}}
        .nc-time{font-size:30vmin;font-weight:600;line-height:.9}
        .nc-line{margin-top:3vmin;height:.4vmin;min-height:2px;background:${tone.line};overflow:hidden}
        .nc-fill{height:100%;background:${tone.muted};transform-origin:left center;transform:scaleX(0)}
        .nc-date{font-size:4.6vmin;margin-top:2.4vmin;color:${tone.muted}}
      `,
      body: `
        <div class="w nc"><div class="nc-area" id="area"><div class="nc-block" id="block">
          ${c.title ? `<div class="nc-cap">${escapeHtml(c.title)}</div>` : ''}
          <div class="nc-time w-cond" id="t">--:--</div>
          <div class="nc-line"><div class="nc-fill" id="f"></div></div>
          ${c.showDate ? '<div class="nc-date" id="d"></div>' : ''}
        </div></div></div>`,
      script: `
        ${DATE_SCRIPT}
        var tz = ${asJson(c.timeZone || 'Europe/Rome')};
        var hm = new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:tz});
        var area = document.getElementById('area'), block = document.getElementById('block');
        var fill = document.getElementById('f');
        function tick(){
          var now = new Date();
          document.getElementById('t').textContent = hm.format(now);
          var d = document.getElementById('d'); if (d) d.textContent = itDate(now, tz);
          // The line restarts empty each minute, then glides to full in one CSS transition
          var left = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
          fill.style.transition = 'none';
          fill.style.transform = 'scaleX(' + (1 - left / 60000) + ')';
          fill.getBoundingClientRect();
          fill.style.transition = 'transform ' + left + 'ms linear';
          fill.style.transform = 'scaleX(1)';
          setTimeout(tick, left + 20);
        }
        // Wander to a random spot of the free area, slowly enough to go unnoticed
        function drift(){
          var x = Math.max(0, area.clientWidth - block.offsetWidth);
          var y = Math.max(0, (area.clientHeight - block.offsetHeight) / 2);
          block.style.transform = 'translate(' + Math.round(Math.random() * x) + 'px,' + Math.round((Math.random() * 2 - 1) * y) + 'px)';
        }
        tick(); setTimeout(drift, 1000); setInterval(drift, 60000);
      `,
    });
  },
};

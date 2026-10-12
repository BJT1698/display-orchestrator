import { wrapWidget, escapeHtml, asJson, DATE_SCRIPT } from './base';

export const clockWidget = {
  type: 'clock',
  label: 'Clock',
  description: 'Time and date, large enough to read across a room.',
  defaults: { title: '', showSeconds: false, showDate: true, timeZone: 'Europe/Rome' },
  fields: [
    { key: 'title', label: 'Caption', type: 'text', placeholder: 'Reception', hint: 'Optional, shown above the time.' },
    { key: 'showDate', label: 'Show the date', type: 'toggle' },
    { key: 'showSeconds', label: 'Show seconds', type: 'toggle' },
    {
      key: 'timeZone', label: 'Time zone', type: 'select',
      options: [
        ['Europe/Rome', 'Italy'], ['Europe/London', 'London'], ['America/New_York', 'New York'],
        ['Asia/Shanghai', 'Shanghai'], ['Asia/Tokyo', 'Tokyo'], ['UTC', 'UTC'],
      ],
    },
  ],
  defaultName: (c) => (c.title ? `Clock, ${c.title}` : 'Clock'),

  render(c) {
    return wrapWidget({ type: 'clock', ...c }, {
      css: `
        .clk{display:flex;flex-direction:column;justify-content:center;height:100%}
        .clk-cap{font-size:3.4vmin;margin-bottom:2vmin}
        .clk-time{font-size:30vmin;font-weight:600;line-height:.9}
        .clk-sec{font-size:.4em;font-weight:400;color:#9AA1AB;margin-left:.15em}
        .clk-date{font-size:4.6vmin;margin-top:3vmin}
      `,
      body: `
        <div class="w"><div class="clk">
          ${c.title ? `<div class="clk-cap w-muted">${escapeHtml(c.title)}</div>` : ''}
          <div class="clk-time w-cond"><span id="t">--:--</span>${c.showSeconds ? '<span class="clk-sec" id="s"></span>' : ''}</div>
          ${c.showDate ? '<div class="clk-date w-muted" id="d"></div>' : ''}
        </div></div>`,
      script: `
        ${DATE_SCRIPT}
        var tz = ${asJson(c.timeZone || 'Europe/Rome')};
        var hm = new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:tz});
        var sec = new Intl.DateTimeFormat('it-IT',{second:'2-digit',timeZone:tz});
        function tick(){
          var now = new Date();
          document.getElementById('t').textContent = hm.format(now);
          var s = document.getElementById('s'); if (s) s.textContent = sec.format(now).padStart(2,'0');
          var d = document.getElementById('d'); if (d) d.textContent = itDate(now, tz);
        }
        tick(); setInterval(tick, 1000);
      `,
    });
  },
};

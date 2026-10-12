import { wrapWidget, escapeHtml, asJson } from './base';

const inAWeek = () => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  d.setHours(9, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
};

export const countdownWidget = {
  type: 'countdown',
  label: 'Countdown',
  description: 'Days, hours and minutes left until an event, then a message.',
  defaults: { title: '', target: inAWeek(), doneText: 'Ci siamo!' },
  fields: [
    { key: 'title', label: 'Event', type: 'text', placeholder: 'Convention 2027', required: true },
    { key: 'target', label: 'Date and time', type: 'datetime', required: true },
    { key: 'doneText', label: 'Message when it starts', type: 'text', placeholder: 'Ci siamo!' },
  ],
  defaultName: (c) => (c.title ? `Countdown, ${c.title}` : 'Countdown'),

  render(c) {
    return wrapWidget({ type: 'countdown', ...c }, {
      css: `
        .cd{display:flex;flex-direction:column;justify-content:center;height:100%}
        .cd-title{font-size:6.5vmin;font-weight:600;line-height:1.05;max-width:20ch}
        .cd-when{font-size:3.2vmin;margin-top:1.6vmin}
        .cd-units{display:flex;gap:6vmin;margin-top:6vmin;flex-wrap:wrap}
        .cd-n{font-size:20vmin;font-weight:600;line-height:.9}
        .cd-l{font-size:3vmin;margin-top:1.2vmin}
        .cd-done{font-size:14vmin;font-weight:600;line-height:1;margin-top:6vmin;display:none}
      `,
      body: `
        <div class="w"><div class="cd">
          <div class="cd-title w-cond">${escapeHtml(c.title)}</div>
          <div class="cd-when w-muted" id="when"></div>
          <div class="cd-units" id="units">
            <div><div class="cd-n w-cond" id="dd">0</div><div class="cd-l w-faint" id="dl">giorni</div></div>
            <div><div class="cd-n w-cond" id="hh">0</div><div class="cd-l w-faint" id="hl">ore</div></div>
            <div><div class="cd-n w-cond" id="mm">0</div><div class="cd-l w-faint" id="ml">minuti</div></div>
          </div>
          <div class="cd-done w-cond" id="done">${escapeHtml(c.doneText || 'Ci siamo!')}</div>
        </div></div>`,
      script: `
        var target = new Date(${asJson(c.target)});
        var whenFmt = new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
        var w = whenFmt.format(target); document.getElementById('when').textContent = w.charAt(0).toUpperCase()+w.slice(1);
        function set(id, label, n, one, many){ document.getElementById(id).textContent = n; document.getElementById(label).textContent = n === 1 ? one : many; }
        function tick(){
          var left = target - Date.now();
          if (isNaN(left) || left <= 0) {
            document.getElementById('units').style.display = 'none';
            document.getElementById('done').style.display = 'block';
            return;
          }
          var m = Math.floor(left / 60000);
          set('dd','dl', Math.floor(m / 1440), 'giorno', 'giorni');
          set('hh','hl', Math.floor(m / 60) % 24, 'ora', 'ore');
          set('mm','ml', m % 60, 'minuto', 'minuti');
        }
        tick(); setInterval(tick, 1000);
      `,
    });
  },
};

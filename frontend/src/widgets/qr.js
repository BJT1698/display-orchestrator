import qrcode from 'qrcode-generator';
import { wrapWidget, escapeHtml } from './base';

// The QR code is drawn now, as SVG, so the screen needs no library and no network to show it
function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      if (qr.isDark(r, col)) path += `M${col} ${r}h1v1h-1z`;
    }
  }
  // Dark modules on white with a 4-module quiet zone: what phone cameras expect
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
}

export const qrWidget = {
  type: 'qr',
  label: 'QR code',
  description: 'A link people can open with their phone camera, with a title and a line of text.',
  defaults: { url: 'https://', title: '', caption: '' },
  fields: [
    { key: 'url', label: 'Link', type: 'url', placeholder: 'https://intranet.example.com/survey', required: true },
    { key: 'title', label: 'Title', type: 'text', placeholder: 'Tell us how we did', required: true },
    { key: 'caption', label: 'Text', type: 'textarea', placeholder: 'Point your phone camera at the code.' },
  ],
  defaultName: (c) => (c.title ? `QR, ${c.title}` : 'QR code'),

  render(c) {
    let svg = '';
    try {
      svg = qrSvg(c.url || ' ');
    } catch {
      svg = '';
    }
    const shortUrl = String(c.url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    return wrapWidget({ type: 'qr', ...c }, {
      css: `
        .qr{display:flex;align-items:center;justify-content:space-between;gap:7vmin;height:100%}
        .qr-text{flex:1;min-width:0}
        .qr-title{font-size:8vmin;font-weight:600;line-height:1.02;max-width:16ch}
        .qr-cap{font-size:3.6vmin;line-height:1.35;margin-top:3vmin;max-width:34ch;white-space:pre-line}
        .qr-url{font-size:2.6vmin;margin-top:4vmin;word-break:break-all}
        .qr-code{width:min(58vmin,48vw);flex:none}
        .qr-code svg{display:block;width:100%;height:auto}
        @media (orientation:portrait){.qr{flex-direction:column-reverse;justify-content:center;align-items:flex-start}.qr-code{width:70vw}}
      `,
      body: `
        <div class="w"><div class="qr">
          <div class="qr-text">
            <div class="qr-title w-cond">${escapeHtml(c.title)}</div>
            ${c.caption ? `<div class="qr-cap w-muted">${escapeHtml(c.caption)}</div>` : ''}
            <div class="qr-url w-faint">${escapeHtml(shortUrl)}</div>
          </div>
          <div class="qr-code">${svg}</div>
        </div></div>`,
    });
  },
};

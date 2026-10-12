import { wrapWidget, escapeHtml } from './base';

export const INLINE_IMAGE = 'inline';

// Puts the embedded picture back into the settings when an announcement is reopened
export function restoreImage(config, html) {
  if (config.image !== INLINE_IMAGE) return config;
  const match = /background-image:url\('(data:image\/[^']+)'\)/.exec(html);
  return { ...config, image: match ? match[1] : '' };
}

export const announcementWidget = {
  type: 'announcement',
  label: 'Announcement',
  description: 'A title, a message and an optional picture, laid out for the screen.',
  defaults: { title: '', body: '', footer: '', image: '' },
  fields: [
    { key: 'title', label: 'Title', type: 'text', placeholder: 'New canteen opening hours', required: true },
    { key: 'body', label: 'Message', type: 'textarea', placeholder: 'From Monday the canteen is open 12:00 to 14:30.' },
    { key: 'image', label: 'Picture', type: 'image', hint: 'Optional. Stored inside the announcement, so it shows even offline.' },
    { key: 'footer', label: 'Signature', type: 'text', placeholder: 'Facility management, ext. 214', hint: 'Optional, shown at the bottom.' },
  ],
  defaultName: (c) => (c.title ? `Announcement, ${c.title}` : 'Announcement'),

  render(c) {
    const hasImage = Boolean(c.image);
    // The picture is already in the page below; the stored settings only note that it is there
    return wrapWidget({ type: 'announcement', ...c, image: hasImage ? INLINE_IMAGE : '' }, {
      css: `
        .an{display:flex;height:100%;gap:6vmin}
        .an-text{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
        .an-title{font-size:9vmin;font-weight:650;line-height:1;max-width:18ch}
        .an-body{font-size:4vmin;line-height:1.4;margin-top:4vmin;max-width:36ch;white-space:pre-line}
        .an-foot{font-size:2.8vmin;margin-top:auto;padding-top:2.6vmin;border-top:1px solid #33383F;align-self:stretch}
        .an-spacer{flex:1}
        .an-img{flex:0 0 42%;border-radius:.6vmin;background:#000 center/cover no-repeat}
        @media (orientation:portrait){.an{flex-direction:column-reverse}.an-img{flex:0 0 40%}}
      `,
      body: `
        <div class="w"><div class="an">
          <div class="an-text">
            <div class="an-spacer"></div>
            <div class="an-title w-cond">${escapeHtml(c.title)}</div>
            ${c.body ? `<div class="an-body w-muted">${escapeHtml(c.body)}</div>` : ''}
            <div class="an-spacer"></div>
            ${c.footer ? `<div class="an-foot w-faint">${escapeHtml(c.footer)}</div>` : ''}
          </div>
          ${hasImage ? `<div class="an-img" style="background-image:url('${escapeHtml(c.image)}')"></div>` : ''}
        </div></div>`,
    });
  },
};

// Pictures are shrunk in the browser before being embedded, to keep the media small
export function imageToDataUrl(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the picture.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This file is not a picture the browser can open.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

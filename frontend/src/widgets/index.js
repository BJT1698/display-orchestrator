import { clockWidget } from './clock';
import { nightClockWidget } from './nightClock';
import { countdownWidget } from './countdown';
import { calendarWidget } from './calendar';
import { wikiWidget } from './wiki';
import { qrWidget } from './qr';
import { weatherWidget } from './weather';
import { announcementWidget } from './announcement';

import { readWidget as readStored } from './base';
import { restoreImage } from './announcement';

export function readWidget(html) {
  const config = readStored(html);
  return config && config.type === 'announcement' ? restoreImage(config, html) : config;
}

// Order shown in the "Add widget" gallery
export const WIDGETS = [announcementWidget, weatherWidget, calendarWidget, wikiWidget, clockWidget, nightClockWidget, countdownWidget, qrWidget];

export const widgetByType = (type) => WIDGETS.find((w) => w.type === type) || null;

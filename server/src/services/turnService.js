import crypto from 'node:crypto';
import { config } from '../config.js';

// ICE servers for a screen-sharing browser. With a TURN relay configured, credentials follow
// coturn's "TURN REST API" scheme: username "<expiry>:<label>", password HMAC-SHA1 of it with the
// shared secret. They stop working by themselves, so handing them to a guest is safe.
export function iceServersFor(label, ttlSeconds = 12 * 3600) {
  if (!config.turnUrls.length || !config.turnSecret) return [];
  const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}:${String(label).replace(/[^\w.-]/g, '').slice(0, 32) || 'cast'}`;
  const credential = crypto.createHmac('sha1', config.turnSecret).update(username).digest('base64');
  return [{ urls: config.turnUrls, username, credential }];
}

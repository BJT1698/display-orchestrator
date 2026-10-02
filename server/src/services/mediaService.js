import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import mime from 'mime-types';
import { config } from '../config.js';
import { db } from '../db/database.js';

// Setup multer disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.mediaDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500 MB limit
  }
});

export function detectMediaType(filename, mimeType) {
  const mType = mimeType || mime.lookup(filename) || '';
  if (mType.startsWith('image/')) return 'image';
  if (mType.startsWith('video/')) return 'video';
  if (mType.includes('html') || filename.endsWith('.html') || filename.endsWith('.htm')) return 'html_snippet';
  return 'image';
}

export const mediaService = {
  listMedia() {
    return db.all('SELECT * FROM media ORDER BY created_at DESC');
  },

  getMediaById(id) {
    return db.getOne('SELECT * FROM media WHERE id = ?', id);
  },

  createUploadedMedia(file, durationSeconds = 10) {
    const mediaType = detectMediaType(file.filename, file.mimetype);
    const duration = parseInt(durationSeconds || (mediaType === 'video' ? '30' : '10'), 10);
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const result = db.run(
      `INSERT INTO media (filename, original_name, file_path, media_type, mime_type, size_bytes, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      file.filename,
      originalName,
      file.path,
      mediaType,
      file.mimetype,
      file.size,
      duration
    );

    return this.getMediaById(result.lastInsertRowid);
  },

  createUrlMedia({ name, url, durationSeconds = 15 }) {
    const duration = parseInt(durationSeconds || '15', 10);
    const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.url`;

    const result = db.run(
      `INSERT INTO media (filename, original_name, file_path, media_type, mime_type, size_bytes, duration_seconds, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      filename,
      name,
      '',
      'webpage',
      'text/html',
      0,
      duration,
      url
    );

    return this.getMediaById(result.lastInsertRowid);
  },

  createHtmlMedia({ name, content, durationSeconds = 10 }) {
    const duration = parseInt(durationSeconds || '10', 10);
    const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;

    const result = db.run(
      `INSERT INTO media (filename, original_name, file_path, media_type, mime_type, size_bytes, duration_seconds, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      filename,
      name,
      '',
      'html_snippet',
      'text/html',
      Buffer.byteLength(content, 'utf8'),
      duration,
      content
    );

    return this.getMediaById(result.lastInsertRowid);
  },

  updateMedia(id, { originalName, durationSeconds, url, content }) {
    const current = this.getMediaById(id);
    if (!current) return null;

    const newName = originalName !== undefined ? originalName : current.original_name;
    const newDuration = durationSeconds !== undefined ? parseInt(durationSeconds, 10) : current.duration_seconds;
    const newUrl = url !== undefined ? url : current.url;
    const newContent = content !== undefined ? content : current.content;

    db.run(
      `UPDATE media 
       SET original_name = ?, duration_seconds = ?, url = ?, content = ?, updated_at = datetime('now')
       WHERE id = ?`,
      newName,
      newDuration,
      newUrl,
      newContent,
      id
    );

    return this.getMediaById(id);
  },

  deleteMedia(id) {
    const media = this.getMediaById(id);
    if (!media) return false;

    // Delete disk file if exists
    if (media.file_path && fs.existsSync(media.file_path)) {
      try {
        fs.unlinkSync(media.file_path);
      } catch (err) {
        console.error('Failed to unlink file:', media.file_path, err);
      }
    }

    db.run('DELETE FROM media WHERE id = ?', id);
    return true;
  },

  getStorageStats() {
    const row = db.getOne('SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as totalBytes FROM media');
    return {
      mediaCount: row.count,
      totalBytes: row.totalBytes,
      totalFormatted: formatBytes(row.totalBytes)
    };
  }
};

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

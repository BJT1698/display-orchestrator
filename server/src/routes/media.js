import express from 'express';
import { mediaService, uploadMiddleware } from '../services/mediaService.js';
import { wsHub } from '../ws/websocketServer.js';

export const mediaRouter = express.Router();

// List all media
mediaRouter.get('/', (req, res) => {
  const list = mediaService.listMedia();
  res.json({ success: true, data: list });
});

// Storage stats
mediaRouter.get('/stats/storage', (req, res) => {
  const stats = mediaService.getStorageStats();
  res.json({ success: true, data: stats });
});

// Get single media
mediaRouter.get('/:id', (req, res) => {
  const media = mediaService.getMediaById(req.params.id);
  if (!media) {
    return res.status(404).json({ success: false, error: 'Media not found' });
  }
  res.json({ success: true, data: media });
});

// Upload media file (image/video)
mediaRouter.post('/upload', uploadMiddleware.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  try {
    const duration = req.body.durationSeconds || 10;
    const item = mediaService.createUploadedMedia(req.file, duration);
    wsHub.log('info', 'dashboard', null, `Uploaded media: ${item.original_name} (${item.media_type})`);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create URL web page media
mediaRouter.post('/url', (req, res) => {
  const { name, url, durationSeconds } = req.body;
  if (!name || !url) {
    return res.status(400).json({ success: false, error: 'Name and URL are required' });
  }

  try {
    const item = mediaService.createUrlMedia({ name, url, durationSeconds });
    wsHub.log('info', 'dashboard', null, `Created web URL media: ${name} -> ${url}`);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create HTML snippet media
mediaRouter.post('/html', (req, res) => {
  const { name, content, durationSeconds } = req.body;
  if (!name || !content) {
    return res.status(400).json({ success: false, error: 'Name and HTML content are required' });
  }

  try {
    const item = mediaService.createHtmlMedia({ name, content, durationSeconds });
    wsHub.log('info', 'dashboard', null, `Created custom HTML media: ${name}`);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update media
mediaRouter.put('/:id', (req, res) => {
  const updated = mediaService.updateMedia(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Media not found' });
  }
  res.json({ success: true, data: updated });
});

// Delete media
mediaRouter.delete('/:id', (req, res) => {
  const success = mediaService.deleteMedia(req.params.id);
  if (!success) {
    return res.status(404).json({ success: false, error: 'Media not found' });
  }
  res.json({ success: true, message: 'Media item deleted' });
});

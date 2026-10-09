import React, { useState } from 'react';
import { api } from '../services/api';
import { Modal } from './ui';

export function PushUrlModal({ isOpen, onClose, display, onSuccess }) {
  const [url, setUrl] = useState('https://');
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !display) return null;

  const isOnline = display.status === 'online';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.sendCommand(display.id, 'push_url', { url, durationSeconds: parseInt(duration, 10) });
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      alert('Could not show the page: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Show a web page"
      description={`On ${display.name}. The playlist resumes when the time is up.`}
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button>
          <button type="submit" form="push-url" disabled={loading || !url || !isOnline} className="btn btn-primary">
            {loading ? 'Sending' : 'Show page'}
          </button>
        </>
      }
    >
      {!isOnline && (
        <p className="mb-4 text-sm text-caution">This screen is offline. Pages can only be sent to screens that are on air.</p>
      )}
      <form id="push-url" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="push-url-input">Address</label>
          <input
            id="push-url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            autoFocus
            placeholder="https://intranet.example.com/news"
            className="control"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="push-duration">Show for (seconds)</label>
          <input
            id="push-duration"
            type="number"
            min="5"
            max="3600"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="control w-32"
          />
        </div>
      </form>
    </Modal>
  );
}

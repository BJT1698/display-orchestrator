import React, { useState } from 'react';
import { api } from '../services/api';
import { Modal } from './ui';

export function EmergencyAlertModal({ isOpen, onClose, onSuccess }) {
  const [title, setTitle] = useState('Evacuate the building');
  const [message, setMessage] = useState('Leave by the nearest exit and go to the assembly point. Do not use the lifts.');
  const [duration, setDuration] = useState(120);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setConfirmed(false);
    onClose();
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!message.trim() || !confirmed) return;

    setLoading(true);
    try {
      await api.broadcastEmergency(message, title, parseInt(duration, 10));
      onSuccess && onSuccess();
      handleClose();
    } catch (err) {
      alert('The alert was not sent: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Emergency alert"
      description="Replaces the content on every connected screen until the time runs out."
      onClose={handleClose}
      tone="alert"
      footer={
        <>
          <button type="button" onClick={handleClose} className="btn btn-quiet">Cancel</button>
          <button type="submit" form="emergency-form" disabled={loading || !confirmed} className="btn btn-danger">
            {loading ? 'Sending alert' : 'Send to all screens'}
          </button>
        </>
      }
    >
      <form id="emergency-form" onSubmit={handleBroadcast} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="em-title">Headline</label>
          <input id="em-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="control font-semibold" />
        </div>

        <div>
          <label className="field-label" htmlFor="em-message">Message</label>
          <textarea id="em-message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required className="control" />
        </div>

        <div>
          <label className="field-label" htmlFor="em-duration">Show for (seconds)</label>
          <input id="em-duration" type="number" min="10" max="3600" value={duration} onChange={(e) => setDuration(e.target.value)} className="control w-32" />
        </div>

        {/* What the screens will show, at a glance */}
        <div className="rounded-sm bg-alert px-5 py-4 text-white">
          <div className="display text-xl font-bold leading-tight">{title || 'Headline'}</div>
          <div className="mt-1 text-sm leading-snug">{message}</div>
        </div>

        <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#E5484D]"
          />
          I understand this interrupts every screen immediately.
        </label>
      </form>
    </Modal>
  );
}

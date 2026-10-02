import React, { useState } from 'react';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';

export function EmergencyAlertModal({ isOpen, onClose, onSuccess }) {
  const [title, setTitle] = useState('⚠️ EMERGENCY EVACUATION NOTICE');
  const [message, setMessage] = useState('Please proceed immediately to the designated assembly area. Follow security instructions.');
  const [duration, setDuration] = useState(120);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    if (!confirm('Are you sure you want to broadcast this emergency alert to ALL screens?')) {
      return;
    }

    setLoading(true);
    try {
      await api.broadcastEmergency(message, title, parseInt(duration, 10));
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      alert('Failed to broadcast: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-red-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border-2 border-red-500/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-400 animate-pulse">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-xl font-black text-red-400 tracking-wide">BROADCAST EMERGENCY ALERT</h3>
            <p className="text-xs text-slate-300">Overrides all connected displays immediately</p>
          </div>
        </div>

        <form onSubmit={handleBroadcast} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Alert Title / Header
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-slate-950 border border-red-500/40 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-red-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Alert Message
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              className="w-full bg-slate-950 border border-red-500/40 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Override Duration (Seconds)
            </label>
            <input
              type="number"
              min="10"
              max="3600"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition flex items-center gap-2 shadow-lg shadow-red-900/50"
            >
              <ShieldAlert className="w-5 h-5" />
              {loading ? 'Broadcasting...' : 'BROADCAST TO ALL SCREENS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

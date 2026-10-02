import React, { useState } from 'react';
import { Globe, X, Send } from 'lucide-react';
import { api } from '../services/api';

export function PushUrlModal({ isOpen, onClose, display, onSuccess }) {
  const [url, setUrl] = useState('https://');
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !display) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.sendCommand(display.id, 'push_url', { url, durationSeconds: parseInt(duration, 10) });
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      alert('Failed to push URL: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Push Live Web URL</h3>
            <p className="text-xs text-slate-400">Display on {display.name} instantly</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Target URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://grafana.internal/dashboard"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Duration (Seconds)
            </label>
            <input
              type="number"
              min="5"
              max="3600"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
            <p className="text-xs text-slate-500 mt-1">Screen will automatically resume its playlist afterwards.</p>
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
              disabled={loading || !url}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium text-sm transition flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Pushing...' : 'Push Live Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

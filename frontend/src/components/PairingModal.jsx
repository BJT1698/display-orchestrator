import React, { useState } from 'react';
import { KeyRound, X, CheckCircle2, Tv } from 'lucide-react';
import { api } from '../services/api';

export function PairingModal({ isOpen, onClose, pendingList = [], groups = [], onSuccess }) {
  const [selectedCode, setSelectedCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSelectPending = (p) => {
    setSelectedCode(p.pairing_code);
    setCustomName(p.client_name || '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.approvePairing(selectedCode, customName, groupId ? parseInt(groupId, 10) : null);
      if (res.success) {
        onSuccess && onSuccess();
        onClose();
      } else {
        setError(res.error || 'Failed to approve pairing');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Pair New Display Node</h3>
            <p className="text-sm text-slate-400">Approve pending screens or enter pairing PIN</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {pendingList.length > 0 && (
          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Discovered Displays Waiting ({pendingList.length})
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {pendingList.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleSelectPending(p)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                    selectedCode === p.pairing_code
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-white'
                      : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Tv className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-semibold text-sm">{p.client_name || 'Display Screen'}</div>
                      <div className="text-xs text-slate-400 font-mono">IP: {p.ip_address}</div>
                    </div>
                  </div>
                  <div className="font-mono font-bold text-base px-2.5 py-1 bg-slate-950 rounded-lg border border-slate-800 text-emerald-400">
                    {p.pairing_code}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Pairing Code
            </label>
            <input
              type="text"
              placeholder="e.g. K9F-2A7"
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value.toUpperCase())}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 font-mono text-lg font-bold text-center tracking-widest text-emerald-400 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Display Friendly Name
            </label>
            <input
              type="text"
              placeholder="e.g. Reception Main Screen"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Assign Group (Optional)
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">-- No Group (Default) --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedCode.trim()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition flex items-center gap-2 shadow-lg shadow-emerald-900/40 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? 'Authorizing...' : 'Approve & Pair'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

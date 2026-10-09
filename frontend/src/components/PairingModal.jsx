import React, { useState } from 'react';
import { api } from '../services/api';
import { Modal, ErrorNote } from './ui';

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
        setError(res.error || 'This code was not accepted. Check it against the one on the screen.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Pair a display"
      description="Enter the code shown on the screen, or pick a screen that is already waiting."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button>
          <button type="submit" form="pairing-form" disabled={loading || !selectedCode.trim()} className="btn btn-primary">
            {loading ? 'Pairing' : 'Pair display'}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>

      {pendingList.length > 0 && (
        <fieldset className="mb-5">
          <legend className="field-label">Waiting to be paired</legend>
          <div className="border border-line rounded divide-y divide-line max-h-48 overflow-y-auto">
            {pendingList.map((p) => {
              const selected = selectedCode === p.pairing_code;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleSelectPending(p)}
                  aria-pressed={selected}
                  className={`w-full flex items-center justify-between gap-4 px-3 py-2.5 text-left transition-colors ${
                    selected ? 'bg-raised' : 'hover:bg-[#22252A]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-3.5 h-3.5 rounded-full border shrink-0 ${selected ? 'border-ink bg-ink shadow-[inset_0_0_0_3px_#262A30]' : 'border-line-strong'}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-sm text-ink truncate">{p.client_name || 'Unnamed screen'}</div>
                      <div className="text-xs text-faint">{p.ip_address}</div>
                    </div>
                  </div>
                  <span className="display text-lg font-semibold tracking-[0.12em] text-ink">{p.pairing_code}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <form id="pairing-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="pair-code">Pairing code</label>
          <input
            id="pair-code"
            type="text"
            placeholder="K9F-2A7"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value.toUpperCase())}
            required
            autoComplete="off"
            spellCheck="false"
            className="control h-14 text-center display text-2xl font-semibold tracking-[0.3em]"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="pair-name">Screen name</label>
          <input
            id="pair-name"
            type="text"
            placeholder="Reception, left screen"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="control"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="pair-group">Group</label>
          <select id="pair-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="control">
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  );
}

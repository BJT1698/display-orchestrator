import React, { useState } from 'react';
import { api } from '../services/api';
import { Modal, formatBytes } from './ui';

export function MediaUploadModal({ isOpen, onClose, onSuccess }) {
  const [tab, setTab] = useState('upload'); // 'upload' | 'url' | 'html'
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(10);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  if (!isOpen) return null;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (tab === 'upload') {
        if (!file) return;
        await api.uploadMediaFile(file, parseInt(duration, 10));
      } else if (tab === 'url') {
        if (!name || !url) return;
        await api.createUrlMedia(name, url, parseInt(duration, 10));
      } else if (tab === 'html') {
        if (!name || !htmlContent) return;
        await api.createHtmlMedia(name, htmlContent, parseInt(duration, 10));
      }

      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      alert('Could not add the media: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const canSave = !loading && (tab === 'upload' ? Boolean(file) : tab === 'url' ? Boolean(name && url) : Boolean(name && htmlContent));

  return (
    <Modal
      title="Add media"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button>
          <button type="submit" form="media-form" disabled={!canSave} className="btn btn-primary">
            {loading ? 'Saving' : tab === 'upload' ? 'Upload' : 'Add to library'}
          </button>
        </>
      }
    >
      <div className="segmented w-full mb-5" role="group" aria-label="Kind of media">
        <button type="button" className="flex-1" aria-pressed={tab === 'upload'} onClick={() => setTab('upload')}>File</button>
        <button type="button" className="flex-1" aria-pressed={tab === 'url'} onClick={() => setTab('url')}>Web page</button>
        <button type="button" className="flex-1" aria-pressed={tab === 'html'} onClick={() => setTab('html')}>HTML snippet</button>
      </div>

      <form id="media-form" onSubmit={handleSubmit} className="space-y-4">
        {tab === 'upload' && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`rounded border border-dashed px-6 py-8 text-center transition-colors ${
              dragActive ? 'border-ink bg-raised' : 'border-line-strong bg-ground'
            }`}
          >
            {file ? (
              <div>
                <div className="text-sm font-medium text-ink break-all">{file.name}</div>
                <div className="text-xs text-faint mt-1">{formatBytes(file.size)}</div>
                <button type="button" onClick={() => setFile(null)} className="btn btn-sm mt-4">Choose another file</button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-ink">Drop a file here, or</p>
                <label className="btn btn-sm mt-3 cursor-pointer">
                  Choose a file
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => e.target.files && setFile(e.target.files[0])}
                    className="sr-only"
                  />
                </label>
                <p className="field-hint mt-4">JPEG, PNG, WebP, GIF, MP4 or WebM, up to 500 MB.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'url' && (
          <>
            <div>
              <label className="field-label" htmlFor="m-name">Name</label>
              <input id="m-name" type="text" placeholder="Sales dashboard" value={name} onChange={(e) => setName(e.target.value)} required className="control" />
            </div>
            <div>
              <label className="field-label" htmlFor="m-url">Address</label>
              <input id="m-url" type="url" placeholder="https://dashboard.example.com" value={url} onChange={(e) => setUrl(e.target.value)} required className="control" />
              <p className="field-hint">The page must allow being shown inside a frame.</p>
            </div>
          </>
        )}

        {tab === 'html' && (
          <>
            <div>
              <label className="field-label" htmlFor="m-hname">Name</label>
              <input id="m-hname" type="text" placeholder="Welcome banner" value={name} onChange={(e) => setName(e.target.value)} required className="control" />
            </div>
            <div>
              <label className="field-label" htmlFor="m-html">HTML</label>
              <textarea
                id="m-html"
                rows={7}
                spellCheck="false"
                placeholder="<h1>Welcome</h1>"
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                required
                className="control font-mono text-xs"
              />
            </div>
          </>
        )}

        <div>
          <label className="field-label" htmlFor="m-duration">Default duration (seconds)</label>
          <input id="m-duration" type="number" min="2" max="600" value={duration} onChange={(e) => setDuration(e.target.value)} className="control w-32" />
          <p className="field-hint">Used when the item is added to a playlist. Videos play to the end.</p>
        </div>
      </form>
    </Modal>
  );
}

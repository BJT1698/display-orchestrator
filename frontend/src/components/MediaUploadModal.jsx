import React, { useState } from 'react';
import { Upload, Globe, Code, X, Check, Image as ImageIcon, Video } from 'lucide-react';
import { api } from '../services/api';

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
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-white mb-1">Add Media Asset</h3>
        <p className="text-xs text-slate-400 mb-5">Upload images, videos, or link web dashboards</p>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
              tab === 'upload' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> File Upload
          </button>
          <button
            type="button"
            onClick={() => setTab('url')}
            className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
              tab === 'url' ? 'bg-slate-800 text-sky-400 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Web URL
          </button>
          <button
            type="button"
            onClick={() => setTab('html')}
            className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
              tab === 'html' ? 'bg-slate-800 text-purple-400 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" /> HTML Snippet
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'upload' && (
            <div>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
                  dragActive
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : file
                    ? 'border-emerald-500/50 bg-slate-950'
                    : 'border-slate-700 bg-slate-950/50 hover:border-slate-600'
                }`}
              >
                {file ? (
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
                      <Check className="w-5 h-5" />
                    </div>
                    <div className="font-semibold text-sm text-white">{file.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="mt-3 text-xs text-red-400 hover:underline"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-center gap-2 mb-3 text-slate-500">
                      <ImageIcon className="w-6 h-6" />
                      <Video className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-300">Drag & drop files here, or browse</p>
                    <p className="text-xs text-slate-500 mt-1">JPEG, PNG, WebP, GIF, MP4, WebM (up to 500MB)</p>
                    <label className="mt-4 inline-block px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg cursor-pointer transition">
                      Browse Files
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={(e) => e.target.files && setFile(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'url' && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Asset Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sales Metrics Dashboard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Webpage URL
                </label>
                <input
                  type="url"
                  placeholder="https://dashboard.example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </>
          )}

          {tab === 'html' && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Snippet Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Custom Welcome Banner"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  HTML / CSS / JavaScript Code
                </label>
                <textarea
                  rows={5}
                  placeholder="<div style='background: #1e293b; color: white; padding: 20px;'><h1>Hello World</h1></div>"
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Default Duration (Seconds)
            </label>
            <input
              type="number"
              min="2"
              max="600"
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
              disabled={loading || (tab === 'upload' && !file)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition shadow-lg shadow-emerald-900/40 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Media'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

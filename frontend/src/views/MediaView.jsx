import React, { useState } from 'react';
import { Upload, Plus, Trash2, Image as ImageIcon, Video, Globe, Code, HardDrive, Eye } from 'lucide-react';
import { api } from '../services/api';

export function MediaView({
  mediaList,
  storageStats,
  onRefresh,
  onOpenUpload
}) {
  const [filterType, setFilterType] = useState('all');
  const [previewMedia, setPreviewMedia] = useState(null);

  const filteredMedia = mediaList.filter((m) => {
    if (filterType === 'all') return true;
    return m.media_type === filterType;
  });

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete media asset '${name}'?`)) return;
    try {
      await api.deleteMedia(id);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Storage Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Media Library</h1>
          <p className="text-xs text-slate-400">
            {mediaList.length} assets &bull; {storageStats?.totalFormatted || '0 B'} storage used
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-1 text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'all' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({mediaList.length})
            </button>
            <button
              onClick={() => setFilterType('image')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'image' ? 'bg-slate-800 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Images
            </button>
            <button
              onClick={() => setFilterType('video')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'video' ? 'bg-slate-800 text-sky-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Videos
            </button>
            <button
              onClick={() => setFilterType('webpage')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'webpage' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              URLs
            </button>
            <button
              onClick={() => setFilterType('html_snippet')}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === 'html_snippet' ? 'bg-slate-800 text-purple-400 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              HTML
            </button>
          </div>

          <button
            onClick={onOpenUpload}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-950 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Asset
          </button>
        </div>
      </div>

      {/* Media Grid */}
      {filteredMedia.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl text-center">
          <Upload className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white">No media found</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">Upload pictures, videos or web URLs to populate your library.</p>
          <button
            onClick={onOpenUpload}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition"
          >
            Upload Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredMedia.map((media) => (
            <div
              key={media.id}
              className="glass-card rounded-2xl overflow-hidden border border-slate-800 flex flex-col group transition hover:border-slate-700"
            >
              {/* Thumbnail / Preview Area */}
              <div
                onClick={() => setPreviewMedia(media)}
                className="w-full h-36 bg-slate-950 flex items-center justify-center relative cursor-pointer overflow-hidden"
              >
                {media.media_type === 'image' && (
                  <img
                    src={`/media/${media.filename}`}
                    alt={media.original_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                )}

                {media.media_type === 'video' && (
                  <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-sky-400">
                    <Video className="w-8 h-8 mb-1" />
                    <span className="text-[10px] font-mono text-slate-400">MP4 / Video</span>
                  </div>
                )}

                {media.media_type === 'webpage' && (
                  <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-amber-400 p-3 text-center">
                    <Globe className="w-8 h-8 mb-1" />
                    <span className="text-[10px] font-mono text-slate-400 truncate max-w-full">{media.url}</span>
                  </div>
                )}

                {media.media_type === 'html_snippet' && (
                  <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-purple-400 p-3">
                    <Code className="w-8 h-8 mb-1" />
                    <span className="text-[10px] font-mono text-slate-400">Custom HTML</span>
                  </div>
                )}

                <div className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono uppercase text-slate-300">
                  {media.media_type}
                </div>
              </div>

              {/* Card Footer */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-white text-xs truncate" title={media.original_name}>
                    {media.original_name}
                  </h4>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    {media.duration_seconds}s duration {media.size_bytes > 0 && `\u2022 ${(media.size_bytes / (1024 * 1024)).toFixed(1)} MB`}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => setPreviewMedia(media)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>

                  <button
                    onClick={() => handleDelete(media.id, media.original_name)}
                    className="text-slate-500 hover:text-red-400 p-1"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media Full Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setPreviewMedia(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>
            <h3 className="font-bold text-white text-base mb-4">{previewMedia.original_name}</h3>

            <div className="w-full h-80 bg-black rounded-xl overflow-hidden flex items-center justify-center">
              {previewMedia.media_type === 'image' && (
                <img
                  src={`/media/${previewMedia.filename}`}
                  alt={previewMedia.original_name}
                  className="max-w-full max-h-full object-contain"
                />
              )}
              {previewMedia.media_type === 'video' && (
                <video
                  src={`/media/${previewMedia.filename}`}
                  controls
                  autoPlay
                  className="max-w-full max-h-full"
                />
              )}
              {previewMedia.media_type === 'webpage' && (
                <iframe
                  src={previewMedia.url}
                  className="w-full h-full border-0 bg-white"
                  title="Web preview"
                />
              )}
              {previewMedia.media_type === 'html_snippet' && (
                <div
                  className="w-full h-full overflow-auto"
                  dangerouslySetInnerHTML={{ __html: previewMedia.content || '' }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

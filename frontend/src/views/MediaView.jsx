import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { PageHeader, EmptyState, Modal, MediaTypeIcon, SnippetFrame, mediaTypeLabel, formatBytes, formatDuration } from '../components/ui';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'webpage', label: 'Web pages' },
  { id: 'html_snippet', label: 'HTML' },
];

function Thumbnail({ media }) {
  if (media.media_type === 'image') {
    return (
      <img
        src={`/media/${media.filename}`}
        alt=""
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }
  if (media.media_type === 'video') {
    return (
      <video
        src={`/media/${media.filename}#t=0.5`}
        preload="metadata"
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-faint">
      <MediaTypeIcon type={media.media_type} className="w-6 h-6" />
      {media.url && <span className="text-xs truncate max-w-full">{media.url.replace(/^https?:\/\//, '')}</span>}
    </div>
  );
}

export function MediaView({
  mediaList,
  storageStats,
  onRefresh,
  onOpenUpload
}) {
  const [filterType, setFilterType] = useState('all');
  const [previewMedia, setPreviewMedia] = useState(null);

  const filteredMedia = mediaList.filter((m) => filterType === 'all' || m.media_type === filterType);

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete '${name}'? It will also be removed from every playlist.`)) return;
    try {
      await api.deleteMedia(id);
      onRefresh && onRefresh();
    } catch (err) {
      alert('Could not delete the file: ' + err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Media"
        description={`${mediaList.length} ${mediaList.length === 1 ? 'item' : 'items'}, ${storageStats?.totalFormatted || '0 B'} on disk.`}
      >
        <div className="segmented" role="group" aria-label="Filter by type">
          {FILTERS.map((f) => (
            <button key={f.id} aria-pressed={filterType === f.id} onClick={() => setFilterType(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={onOpenUpload} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Add media
        </button>
      </PageHeader>

      {filteredMedia.length === 0 ? (
        <EmptyState
          title={mediaList.length === 0 ? 'The library is empty' : 'Nothing of this type'}
          action={<button onClick={onOpenUpload} className="btn btn-primary">Add media</button>}
        >
          Upload images and videos, or add a web page or HTML snippet to show on screens.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-7">
          {filteredMedia.map((media) => (
            <figure key={media.id} className="group min-w-0">
              <button
                type="button"
                onClick={() => setPreviewMedia(media)}
                className="relative block w-full aspect-video rounded-sm overflow-hidden bg-black border border-line hover:border-line-strong transition-colors"
                aria-label={`Preview ${media.original_name}`}
              >
                <Thumbnail media={media} />
              </button>
              <figcaption className="mt-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate" title={media.original_name}>
                    {media.original_name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
                    <MediaTypeIcon type={media.media_type} className="w-3.5 h-3.5" />
                    <span>{mediaTypeLabel(media.media_type)}</span>
                    <span className="text-line-strong" aria-hidden="true">/</span>
                    <span>{formatDuration(media.duration_seconds)}</span>
                    {media.size_bytes > 0 && (
                      <>
                        <span className="text-line-strong" aria-hidden="true">/</span>
                        <span>{formatBytes(media.size_bytes)}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(media.id, media.original_name)}
                  className="btn-icon is-danger shrink-0 -mr-1.5"
                  title="Delete"
                  aria-label={`Delete ${media.original_name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {previewMedia && (
        <Modal title={previewMedia.original_name} onClose={() => setPreviewMedia(null)} width="max-w-4xl">
          <div className="aspect-video bg-black rounded-sm overflow-hidden flex items-center justify-center">
            {previewMedia.media_type === 'image' && (
              <img src={`/media/${previewMedia.filename}`} alt={previewMedia.original_name} className="max-w-full max-h-full object-contain" />
            )}
            {previewMedia.media_type === 'video' && (
              <video src={`/media/${previewMedia.filename}`} controls autoPlay className="max-w-full max-h-full" />
            )}
            {previewMedia.media_type === 'webpage' && (
              <iframe src={previewMedia.url} className="w-full h-full border-0 bg-white" title="Web page preview" />
            )}
            {previewMedia.media_type === 'html_snippet' && (
              <SnippetFrame html={previewMedia.content} />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

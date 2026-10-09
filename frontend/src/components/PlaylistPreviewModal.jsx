import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, X } from 'lucide-react';
import { mediaTypeLabel, SnippetFrame } from './ui';

export function PlaylistPreviewModal({ isOpen, onClose, playlist }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const items = playlist?.items || [];
  const visible = isOpen && items.length > 0;
  const currentItem = items[currentIndex] || items[0];

  useEffect(() => {
    if (!visible) {
      setCurrentIndex(0);
      setIsPlaying(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !isPlaying || !currentItem) return;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, (currentItem.duration_seconds || 10) * 1000);
    return () => clearTimeout(timer);
  }, [visible, currentIndex, isPlaying, items.length, currentItem]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % items.length);
  const prevSlide = () => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={`Preview of ${playlist.name}`}>
      <div className="flex items-center justify-between gap-4 px-5 h-14 border-b border-line bg-surface">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">{playlist.name}</div>
          <div className="text-xs text-faint">Preview in this browser. Screens are not affected.</div>
        </div>
        <button onClick={onClose} className="btn-icon" aria-label="Close preview">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8">
        <div className="relative w-full max-w-6xl aspect-video max-h-full bg-black border border-line overflow-hidden">
          {currentItem.media_type === 'image' && (
            <img key={currentItem.id} src={currentItem.url} alt={currentItem.original_name} className="w-full h-full object-cover" />
          )}
          {currentItem.media_type === 'video' && (
            <video key={currentItem.id} src={currentItem.url} autoPlay muted playsInline className="w-full h-full object-cover" />
          )}
          {currentItem.media_type === 'html_snippet' && (
            <SnippetFrame key={currentItem.id} html={currentItem.html_content || currentItem.content} />
          )}
          {currentItem.media_type === 'webpage' && (
            <iframe src={currentItem.url} className="w-full h-full border-0 bg-white" title="Web page" />
          )}
        </div>
      </div>

      <div className="border-t border-line bg-surface px-5 py-3">
        <div className="flex gap-0.5 mb-3" aria-hidden="true">
          {items.map((item, idx) => (
            <button
              key={item.id || idx}
              onClick={() => setCurrentIndex(idx)}
              tabIndex={-1}
              className={`h-1.5 rounded-full transition-colors ${idx === currentIndex ? 'bg-ink' : idx < currentIndex ? 'bg-line-strong' : 'bg-raised hover:bg-line-strong'}`}
              style={{ flexGrow: Number(item.duration_seconds) || 1, flexBasis: 0 }}
              title={`${idx + 1}. ${item.original_name || 'Item'}`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <button onClick={prevSlide} className="btn-icon" aria-label="Previous item">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={() => setIsPlaying(!isPlaying)} className="btn btn-primary btn-sm w-24" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Play</>}
            </button>
            <button onClick={nextSlide} className="btn-icon" aria-label="Next item">
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm text-muted truncate text-right">
            <span className="text-ink">{currentIndex + 1} of {items.length}</span>
            <span className="ml-3">{currentItem.original_name || mediaTypeLabel(currentItem.media_type)}</span>
            <span className="ml-3 text-faint">{currentItem.duration_seconds}s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

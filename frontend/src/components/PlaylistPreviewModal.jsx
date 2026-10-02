import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, X, RefreshCw, Eye } from 'lucide-react';

export function PlaylistPreviewModal({ isOpen, onClose, playlist }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  if (!isOpen || !playlist || !playlist.items || playlist.items.length === 0) return null;

  const items = playlist.items;
  const currentItem = items[currentIndex] || items[0];

  useEffect(() => {
    if (!isPlaying) return;

    const duration = (currentItem.duration_seconds || 10) * 1000;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, duration);

    return () => clearTimeout(timer);
  }, [currentIndex, isPlaying, items.length, currentItem.duration_seconds]);

  const nextSlide = () => setCurrentIndex((prev) => (prev + 1) % items.length);
  const prevSlide = () => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Live Playlist Simulator: {playlist.name}</h3>
              <p className="text-xs text-slate-400">
                Slide {currentIndex + 1} of {items.length} &bull; Duration: {currentItem.duration_seconds}s &bull; Transition: {currentItem.transition || 'fade'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Display Screen Stage Simulator */}
        <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
          {currentItem.media_type === 'image' && (
            <img
              src={currentItem.url}
              alt={currentItem.original_name}
              className="w-full h-full object-cover animate-fade-in"
            />
          )}

          {currentItem.media_type === 'video' && (
            <video
              src={currentItem.url}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          {currentItem.media_type === 'html_snippet' && (
            <div
              className="w-full h-full overflow-hidden"
              dangerouslySetInnerHTML={{ __html: currentItem.html_content || '' }}
            />
          )}

          {currentItem.media_type === 'webpage' && (
            <iframe
              src={currentItem.url}
              className="w-full h-full border-0 bg-white"
              title="Preview Webpage"
            />
          )}

          {/* HUD Overlay simulator */}
          <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs font-mono font-bold text-slate-300">
            SIMULATED 1080p DISPLAY
          </div>
        </div>

        {/* Bottom Timeline Controls */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={prevSlide}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={nextSlide}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-md py-1">
            {items.map((item, idx) => (
              <button
                key={item.id || idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-2.5 rounded-full transition-all ${
                  currentIndex === idx ? 'w-8 bg-emerald-500' : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                }`}
                title={`Slide ${idx + 1}: ${item.original_name || 'Item'}`}
              />
            ))}
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Item ID: #{currentItem.id} ({currentItem.original_name})
          </div>
        </div>
      </div>
    </div>
  );
}

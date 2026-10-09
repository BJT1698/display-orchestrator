import React, { useEffect } from 'react';
import { X, Image as ImageIcon, Video, Globe, Code } from 'lucide-react';

export function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 mb-6 border-b border-line">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted max-w-[60ch]">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="panel px-6 py-14 text-center">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 text-sm text-muted max-w-[46ch] mx-auto">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ title, description, onClose, children, footer, width = 'max-w-lg', tone }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/70 overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} bg-surface border rounded-md my-8 ${tone === 'alert' ? 'border-alert' : 'border-line-strong'}`}
      >
        <div className={`flex items-start justify-between gap-4 px-6 pt-5 pb-4 ${tone === 'alert' ? 'border-t-4 border-alert rounded-t-md' : ''}`}>
          <div>
            <h2 className="text-xl font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-icon -mr-2" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-line bg-ground/40 rounded-b-md">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="mb-4 px-3 py-2.5 rounded border border-alert/50 bg-alert/10 text-sm text-ink">
      {children}
    </div>
  );
}

const TYPE_META = {
  image: { label: 'Image', Icon: ImageIcon },
  video: { label: 'Video', Icon: Video },
  webpage: { label: 'Web page', Icon: Globe },
  html_snippet: { label: 'HTML', Icon: Code },
};

export function mediaTypeLabel(type) {
  return TYPE_META[type]?.label || type;
}

export function MediaTypeIcon({ type, className = 'w-4 h-4' }) {
  const Icon = TYPE_META[type]?.Icon || ImageIcon;
  return <Icon className={className} />;
}

export function Tally({ status }) {
  const cls = status === 'online' ? 'tally-live' : status === 'warn' ? 'tally-caution' : status === 'error' ? 'tally-alert' : '';
  return <span className={`tally ${cls}`} aria-hidden="true" />;
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const days = Math.floor(h / 24);
  if (days > 0) return `${days}d ${h % 24}h`;
  return `${h}h ${m % 60}m`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Renders an HTML snippet like a screen does: isolated document, scripts allowed, no access to this page
export function SnippetFrame({ html, className = 'w-full h-full' }) {
  const doc = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}</style></head><body>' + (html || '') + '</body></html>';
  return <iframe srcDoc={doc} sandbox="allow-scripts" className={`${className} border-0 bg-black`} title="HTML snippet" />;
}

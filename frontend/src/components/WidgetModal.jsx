import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { mediaApi } from '../services/api';
import { WIDGETS, widgetByType, readWidget } from '../widgets';
import { searchPlaces } from '../widgets/weather';
import { imageToDataUrl } from '../widgets/announcement';
import { Modal, ErrorNote, SnippetFrame } from './ui';

// Create a widget (pick a type, fill the form, check the preview) or edit one already in the library
export function WidgetModal({ media, onClose, onSaved }) {
  const existing = media ? readWidget(media.content) : null;
  const [widget, setWidget] = useState(existing ? widgetByType(existing.type) : null);
  const [config, setConfig] = useState(existing || null);
  const [name, setName] = useState(media?.original_name || '');
  const [nameTouched, setNameTouched] = useState(Boolean(media));
  const [duration, setDuration] = useState(media?.duration_seconds || 15);
  const [portrait, setPortrait] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const choose = (w) => {
    setWidget(w);
    setConfig({ ...w.defaults });
    setName(w.defaultName(w.defaults));
    setNameTouched(false);
  };

  const set = (key, value) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      if (!nameTouched) setName(widget.defaultName(next));
      return next;
    });
  };

  // Re-render the snippet a moment after typing stops
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (!widget || !config) return undefined;
    const t = setTimeout(() => setHtml(widget.render(config)), 250);
    return () => clearTimeout(t);
  }, [widget, config]);

  const missing = widget?.fields.find((f) => f.required && !String(config?.[f.key] ?? '').trim());
  const ready = widget && !missing && (!widget.isReady || widget.isReady(config));

  const save = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const content = widget.render(config);
      const seconds = parseInt(duration, 10) || 15;
      if (media) {
        await mediaApi.update(media.id, { originalName: name, content, durationSeconds: seconds });
      } else {
        await mediaApi.createHtml(name, content, seconds);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!widget) {
    return (
      <Modal title="Add widget" description="Ready-made content that keeps itself up to date." onClose={onClose} width="max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {WIDGETS.map((w) => (
            <button
              key={w.type}
              type="button"
              onClick={() => choose(w)}
              className="text-left p-4 rounded border border-line hover:border-line-strong hover:bg-raised transition-colors"
            >
              <div className="text-sm font-medium text-ink">{w.label}</div>
              <div className="mt-1 text-xs text-muted">{w.description}</div>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={media ? `Edit ${widget.label.toLowerCase()}` : widget.label}
      description={widget.description}
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <>
          {!media && (
            <button type="button" onClick={() => setWidget(null)} className="btn btn-quiet mr-auto">
              <ArrowLeft className="w-4 h-4" /> Other widgets
            </button>
          )}
          <button type="button" onClick={onClose} className="btn btn-quiet">Cancel</button>
          <button type="submit" form="widget-form" disabled={!ready || busy} className="btn btn-primary">
            {busy ? 'Saving' : media ? 'Save changes' : 'Add to library'}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-6">
        <form id="widget-form" onSubmit={save} className="space-y-4">
          {widget.fields.map((field) => (
            <Field key={field.key} field={field} value={config[field.key]} config={config} onChange={set} onError={setError} />
          ))}
          <div className="grid grid-cols-[1fr_7rem] gap-3 pt-2 border-t border-line">
            <div>
              <label className="field-label" htmlFor="w-name">Name in the library</label>
              <input id="w-name" className="control" value={name} required
                onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
            </div>
            <div>
              <label className="field-label" htmlFor="w-dur">Seconds</label>
              <input id="w-dur" type="number" min="2" max="3600" className="control" value={duration}
                onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
        </form>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted">Preview</span>
            <div className="segmented" role="group" aria-label="Preview orientation">
              <button type="button" aria-pressed={!portrait} onClick={() => setPortrait(false)}>Landscape</button>
              <button type="button" aria-pressed={portrait} onClick={() => setPortrait(true)}>Portrait</button>
            </div>
          </div>
          <div className={`mx-auto bg-black border border-line rounded-sm overflow-hidden ${portrait ? 'aspect-[9/16] max-h-[60vh]' : 'aspect-video w-full'}`}>
            {ready ? (
              <SnippetFrame html={html} />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-faint px-6 text-center">
                {missing ? `Fill in "${missing.label}" to see the preview.` : 'Complete the form to see the preview.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ field, value, config, onChange, onError }) {
  const id = `wf-${field.key}`;
  const label = (
    <label className="field-label" htmlFor={id}>
      {field.label}{!field.required && field.type !== 'toggle' ? <span className="text-faint font-normal"> (optional)</span> : null}
    </label>
  );
  const hint = field.hint ? <p className="field-hint">{field.hint}</p> : null;

  switch (field.type) {
    case 'textarea':
      return <div>{label}<textarea id={id} rows={4} className="control" placeholder={field.placeholder} value={value || ''} onChange={(e) => onChange(field.key, e.target.value)} />{hint}</div>;
    case 'datetime':
      return <div>{label}<input id={id} type="datetime-local" className="control" value={value || ''} onChange={(e) => onChange(field.key, e.target.value)} />{hint}</div>;
    case 'toggle':
      return (
        <label className="flex items-center gap-3 text-sm text-ink cursor-pointer">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(field.key, e.target.checked)} className="w-4 h-4 accent-[#E6E8EB]" />
          {field.label}
        </label>
      );
    case 'select':
      return (
        <div>{label}
          <select id={id} className="control" value={value} onChange={(e) => onChange(field.key, e.target.value)}>
            {field.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>{hint}
        </div>
      );
    case 'image':
      return <ImageField id={id} label={label} hint={hint} value={value} onChange={(v) => onChange(field.key, v)} onError={onError} />;
    case 'place':
      return <PlaceField id={id} label={label} hint={hint} config={config} onChange={onChange} />;
    default:
      return <div>{label}<input id={id} type={field.type === 'url' ? 'url' : 'text'} className="control" placeholder={field.placeholder} value={value || ''} onChange={(e) => onChange(field.key, e.target.value)} />{hint}</div>;
  }
}

function ImageField({ id, label, hint, value, onChange, onError }) {
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      onChange(await imageToDataUrl(file));
    } catch (err) {
      onError(err.message);
    }
  };
  return (
    <div>
      {label}
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="" className="w-24 aspect-video object-cover rounded-sm border border-line" />
          <label className="btn btn-sm cursor-pointer">Replace<input id={id} type="file" accept="image/*" className="sr-only" onChange={pick} /></label>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => onChange('')}>Remove</button>
        </div>
      ) : (
        <label className="btn btn-sm cursor-pointer">Choose a picture<input id={id} type="file" accept="image/*" className="sr-only" onChange={pick} /></label>
      )}
      {hint}
    </div>
  );
}

function PlaceField({ id, label, hint, config, onChange }) {
  const [query, setQuery] = useState(config.place || '');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle');

  const search = async () => {
    if (!query.trim()) return;
    setState('searching');
    try {
      const found = await searchPlaces(query.trim());
      setResults(found);
      setState(found.length ? 'idle' : 'none');
    } catch {
      setState('error');
    }
  };

  const pick = (p) => {
    onChange('place', p.label);
    onChange('latitude', p.latitude);
    onChange('longitude', p.longitude);
    setQuery(p.label);
    setResults([]);
  };

  const chosen = useMemo(() => typeof config.latitude === 'number', [config.latitude]);

  return (
    <div>
      {label}
      <div className="flex gap-2">
        <input id={id} className="control" value={query} placeholder="Alba"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} />
        <button type="button" className="btn" onClick={search} disabled={state === 'searching'}>Search</button>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 border border-line rounded divide-y divide-line">
          {results.map((p) => (
            <li key={`${p.latitude},${p.longitude}`}>
              <button type="button" onClick={() => pick(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-raised">{p.label}</button>
            </li>
          ))}
        </ul>
      )}
      {state === 'none' && <p className="field-hint">No place found with that name.</p>}
      {state === 'error' && <p className="field-hint">Place search is not available right now.</p>}
      {chosen && !results.length && <p className="field-hint">{config.place} ({config.latitude}, {config.longitude})</p>}
      {!chosen && hint}
    </div>
  );
}

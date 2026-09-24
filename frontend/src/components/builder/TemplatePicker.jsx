/**
 * TemplatePicker.jsx — MAJA Dynamic Event Engine: invitation design picker (design assets).
 * ==========================================================================================
 *
 * The approved artwork IS the invitation — never rebuilt in HTML/CSS. This picker
 * mirrors the wedding template experience: a thumbnail grid + a premium preview that
 * keeps the artwork perfectly centered (the hero) over a blurred, expanded copy of the
 * SAME artwork as the surrounding background (per the design-assets brief). Config-
 * driven by the event type's template catalog — reused by every future event type.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, Check } from 'lucide-react';
import { EventService } from '../../services/eventApi';

export function TemplatePicker({ eventType, value, onChange }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    EventService.templates(eventType)
      .then((r) => { if (alive) { setTemplates(r.templates || []); setError(''); } })
      .catch(() => { if (alive) setError('Could not load the invitation designs.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [eventType]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-red-300/50 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4" /> {error}
      </p>
    );
  }

  const selected = templates.find((t) => t.template_id === value) || templates[0];

  return (
    <div className="space-y-4">
      {/* premium preview — centered artwork over a blurred copy of itself */}
      {selected && (
        <div className="relative overflow-hidden rounded-xl border bg-black/5" style={{ minHeight: '22rem' }}>
          <div
            aria-hidden="true"
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-60 blur-2xl"
            style={{ backgroundImage: `url(${selected.preview_url})` }}
          />
          <div className="relative flex items-center justify-center p-5">
            <img
              src={selected.preview_url}
              alt={`${selected.name} invitation design`}
              className="max-h-[70vh] w-auto rounded-lg object-contain shadow-2xl"
              style={{ aspectRatio: '941 / 1672' }}
            />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
            <p className="text-sm font-medium">{selected.name}</p>
            <p className="text-xs opacity-80">{selected.palette}</p>
          </div>
        </div>
      )}

      {/* thumbnail grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {templates.map((t) => {
          const active = t.template_id === value;
          return (
            <button
              key={t.template_id}
              type="button"
              onClick={() => onChange(t.template_id)}
              aria-pressed={active}
              title={t.name}
              className={`group relative overflow-hidden rounded-lg border-2 transition
                ${active ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-muted-foreground/30'}`}
            >
              <img src={t.thumbnail_url} alt={t.name} loading="lazy"
                   className="w-full object-cover" style={{ aspectRatio: '941 / 1672' }} />
              {active && (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TemplatePicker;

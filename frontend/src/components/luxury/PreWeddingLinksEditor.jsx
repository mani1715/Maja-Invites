import React from 'react';
import { Plus, Trash2, Film, Link as LinkIcon } from 'lucide-react';

/**
 * PreWeddingLinksEditor — reusable editor for Google Drive / YouTube / Vimeo
 * pre-wedding shoot links shown on the public invitation.
 *
 * Props:
 *   links: PreWeddingLink[]   // [{ id, label, url, kind }]   kind: 'video' | 'link' | 'auto'
 *   onChange: (links) => void
 */
const PreWeddingLinksEditor = ({ links = [], onChange }) => {
  const add = () => onChange([
    ...links,
    {
      id: `tmp-${Date.now()}`,
      label: 'Pre-wedding Video',
      url: '',
      kind: 'auto',
    },
  ]);

  const update = (i, k, v) => onChange(links.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  const remove = (i) => onChange(links.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3" data-testid="pre-wedding-links-editor">
      {links.length === 0 && (
        <div className="lux-glass p-5 text-center" style={{ borderStyle: 'dashed' }}>
          <Film className="w-6 h-6 mx-auto mb-2" style={{ color: 'rgba(255,248,220,0.62)' }} />
          <p className="text-xs" style={{ color: 'rgba(255,248,220,0.8)' }}>
            No pre-wedding media added yet. Paste a Google Drive / YouTube / Vimeo link below — it'll embed beautifully on the invitation.
          </p>
        </div>
      )}

      {links.map((l, i) => (
        <div key={l.id || i} className="lux-glass p-4" data-testid={`pre-wedding-link-row-${i}`}>
          <div className="flex items-center justify-between mb-3 gap-3">
            <span className="lux-eyebrow text-[10px] inline-flex items-center gap-2">
              {l.kind === 'link' ? <LinkIcon className="w-3 h-3" /> : <Film className="w-3 h-3" />}
              {l.kind === 'link' ? 'Link card' : 'Video'} {i + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-xs tracking-widest uppercase inline-flex items-center gap-1"
              style={{ color: '#FFB0A0' }}
              data-testid={`remove-pre-wedding-link-${i}`}
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>

          <div className="space-y-3">
            <Field label="Label">
              <Input
                value={l.label || ''}
                onChange={(v) => update(i, 'label', v)}
                placeholder="Pre-wedding Video"
                testid={`pre-wedding-label-${i}`}
              />
            </Field>
            <Field label="URL (Google Drive · YouTube · Vimeo)">
              <Input
                value={l.url || ''}
                onChange={(v) => update(i, 'url', v)}
                placeholder="https://drive.google.com/file/d/…/view"
                testid={`pre-wedding-url-${i}`}
              />
            </Field>
            <Field label="Display style">
              <Select
                value={l.kind || 'auto'}
                onChange={(v) => update(i, 'kind', v)}
                options={[
                  { value: 'auto',  label: 'Auto (detect from URL)' },
                  { value: 'video', label: 'Embed as video player' },
                  { value: 'link',  label: 'Show as link button only' },
                ]}
                testid={`pre-wedding-kind-${i}`}
              />
            </Field>
            <p className="text-[10px] italic" style={{ color: 'rgba(255,248,220,0.62)' }}>
              Tip: make the Drive file shareable as "Anyone with the link · Viewer" so guests can see it without signing in.
            </p>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="lux-btn lux-btn-ghost w-full justify-center inline-flex items-center gap-2"
        data-testid="add-pre-wedding-link"
      >
        <Plus className="w-3.5 h-3.5" /> Add Pre-wedding Link
      </button>
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.25em] uppercase mb-1.5" style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</span>
    {children}
  </label>
);
const baseInput = {
  width: '100%', padding: '0.7rem 0.95rem', background: 'rgba(255,248,220,0.04)', color: '#FFF8DC',
  border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none',
  caretColor: '#D4AF37', fontSize: '0.88rem',
};
const Input = ({ value, onChange, placeholder, testid }) => (
  <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={baseInput} data-testid={testid} />
);
const Select = ({ value, onChange, options, testid }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{ ...baseInput, cursor: 'pointer', appearance: 'none' }}
    data-testid={testid}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value} style={{ background: '#1A130B' }}>{o.label}</option>
    ))}
  </select>
);

export default PreWeddingLinksEditor;

import { useEffect, useState } from 'react';
import EventInvitationCard from './EventInvitationCard';
import * as api from '@/api/events';
import './eventCard.css';

// The visual design picker. The builder registry marks this field as type
// "template" precisely so it renders as artwork rather than a <select> — a
// dropdown of names is useless when the whole decision is what it looks like.
//
// Templates come from GET /api/events/templates/{event_type}, which returns
// {templates[], default}. A 404 there means the event module is switched off
// for this deployment, which is a normal state, not a failure.

export default function EventTemplatePicker({ eventType, value, onPick, disabled = false, preview = true }) {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    if (!eventType) { setLoading(false); return undefined; }
    setLoading(true);
    api.templates(eventType)
      .then(({ data }) => {
        if (dead) return;
        setTemplates(data?.templates || []);
        setError(null);
      })
      .catch((e) => {
        if (dead) return;
        // 404 = module off for this deployment. Empty, not broken.
        setTemplates([]);
        setError(e?.response?.status === 404
          ? null
          : e?.response?.data?.detail || 'Could not load the designs.');
      })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [eventType]);

  if (loading) return <div className="wmod-skel" style={{ height: 240 }} />;
  if (error) return <p className="wmod-error-body">{error}</p>;
  if (!templates || templates.length === 0) {
    return (
      <p className="wmod-hint">
        No approved designs are published for this event type yet.
      </p>
    );
  }

  const selected = templates.find((t) => t.template_id === value) || null;

  return (
    <>
      {preview && selected && (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 22 }}>
          <div style={{ width: 220, flex: '0 0 auto' }}>
            <EventInvitationCard template={selected} variant="preview" />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <p className="wmod-label" style={{ marginBottom: 4 }}>Currently selected</p>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{selected.name}</p>
            <p className="wmod-hint" style={{ margin: 0 }}>{selected.palette}</p>
            <p className="wmod-hint" style={{ marginTop: 12 }}>
              Your invitation wording is laid into the empty centre of this artwork.
              Fill in the invitation content and it appears here.
            </p>
          </div>
        </div>
      )}

      <div className="evc-grid">
        {templates.map((t) => {
          const on = t.template_id === value;
          return (
            <button
              key={t.template_id}
              type="button"
              className="evc-pick"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onPick(t.template_id)}
            >
              <EventInvitationCard template={t} variant="thumb" />
              <p className="evc-pick-name">{t.name}</p>
              <p className="evc-pick-palette">{t.palette}</p>
              {on && <span className="evc-pick-current">Selected</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

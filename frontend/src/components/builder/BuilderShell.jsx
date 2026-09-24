/**
 * BuilderShell.jsx — MAJA Dynamic Event Engine: the reusable Builder frame (Doc 06).
 * ==================================================================================
 *
 * Purpose
 *   The event-type-agnostic Builder UI. Doc 06 is explicit: "Builder components
 *   should never know the event type." Every piece here is driven by the registry
 *   config + the child-collection field metadata fetched from the backend — there
 *   is ZERO "Ganesh" anywhere. A future event type reuses this unchanged.
 *
 * Reuse (Doc 06 §Reusability): built entirely on the shared lux primitives in
 *   components/ui/* (Button, Card, Input, Label) — no GaneshButton, no GaneshCard.
 *
 * Exports the named components Doc 06 lists (BuilderSidebar, BuilderProgress,
 *   AutosaveIndicator, ValidationPanel, PublishPanel, NavigationButtons,
 *   DraftBanner, SectionStatus) plus the generic SectionForm + ChildCollectionManager.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, Circle, Loader2, Save, Send, Trash2, AlertCircle, Plus,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { childService, EventService } from '../../services/eventApi';
import { TemplatePicker } from './TemplatePicker';

// --------------------------------------------------------------------------- //
// field helpers (grounded input typing — no invented schema)
// --------------------------------------------------------------------------- //
export function inferInputType(field) {
  const f = String(field || '').toLowerCase();
  if (f.endsWith('_date') || f === 'date') return 'date';
  if (f.includes('time')) return 'time';
  if (f === 'phone' || f.endsWith('_phone')) return 'tel';
  if (f === 'email' || f.endsWith('_email')) return 'email';
  if (f.endsWith('_url') || f.includes('url') || f.includes('website')) return 'url';
  if (f.includes('color')) return 'color';
  if (f === 'amount' || f.includes('year') || f.includes('count')
      || f.includes('order') || f === 'width' || f === 'height') return 'number';
  return 'text';
}

export function humanize(field) {
  return String(field || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// initial values for a section, resolved from where its data lives (Spec 04):
// event root / a root object / a 1:1 child doc attached to the event by the API.
function initialValuesFor(section, event) {
  const store = section.store || 'event';
  const keys = (section.fields || []).map((f) => f.key);
  if (store === 'event') {
    const v = {};
    keys.forEach((k) => {
      v[k] = k === 'event_name' ? (event.title ?? '')
        : k === 'primary_language' ? (event.language ?? '')
          : (event[k] ?? '');
    });
    return v;
  }
  if (store.startsWith('root_obj:')) {
    return { ...(event[store.split(':')[1]] || {}) };
  }
  if (store.startsWith('one:')) {
    // the GET endpoint attaches the child doc under its collection name
    return { ...(event[store.split(':')[1]] || {}) };
  }
  return {};
}

// --------------------------------------------------------------------------- //
// small presentational components (Doc 06 named set)
// --------------------------------------------------------------------------- //
export function SectionStatus({ complete }) {
  return complete
    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    : <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

export function AutosaveIndicator({ status }) {
  const map = {
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'Saving…', cls: 'text-muted-foreground' },
    saved: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: 'Saved', cls: 'text-emerald-600' },
    error: { icon: <AlertCircle className="h-3.5 w-3.5" />, text: 'Save failed — retrying', cls: 'text-red-600' },
  };
  const s = map[status];
  if (!s) return null;
  return <span className={`inline-flex items-center gap-1.5 text-xs ${s.cls}`}>{s.icon}{s.text}</span>;
}

export function BuilderProgress({ completed, total }) {
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>Completion</span><span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BuilderSidebar({ sections, activeKey, statusMap, onSelect }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Builder sections">
      {sections.map((s) => {
        const active = s.key === activeKey;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s.key)}
            aria-current={active ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors
              ${active ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-muted text-foreground/80'}`}
          >
            <SectionStatus complete={statusMap[s.key] === 'complete'} />
            <span className="flex-1 truncate">{s.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function DraftBanner({ status }) {
  if (!['draft', 'incomplete'].includes(status)) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-2 text-sm text-amber-800">
      <AlertCircle className="h-4 w-4" />
      This event is a draft. Complete the required sections, then publish to go live.
    </div>
  );
}

export function ValidationPanel({ errors }) {
  if (!errors || !errors.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300/50 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> All required information is complete.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-300/50 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="mb-1 flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> Fix these before publishing:</p>
      <ul className="ml-6 list-disc space-y-0.5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
    </div>
  );
}

export function NavigationButtons({ index, total, onPrev, onNext }) {
  return (
    <div className="mt-6 flex justify-between">
      <Button variant="outline" size="sm" onClick={onPrev} disabled={index <= 0}>
        <ChevronLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <Button variant="outline" size="sm" onClick={onNext} disabled={index >= total - 1}>
        Next <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

export function PublishPanel({ errors, onPublish, publishing, result }) {
  const blocked = errors && errors.length > 0;
  return (
    <div className="space-y-4">
      <ValidationPanel errors={errors} />
      {result?.slug && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <p className="font-medium">Published 🎉</p>
          <p className="mt-1 text-muted-foreground">
            Public link: <span className="font-mono">{result.invitation_link}</span>
          </p>
          {typeof result.edit_count === 'number' && (
            <p className="mt-0.5 text-xs text-muted-foreground">Edits used: {result.edit_count}</p>
          )}
        </div>
      )}
      <Button onClick={onPublish} disabled={blocked || publishing} className="w-full">
        {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        {result?.slug ? 'Re-publish changes' : 'Publish invitation'}
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// generic section form (root / root_obj / one:* sections)
// --------------------------------------------------------------------------- //
function FieldControl({ field, value, onChange }) {
  const id = `fld-${field.key}`;
  const common = { id, value: value ?? '', onChange: (e) => onChange(e.target.value) };
  if (field.type === 'toggle') {
    const on = value === true || value === 'true';
    return (
      <button type="button" role="switch" aria-checked={on} id={id}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-primary' : 'bg-muted'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    );
  }
  if (field.type === 'multiselect') {
    const arr = Array.isArray(value) ? value : (value ? [value] : []);
    const toggle = (v) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    return (
      <div className="flex flex-wrap gap-2">
        {(field.options || []).map((o) => {
          const sel = arr.includes(o.value);
          return (
            <button key={o.value} type="button" onClick={() => toggle(o.value)}
              className={`rounded-full border px-3 py-1 text-sm transition ${sel ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        {...common}
        rows={3}
        maxLength={field.max_length || undefined}
        placeholder={field.placeholder}
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    );
  }
  if (field.type === 'select') {
    return (
      <select
        {...common}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">Select…</option>
        {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (field.type === 'color') {
    return (
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#C6A15B'} onChange={(e) => onChange(e.target.value)}
               aria-label={field.label}
               className="h-9 w-14 cursor-pointer rounded border border-input bg-transparent" />
        <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="#C6A15B" className="max-w-[8rem]" />
      </div>
    );
  }
  return (
    <Input {...common} type={field.type === 'number' ? 'number' : (field.type || 'text')}
           maxLength={field.max_length || undefined} placeholder={field.placeholder} />
  );
}

export function SectionForm({ section, event, onChange, eventType }) {
  const [values, setValues] = useState(() => initialValuesFor(section, event));
  useEffect(() => { setValues(initialValuesFor(section, event)); /* eslint-disable-next-line */ }, [section.key]);

  const fields = section.fields || [];
  const set = (key, val) => {
    const next = { ...values, [key]: val };
    setValues(next);
    onChange(section.key, next);
  };

  const [starterBusy, setStarterBusy] = useState(false);
  const insertStarter = async () => {
    setStarterBusy(true);
    try {
      const lang = (event.languages && event.languages.main_language) || 'en';
      const option = (event.about && event.about.story_option) || 'devotional';
      const r = await EventService.starterContent(event.event_type || eventType, lang, option);
      const text = r.text || {};
      const next = { ...values };
      fields.forEach((f) => { if (text[f.key] != null && !next[f.key]) next[f.key] = text[f.key]; });
      setValues(next);
      onChange(section.key, next);
    } catch (_) { /* ignore */ } finally { setStarterBusy(false); }
  };

  if (!fields.length) {
    return <p className="text-sm text-muted-foreground">Nothing to fill in this section.</p>;
  }

  return (
    <div className="space-y-4">
      {section.translatable && (
        <button type="button" onClick={insertStarter} disabled={starterBusy}
          className="rounded-md border border-primary/40 px-3 py-1.5 text-xs text-primary hover:bg-primary/5">
          {starterBusy ? 'Adding…' : '✨ Use starter text (your language) — fills empty fields'}
        </button>
      )}
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`fld-${f.key}`}>
            {f.label}{f.required && <span className="text-red-500"> *</span>}
          </Label>
          {f.type === 'template' ? (
            <TemplatePicker eventType={eventType || event.event_type}
                            value={values[f.key]} onChange={(val) => set(f.key, val)} />
          ) : (
            <FieldControl field={f} value={values[f.key]} onChange={(val) => set(f.key, val)} />
          )}
          {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// generic child-collection manager (collection:* sections → Doc 05 child CRUD)
// --------------------------------------------------------------------------- //
export function ChildCollectionManager({ eventId, collectionName, meta }) {
  const svc = childService(collectionName);
  const fields = (meta && meta.fields) || [];
  const required = (meta && meta.required) || [];
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const res = await svc.list(eventId);
      setItems(res.items || []);
    } catch (e) {
      setError('Could not load items.');
    }
  }, [eventId, collectionName]); // eslint-disable-line

  useEffect(() => { reload(); }, [reload]);

  const canAdd = required.every((r) => String(draft[r] ?? '').trim() !== '' || draft[r] === 0);

  const add = async () => {
    setBusy(true); setError('');
    try {
      await svc.create(eventId, draft);
      setDraft({});
      await reload();
    } catch (e) {
      setError(e?.response?.data?.detail?.message || 'Could not add item.');
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    await svc.remove(eventId, id);
    await reload();
  };

  const move = async (i, dir) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    await svc.reorder(eventId, next.map((x) => x.id));
  };

  const summary = (it) => fields
    .filter((f) => it[f] !== undefined && it[f] !== null && it[f] !== '')
    .slice(0, 3)
    .map((f) => `${humanize(f)}: ${it[f]}`)
    .join('  ·  ');

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          No items yet. Add your first below.
        </p>
      )}
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <span className="flex-1 truncate">{summary(it) || it.id}</span>
            {meta && meta.orderable && (
              <>
                <button type="button" aria-label="Move up" onClick={() => move(i, -1)}
                  className="rounded px-1.5 text-muted-foreground hover:text-foreground">↑</button>
                <button type="button" aria-label="Move down" onClick={() => move(i, 1)}
                  className="rounded px-1.5 text-muted-foreground hover:text-foreground">↓</button>
              </>
            )}
            <button type="button" aria-label="Delete" onClick={() => remove(it.id)}
              className="rounded p-1 text-muted-foreground hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Add {humanize(collectionName).replace(/s$/, '')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((f) => (
            <div key={f} className="space-y-1.5">
              <Label htmlFor={`new-${f}`} className="text-xs">
                {humanize(f)}{required.includes(f) && <span className="text-red-500"> *</span>}
              </Label>
              <Input
                id={`new-${f}`}
                type={inferInputType(f)}
                value={draft[f] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
              />
            </div>
          ))}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button size="sm" onClick={add} disabled={!canAdd || busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Add
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// re-export for a stable barrel
export { Save };

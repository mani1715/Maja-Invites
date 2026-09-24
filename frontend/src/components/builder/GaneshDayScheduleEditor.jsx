/**
 * GaneshDayScheduleEditor.jsx — per-day festival editor (Ganesh v2 §2).
 * Replaces the generic child manager for `festival_schedule` so each day gets a rich
 * editor: label + date + special-day highlight + an ordered ritual list (time/title),
 * and a per-day photo upload (5 photos + 1 video, unlocked only after the day ends).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScheduleService, EventService } from '../../services/eventApi';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import ImageFrameAdjust from './ImageFrameAdjust';

const SPECIAL_KINDS = [
  { value: '', label: 'Normal day' },
  { value: 'festival', label: 'Festival / main day' },
  { value: 'annadanam', label: 'Annadanam day' },
  { value: 'last', label: 'Final day' },
];

function DayPhotos({ eventId, day }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(null); // a File awaiting crop (image only)
  const refresh = useCallback(() => {
    EventService.dayPhotoStatus(eventId, day).then(setStatus).catch(() => {});
  }, [eventId, day]);
  useEffect(() => { refresh(); }, [refresh]);

  const doUpload = async (file) => {
    setErr(''); setBusy(true);
    try {
      await EventService.uploadGalleryMedia(eventId, file, { festival_day: day });
      refresh();
    } catch (ex) {
      setErr(ex?.response?.data?.detail?.message || ex?.response?.data?.detail || 'Upload failed.');
    } finally { setBusy(false); }
  };

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    // images → crop/adjust first; videos → upload directly
    if (file.type && file.type.startsWith('image/')) setPending(file);
    else doUpload(file);
  };

  if (!status) return null;
  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-sm">
      {!status.unlocked ? (
        <p className="text-muted-foreground">📷 Photos unlock on <span className="font-medium">{status.unlocks_on}</span> (after the day).</p>
      ) : (
        <>
          <p className="mb-2 text-muted-foreground">
            📷 {status.photos_used}/{status.photos_limit} photos · 🎬 {status.videos_used}/{status.videos_limit} video (≤{status.video_max_mb}MB)
          </p>
          {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
            <input type="file" accept="image/*,video/*" onChange={onFile} disabled={busy} className="hidden" />
            {busy ? 'Uploading…' : 'Add a photo / video'}
          </label>
        </>
      )}
      {pending && (
        <ImageFrameAdjust
          file={pending}
          onCancel={() => setPending(null)}
          onConfirm={(cropped) => { setPending(null); doUpload(cropped); }}
        />
      )}
    </div>
  );
}

function DayCard({ eventId, day, onSaved, onDeleted }) {
  const [d, setD] = useState(day);
  const [items, setItems] = useState(day.items || []);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setD({ ...d, [k]: v });
  const setItem = (i, k, v) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems([...items, { time: '', title: '' }]);
  const rmItem = (i) => setItems(items.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    try {
      await ScheduleService.update(eventId, d.id, {
        day_label: d.day_label, date: d.date, is_special: !!d.is_special,
        special_kind: d.special_kind || '', special_note: d.special_note || '',
        items: items.filter((it) => it.title),
      });
      onSaved && onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className={`rounded-xl border p-4 ${d.is_special ? 'border-primary/50 bg-primary/5' : ''}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Day {d.festival_day}</p>
        <button onClick={() => onDeleted(d.id)} className="text-xs text-red-500 underline">Remove</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Label</Label>
          <Input value={d.day_label || ''} onChange={(e) => set('day_label', e.target.value)} placeholder="Sthapana Day" /></div>
        <div className="space-y-1"><Label>Date</Label>
          <Input type="date" value={d.date || ''} onChange={(e) => set('date', e.target.value)} /></div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input type="checkbox" checked={!!d.is_special} onChange={(e) => set('is_special', e.target.checked)} id={`sp-${d.id}`} />
        <Label htmlFor={`sp-${d.id}`}>Special day</Label>
        {d.is_special && (
          <select value={d.special_kind || ''} onChange={(e) => set('special_kind', e.target.value)}
            className="ml-2 rounded-md border bg-transparent px-2 py-1 text-sm">
            {SPECIAL_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        )}
      </div>
      {d.is_special && (
        <Input className="mt-2" value={d.special_note || ''} onChange={(e) => set('special_note', e.target.value)}
          placeholder="A note about why this day is special" />
      )}

      <div className="mt-3">
        <Label>Schedule</Label>
        <div className="mt-1 space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="w-28" value={it.time || ''} onChange={(e) => setItem(i, 'time', e.target.value)} placeholder="09:30 AM" />
              <Input value={it.title || ''} onChange={(e) => setItem(i, 'title', e.target.value)} placeholder="Ganapathi Puja" />
              <button onClick={() => rmItem(i)} className="text-xs text-red-500">✕</button>
            </div>
          ))}
          <button onClick={addItem} className="text-xs text-primary underline">+ Add a time slot</button>
        </div>
      </div>

      <DayPhotos eventId={eventId} day={d.festival_day} />

      <Button size="sm" className="mt-3" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save day'}</Button>
    </div>
  );
}

export default function GaneshDayScheduleEditor({ eventId }) {
  const [days, setDays] = useState([]);
  const load = useCallback(() => {
    ScheduleService.list(eventId, { sort: 'display_order', limit: 30 })
      .then((r) => setDays(r.items || [])).catch(() => {});
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const addDay = async () => {
    const next = (days.reduce((m, d) => Math.max(m, Number(d.festival_day) || 0), 0)) + 1;
    await ScheduleService.create(eventId, { festival_day: next, day_label: `Day ${next}`, display_order: next, items: [] });
    load();
  };
  const remove = async (id) => { await ScheduleService.remove(eventId, id); load(); };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Add each festival day. Photos for a day can be uploaded only after that day ends (5 photos + 1 video).</p>
      {days.map((d) => (
        <DayCard key={d.id} eventId={eventId} day={d} onSaved={load} onDeleted={remove} />
      ))}
      <Button variant="outline" onClick={addDay}>+ Add a day</Button>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel, Empty, InlineError } from '@/components/WeddingModule';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import * as api from '@/api/weddings';

// Post-wedding "Thank You" message (Memory Mode). Same note/video is shown to
// every guest on the public invitation URL once it goes live.
// server.py ~9484 (PUT) / ~9579 (GET) · models.py ThankYouMessage(Create|Response).
//
// IMPORTANT: `is_published` in the stored record is computed ONCE, at save
// time (`enabled AND (no scheduled_date OR now >= scheduled_date)`), and the
// public GET reuses that stale flag rather than recomputing it live. So a
// message scheduled for yesterday can still read is_published:false in the
// database until the studio opens this editor and saves again. We compute
// our own "effective" status from enabled + scheduled_date + now for display,
// so the studio isn't misled by a flag that hasn't caught up with the clock.

const MAX_CHARS = 1000;

function effectiveStatus(d, now) {
  if (!d) return null;
  if (!d.enabled) {
    const pastDue = d.scheduled_date && new Date(d.scheduled_date) <= now;
    return { kind: 'disabled', pastDue };
  }
  if (d.scheduled_date && new Date(d.scheduled_date) > now) {
    return { kind: 'scheduled' };
  }
  return { kind: 'live' };
}

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ThankYouEditor({ profileId, flash }) {
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [f, setF] = useState(null); // form state, ThankYouMessageCreate shape
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [fieldErr, setFieldErr] = useState({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const { data } = await api.getThankYou(profileId);
      if (data?.exists === false) {
        setF({ enabled: false, message_type: 'text', message_text: '', video_url: '', video_thumbnail: '', scheduled_date: null });
      } else {
        setF({
          enabled: !!data.enabled,
          message_type: data.message_type || 'text',
          message_text: data.message_text || '',
          video_url: data.video_url || '',
          video_thumbnail: data.video_thumbnail || '',
          scheduled_date: data.scheduled_date || null,
        });
      }
    } catch (e) {
      const s = e?.response?.status;
      // Feature not enabled for this wedding / not found — quiet empty state.
      if (s === 403 || s === 404) {
        setF({ enabled: false, message_type: 'text', message_text: '', video_url: '', video_thumbnail: '', scheduled_date: null, _unavailable: true });
      } else {
        setLoadErr(e?.response?.data?.detail || 'Could not load the thank-you message.');
      }
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const set = (patch) => { setF((p) => ({ ...p, ...patch })); setSaveErr(null); };

  const save = async (e) => {
    e.preventDefault();
    const fe = {};
    if (f.enabled && f.message_type === 'text' && !f.message_text.trim()) {
      fe.message_text = 'Write the message, or switch to video.';
    }
    if (f.message_text && f.message_text.length > MAX_CHARS) {
      fe.message_text = `Keep it under ${MAX_CHARS} characters.`;
    }
    setFieldErr(fe);
    if (Object.keys(fe).length) return;

    setSaving(true);
    setSaveErr(null);
    try {
      await api.saveThankYou(profileId, {
        enabled: f.enabled,
        message_type: f.message_type,
        message_text: f.message_text || null,
        video_url: f.video_url || null,
        video_thumbnail: f.video_thumbnail || null,
        scheduled_date: f.scheduled_date || null,
      });
      flash?.('Thank-you message saved.');
      await load();
    } catch (e2) {
      setSaveErr(e2?.response?.data?.detail || 'Could not save the thank-you message.');
    } finally {
      setSaving(false);
    }
  };

  const uploadVideo = async (file) => {
    if (!file) return;
    setUploading(true);
    setSaveErr(null);
    try {
      const { data } = await api.uploadThankYouVideo(profileId, file);
      set({ video_url: data.url, video_thumbnail: '' });
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || 'Could not upload that video.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) return <div className="wmod-skel" style={{ height: 280 }} />;
  if (loadErr) return <InlineError message={loadErr} />;
  if (f?._unavailable) {
    return (
      <Panel title="Thank-you message">
        <Empty title="Not available for this wedding" body="This feature isn't enabled here yet." />
      </Panel>
    );
  }

  const now = new Date();
  const status = effectiveStatus(f, now);
  const releaseText = f.scheduled_date
    ? new Date(f.scheduled_date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <Panel
      title="Thank-you message"
      sub="One note or video, shown to every guest on the same invitation link once it's released. Good for after the big day."
    >
      {status && (
        <div className={`wmod-pill wmod-pill--${status.kind === 'live' ? 'yes' : status.kind === 'scheduled' ? 'neutral' : 'no'}`} style={{ marginBottom: 16, display: 'inline-block' }}>
          {status.kind === 'live' && 'Live — guests can see this now'}
          {status.kind === 'scheduled' && `Scheduled — releases ${releaseText}`}
          {status.kind === 'disabled' && !status.pastDue && 'Disabled — not visible to guests'}
          {status.kind === 'disabled' && status.pastDue && `Disabled — release date (${releaseText}) has passed, but this is turned off so guests still can't see it`}
        </div>
      )}

      <form onSubmit={save}>
        <InlineError message={saveErr} />

        <label className="wmod-check" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={f.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Enable thank-you message
        </label>

        {f.enabled && (
          <>
            <div className="wmod-field" style={{ marginBottom: 16 }}>
              <span className="wmod-label">Message type</span>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <label className="wmod-check">
                  <input type="radio" name="ty-type" checked={f.message_type === 'text'} onChange={() => set({ message_type: 'text' })} />
                  Text
                </label>
                <label className="wmod-check">
                  <input type="radio" name="ty-type" checked={f.message_type === 'video'} onChange={() => set({ message_type: 'video' })} />
                  Video
                </label>
              </div>
            </div>

            {f.message_type === 'text' && (
              <div className="wmod-field" style={{ marginBottom: 16 }}>
                <label className="wmod-label" htmlFor="ty-text">Message</label>
                <textarea
                  id="ty-text"
                  data-mj-field
                  className="wmod-input"
                  rows={6}
                  maxLength={MAX_CHARS}
                  value={f.message_text}
                  onChange={(e) => set({ message_text: e.target.value })}
                  placeholder="Thank you so much for being part of our day…"
                />
                <p className="wmod-td-muted" style={{ fontSize: 12, marginTop: 4 }}>{f.message_text.length}/{MAX_CHARS} characters</p>
                {fieldErr.message_text && <p className="wmod-err">{fieldErr.message_text}</p>}
              </div>
            )}

            {f.message_type === 'video' && (
              <div className="wmod-field" style={{ marginBottom: 16 }}>
                <span className="wmod-label">Video</span>
                {f.video_url ? (
                  <div style={{ marginTop: 6 }}>
                    <video controls src={resolveMediaUrl(f.video_url)} style={{ width: '100%', maxWidth: 420, borderRadius: 12, display: 'block' }} />
                    <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ marginTop: 8 }} onClick={() => set({ video_url: '', video_thumbnail: '' })}>
                      Remove video
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    <label className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ cursor: uploading ? 'default' : 'pointer' }}>
                      {uploading ? 'Uploading…' : 'Upload video'}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
                        onChange={(e) => uploadVideo(e.target.files?.[0])}
                        disabled={uploading}
                      />
                    </label>
                    <p className="wmod-td-muted" style={{ fontSize: 12, marginTop: 4 }}>MP4, WebM or MOV, up to 200 MB.</p>
                  </div>
                )}
              </div>
            )}

            <div className="wmod-field" style={{ marginBottom: 16, maxWidth: 280 }}>
              <label className="wmod-label" htmlFor="ty-sched">Release date (optional)</label>
              <input
                id="ty-sched"
                data-mj-field
                className="wmod-input"
                type="datetime-local"
                value={toLocalInputValue(f.scheduled_date)}
                onChange={(e) => set({ scheduled_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
              <p className="wmod-td-muted" style={{ fontSize: 12, marginTop: 4 }}>Leave empty to go live as soon as you save.</p>
            </div>
          </>
        )}

        <button type="submit" className="wmod-btn wmod-btn--primary" disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Panel>
  );
}

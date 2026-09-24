import { useRef, useState } from 'react';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import * as api from '@/api/weddingGuests';

// Per-guest voice invitation: attach, play back, remove.
// guest_features.py: POST/DELETE /admin/profiles/{id}/guests/{guest_id}/voice
// — raw upload written to <token>.webm, 5MB hard cap (413), no server-side
// content-type check, so the client is the only gate. Playback is always
// user-initiated (a plain <audio controls>, no autoPlay).
const ACCEPT = 'audio/*';

export default function GuestVoiceNote({ profileId, guest, onChanged, flash }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const pick = (file) => {
    setErr(null);
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setErr('That is not an audio file.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (file.size > api.VOICE_MAX_BYTES) {
      setErr('Voice message is too large (max 5 MB).');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    upload(file);
  };

  const upload = async (file) => {
    setBusy(true);
    setErr(null);
    try {
      await api.uploadGuestVoice(profileId, guest.id, file);
      flash?.(`Voice invitation added for ${guest.name}.`);
      await onChanged();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not upload that voice message.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.deleteGuestVoice(profileId, guest.id);
      flash?.(`Voice invitation removed for ${guest.name}.`);
      await onChanged();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not remove that voice message.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (guest.voice_message_url) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
        <audio controls preload="none" style={{ height: 32, maxWidth: 220 }} src={resolveMediaUrl(guest.voice_message_url)} />
        {!confirming ? (
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setConfirming(true)} disabled={busy}>
            Remove
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="wmod-td-muted" style={{ fontSize: 12 }}>Remove this voice note?</span>
            <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" onClick={remove} disabled={busy}>
              {busy ? 'Removing…' : 'Yes, remove'}
            </button>
            <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        )}
        {err && <p className="wmod-err">{err}</p>}
      </div>
    );
  }

  return (
    <div style={{ minWidth: 160 }}>
      <label className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ cursor: busy ? 'default' : 'pointer' }}>
        {busy ? 'Uploading…' : '+ Voice note'}
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          onChange={(e) => pick(e.target.files?.[0])}
          disabled={busy}
        />
      </label>
      {err && <p className="wmod-err">{err}</p>}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import * as studioApi from '@/api/studio';

// Per-event camera SFTP transfer. The website only shows connection details and
// status here — the photos travel camera -> SFTP -> S3, never through the site.
// All numbers come from real backend state (polled), never faked.

const PURPLE = '#6d28d9';
const card = { background: '#fff', border: '1px solid #ece9f5', borderRadius: 16, padding: 18 };
const label = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8b8794', fontWeight: 600 };
const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13.5, color: '#1f2430', wordBreak: 'break-all' };
const input = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e3e0ee', fontSize: 14, marginBottom: 8, boxSizing: 'border-box' };

function Copyable({ value }) {
  const [done, setDone] = useState(false);
  if (value === undefined || value === null || value === '') return <span style={{ color: '#b6b2c0' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={mono}>{String(value)}</span>
      <button
        type="button"
        onClick={async () => { try { await navigator.clipboard.writeText(String(value)); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* noop */ } }}
        style={{ border: '1px solid #e3e0ee', background: '#faf9ff', color: PURPLE, borderRadius: 8, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
      >{done ? 'Copied' : 'Copy'}</button>
    </span>
  );
}

function Field({ name, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #f3f1fa' }}>
      <div style={label}>{name}</div>
      <div style={{ textAlign: 'right' }}><Copyable value={value} /></div>
    </div>
  );
}

function Stat({ n, label: l, tone }) {
  return (
    <div style={{ ...card, padding: 14, textAlign: 'center', flex: 1, minWidth: 92 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone || '#1f2430' }}>{n ?? 0}</div>
      <div style={{ ...label, marginTop: 4 }}>{l}</div>
    </div>
  );
}

export default function CameraUploadPanel({ profileId }) {
  const [status, setStatus] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [cameraKey, setCameraKey] = useState('sony_a7m4');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [oneTime, setOneTime] = useState(null); // { password, host, port, username, ... }
  const [custom, setCustom] = useState({ username: '', password: '' }); // optional chosen login
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await studioApi.cameraStatus(profileId);
      setStatus(data);
      const ck = data?.transfer?.camera_key;
      if (ck) setCameraKey(ck);
      setErr('');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not load camera status.');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    studioApi.cameraProfiles().then(({ data }) => setProfiles(data.profiles || [])).catch(() => {});
    load();
    pollRef.current = setInterval(load, 15000); // live status from real backend state
    return () => clearInterval(pollRef.current);
  }, [load]);

  const doEnable = async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await studioApi.cameraEnable(profileId, {
        cameraKey,
        username: custom.username.trim(),
        password: custom.password.trim(),
      });
      setOneTime(data.credentials);
      setCustom({ username: '', password: '' });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not save camera credentials.');
    } finally { setBusy(false); }
  };

  const doRotate = async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await studioApi.cameraRotate(profileId);
      setOneTime(data.credentials);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not rotate the password.');
    } finally { setBusy(false); }
  };

  const doDisable = async () => {
    if (!window.confirm('Disable camera transfer for this event? The camera will stop being able to upload until re-enabled.')) return;
    setBusy(true); setErr('');
    try { await studioApi.cameraDisable(profileId); setOneTime(null); await load(); }
    catch (e) { setErr(e?.response?.data?.detail || 'Could not disable.'); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{ padding: 20, color: '#8b8794' }}>Loading camera transfer…</div>;

  const enabled = !!status?.enabled;
  const conn = status?.connection || {};
  const prof = conn.camera_profile || {};
  const galleryEnabled = status?.gallery_enabled !== false;

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 20, color: '#1f2430' }}>Camera transfer (SFTP)</h3>
        <p style={{ margin: 0, color: '#6b6777', fontSize: 14, lineHeight: 1.55 }}>
          Send photos straight from a supported camera to this event. Photos go from the camera
          over a secure connection into the gallery and AI Face Match — they never pass through
          your phone or the website. First supported camera: <strong>Sony α7 IV</strong> (FTPES).
          Get the camera online first (Wi-Fi to a router/hotspot, USB tethering, or wired LAN).
        </p>
      </div>

      {err && <div style={{ ...card, borderColor: '#f3c2c2', background: '#fff5f5', color: '#a12' }}>{err}</div>}

      {!galleryEnabled && (
        <div style={{ ...card, borderColor: '#f0d9a6', background: '#fffbef', color: '#7a5a18' }}>
          Enable the <strong>photo gallery (AI Face Match)</strong> for this event first (Upload methods → enable),
          then enable camera transfer here.
        </div>
      )}

      {/* Connection status + stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...card, flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: status?.connected ? '#22c55e' : '#c9c6d3', boxShadow: status?.connected ? '0 0 0 4px rgba(34,197,94,.18)' : 'none' }} />
          <div>
            <div style={{ fontWeight: 700, color: '#1f2430' }}>{enabled ? (status?.connected ? 'Connected' : 'Enabled — idle') : 'Not enabled'}</div>
            <div style={{ fontSize: 12.5, color: '#8b8794' }}>
              {status?.last_photo_at ? `Last photo ${new Date(status.last_photo_at).toLocaleString()}` : 'No photos yet'}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat n={status?.received} label="Received" />
        <Stat n={status?.processing} label="Processing" tone="#b45309" />
        <Stat n={status?.indexed} label="Indexed" tone="#15803d" />
        <Stat n={status?.failed} label="Failed" tone={status?.failed ? '#b91c1c' : undefined} />
      </div>

      {/* One-time credentials (after enable/rotate) */}
      {oneTime && (
        <div style={{ ...card, borderColor: PURPLE, boxShadow: '0 12px 30px rgba(109,40,217,.14)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: PURPLE }}>Camera credentials — shown once</strong>
            <button type="button" onClick={() => setOneTime(null)} style={{ border: 'none', background: 'transparent', color: '#8b8794', cursor: 'pointer' }}>Hide</button>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#7a5a18', background: '#fffbef', border: '1px solid #f0d9a6', borderRadius: 10, padding: '8px 10px' }}>
            Save the <strong>password</strong> now — it is not shown again. If you lose it, use <em>Rotate password</em> to make a new one.
          </p>
          {oneTime.connection_code && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...label, marginBottom: 6 }}>SFTP connection code</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#0f1226', borderRadius: 10, padding: '10px 12px' }}>
                <span style={{ ...mono, color: '#c7d2fe', flex: 1 }}>{oneTime.connection_code}</span>
                <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(oneTime.connection_code); } catch { /* noop */ } }}
                  style={{ border: 'none', background: PURPLE, color: '#fff', borderRadius: 8, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>Copy</button>
              </div>
              <p style={{ fontSize: 11.5, color: '#8b8794', margin: '6px 0 0' }}>
                For clients that accept a single SFTP URL. Most cameras (incl. Sony α7 IV) need the separate fields below.
              </p>
            </div>
          )}
          <Field name="Host" value={oneTime.host} />
          <Field name="Port" value={oneTime.port} />
          <Field name="Username" value={oneTime.username} />
          <Field name="Password" value={oneTime.password} />
          <Field name="Remote directory" value={oneTime.remote_directory} />
          <Field name="Secure protocol" value={`${oneTime.secure_protocol_label || 'Secure'} — ON`} />
          {oneTime.host_key_fingerprint && <Field name="Host key fingerprint" value={oneTime.host_key_fingerprint} />}
          <Field name="Event storage prefix" value={oneTime.s3_prefix} />
          {oneTime.tls_note && <p style={{ fontSize: 12, color: '#7a5a18', margin: '8px 0 0' }}>{oneTime.tls_note}</p>}
        </div>
      )}

      {/* Setup / config */}
      {!enabled ? (
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Camera model</div>
          <select value={cameraKey} onChange={(e) => setCameraKey(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e3e0ee', fontSize: 14, marginBottom: 6 }}>
            {profiles.map((p) => (
              <option key={p.key} value={p.key}>{p.brand} — {p.model}{p.support_level !== 'supported' ? ` (${p.support_level})` : ''}</option>
            ))}
          </select>
          {prof?.notes && <p style={{ fontSize: 12.5, color: '#8b8794', margin: '6px 0 14px' }}>{prof.notes}</p>}
          <div style={{ ...label, marginBottom: 6 }}>Custom login (optional)</div>
          <input value={custom.username} onChange={(e) => setCustom((c) => ({ ...c, username: e.target.value }))}
            placeholder="Username — blank to auto-generate" autoComplete="off" style={input} />
          <input value={custom.password} onChange={(e) => setCustom((c) => ({ ...c, password: e.target.value }))}
            placeholder="Password — blank to auto-generate" autoComplete="off" style={input} />
          <p style={{ fontSize: 11.5, color: '#8b8794', margin: '0 0 14px' }}>
            Username must be unique across events (3–32 chars: letters, digits, . _ -). Password ≥ 6.
            Leave blank to auto-generate a strong one — a weak, guessable password on an internet-facing
            server is risky.
          </p>
          <button type="button" disabled={busy || !galleryEnabled} onClick={doEnable}
            style={{ background: galleryEnabled ? PURPLE : '#c9c6d3', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 20px', fontWeight: 600, fontSize: 14, cursor: galleryEnabled ? 'pointer' : 'not-allowed' }}>
            {busy ? 'Enabling…' : 'Enable camera transfer'}
          </button>
        </div>
      ) : (
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Enter these into your camera’s FTP/SFTP transfer settings</div>
          <p style={{ fontSize: 12.5, color: '#8b8794', margin: '0 0 10px' }}>
            These are the actual SFTP fields — the username is <em>not</em> a code you type into a MAJA screen.
          </p>
          <Field name="Host" value={conn.host} />
          <Field name="Port" value={conn.port} />
          <Field name="Username" value={conn.username} />
          <Field name="Password" value="•••••••• (rotate to reveal a new one)" />
          <Field name="Remote directory" value={conn.remote_directory} />
          <Field name="Secure protocol" value={`${conn.secure_protocol_label || 'Secure'} — ON`} />
          {conn.host_key_fingerprint && <Field name="Host key fingerprint" value={conn.host_key_fingerprint} />}
          {conn.tls_note && <p style={{ fontSize: 12, color: '#7a5a18', margin: '2px 0 8px' }}>{conn.tls_note}</p>}
          <Field name="Connection URL" value={conn.connection_uri} />
          <Field name="Event storage prefix" value={conn.s3_prefix} />
          <p style={{ fontSize: 11.5, color: '#8b8794', margin: '8px 0 0' }}>
            Photos from this camera sync only into this event’s S3 folder ({conn.s3_prefix}) — never any other event’s.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={doRotate}
              style={{ background: '#faf9ff', color: PURPLE, border: `1px solid ${PURPLE}`, borderRadius: 12, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}>
              {busy ? '…' : 'Rotate password'}
            </button>
            <button type="button" disabled={busy} onClick={doDisable}
              style={{ background: 'transparent', color: '#b91c1c', border: '1px solid #f3c2c2', borderRadius: 12, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}>
              Disable
            </button>
          </div>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #f3f1fa' }}>
            <div style={{ ...label, marginBottom: 6 }}>Change username / password</div>
            <input value={custom.username} onChange={(e) => setCustom((c) => ({ ...c, username: e.target.value }))}
              placeholder="New username (blank = keep current)" autoComplete="off" style={input} />
            <input value={custom.password} onChange={(e) => setCustom((c) => ({ ...c, password: e.target.value }))}
              placeholder="New password (blank = auto-generate)" autoComplete="off" style={input} />
            <button type="button" disabled={busy || (!custom.username.trim() && !custom.password.trim())} onClick={doEnable}
              style={{ background: PURPLE, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}>
              {busy ? 'Saving…' : 'Set login'}
            </button>
            <p style={{ fontSize: 11.5, color: '#8b8794', margin: '8px 0 0' }}>
              Username unique across events (3–32 chars: letters, digits, . _ -). Password ≥ 6.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

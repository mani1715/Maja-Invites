import { useCallback, useEffect, useRef, useState } from 'react';
import * as studioApi from '@/api/studio';
import { listAlbums } from '@/api/gallery';

// Per-event camera SFTP / FTPS transfer.
// Photos travel camera -> SFTP/FTPS -> S3 -> Gallery derivatives.
// All status information and transfer events reflect actual server state.

const PURPLE = '#6d28d9';
const card = { background: '#fff', border: '1px solid #ece9f5', borderRadius: 16, padding: 18 };
const label = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8b8794', fontWeight: 600 };
const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: '#1f2430', wordBreak: 'break-all' };
const input = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e3e0ee', fontSize: 14, marginBottom: 8, boxSizing: 'border-box' };

function Copyable({ value }) {
  const [done, setDone] = useState(false);
  if (value === undefined || value === null || value === '') return <span style={{ color: '#b6b2c0' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={mono}>{String(value)}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(String(value));
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          } catch { /* noop */ }
        }}
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

export default function CameraUploadPanel({ profileId, albums: initialAlbums = [], onAlbumCreated }) {
  const [status, setStatus] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [cameraKey, setCameraKey] = useState('sony_a7m4');
  const [albums, setAlbums] = useState(initialAlbums);
  const [targetAlbumId, setTargetAlbumId] = useState('');
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [albumUpdating, setAlbumUpdating] = useState(false);
  const [err, setErr] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [oneTime, setOneTime] = useState(null); // { password, host, port, username, ... }
  const [custom, setCustom] = useState({ username: '', password: '' });
  const pollRef = useRef(null);

  // Sync albums from prop or fallback fetch
  useEffect(() => {
    if (initialAlbums && initialAlbums.length > 0) {
      setAlbums(initialAlbums);
    } else if (profileId) {
      listAlbums(profileId)
        .then((res) => setAlbums(res.data?.albums || []))
        .catch(() => {});
    }
  }, [profileId, initialAlbums]);

  const load = useCallback(async () => {
    try {
      const [{ data: stData }, { data: evData }] = await Promise.all([
        studioApi.cameraStatus(profileId),
        studioApi.cameraEvents(profileId, 20).catch(() => ({ data: { events: [] } })),
      ]);
      setStatus(stData);
      setRecentEvents(evData.events || []);
      const ck = stData?.transfer?.camera_key;
      if (ck) setCameraKey(ck);
      if (stData?.target_album_id !== undefined) {
        setTargetAlbumId(stData.target_album_id || '');
      }
      setErr('');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not load camera transfer status.');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    studioApi.cameraProfiles().then(({ data }) => setProfiles(data.profiles || [])).catch(() => {});
    load();
    pollRef.current = setInterval(load, 12000); // Live status from actual backend state
    return () => clearInterval(pollRef.current);
  }, [load]);

  const doEnable = async () => {
    setBusy(true); setErr(''); setSuccessNotice('');
    try {
      const { data } = await studioApi.cameraEnable(profileId, {
        cameraKey,
        username: custom.username.trim(),
        password: custom.password.trim(),
        targetAlbumId: targetAlbumId || null,
      });
      setOneTime(data.credentials);
      setCustom({ username: '', password: '' });
      setSuccessNotice('Camera transfer credentials successfully generated.');
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not save camera credentials.');
    } finally { setBusy(false); }
  };

  const doRotate = async () => {
    setBusy(true); setErr(''); setSuccessNotice('');
    try {
      const { data } = await studioApi.cameraRotate(profileId);
      setOneTime(data.credentials);
      setSuccessNotice('Password rotated. Please enter the new password into your camera.');
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not rotate the password.');
    } finally { setBusy(false); }
  };

  const doDisable = async () => {
    if (!window.confirm('Disable camera transfer for this gallery? In-flight and new camera uploads will be rejected immediately.')) return;
    setBusy(true); setErr(''); setSuccessNotice('');
    try {
      await studioApi.cameraDisable(profileId);
      setOneTime(null);
      setSuccessNotice('Camera transfer disabled.');
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not disable camera transfer.');
    } finally { setBusy(false); }
  };

  const handleAlbumChange = async (newAlbumId) => {
    setTargetAlbumId(newAlbumId);
    if (!status?.enabled) return;
    setAlbumUpdating(true);
    setErr('');
    try {
      await studioApi.cameraUpdateAlbum(profileId, newAlbumId || null);
      setSuccessNotice(
        newAlbumId
          ? `Destination updated: incoming photos will route to "${albums.find((a) => a.id === newAlbumId)?.name || 'selected album'}".`
          : 'Destination updated: incoming photos will route to "All Photos" root.'
      );
      setTimeout(() => setSuccessNotice(''), 4000);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not update target album.');
    } finally {
      setAlbumUpdating(false);
    }
  };

  if (loading) return <div style={{ padding: 24, color: '#8b8794' }}>Loading camera transfer…</div>;

  const enabled = !!status?.enabled;
  const conn = status?.connection || {};
  const prof = conn.camera_profile || {};
  const galleryEnabled = status?.gallery_enabled !== false;

  // Determine real server connection & transfer state
  let stateLabel = 'Disabled';
  let stateTone = '#64748b';
  let stateBg = '#f1f5f9';
  let isPulsing = false;

  if (status?.transfer?.status === 'revoked') {
    stateLabel = 'Revoked by Admin';
    stateTone = '#b91c1c';
    stateBg = '#fee2e2';
  } else if (!enabled) {
    stateLabel = 'Disabled';
    stateTone = '#64748b';
    stateBg = '#f1f5f9';
  } else if (status?.processing > 0) {
    stateLabel = 'Processing Photos…';
    stateTone = '#b45309';
    stateBg = '#fef3c7';
    isPulsing = true;
  } else if (status?.last_photo_at && (Date.now() - new Date(status.last_photo_at).getTime()) < 60000) {
    stateLabel = 'Receiving Photos';
    stateTone = '#15803d';
    stateBg = '#dcfce7';
    isPulsing = true;
  } else if (status?.connected) {
    stateLabel = 'Authenticated & Ready';
    stateTone = '#15803d';
    stateBg = '#dcfce7';
  } else if (status?.last_seen_at) {
    stateLabel = 'Awaiting Next Shot (Idle)';
    stateTone = '#4338ca';
    stateBg = '#e0e7ff';
  } else {
    stateLabel = 'Configured — Awaiting Connection';
    stateTone = '#6d28d9';
    stateBg = '#ede9fe';
  }

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 840 }}>
      {/* 1. Header & Guidance */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20, color: '#1f2430', fontFamily: 'serif' }}>Live Camera Transfer (FTP / SFTP)</h3>
            <p style={{ margin: 0, color: '#6b6777', fontSize: 13.5, lineHeight: 1.5 }}>
              Stream photographs directly from your camera over Wi-Fi or mobile hotspot into this gallery.
            </p>
          </div>
          <span
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: 600,
              color: stateTone,
              background: stateBg,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              border: `1px solid ${stateTone}33`,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: stateTone,
                boxShadow: isPulsing ? `0 0 0 4px ${stateTone}44` : 'none',
              }}
            />
            {stateLabel}
          </span>
        </div>
      </div>

      {/* 2. Format Notice & Firmware Guidance */}
      <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 12, padding: '12px 16px', color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
        <strong>Important Camera Setting:</strong> Configure your camera to transfer <strong>JPEG</strong> files.
        You may keep RAW files on the camera memory card while transferring JPEGs, if your camera supports dual slot or JPEG transfer.
        Raw camera formats (.ARW, .CR3, .NEF) are refused at ingestion to preserve processing speed and face indexing.
      </div>

      {err && <div style={{ ...card, borderColor: '#fca5a5', background: '#fef2f2', color: '#b91c1c' }}>{err}</div>}
      {successNotice && <div style={{ ...card, borderColor: '#86efac', background: '#f0fdf4', color: '#166534' }}>{successNotice}</div>}

      {!galleryEnabled && (
        <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb', color: '#92400e' }}>
          Please ensure gallery features are enabled for this profile before initiating camera transfers.
        </div>
      )}

      {/* 3. Live Metrics Grid */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Stat n={status?.received} label="Received" />
        <Stat n={status?.processing} label="Processing" tone="#b45309" />
        <Stat n={status?.indexed} label="Ready / Indexed" tone="#15803d" />
        <Stat n={status?.failed} label="Failed / Rejected" tone={status?.failed ? '#b91c1c' : undefined} />
      </div>

      {/* 4. Destination Album Selector */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={label}>Destination Album</div>
          {albumUpdating && <span style={{ fontSize: 12, color: PURPLE }}>Updating destination…</span>}
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#64748b' }}>
          Select which album incoming camera photos should land in. Changing this snapshots the destination for all subsequent uploads without moving in-flight files.
        </p>
        <select
          value={targetAlbumId}
          onChange={(e) => handleAlbumChange(e.target.value)}
          disabled={busy || albumUpdating}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, background: '#fff' }}
        >
          <option value="">All Photos (Root / Unassigned)</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.photo_count || 0} photos)
            </option>
          ))}
        </select>
        {status?.target_album_name && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: '#15803d' }}>
            Current target: <strong>{status.target_album_name}</strong>
          </div>
        )}
      </div>

      {/* 5. One-time credentials display (shown immediately after enable or rotate) */}
      {oneTime && (
        <div style={{ ...card, borderColor: PURPLE, boxShadow: '0 12px 30px rgba(109,40,217,.12)', background: '#faf9ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ color: PURPLE, fontSize: 15 }}>Camera Connection Settings — Password Shown Once</strong>
            <button type="button" onClick={() => setOneTime(null)} style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>✕ Hide</button>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 10, padding: '8px 12px' }}>
            Copy and store the <strong>password</strong> now. For security, it is never stored in plaintext on our servers and cannot be retrieved again. Use <em>Rotate password</em> if misplaced.
          </p>

          <Field name="Protocol / Secure" value={`${oneTime.secure_protocol_label || oneTime.protocol?.toUpperCase()} (Encrypted TLS/SSH)`} />
          <Field name="Server Host" value={oneTime.host} />
          <Field name="Port" value={oneTime.port} />
          <Field name="Username" value={oneTime.username} />
          <Field name="Password" value={oneTime.password} />
          <Field name="Remote Directory" value={oneTime.remote_directory || '/'} />
          {oneTime.target_album_name && <Field name="Target Album" value={oneTime.target_album_name} />}
          {oneTime.host_key_fingerprint && <Field name="SSH Host Key Fingerprint" value={oneTime.host_key_fingerprint} />}
          {oneTime.tls_note && <p style={{ fontSize: 12, color: '#7a5a18', margin: '8px 0 0' }}>{oneTime.tls_note}</p>}
        </div>
      )}

      {/* 6. Settings & Credentials Panel */}
      {!enabled ? (
        <div style={card}>
          <div style={{ ...label, marginBottom: 8 }}>Camera Model / Protocol Profile</div>
          <select
            value={cameraKey}
            onChange={(e) => setCameraKey(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e3e0ee', fontSize: 14, marginBottom: 8, background: '#fff' }}
          >
            {profiles.map((p) => (
              <option key={p.key} value={p.key}>
                {p.brand} — {p.model} ({p.protocol === 'ftps' ? 'FTPS / Explicit TLS' : 'SFTP'})
              </option>
            ))}
          </select>
          {prof?.notes && <p style={{ fontSize: 12.5, color: '#64748b', margin: '4px 0 14px' }}>{prof.notes}</p>}

          <div style={{ ...label, marginBottom: 6 }}>Custom Login (Optional)</div>
          <input
            value={custom.username}
            onChange={(e) => setCustom((c) => ({ ...c, username: e.target.value }))}
            placeholder="Username — leave blank to auto-generate"
            autoComplete="off"
            style={input}
          />
          <input
            value={custom.password}
            onChange={(e) => setCustom((c) => ({ ...c, password: e.target.value }))}
            placeholder="Password — leave blank to auto-generate"
            autoComplete="off"
            style={input}
          />
          <p style={{ fontSize: 11.5, color: '#8b8794', margin: '0 0 16px' }}>
            Username must be unique across all events (3–32 chars). Leave blank to auto-generate a secure random login.
          </p>

          <button
            type="button"
            disabled={busy || !galleryEnabled}
            onClick={doEnable}
            style={{
              background: galleryEnabled ? PURPLE : '#c9c6d3',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '12px 22px',
              fontWeight: 600,
              fontSize: 14,
              cursor: galleryEnabled ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Enabling…' : 'Enable Camera Transfer'}
          </button>
        </div>
      ) : (
        <div style={card}>
          <div style={{ ...label, marginBottom: 10 }}>Camera Network Settings</div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>
            Enter these connection parameters into your camera’s FTP or SFTP profile menu:
          </p>
          <Field name="Protocol" value={`${conn.secure_protocol_label || 'Secure Transfer'} — ON`} />
          <Field name="Server Host" value={conn.host} />
          <Field name="Port" value={conn.port} />
          <Field name="Username" value={conn.username} />
          <Field name="Password" value="•••••••• (Use Rotate Password to generate a new key)" />
          <Field name="Remote Directory" value={conn.remote_directory || '/'} />
          {conn.target_album_name && <Field name="Target Album" value={conn.target_album_name} />}
          {conn.host_key_fingerprint && <Field name="SSH Fingerprint" value={conn.host_key_fingerprint} />}
          {conn.tls_note && <p style={{ fontSize: 12, color: '#7a5a18', margin: '4px 0 8px' }}>{conn.tls_note}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={busy}
              onClick={doRotate}
              style={{ background: '#faf9ff', color: PURPLE, border: `1px solid ${PURPLE}`, borderRadius: 10, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}
            >
              {busy ? '…' : 'Rotate Password'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={doDisable}
              style={{ background: 'transparent', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 10, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}
            >
              Disable Transfer
            </button>
          </div>
        </div>
      )}

      {/* 7. Recent Transfers & Actionable Errors Log */}
      <div style={card}>
        <div style={{ ...label, marginBottom: 10 }}>Recent Camera Uploads & Audit Trail</div>
        {recentEvents.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
            No recent uploads recorded for this camera connection.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '8px 6px' }}>Time</th>
                  <th style={{ padding: '8px 6px' }}>File</th>
                  <th style={{ padding: '8px 6px' }}>Size</th>
                  <th style={{ padding: '8px 6px' }}>Result</th>
                  <th style={{ padding: '8px 6px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((ev) => {
                  const isStored = ev.result === 'stored';
                  const isDup = ev.result === 'duplicate';
                  const isRej = ev.result === 'rejected';
                  return (
                    <tr key={ev.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 6px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td style={{ padding: '8px 6px', fontWeight: 500, color: '#1e293b' }}>{ev.filename}</td>
                      <td style={{ padding: '8px 6px', color: '#64748b' }}>
                        {ev.bytes ? `${(ev.bytes / 1024).toFixed(0)} KB` : '—'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: isStored ? '#dcfce7' : isDup ? '#e0e7ff' : '#fee2e2',
                            color: isStored ? '#15803d' : isDup ? '#4338ca' : '#b91c1c',
                            textTransform: 'uppercase',
                          }}
                        >
                          {ev.result}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px', color: isRej ? '#b91c1c' : '#64748b', fontSize: 12 }}>
                        {ev.reason || (isStored ? 'Photo stored and queued' : isDup ? 'Identical photo skipped' : '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

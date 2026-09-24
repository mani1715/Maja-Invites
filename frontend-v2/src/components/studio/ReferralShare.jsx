import { useCallback, useEffect, useState } from 'react';
import * as refs from '@/api/referrals';

// "Who found MAJA through this invitation" — the studio side of the referral
// system, which had a full backend (mint, redeem, abuse detection, stats,
// override) and no screen anywhere.
//
// It lives on the QR codes page on purpose. That page is already the one place
// a photographer goes to get shareable artifacts for a single wedding; a
// referral link is another one. The per-wedding rail is capped at 11 tabs by
// WeddingToolbar's own stated rule ("related screens fold into one tab"), and a
// twelfth for three numbers and a link would have broken it.
//
// It promises NOTHING. The credit payout that used to sit behind a completed
// referral is deleted, so the copy is about attribution — which is real — and
// never about a reward, which would not arrive.

export default function ReferralShare({ profileId, isPhone, onToast }) {
  const [data, setData] = useState(null);     // null = loading
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');
  const [acting, setActing] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      // POST, not GET: both return the same payload, but POST mints a code when
      // the wedding has none. A GET-only panel would show an empty box forever
      // on every invitation whose code had never been created.
      const { data: d } = await refs.ensureCode(profileId);
      setData(d);
    } catch (e) {
      setData(false);
      setError(e?.response?.status === 403
        ? 'This wedding belongs to another studio.'
        : e?.response?.data?.detail || 'Could not load the referral link.');
      return;
    }
    try {
      const { data: s } = await refs.stats(profileId);
      setRecent(s?.recent_referrals || []);
    } catch (_e) {
      // Stats are a bonus; the link is the point. Never fail the panel on them.
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (referralId, action) => {
    setActing(referralId);
    try {
      await refs.override(referralId, action,
        action === 'approve' ? 'Confirmed by the studio' : 'Rejected by the studio');
      await load();
      onToast?.(action === 'approve' ? 'Referral approved.' : 'Referral rejected.');
    } catch (e) {
      onToast?.(e?.response?.data?.detail || 'Could not update that referral.');
    } finally {
      setActing('');
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast?.(`Copied: ${text}`);
    } catch (_e) {
      onToast?.(text);
    }
  };

  if (data === null) {
    return (
      <div className="qrp-card" style={{ padding: '20px 24px', marginBottom: 26, opacity: .55 }}>
        <p style={{ fontSize: 13.5, color: '#6b7280', margin: 0 }}>Loading the referral link…</p>
      </div>
    );
  }

  if (data === false) {
    return (
      <div className="qrp-card" style={{ padding: '20px 24px', marginBottom: 26 }}>
        <h2 style={hStyle}>Referral <span style={{ color: '#6d28d9' }}>link</span></h2>
        <p style={{ fontSize: 13.5, color: '#dc2626', margin: 0 }}>{error}</p>
      </div>
    );
  }

  const url = data.referral_url || '';
  const short = data.referral_link_short || '';
  // Labels match what the server actually counts: these are counts of the
  // referral ROWS by `status`, not of people. Calling the first one "Shared
  // with" implied a number of guests, which is not what it is.
  const kpis = [
    ['Codes issued', data.total_referrals],
    ['Signed up', data.completed_referrals],
    ['Still open', data.pending_referrals],
  ];

  return (
    <div data-reveal className="qrp-card" style={{ padding: '20px 24px', marginBottom: 26 }}>
      <h2 style={hStyle}>Referral <span style={{ color: '#6d28d9' }}>link</span></h2>
      <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 16px', lineHeight: 1.7, maxWidth: 620 }}>
        Guests who see this invitation and want one of their own can enter this
        code. It records that they came from your work. There is no payout
        attached to it — it is attribution, so you can show where your bookings
        came from.
      </p>

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 14, background: '#f5f3ff',
        border: '1px solid #ddd6fe', marginBottom: 16,
      }}
      >
        <code style={{
          fontSize: isPhone ? 18 : 20, letterSpacing: '.12em', fontWeight: 700,
          color: '#4c1d95', fontFamily: "'Inter',system-ui,sans-serif",
        }}
        >
          {data.referral_code}
        </code>
        <button className="qrp-btn-ghost" onClick={() => copy(data.referral_code)} style={btnStyle}>
          Copy code
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        {[['Invitation link', url], ['Short link', short]].filter(([, v]) => v).map(([label, v]) => (
          <div key={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, minWidth: 116 }}>
              {label}
            </span>
            <span style={{ fontSize: 12.5, color: '#4b5563', wordBreak: 'break-all', flex: '1 1 240px' }}>{v}</span>
            <button className="qrp-btn-ghost" onClick={() => copy(v)} style={btnStyle}>Copy</button>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12, marginBottom: recent.length ? 18 : 0 }}>
        {kpis.map(([label, value]) => (
          <div key={label} style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: '14px 16px' }}>
            <p style={{ fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 600, margin: '0 0 8px' }}>{label}</p>
            <p style={{ fontFamily: "'Spectral',serif", fontSize: 24, margin: 0, lineHeight: 1 }}>{value ?? 0}</p>
          </div>
        ))}
      </div>

      {recent.length > 0 && (
        <div>
          <p style={{ fontSize: 11.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 600, margin: '0 0 8px' }}>
            Recent
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {recent.slice(0, 8).map((r) => (
              <li
                key={r.referral_id || r.id}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: '#4b5563', borderBottom: '1px solid #f3f4f6', paddingBottom: 6 }}
              >
                <span style={{ fontFamily: 'ui-monospace,monospace' }}>{r.referral_code}</span>
                <span style={{ color: r.status === 'completed' ? '#059669' : r.status === 'cancelled' ? '#dc2626' : '#6b7280' }}>
                  {r.status === 'completed' ? 'signed up'
                    : r.status === 'cancelled' ? 'cancelled' : 'not used yet'}
                </span>
                <span>{fmtDate(r.completed_at || r.created_at)}</span>
                {/* The abuse check (same IP or device within 24h) can hold a
                    genuine signup at "pending". These two buttons are the only
                    way to resolve that; the endpoint existed with no caller. */}
                {r.status === 'pending' && r.referred_profile_id && (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="qrp-btn-ghost" disabled={acting === r.referral_id}
                      onClick={() => decide(r.referral_id, 'approve')} style={miniBtn}>Approve</button>
                    <button className="qrp-btn-ghost" disabled={acting === r.referral_id}
                      onClick={() => decide(r.referral_id, 'reject')} style={miniBtn}>Reject</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const hStyle = {
  fontFamily: "'Spectral',serif", fontWeight: 500,
  fontSize: 'clamp(18px,2.4vw,22px)', margin: '0 0 4px',
};
const btnStyle = {
  minHeight: 40, padding: '0 14px', borderRadius: 12,
  fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
};
const miniBtn = { ...btnStyle, minHeight: 36, padding: '0 12px', fontSize: 12 };

// pg_adapter hands these back as ISO strings, not Date objects.
function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

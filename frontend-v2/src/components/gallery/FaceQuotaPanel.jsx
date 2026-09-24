import { useMemo } from 'react';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

// AI face-match photo quota for one wedding, and the indexing progress behind
// it. Every number here is rendered exactly as the server sent it
// (backend/face_quota.py) — the browser computes no allocation, no remainder
// and no price. `quota` is the /gallery/quota body; null while loading.
//
// The three metrics are deliberately NOT merged into one bar. Storage is bytes,
// face-match quota is a photo COUNT, and a photo can contain ten faces — they
// answer different questions and a studio that confuses them will buy the
// wrong thing.
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

const CELL = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 78 };
const LABEL = { fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' };
const VALUE = { fontFamily: "'Spectral',serif", fontSize: 20, lineHeight: 1.1, color: '#111827' };

function Metric({ label, value, tone }) {
  return (
    <div style={CELL}>
      <span style={LABEL}>{label}</span>
      <span style={{ ...VALUE, color: tone || VALUE.color }}>{value}</span>
    </div>
  );
}

export default function FaceQuotaPanel({ quota, isPhone }) {
  const idx = quota?.indexing;
  const low = useMemo(() => {
    if (!quota || quota.unlimited) return false;
    const alloc = Number(quota.allocated || 0);
    return alloc > 0 && Number(quota.remaining || 0) <= Math.max(25, alloc * 0.05);
  }, [quota]);

  if (!quota) {
    return (
      <div className="stgal-glass" style={{ borderRadius: 16, padding: 16, minHeight: 92 }}>
        <span className="stgal-skel" style={{ display: 'block', width: 160, height: 12, borderRadius: 6 }} />
      </div>
    );
  }

  return (
    <div
      className="stgal-glass"
      style={{ borderRadius: 16, padding: isPhone ? 14 : 18, display: 'flex',
               flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', color: '#4b5563' }}>
          AI face match &mdash; photo quota
        </h2>
        {low && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#b45309' }}>
            Running low
          </span>
        )}
      </div>

      {quota.unlimited ? (
        <p style={{ margin: 0, fontSize: 13, color: '#4b5563' }}>
          No photo cap on this event. {fmt(quota.used)} photo{quota.used === 1 ? '' : 's'} uploaded so far.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: isPhone ? 16 : 28, flexWrap: 'wrap' }}>
          <Metric label="Allocated" value={fmt(quota.allocated)} />
          <Metric label="Used" value={fmt(quota.used)} />
          {quota.reserved > 0 && (
            <Metric label="Reserved" value={fmt(quota.reserved)} tone="#6d28d9" />
          )}
          <Metric
            label="Remaining"
            value={fmt(quota.remaining)}
            tone={low ? '#b45309' : '#047857'}
          />
        </div>
      )}

      {idx && idx.total > 0 && (
        <div style={{ display: 'flex', gap: isPhone ? 16 : 28, flexWrap: 'wrap',
                      borderTop: '1px solid rgba(17,24,39,.07)', paddingTop: 12 }}>
          <Metric label="Indexed" value={fmt(idx.indexed)} />
          {idx.processing > 0 && <Metric label="Processing" value={fmt(idx.processing)} tone="#6d28d9" />}
          {idx.failed > 0 && <Metric label="Failed" value={fmt(idx.failed)} tone="#b91c1c" />}
          {idx.no_face > 0 && <Metric label="No face" value={fmt(idx.no_face)} tone="#6b7280" />}
        </div>
      )}
    </div>
  );
}

// Shown when a batch is refused. Renders the server's own breakdown and message
// verbatim, then the real top-up SKUs. There is no owner-approved "+500" or
// "+1000" photo SKU, so none is offered here — anything outside the priced
// tiers goes to a WhatsApp quote rather than a made-up number.
export function QuotaExceededNotice({ detail, onDismiss, isPhone }) {
  if (!detail) return null;
  const tiers = detail.extension?.tiers || [];
  const wa = buildWhatsAppUrl(
    `Hello, I need to extend the AI face-match photo quota for my event. I currently have ${detail.allocated} photos and need approximately ____ more. Please share the quotation.`,
  );

  return (
    <div
      role="alert"
      className="stgal-glass"
      style={{ borderRadius: 16, padding: isPhone ? 14 : 18, marginBottom: 20,
               background: 'rgba(180,83,9,.055)', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ fontSize: 13.5, color: '#92400e' }}>Not enough face-match quota</strong>
        {onDismiss && (
          <button type="button" onClick={onDismiss}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 18, lineHeight: 1, padding: 0 }}
                  aria-label="Dismiss">&times;</button>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{detail.message}</p>

      <div style={{ display: 'flex', gap: isPhone ? 14 : 24, flexWrap: 'wrap', fontSize: 12.5, color: '#4b5563' }}>
        <span>Allocated <strong>{fmt(detail.allocated)}</strong></span>
        <span>Used <strong>{fmt(detail.used)}</strong></span>
        {detail.reserved > 0 && <span>Reserved <strong>{fmt(detail.reserved)}</strong></span>}
        <span>Remaining <strong>{fmt(detail.remaining)}</strong></span>
        <span>Requested <strong>{fmt(detail.requested)}</strong></span>
        <span style={{ color: '#b91c1c' }}>Over by <strong>{fmt(detail.excess)}</strong></span>
      </div>

      {tiers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }}>
            Extend the quota
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tiers.map((t) => (
              <a
                key={t.key}
                href={buildWhatsAppUrl(
                  `Hello, I would like to buy the ${fmt(t.photos)}-photo Wave Face Match + QR pack (₹${fmt(t.price_inr)}). Please share the payment link.`)}
                target="_blank"
                rel="noreferrer"
                className="stgal-btn-outline"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 42,
                         padding: '0 14px', borderRadius: 12, fontSize: 12.5, fontWeight: 600,
                         textDecoration: 'none', color: '#4b5563' }}
              >
                {fmt(t.photos)} photos
                <span style={{ color: '#111827' }}>₹{fmt(t.price_inr)}</span>
              </a>
            ))}
            <a href={wa} target="_blank" rel="noreferrer" className="stgal-btn-outline"
               style={{ display: 'inline-flex', alignItems: 'center', minHeight: 42, padding: '0 14px',
                        borderRadius: 12, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', color: '#4b5563' }}>
              Custom quote
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

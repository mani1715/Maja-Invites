import { useMemo, useState } from 'react';

// HoneymoonFundSection — UPI deep-link + optional QR + optional progress bar.
// No section_enabled flag exists for this (it carries its own `enabled` on
// the HoneymoonFund object itself), so that is the only gate. No charge
// happens here — guests pay directly through any UPI app, same as shagun.
export default function HoneymoonFundSection({ fund, couple }) {
  const [copied, setCopied] = useState(false);

  const upiLink = useMemo(() => {
    if (!fund?.upi_id) return null;
    const params = new URLSearchParams({
      pa: fund.upi_id,
      pn: fund.payee_name || couple || 'Couple',
      cu: 'INR',
      tn: 'Honeymoon Fund',
    });
    return `upi://pay?${params.toString()}`;
  }, [fund, couple]);

  if (!fund?.enabled) return null;
  const hasUpi = !!fund.upi_id;
  const hasQr = !!fund.qr_image_url;
  if (!hasUpi && !hasQr) return null;

  const goal = parseInt(fund.goal_amount || 0, 10) || 0;
  const raised = parseInt(fund.raised_amount || 0, 10) || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  const copy = async () => {
    try { await navigator.clipboard.writeText(fund.upi_id); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (_e) { /* clipboard unavailable */ }
  };

  return (
    <section className="px-night gi-shagun-section">
      <div className="px-glass-d gi-shagun-card" data-reveal>
        <p className="gi-shagun-eyebrow">A gift for our new beginnings <span style={{ color: 'var(--mj-gold)' }}>&#10022;</span></p>
        <h2 className="gi-shagun-title">{fund.title || 'Honeymoon Fund'}</h2>
        {fund.message && <p className="gi-shagun-body">{fund.message}</p>}

        {fund.show_progress && goal > 0 && (
          <div className="gi-hmf-progress">
            <div className="gi-hmf-progress-labels">
              <span>&#8377;{raised.toLocaleString('en-IN')} raised</span>
              <span>Goal &#8377;{goal.toLocaleString('en-IN')}</span>
            </div>
            <div className="gi-hmf-progress-track">
              <div className="gi-hmf-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <div className="gi-hmf-row">
          {hasUpi && (
            <div className="gi-hmf-col">
              <p className="gi-hmf-upi-id">{fund.upi_id}</p>
              <div className="gi-amt-row" style={{ marginBottom: 0 }}>
                <button type="button" className="mj-btn-outline-d" onClick={copy}>{copied ? 'Copied' : 'Copy UPI'}</button>
                {upiLink && <a href={upiLink} className="mj-btn-primary">Open UPI app</a>}
              </div>
            </div>
          )}
          {hasQr && (
            <div className="gi-hmf-col gi-hmf-qr-col">
              <img src={fund.qr_image_url} alt="Honeymoon fund QR code" loading="lazy" decoding="async" className="gi-hmf-qr" />
              <p className="gi-hmf-qr-caption">Scan with any UPI app</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

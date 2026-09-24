import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plane, Copy, Check, ExternalLink, QrCode } from 'lucide-react';

/**
 * Phase 1H — Honeymoon Fund (simplified)
 * Renders only when `fund.enabled` is true. Shows the couple's UPI ID,
 * (optional) QR image, a "Pay via UPI" deep-link CTA, and an optional
 * progress bar if `show_progress` + `goal_amount` are set by the couple.
 *
 * No charge happens here — guests pay directly through any UPI app.
 */
const HoneymoonFundSection = ({ fund, couple }) => {
  const [copied, setCopied] = useState(false);

  // Build UPI deep-link (intent://upi/pay)
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
  const hasQr  = !!fund.qr_image_url;
  if (!hasUpi && !hasQr) return null;

  const goal = parseInt(fund.goal_amount || 0, 10) || 0;
  const raised = parseInt(fund.raised_amount || 0, 10) || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fund.upi_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) { /* ignore */ }
  };

  return (
    <section className="px-6 md:px-12 py-20 md:py-28 relative" data-testid="section-honeymoon-fund">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%', amount: 0.1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <span className="lux-eyebrow inline-flex items-center gap-2 mb-4">
            <Plane className="w-3.5 h-3.5" /> ◆ A gift for our new beginnings
          </span>
          <h2 className="font-display text-[2.2rem] md:text-[3.2rem] leading-tight" style={{ color: '#FFF8DC' }}>
            {fund.title || 'Honeymoon'} <span className="font-script italic text-gold">Fund</span>
          </h2>
          {fund.message && (
            <p className="mt-4 max-w-xl mx-auto text-sm md:text-base italic" style={{ color: 'rgba(255,248,220,0.72)' }}>
              {fund.message}
            </p>
          )}
        </motion.div>

        {/* Progress bar (only when couple opted in + has a goal) */}
        {fund.show_progress && goal > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ delay: 0.25 }}
            className="mt-8 max-w-md mx-auto"
            data-testid="honeymoon-progress"
          >
            <div className="flex items-end justify-between mb-2 text-xs tracking-[0.25em] uppercase" style={{ color: 'rgba(255,248,220,0.82)' }}>
              <span>₹{raised.toLocaleString('en-IN')} raised</span>
              <span>Goal ₹{goal.toLocaleString('en-IN')}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,248,220,0.12)' }}>
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${pct}%` }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className="h-full"
                style={{ background: 'linear-gradient(90deg, #8C6A1A 0%, #E8C766 60%, #D4AF37 100%)' }}
              />
            </div>
            <div className="text-center text-[10px] tracking-[0.3em] uppercase mt-2" style={{ color: '#D4AF37' }}>{pct}% of the way</div>
          </motion.div>
        )}

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* UPI card */}
          {hasUpi && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.7 }}
              className="lux-glass p-7 flex flex-col"
              data-testid="honeymoon-upi-card"
            >
              <div className="lux-eyebrow mb-3">◆ Pay via UPI</div>
              <div className="font-display text-2xl mb-4 break-all" style={{ color: '#FFF8DC' }} data-testid="honeymoon-upi-id">{fund.upi_id}</div>
              {fund.payee_name && (
                <div className="text-xs tracking-[0.2em] uppercase mb-5" style={{ color: 'rgba(255,248,220,0.78)' }}>Payee · {fund.payee_name}</div>
              )}
              <div className="mt-auto flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="lux-btn lux-btn-ghost text-xs"
                  data-testid="honeymoon-upi-copy"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy UPI'}
                </button>
                {upiLink && (
                  <a
                    href={upiLink}
                    className="lux-btn text-xs"
                    data-testid="honeymoon-upi-pay"
                  >
                    Open UPI app <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </motion.div>
          )}

          {/* QR card */}
          {hasQr && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.7 }}
              className="lux-glass p-7 flex flex-col items-center"
              data-testid="honeymoon-qr-card"
            >
              <div className="lux-eyebrow mb-3 inline-flex items-center gap-2"><QrCode className="w-3.5 h-3.5" /> ◆ Scan to bless</div>
              <div
                className="rounded-md p-3 max-w-full"
                style={{ background: '#FFF8DC' }}
              >
                <img
                  src={fund.qr_image_url}
                  alt="Honeymoon Fund QR"
                  loading="lazy"
                  decoding="async"
                  className="block w-[160px] h-[160px] sm:w-[180px] sm:h-[180px]"
                  style={{ objectFit: 'contain' }}
                  data-testid="honeymoon-qr-image"
                />
              </div>
              <div className="text-[10px] tracking-[0.3em] uppercase mt-4" style={{ color: 'rgba(255,248,220,0.78)' }}>Scan with any UPI app</div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
};

export default React.memo(HoneymoonFundSection);

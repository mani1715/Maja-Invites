import React from 'react';
import { motion } from 'framer-motion';

/**
 * FeatureFlagsPanel — luxe toggle list.
 *
 * Props:
 *   flags    — array of { key, label, description, enabled, locked? }
 *   onChange — (key, nextEnabled) => void
 */
const FeatureFlagsPanel = ({ flags = [], onChange }) => (
  <div className="space-y-3" data-testid="feature-flags-panel">
    {flags.map((f, i) => (
      <motion.div
        key={f.key}
        initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
        className="lux-glass p-5 flex items-start justify-between gap-5"
        data-testid={`feature-flag-${f.key}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className="font-heading text-base md:text-lg" style={{ color: '#FFF8DC' }}>{f.label}</h4>
            {f.locked && (
              <span className="text-[9px] tracking-[0.25em] uppercase px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37', border: '1px solid var(--lux-border-strong)' }}>
                {f.locked}
              </span>
            )}
          </div>
          {f.description && (
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,248,220,0.78)' }}>{f.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2 text-[10px] tracking-[0.25em] uppercase">
            {f.free ? (
              <span style={{ color: '#9DD89D' }}>● Free</span>
            ) : (
              <span style={{ color: '#D4AF37' }}>● {f.creditCost ?? 0} credit{(f.creditCost ?? 0) === 1 ? '' : 's'}</span>
            )}
          </div>
          {f.enabled && f.extra && (
            <div className="mt-3">{f.extra}</div>
          )}
        </div>

        <button
          role="switch"
          aria-checked={!!f.enabled}
          disabled={!!f.locked && f.locked !== 'PRO'}
          onClick={() => onChange?.(f.key, !f.enabled)}
          className="relative shrink-0 transition-colors"
          style={{
            width: 46, height: 26, borderRadius: 999,
            background: f.enabled ? '#D4AF37' : 'rgba(255,248,220,0.12)',
            border: '1px solid var(--lux-border)',
            opacity: f.locked ? 0.55 : 1,
            cursor: f.locked ? 'not-allowed' : 'pointer',
          }}
          data-testid={`flag-toggle-${f.key}`}
        >
          <motion.div
            animate={{ x: f.enabled ? 22 : 2 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="absolute top-[2px] w-[20px] h-[20px] rounded-full"
            style={{ background: f.enabled ? '#16110C' : '#FFF8DC' }}
          />
        </button>
      </motion.div>
    ))}
  </div>
);

export default FeatureFlagsPanel;

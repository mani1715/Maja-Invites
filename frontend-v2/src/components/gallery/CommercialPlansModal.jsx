import React, { useState, useEffect } from 'react';
import { getCommercialOptions } from '../../api/gallery';

export default function CommercialPlansModal({ isOpen, onClose, onSelectPlan, initialTab = 'all' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState('yearly');
  const [storageTier, setStorageTier] = useState('Starter');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    getCommercialOptions()
      .then((res) => {
        setOptions(res.data?.options || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load commercial plans');
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const cycleMultiplier = {
    monthly: { months: 1, discount: 0, label: 'Monthly' },
    quarterly: { months: 3, discount: 0.05, label: 'Quarterly (Save 5%)' },
    half_yearly: { months: 6, discount: 0.10, label: 'Half-Yearly (Save 10%)' },
    yearly: { months: 12, discount: 0.15, label: 'Yearly (Save 15%)' },
  }[selectedCycle] || { months: 12, discount: 0.15, label: 'Yearly' };

  const getPriceDisplay = (opt) => {
    const plans = opt.plans || [];
    let plan = plans.find((p) => p.tier === storageTier) || plans[0];
    if (!plan) return { price: 'Contact Us', period: '' };

    const cycleData = plan.cycles?.[selectedCycle];
    if (cycleData?.total_inr) {
      return {
        price: `₹${Number(cycleData.total_inr).toLocaleString('en-IN')}`,
        period: `/${selectedCycle === 'yearly' ? 'year' : selectedCycle}`,
        effectiveMonthly: `₹${Math.round(cycleData.total_inr / cycleMultiplier.months).toLocaleString('en-IN')}/mo`,
      };
    }
    if (plan.base_monthly) {
      const discounted = Math.round(plan.base_monthly * (1 - cycleMultiplier.discount));
      const total = discounted * cycleMultiplier.months;
      return {
        price: `₹${Number(total).toLocaleString('en-IN')}`,
        period: `/${selectedCycle === 'yearly' ? 'year' : selectedCycle}`,
        effectiveMonthly: `₹${discounted.toLocaleString('en-IN')}/mo`,
      };
    }
    return { price: '₹9,999', period: '/year', effectiveMonthly: '₹833/mo' };
  };

  return (
    <div className="wmod-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="wmod-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 960, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="wmod-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontFamily: 'serif' }}>Studio Commercial Plans</h2>
            <p style={{ margin: '4px 0 0', color: '#666', fontSize: '0.9rem' }}>
              Select standalone invitation access, high-capacity client gallery storage, or our combined suite.
            </p>
          </div>
          <button
            type="button"
            className="wmod-btn wmod-btn--ghost"
            onClick={onClose}
            style={{ fontSize: '1.2rem', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>

        {/* Billing Cycle Selector */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 10px', gap: 8, flexWrap: 'wrap' }}>
          {['monthly', 'quarterly', 'half_yearly', 'yearly'].map((cycle) => (
            <button
              key={cycle}
              type="button"
              className={`wmod-btn ${selectedCycle === cycle ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
              onClick={() => setSelectedCycle(cycle)}
            >
              {cycle === 'monthly' && 'Monthly'}
              {cycle === 'quarterly' && 'Quarterly (-5%)'}
              {cycle === 'half_yearly' && 'Half-Yearly (-10%)'}
              {cycle === 'yearly' && 'Yearly (-15%) ✨'}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#777' }}>
            Loading plans and configuration...
          </div>
        ) : error ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#d9534f' }}>
            <p>{error}</p>
            <button type="button" className="wmod-btn wmod-btn--secondary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, margin: '20px 0' }}>
            {options.map((opt) => {
              const pricing = getPriceDisplay(opt);
              const isBundle = opt.id === 'invitation_and_gallery';
              const isGallery = opt.id === 'gallery_only';

              return (
                <div
                  key={opt.id}
                  style={{
                    border: isBundle ? '2px solid #c5a059' : '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 24,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    background: isBundle ? '#fffdfa' : '#ffffff',
                    boxShadow: isBundle ? '0 8px 24px rgba(197, 160, 89, 0.15)' : '0 2px 6px rgba(0,0,0,0.04)',
                  }}
                >
                  {opt.badge && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -12,
                        right: 20,
                        background: isBundle ? '#c5a059' : '#4a5568',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 12,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {opt.badge}
                    </div>
                  )}

                  <div>
                    <h3 style={{ margin: '0 0 6px', fontSize: '1.25rem' }}>{opt.title}</h3>
                    <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.85rem', lineHeight: 1.4 }}>
                      {opt.tagline}
                    </p>

                    <div style={{ margin: '16px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#1e293b' }}>
                          {pricing.price}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{pricing.period}</span>
                      </div>
                      {pricing.effectiveMonthly && selectedCycle !== 'monthly' && (
                        <div style={{ fontSize: '0.8rem', color: '#10b981', marginTop: 4 }}>
                          Effective {pricing.effectiveMonthly}
                        </div>
                      )}
                    </div>

                    {/* Storage Tier Select for Gallery and Bundle */}
                    {(isGallery || isBundle) && opt.plans?.length > 1 && (
                      <div style={{ margin: '12px 0' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          Storage Allowance:
                        </label>
                        <select
                          className="wmod-input"
                          style={{ width: '100%', fontSize: '0.85rem', padding: '6px 10px' }}
                          value={storageTier}
                          onChange={(e) => setStorageTier(e.target.value)}
                        >
                          {opt.plans.map((p) => (
                            <option key={p.tier} value={p.tier}>
                              {p.name || p.tier} ({p.storage_gb ? `${p.storage_gb} GB` : 'High Capacity'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                        Included Features:
                      </div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {opt.benefits?.map((benefit, idx) => (
                          <li
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              fontSize: '0.85rem',
                              color: '#475569',
                              marginBottom: 8,
                              lineHeight: 1.4,
                            }}
                          >
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div style={{ marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                    <button
                      type="button"
                      className={`wmod-btn ${isBundle ? 'wmod-btn--primary' : 'wmod-btn--secondary'}`}
                      style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: '0.95rem' }}
                      onClick={() => {
                        if (onSelectPlan) {
                          onSelectPlan(opt, selectedCycle, storageTier);
                        } else {
                          window.location.href = `/studio/storage?plan=${opt.product}&cycle=${selectedCycle}`;
                        }
                      }}
                    >
                      {isBundle ? 'Get Combined Suite' : isGallery ? 'Get Gallery Access' : 'Get Invitation Plan'}
                    </button>
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: 8 }}>
                      Server-verified • Transactional activation • Instant access
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, fontSize: '0.8rem', color: '#64748b', marginTop: 10 }}>
          💡 <strong>Need AI Selfie Matching?</strong> AI Face Matching is available as an on-demand add-on per event/gallery. It is independent of standard storage and annual invitation subscriptions.
        </div>
      </div>
    </div>
  );
}

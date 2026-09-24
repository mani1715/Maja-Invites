import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Gift, Heart, Wallet, Building2, Link2, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';
import { useInvitePrefetch } from '@/context/InvitePrefetchContext';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Public gift-registry section.
 * Renders only when gifts are enabled OR the couple opted in to show a polite "no gifts" note.
 */
const GiftRegistrySection = ({ slug }) => {
  const prefetch = useInvitePrefetch(slug);
  const [data, setData] = useState(prefetch?.gifts || null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!slug) return;
    // Skip network if /full already provided gifts data.
    if (prefetch && 'gifts' in prefetch) {
      setData(prefetch.gifts || null);
      return;
    }
    axios.get(`${API_URL}/api/invite/${slug}/gifts`)
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [slug, prefetch]);

  if (!data) return null;

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch { /* ignore */ }
  };

  // Polite "no gifts" mode
  if (!data.enabled) {
    if (!data.show_disabled_note) return null;
    return (
      <section className="px-6 md:px-12 py-16 md:py-20" data-testid="public-gift-disabled">
        <div className="max-w-2xl mx-auto text-center">
          <Heart className="w-7 h-7 mx-auto text-gold mb-4 opacity-80" />
          <motion.h2 initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.7 }}
            className="font-display text-[1.9rem] md:text-[2.6rem] mb-3" style={{ color: '#FFF8DC' }}>
            <span className="font-script italic text-gold">{data.headline}</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-sm md:text-base leading-relaxed" style={{ color: 'rgba(255,248,220,0.88)' }}>
            {data.message}
          </motion.p>
        </div>
      </section>
    );
  }

  // Enabled mode
  const suggestions = data.suggestions || [];

  return (
    <section className="px-6 md:px-12 py-16 md:py-20" data-testid="public-gift-section">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <motion.span initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.1 }}
            className="lux-eyebrow inline-flex items-center gap-2 mb-3">
            <Gift className="w-3 h-3" /> A gift, if you wish
          </motion.span>
          <motion.h2 initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.7 }}
            className="font-display text-[1.9rem] md:text-[2.6rem]" style={{ color: '#FFF8DC' }}>
            <span className="font-script italic text-gold">{data.headline}</span>
          </motion.h2>
          {data.message && (
            <motion.p initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mt-4 text-sm md:text-base leading-relaxed max-w-2xl mx-auto"
              style={{ color: 'rgba(255,248,220,0.88)' }}>
              {data.message}
            </motion.p>
          )}
        </div>

        {/* Payment options (UPI / Bank / External) */}
        {(data.accept_upi || data.accept_bank || data.accept_external_registry) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
            {data.accept_upi && (
              <PayCard icon={Wallet} title="UPI Shagun" testid="public-gift-upi">
                <div className="text-xs mb-1" style={{ color: 'rgba(255,248,220,0.7)' }}>{data.upi_name}</div>
                <button onClick={() => copy(data.upi_id, 'upi')}
                  className="font-mono text-sm font-semibold inline-flex items-center gap-2 hover:text-gold transition-colors"
                  style={{ color: '#FFF8DC' }} data-testid="copy-upi">
                  {data.upi_id}
                  {copied === 'upi' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
                </button>
              </PayCard>
            )}
            {data.accept_bank && (
              <PayCard icon={Building2} title="Bank transfer" testid="public-gift-bank">
                <div className="space-y-1 text-xs">
                  {data.bank_account_name && <Row label="Name" value={data.bank_account_name} />}
                  {data.bank_account_number_masked && <Row label="A/C" value={data.bank_account_number_masked} mono />}
                  {data.bank_ifsc && (
                    <button onClick={() => copy(data.bank_ifsc, 'ifsc')} className="inline-flex items-center gap-1.5 hover:text-gold transition-colors w-full" data-testid="copy-ifsc">
                      <Row label="IFSC" value={data.bank_ifsc} mono />
                      {copied === 'ifsc' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 opacity-50" />}
                    </button>
                  )}
                  {data.bank_name && <Row label="Bank" value={data.bank_name} />}
                </div>
              </PayCard>
            )}
            {data.accept_external_registry && (
              <a href={data.external_registry_url} target="_blank" rel="noopener noreferrer"
                className="lux-glass p-5 flex flex-col items-center justify-center gap-2 text-center hover:scale-[1.02] transition-transform"
                data-testid="public-gift-registry-link">
                <Link2 className="w-5 h-5 text-gold" />
                <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>External</div>
                <span className="text-sm font-medium inline-flex items-center gap-1" style={{ color: '#FFF8DC' }}>
                  {data.external_registry_label} <ExternalLink className="w-3 h-3" />
                </span>
              </a>
            )}
          </div>
        )}

        {/* Gift suggestions */}
        {suggestions.length > 0 && (
          <>
            <div className="text-center mb-5">
              <span className="text-[10px] tracking-[0.4em] uppercase inline-flex items-center gap-2" style={{ color: 'rgba(255,248,220,0.8)' }}>
                <Sparkles className="w-3 h-3 text-gold" /> Gift ideas <Sparkles className="w-3 h-3 text-gold" />
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {suggestions.map((s, i) => (
                <motion.div key={s.id || i}
                  initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
                  transition={{ duration: 0.5, delay: i * 0.04 }}
                  className="lux-glass p-5 flex flex-col gap-2"
                  data-testid={`gift-suggestion-${i}`}>
                  {s.image_url && (
                    <img src={s.image_url} alt={s.title}
                      className="w-full h-32 object-cover rounded-lg mb-1"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{s.icon || '🎁'}</span>
                    <span className="font-medium text-sm" style={{ color: '#FFF8DC' }}>{s.title}</span>
                  </div>
                  {s.description && (
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,248,220,0.82)' }}>{s.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-2">
                    {s.price_hint && (
                      <span className="text-[10px] tracking-[0.15em] uppercase px-2 py-1 rounded-full"
                        style={{ background: 'rgba(212,175,55,0.12)', color: '#D4AF37' }}>
                        {s.price_hint}
                      </span>
                    )}
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] tracking-[0.15em] uppercase inline-flex items-center gap-1 text-gold hover:underline ml-auto"
                        data-testid={`gift-link-${i}`}>
                        View <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

        <AnimatePresence>
          {copied && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs tracking-widest uppercase z-50"
              style={{ background: '#D4AF37', color: '#16110C' }}>
              Copied
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

const PayCard = ({ icon: Icon, title, children, testid }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
    transition={{ duration: 0.5 }} className="lux-glass p-5 flex flex-col gap-2" data-testid={testid}>
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-4 h-4 text-gold" />
      <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>{title}</span>
    </div>
    {children}
  </motion.div>
);

const Row = ({ label, value, mono }) => (
  <div className="flex justify-between items-center text-xs">
    <span style={{ color: 'rgba(255,248,220,0.7)' }}>{label}</span>
    <span className={mono ? 'font-mono' : ''} style={{ color: '#FFF8DC' }}>{value}</span>
  </div>
);

export default React.memo(GiftRegistrySection);

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Gift, Heart, Sparkles, X, Check, ExternalLink } from 'lucide-react';
import { useInvitePrefetch } from '@/context/InvitePrefetchContext';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Public-facing Digital Shagun + Wall of Love + Blessing Counter
 * Mount inside LuxuryPublicInvitation as a section.
 */
const DigitalShagunSection = ({ slug, couple }) => {
  const prefetch = useInvitePrefetch(slug);
  const [shagun, setShagun] = useState(prefetch?.shagun || null);
  const [blessings, setBlessings] = useState(prefetch?.blessings || null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    (async () => {
      try {
        // Fast path: prefetch already has full shagun + blessings payloads.
        if (prefetch?.shagun) {
          if (mounted) setShagun(prefetch.shagun);
          if (prefetch.blessings && mounted) setBlessings(prefetch.blessings);
          return;
        }
        // If /full told us shagun is disabled, skip the shagun GET entirely.
        if (prefetch && prefetch.shagun_enabled === false) {
          if (mounted) setShagun({ enabled: false });
          if (prefetch.blessings && mounted) setBlessings(prefetch.blessings);
          return;
        }
        // We still need the /shagun endpoint for the full settings (UPI id,
        // suggested amounts, etc.) — /full only signals enabled+blessings.
        const tasks = [axios.get(`${API_URL}/api/invite/${slug}/shagun`)];
        if (!prefetch?.blessings) {
          tasks.push(axios.get(`${API_URL}/api/invite/${slug}/blessings`));
        }
        const results = await Promise.all(tasks);
        if (!mounted) return;
        setShagun(results[0].data);
        if (prefetch?.blessings) setBlessings(prefetch.blessings);
        else if (results[1]) setBlessings(results[1].data);
      } catch (_) {}
    })();
    return () => { mounted = false; };
  }, [slug, prefetch]);

  if (!shagun?.enabled) return null;

  return (
    <section className="px-6 md:px-12 py-20 md:py-28 relative" data-testid="public-shagun">
      <div className="max-w-3xl mx-auto text-center">
        <motion.span initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
          className="lux-eyebrow block mb-4">◆ With your blessings</motion.span>
        <motion.h2 initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-[2.2rem] md:text-[3.4rem] leading-tight" style={{ color: '#FFF8DC' }}>
          Shagun &amp; <span className="font-script italic text-gold">good wishes</span>
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.1 }}
          transition={{ delay: 0.15 }}
          className="mt-4 max-w-xl mx-auto text-sm md:text-base italic" style={{ color: 'rgba(255,248,220,0.85)' }}>
          {shagun.blessing_message || 'Your presence is our greatest gift. If you wish to bless us, you may.'}
        </motion.p>

        {blessings && (blessings.blessing_count > 0 || blessings.wishes_count > 0) && (
          <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
            transition={{ delay: 0.25 }}
            className="mt-6 inline-flex flex-wrap items-center gap-3">
            {blessings.blessing_count > 0 && (
              <Pill icon={Sparkles} label={`${blessings.blessing_count} blessing${blessings.blessing_count > 1 ? 's' : ''}`} />
            )}
            {blessings.wishes_count > 0 && (
              <Pill icon={Heart} label={`${blessings.wishes_count} wish${blessings.wishes_count > 1 ? 'es' : ''}`} />
            )}
          </motion.div>
        )}

        <motion.button initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }}
          transition={{ delay: 0.35 }}
          whileHover={{ y: -2 }}
          onClick={() => setOpen(true)} className="lux-btn mt-7" data-testid="public-shagun-open">
          <Gift className="w-4 h-4" /> Offer shagun
        </motion.button>
      </div>

      <AnimatePresence>
        {open && <ShagunModal shagun={shagun} slug={slug} couple={couple} onClose={() => { setOpen(false); }} onRecorded={(d) => setBlessings((b) => ({ ...(b||{}), blessing_count: (b?.blessing_count||0) + 1, blessing_total_amount: (b?.blessing_total_amount||0) + (d?.amount || 0) }))} />}
      </AnimatePresence>
    </section>
  );
};

const Pill = ({ icon: Icon, label }) => (
  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
    style={{ border: '1px solid var(--lux-border-strong)', background: 'rgba(212,175,55,0.06)', color: 'rgba(255,248,220,0.8)' }}>
    <Icon className="w-3.5 h-3.5 text-gold" /> <span className="text-xs tracking-[0.15em] uppercase">{label}</span>
  </span>
);

const ShagunModal = ({ shagun, slug, couple, onClose, onRecorded }) => {
  const [amount, setAmount] = useState(shagun.suggested?.[1]?.amount || 1100);
  const [customAmount, setCustomAmount] = useState('');
  const [guestName, setGuestName] = useState('');
  const [message, setMessage] = useState('');
  const [recorded, setRecorded] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const finalAmount = customAmount ? parseInt(customAmount, 10) : amount;
  const upiLink = `upi://pay?pa=${encodeURIComponent(shagun.upi_id)}&pn=${encodeURIComponent(shagun.payee_name || couple || '')}&am=${finalAmount}&cu=INR&tn=${encodeURIComponent('Shagun for ' + (couple || 'the couple'))}`;

  const recordAndPay = async () => {
    if (!guestName.trim()) return;
    try {
      await axios.post(`${API_URL}/api/invite/${slug}/shagun/record`, {
        guest_name: guestName, amount: finalAmount, message,
      });
      onRecorded?.({ amount: finalAmount });
      setRecorded(true);
    } catch (_) { /* still let them pay */ }
    window.location.href = upiLink;
  };

  // Prompt 12 — Razorpay Standard Checkout
  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

  const payViaRazorpay = async () => {
    setError('');
    if (!guestName.trim()) { setError('Please share your name first 🙏'); return; }
    if (!finalAmount || finalAmount < 1) { setError('Pick or enter an amount.'); return; }
    setPaying(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Could not load secure checkout');
      const { data: order } = await axios.post(`${API_URL}/api/invite/${slug}/shagun/razorpay/order`, {
        amount: finalAmount, guest_name: guestName, message,
      });
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount * 100,
        currency: 'INR',
        order_id: order.order_id,
        name: order.payee_name || couple || 'Wedding Shagun',
        description: `Shagun blessing of ₹${finalAmount.toLocaleString('en-IN')}`,
        theme: { color: '#D4AF37' },
        prefill: { name: guestName },
        notes: { wedding_slug: slug },
        handler: async (resp) => {
          try {
            await axios.post(`${API_URL}/api/invite/${slug}/shagun/razorpay/verify`, {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              amount: finalAmount,
              guest_name: guestName,
              message,
            });
            onRecorded?.({ amount: finalAmount });
            setRecorded(true);
          } catch (e) {
            setError(e?.response?.data?.detail || 'Payment recorded by Razorpay but server verification failed.');
          } finally { setPaying(false); }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Could not start payment.');
      setPaying(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      style={{ background: 'rgba(6,4,2,0.88)', backdropFilter: 'blur(10px)' }}
      onClick={onClose} data-testid="shagun-modal">
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="lux-glass relative w-full max-w-md p-7"
        style={{ background: 'rgba(14,10,6,0.97)' }}>
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center"
          style={{ color: 'rgba(255,248,220,0.8)', border: '1px solid var(--lux-border)' }}
          data-testid="shagun-close">
          <X className="w-4 h-4" />
        </button>
        <span className="lux-eyebrow block mb-3">◆ Digital Shagun</span>
        <h3 className="font-display text-2xl mb-3" style={{ color: '#FFF8DC' }}>
          For <span className="font-script italic text-gold">{couple || 'the couple'}</span>
        </h3>
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-3 gap-2">
            {(shagun.suggested || []).map((s) => (
              <button key={s.amount} onClick={() => { setAmount(s.amount); setCustomAmount(''); }}
                className="py-2 rounded-lg text-sm transition-all"
                style={amount === s.amount && !customAmount
                  ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                  : { background: 'transparent', border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.85)' }}
                data-testid={`shagun-amt-${s.amount}`}>
                ₹{s.amount.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="Or enter custom amount (₹)"
            className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
            style={{ color: '#FFF8DC', border: '1px solid var(--lux-border)' }}
            data-testid="shagun-custom-amount" />
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name (so we can thank you)"
            className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
            style={{ color: '#FFF8DC', border: '1px solid var(--lux-border)' }}
            data-testid="shagun-guest" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A short blessing (optional)" rows={2}
            className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
            style={{ color: '#FFF8DC', border: '1px solid var(--lux-border)' }}
            data-testid="shagun-message" />
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded text-xs" style={{ background: 'rgba(139,0,0,0.18)', color: '#FFD7C9' }}>
            {error}
          </div>
        )}

        {/* Razorpay primary CTA — cards, UPI, wallets, net banking */}
        {shagun.razorpay_enabled && (
          <button onClick={payViaRazorpay} disabled={paying || !guestName.trim() || finalAmount <= 0}
            className="lux-btn w-full justify-center mb-2"
            data-testid="shagun-pay-razorpay">
            <Gift className="w-4 h-4" /> {paying ? 'Opening secure checkout…' : `Bless ₹${finalAmount?.toLocaleString('en-IN')} (UPI · Card · Wallet)`}
          </button>
        )}

        {/* Direct UPI fallback */}
        {shagun.upi_id && (
          <button onClick={recordAndPay} disabled={!guestName.trim() || finalAmount <= 0}
            className={`${shagun.razorpay_enabled ? 'lux-btn lux-btn-ghost' : 'lux-btn'} w-full justify-center`}
            data-testid="shagun-pay-now">
            <ExternalLink className="w-4 h-4" /> Direct UPI: {shagun.upi_id}
          </button>
        )}

        {recorded && (
          <p className="text-xs mt-4 text-center inline-flex items-center gap-1 justify-center w-full" style={{ color: '#86EFAC' }}>
            <Check className="w-3.5 h-3.5" /> Blessing received with love 🙏
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};

export default React.memo(DigitalShagunSection);

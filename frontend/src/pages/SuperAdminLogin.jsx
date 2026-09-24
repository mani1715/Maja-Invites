import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Crown, ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import '../styles/luxury.css';

const fadeUp = {
  hidden: { opacity: 0, y: 22, filter: 'blur(6px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const SuperAdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    if (result.success) {
      // BUG 16 FIX: validate the returned admin's role BEFORE navigating to
      // the super-admin dashboard. Without this, a regular photographer who
      // mistypes the URL gets bounced /super-admin/login → /super-admin/dashboard
      // → /admin/dashboard (the dashboard's own guard kicks them out). Catch
      // the wrong-role case here with a clear error message instead.
      const role = (result.admin?.role || '').toLowerCase();
      if (role !== 'super_admin') {
        setError('You do not have super admin access. Please use the regular admin login.');
        setLoading(false);
        return;
      }
      navigate('/super-admin/dashboard');
    } else {
      setError(result.error || 'Invalid credentials');
    }
    setLoading(false);
  };

  return (
    <div className="luxe min-h-screen flex items-center justify-center px-6 py-12 relative">
      <div className="lux-orbit" style={{ width: 720, height: 720, top: -260, right: -260 }} />
      <div className="lux-orbit" style={{ width: 1100, height: 1100, bottom: -460, left: -460, opacity: 0.5 }} />

      <motion.button
        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}
        onClick={() => navigate('/')}
        className="absolute top-8 left-8 flex items-center gap-2 text-xs tracking-[0.25em] uppercase z-20"
        style={{ color: 'var(--lux-text-muted)' }}
        data-testid="back-to-home"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Studio
      </motion.button>

      <motion.div
        initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        className="w-full max-w-[460px] relative z-10"
      >
        <motion.div variants={fadeUp} custom={0} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5 relative"
            style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
            <Crown className="w-7 h-7" style={{ color: '#16110C' }} strokeWidth={2.2} />
            <div className="absolute -inset-2 rounded-full" style={{ border: '1px dashed rgba(212,175,55,0.4)' }} />
          </div>
          <span className="lux-eyebrow block mb-3">◆ Platform Sovereignty</span>
          <h1 className="font-display text-4xl md:text-5xl leading-tight" style={{ color: 'var(--lux-text)' }}>
            Super <span className="text-gold italic font-script">Admin</span>
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            Reserved for the platform owner. Credits, accounts, themes — all yours.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} custom={1} className="lux-glass p-8 md:p-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] tracking-[0.3em] uppercase mb-2.5" style={{ color: 'var(--lux-text-muted)' }}>
                Email
              </label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="superadmin@wedding.com"
                data-testid="super-admin-email"
                className="w-full px-4 py-3.5 bg-transparent rounded-lg outline-none transition-all font-body text-sm"
                style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)', caretColor: '#D4AF37' }}
                onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                onBlur={(e) => e.target.style.borderColor = 'var(--lux-border)'}
              />
            </div>

            <div>
              <label className="block text-[10px] tracking-[0.3em] uppercase mb-2.5" style={{ color: 'var(--lux-text-muted)' }}>
                Password
              </label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                placeholder="••••••••"
                data-testid="super-admin-password"
                className="w-full px-4 py-3.5 bg-transparent rounded-lg outline-none transition-all font-body text-sm"
                style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)', caretColor: '#D4AF37' }}
                onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                onBlur={(e) => e.target.style.borderColor = 'var(--lux-border)'}
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg text-sm" data-testid="super-admin-error"
                style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(139,0,0,0.5)', color: '#FFD7C9' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="lux-btn w-full justify-center" data-testid="super-admin-submit">
              {loading ? (
                <><Sparkles className="w-4 h-4 animate-pulse" /> Authenticating</>
              ) : (
                <>Sign In <ShieldCheck className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <div className="lux-hairline my-6" />

          <div className="text-center text-xs" style={{ color: 'var(--lux-text-muted)' }}>
            Photographer?{' '}
            <a href="/studio/login" className="text-gold font-medium tracking-widest uppercase">Studio login</a>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default SuperAdminLogin;

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  ArrowLeft, ExternalLink, Calendar, MapPin, Users, Eye, Heart, Camera,
  IndianRupee, CheckCircle2, XCircle, Clock, Loader2, Sparkles, FilePlus2,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] } }),
};

const PhotographerDetail = () => {
  const { adminId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('invitations');
  const [reqs, setReqs] = useState({ portfolio: [], events: [] });

  const getAuth = () => {
    const t = localStorage.getItem('admin_token') || localStorage.getItem('adminToken') || localStorage.getItem('token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/super-admin/photographers/${adminId}/detail`, { headers: getAuth() });
        setData(r.data);
        // Requests for THIS photographer — portfolio-build + event/fulfillment,
        // filtered client-side by studio id.
        const [pr, fr] = await Promise.allSettled([
          axios.get(`${API_URL}/api/admin/portfolio-build-requests`, { headers: getAuth() }),
          axios.get(`${API_URL}/api/admin/fulfillment/requests?buyer_kind=photographer`, { headers: getAuth() }),
        ]);
        const idOf = (x) => x.studio_id || x.admin_id || x.buyer_id;
        const portfolio = ((pr.value?.data?.requests) || []).filter((x) => idOf(x) === adminId);
        const events = ((fr.value?.data?.requests) || []).filter((x) => idOf(x) === adminId);
        setReqs({ portfolio, events });
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [adminId]);

  if (loading) {
    return <div className="luxe min-h-screen grid place-items-center"><Loader2 className="w-7 h-7 animate-spin" style={{ color: '#D4AF37' }} /></div>;
  }
  if (!data) {
    return <div className="luxe min-h-screen grid place-items-center p-6">
      <div className="lux-glass p-10 text-center max-w-md">
        <p style={{ color: 'var(--lux-text)' }}>Photographer not found.</p>
        <button onClick={() => navigate(-1)} className="lux-btn mt-4">Back</button>
      </div>
    </div>;
  }

  const { admin, summary, profiles } = data;
  const portfolio = data.portfolio || {};
  const subscription = data.subscription || {};
  const cloudStorage = data.cloud_storage || {};

  return (
    <div className="luxe min-h-screen" data-testid="photographer-detail">
      <div className="px-4 md:px-12 py-8 md:py-10 max-w-[1400px] mx-auto">
        <button onClick={() => navigate('/super-admin/dashboard')} className="lux-btn lux-btn-ghost mb-6 inline-flex items-center gap-2" data-testid="pd-back">
          <ArrowLeft className="w-4 h-4" /> Super Admin
        </button>

        {/* Hero */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="lux-eyebrow block mb-3">◆ Photographer · Pin-to-pin details</span>
            <h1 className="font-display text-[2.2rem] md:text-[3.6rem] leading-[1.05]" style={{ color: 'var(--lux-text)' }}>
              {admin.name || admin.email.split('@')[0]} <span className="font-script italic text-gold">studio</span>
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-gold" /> {admin.email}</span>
              {admin.phone && <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-gold" /> {admin.phone}</span>}
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-gold" /> Role: {admin.role}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-gold" /> Status: {admin.status || 'active'}</span>
              {admin.created_at && (
                <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gold" /> Joined {new Date(admin.created_at).toLocaleDateString('en-IN')}</span>
              )}
              {summary.last_login && (
                <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gold" /> Last seen {new Date(summary.last_login).toLocaleString('en-IN')}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate(`/studio/profile/new?on_behalf_of=${adminId}`)}
            className="lux-btn inline-flex items-center gap-2"
            data-testid="pd-create-invitation"
            title="Create a new invitation under this photographer's account"
          >
            <FilePlus2 className="w-4 h-4" /> Create invitation
          </button>
        </motion.div>

        {/* Stat tiles */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6" data-testid="pd-stats">
          <Stat icon={<Eye className="w-4 h-4" />} label="Invitations" value={summary.profiles_total} accent={summary.profiles_published > 0} />
          <Stat icon={<CheckCircle2 className="w-4 h-4" />} label="Published" value={summary.profiles_published} />
          <Stat icon={<Heart className="w-4 h-4" />} label="RSVPs" value={summary.rsvps_total} />
          <Stat icon={<Sparkles className="w-4 h-4" />} label="Views" value={summary.views_total} />
          <Stat icon={<IndianRupee className="w-4 h-4" />} label="Revenue" value={`₹${summary.revenue_inr.toLocaleString('en-IN')}`} accent />
        </motion.div>

        <a href={`/photographer/${admin.id}/portfolio`} target="_blank" rel="noreferrer" className="lux-btn lux-btn-ghost text-xs inline-flex mb-8" data-testid="pd-view-portfolio">
          View public portfolio <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b" style={{ borderColor: 'rgba(212,175,55,0.18)' }} data-testid="pd-tabs">
          <TabBtn label={`Invitations & links (${profiles.length})`} active={tab === 'invitations'} onClick={() => setTab('invitations')} testid="pd-tab-invitations" />
          <TabBtn label={`Portfolio (${portfolio.works || 0})`} active={tab === 'portfolio'} onClick={() => setTab('portfolio')} testid="pd-tab-portfolio" />
          <TabBtn label="Storage & folders" active={tab === 'storage'} onClick={() => setTab('storage')} testid="pd-tab-storage" />
          <TabBtn label={`Requests (${reqs.portfolio.length + reqs.events.length})`} active={tab === 'requests'} onClick={() => setTab('requests')} testid="pd-tab-requests" />
        </div>

        {tab === 'portfolio' && (
          <div className="space-y-5" data-testid="pd-portfolio">
            {!portfolio.exists ? (
              <div className="lux-glass p-10 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                This photographer hasn’t created a portfolio yet.
              </div>
            ) : (
              <>
                <div className="lux-glass p-5">
                  <div className="flex items-start gap-4 flex-wrap">
                    {portfolio.avatar && <img src={portfolio.avatar} alt="" className="w-16 h-16 rounded-xl object-cover" />}
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{portfolio.studio_name || admin.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide"
                          style={{ background: portfolio.tier === 'premium' ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'rgba(255,255,255,0.08)',
                                   color: portfolio.tier === 'premium' ? '#0E0A06' : 'var(--lux-text-muted)' }}>{portfolio.tier}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: portfolio.is_published ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', color: 'var(--lux-text)' }}>
                          {portfolio.is_published ? 'Published' : 'Not published'}
                        </span>
                      </div>
                      {portfolio.tagline && <div className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>{portfolio.tagline}</div>}
                      <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                        {[portfolio.location?.city, portfolio.location?.state, portfolio.location?.country].filter(Boolean).join(', ') || '—'}
                        {portfolio.experience_years ? ` · ${portfolio.experience_years} yrs` : ''}
                      </div>
                      {portfolio.is_published && (
                        <a href={portfolio.public_link} target="_blank" rel="noreferrer" className="text-xs text-gold underline mt-1 inline-block">
                          View public portfolio →
                        </a>
                      )}
                    </div>
                  </div>
                  {(portfolio.services?.length > 0 || portfolio.styles?.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {[...(portfolio.services || []), ...(portfolio.styles || [])].map((s) => (
                        <span key={s} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{s}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Stat icon={<Eye className="w-4 h-4" />} label="Albums" value={portfolio.albums} />
                  <Stat icon={<Eye className="w-4 h-4" />} label="Photos" value={portfolio.photos} />
                  <Stat icon={<Eye className="w-4 h-4" />} label="Videos" value={portfolio.videos} />
                  <Stat icon={<Sparkles className="w-4 h-4" />} label="Plan" value={subscription.active ? (subscription.plan_tier || 'Active') : 'Free'} accent={subscription.active} />
                  <Stat icon={<CheckCircle2 className="w-4 h-4" />} label="Storage used"
                    value={`${(portfolio.storage_used_bytes / (1024 * 1024)).toFixed(0)} / ${portfolio.storage_cap_bytes >= 1024 ** 3 ? `${(portfolio.storage_cap_bytes / 1024 ** 3).toFixed(0)} GB` : `${(portfolio.storage_cap_bytes / (1024 * 1024)).toFixed(0)} MB`}`} />
                </div>

                {portfolio.recent_works?.length > 0 && (
                  <div className="lux-glass p-5">
                    <div className="lux-eyebrow mb-3">◆ Recent work</div>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {portfolio.recent_works.map((w) => (
                        <div key={w.id} className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '3/4', background: 'var(--lux-panel)' }}>
                          {w.image_url ? <img src={w.image_url} alt={w.title} loading="lazy" className="w-full h-full object-cover" />
                            : w.thumbnail_url ? <img src={w.thumbnail_url} alt={w.title} loading="lazy" className="w-full h-full object-cover" />
                            : <div className="w-full h-full grid place-items-center text-[10px]" style={{ color: 'var(--lux-text-muted)' }}>video</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Content */}
        {tab === 'invitations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5" data-testid="pd-invitations">
            {profiles.length === 0 ? (
              <div className="md:col-span-2 lux-glass p-10 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                No invitations created yet.
              </div>
            ) : profiles.map((p) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="lux-glass p-5 md:p-6" data-testid={`pd-inv-${p.id}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="lux-eyebrow text-[9px] mb-1">◆ {p.event_type || 'wedding'} · {p.is_published ? 'Published' : (p.status || 'Draft')}</div>
                    <h3 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>
                      {p.groom_name} <span className="text-gold italic font-script">&</span> {p.bride_name}
                    </h3>
                  </div>
                  <a href={p.public_link} target="_blank" rel="noreferrer"
                    className="shrink-0 lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5"
                    data-testid={`pd-open-${p.id}`}>
                    Open <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="space-y-1 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                  {p.event_date && (
                    <div className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gold" /> {new Date(p.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  )}
                  {p.venue && (
                    <div className="inline-flex items-center gap-1.5 ml-3"><MapPin className="w-3.5 h-3.5 text-gold" /> {p.venue}{p.city ? `, ${p.city}` : ''}</div>
                  )}
                </div>
                <div className="text-[10px] tracking-[0.25em] uppercase mt-3 mb-1.5" style={{ color: 'var(--lux-text-faint)' }}>
                  Link · /invite/{p.slug}
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'rgba(212,175,55,0.12)' }}>
                  <Metric label="Views" value={p.metrics.views} />
                  <Metric label="RSVPs" value={p.metrics.rsvps} />
                  <Metric label="Wishes" value={p.metrics.wishes} />
                  <Metric label="Photos" value={p.metrics.photos} />
                </div>
                <WatermarkOverrideRow profile={p} testid={`pd-wm-${p.id}`} />
              </motion.div>
            ))}
          </div>
        )}

        {tab === 'storage' && (
          <div className="space-y-5" data-testid="pd-storage">
            {/* Portfolio folder */}
            <FolderCard
              title="Portfolio"
              active={subscription.active}
              statusText={subscription.active ? `Plan: ${subscription.plan_tier || subscription.portfolio_tier || 'Active'}` : 'No portfolio plan'}
              folder={portfolio.folder}
              used={portfolio.storage_used_bytes}
              cap={portfolio.storage_cap_bytes}
            />
            {/* Cloud storage folder */}
            <FolderCard
              title="Cloud Storage"
              active={cloudStorage.active}
              statusText={cloudStorage.active
                ? `${cloudStorage.plan_name || 'Plan'} · ${cloudStorage.gb_limit || '?'} GB${cloudStorage.status ? ` · ${cloudStorage.status}` : ''}`
                : 'No cloud storage plan bought'}
              folder={cloudStorage.folder}
              used={cloudStorage.used_bytes}
              cap={cloudStorage.cap_bytes}
              expiresAt={cloudStorage.expires_at}
            />
          </div>
        )}

        {tab === 'requests' && (
          <div className="space-y-8" data-testid="pd-requests">
            <div>
              <div className="lux-eyebrow mb-3">◆ Portfolio build requests</div>
              {reqs.portfolio.length === 0 ? (
                <div className="lux-glass p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>No portfolio requests.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reqs.portfolio.map((r) => (
                    <div key={r.id} className="lux-glass p-5" data-testid={`pd-preq-${r.id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="lux-eyebrow text-[9px]">◆ Portfolio · {r.status || 'pending'}</span>
                        {r.created_at && <span className="text-[10px]" style={{ color: 'var(--lux-text-faint)' }}>{new Date(r.created_at).toLocaleDateString('en-IN')}</span>}
                      </div>
                      <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{r.studio_name || 'Studio'}</div>
                      <div className="text-[11px] mt-1 break-words" style={{ color: 'var(--lux-text-muted)' }}>{r.notes || (r.details ? JSON.stringify(r.details).slice(0, 160) : '—')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="lux-eyebrow mb-3">◆ Event / invitation requests</div>
              {reqs.events.length === 0 ? (
                <div className="lux-glass p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>No event requests.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reqs.events.map((r) => (
                    <div key={r.fulfillment_code || r.id} className="lux-glass p-5" data-testid={`pd-ereq-${r.fulfillment_code || r.id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="lux-eyebrow text-[9px]">◆ {r.design_name || 'Event'} · {r.build_status || 'paid'}</span>
                        <span className="text-[10px] text-gold">{r.fulfillment_code}</span>
                      </div>
                      <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{r.package_label || r.design_name || 'Invitation'}</div>
                      <div className="text-[11px] mt-1" style={{ color: 'var(--lux-text-muted)' }}>₹{(r.amount_inr || 0).toLocaleString('en-IN')}{r.live_url ? ' · delivered' : ''}</div>
                      <button onClick={() => navigate('/super-admin/fulfillment')} className="lux-btn lux-btn-ghost text-[10px] mt-3">Open in fulfillment console</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

const Stat = ({ icon, label, value, accent }) => (
  <div className="lux-glass p-4" style={accent ? { border: '1px solid rgba(212,175,55,0.35)' } : {}}>
    <div className="flex items-center gap-1.5 text-[10px] tracking-[0.25em] uppercase mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>
      <span className="text-gold">{icon}</span> {label}
    </div>
    <div className="font-display text-2xl md:text-3xl text-gold leading-none">{value}</div>
  </div>
);

const TabBtn = ({ label, active, onClick, testid }) => (
  <button onClick={onClick}
    className="px-4 py-3 text-sm tracking-wide relative transition-colors"
    style={{ color: active ? '#D4AF37' : 'var(--lux-text-muted)', fontFamily: 'DM Sans, sans-serif' }}
    data-testid={testid}>
    {label}
    {active && <span className="absolute bottom-0 left-0 right-0 h-px" style={{ background: '#D4AF37' }} />}
  </button>
);

const Th = ({ children, align = 'left' }) => (
  <th className="px-4 py-3 text-[10px] tracking-[0.25em] uppercase font-medium" style={{ textAlign: align }}>{children}</th>
);
const Td = ({ children, align = 'left', style, ...rest }) => (
  <td className="px-4 py-3" style={{ textAlign: align, color: 'var(--lux-text)', ...style }} {...rest}>{children}</td>
);
const Metric = ({ label, value }) => (
  <div className="text-center">
    <div className="font-display text-lg text-gold leading-none">{value}</div>
    <div className="text-[9px] tracking-[0.2em] uppercase mt-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
  </div>
);

// Phase 3 P1 — Per-invitation watermark override (super-admin only).
// Three-state segmented control:
//   user → no override; respects photographer's own setting
//   on   → always watermark
//   off  → never watermark
const WatermarkOverrideRow = ({ profile, testid }) => {
  const [value, setValue] = useState((profile.admin_watermark_override || 'user').toLowerCase());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const getAuth = () => {
    const t = localStorage.getItem('admin_token') || localStorage.getItem('adminToken') || localStorage.getItem('token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const apply = async (next) => {
    if (next === value || busy) return;
    setBusy(true); setErr('');
    const previous = value;
    setValue(next);
    try {
      await axios.put(
        `${API_URL}/api/super-admin/profiles/${profile.id}/watermark`,
        { force: next },
        { headers: getAuth() },
      );
    } catch (e) {
      setValue(previous);
      setErr(e?.response?.data?.detail || 'Could not save override');
    } finally {
      setBusy(false);
    }
  };

  const opts = [
    { key: 'user', label: 'User' },
    { key: 'on',   label: 'Force ON' },
    { key: 'off',  label: 'Force OFF' },
  ];

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(212,175,55,0.12)' }} data-testid={testid}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
          Watermark override
        </div>
        <div className="inline-flex rounded-full overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.25)' }}>
          {opts.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => apply(o.key)}
              disabled={busy}
              className="px-3 py-1 text-[10px] tracking-[0.18em] uppercase transition-colors"
              style={value === o.key
                ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                : { background: 'transparent', color: 'var(--lux-text)' }}
              data-testid={`${testid}-${o.key}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {err && <div className="text-[10px] mt-2" style={{ color: '#FFB0A0' }}>{err}</div>}
    </div>
  );
};

// One studio storage area (Portfolio or Cloud Storage): the folder's name, the
// Google mail it lives on, and how full it is. Honest about "reserved but not
// created yet" when the storage pool is off — it shows the account's own reason
// rather than implying a Drive folder that doesn't exist.
const fmtGB = (bytes) => {
  const n = Number(bytes || 0);
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
};

const FolderCard = ({ title, active, statusText, folder, used, cap, expiresAt }) => {
  const acc = folder?.account || {};
  const mail = acc.email || acc.label;
  const pct = cap > 0 ? Math.min(100, Math.round((Number(used || 0) / cap) * 100)) : 0;
  return (
    <div className="lux-glass p-5" data-testid={`pd-folder-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="lux-eyebrow">◆ {title}</div>
        <span className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: active ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)', color: 'var(--lux-text-muted)' }}>
          {statusText}
        </span>
      </div>

      {!active ? (
        <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
          Nothing bought yet — no folder is created for this photographer.
        </div>
      ) : (
        <>
          {/* Folder name */}
          <div className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--lux-text-faint, var(--lux-text-muted))' }}>Folder name</div>
          <div className="text-sm font-mono break-all" style={{ color: 'var(--lux-text)' }} data-testid="pd-folder-name">
            {folder?.name || '— (created when the link is provisioned)'}
          </div>

          {/* Which mail */}
          <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--lux-text-faint, var(--lux-text-muted))' }}>Stored on</div>
          {acc.provisioned && mail ? (
            <div className="text-sm text-gold break-all" data-testid="pd-folder-mail">{mail}</div>
          ) : (
            <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }} data-testid="pd-folder-mail">
              {acc.reason || 'Assigned when the storage pool is enabled.'}
            </div>
          )}

          {/* Usage bar (cap > 0 only) */}
          {cap > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--lux-text-muted)' }}>
                <span>{fmtGB(used)} used</span>
                <span>{fmtGB(cap)} total · {pct}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? '#EF6E6E' : 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
              </div>
            </div>
          )}
          {expiresAt && (
            <div className="mt-3 text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
              Expires {new Date(expiresAt).toLocaleDateString('en-IN')}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PhotographerDetail;

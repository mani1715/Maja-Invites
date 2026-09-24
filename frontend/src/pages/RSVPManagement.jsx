import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import {
  ArrowLeft, Download, Users, CheckCircle2, XCircle, HelpCircle, Sparkles,
  Search, Mail,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fadeUp = {
  hidden: { opacity: 0, y: 28, filter: 'blur(8px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const RSVPManagement = () => {
  const navigate = useNavigate();
  const { profileId } = useParams();
  const { admin, loading: authLoading } = useAuth();
  const [rsvps, setRsvps] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [profileInfo, setProfileInfo] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) { navigate('/studio/login', { replace: true }); return; }
    fetchData();
    // eslint-disable-next-line
  }, [admin, authLoading, profileId, filter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const profileResponse = await axios.get(`${API_URL}/api/admin/profiles/${profileId}`);
      setProfileInfo(profileResponse.data);
      const filterParam = filter !== 'all' ? `?status=${filter}` : '';
      const rsvpsResponse = await axios.get(`${API_URL}/api/admin/profiles/${profileId}/rsvps${filterParam}`);
      setRsvps(rsvpsResponse.data || []);
      const statsResponse = await axios.get(`${API_URL}/api/admin/profiles/${profileId}/rsvps/stats`);
      setStats(statsResponse.data);
    } catch (error) {
      console.error('Failed to fetch RSVP data:', error);
    } finally { setLoading(false); }
  };

  const handleExport = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/admin/profiles/${profileId}/rsvps/export`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `rsvps_${profileId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export RSVPs:', error);
    }
  };

  const STATUS_META = {
    yes:   { label: 'Joyfully Attending',   icon: CheckCircle2, color: '#6FCF97' },
    no:    { label: 'Attending in Spirit',  icon: XCircle,       color: '#F08585' },
    maybe: { label: 'Considering',          icon: HelpCircle,    color: '#E8C766' },
  };

  const filtered = rsvps.filter((r) =>
    !query || (r.guest_name || '').toLowerCase().includes(query.toLowerCase()) ||
    (r.guest_phone || '').toLowerCase().includes(query.toLowerCase())
  );

  const STATS_CARDS = stats ? [
    { value: stats.total_rsvps, label: 'Total RSVPs', accent: 'var(--lux-gold)' },
    { value: stats.attending_count, label: 'Attending', accent: '#6FCF97' },
    { value: stats.not_attending_count, label: 'Regrets', accent: '#F08585' },
    { value: stats.maybe_count, label: 'Maybe', accent: '#E8C766' },
    { value: stats.total_guest_count, label: 'Total Guests', accent: 'var(--lux-blush)' },
  ] : [];

  return (
    <div className="luxe min-h-screen relative" data-testid="rsvp-management">
      <div className="lux-orbit" style={{ width: 700, height: 700, top: -180, right: -180 }} />
      <div className="lux-orbit" style={{ width: 1100, height: 1100, top: -380, right: -380, opacity: 0.45 }} />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12 py-10">
        <button
          onClick={() => navigate('/studio/dashboard')}
          className="lux-btn lux-btn-ghost text-xs mb-6"
          data-testid="rsvp-back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Studio
        </button>

        {/* Hero */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-12">
          <span className="lux-eyebrow block mb-4">◆ Guest List · Sacred Confirmations</span>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h1 className="font-display text-[2.6rem] md:text-[4.2rem] leading-[1.02]" style={{ color: 'var(--lux-text)' }}>
                Every <span className="text-gold font-script italic">presence</span><br/>becomes a blessing.
              </h1>
              {profileInfo && (
                <p className="mt-5 text-base max-w-xl" style={{ color: 'var(--lux-text-muted)' }}>
                  Tracking RSVPs for <span className="text-gold">{profileInfo.groom_name} &amp; {profileInfo.bride_name}</span> ·
                  {profileInfo.event_date && ` ${new Date(profileInfo.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={handleExport} className="lux-btn" data-testid="rsvp-export-btn">
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <a
                href={`/invite/${profileInfo?.share_link || profileInfo?.slug || ''}`}
                target="_blank"
                rel="noreferrer"
                className="lux-btn lux-btn-ghost"
              >
                <Mail className="w-4 h-4" /> View Invitation
              </a>
            </div>
          </div>
        </motion.div>

        {/* Stat tiles */}
        {stats && (
          <motion.div
            variants={fadeUp} initial="hidden" animate="visible" custom={1}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12"
            data-testid="rsvp-stats"
          >
            {STATS_CARDS.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="luxe-stat-tile"
                style={{ '--accent': c.accent }}
                data-testid={`rsvp-stat-${c.label.toLowerCase().replace(/ /g, '-')}`}
              >
                <div className="luxe-stat-value" style={{ background: `linear-gradient(180deg, ${c.accent}, #8C6A1A)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {c.value ?? 0}
                </div>
                <div className="luxe-stat-label">{c.label}</div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Filter + search */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={2} className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All', count: stats?.total_rsvps },
              { id: 'yes', label: 'Attending', count: stats?.attending_count },
              { id: 'no',  label: 'Regrets',   count: stats?.not_attending_count },
              { id: 'maybe', label: 'Maybe',   count: stats?.maybe_count },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="px-4 py-2 rounded-full text-xs tracking-[0.18em] uppercase transition-all"
                style={filter === f.id
                  ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                  : { background: 'transparent', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
                data-testid={`rsvp-filter-${f.id}`}
              >
                {f.label} <span className="opacity-60 ml-1">({f.count ?? 0})</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
            <input
              type="search" placeholder="Search guest name or phone…"
              value={query} onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 rounded-full text-sm w-72"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
              data-testid="rsvp-search"
            />
          </div>
        </motion.div>

        {/* Table */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3} className="lux-glass overflow-hidden" data-testid="rsvp-table-card">
          {loading ? (
            <div className="p-16 text-center">
              <div className="lux-mandala mx-auto" />
              <p className="mt-6 text-sm" style={{ color: 'var(--lux-text-muted)' }}>Gathering confirmations…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-20 text-center">
              <Sparkles className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--lux-gold)' }} />
              <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>No confirmations yet</h3>
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Share your invitation to begin gathering blessings.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--lux-border)' }}>
                    {['Guest', 'Phone', 'Status', 'Party Size', 'Message', 'Received'].map((h) => (
                      <th key={h} className="text-left px-6 py-4 text-[0.7rem] tracking-[0.25em] uppercase"
                          style={{ color: 'var(--lux-gold)', fontWeight: 500 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rsvp, idx) => {
                    const meta = STATUS_META[rsvp.status] || { label: rsvp.status, icon: HelpCircle, color: '#E8C766' };
                    const IconEl = meta.icon;
                    return (
                      <motion.tr
                        key={rsvp.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: idx * 0.03, ease: [0.22, 1, 0.36, 1] }}
                        style={{ borderBottom: '1px solid var(--lux-border)' }}
                        className="hover:bg-[rgba(212,175,55,0.04)] transition-colors"
                        data-testid={`rsvp-row-${idx}`}
                      >
                        <td className="px-6 py-4">
                          <div className="font-heading text-base" style={{ color: 'var(--lux-text)' }}>{rsvp.guest_name}</div>
                        </td>
                        <td className="px-6 py-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>{rsvp.guest_phone || '—'}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs tracking-[0.15em] uppercase"
                                style={{ background: `${meta.color}1F`, color: meta.color, border: `1px solid ${meta.color}40` }}>
                            <IconEl className="w-3.5 h-3.5" /> {meta.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm" style={{ color: 'var(--lux-text)' }}>
                          {rsvp.status === 'yes' ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" style={{ color: 'var(--lux-gold)' }} />
                              {rsvp.guest_count || 1}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm italic max-w-xs truncate" style={{ color: 'var(--lux-text)' }} title={rsvp.message}>
                          {rsvp.message ? `“${rsvp.message}”` : '—'}
                        </td>
                        <td className="px-6 py-4 text-xs tracking-widest uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                          {rsvp.created_at ? new Date(rsvp.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RSVPManagement;

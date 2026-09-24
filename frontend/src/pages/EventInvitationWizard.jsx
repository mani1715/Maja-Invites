import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  ArrowLeft, Plus, Crown, Heart, Sparkles, Calendar, Copy, ExternalLink,
  Trash2, Edit3, ToggleLeft, ToggleRight, ChevronRight, ChevronLeft, Check, X,
  QrCode, Clock, AlertTriangle, Download, Image as ImageIcon, UserRound,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import useAbortController from '@/hooks/useAbortController';
import { getAllThemes, getThemeById } from '@/themes/masterThemes';
import { DEITY_OPTIONS } from '@/config/religiousAssets';
import EventPhotosPanel from './EventPhotosPanel';
import ClientAccessPanel from '@/components/luxury/ClientAccessPanel';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const EVENT_TYPES = [
  { value: 'engagement', label: 'Engagement', allowDeity: true, icon: '◆' },
  { value: 'haldi',      label: 'Haldi',      allowDeity: false, icon: '◇' },
  { value: 'mehendi',    label: 'Mehendi',    allowDeity: false, icon: '◈' },
  { value: 'marriage',   label: 'Marriage',   allowDeity: true,  icon: '✧' },
  { value: 'reception',  label: 'Reception',  allowDeity: true,  icon: '✦' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  visible: (i = 0) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] } }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } };

const EventInvitationWizard = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0); // 0:event 1:theme 2:deity 3:review
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ event_type: '', design_id: 'royal_mughal', deity_id: null, expires_at: '' });
  const [editingId, setEditingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [qrPreview, setQrPreview] = useState(null); // { invitation, openedAt }
  const [photosPanel, setPhotosPanel] = useState(null); // invitation object when open
  const [clientPanelOpen, setClientPanelOpen] = useState(false); // Client Access modal
  const getSignal = useAbortController();

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) { navigate('/studio/login'); return; }
    fetchAll();
    // eslint-disable-next-line
  }, [admin, authLoading]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const signal = getSignal();
      const [p, ei] = await Promise.all([
        axios.get(`${API_URL}/api/admin/profiles/${profileId}`, { signal }),
        axios.get(`${API_URL}/api/admin/profiles/${profileId}/event-invitations`, { signal }),
      ]);
      setProfile(p.data);
      setInvitations(ei.data || []);
    } catch (e) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        console.error('Failed to load profile or invitations', e);
      }
    } finally {
      setLoading(false);
    }
  };

  const usedEventTypes = useMemo(() => new Set(invitations.map(i => i.event_type)), [invitations]);
  const availableEvents = useMemo(
    () => EVENT_TYPES.filter(et => !usedEventTypes.has(et.value)),
    [usedEventTypes]
  );
  const allThemes = useMemo(() => getAllThemes(), []);

  const openWizard = () => {
    if (availableEvents.length === 0) return;
    // Default expiry = profile.event_date + 7 days (formatted for <input type="date">)
    let defaultExpiry = '';
    if (profile?.event_date) {
      try {
        const d = new Date(profile.event_date);
        d.setDate(d.getDate() + 7);
        defaultExpiry = d.toISOString().slice(0, 10);
      } catch (_) {}
    }
    setDraft({ event_type: '', design_id: 'royal_mughal', deity_id: null, expires_at: defaultExpiry });
    setStep(0);
    setError('');
    setEditingId(null);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setStep(0);
    setEditingId(null);
    setError('');
  };

  const currentEventConfig = EVENT_TYPES.find(e => e.value === draft.event_type);
  const stepsForCurrent = currentEventConfig?.allowDeity ? 4 : 3; // skip deity step if not allowed

  const goNext = () => {
    setError('');
    if (step === 0 && !draft.event_type) { setError('Please pick an event to continue.'); return; }
    if (step === 1 && !draft.design_id)  { setError('Please pick a theme.'); return; }
    setStep((s) => Math.min(s + 1, stepsForCurrent - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const submitCreate = async () => {
    setSubmitting(true);
    setError('');
    try {
      const body = {
        event_type: draft.event_type,
        design_id: draft.design_id,
        deity_id: currentEventConfig?.allowDeity ? draft.deity_id : null,
      };
      if (draft.expires_at) {
        // Send as end-of-day UTC ISO string for the chosen date
        const dt = new Date(`${draft.expires_at}T23:59:59`);
        if (!Number.isNaN(dt.getTime())) body.expires_at = dt.toISOString();
      }
      await axios.post(`${API_URL}/api/admin/profiles/${profileId}/event-invitations`, body);
      await fetchAll();
      closeWizard();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not create invitation link.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitUpdate = async () => {
    setSubmitting(true);
    setError('');
    try {
      const body = {
        design_id: draft.design_id,
        deity_id: currentEventConfig?.allowDeity ? draft.deity_id : null,
      };
      if (draft.expires_at) {
        const dt = new Date(`${draft.expires_at}T23:59:59`);
        if (!Number.isNaN(dt.getTime())) body.expires_at = dt.toISOString();
      }
      await axios.put(`${API_URL}/api/admin/event-invitations/${editingId}`, body);
      await fetchAll();
      closeWizard();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not update invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (inv) => {
    try {
      await axios.put(`${API_URL}/api/admin/event-invitations/${inv.id}`, { enabled: !inv.enabled });
      await fetchAll();
    } catch (e) {
      console.error('Toggle failed', e);
    }
  };

  const removeInvitation = async (inv) => {
    if (!window.confirm(`Delete the ${inv.event_type} invitation link?`)) return;
    try {
      await axios.delete(`${API_URL}/api/admin/event-invitations/${inv.id}`);
      await fetchAll();
    } catch (e) {
      console.error('Delete failed', e);
    }
  };

  const startEdit = (inv) => {
    let expiresLocal = '';
    if (inv.expires_at) {
      try {
        expiresLocal = new Date(inv.expires_at).toISOString().slice(0, 10);
      } catch (_) {}
    }
    setDraft({ event_type: inv.event_type, design_id: inv.design_id, deity_id: inv.deity_id || null, expires_at: expiresLocal });
    setEditingId(inv.id);
    setStep(1); // skip event picker
    setWizardOpen(true);
  };

  const copyLink = (link, id) => {
    const fullLink = `${window.location.origin}${link}`;
    navigator.clipboard.writeText(fullLink);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const coupleName = profile ? `${profile.groom_name || 'Groom'} & ${profile.bride_name || 'Bride'}` : '';

  return (
    <div className="luxe min-h-screen relative" data-testid="event-invitation-wizard-page">
      {/* Top bar */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 px-6 md:px-12 py-4 flex items-center justify-between border-b"
        style={{ background: 'rgba(14,10,6,0.85)', backdropFilter: 'blur(12px)', borderColor: 'var(--lux-border)' }}
      >
        <button onClick={() => navigate('/studio/dashboard')} className="flex items-center gap-2 text-xs tracking-[0.25em] uppercase" style={{ color: 'rgba(255,248,220,0.85)' }} data-testid="back-to-dashboard">
          <ArrowLeft className="w-4 h-4" /> Studio
        </button>
        <div className="text-center">
          <div className="text-[10px] tracking-[0.35em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>Invitation Manager</div>
          <div className="font-display text-lg" style={{ color: '#FFF8DC' }}>{coupleName}</div>
        </div>
        <div className="w-20" />
      </motion.nav>

      <div className="px-6 md:px-12 py-10 md:py-14 max-w-[1200px] mx-auto">
        {/* Hero */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="mb-10">
          <motion.span variants={fadeUp} className="lux-eyebrow block mb-4">◆ Per-Event Links</motion.span>
          <motion.h1 variants={fadeUp} custom={1} className="font-display text-[2.4rem] md:text-[3.6rem] leading-[1.04] tracking-tight" style={{ color: '#FFF8DC' }}>
            Get the <span className="text-gold italic font-script">invitation link</span>
          </motion.h1>
          <motion.p variants={fadeUp} custom={2} className="mt-4 max-w-2xl text-[1rem]" style={{ color: 'rgba(255,248,220,0.82)' }}>
            Compose one separate link per ceremony — Engagement, Haldi, Mehendi, Marriage and Reception. Each link can carry its own theme, deity background and access rules.
          </motion.p>
        </motion.div>

        {/* CTA */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="lux-glass p-6 md:p-7 mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-display text-xl" style={{ color: '#FFF8DC' }}>
              {invitations.length} of {EVENT_TYPES.length} event links composed
            </div>
            <div className="text-xs mt-1 tracking-wide" style={{ color: 'rgba(255,248,220,0.78)' }}>
              {availableEvents.length > 0 ? `${availableEvents.length} more available` : 'All events composed — edit or delete to recreate.'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setClientPanelOpen(true)}
              className="lux-btn lux-btn-ghost"
              data-testid="open-client-access"
            >
              <UserRound className="w-4 h-4" /> Client Access
            </button>
            <button
              onClick={openWizard}
              disabled={availableEvents.length === 0}
              className="lux-btn"
              data-testid="open-invitation-wizard"
              style={availableEvents.length === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              <Plus className="w-4 h-4" /> Get Invitation Link
            </button>
          </div>
        </motion.div>

        {/* Existing list */}
        {loading ? (
          <div className="grid place-items-center py-20"><div className="lux-mandala" /></div>
        ) : invitations.length === 0 ? (
          <motion.div variants={fadeUp} initial="hidden" animate="visible" className="lux-glass p-12 text-center" data-testid="invitations-empty">
            <Heart className="w-10 h-10 mx-auto mb-3" style={{ color: '#D4AF37' }} />
            <h3 className="font-display text-2xl mb-2" style={{ color: '#FFF8DC' }}>No event links yet</h3>
            <p className="text-sm mb-5" style={{ color: 'rgba(255,248,220,0.8)' }}>Compose your first ceremony link. You can add unlimited events for this profile.</p>
            <button onClick={openWizard} className="lux-btn" data-testid="empty-create-invitation">
              <Plus className="w-4 h-4" /> Create First Event Link
            </button>
          </motion.div>
        ) : (
          <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-5" data-testid="invitations-list">
            {invitations.map((inv, i) => {
              const theme = getThemeById(inv.design_id);
              const ev = EVENT_TYPES.find(e => e.value === inv.event_type);
              const deity = DEITY_OPTIONS.find(d => d.id === inv.deity_id);
              return (
                <motion.div key={inv.id} variants={fadeUp} custom={i} className="lux-glass overflow-hidden" data-testid={`invitation-card-${inv.event_type}`}>
                  <div className="h-2 flex">
                    {theme.paletteSwatch.map((c, idx) => <div key={idx} className="flex-1" style={{ background: c }} />)}
                  </div>
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: 'rgba(255,248,220,0.78)' }}>{ev?.label || inv.event_type}</div>
                        <h3 className="font-display text-[1.5rem] leading-tight" style={{ color: '#FFF8DC' }}>{theme.name}</h3>
                        {deity && deity.id !== 'none' && (
                          <p className="text-xs mt-1" style={{ color: 'rgba(255,248,220,0.8)' }}>Deity: {deity.name}</p>
                        )}
                      </div>
                      <button onClick={() => toggleEnabled(inv)} className="px-3 py-1 rounded-full text-[10px] tracking-[0.2em] uppercase flex items-center gap-1.5"
                        style={inv.enabled
                          ? { background: 'rgba(212,175,55,0.16)', border: '1px solid var(--lux-gold)', color: '#D4AF37' }
                          : { background: 'rgba(255,248,220,0.06)', border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.8)' }}
                        data-testid={`toggle-${inv.event_type}`}
                      >
                        {inv.enabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                        {inv.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>

                    <div className="lux-hairline my-3" />
                    <div className="text-xs font-mono break-all px-3 py-2 rounded" style={{ color: 'rgba(255,248,220,0.88)', background: 'rgba(255,248,220,0.04)', border: '1px solid var(--lux-border)' }}>
                      {window.location.origin}{inv.invitation_link}
                    </div>

                    {/* Expiry + AI status */}
                    {(inv.expires_at || inv.expired || inv.media_purged) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {inv.expires_at && !inv.expired && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] tracking-[0.2em] uppercase" style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid var(--lux-border-strong)', color: '#D4AF37' }} data-testid={`expiry-${inv.event_type}`}>
                            <Clock className="w-3 h-3" /> Expires {new Date(inv.expires_at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                        {inv.expired && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] tracking-[0.2em] uppercase" style={{ background: 'rgba(139,0,0,0.2)', border: '1px solid rgba(139,0,0,0.5)', color: '#FFD7C9' }}>
                            <AlertTriangle className="w-3 h-3" /> Expired{inv.media_purged ? ' · media purged' : ''}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                      <ActionBtn icon={copiedId === inv.id ? Check : Copy} label={copiedId === inv.id ? 'Copied' : 'Copy Link'} onClick={() => copyLink(inv.invitation_link, inv.id)} testid={`copy-${inv.event_type}`} primary={copiedId === inv.id} />
                      <ActionBtn icon={ExternalLink} label="Open" onClick={() => window.open(`${window.location.origin}${inv.invitation_link}`, '_blank')} testid={`open-${inv.event_type}`} />
                      {inv.qr_image && (
                        <ActionBtn icon={QrCode} label="QR" onClick={() => setQrPreview(inv)} testid={`qr-${inv.event_type}`} />
                      )}
                      <ActionBtn icon={ImageIcon} label="Photos" onClick={() => setPhotosPanel(inv)} testid={`photos-${inv.event_type}`} />
                      <ActionBtn icon={Edit3}        label="Edit"  onClick={() => startEdit(inv)} testid={`edit-${inv.event_type}`} />
                      <ActionBtn icon={Trash2}       label="Delete" onClick={() => removeInvitation(inv)} testid={`delete-${inv.event_type}`} danger />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Wizard modal */}
      <AnimatePresence>
        {wizardOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
            style={{ background: 'rgba(8,5,3,0.78)', backdropFilter: 'blur(8px)' }}
            data-testid="wizard-modal"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="lux-glass w-full max-w-3xl max-h-[90vh] overflow-y-auto p-7 md:p-9 relative"
            >
              <button onClick={closeWizard} className="absolute top-5 right-5 w-9 h-9 rounded-full grid place-items-center" style={{ border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.85)' }} data-testid="wizard-close">
                <X className="w-4 h-4" />
              </button>

              {/* Stepper */}
              <div className="flex items-center gap-2 mb-6">
                {[0, 1, 2, 3].slice(0, stepsForCurrent || 4).map((s) => {
                  const labels = ['Event', 'Theme', (currentEventConfig?.allowDeity ? 'Deity' : 'Review'), 'Review'];
                  const isActive = s <= step;
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full grid place-items-center text-xs font-semibold"
                        style={{ background: isActive ? '#D4AF37' : 'transparent', color: isActive ? '#16110C' : 'rgba(255,248,220,0.78)', border: '1px solid ' + (isActive ? '#D4AF37' : 'var(--lux-border)') }}>
                        {s + 1}
                      </div>
                      <span className="text-[10px] tracking-[0.25em] uppercase hidden sm:inline" style={{ color: isActive ? '#FFF8DC' : 'rgba(255,248,220,0.62)' }}>{labels[s]}</span>
                      {s < (stepsForCurrent - 1) && <div className="w-6 h-px" style={{ background: 'var(--lux-border-strong)' }} />}
                    </div>
                  );
                })}
              </div>

              {/* Title */}
              <div className="mb-5">
                <span className="lux-eyebrow block mb-2">◆ {editingId ? 'Edit invitation' : 'New invitation link'}</span>
                <h2 className="font-display text-3xl" style={{ color: '#FFF8DC' }}>
                  {step === 0 && <>Pick the <span className="text-gold italic font-script">ceremony</span></>}
                  {step === 1 && <>Choose a <span className="text-gold italic font-script">theme</span></>}
                  {step === 2 && currentEventConfig?.allowDeity && <>Add a <span className="text-gold italic font-script">deity</span></>}
                  {((step === 2 && !currentEventConfig?.allowDeity) || step === 3) && <>Review & <span className="text-gold italic font-script">generate</span></>}
                </h2>
              </div>

              {/* STEP CONTENT */}
              {/* Step 0 - Event */}
              {step === 0 && !editingId && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="wizard-step-event">
                  {EVENT_TYPES.map((et) => {
                    const used = usedEventTypes.has(et.value);
                    const selected = draft.event_type === et.value;
                    return (
                      <button
                        key={et.value}
                        onClick={() => !used && setDraft((d) => ({ ...d, event_type: et.value, deity_id: null }))}
                        disabled={used}
                        data-testid={`pick-event-${et.value}`}
                        className="text-left p-5 rounded-xl transition-all"
                        style={{
                          background: selected ? 'rgba(212,175,55,0.12)' : 'rgba(255,248,220,0.03)',
                          border: '1px solid ' + (selected ? '#D4AF37' : 'var(--lux-border)'),
                          opacity: used ? 0.4 : 1, cursor: used ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <div className="text-2xl mb-2" style={{ color: '#D4AF37' }}>{et.icon}</div>
                        <div className="font-display text-lg" style={{ color: '#FFF8DC' }}>{et.label}</div>
                        <div className="text-[10px] tracking-[0.25em] uppercase mt-1" style={{ color: 'rgba(255,248,220,0.7)' }}>
                          {used ? 'Already created' : et.allowDeity ? 'Deity allowed' : 'No deity'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Step 1 - Theme */}
              {step === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="wizard-step-theme">
                  {allThemes.map((t) => {
                    const selected = draft.design_id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setDraft((d) => ({ ...d, design_id: t.id }))}
                        data-testid={`pick-theme-${t.id}`}
                        className="text-left rounded-xl overflow-hidden transition-all"
                        style={{
                          background: selected ? 'rgba(212,175,55,0.12)' : 'rgba(255,248,220,0.03)',
                          border: '1px solid ' + (selected ? '#D4AF37' : 'var(--lux-border)'),
                        }}
                      >
                        <div className="h-3 flex">
                          {t.paletteSwatch.map((c, idx) => <div key={idx} className="flex-1" style={{ background: c }} />)}
                        </div>
                        <div className="p-4">
                          <div className="font-display text-base" style={{ color: '#FFF8DC' }}>{t.name}</div>
                          <div className="text-[10px] tracking-[0.25em] uppercase mt-1" style={{ color: 'rgba(255,248,220,0.7)' }}>{t.culture}</div>
                          <div className="text-xs mt-2 line-clamp-2" style={{ color: 'rgba(255,248,220,0.82)' }}>{t.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Step 2 - Deity (only if event allows) */}
              {step === 2 && currentEventConfig?.allowDeity && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="wizard-step-deity">
                  {DEITY_OPTIONS.map((d) => {
                    const isNone = d.id === 'none';
                    const selected = (isNone && !draft.deity_id) || draft.deity_id === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setDraft((s) => ({ ...s, deity_id: isNone ? null : d.id }))}
                        data-testid={`pick-deity-${d.id}`}
                        className="text-left p-4 rounded-xl transition-all"
                        style={{
                          background: selected ? 'rgba(212,175,55,0.12)' : 'rgba(255,248,220,0.03)',
                          border: '1px solid ' + (selected ? '#D4AF37' : 'var(--lux-border)'),
                        }}
                      >
                        <div className="font-display text-base" style={{ color: '#FFF8DC' }}>{d.name}</div>
                        <div className="text-xs mt-1 line-clamp-2" style={{ color: 'rgba(255,248,220,0.8)' }}>{d.description}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Review */}
              {((step === 2 && !currentEventConfig?.allowDeity) || step === 3) && (
                <div className="space-y-4" data-testid="wizard-step-review">
                  <ReviewRow label="Couple"   value={coupleName} />
                  <ReviewRow label="Event"    value={EVENT_TYPES.find(e => e.value === draft.event_type)?.label || draft.event_type} />
                  <ReviewRow label="Theme"    value={getThemeById(draft.design_id).name} />
                  {currentEventConfig?.allowDeity && (
                    <ReviewRow label="Deity" value={DEITY_OPTIONS.find(d => d.id === draft.deity_id)?.name || 'None'} />
                  )}
                  {profile?.slug && draft.event_type && (
                    <ReviewRow label="Preview link" value={`${window.location.origin}/invite/${profile.slug}/${draft.event_type}`} mono />
                  )}

                  {/* Expiry input */}
                  <div className="px-4 py-3 rounded-lg" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid var(--lux-border-strong)' }}>
                    <div className="flex items-start gap-3 mb-2">
                      <Clock className="w-4 h-4 mt-0.5" style={{ color: '#D4AF37' }} />
                      <div className="flex-1">
                        <label className="block text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: 'rgba(255,248,220,0.82)' }}>
                          Link expires on
                        </label>
                        <input
                          type="date"
                          value={draft.expires_at}
                          onChange={(e) => setDraft((d) => ({ ...d, expires_at: e.target.value }))}
                          data-testid="wizard-expiry-input"
                          className="w-full px-3 py-2 bg-transparent rounded-md outline-none text-sm"
                          style={{ color: '#FFF8DC', border: '1px solid var(--lux-border)', colorScheme: 'dark' }}
                        />
                        <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'rgba(255,248,220,0.78)' }}>
                          After this date the QR code stops working and every photo guests uploaded against it will be permanently deleted from storage. Default = wedding date + 7 days.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-5 px-4 py-3 rounded-lg text-sm" data-testid="wizard-error" style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(139,0,0,0.5)', color: '#FFD7C9' }}>
                  {error}
                </div>
              )}

              {/* Footer nav */}
              <div className="mt-7 flex items-center justify-between">
                <button onClick={step === 0 ? closeWizard : goBack} className="lux-btn lux-btn-ghost" data-testid="wizard-back">
                  <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
                </button>
                {step < stepsForCurrent - 1 ? (
                  <button onClick={goNext} className="lux-btn" data-testid="wizard-next">
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={editingId ? submitUpdate : submitCreate}
                    disabled={submitting}
                    className="lux-btn"
                    data-testid="wizard-generate"
                  >
                    {submitting ? <><Sparkles className="w-4 h-4 animate-pulse" /> Composing…</> : <>{editingId ? 'Save changes' : 'Generate link'} <Crown className="w-4 h-4" /></>}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR preview modal */}
      <AnimatePresence>
        {qrPreview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8"
            style={{ background: 'rgba(8,5,3,0.82)', backdropFilter: 'blur(10px)' }}
            onClick={() => setQrPreview(null)}
            data-testid="qr-preview-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="lux-glass max-w-md w-full p-7 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setQrPreview(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full grid place-items-center" style={{ border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.85)' }} data-testid="qr-preview-close">
                <X className="w-4 h-4" />
              </button>
              <span className="lux-eyebrow block mb-2">◆ Guest scan QR</span>
              <h3 className="font-display text-2xl mb-1" style={{ color: '#FFF8DC' }}>
                {EVENT_TYPES.find(e => e.value === qrPreview.event_type)?.label || qrPreview.event_type}
              </h3>
              <p className="text-xs mb-5" style={{ color: 'rgba(255,248,220,0.78)' }}>
                Guests scan this to open the invitation, RSVP and upload their photos to the live gallery.
              </p>
              {qrPreview.qr_image ? (
                <div className="bg-white rounded-xl p-4 grid place-items-center mb-4">
                  <img src={qrPreview.qr_image} alt="Invitation QR code" className="w-64 h-64 object-contain" />
                </div>
              ) : (
                <div className="rounded-xl p-8 text-center text-sm mb-4" style={{ background: 'rgba(255,248,220,0.04)', border: '1px solid var(--lux-border)', color: 'rgba(255,248,220,0.8)' }}>
                  QR code is being generated…
                </div>
              )}
              <div className="text-xs font-mono break-all px-3 py-2 rounded mb-4" style={{ color: 'rgba(255,248,220,0.88)', background: 'rgba(255,248,220,0.04)', border: '1px solid var(--lux-border)' }}>
                {qrPreview.qr_url || `${window.location.origin}${qrPreview.invitation_link}`}
              </div>
              <div className="flex gap-2">
                {qrPreview.qr_image && (
                  <a
                    href={qrPreview.qr_image}
                    download={`invitation-${qrPreview.event_type}.png`}
                    className="lux-btn flex-1 justify-center"
                    data-testid="qr-download"
                  >
                    <Download className="w-4 h-4" /> Download PNG
                  </a>
                )}
                <button
                  onClick={() => { copyLink(qrPreview.invitation_link, qrPreview.id); }}
                  className="lux-btn lux-btn-ghost flex-1 justify-center"
                  data-testid="qr-copy-link"
                >
                  <Copy className="w-4 h-4" /> Copy link
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event photos panel modal */}
      <AnimatePresence>
        {photosPanel && (
          <EventPhotosPanel
            profileId={profileId}
            invitation={photosPanel}
            onClose={() => setPhotosPanel(null)}
          />
        )}
      </AnimatePresence>

      {/* Client Access modal — manage the couple/family login for this invitation */}
      <AnimatePresence>
        {clientPanelOpen && (
          <ClientAccessPanel
            profileId={profileId}
            coupleName={profile ? `${profile.groom_name || ''}${profile.groom_name && profile.bride_name ? ' & ' : ''}${profile.bride_name || ''}`.trim() : ''}
            onClose={() => setClientPanelOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const ReviewRow = ({ label, value, mono }) => (
  <div className="flex items-start gap-4 px-4 py-3 rounded-lg" style={{ background: 'rgba(255,248,220,0.03)', border: '1px solid var(--lux-border)' }}>
    <div className="text-[10px] tracking-[0.3em] uppercase w-28 shrink-0 pt-0.5" style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</div>
    <div className={(mono ? 'font-mono break-all ' : '') + 'text-sm'} style={{ color: '#FFF8DC' }}>{value}</div>
  </div>
);

const ActionBtn = ({ icon: Icon, label, onClick, testid, primary, danger }) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all"
    style={
      primary
        ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
        : danger
        ? { background: 'rgba(139,0,0,0.16)', color: '#FFD7C9', border: '1px solid rgba(139,0,0,0.45)' }
        : { background: 'transparent', color: 'rgba(255,248,220,0.9)', border: '1px solid var(--lux-border)' }
    }
  >
    <Icon className="w-3 h-3" /> {label}
  </button>
);

export default EventInvitationWizard;

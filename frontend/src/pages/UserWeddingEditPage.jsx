// BUG J — Normal-user wedding-invitation edit page.
//
// Background: the user dashboard previously had no Edit button at all, so
// once a normal user created their invitation they couldn't fix a typo,
// change the venue, or update the wedding date. CelebrationProfileForm
// already supported user edits at /user/celebration/:profileId/edit, but no
// equivalent existed for the wedding category — UserInvitationForm requires
// themeId/event/designId in the URL because it doubles as the *creation*
// wizard, and isn't suitable for editing an existing invitation.
//
// This page is a focused, minimal edit form against the existing
// PATCH /api/users/profiles/{id} endpoint, which whitelists exactly the
// fields a guest-facing user is allowed to change (names, venue, date, etc.).
//
// Route registered as /user/profile/:profileId/edit in App.js.

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Loader2, ExternalLink } from 'lucide-react';
import { useUserAuth } from '@/context/UserAuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const FIELD_LABELS = {
  bride_name:         'Bride Name',
  groom_name:         'Groom Name',
  event_date:         'Event Date',
  venue:              'Venue',
  city:               'City',
  invitation_message: 'Invitation Message',
  about_couple:       'About the Couple',
  love_story:         'Love Story',
  whatsapp_groom:     "Groom's WhatsApp (E.164)",
  whatsapp_bride:     "Bride's WhatsApp (E.164)",
};

// Multi-line fields render as <textarea>
const TEXTAREA_FIELDS = new Set(['invitation_message', 'about_couple', 'love_story']);

const UserWeddingEditPage = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useUserAuth();

  const [profile, setProfile]   = useState(null);
  const [form, setForm]         = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(`/?signin=1&return=${encodeURIComponent(window.location.pathname)}`, { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Load existing profile
  useEffect(() => {
    if (authLoading || !user) return;
    let alive = true;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/api/users/profiles/${profileId}`, { withCredentials: true });
        if (!alive) return;
        setProfile(r.data);
        // Seed form with only the editable fields the backend will accept.
        const seed = {};
        Object.keys(FIELD_LABELS).forEach((k) => {
          let v = r.data?.[k] ?? '';
          if (k === 'event_date' && v) {
            try { v = new Date(v).toISOString().slice(0, 16); } catch (_) { /* keep raw */ }
          }
          seed[k] = v;
        });
        setForm(seed);
      } catch (e) {
        setError(e?.response?.data?.detail || 'Could not load invitation');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [profileId, authLoading, user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e?.preventDefault?.();
    setError(''); setSuccess(''); setSaving(true);
    try {
      // Build the patch body — drop empty strings so we don't overwrite
      // existing values with blanks unintentionally.
      const body = {};
      Object.keys(form).forEach((k) => {
        const v = form[k];
        if (v === '' || v === null || v === undefined) return;
        body[k] = v;
      });
      if (body.event_date) {
        // Normalize datetime-local back to ISO 8601 with Z.
        try { body.event_date = new Date(body.event_date).toISOString(); } catch (_) {}
      }
      const r = await axios.patch(
        `${API_URL}/api/users/profiles/${profileId}`,
        body,
        { withCredentials: true },
      );
      setProfile(r.data?.profile || profile);
      setSuccess('Saved successfully.');
      // Auto-clear after 4s
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Could not save changes';
      setError(typeof msg === 'string' ? msg : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="luxe luxe-grain min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="luxe luxe-grain min-h-screen px-6 py-16 text-center">
        <p style={{ color: 'var(--lux-text)' }}>Invitation not found.</p>
        <button onClick={() => navigate('/user/dashboard')} className="lux-btn mt-4">
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="luxe luxe-grain min-h-screen px-4 md:px-12 py-10" data-testid="user-wedding-edit">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate('/user/dashboard')}
          className="lux-btn lux-btn-ghost mb-6 inline-flex items-center gap-2" data-testid="uwe-back">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <span className="lux-eyebrow block mb-2">◆ Edit invitation</span>
          <h1 className="font-display text-[2rem] md:text-[2.6rem] mb-2" style={{ color: 'var(--lux-text)' }}>
            {profile.bride_name} <span className="text-gold italic font-script">&amp;</span> {profile.groom_name}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>
            Update text, dates, and venues. Design / theme changes aren't supported here.
          </p>
        </motion.div>

        {error && (
          <div className="mb-4 p-3 rounded-md text-sm" style={{ background: 'rgba(190,40,40,0.18)', border: '1px solid rgba(190,40,40,0.45)', color: '#FFD7D7' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-md text-sm" style={{ background: 'rgba(40,140,80,0.18)', border: '1px solid rgba(40,140,80,0.55)', color: '#D7FFE5' }}>
            {success}
          </div>
        )}

        <form onSubmit={submit} className="lux-glass p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.keys(FIELD_LABELS).map((k) => {
            const isTextarea = TEXTAREA_FIELDS.has(k);
            return (
              <label key={k} className={`block text-xs ${isTextarea ? 'md:col-span-2' : ''}`} style={{ color: 'var(--lux-text)' }}>
                <span className="block mb-1 tracking-[0.15em] uppercase">{FIELD_LABELS[k]}</span>
                {isTextarea ? (
                  <textarea
                    value={form[k] || ''}
                    onChange={(e) => set(k, e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-md"
                    style={{ background: 'rgba(10,7,4,0.6)', border: '1px solid rgba(212,175,55,0.35)', color: 'var(--lux-text)' }}
                    data-testid={`uwe-${k}`}
                  />
                ) : (
                  <input
                    type={k === 'event_date' ? 'datetime-local' : 'text'}
                    value={form[k] || ''}
                    onChange={(e) => set(k, e.target.value)}
                    className="w-full px-3 py-2 rounded-md"
                    style={{ background: 'rgba(10,7,4,0.6)', border: '1px solid rgba(212,175,55,0.35)', color: 'var(--lux-text)' }}
                    data-testid={`uwe-${k}`}
                  />
                )}
              </label>
            );
          })}

          <div className="md:col-span-2 flex flex-wrap gap-3 mt-2">
            <button
              type="submit"
              disabled={saving}
              className="lux-btn flex items-center gap-2"
              data-testid="uwe-save"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => window.open(`${window.location.origin}/invite/${profile.slug}`, '_blank')}
              className="lux-btn lux-btn-ghost flex items-center gap-2"
              data-testid="uwe-preview"
            >
              <ExternalLink className="w-4 h-4" /> Preview link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserWeddingEditPage;

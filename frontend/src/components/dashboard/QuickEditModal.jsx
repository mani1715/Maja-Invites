import React, { useEffect, useState } from 'react';
import { X, Save, Tag as TagIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * QuickEditModal — rename couple, change date, toggle status, manage tags
 * in a single popover without leaving the dashboard.
 */
export const QuickEditModal = ({ open, onClose, profile, onSaved }) => {
  const [bride, setBride] = useState('');
  const [groom, setGroom] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!profile) return;
    setBride(profile.bride_name || '');
    setGroom(profile.groom_name || '');
    setDate(profile.event_date ? String(profile.event_date).slice(0, 10) : '');
    setStatus(profile.status || (profile.is_published ? 'PUBLISHED' : 'DRAFT'));
    setTags(profile.tags || []);
    setErr(null);
  }, [profile]);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.length >= 20) return setErr('Maximum 20 tags allowed');
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };
  const removeTag = (t) => setTags(tags.filter(x => x !== t));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await axios.patch(`${API_URL}/api/admin/profiles/${profile.id}/quick`, {
        bride_name: bride.trim() || null,
        groom_name: groom.trim() || null,
        event_date: date ? new Date(date).toISOString() : null,
        status,
        tags,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && profile && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(8,5,3,0.78)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
          data-testid="quick-edit-modal"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="lux-glass w-full max-w-lg p-7 relative"
          >
            <button onClick={onClose} className="absolute right-4 top-4 opacity-70 hover:opacity-100"
              data-testid="quick-edit-close">
              <X className="w-5 h-5" style={{ color: '#FFF8DC' }} />
            </button>
            <span className="lux-eyebrow block mb-2">◆ Quick edit</span>
            <h3 className="font-display text-2xl mb-5" style={{ color: '#FFF8DC' }}>
              Update couple details
            </h3>

            <div className="space-y-4">
              <Field label="Bride name">
                <input value={bride} onChange={(e) => setBride(e.target.value)}
                  className="lux-input" data-testid="quick-edit-bride" />
              </Field>
              <Field label="Groom name">
                <input value={groom} onChange={(e) => setGroom(e.target.value)}
                  className="lux-input" data-testid="quick-edit-groom" />
              </Field>
              <Field label="Wedding date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="lux-input" data-testid="quick-edit-date" />
              </Field>
              <Field label="Status">
                {/* BUG 3 FIX (Option A): the PUBLISHED option used to be
                    available here. Choosing it called PATCH .../quick which
                    directly set status=PUBLISHED in Mongo, BYPASSING the
                    lifecycle service so no credits were deducted. We removed
                    the option — to publish a draft the photographer must use
                    the Publish step in the full editor which deducts credits
                    correctly. Quick-edit can still revert PUBLISHED → DRAFT
                    (a "Revert to draft" option is shown if the profile is
                    currently published) since unpublishing has no credit
                    side-effect. */}
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="lux-input" data-testid="quick-edit-status">
                  <option value="DRAFT">Draft</option>
                  {profile?.status === 'PUBLISHED' && (
                    <option value="PUBLISHED">Published (current)</option>
                  )}
                </select>
                {profile?.status !== 'PUBLISHED' && (
                  <span className="block mt-1.5 text-[10px]" style={{ color: 'rgba(255,248,220,0.7)' }}>
                    To publish, open the full editor → Publish step (credits will be deducted).
                  </span>
                )}
              </Field>

              <Field label={`Tags (${tags.length}/20)`}>
                <div className="flex gap-2">
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    placeholder="VIP, Premium, January Bride…"
                    className="lux-input flex-1" data-testid="quick-edit-tag-input" />
                  <button type="button" onClick={addTag} className="lux-btn lux-btn-ghost"
                    data-testid="quick-edit-tag-add">
                    <TagIcon className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3" data-testid="quick-edit-tags">
                    {tags.map((t) => (
                      <span key={t}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] tracking-wide"
                        style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid var(--lux-gold)', color: '#D4AF37' }}>
                        {t}
                        <button onClick={() => removeTag(t)} className="opacity-70 hover:opacity-100">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </Field>
            </div>

            {err && <div className="mt-4 text-xs" style={{ color: '#EF4444' }} data-testid="quick-edit-error">{err}</div>}

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={onClose} className="lux-btn lux-btn-ghost" data-testid="quick-edit-cancel">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="lux-btn" data-testid="quick-edit-save">
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.3em] uppercase mb-1.5"
      style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</span>
    {children}
  </label>
);

export default QuickEditModal;

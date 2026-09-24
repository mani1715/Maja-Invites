import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Sparkles, X, Copy, Check, Wand2, RotateCcw } from 'lucide-react';
import '../../styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * AIStoryComposer — Cinematic Indian wedding copy generator.
 *
 * Wraps backend POST /api/admin/ai/story (Google Gemini via direct API).
 *
 * Props:
 *   open, onClose
 *   onInsert(text) - optional callback when user clicks "Use this"
 *   defaults: { bride, groom, theme, language, tone, kind }
 */
const STORY_KINDS = [
  { id: 'invitation',     label: 'Invitation Prose' },
  { id: 'love_story',     label: 'Our Love Story' },
  { id: 'event_intro',    label: 'Event Introduction' },
  { id: 'thank_you',      label: 'Thank-You Note' },
  { id: 'vows',           label: 'Wedding Vows' },
];

const TONES = [
  { id: 'cinematic_royal',   label: 'Cinematic Royal' },
  { id: 'modern_minimal',    label: 'Modern Minimal' },
  { id: 'poetic_traditional',label: 'Poetic Traditional' },
  { id: 'playful_punjabi',   label: 'Playful Punjabi' },
];

const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Punjabi', 'Hinglish'];

const MODELS = [
  { id: 'claude', label: 'Claude Sonnet 4.5 (Anthropic)' },
  { id: 'gemini', label: 'Gemini 2.5 Flash (Google)' },
];

const AIStoryComposer = ({ open, onClose, onInsert, defaults = {} }) => {
  const [form, setForm] = useState({
    kind: defaults.kind || 'invitation',
    bride: defaults.bride || '',
    groom: defaults.groom || '',
    theme: defaults.theme || 'royal_mughal',
    tone: defaults.tone || 'cinematic_royal',
    language: defaults.language || 'English',
    event_name: defaults.event_name || '',
    notes: defaults.notes || '',
    model: defaults.model || 'claude',
  });
  const [loading, setLoading] = useState(false);
  const [story, setStory] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setError(''); setStory(''); setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/admin/ai/story`, form);
      setStory(res.data.story || '');
    } catch (e) {
      const status = e.response?.status;
      let msg = e.response?.data?.detail || 'AI service is unreachable. Please try again.';
      if (status === 503 || status === 502 || (typeof msg === 'string' && (msg.toLowerCase().includes('budget') || msg.toLowerCase().includes('muse')))) {
        // Backend already produces a friendly message for 503 — show it as-is.
        msg = typeof msg === 'string' && msg.length > 0 ? msg : 'Our AI muse is catching her breath — please try again in a moment.';
      } else if (status === 401 || status === 403) {
        msg = 'Your session has expired. Please log in again.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(story);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (_) { /* ignore */ }
  };

  const reset = () => { setStory(''); setError(''); };

  // Lock body scroll while modal is open so the photographer is taken
  // straight to the "enter details" panel without the page scrolling
  // behind it. This fixes the reported issue where clicking AI Compose
  // appeared to "scroll the page to the bottom" instead of opening the
  // composer in front.
  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    const prevScrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    // Make sure the modal is visible immediately at the top of the
    // viewport in case the page was scrolled deep when the user clicked.
    window.scrollTo({ top: prevScrollY, left: 0, behavior: 'auto' });
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  return createPortal(
    (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 luxe luxe-grain"
            style={{ background: 'rgba(8,5,3,0.72)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
            data-testid="ai-story-modal"
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="lux-glass relative w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8 md:p-10"
              style={{ background: 'rgba(14,10,6,0.95)' }}
            >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-9 h-9 rounded-full grid place-items-center transition-colors"
              style={{ color: 'rgba(255,248,220,0.8)', border: '1px solid var(--lux-border)' }}
              data-testid="ai-story-close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-6">
              <span className="lux-eyebrow block mb-3" data-testid="ai-story-model-badge">
                ◆ {form.model === 'gemini' ? 'Gemini 2.5 Flash' : 'Claude Sonnet 4.5'}
              </span>
              <h2 className="font-display text-3xl md:text-4xl leading-tight" style={{ color: '#FFF8DC' }}>
                AI Story <span className="text-gold italic font-script">Composer</span>
              </h2>
              <p className="mt-2 text-sm" style={{ color: 'rgba(255,248,220,0.8)' }}>
                Cinematic Indian wedding prose in seconds — invitation copy, vows, event intros and more.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <Field label="AI Model">
                <Select value={form.model} onChange={(v) => update('model', v)} options={MODELS} testid="ai-story-model" />
              </Field>
              <Field label="Story Type">
                <Select value={form.kind} onChange={(v) => update('kind', v)} options={STORY_KINDS} testid="ai-story-kind" />
              </Field>
              <Field label="Tone">
                <Select value={form.tone} onChange={(v) => update('tone', v)} options={TONES} testid="ai-story-tone" />
              </Field>
              <Field label="Bride Name">
                <Input value={form.bride} onChange={(v) => update('bride', v)} placeholder="e.g. Anaya" testid="ai-story-bride" />
              </Field>
              <Field label="Groom Name">
                <Input value={form.groom} onChange={(v) => update('groom', v)} placeholder="e.g. Rohan" testid="ai-story-groom" />
              </Field>
              <Field label="Language">
                <Select value={form.language} onChange={(v) => update('language', v)} options={LANGUAGES.map((l) => ({ id: l, label: l }))} testid="ai-story-language" />
              </Field>
              <Field label="Event (optional)">
                <Input value={form.event_name} onChange={(v) => update('event_name', v)} placeholder="Sangeet, Mehndi…" testid="ai-story-event" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Notes / Brief (optional)">
                  <Textarea value={form.notes} onChange={(v) => update('notes', v)} placeholder="Met during a Mumbai monsoon, both architects, love Sufi music…" testid="ai-story-notes" />
                </Field>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              <button onClick={generate} disabled={loading || !form.bride || !form.groom} className="lux-btn" data-testid="ai-story-generate">
                {loading ? (<><Sparkles className="w-4 h-4 animate-pulse" /> Composing</>) : (<><Wand2 className="w-4 h-4" /> Compose Story</>)}
              </button>
              {story && (
                <button onClick={reset} className="lux-btn lux-btn-ghost" data-testid="ai-story-reset">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              )}
            </div>

            {error && (
              <div className="mb-5 px-4 py-3 rounded-lg text-sm"
                style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(139,0,0,0.5)', color: '#FFD7C9' }}>
                {error}
              </div>
            )}

            {story && (
              <motion.div
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                className="p-6 rounded-xl"
                style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid var(--lux-border-strong)' }}
                data-testid="ai-story-output"
              >
                <pre className="font-heading text-[1.05rem] md:text-[1.12rem] leading-[1.85] whitespace-pre-wrap"
                  style={{ color: '#FFF8DC', fontFamily: 'Fraunces, serif' }}>
                  {story}
                </pre>
                <div className="lux-hairline my-5" />
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleCopy} className="lux-btn lux-btn-ghost" data-testid="ai-story-copy">
                    {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                  {onInsert && (
                    <button onClick={() => onInsert(story)} className="lux-btn" data-testid="ai-story-insert">
                      Use this <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    ),
    document.body
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</span>
    {children}
  </label>
);

const baseInputStyle = {
  width: '100%',
  padding: '0.85rem 1rem',
  background: 'transparent',
  color: '#FFF8DC',
  border: '1px solid var(--lux-border)',
  borderRadius: '0.5rem',
  outline: 'none',
  fontFamily: 'Manrope, sans-serif',
  fontSize: '0.92rem',
  caretColor: '#D4AF37',
  transition: 'border-color 0.4s var(--ease-cinema)',
};

const Input = ({ value, onChange, placeholder, testid }) => (
  <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    style={baseInputStyle}
    onFocus={(e) => (e.target.style.borderColor = '#D4AF37')}
    onBlur={(e) => (e.target.style.borderColor = 'var(--lux-border)')}
    data-testid={testid}
  />
);

const Textarea = ({ value, onChange, placeholder, testid }) => (
  <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
    style={{ ...baseInputStyle, resize: 'vertical', minHeight: 88 }}
    onFocus={(e) => (e.target.style.borderColor = '#D4AF37')}
    onBlur={(e) => (e.target.style.borderColor = 'var(--lux-border)')}
    data-testid={testid}
  />
);

const Select = ({ value, onChange, options, testid }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...baseInputStyle, appearance: 'none', cursor: 'pointer' }}
    onFocus={(e) => (e.target.style.borderColor = '#D4AF37')}
    onBlur={(e) => (e.target.style.borderColor = 'var(--lux-border)')}
    data-testid={testid}
  >
    {options.map((o) => (
      <option key={o.id} value={o.id} style={{ background: '#1A130B', color: '#FFF8DC' }}>{o.label}</option>
    ))}
  </select>
);

export default AIStoryComposer;

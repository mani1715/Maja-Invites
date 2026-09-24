import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { ArrowLeft, Sparkles, Wand2, Languages, UserCircle, Image as ImageIcon, Copy, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const LANG_OPTIONS = [
  { id: 'en', label: 'English' }, { id: 'hi', label: 'Hindi' },
  { id: 'te', label: 'Telugu' }, { id: 'ta', label: 'Tamil' },
  { id: 'kn', label: 'Kannada' }, { id: 'mr', label: 'Marathi' },
  { id: 'bn', label: 'Bengali' },
];
const TONES = [
  { id: 'royal', label: 'Royal' }, { id: 'emotional', label: 'Emotional' },
  { id: 'poetic', label: 'Poetic' }, { id: 'cinematic', label: 'Cinematic' },
  { id: 'traditional', label: 'Traditional' }, { id: 'modern', label: 'Modern' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  visible: (i = 0) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] } }),
};

const TABS = [
  { id: 'story',     label: 'Love Story',       icon: Sparkles },
  { id: 'greeting',  label: 'Greeting',         icon: UserCircle },
  { id: 'translate', label: 'Translate',        icon: Languages },
  { id: 'enhance',   label: 'Image Enhance',    icon: ImageIcon },
];

const AIStudio = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();
  const [tab, setTab] = useState('story');

  React.useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  React.useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login');
  }, [admin, authLoading, navigate]);

  return (
    <div className="luxe min-h-screen" data-testid="ai-studio">
      <div className="px-6 md:px-12 py-10 max-w-[1400px] mx-auto">
        <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost mb-6" data-testid="ais-back">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-8">
          <span className="lux-eyebrow block mb-3">◆ Claude Sonnet 4.5 + MAJA</span>
          <h1 className="font-display text-[2.2rem] md:text-[3.6rem] leading-tight" style={{ color: 'var(--lux-text)' }}>
            AI <span className="font-script italic text-gold">Studio</span>
          </h1>
          <p className="mt-3 text-sm max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
            Compose cinematic love stories, personalize every guest's greeting, translate to 7 Indian languages, and auto-enhance photos.
          </p>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1}
          className="flex flex-wrap gap-2 mb-6">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-full text-xs tracking-[0.15em] uppercase inline-flex items-center gap-1.5"
              style={tab === t.id
                ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                : { background: 'transparent', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
              data-testid={`ais-tab-${t.id}`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </motion.div>

        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
          {tab === 'story'     && <StoryPanel />}
          {tab === 'greeting'  && <GreetingPanel />}
          {tab === 'translate' && <TranslatePanel />}
          {tab === 'enhance'   && <EnhancePanel />}
        </motion.div>
      </div>
    </div>
  );
};

const StoryPanel = () => {
  const [form, setForm] = useState({
    bride: '', groom: '', how_we_met: '', proposal_story: '', wedding_journey: '',
    tone: 'cinematic', language: 'en', cultural_region: '',
  });
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const generate = async () => {
    if (!form.bride || !form.groom) { setError('Bride and groom names are required.'); return; }
    setLoading(true); setError(''); setOutput('');
    try {
      const res = await axios.post(`${API_URL}/api/admin/ai/story-v2`, form);
      setOutput(res.data.story || '');
    } catch (e) {
      setError(e.response?.data?.detail || 'AI is resting briefly. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="lux-glass p-6 md:p-8" data-testid="ais-story-panel">
      <h3 className="font-display text-2xl mb-5" style={{ color: 'var(--lux-text)' }}>Love Story Composer</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <Input label="Bride name"  value={form.bride}  onChange={(v) => setForm({ ...form, bride: v })}  testid="ais-story-bride" />
        <Input label="Groom name"  value={form.groom}  onChange={(v) => setForm({ ...form, groom: v })}  testid="ais-story-groom" />
        <Select label="Tone"       value={form.tone}     options={TONES}    onChange={(v) => setForm({ ...form, tone: v })}     testid="ais-story-tone" />
        <Select label="Language"   value={form.language} options={LANG_OPTIONS} onChange={(v) => setForm({ ...form, language: v })} testid="ais-story-lang" />
        <Input label="Cultural region (optional)" value={form.cultural_region} onChange={(v) => setForm({ ...form, cultural_region: v })}
          placeholder="e.g. Mughlai, Tamil Brahmin, Marwari" testid="ais-story-region" />
      </div>
      <Textarea label="How you met"      value={form.how_we_met}      onChange={(v) => setForm({ ...form, how_we_met: v })}      placeholder="Met in a Bangalore café, both ordered the same masala chai…" testid="ais-story-met" />
      <Textarea label="The proposal"     value={form.proposal_story}  onChange={(v) => setForm({ ...form, proposal_story: v })}  placeholder="On the Marina Beach at dawn…"                                       testid="ais-story-proposal" />
      <Textarea label="Wedding journey" value={form.wedding_journey} onChange={(v) => setForm({ ...form, wedding_journey: v })} placeholder="Both families, joining traditions…"                                  testid="ais-story-journey" />

      <button onClick={generate} disabled={loading} className="lux-btn mt-4" data-testid="ais-story-generate">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Compose story
      </button>

      {error && <ErrorBox text={error} />}
      {output && <OutputBox text={output} />}
    </div>
  );
};

const GreetingPanel = () => {
  const [form, setForm] = useState({ guest_name: '', relation: '', tone: 'warm', language: 'en', couple: '' });
  const [out, setOut] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const GREETING_TONES = [
    { id: 'formal', label: 'Formal' }, { id: 'warm', label: 'Warm' },
    { id: 'playful', label: 'Playful' }, { id: 'royal', label: 'Royal' },
  ];

  const generate = async () => {
    if (!form.guest_name) { setError('Guest name is required.'); return; }
    setLoading(true); setError(''); setOut('');
    try {
      const res = await axios.post(`${API_URL}/api/admin/ai/greeting-personalize`, form);
      setOut(res.data.greeting);
    } catch (e) {
      setError(e.response?.data?.detail || 'AI is resting briefly.');
    } finally { setLoading(false); }
  };

  return (
    <div className="lux-glass p-6 md:p-8" data-testid="ais-greeting-panel">
      <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>Personalised greeting</h3>
      <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
        Auto-generate "Dear Sharma Ji"-style cinematic greetings per guest. Paste into WhatsApp invitations or your guest list.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <Input label="Guest name"  value={form.guest_name} onChange={(v) => setForm({ ...form, guest_name: v })}  testid="ais-greet-guest"
          placeholder="Sharma Ji" />
        <Input label="Relation (optional)" value={form.relation} onChange={(v) => setForm({ ...form, relation: v })} testid="ais-greet-relation"
          placeholder="family elder / friend / colleague" />
        <Select label="Tone"     value={form.tone}     options={GREETING_TONES} onChange={(v) => setForm({ ...form, tone: v })}     testid="ais-greet-tone" />
        <Select label="Language" value={form.language} options={LANG_OPTIONS}   onChange={(v) => setForm({ ...form, language: v })} testid="ais-greet-lang" />
        <Input label="Couple (optional)" value={form.couple} onChange={(v) => setForm({ ...form, couple: v })} testid="ais-greet-couple"
          placeholder="Riya & Aarav" />
      </div>
      <button onClick={generate} disabled={loading} className="lux-btn" data-testid="ais-greet-generate">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate greeting
      </button>
      {error && <ErrorBox text={error} />}
      {out && <OutputBox text={out} compact />}
    </div>
  );
};

const TranslatePanel = () => {
  const [items, setItems] = useState({
    invitation: 'With joyful hearts, we invite you to celebrate our wedding.',
    rsvp_prompt: 'Will you join us on our special day?',
  });
  const [lang, setLang] = useState('hi');
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (k, v) => setItems({ ...items, [k]: v });
  const generate = async () => {
    setLoading(true); setError(''); setOut(null);
    try {
      const res = await axios.post(`${API_URL}/api/admin/ai/translate-bulk`, { items, target_language: lang });
      setOut(res.data.translations);
    } catch (e) {
      setError(e.response?.data?.detail || 'Translation failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="lux-glass p-6 md:p-8" data-testid="ais-translate-panel">
      <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>Bulk translator</h3>
      <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
        Preserves cultural meaning, names, and tone. Outputs structured JSON.
      </p>
      <div className="grid grid-cols-1 gap-3 mb-4">
        {Object.entries(items).map(([k, v]) => (
          <div key={k}>
            <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{k}</span>
            <textarea value={v} onChange={(e) => update(k, e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm" rows={2}
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
              data-testid={`ais-translate-${k}`} />
          </div>
        ))}
        <Select label="Target language" value={lang} onChange={setLang} options={LANG_OPTIONS} testid="ais-translate-lang" />
      </div>
      <button onClick={generate} disabled={loading} className="lux-btn" data-testid="ais-translate-generate">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />} Translate
      </button>
      {error && <ErrorBox text={error} />}
      {out && (
        <div className="mt-5 p-4 rounded-lg space-y-2" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid var(--lux-border-strong)' }} data-testid="ais-translate-output">
          {Object.entries(out).map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] tracking-[0.3em] uppercase mb-0.5" style={{ color: 'var(--lux-text-muted)' }}>{k}</div>
              <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EnhancePanel = () => {
  const [preview, setPreview] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flags, setFlags] = useState({ lighting: true, color: true, skin_tone: true, upscale: true });

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { setError('Image too large (max 8MB).'); return; }
    setError(''); setOutput('');
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(f);
  };

  const enhance = async () => {
    if (!preview) { setError('Pick a photo first.'); return; }
    setLoading(true); setError(''); setOutput('');
    try {
      const enhancements = Object.entries(flags).filter(([, v]) => v).map(([k]) => k);
      const res = await axios.post(`${API_URL}/api/admin/ai/enhance-image`, {
        image_base64: preview, enhancements,
      });
      setOutput(res.data.enhanced_image);
    } catch (e) {
      setError(e.response?.data?.detail || 'Enhancement failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="lux-glass p-6 md:p-8" data-testid="ais-enhance-panel">
      <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>Photo enhancer</h3>
      <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
        Auto-lighting, color grading, skin-tone balance and 2× upscale — all on-device.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {Object.keys(flags).map((k) => (
          <label key={k} className="flex items-center gap-2 p-2.5 rounded-lg cursor-pointer"
            style={{ border: '1px solid var(--lux-border)' }}>
            <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })}
              data-testid={`ais-enh-${k}`} />
            <span className="text-xs capitalize" style={{ color: 'var(--lux-text)' }}>{k.replace('_', ' ')}</span>
          </label>
        ))}
      </div>
      <input type="file" accept="image/*" onChange={onFile} className="text-sm mb-4"
        style={{ color: 'var(--lux-text)' }} data-testid="ais-enh-file" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {preview && (
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>Original</div>
            <img src={preview} alt="" className="w-full rounded-lg" style={{ border: '1px solid var(--lux-border)' }} />
          </div>
        )}
        {output && (
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>Enhanced</div>
            <img src={output} alt="" className="w-full rounded-lg" style={{ border: '1px solid var(--lux-gold)' }} />
            <a href={output} download="enhanced.jpg" className="lux-btn lux-btn-ghost text-xs mt-2" data-testid="ais-enh-download">Download</a>
          </div>
        )}
      </div>
      <button onClick={enhance} disabled={loading || !preview} className="lux-btn mt-4" data-testid="ais-enh-go">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Enhance photo
      </button>
      {error && <ErrorBox text={error} />}
    </div>
  );
};

// shared atoms
const baseStyle = {
  width: '100%', padding: '0.7rem 0.9rem', background: 'transparent', color: 'var(--lux-text)',
  border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none', fontSize: '0.9rem',
};
const Input = ({ label, value, onChange, testid, placeholder }) => (
  <label className="block">
    <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={baseStyle} data-testid={testid} />
  </label>
);
const Textarea = ({ label, value, onChange, testid, placeholder }) => (
  <label className="block mb-3">
    <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
      style={{ ...baseStyle, resize: 'vertical' }} data-testid={testid} />
  </label>
);
const Select = ({ label, value, options, onChange, testid }) => (
  <label className="block">
    <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...baseStyle, cursor: 'pointer' }} data-testid={testid}>
      {options.map((o) => (<option key={o.id} value={o.id} style={{ background: '#1A130B', color: '#FFF8DC' }}>{o.label}</option>))}
    </select>
  </label>
);
const ErrorBox = ({ text }) => (
  <div className="mt-4 px-3 py-2 rounded text-sm" style={{ background: 'rgba(139,0,0,0.18)', color: '#FFD7C9' }}>{text}</div>
);
const OutputBox = ({ text, compact }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {} };
  return (
    <div className="mt-5 p-5 rounded-lg" style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid var(--lux-border-strong)' }} data-testid="ais-output-box">
      <pre className={`font-heading whitespace-pre-wrap ${compact ? 'text-base' : 'text-[1.05rem] leading-[1.85]'}`}
        style={{ color: 'var(--lux-text)', fontFamily: 'Fraunces, serif' }}>{text}</pre>
      <button onClick={copy} className="lux-btn lux-btn-ghost mt-3 text-xs">{copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}</button>
    </div>
  );
};

export default AIStudio;

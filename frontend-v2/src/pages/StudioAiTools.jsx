import { useState } from 'react';
import StudioModule, { Panel, Segmented, Toast, InlineError, useFlash } from '@/components/StudioModule';
import * as api from '@/api/studioOps';

// AI writing tools — three real endpoints in premium_features.py that had no
// surface anywhere in v2.
//
// These are AUTHORING AIDS, not automation. Every one returns text for a human
// to read, edit and paste into an invitation; nothing here writes to a
// wedding. That framing is deliberate — the copy says so, because an owner
// should never be unsure whether a button changed a live invitation.
//
// When GEMINI_API_KEY is missing the server answers 503 with "AI muse is
// resting…". We show the server's own sentence rather than inventing one, so
// the reason a thing failed is the real reason.

const LANGS = [
  ['en', 'English'], ['te', 'Telugu'], ['hi', 'Hindi'], ['ta', 'Tamil'],
  ['kn', 'Kannada'], ['mr', 'Marathi'], ['bn', 'Bengali'],
];

// Exactly the Literal values the Pydantic models accept — anything else is 422.
const GREETING_TONES = [['warm', 'Warm'], ['formal', 'Formal'], ['playful', 'Playful'], ['royal', 'Royal']];
const STORY_TONES = [
  ['cinematic', 'Cinematic'], ['royal', 'Royal'], ['emotional', 'Emotional'],
  ['poetic', 'Poetic'], ['traditional', 'Traditional'], ['modern', 'Modern'],
];

export default function StudioAiTools() {
  const [view, setView] = useState('story');
  const [toast, flash] = useFlash();

  return (
    <StudioModule
      active="AI tools"
      title="AI writing tools"
      sub="Drafts for you to edit and paste. Nothing here changes a live invitation."
    >
      <Segmented
        ariaLabel="AI tools"
        value={view}
        onChange={setView}
        options={[
          { id: 'story', label: 'Love story' },
          { id: 'greeting', label: 'Guest greeting' },
          { id: 'translate', label: 'Translate' },
        ]}
      />

      {view === 'story' && <StoryTool flash={flash} />}
      {view === 'greeting' && <GreetingTool flash={flash} />}
      {view === 'translate' && <TranslateTool flash={flash} />}

      <Toast message={toast} />
    </StudioModule>
  );
}

/** Copy helper. navigator.clipboard needs a secure context; fall back to
 *  selecting the text so the user can still copy it by hand. */
async function copy(text, flash) {
  try {
    await navigator.clipboard.writeText(text);
    flash('Copied.');
  } catch {
    flash('Select the text and copy it.');
  }
}

function Output({ text, flash, label = 'Result' }) {
  if (!text) return null;
  return (
    <Panel title={label} sub="Read it before you use it — it is a draft, not a finished line.">
      <p style={{ whiteSpace: 'pre-line', fontSize: 15, lineHeight: 1.75, margin: 0 }}>{text}</p>
      <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ marginTop: 14 }} onClick={() => copy(text, flash)}>
        Copy
      </button>
    </Panel>
  );
}

function StoryTool({ flash }) {
  const [f, setF] = useState({
    bride: '', groom: '', how_we_met: '', proposal_story: '', wedding_journey: '',
    tone: 'cinematic', language: 'en', cultural_region: '',
  });
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErr(null); };

  const run = async () => {
    if (!f.bride.trim() || !f.groom.trim()) { setErr('Both names are needed.'); return; }
    setBusy(true); setErr(null);
    try {
      const { data } = await api.aiStory({
        ...f,
        bride: f.bride.trim(),
        groom: f.groom.trim(),
        // The model takes Optional[str]; empty strings would be written into
        // the prompt as blank sections, so send null instead.
        how_we_met: f.how_we_met.trim() || null,
        proposal_story: f.proposal_story.trim() || null,
        wedding_journey: f.wedding_journey.trim() || null,
        cultural_region: f.cultural_region.trim() || null,
      });
      setOut(data.story || '');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not work.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <InlineError message={err} />
      <Panel title="Love story" sub="Three paragraphs from the couple's own details. The more you give it, the less generic it reads.">
        <div className="wmod-grid">
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="ai-bride">Bride</label>
            <input id="ai-bride" data-mj-field className="wmod-input" value={f.bride} onChange={set('bride')} />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="ai-groom">Groom</label>
            <input id="ai-groom" data-mj-field className="wmod-input" value={f.groom} onChange={set('groom')} />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="ai-tone">Tone</label>
            <select id="ai-tone" data-mj-field className="wmod-input" value={f.tone} onChange={set('tone')}>
              {STORY_TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="ai-lang">Language</label>
            <select id="ai-lang" data-mj-field className="wmod-input" value={f.language} onChange={set('language')}>
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="ai-region">Region <span className="wmod-td-muted">(optional)</span></label>
            <input id="ai-region" data-mj-field className="wmod-input" value={f.cultural_region} onChange={set('cultural_region')} placeholder="Telugu, Kerala, Punjabi…" />
          </div>
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="ai-met">How they met</label>
            <textarea id="ai-met" data-mj-field className="wmod-input" rows={2} value={f.how_we_met} onChange={set('how_we_met')} />
          </div>
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="ai-prop">The proposal</label>
            <textarea id="ai-prop" data-mj-field className="wmod-input" rows={2} value={f.proposal_story} onChange={set('proposal_story')} />
          </div>
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="ai-journey">The journey since</label>
            <textarea id="ai-journey" data-mj-field className="wmod-input" rows={2} value={f.wedding_journey} onChange={set('wedding_journey')} />
          </div>
        </div>
        <button type="button" className="wmod-btn wmod-btn--primary" style={{ marginTop: 16 }} disabled={busy} onClick={run}>
          {busy ? 'Writing…' : 'Write the story'}
        </button>
      </Panel>
      <Output text={out} flash={flash} label="The story" />
    </>
  );
}

function GreetingTool({ flash }) {
  const [f, setF] = useState({ guest_name: '', relation: '', couple: '', tone: 'warm', language: 'en' });
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setErr(null); };

  const run = async () => {
    if (!f.guest_name.trim()) { setErr('Who is it for?'); return; }
    setBusy(true); setErr(null);
    try {
      const { data } = await api.aiGreeting({
        ...f,
        guest_name: f.guest_name.trim(),
        relation: f.relation.trim() || null,
        couple: f.couple.trim() || null,
      });
      setOut(data.greeting || '');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not work.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <InlineError message={err} />
      <Panel title="Guest greeting" sub="One personalised line for a single guest — max 14 words, no emojis.">
        <div className="wmod-grid">
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-name">Guest name</label>
            <input id="g-name" data-mj-field className="wmod-input" value={f.guest_name} onChange={set('guest_name')} />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-rel">Relation <span className="wmod-td-muted">(optional)</span></label>
            <input id="g-rel" data-mj-field className="wmod-input" value={f.relation} onChange={set('relation')} placeholder="family, friend, elder…" />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-couple">Couple <span className="wmod-td-muted">(optional)</span></label>
            <input id="g-couple" data-mj-field className="wmod-input" value={f.couple} onChange={set('couple')} placeholder="Riya &amp; Aarav" />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-tone">Tone</label>
            <select id="g-tone" data-mj-field className="wmod-input" value={f.tone} onChange={set('tone')}>
              {GREETING_TONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-lang">Language</label>
            <select id="g-lang" data-mj-field className="wmod-input" value={f.language} onChange={set('language')}>
              {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="wmod-btn wmod-btn--primary" style={{ marginTop: 16 }} disabled={busy} onClick={run}>
          {busy ? 'Writing…' : 'Write the greeting'}
        </button>
      </Panel>
      <Output text={out} flash={flash} label="The greeting" />
    </>
  );
}

function TranslateTool({ flash }) {
  const [text, setText] = useState('');
  const [lang, setLang] = useState('te');
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // The endpoint takes a {key: text} object and returns the same shape
  // translated. One line per field is the least fiddly way to express that
  // without asking a photographer to write JSON.
  const parse = () => {
    const items = {};
    text.split('\n').forEach((line, i) => {
      const t = line.trim();
      if (!t) return;
      const at = t.indexOf('=');
      if (at > 0) items[t.slice(0, at).trim()] = t.slice(at + 1).trim();
      else items[`line_${i + 1}`] = t;
    });
    return items;
  };

  const run = async () => {
    const items = parse();
    if (Object.keys(items).length === 0) { setErr('Nothing to translate yet.'); return; }
    setBusy(true); setErr(null);
    try {
      const { data } = await api.aiTranslateBulk({ items, target_language: lang });
      setOut(data.translations || {});
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not work.');
    } finally { setBusy(false); }
  };

  const asText = out
    ? Object.entries(out).map(([k, v]) => (k.startsWith('line_') ? v : `${k} = ${v}`)).join('\n')
    : '';

  return (
    <>
      <InlineError message={err} />
      <Panel title="Translate" sub="One line per item. Write “label = text” to keep a label, or just the text on its own.">
        <div className="wmod-field wmod-field--wide">
          <label className="wmod-label" htmlFor="t-text">Text</label>
          <textarea
            id="t-text"
            data-mj-field
            className="wmod-input"
            rows={7}
            value={text}
            onChange={(e) => { setText(e.target.value); setErr(null); }}
            placeholder={'heading = You are cordially invited\nWith great joy we invite you to our wedding.'}
          />
        </div>
        <div className="wmod-field" style={{ maxWidth: 240 }}>
          <label className="wmod-label" htmlFor="t-lang">Into</label>
          <select id="t-lang" data-mj-field className="wmod-input" value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button type="button" className="wmod-btn wmod-btn--primary" style={{ marginTop: 16 }} disabled={busy} onClick={run}>
          {busy ? 'Translating…' : 'Translate'}
        </button>
      </Panel>
      <Output text={asText} flash={flash} label="Translation" />
    </>
  );
}

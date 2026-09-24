import { useMemo, useState } from 'react';
import * as api from '@/api/pixora';
import { AI_TOOL_GROUPS, LEARNING_RESOURCES, LEARNING_CATEGORIES } from '@/data/learningResources';
import {
  Section, Stats, Empty, Loading, ErrorNote, Rows, Pill, Toast, Field, Segments,
  useAsync, useFlash,
} from './PixoraShell';

// Learning Hub + Profile.
//
// The Learning Hub has two halves and they are genuinely different things:
//   • the course track (/api/pixora/learn) — completable, some award a
//     certification that shows on the public profile;
//   • the curated directory — a static, hand-checked list of external
//     resources and AI tools carried over from the legacy data file. It has no
//     endpoint because it never had one.
// Both are shown; neither is invented.

const num = new Intl.NumberFormat('en-IN');
const DIFFS = ['beginner', 'intermediate', 'advanced'];
const COSTS = ['free', 'paid'];

// ═══════════════════════════════════════════════════════════ Learning Hub

export function LearningHub({ category = null }) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(category);
  const [diff, setDiff] = useState('');
  const [cost, setCost] = useState('');

  const activeCat = category !== null ? category : cat;
  const isAiTools = activeCat === 'ai_tools';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LEARNING_RESOURCES.filter((r) => (
      (!activeCat || r.category === activeCat)
      && (!diff || r.difficulty === diff)
      && (!cost || r.cost === cost)
      && (!q || r.title.toLowerCase().includes(q) || (r.desc || '').toLowerCase().includes(q))
    ));
  }, [query, activeCat, diff, cost]);

  const aiGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AI_TOOL_GROUPS
      .map((g) => ({
        ...g,
        tools: g.tools.filter((t) => !q
          || t.name.toLowerCase().includes(q)
          || t.desc.toLowerCase().includes(q)
          || t.useCases.toLowerCase().includes(q)),
      }))
      .filter((g) => g.tools.length > 0);
  }, [query]);

  return (
    <>
      <Section title="Photographer learning centre" sub="Curated by Pixora. Every entry points at the original source — nothing is republished here.">
        <div className="pxc-formgrid">
          <Field label="Search" htmlFor="lh-q" wide>
            <input id="lh-q" className="pxc-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tutorials, tools, gear…" />
          </Field>
          {category === null && (
            <Field label="Category" htmlFor="lh-cat">
              <select id="lh-cat" className="pxc-input" value={cat || ''} onChange={(e) => setCat(e.target.value || null)}>
                <option value="">All</option>
                {LEARNING_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>
          )}
          {!isAiTools && (
            <>
              <Field label="Level" htmlFor="lh-diff">
                <select id="lh-diff" className="pxc-input" value={diff} onChange={(e) => setDiff(e.target.value)}>
                  <option value="">Any</option>
                  {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Cost" htmlFor="lh-cost">
                <select id="lh-cost" className="pxc-input" value={cost} onChange={(e) => setCost(e.target.value)}>
                  <option value="">Any</option>
                  {COSTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>
      </Section>

      {isAiTools ? (
        aiGroups.length === 0 ? (
          <Section title="AI tools"><Empty title={`No AI tools match “${query}”.`} /></Section>
        ) : aiGroups.map((g) => (
          <Section key={g.group} title={g.group}>
            <div className="pxc-grid">
              {g.tools.map((t) => (
                <a className="pxc-card" key={t.name} href={t.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <span className="pxc-card-title">{t.name}</span>
                    {t.recommended && <Pill tone="accent">Recommended</Pill>}
                  </span>
                  <span className="pxc-card-meta">{t.desc}</span>
                  <span className="pxc-card-meta"><strong>Pricing:</strong> {t.pricing}</span>
                  <span className="pxc-card-meta"><strong>Use cases:</strong> {t.useCases}</span>
                </a>
              ))}
            </div>
          </Section>
        ))
      ) : (
        <Section title={`${filtered.length} resource${filtered.length === 1 ? '' : 's'}`} flush>
          <div style={{ padding: 18 }}>
            {filtered.length === 0 ? (
              <Empty title="Nothing matches those filters" body="More curated content is added regularly." />
            ) : (
              <div className="pxc-grid">
                {filtered.map((r) => {
                  const label = (LEARNING_CATEGORIES.find((c) => c.key === r.category) || {}).label;
                  return (
                    <a className="pxc-card" key={r.id} href={r.link} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <span className="pxc-card-title">{r.title}</span>
                        {r.recommended && <Pill tone="accent">Recommended</Pill>}
                      </span>
                      {r.desc && <span className="pxc-card-meta">{r.desc}</span>}
                      <span className="pxc-card-meta">{[label, r.difficulty, r.cost].filter(Boolean).join(' · ')}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

/** The certifiable course track — the half of learning that the server tracks. */
export function Guides() {
  const { data, error, loading, reload } = useAsync(() => api.learn().then((r) => r.data));
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();
  const rows = data?.content || [];
  const done = rows.filter((c) => c.completed).length;

  const complete = async (id) => {
    setBusy(id);
    try {
      const { data: res } = await api.completeCourse(id);
      flash(res.certified ? 'Completed — certification earned.' : 'Marked complete.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not mark that complete.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Stats items={[
        { label: 'Courses', value: num.format(rows.length) },
        { label: 'Completed', value: num.format(done) },
        { label: 'Certifiable', value: num.format(rows.filter((c) => c.cert).length) },
      ]}
      />

      <Section title="Courses and guides" sub="Finishing a certifiable course adds a badge to your public profile.">
        <Rows
          rows={rows}
          empty="No courses published yet."
          render={(c) => (
            <>
              <div className="pxc-rowline">
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                  <span className="pxc-rowmain">{c.title}</span>
                  {c.cert && <Pill tone="accent">Certification</Pill>}
                  {c.completed && <Pill tone="good">Done</Pill>}
                </span>
                {!c.completed && (
                  <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" disabled={busy === c.id} onClick={() => complete(c.id)}>
                    {busy === c.id ? 'Saving…' : 'Mark complete'}
                  </button>
                )}
              </div>
              <p className="pxc-rowbody">
                {[c.kind, c.level, c.minutes ? `${c.minutes} min` : null].filter(Boolean).join(' · ')}
              </p>
              {c.summary && <p className="pxc-rowbody">{c.summary}</p>}
            </>
          )}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════ Profile

export function MyProfile() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.me().then((r) => r.data),
      api.scoreHistory().then((r) => r.data).catch(() => null),
    ]).then(([me, hist]) => ({ me, hist })),
  );

  if (loading) return <Loading />;

  const me = data?.me || {};
  const s = me.stats || {};
  const cs = me.community_score || {};
  const verification = me.verification || {};
  const achievements = me.achievements || [];
  const unlocked = achievements.filter((a) => a.unlocked);

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Stats items={[
        { label: 'Reputation', value: num.format(me.reputation ?? 0), hint: me.tier || undefined },
        { label: 'Community score', value: num.format(cs.score ?? 0) },
        { label: 'Posts', value: num.format(s.posts ?? 0) },
        { label: 'Likes received', value: num.format(s.likes_received ?? 0) },
        { label: 'Challenge wins', value: num.format(s.challenge_wins ?? 0) },
        { label: 'Achievements', value: `${unlocked.length}/${achievements.length}` },
      ]}
      />

      <Section title={me.name || 'Your studio'} sub="How the community sees you.">
        <div className="pxc-rowline">
          <span className="pxc-rowmain">Verification</span>
          <Pill tone={verification.level ? 'good' : 'neutral'}>
            {verification.label || (verification.level ? `Level ${verification.level}` : 'Not verified')}
          </Pill>
        </div>
      </Section>

      {achievements.length > 0 && (
        <Section title="Achievements" sub="Unlocked automatically as you use the community.">
          <div className="pxc-grid">
            {achievements.map((a) => (
              <div className="pxc-card" key={a.key} style={a.unlocked ? undefined : { opacity: 0.55 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="pxc-card-title">{a.title || a.key}</span>
                  {a.unlocked && <Pill tone="good">Unlocked</Pill>}
                </span>
                {a.desc && <span className="pxc-card-meta">{a.desc}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// Mirrors CAP_LABEL in community_gating.py — the server sends capability keys,
// not display names.
const CAP_LABELS = {
  photo_post: 'Photo posts', multi_image_post: 'Multi-image posts',
  showcase_post: 'Showcase posts', critique_post: 'Critique posts',
  verification: 'Verification', analytics: 'Analytics',
  marketplace_sell: 'Marketplace selling', reels: 'Reels', stories: 'Stories',
  drafts: 'Drafts', scheduled_posts: 'Scheduled posts', crm: 'CRM',
  ai_review: 'AI Review', ai_assistant: 'AI Assistant',
  priority_discovery: 'Priority discovery', featured_placement: 'Featured placement',
  advanced_analytics: 'Advanced analytics',
};

export function WhyUpgrade() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.capabilities().then((r) => r.data).catch(() => null),
      api.benefits().then((r) => r.data).catch(() => null),
    ]).then(([caps, ben]) => ({ caps, ben })),
  );

  if (loading) return <Loading />;

  const caps = data?.caps || {};
  const map = caps.capabilities || {};
  const benefits = data?.ben?.benefits || [];
  const entries = Object.entries(map);
  const locked = entries.filter(([, v]) => !v);

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Your plan" sub="What is unlocked for this studio right now.">
        <div className="pxc-rowline">
          <span className="pxc-rowmain">{caps.tier ? String(caps.tier).toUpperCase() : 'Current plan'}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            {caps.grandfathered && <Pill tone="good">Grandfathered</Pill>}
            <Pill tone={locked.length === 0 ? 'good' : 'neutral'}>
              {entries.length - locked.length}/{entries.length} features
            </Pill>
          </span>
        </div>
        {caps.grandfathered && (
          <p className="pxc-rowbody">
            You joined before plan limits existed, so every feature stays unlocked for you.
          </p>
        )}
      </Section>

      {locked.length > 0 && (
        <Section title="Not on your plan yet" sub="Upgrading unlocks these immediately — nothing you already have is lost.">
          <div className="pxc-chips">
            {locked.map(([k]) => (
              <span className="pxc-chip" key={k}>{CAP_LABELS[k] || k.replace(/_/g, ' ')}</span>
            ))}
          </div>
          <p style={{ marginTop: 16 }}>
            <a className="pxc-btn pxc-btn--primary" href="/studio/plans">See plans</a>
          </p>
        </Section>
      )}

      <Section title="What membership includes">
        {benefits.length === 0 ? <Empty title="Nothing listed yet" /> : (
          <div className="pxc-grid">
            {benefits.map((b, i) => (
              <div className="pxc-card" key={i}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="pxc-card-title">{b.title}</span>
                  <Pill tone={b.tier === 'Premium' ? 'accent' : 'neutral'}>{b.tier}</Pill>
                </span>
                <span className="pxc-card-meta">{b.desc}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

export function ProfilePortfolio() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.settings().then((r) => r.data).catch(() => null),
      api.testimonialVideos().then((r) => r.data).catch(() => null),
    ]).then(([s, v]) => ({ s, v })),
  );
  const [f, setF] = useState({ client_name: '', video_url: '', event_type: '' });
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const account = data?.s?.account || {};
  const videos = data?.v?.videos || [];
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const add = async () => {
    if (!f.video_url.trim()) { flash('Paste the video link.'); return; }
    setBusy(true);
    try {
      await api.addTestimonialVideo(f);
      setF({ client_name: '', video_url: '', event_type: '' });
      flash('Testimonial added.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not add that.'); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section
        title="Your public portfolio"
        sub="The page couples actually land on. Editing it happens in the portfolio builder."
      >
        <div className="pxc-rowline">
          <span className="pxc-rowmain">{account.name || 'Your studio'}</span>
          <Pill tone={account.is_published ? 'good' : 'warn'}>
            {account.is_published ? 'Published' : 'Not published'}
          </Pill>
        </div>
        {account.slug && (
          <p className="pxc-rowbody">
            Live at <a href={`/photographer/${account.slug}`}>/photographer/{account.slug}</a>
          </p>
        )}
        <p style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="pxc-btn pxc-btn--primary" href="/studio/portfolio">Edit portfolio</a>
          {account.slug && <a className="pxc-btn pxc-btn--ghost" href={`/photographer/${account.slug}`}>View it live</a>}
        </p>
      </Section>

      <Section title="Video testimonials" sub="A client saying it on camera outsells anything you write about yourself.">
        <div className="pxc-formgrid" style={{ marginBottom: 16 }}>
          <Field label="Client name" htmlFor="vt-name">
            <input id="vt-name" className="pxc-input" value={f.client_name} onChange={set('client_name')} />
          </Field>
          <Field label="Event type" htmlFor="vt-type">
            <input id="vt-type" className="pxc-input" value={f.event_type} onChange={set('event_type')} placeholder="Wedding, Reception…" />
          </Field>
          <Field label="Video link" htmlFor="vt-url" wide hint="YouTube, Vimeo or a direct link.">
            <input id="vt-url" className="pxc-input" type="url" value={f.video_url} onChange={set('video_url')} />
          </Field>
          <div className="pxc-field pxc-field--wide">
            <button type="button" className="pxc-btn pxc-btn--primary" onClick={add} disabled={busy}>
              {busy ? 'Adding…' : 'Add testimonial'}
            </button>
          </div>
        </div>

        <Rows
          rows={videos}
          empty="No video testimonials yet."
          render={(v) => (
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{v.client_name || 'A client'}</span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="pxc-rowmeta">{v.event_type || ''}</span>
                <a className="pxc-btn pxc-btn--ghost pxc-btn--sm" href={v.video_url} target="_blank" rel="noreferrer">Watch</a>
              </span>
            </div>
          )}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}

// The report endpoint is structured — it wants a target type, that target's id
// and one of a fixed set of reasons. Free text alone would be rejected.
const REPORT_TARGETS = ['post', 'comment', 'gig', 'event', 'member', 'story', 'reel', 'submission'];
const REPORT_REASONS = ['spam', 'fake', 'abuse', 'copyright', 'inappropriate', 'other'];

function ReportForm() {
  const [f, setF] = useState({ target_type: 'post', target_id: '', reason: 'spam', note: '' });
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const send = async () => {
    if (!f.target_id.trim()) { flash('Paste the id of what you are reporting.'); return; }
    setBusy(true);
    try {
      await api.report(f);
      setF({ target_type: 'post', target_id: '', reason: 'spam', note: '' });
      flash('Reported — a moderator will review it.');
    } catch (e) { flash(e?.response?.data?.detail || 'Could not send that report.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Section title="Report something" sub="Reports go to a human moderator. Nothing is removed automatically.">
        <div className="pxc-formgrid">
          <Field label="What are you reporting?" htmlFor="rp-type">
            <select id="rp-type" className="pxc-input" value={f.target_type} onChange={set('target_type')}>
              {REPORT_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Reason" htmlFor="rp-reason">
            <select id="rp-reason" className="pxc-input" value={f.reason} onChange={set('reason')}>
              {REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Its id" htmlFor="rp-id" wide hint="Copy it from the item's link — moderators need it to find the right thing.">
            <input id="rp-id" className="pxc-input" value={f.target_id} onChange={set('target_id')} />
          </Field>
          <Field label="Anything else" htmlFor="rp-note" wide>
            <textarea id="rp-note" className="pxc-input" rows={3} value={f.note} onChange={set('note')} />
          </Field>
          <div className="pxc-field pxc-field--wide">
            <button type="button" className="pxc-btn pxc-btn--primary" onClick={send} disabled={busy}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </div>
      </Section>
      <Toast message={toast} />
    </>
  );
}

const NOTIFY_FIELDS = [
  ['notify_follow', 'Someone follows you'],
  ['notify_like', 'Someone likes your work'],
  ['notify_comment', 'Someone comments'],
  ['notify_save', 'Someone saves a post'],
  ['notify_marketplace', 'Marketplace activity'],
];
const PRIVACY_FIELDS = [
  ['profile_public', 'Show my profile publicly'],
  ['show_in_discover', 'Include me in Discover'],
  ['allow_messages', 'Let studios message me'],
];

export function CommunitySettings() {
  const { data, error, loading, reload } = useAsync(() => api.settings().then((r) => r.data));
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('notifications');
  const [toast, flash] = useFlash();

  const settings = draft ?? data?.settings ?? null;
  const account = data?.account || {};
  const plan = data?.plan || {};
  const storage = data?.storage || {};

  const toggle = (k) => (e) => setDraft({ ...(settings || {}), [k]: e.target.checked });

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      await api.saveSettings(settings);
      flash('Settings saved.');
      setDraft(null);
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not save.'); }
    finally { setBusy(false); }
  };


  if (loading) return <Loading />;
  if (!settings) return <Section title="Settings"><Empty title="Settings are unavailable right now" /></Section>;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Account" sub="Your community identity.">
        <div className="pxc-rowline">
          <span className="pxc-rowmain">{account.name}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            {plan.tier && <Pill tone="accent">{String(plan.tier).toUpperCase()}</Pill>}
            <Pill tone={account.is_published ? 'good' : 'warn'}>
              {account.is_published ? 'Published' : 'Not published'}
            </Pill>
          </span>
        </div>
        <p className="pxc-rowbody">
          {[account.slug ? `/photographer/${account.slug}` : null,
            storage.used_bytes != null ? `${(storage.used_bytes / (1024 * 1024)).toFixed(1)} MB stored` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      </Section>

      <Segments
        value={tab}
        onChange={setTab}
        options={[['notifications', 'Notifications'], ['privacy', 'Privacy'], ['safety', 'Safety']]}
      />

      {tab === 'notifications' && (
        <Section title="Notify me when" sub="Applies to the community only — booking and client alerts are separate.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NOTIFY_FIELDS.map(([k, label]) => (
              <label className="pxc-check" key={k}>
                <input type="checkbox" checked={!!settings[k]} onChange={toggle(k)} />
                {label}
              </label>
            ))}
          </div>
        </Section>
      )}

      {tab === 'privacy' && (
        <Section title="Privacy" sub="Turning off Discover keeps your profile reachable by direct link, just not surfaced in search.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PRIVACY_FIELDS.map(([k, label]) => (
              <label className="pxc-check" key={k}>
                <input type="checkbox" checked={!!settings[k]} onChange={toggle(k)} />
                {label}
              </label>
            ))}
          </div>
        </Section>
      )}

      {tab === 'safety' && <ReportForm />}

      {draft && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="pxc-btn pxc-btn--ghost" onClick={() => setDraft(null)}>Discard</button>
        </div>
      )}
      <Toast message={toast} />
    </>
  );
}

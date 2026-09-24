import { useState } from 'react';
import * as api from '@/api/pixora';
import { adminUploadImage } from '@/api/studio';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import {
  Section, Stats, Empty, Loading, ErrorNote, Rows, Pill, Toast, Field,
  useAsync, useFlash, inr,
} from './PixoraShell';

// Growth — Challenges · Awards · Verification · Certifications · Leaderboards · Perks.
//
// Contracts read from the server, not inferred:
//   challenges    → { challenges[], active, submissions[] }, submit takes
//                   { challenge_id, image_url, caption }
//   awards        → { awards[], active, nominations[] }, nominate takes
//                   { award_id, nominee_studio_id }
//   verification  → { verification, status, levels[{level,label}] }
//   leaderboard   → { leaderboard[], sort, sorts[] }, sortable by
//                   score | followers | engagement | awards
//   chapters      → [{ chapter, members, joined }], join is a toggle

const num = new Intl.NumberFormat('en-IN');

// ═════════════════════════════════════════════════════════════ Challenges

export function Challenges({ myId }) {
  const { data, error, loading, reload } = useAsync(() => api.challenges().then((r) => r.data));
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const active = data?.active || null;
  const subs = data?.submissions || [];
  const past = (data?.challenges || []).filter((c) => !c.is_active);

  const submit = async (e) => {
    e.preventDefault();
    if (!active) return;
    setBusy(true);
    try {
      let imageUrl = null;
      if (file) {
        const { data: up } = await adminUploadImage(file, 'challenge');
        imageUrl = up?.url || null;
      }
      await api.submitChallenge({ challenge_id: active.id, image_url: imageUrl, caption });
      setCaption('');
      setFile(null);
      e.target.reset();
      flash('Entry submitted.');
      reload();
    } catch (e2) { flash(e2?.response?.data?.detail || 'Could not submit your entry.'); }
    finally { setBusy(false); }
  };

  const vote = async (id) => {
    try { await api.voteSubmission(id); reload(); }
    catch (e) { flash(e?.response?.data?.detail || 'Could not vote.'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete your submission?')) return;
    try { await api.deleteSubmission(id); flash('Deleted.'); reload(); }
    catch (e) { flash(e?.response?.data?.detail || 'Could not delete it.'); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      {!active ? (
        <Section title="Challenges">
          <Empty title="No active challenge right now" body="Challenges open regularly — winning one is the fastest way to move up the leaderboard." />
        </Section>
      ) : (
        <Section title={active.title} sub={active.prompt}>
          <form onSubmit={submit}>
            <div className="pxc-formgrid">
              <Field label="Your entry" htmlFor="ch-file" hint="One image. It counts against your storage.">
                <input
                  id="ch-file"
                  className="pxc-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Field>
              <Field label="Caption" htmlFor="ch-cap">
                <input id="ch-cap" className="pxc-input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption your entry…" />
              </Field>
              <div className="pxc-field pxc-field--wide">
                <button type="submit" className="pxc-btn pxc-btn--primary" disabled={busy}>
                  {busy ? 'Submitting…' : 'Enter the challenge'}
                </button>
              </div>
            </div>
          </form>
        </Section>
      )}

      {active && (
        <Section title="Entries" sub="One vote per entry. Votes decide the winner." flush>
          <div style={{ padding: 18 }}>
            {subs.length === 0 ? (
              <Empty title="No entries yet" body="Be the first — early entries collect votes for longer." />
            ) : (
              <div className="pxc-grid">
                {subs.map((s) => (
                  <article className="pxc-card" key={s.id} style={{ padding: 0, overflow: 'hidden' }}>
                    {s.image_url && (
                      <span className="pxc-media">
                        <img src={resolveMediaUrl(s.image_url)} alt={s.caption || 'Challenge entry'} loading="lazy" />
                      </span>
                    )}
                    <span style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="pxc-card-title">{s.caption || 'Untitled'}</span>
                      <span className="pxc-card-meta">by {s.author}</span>
                      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => vote(s.id)}>
                          Vote · {num.format(s.vote_count ?? 0)}
                        </button>
                        {myId && s.studio_id === myId && (
                          <button type="button" className="pxc-btn pxc-btn--danger pxc-btn--sm" onClick={() => remove(s.id)}>Delete</button>
                        )}
                      </span>
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past challenges">
          <Rows
            rows={past}
            render={(c) => (
              <>
                <div className="pxc-rowline">
                  <span className="pxc-rowmain">{c.title}</span>
                  <Pill tone="neutral">closed</Pill>
                </div>
                {c.prompt && <p className="pxc-rowbody">{c.prompt}</p>}
              </>
            )}
          />
        </Section>
      )}
      <Toast message={toast} />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════ Awards

export function Awards() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.awards().then((r) => r.data),
      api.leaderboard().then((r) => r.data).catch(() => null),
    ]).then(([a, lb]) => ({ a, lb })),
  );
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const active = data?.a?.active || null;
  const noms = data?.a?.nominations || [];
  const board = data?.lb?.leaderboard || [];

  const nominate = async (studioId) => {
    if (!active) return;
    setBusy(studioId);
    try {
      await api.nominateAward({ award_id: active.id, nominee_studio_id: studioId });
      flash('Nomination recorded.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not nominate.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  if (!active) {
    return (
      <Section title="Awards">
        <Empty title="No active award season" body="When a season opens you can nominate any studio on the leaderboard — including yourself." />
      </Section>
    );
  }

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title={active.title} sub={active.desc} />

      {noms.length > 0 && (
        <Section title="Leading nominees">
          <Rows
            rows={noms}
            render={(n) => (
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{n.name}</span>
                <span className="pxc-rowmeta">{num.format(n.vote_count ?? 0)} nominations</span>
              </div>
            )}
          />
        </Section>
      )}

      <Section title="Nominate a studio" sub="One nomination per studio per season — nominating again replaces your last one.">
        {board.length === 0 ? (
          <Empty title="Nobody ranked yet" body="The leaderboard fills as studios post and grow." />
        ) : (
          <Rows
            rows={board}
            render={(r) => (
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{r.name}</span>
                <button
                  type="button"
                  className="pxc-btn pxc-btn--ghost pxc-btn--sm"
                  disabled={busy === r.studio_id}
                  onClick={() => nominate(r.studio_id)}
                >
                  {busy === r.studio_id ? 'Nominating…' : 'Nominate'}
                </button>
              </div>
            )}
          />
        )}
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════ Verification

const VERIFY_BLANK = {
  requested_level: 1, gov_id_url: '', business_proof_url: '',
  website: '', instagram: '', portfolio_link: '', phone: '', email: '', note: '',
};

export function Verification() {
  const { data, error, loading, reload } = useAsync(() => api.myVerification().then((r) => r.data));
  const [form, setForm] = useState(VERIFY_BLANK);
  const [uploading, setUploading] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const v = data?.verification || null;
  const status = data?.status || {};
  const levels = data?.levels || [];
  const approved = v?.status === 'approved';

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (field, file) => {
    if (!file) return;
    setUploading(field);
    try {
      const { data: up } = await adminUploadImage(file, 'verification');
      setForm((f) => ({ ...f, [field]: up?.url || '' }));
      flash('Uploaded.');
    } catch { flash('Upload failed.'); }
    finally { setUploading(''); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.applyVerification({ ...form, requested_level: Number(form.requested_level) });
      flash('Application submitted for review.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not submit.'); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Your verification" sub="A verified badge lifts you in the directory and in Discover.">
        {v ? (
          <>
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{status.label || 'Not verified'}</span>
              <Pill tone={v.status === 'approved' ? 'good' : v.status === 'rejected' ? 'bad' : 'warn'}>
                {v.status}
              </Pill>
            </div>
            <p className="pxc-rowbody">
              Applied for level {v.requested_level}
              {v.updated_at ? ` · updated ${new Date(v.updated_at).toLocaleDateString('en-IN')}` : ''}
            </p>
            {v.review_note && <p className="pxc-rowbody">Reviewer note: {v.review_note}</p>}
          </>
        ) : (
          <p className="pxc-rowbody" style={{ marginTop: 0 }}>
            You have not applied yet. Verification is manual — a person checks the documents you send.
          </p>
        )}
      </Section>

      {!approved && (
        <Section title={v ? 'Update your application' : 'Apply for verification'} sub="Documents are reviewed by a person and are never shown publicly.">
          <div className="pxc-formgrid">
            <Field label="Level" htmlFor="vr-level">
              <select id="vr-level" className="pxc-input" value={form.requested_level} onChange={set('requested_level')}>
                {(levels.length ? levels : [{ level: 1, label: 'Verified Photographer' }]).map((l) => (
                  <option key={l.level} value={l.level}>{l.level} — {l.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Government ID" htmlFor="vr-gov" hint={uploading === 'gov_id_url' ? 'Uploading…' : form.gov_id_url ? 'Uploaded.' : 'Aadhaar, passport or driving licence.'}>
              <input id="vr-gov" className="pxc-input" type="file" accept="image/*" onChange={(e) => upload('gov_id_url', e.target.files?.[0])} />
            </Field>
            <Field label="Business proof" htmlFor="vr-biz" hint={uploading === 'business_proof_url' ? 'Uploading…' : form.business_proof_url ? 'Uploaded.' : 'GST certificate, shop licence or similar.'}>
              <input id="vr-biz" className="pxc-input" type="file" accept="image/*" onChange={(e) => upload('business_proof_url', e.target.files?.[0])} />
            </Field>
            <Field label="Website" htmlFor="vr-web"><input id="vr-web" className="pxc-input" type="url" value={form.website} onChange={set('website')} /></Field>
            <Field label="Instagram" htmlFor="vr-ig"><input id="vr-ig" className="pxc-input" value={form.instagram} onChange={set('instagram')} /></Field>
            <Field label="Portfolio link" htmlFor="vr-port"><input id="vr-port" className="pxc-input" type="url" value={form.portfolio_link} onChange={set('portfolio_link')} /></Field>
            <Field label="Phone" htmlFor="vr-phone"><input id="vr-phone" className="pxc-input" value={form.phone} onChange={set('phone')} inputMode="tel" /></Field>
            <Field label="Email" htmlFor="vr-email"><input id="vr-email" className="pxc-input" type="email" value={form.email} onChange={set('email')} /></Field>
            <Field label="Anything else" htmlFor="vr-note" wide>
              <textarea id="vr-note" className="pxc-input" rows={2} value={form.note} onChange={set('note')} />
            </Field>
            <div className="pxc-field pxc-field--wide">
              <button type="button" className="pxc-btn pxc-btn--primary" onClick={submit} disabled={busy || !!uploading}>
                {busy ? 'Submitting…' : v ? 'Resubmit' : 'Submit application'}
              </button>
            </div>
          </div>
        </Section>
      )}
      <Toast message={toast} />
    </>
  );
}

// ════════════════════════════════════════════════════════ Certifications

export function Certifications() {
  const { data, error, loading, reload } = useAsync(() => api.certifications().then((r) => r.data));
  const rows = data?.certifications || [];

  if (loading) return <Loading rows={2} />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section title="Certifications" sub="Earned by completing courses in the Learning Hub. They show on your public profile.">
        {rows.length === 0 ? (
          <Empty
            title="No certifications yet"
            body="Finishing a course in the Learning Hub earns a badge that couples and studios can see."
            action={<a className="pxc-btn pxc-btn--primary" href="/studio/community?g=learning">Open the Learning Hub</a>}
          />
        ) : (
          <div className="pxc-chips">
            {rows.map((c) => <span className="pxc-chip pxc-chip--on" key={c.id || c.content_id}>{c.title}</span>)}
          </div>
        )}
      </Section>
    </>
  );
}

// ═════════════════════════════════════════════════════════ Leaderboards

const SORT_LABELS = {
  score: 'Community score', followers: 'Followers', engagement: 'Engagement', awards: 'Awards',
};

export function Leaderboards() {
  const [sort, setSort] = useState('score');
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.leaderboard({ sort }).then((r) => r.data),
      api.network().then((r) => r.data).catch(() => null),
    ]).then(([lb, net]) => ({ lb, net })),
    [sort],
  );
  const [followed, setFollowed] = useState({});
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const rows = data?.lb?.leaderboard || [];
  const sorts = data?.lb?.sorts || ['score'];
  const baseline = data?.net?.following || [];
  const isFollowing = (id) => (id in followed ? followed[id] : baseline.includes(id));

  const follow = async (id) => {
    setBusy(id);
    try {
      const { data: res } = await api.follow(id);
      setFollowed((s) => ({ ...s, [id]: !!res.following }));
    } catch (e) { flash(e?.response?.data?.detail || 'Could not follow.'); }
    finally { setBusy(null); }
  };

  const connect = async (id) => {
    try {
      const { data: res } = await api.requestConnection(id);
      flash(res.already ? 'A request is already pending with this studio.' : 'Connection request sent.');
    } catch (e) { flash(e?.response?.data?.detail || 'Could not send that request.'); }
  };

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section
        title="Leaderboard"
        sub="Ranked from real activity — posts, followers, engagement and awards. Nothing here is bought."
        actions={(
          <div className="pxc-chips">
            {sorts.map((s) => (
              <button key={s} type="button" className={`pxc-chip${sort === s ? ' pxc-chip--on' : ''}`} onClick={() => setSort(s)}>
                {SORT_LABELS[s] || s}
              </button>
            ))}
          </div>
        )}
      >
        {loading ? <Loading rows={3} /> : (
          <Rows
            rows={rows}
            empty="No ranked studios yet — post to climb the board."
            render={(r) => (
              <>
                <div className="pxc-rowline">
                  <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', minWidth: 0 }}>
                    <span className="pxc-stat-value" style={{ fontSize: 18, minWidth: 28 }}>{r.rank}</span>
                    <span className="pxc-rowmain">{r.name}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" disabled={busy === r.studio_id} onClick={() => follow(r.studio_id)}>
                      {isFollowing(r.studio_id) ? 'Following' : 'Follow'}
                    </button>
                    <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => connect(r.studio_id)}>Connect</button>
                  </span>
                </div>
                <p className="pxc-rowbody">
                  {[r.tier, `${num.format(r.posts ?? 0)} posts`, `${num.format(r.followers ?? 0)} followers`,
                    `score ${num.format(r.community_score ?? 0)}`, r.awards ? `${r.awards} awards` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </>
            )}
          />
        )}
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════ Perks

export function Perks() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.benefits().then((r) => r.data).catch(() => null),
      api.chapters().then((r) => r.data).catch(() => null),
      api.scoreHistory().then((r) => r.data).catch(() => null),
    ]).then(([b, c, h]) => ({ b, c, h })),
  );
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const benefits = data?.b?.benefits || [];
  const chapters = data?.c?.chapters || [];
  const current = data?.h?.current || {};

  const toggle = async (chapter) => {
    setBusy(chapter);
    try { await api.joinChapter(chapter); reload(); }
    catch (e) { flash(e?.response?.data?.detail || 'Could not update that.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      {(current.score != null) && (
        <Stats items={[
          { label: 'Community score', value: num.format(current.score || 0), hint: current.tier || undefined },
          { label: 'Chapters joined', value: num.format(chapters.filter((c) => c.joined).length) },
        ]}
        />
      )}

      <Section title="Member benefits" sub="What membership unlocks across the platform.">
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

      <Section title="Regional chapters" sub="Local groups of studios. Joining is a toggle — leave any time.">
        {chapters.length === 0 ? <Empty title="No chapters yet" /> : (
          <div className="pxc-chips">
            {chapters.map((c) => (
              <button
                key={c.chapter}
                type="button"
                className={`pxc-chip${c.joined ? ' pxc-chip--on' : ''}`}
                disabled={busy === c.chapter}
                onClick={() => toggle(c.chapter)}
              >
                {c.chapter} · {num.format(c.members ?? 0)}{c.joined ? ' ✓' : ''}
              </button>
            ))}
          </div>
        )}
      </Section>
      <Toast message={toast} />
    </>
  );
}

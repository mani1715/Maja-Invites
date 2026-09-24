import { useState } from 'react';
import * as api from '@/api/pixora';
import { Section, Loading, ErrorNote, Empty, Field, Toast, useAsync, useFlash } from './PixoraShell';
import { PostGrid } from './HomePanels';

// Spotlight: the discovery half of the feed. The Feed / Reels / Stories
// composer already exists as the StudioCommunity page and is linked from the
// hub rather than duplicated — one composer, not two that drift.

export function Following() {
  const { data, error, loading, reload } = useAsync(() => api.following().then((r) => r.data));
  const rows = data?.posts || data?.items || (Array.isArray(data) ? data : []);
  if (loading) return <Loading />;
  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section title="From studios you follow" sub="Only the people you chose, newest first." flush>
        <div style={{ padding: 18 }}>
          <PostGrid rows={rows} empty="You are not following anyone yet — try Discover or Creators." />
        </div>
      </Section>
    </>
  );
}

// Discover searches *photographers*, not posts — the endpoint returns
// { photographers: [...] } with the filter vocabulary coming from post-meta.
const FOLLOWER_BANDS = [[0, 'Any following'], [10, '10+ followers'], [50, '50+ followers'], [100, '100+ followers']];

export function Discover() {
  const [f, setF] = useState({ q: '', city: '', category: '', min_followers: 0, verified: false });
  const [applied, setApplied] = useState(f);

  const { data: meta } = useAsync(() => api.postMeta().then((r) => r.data).catch(() => ({})));
  const { data, error, loading, reload } = useAsync(
    () => api.discover(applied).then((r) => r.data),
    [applied],
  );

  const cats = meta?.categories || [];
  const rows = data?.photographers || [];
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Discover photographers" sub="Search the whole community by city, speciality and standing.">
        <form
          className="pxc-formgrid"
          onSubmit={(e) => { e.preventDefault(); setApplied(f); }}
        >
          <Field label="Name or keyword" htmlFor="dc-q">
            <input id="dc-q" className="pxc-input" value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Studio, tagline, service…" />
          </Field>
          <Field label="City or state" htmlFor="dc-city">
            <input id="dc-city" className="pxc-input" value={f.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Category" htmlFor="dc-cat">
            <select id="dc-cat" className="pxc-input" value={f.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">Any category</option>
              {cats.map((c) => <option key={c} value={c}>{String(c).charAt(0).toUpperCase() + String(c).slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Following" htmlFor="dc-fol">
            <select id="dc-fol" className="pxc-input" value={f.min_followers} onChange={(e) => set('min_followers', Number(e.target.value))}>
              {FOLLOWER_BANDS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </Field>
          <div className="pxc-field pxc-field--wide" style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="pxc-check">
              <input type="checkbox" checked={f.verified} onChange={(e) => set('verified', e.target.checked)} />
              Verified studios only
            </label>
            <button type="submit" className="pxc-btn pxc-btn--primary">Search</button>
          </div>
        </form>
      </Section>

      <Section title={`${rows.length} ${rows.length === 1 ? 'studio' : 'studios'}`} flush>
        <div style={{ padding: 18 }}>
          {loading ? <Loading rows={2} /> : rows.length === 0 ? (
            <Empty title="No photographers match those filters" body="Try widening the city or clearing the verified filter." />
          ) : (
            <div className="pxc-grid">
              {rows.map((r) => (
                <a
                  className="pxc-card"
                  key={r.studio_id}
                  href={r.url || (r.slug ? `/photographer/${r.slug}` : '#')}
                  style={{ textDecoration: 'none' }}
                >
                  <span className="pxc-card-title">
                    {r.name}{r.verified_level ? ' ✓' : ''}
                  </span>
                  <span className="pxc-card-meta">
                    {[r.city, `${r.followers} followers`, `score ${r.community_score}`].filter(Boolean).join(' · ')}
                  </span>
                  {(r.services || []).length > 0 && (
                    <span className="pxc-card-meta">{r.services.slice(0, 4).join(' · ')}</span>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

const TRENDING_WINDOWS = [['24h', 'Today'], ['7d', 'This week'], ['30d', 'This month']];

export function Trending() {
  const [win, setWin] = useState('7d');
  const { data, error, loading, reload } = useAsync(
    () => api.trending({ window: win }).then((r) => r.data),
    [win],
  );
  const posts = data?.posts || [];

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section
        title="Trending work"
        sub="Ranked by engagement inside the window, not by recency alone."
        actions={(
          <div className="pxc-chips">
            {TRENDING_WINDOWS.map(([k, label]) => (
              <button key={k} type="button" className={`pxc-chip${win === k ? ' pxc-chip--on' : ''}`} onClick={() => setWin(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
        flush
      >
        <div style={{ padding: 18 }}>
          {loading ? <Loading rows={2} /> : <PostGrid rows={posts} empty="Nothing trending in this window yet." />}
        </div>
      </Section>
    </>
  );
}

export function Saved() {
  const [active, setActive] = useState('');   // '' = everything
  const [newCol, setNewCol] = useState('');
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.saved(active ? { collection_id: active } : {}).then((r) => r.data).catch(() => null),
      api.collections().then((r) => r.data).catch(() => null),
    ]).then(([s, c]) => ({ s, c })),
    [active],
  );

  const posts = data?.s?.posts || [];
  const colls = data?.c?.collections || [];

  const create = async () => {
    if (!newCol.trim()) return;
    try {
      await api.createCollection(newCol.trim());
      setNewCol('');
      flash('Collection created.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not create it.'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this collection? The saved posts stay saved.')) return;
    try {
      if (active === id) setActive('');
      await api.deleteCollection(id);
      flash('Collection deleted.');
      reload();
    } catch { flash('Could not delete it.'); }
  };

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Collections" sub="Group saved work however you like — mood boards, client pitches, references.">
        <div className="pxc-inline" style={{ marginBottom: 14 }}>
          <input
            className="pxc-input"
            value={newCol}
            onChange={(e) => setNewCol(e.target.value)}
            placeholder="New collection name"
            aria-label="New collection name"
          />
          <button type="button" className="pxc-btn pxc-btn--primary" onClick={create}>Create</button>
        </div>

        <div className="pxc-chips">
          <button type="button" className={`pxc-chip${!active ? ' pxc-chip--on' : ''}`} onClick={() => setActive('')}>
            Everything
          </button>
          {colls.map((c) => (
            <span key={c.id} style={{ display: 'inline-flex', gap: 4 }}>
              <button type="button" className={`pxc-chip${active === c.id ? ' pxc-chip--on' : ''}`} onClick={() => setActive(c.id)}>
                {c.name}{typeof c.item_count === 'number' ? ` · ${c.item_count}` : ''}
              </button>
              <button type="button" className="pxc-chip" onClick={() => remove(c.id)} aria-label={`Delete ${c.name}`}>×</button>
            </span>
          ))}
        </div>
      </Section>

      <Section title="Saved posts" sub="Everything you bookmarked. Only you can see this." flush>
        <div style={{ padding: 18 }}>
          {loading ? <Loading rows={2} /> : (
            <PostGrid rows={posts} empty={active ? 'Nothing in this collection yet.' : 'Nothing saved yet. Tap save on a post to keep it here.'} />
          )}
        </div>
      </Section>
      <Toast message={toast} />
    </>
  );
}

/** Feed / Reels / Stories live on the full StudioCommunity composer page.
 *  Pointing at it rather than re-implementing keeps one posting flow. */
export function ComposerLink() {
  return (
    <Section title="Post to Spotlight" sub="The composer — photos, reels and stories — is the full-page editor.">
      <Empty
        title="Open the composer"
        body="Posting, editing and moderating your own work happens in the full Spotlight editor, so drafts and uploads have the room they need."
        action={<a className="pxc-btn pxc-btn--primary" href="/studio/community">Open Spotlight</a>}
      />
    </Section>
  );
}

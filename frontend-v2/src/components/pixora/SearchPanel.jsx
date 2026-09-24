import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '@/api/pixora';
import { Section, Loading, ErrorNote, Empty, Field } from './PixoraShell';

// Global search across Pixora — one endpoint that had no surface, so the only
// way to find a studio, a post, a vendor or a lesson was to know which of the
// eight groups it lived in and browse there.
//
// The server returns five buckets in one call and an empty q returns the empty
// shape rather than an error, so this renders the same either way.

const BUCKETS = [
  ['photographers', 'Studios'],
  ['vendors', 'Vendors'],
  ['posts', 'Posts'],
  ['resources', 'Resources'],
  ['learning', 'Learning'],
];

export default function SearchPanel({ go }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Debounced: this hits five collections server-side, so firing per keystroke
  // would be rude to the database for no gain in usefulness.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setData(null); setErr(null); return undefined; }
    let dead = false;
    setLoading(true);
    const t = setTimeout(() => {
      api.search(term, 10)
        .then((r) => { if (!dead) { setData(r.data); setErr(null); } })
        .catch((e) => { if (!dead) setErr(e?.response?.data?.detail || 'Search failed.'); })
        .finally(() => { if (!dead) setLoading(false); });
    }, 350);
    return () => { dead = true; clearTimeout(t); setLoading(false); clearTimeout(t); };
  }, [q]);

  const results = data?.results || {};
  const total = data?.total ?? 0;

  return (
    <>
      <ErrorNote message={err} />

      <Section title="Search Pixora" sub="Studios, vendors, posts, resources and lessons — all at once.">
        <Field label="Search" htmlFor="px-search" hint="At least two characters.">
          <input
            id="px-search"
            className="pxc-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="A city, a studio name, a technique…"
          />
        </Field>
      </Section>

      {loading && <Loading rows={2} />}

      {!loading && data && total === 0 && (
        <Section flush>
          <div style={{ padding: 18 }}>
            <Empty title={`Nothing matches “${data.query}”`} body="Try a shorter or more general term." />
          </div>
        </Section>
      )}

      {!loading && data && total > 0 && BUCKETS.map(([key, label]) => {
        const rows = results[key] || [];
        if (rows.length === 0) return null;
        return (
          <Section key={key} title={label} sub={`${rows.length} result${rows.length === 1 ? '' : 's'}`} flush>
            <div className="pxc-hlwrap">
              <div className="wmod-list">
                {rows.map((r, i) => (
                  <div className="wmod-item" key={r.id || r.slug || i}>
                    <span>
                      {r.studio_name || r.name || r.title || r.caption || r.headline || 'Untitled'}
                      {(r.city || r.location?.city) && (
                        <span className="pxc-hint"> · {r.city || r.location.city}</span>
                      )}
                    </span>
                    {key === 'photographers' && r.slug
                      ? <Link className="pxc-btn pxc-btn--sm" to={`/photographer/${r.slug}`}>Open</Link>
                      : <span className="pxc-hint">{r.category || r.kind || ''}</span>}
                  </div>
                ))}
              </div>
              {key === 'learning' && go && (
                <button type="button" className="pxc-btn pxc-btn--sm" style={{ marginTop: 12 }} onClick={() => go('learning', 'all')}>
                  Open the Learning Hub
                </button>
              )}
            </div>
          </Section>
        );
      })}
    </>
  );
}

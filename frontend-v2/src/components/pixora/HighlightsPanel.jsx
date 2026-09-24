import { useState } from 'react';
import * as api from '@/api/pixora';
import { Section, Loading, ErrorNote, Empty, Field, Toast, useAsync, useFlash } from './PixoraShell';

// Story highlights.
//
// Stories vanish after 24h. A highlight is a permanent SNAPSHOT of chosen
// stories — the server copies each story's url/caption into the highlight, so
// it survives the expiry. That is the whole point, and it drives two UI rules
// that are not obvious from the endpoint names:
//
//  * Only YOUR OWN stories can go in one. GET /pixora/stories returns every
//    studio's active stories, but the server's _snapshot_stories() keeps only
//    rows whose studio_id matches you and silently drops the rest. Offering
//    another studio's story would produce a highlight quietly missing items —
//    no error, just fewer things than you picked.
//  * PATCH with an empty story_ids KEEPS the existing items (update_highlight),
//    so an edit can add or replace but cannot empty a highlight. Better to say
//    that than to ship a control that silently no-ops.

export default function Highlights({ myId }) {
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState([]);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(() => Promise.all([
    api.highlights().then((r) => r.data).catch(() => null),
    api.stories().then((r) => r.data).catch(() => null),
  ]).then(([h, s]) => ({ h, s })));

  const rows = data?.h?.highlights || [];
  const allStories = data?.s?.stories || [];
  const mine = myId ? allStories.filter((s) => s.studio_id === myId) : allStories;

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const reset = () => { setTitle(''); setPicked([]); setEditing(null); setErr(null); };

  const submit = async () => {
    const t = title.trim();
    if (!t) { setErr('Give the highlight a name.'); return; }
    if (!editing && picked.length === 0) { setErr('Pick at least one story.'); return; }
    setBusy(true);
    setErr(null);
    try {
      if (editing) {
        await api.updateHighlight(editing, { title: t, story_ids: picked });
        flash('Highlight updated.');
      } else {
        await api.createHighlight({ title: t, story_ids: picked });
        flash('Highlight saved.');
      }
      reset();
      reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not save.');
    } finally { setBusy(false); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section
        title={editing ? 'Edit highlight' : 'New highlight'}
        sub="Stories disappear after a day. A highlight keeps the ones worth keeping, permanently."
      >
        <Field label="Name" htmlFor="hl-title" hint="Up to 60 characters — shown on your profile.">
          <input
            id="hl-title"
            className="pxc-input"
            maxLength={60}
            value={title}
            onChange={(e) => { setTitle(e.target.value); setErr(null); }}
            placeholder="Weddings 2026"
          />
        </Field>

        {err && <p className="pxc-err">{err}</p>}

        {mine.length === 0 ? (
          <Empty
            title="You have no active stories"
            body="Post a story from the community page first — a highlight is built from your own stories, and only while they are still live."
          />
        ) : (
          <>
            <p className="pxc-label" style={{ marginTop: 14 }}>
              Your stories{picked.length > 0 ? ` · ${picked.length} selected` : ''}
            </p>
            <div className="pxc-hlgrid">
              {mine.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="pxc-hlpick"
                    aria-pressed={on}
                    onClick={() => toggle(s.id)}
                  >
                    {s.url ? (
                      <img className="pxc-hlstory" src={s.url} alt={s.caption || 'Story'} loading="lazy" />
                    ) : (
                      <span className="pxc-hlstory pxc-hlstory--text" style={s.bg ? { background: s.bg } : undefined}>
                        {s.text || 'Text story'}
                      </span>
                    )}
                    <span className="pxc-hlname">{s.caption || s.type || 'Story'}</span>
                    {on && <span className="pxc-hltag">Selected</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="pxc-hlactions">
          <button type="button" className="pxc-btn pxc-btn--primary" disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create highlight'}
          </button>
          {editing && <button type="button" className="pxc-btn" onClick={reset}>Cancel</button>}
        </div>
        {editing && (
          <p className="pxc-hint">
            Selecting no stories leaves the existing ones untouched — an edit can
            add or replace, but cannot empty a highlight.
          </p>
        )}
      </Section>

      <Section title="Your highlights" sub="Shown on your public profile." flush>
        <div className="pxc-hlwrap">
          {rows.length === 0 ? (
            <Empty title="No highlights yet" body="Create one above and it stays on your profile after the stories expire." />
          ) : (
            <div className="pxc-hlgrid">
              {rows.map((h) => (
                <div key={h.id} className="pxc-hlcard">
                  {h.cover_url
                    ? <img className="pxc-hlcover" src={h.cover_url} alt={h.title} loading="lazy" />
                    : <span className="pxc-hlcover pxc-hlcover--blank" />}
                  <span className="pxc-hlname">{h.title}</span>
                  <span className="pxc-hlmeta">
                    {(h.items || []).length} item{(h.items || []).length === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    className="pxc-btn pxc-btn--sm"
                    onClick={() => { setEditing(h.id); setTitle(h.title || ''); setPicked([]); setErr(null); }}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <Toast message={toast} />
    </>
  );
}

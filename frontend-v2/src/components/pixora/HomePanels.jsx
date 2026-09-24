import { useState } from 'react';
import * as api from '@/api/pixora';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import {
  Section, Stats, Empty, Loading, ErrorNote, Rows, Pill, Toast, Field, useAsync, useFlash,
} from './PixoraShell';

const num = new Intl.NumberFormat('en-IN');

function when(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────── Overview
//
// /me carries identity, stats, reputation, tier, achievements, verification
// and community_score — but not storage, which has its own endpoint.
export function Overview({ go }) {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.me().then((r) => r.data),
      api.storage().then((r) => r.data).catch(() => null),
    ]).then(([me, storage]) => ({ ...me, storage })),
  );
  const me = data || {};
  const s = me.stats || {};
  const st = me.storage;

  const quick = [
    ['Notifications', 'Alerts and recent activity', 'home', 'notifications'],
    ['Network', 'New followers and suggested creators', 'home', 'network'],
    ['Upcoming events', 'Community events and meetups', 'home', 'events'],
    ['Post to Spotlight', 'Share your work with the community', 'spotlight', 'feed'],
  ];

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Stats items={[
        { label: 'Community score', value: num.format(me.community_score?.score ?? me.reputation ?? 0), hint: me.tier || undefined },
        { label: 'Posts', value: num.format(s.posts ?? 0) },
        { label: 'Likes received', value: num.format(s.likes_received ?? 0) },
        { label: 'Challenge wins', value: num.format(s.challenge_wins ?? 0) },
      ]}
      />

      <Section title="Jump to" sub="The four things most studios open first.">
        <div className="pxc-grid">
          {quick.map(([label, desc, g, k]) => (
            <button key={label} type="button" className="pxc-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go(g, k)}>
              <span className="pxc-card-title">{label}</span>
              <span className="pxc-card-meta">{desc}</span>
            </button>
          ))}
        </div>
      </Section>

      {st && (
        <Section title="Community storage" sub="Shared with your portfolio and gallery uploads.">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span>{Number(st.used_mb ?? 0).toLocaleString('en-IN')} MB used</span>
            <span className="pxc-rowmeta">{st.cap_gb ? `of ${st.cap_gb} GB` : 'no cap set'}</span>
          </div>
          <div className="pxc-bar">
            <span style={{ width: `${Math.min(100, Number(st.percent) || 0)}%` }} />
          </div>
          {st.full && <p className="pxc-err">Your storage is full — new uploads will be rejected until you free space or upgrade.</p>}
        </Section>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────── Notifications
export function Notifications({ onSeen }) {
  const { data, error, loading, reload } = useAsync(() => api.notifications().then((r) => r.data));
  const [toast, flash] = useFlash();
  const rows = data?.notifications || data?.items || (Array.isArray(data) ? data : []);

  const markRead = async () => {
    try { await api.markNotificationsRead(); flash('Marked as read.'); onSeen?.(); reload(); }
    catch { flash('Could not mark them read.'); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section
        title="Notifications"
        sub="Likes, comments, follows, campaign decisions and challenge results."
        actions={rows.length > 0 ? <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={markRead}>Mark all read</button> : null}
      >
        <Rows
          rows={rows}
          empty="Nothing new. Activity on your posts and applications shows up here."
          render={(n) => (
            <>
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{n.title || n.type || 'Activity'}</span>
                <span className="pxc-rowmeta">{when(n.created_at)}</span>
              </div>
              {(n.body || n.message) && <p className="pxc-rowbody">{n.body || n.message}</p>}
            </>
          )}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ────────────────────────────────────────────────────────────── Network
//
// Shapes verified against the server, not assumed:
//   GET /network      → { following_count, followers_count, following: [id] }
//   GET /connections  → { incoming[], outgoing[], accepted[] }, each row
//                       carrying other_id / other_name / type / status.
export function Network() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.network().then((r) => r.data).catch(() => null),
      api.connections().then((r) => r.data).catch(() => null),
    ]).then(([net, conns]) => ({ net, conns })),
  );
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const net = data?.net || {};
  const conns = data?.conns || {};
  const incoming = conns.incoming || [];
  const outgoing = conns.outgoing || [];
  const accepted = conns.accepted || [];

  const respond = async (cid, accept) => {
    setBusy(cid);
    try { await api.respondConnection(cid, accept); flash(accept ? 'Connected.' : 'Declined.'); reload(); }
    catch (e) { flash(e?.response?.data?.detail || 'That did not go through.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Stats items={[
        { label: 'Followers', value: num.format(net.followers_count ?? 0) },
        { label: 'Following', value: num.format(net.following_count ?? 0) },
        { label: 'Connections', value: num.format(accepted.length) },
      ]}
      />

      {incoming.length > 0 && (
        <Section title="Connection requests" sub="Studios asking to connect with you.">
          <Rows
            rows={incoming}
            render={(c) => (
              <>
                <div className="pxc-rowline">
                  <span className="pxc-rowmain">{c.other_name || 'A studio'}</span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" disabled={busy === c.id} onClick={() => respond(c.id, true)}>Accept</button>
                    <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" disabled={busy === c.id} onClick={() => respond(c.id, false)}>Decline</button>
                  </span>
                </div>
                <p className="pxc-rowbody">
                  {c.type ? `Wants to ${c.type}.` : ''}{c.message ? ` “${c.message}”` : ''}
                </p>
              </>
            )}
          />
        </Section>
      )}

      <Section title="Your connections" sub="Studios you have connected with.">
        <Rows
          rows={accepted}
          empty="No connections yet. Send a request from Creators or the leaderboard."
          render={(c) => (
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{c.other_name}</span>
              <Pill tone="good">{c.type || 'connected'}</Pill>
            </div>
          )}
        />
      </Section>

      {outgoing.length > 0 && (
        <Section title="Awaiting a reply" sub="Requests you sent that have not been answered yet.">
          <Rows
            rows={outgoing}
            render={(c) => (
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{c.other_name}</span>
                <Pill tone="warn">pending</Pill>
              </div>
            )}
          />
        </Section>
      )}
      <Toast message={toast} />
    </>
  );
}

// ───────────────────────────────────────────────────────────── Creators
//
// Both creator endpoints return { creators: [{ studio_id, name, avatar, city,
// url, verified_level, reason, … }] }. `follow` is a toggle that answers with
// the resulting state, so the button reflects the server rather than a guess.
export function Creators() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.featuredCreators().then((r) => r.data).catch(() => null),
      api.suggestedCreators().then((r) => r.data).catch(() => null),
      api.network().then((r) => r.data).catch(() => null),
    ]).then(([f, s, net]) => ({ f, s, net })),
  );
  const [followed, setFollowed] = useState({});
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const featured = data?.f?.creators || [];
  const suggested = data?.s?.creators || [];
  const baseline = data?.net?.following || [];

  const isFollowing = (id) => (id in followed ? followed[id] : baseline.includes(id));

  const doFollow = async (id) => {
    setBusy(id);
    try {
      const { data: res } = await api.follow(id);
      setFollowed((s) => ({ ...s, [id]: !!res.following }));
      flash(res.following ? 'Following.' : 'Unfollowed.');
    } catch (e) { flash(e?.response?.data?.detail || 'Could not follow.'); }
    finally { setBusy(null); }
  };

  const connect = async (id) => {
    try {
      const { data: res } = await api.requestConnection(id);
      flash(res.already ? 'A request is already pending with this studio.' : 'Connection request sent.');
    } catch (e) { flash(e?.response?.data?.detail || 'Could not send that request.'); }
  };

  const CreatorGrid = ({ rows, empty }) => (
    rows.length === 0 ? <Empty title={empty} /> : (
      <div className="pxc-grid">
        {rows.map((c) => (
          <div className="pxc-card" key={c.studio_id}>
            <span className="pxc-card-title">{c.name}{c.verified_level ? ' ✓' : ''}</span>
            <span className="pxc-card-meta">
              {[c.city, c.reason, typeof c.followers === 'number' ? `${num.format(c.followers)} followers` : null]
                .filter(Boolean).join(' · ')}
            </span>
            {(c.services || []).length > 0 && (
              <span className="pxc-card-meta">{c.services.slice(0, 4).join(' · ')}</span>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="pxc-btn pxc-btn--ghost pxc-btn--sm"
                disabled={busy === c.studio_id}
                onClick={() => doFollow(c.studio_id)}
              >
                {isFollowing(c.studio_id) ? 'Following' : 'Follow'}
              </button>
              <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => connect(c.studio_id)}>
                Connect
              </button>
              {c.url && <a className="pxc-btn pxc-btn--ghost pxc-btn--sm" href={c.url}>Portfolio</a>}
            </div>
          </div>
        ))}
      </div>
    )
  );

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section title="Featured" sub="Verified studios, award winners and featured placements.">
        <CreatorGrid rows={featured} empty="No featured studios right now." />
      </Section>
      <Section title="Suggested for you" sub="Matched on your city, the work you shoot and how active a studio is here.">
        <CreatorGrid rows={suggested} empty="No suggestions yet — completing your profile sharpens these." />
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────── Events
//
// GET /events → { events[], facets: { countries, regions, kinds } }.
// RSVP is a toggle with no body; the server enforces capacity and returns 400
// when an event is full, so `is_full` disables the button before that happens.
const EVENT_KINDS = ['workshop', 'meetup', 'webinar', 'contest'];
const EVENT_BLANK = {
  title: '', kind: 'workshop', date: '', location: '', description: '',
  country: '', region: '', city: '', timezone: '', is_virtual: false, join_url: '', capacity: 0,
};

export function CommunityEvents() {
  const [filt, setFilt] = useState({ country: '', region: '', kind: '', scope: 'upcoming', virtual: '', q: '' });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EVENT_BLANK);
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => api.events(Object.fromEntries(Object.entries(filt).filter(([, v]) => v))).then((r) => r.data),
    [filt.country, filt.region, filt.kind, filt.scope, filt.virtual, filt.q],
  );

  const rows = data?.events || [];
  const facets = data?.facets || { countries: [], regions: [], kinds: [] };
  const setF = (k) => (e) => setFilt((x) => ({ ...x, [k]: e.target.value }));
  const setForm_ = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const create = async () => {
    if (!form.title.trim()) { flash('Give the event a title.'); return; }
    try {
      await api.createEvent({ ...form, capacity: Number(form.capacity) || 0 });
      setForm(EVENT_BLANK);
      setCreating(false);
      flash('Event published.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not publish it.'); }
  };

  const rsvp = async (ev) => {
    setBusy(ev.id);
    try { await api.rsvpEvent(ev.id); flash(ev.rsvped ? 'RSVP withdrawn.' : "You're going."); reload(); }
    catch (e) { flash(e?.response?.data?.detail || 'Could not RSVP.'); }
    finally { setBusy(null); }
  };

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section
        title="Community events"
        sub="Meetups, workshops, webinars and contests organised by studios on Pixora."
        actions={(
          <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'Host an event'}
          </button>
        )}
      >
        {creating ? (
          <div className="pxc-formgrid">
            <Field label="Event title" htmlFor="ev-title" wide>
              <input id="ev-title" className="pxc-input" value={form.title} onChange={setForm_('title')} />
            </Field>
            <Field label="Kind" htmlFor="ev-kind">
              <select id="ev-kind" className="pxc-input" value={form.kind} onChange={setForm_('kind')}>
                {EVENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Date" htmlFor="ev-date">
              <input id="ev-date" className="pxc-input" type="date" value={form.date} onChange={setForm_('date')} />
            </Field>
            <Field label="Country" htmlFor="ev-country"><input id="ev-country" className="pxc-input" value={form.country} onChange={setForm_('country')} /></Field>
            <Field label="Region" htmlFor="ev-region" hint="e.g. South Asia"><input id="ev-region" className="pxc-input" value={form.region} onChange={setForm_('region')} /></Field>
            <Field label="City" htmlFor="ev-city"><input id="ev-city" className="pxc-input" value={form.city} onChange={setForm_('city')} /></Field>
            <Field label="Timezone" htmlFor="ev-tz" hint="e.g. Asia/Kolkata"><input id="ev-tz" className="pxc-input" value={form.timezone} onChange={setForm_('timezone')} /></Field>
            <Field label="Capacity" htmlFor="ev-cap" hint="0 means unlimited">
              <input id="ev-cap" className="pxc-input" type="number" min="0" value={form.capacity} onChange={setForm_('capacity')} />
            </Field>
            <div className="pxc-field">
              <label className="pxc-check">
                <input type="checkbox" checked={form.is_virtual} onChange={setForm_('is_virtual')} />
                This is a virtual event
              </label>
            </div>
            {form.is_virtual ? (
              <Field label="Join link" htmlFor="ev-url" wide>
                <input id="ev-url" className="pxc-input" value={form.join_url} onChange={setForm_('join_url')} placeholder="https://…" />
              </Field>
            ) : (
              <Field label="Venue / location" htmlFor="ev-loc" wide>
                <input id="ev-loc" className="pxc-input" value={form.location} onChange={setForm_('location')} />
              </Field>
            )}
            <Field label="Details" htmlFor="ev-desc" wide>
              <textarea id="ev-desc" className="pxc-input" rows={2} value={form.description} onChange={setForm_('description')} />
            </Field>
            <div className="pxc-field pxc-field--wide">
              <button type="button" className="pxc-btn pxc-btn--primary" onClick={create}>Publish event</button>
            </div>
          </div>
        ) : (
          <div className="pxc-inline">
            <input className="pxc-input" value={filt.q} onChange={setF('q')} placeholder="Search events…" aria-label="Search events" />
            <select className="pxc-input" style={{ flex: '0 0 150px' }} value={filt.scope} onChange={setF('scope')} aria-label="Dates">
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
              <option value="">All dates</option>
            </select>
            <select className="pxc-input" style={{ flex: '0 0 160px' }} value={filt.country} onChange={setF('country')} aria-label="Country">
              <option value="">All countries</option>
              {(facets.countries || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="pxc-input" style={{ flex: '0 0 160px' }} value={filt.region} onChange={setF('region')} aria-label="Region">
              <option value="">All regions</option>
              {(facets.regions || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="pxc-input" style={{ flex: '0 0 150px' }} value={filt.virtual} onChange={setF('virtual')} aria-label="Format">
              <option value="">Any format</option>
              <option value="1">Virtual</option>
              <option value="0">In person</option>
            </select>
          </div>
        )}
      </Section>

      <Section title="What's on" flush>
        <div style={{ padding: 18 }}>
          {loading ? <Loading rows={2} /> : (
            <Rows
              rows={rows}
              empty="No events match your filters. When a studio organises one it appears here."
              render={(e) => (
                <>
                  <div className="pxc-rowline">
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                      <Pill tone="accent">{e.kind}</Pill>
                      {e.is_virtual && <Pill tone="good">Virtual</Pill>}
                      <span className="pxc-rowmain">{e.title}</span>
                    </span>
                    <button
                      type="button"
                      className={`pxc-btn pxc-btn--sm ${e.rsvped ? 'pxc-btn--ghost' : 'pxc-btn--primary'}`}
                      disabled={busy === e.id || (e.is_full && !e.rsvped)}
                      onClick={() => rsvp(e)}
                    >
                      {e.rsvped ? 'Going' : e.is_full ? 'Full' : 'RSVP'}
                      {' '}({e.rsvp_count ?? 0}{e.capacity ? `/${e.capacity}` : ''})
                    </button>
                  </div>
                  <p className="pxc-rowbody">
                    {[
                      e.date && `${e.date}${e.timezone ? ` · ${e.timezone}` : ''}`,
                      [e.city, e.country].filter(Boolean).join(', ') || e.location,
                      e.host && `by ${e.host}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {e.description && <p className="pxc-rowbody">{e.description}</p>}
                </>
              )}
            />
          )}
        </div>
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ────────────────────────────────────── shared: a simple post grid
export function PostGrid({ rows, empty }) {
  if (!rows || rows.length === 0) return <Empty title={empty || 'Nothing here yet'} />;
  return (
    <div className="pxc-grid">
      {rows.map((p) => {
        const media = p.media?.[0]?.url || p.media_url || p.thumbnail || p.image_url;
        return (
          <article className="pxc-card" key={p.id} style={{ padding: 0, overflow: 'hidden' }}>
            <span className="pxc-media">
              {media
                ? <img src={resolveMediaUrl(media)} alt={p.caption ? String(p.caption).slice(0, 60) : ''} loading="lazy" />
                : <span className="pxc-card-meta" style={{ padding: 16 }}>No image</span>}
            </span>
            <span style={{ padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span className="pxc-card-title">{p.studio_name || p.author_name || 'A studio'}</span>
              {p.caption && <span className="pxc-card-meta">{String(p.caption).slice(0, 90)}</span>}
              <span className="pxc-card-meta">{num.format(p.likes ?? p.like_count ?? 0)} likes</span>
            </span>
          </article>
        );
      })}
    </div>
  );
}

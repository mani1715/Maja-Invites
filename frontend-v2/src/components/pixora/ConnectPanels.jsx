import { useState } from 'react';
import * as api from '@/api/pixora';
import {
  Section, Empty, Loading, ErrorNote, Rows, Pill, Toast, Field, useAsync, useFlash,
} from './PixoraShell';

const num = new Intl.NumberFormat('en-IN');
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

// ───────────────────────────────────────────────────────────── Hiring
// Gigs board + the talent register. Legacy kept these on one screen because a
// photographer either wants work or wants to hire — same page, two directions.
export function Hiring({ myId }) {
  const [tab, setTab] = useState('gigs');
  const [toast, flash] = useFlash();

  return (
    <>
      <div className="pxc-subs">
        {[['gigs', 'Open gigs'], ['post', 'Post a gig'], ['talent', 'Talent register']].map(([k, l]) => (
          <button key={k} type="button" className={`pxc-sub${tab === k ? ' pxc-sub--on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'gigs' && <GigsBoard myId={myId} />}
      {tab === 'post' && <PostGig onDone={() => { flash('Gig posted.'); setTab('gigs'); }} />}
      {tab === 'talent' && <TalentRegister />}
      <Toast message={toast} />
    </>
  );
}

// A gig is { title, location, budget_inr, description }; the list adds `poster`
// and `applicant_count`. Anything richer than that has nowhere to be stored.
function GigsBoard({ myId }) {
  const { data, error, loading, reload } = useAsync(() => api.gigs().then((r) => r.data));
  const rows = data?.gigs || [];
  if (loading) return <Loading />;
  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section title="Open gigs" sub="Second-shooter, editing and assistant work posted by other studios.">
        <Rows
          rows={rows}
          empty="No open gigs. Studios post here when they need a hand on a date."
          render={(g) => (
            <>
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{g.title}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {g.studio_id === myId && <Pill tone="accent">Yours</Pill>}
                  {g.budget_inr ? <Pill tone="neutral">{rupees.format(g.budget_inr)}</Pill> : null}
                </span>
              </div>
              <p className="pxc-rowbody">
                {[g.location, g.poster && `posted by ${g.poster}`,
                  `${g.applicant_count ?? 0} applicant${g.applicant_count === 1 ? '' : 's'}`]
                  .filter(Boolean).join(' · ')}
              </p>
              {g.description && <p className="pxc-rowbody">{g.description}</p>}
            </>
          )}
        />
      </Section>
    </>
  );
}

function PostGig({ onDone }) {
  const [f, setF] = useState({ title: '', location: '', budget_inr: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(null); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.createGig({ ...f, budget_inr: Number(f.budget_inr) || 0 });
      setF({ title: '', location: '', budget_inr: '', description: '' });
      onDone?.();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not post that gig.');
    } finally { setBusy(false); }
  };

  return (
    <Section title="Post a gig" sub="Other studios see this immediately. Say the city and the date in the title — that is what people scan for.">
      <form onSubmit={submit}>
        <ErrorNote message={err} />
        <div className="pxc-formgrid">
          <Field label="Title" htmlFor="g-title" wide>
            <input id="g-title" className="pxc-input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Second shooter — Hyderabad wedding, 14 Dec" required />
          </Field>
          <Field label="Location" htmlFor="g-loc">
            <input id="g-loc" className="pxc-input" value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Hyderabad" />
          </Field>
          <Field label="Budget (₹)" htmlFor="g-budget" hint="Optional, but gigs with a number get more replies.">
            <input id="g-budget" type="number" min="0" className="pxc-input" value={f.budget_inr} onChange={(e) => set('budget_inr', e.target.value)} />
          </Field>
          <Field label="Details" htmlFor="g-desc" wide>
            <textarea id="g-desc" className="pxc-input" rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        <button type="submit" className="pxc-btn pxc-btn--primary" style={{ marginTop: 14 }} disabled={busy || !f.title.trim()}>
          {busy ? 'Posting…' : 'Post gig'}
        </button>
      </form>
    </Section>
  );
}

// The register stores a headline, specialties, a showreel, a rate card and a
// bio — and a listing goes through moderation, so it comes back with a status.
const TALENT_BLANK = { headline: '', specialties: '', showreel_url: '', rate_card: '', bio: '' };

function TalentRegister() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.talent().then((r) => r.data).catch(() => null),
      api.myTalent().then((r) => r.data).catch(() => null),
    ]).then(([all, mine]) => ({ all, mine })),
  );
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toast, flash] = useFlash();
  const [f, setF] = useState(TALENT_BLANK);

  const rows = data?.all?.talent || [];
  const mine = data?.mine?.talent || null;

  const startEdit = () => {
    setF(mine ? {
      headline: mine.headline || '',
      specialties: (mine.specialties || []).join(', '),
      showreel_url: mine.showreel_url || '',
      rate_card: mine.rate_card || '',
      bio: mine.bio || '',
    } : TALENT_BLANK);
    setEditing(true);
  };

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const apply = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.applyTalent({
        ...f,
        specialties: f.specialties.split(',').map((s) => s.trim()).filter(Boolean),
      });
      flash(mine ? 'Listing updated.' : 'Listed — studios can find you once it is approved.');
      setEditing(false);
      reload();
    } catch (e2) { flash(e2?.response?.data?.detail || 'Could not save your listing.'); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section
        title={mine ? 'Your listing' : 'List yourself'}
        sub="Studios looking for a second shooter, an editor or a specialist search this register."
        actions={mine && !editing ? (
          <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={startEdit}>Edit listing</button>
        ) : null}
      >
        {mine && !editing ? (
          <>
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{mine.headline || 'Listed'}</span>
              <Pill tone={mine.status === 'approved' ? 'good' : mine.status === 'rejected' ? 'bad' : 'warn'}>
                {mine.status || 'pending'}
              </Pill>
            </div>
            {(mine.specialties || []).length > 0 && <p className="pxc-rowbody">{mine.specialties.join(' · ')}</p>}
            {mine.rate_card && <p className="pxc-rowbody">Rates: {mine.rate_card}</p>}
            {mine.bio && <p className="pxc-rowbody">{mine.bio}</p>}
            {mine.showreel_url && <p className="pxc-rowbody"><a href={mine.showreel_url}>Showreel</a></p>}
          </>
        ) : (
          <form onSubmit={apply}>
            <div className="pxc-formgrid">
              <Field label="Headline" htmlFor="t-head" wide hint="What you do, in one line.">
                <input id="t-head" className="pxc-input" value={f.headline} onChange={set('headline')} placeholder="Second shooter & candid specialist, Hyderabad" required />
              </Field>
              <Field label="Specialties" htmlFor="t-spec" hint="Comma separated." wide>
                <input id="t-spec" className="pxc-input" value={f.specialties} onChange={set('specialties')} placeholder="candid, drone, editing" />
              </Field>
              <Field label="Showreel link" htmlFor="t-reel">
                <input id="t-reel" className="pxc-input" type="url" value={f.showreel_url} onChange={set('showreel_url')} placeholder="https://…" />
              </Field>
              <Field label="Rate card" htmlFor="t-rate" hint="Free text — per day, per event, whatever you quote.">
                <input id="t-rate" className="pxc-input" value={f.rate_card} onChange={set('rate_card')} placeholder="₹8,000 / day" />
              </Field>
              <Field label="About you" htmlFor="t-bio" wide>
                <textarea id="t-bio" className="pxc-input" rows={3} value={f.bio} onChange={set('bio')} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="submit" className="pxc-btn pxc-btn--primary" disabled={busy || !f.headline.trim()}>
                {busy ? 'Saving…' : mine ? 'Save listing' : 'Add me to the register'}
              </button>
              {editing && <button type="button" className="pxc-btn pxc-btn--ghost" onClick={() => setEditing(false)}>Cancel</button>}
            </div>
          </form>
        )}
      </Section>

      <Section title="Available talent" sub="Approved listings from across the community.">
        <Rows
          rows={rows}
          empty="Nobody listed yet."
          render={(t) => (
            <>
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{t.name || t.headline}</span>
                <span className="pxc-rowmeta">{t.rate_card || ''}</span>
              </div>
              <p className="pxc-rowbody">
                {[t.headline !== t.name ? t.headline : null, (t.specialties || []).join(' · ')].filter(Boolean).join(' — ')}
              </p>
              {t.bio && <p className="pxc-rowbody">{t.bio}</p>}
            </>
          )}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ───────────────────────────────────────────────────────────── Mentors
//
// A mentor listing is { id (== studio_id), studio_id, name, expertise, bio,
// rate_inr }. Posting to /mentors upserts your own listing, so the same panel
// both browses mentors and lets a studio become one.
export function Mentors() {
  const { data, error, loading, reload } = useAsync(() => api.mentors().then((r) => r.data));
  const [busy, setBusy] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ expertise: '', bio: '', rate_inr: '' });
  const [msg, setMsg] = useState('');
  const [asking, setAsking] = useState(null);
  const [toast, flash] = useFlash();

  const rows = data?.mentors || [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const become = async () => {
    if (!form.expertise.trim()) { flash('Say what you can help with.'); return; }
    try {
      await api.becomeMentor({ ...form, rate_inr: Number(form.rate_inr) || 0 });
      setForm({ expertise: '', bio: '', rate_inr: '' });
      setCreating(false);
      flash('You are listed as a mentor.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'Could not save your listing.'); }
  };

  const request = async (id) => {
    setBusy(id);
    try {
      await api.requestMentor({ mentor_id: id, message: msg.trim() || 'I would love your guidance.' });
      flash('Request sent.');
      setAsking(null);
      setMsg('');
    } catch (e) { flash(e?.response?.data?.detail || 'Could not send that request.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section
        title="Become a mentor"
        sub="Offer your time to studios earlier in their career. You choose the rate — zero is fine."
        actions={(
          <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'List myself'}
          </button>
        )}
      >
        {creating ? (
          <div className="pxc-formgrid">
            <Field label="Expertise" htmlFor="mn-exp" wide hint="Candid, editing, pricing, running a team…">
              <input id="mn-exp" className="pxc-input" value={form.expertise} onChange={set('expertise')} />
            </Field>
            <Field label="Short bio" htmlFor="mn-bio" wide>
              <textarea id="mn-bio" className="pxc-input" rows={2} value={form.bio} onChange={set('bio')} />
            </Field>
            <Field label="Rate (₹ per hour)" htmlFor="mn-rate" hint="0 means free.">
              <input id="mn-rate" className="pxc-input" type="number" min="0" value={form.rate_inr} onChange={set('rate_inr')} />
            </Field>
            <div className="pxc-field pxc-field--wide">
              <button type="button" className="pxc-btn pxc-btn--primary" onClick={become}>Save mentor listing</button>
            </div>
          </div>
        ) : (
          <p className="pxc-rowbody" style={{ marginTop: 0 }}>
            Mentoring is opt-in. Listing yourself shows your expertise and rate to the community; you still approve every request.
          </p>
        )}
      </Section>

      <Section title="Mentors" sub="Requests are not automatic — each mentor chooses who to take on.">
        {rows.length === 0 ? (
          <Empty title="No mentors listed yet" body="Senior studios opt in to mentoring; the list fills as they do." />
        ) : (
          <div className="pxc-grid">
            {rows.map((m) => (
              <div className="pxc-card" key={m.id}>
                <span className="pxc-card-title">{m.name}</span>
                {m.expertise && <span className="pxc-card-meta">{m.expertise}</span>}
                <span className="pxc-card-meta">
                  {Number(m.rate_inr) > 0 ? `${rupees.format(m.rate_inr)} / hour` : 'Free'}
                </span>
                {m.bio && <span className="pxc-card-meta">{m.bio}</span>}
                {asking === m.id ? (
                  <>
                    <textarea
                      className="pxc-input"
                      rows={2}
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                      placeholder="What would you like help with?"
                      aria-label="Message to the mentor"
                    />
                    <span style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button type="button" className="pxc-btn pxc-btn--primary pxc-btn--sm" disabled={busy === m.id} onClick={() => request(m.id)}>
                        {busy === m.id ? 'Sending…' : 'Send request'}
                      </button>
                      <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={() => { setAsking(null); setMsg(''); }}>Cancel</button>
                    </span>
                  </>
                ) : (
                  <button
                    type="button"
                    className="pxc-btn pxc-btn--ghost pxc-btn--sm"
                    style={{ marginTop: 6 }}
                    onClick={() => { setAsking(m.id); setMsg(''); }}
                  >
                    Ask to be mentored
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ───────────────────────────────────────────────────────────── Vendors
//
// A vendor listing is business_name / category / location / price band /
// services / contact — not a generic name+phone record. Categories come from
// the seeded vendor-categories collection ({ key, label }), and the directory
// returns { vendors, count, facets }.
const VENDOR_BLANK = {
  business_name: '', owner_name: '', category: '', description: '',
  country: 'India', state: '', city: '', experience_years: '',
  price_min_inr: '', price_max_inr: '', services: '',
  phone: '', email: '', website: '', instagram: '', portfolio_url: '',
  availability_status: 'Available',
};

const AVAILABILITY = ['Available', 'Limited', 'Booked'];

export function Vendors() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.vendors().then((r) => r.data).catch(() => null),
      api.myVendor().then((r) => r.data).catch(() => null),
      api.vendorCategories().then((r) => r.data).catch(() => null),
    ]).then(([all, mine, cats]) => ({ all, mine, cats })),
  );
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(VENDOR_BLANK);

  const rows = data?.all?.vendors || [];
  const cats = data?.cats?.categories || [];
  const mine = data?.mine?.vendor || null;
  const reviews = data?.mine?.reviews || [];

  const startEdit = () => {
    setF(mine ? {
      ...VENDOR_BLANK,
      ...mine,
      services: (mine.services || []).join(', '),
      phone: mine.contact?.phone || '',
      email: mine.contact?.email || '',
    } : VENDOR_BLANK);
    setEditing(true);
  };

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { phone, email, ...rest } = f;
      await api.saveVendor({
        ...rest,
        experience_years: Number(f.experience_years) || 0,
        price_min_inr: Number(f.price_min_inr) || 0,
        price_max_inr: Number(f.price_max_inr) || 0,
        services: String(f.services || '').split(',').map((s) => s.trim()).filter(Boolean),
        contact: { ...(phone ? { phone } : {}), ...(email ? { email } : {}) },
      });
      flash('Vendor listing saved.');
      setEditing(false);
      reload();
    } catch (e2) { flash(e2?.response?.data?.detail || 'Could not save that listing.'); }
    finally { setBusy(false); }
  };

  const replyTo = async (rid, response) => {
    try { await api.respondVendorReview(rid, response); flash('Reply posted.'); reload(); }
    catch { flash('Could not post that reply.'); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section
        title={mine ? 'Your vendor listing' : 'List your services'}
        sub="If you also offer decor, makeup or another service, list it so couples on MAJA can find you."
        actions={mine && !editing ? (
          <button type="button" className="pxc-btn pxc-btn--ghost pxc-btn--sm" onClick={startEdit}>Edit listing</button>
        ) : null}
      >
        {mine && !editing ? (
          <>
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{mine.business_name}</span>
              <Pill tone={mine.availability_status === 'Booked' ? 'bad' : mine.availability_status === 'Limited' ? 'warn' : 'good'}>
                {mine.availability_status || 'Available'}
              </Pill>
            </div>
            <p className="pxc-rowbody">
              {[mine.category, [mine.city, mine.state].filter(Boolean).join(', '),
                mine.experience_years ? `${mine.experience_years} yrs` : null,
                mine.price_min_inr ? `${rupees.format(mine.price_min_inr)}–${rupees.format(mine.price_max_inr)}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
            {mine.description && <p className="pxc-rowbody">{mine.description}</p>}
          </>
        ) : (
          <form onSubmit={save}>
            <div className="pxc-formgrid">
              <Field label="Business name" htmlFor="v-name">
                <input id="v-name" className="pxc-input" value={f.business_name} onChange={set('business_name')} required />
              </Field>
              <Field label="Owner name" htmlFor="v-owner">
                <input id="v-owner" className="pxc-input" value={f.owner_name} onChange={set('owner_name')} />
              </Field>
              <Field label="Category" htmlFor="v-cat">
                <select id="v-cat" className="pxc-input" value={f.category} onChange={set('category')}>
                  <option value="">Choose…</option>
                  {cats.map((c) => <option key={c.key || c.id} value={c.key || c.label}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Availability" htmlFor="v-avail">
                <select id="v-avail" className="pxc-input" value={f.availability_status} onChange={set('availability_status')}>
                  {AVAILABILITY.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="City" htmlFor="v-city"><input id="v-city" className="pxc-input" value={f.city} onChange={set('city')} /></Field>
              <Field label="State" htmlFor="v-state"><input id="v-state" className="pxc-input" value={f.state} onChange={set('state')} /></Field>
              <Field label="Years of experience" htmlFor="v-exp">
                <input id="v-exp" className="pxc-input" type="number" min="0" value={f.experience_years} onChange={set('experience_years')} />
              </Field>
              <Field label="Price from (₹)" htmlFor="v-pmin">
                <input id="v-pmin" className="pxc-input" type="number" min="0" value={f.price_min_inr} onChange={set('price_min_inr')} />
              </Field>
              <Field label="Price to (₹)" htmlFor="v-pmax">
                <input id="v-pmax" className="pxc-input" type="number" min="0" value={f.price_max_inr} onChange={set('price_max_inr')} />
              </Field>
              <Field label="Services" htmlFor="v-serv" hint="Comma separated." wide>
                <input id="v-serv" className="pxc-input" value={f.services} onChange={set('services')} placeholder="stage decor, floral, lighting" />
              </Field>
              <Field label="Phone" htmlFor="v-phone"><input id="v-phone" className="pxc-input" value={f.phone} onChange={set('phone')} inputMode="tel" /></Field>
              <Field label="Email" htmlFor="v-email"><input id="v-email" className="pxc-input" type="email" value={f.email} onChange={set('email')} /></Field>
              <Field label="Website" htmlFor="v-web"><input id="v-web" className="pxc-input" type="url" value={f.website} onChange={set('website')} /></Field>
              <Field label="Instagram" htmlFor="v-ig"><input id="v-ig" className="pxc-input" value={f.instagram} onChange={set('instagram')} /></Field>
              <Field label="Description" htmlFor="v-desc" wide>
                <textarea id="v-desc" className="pxc-input" rows={3} value={f.description} onChange={set('description')} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="submit" className="pxc-btn pxc-btn--primary" disabled={busy || !f.business_name.trim()}>
                {busy ? 'Saving…' : mine ? 'Update listing' : 'Create listing'}
              </button>
              {editing && <button type="button" className="pxc-btn pxc-btn--ghost" onClick={() => setEditing(false)}>Cancel</button>}
            </div>
          </form>
        )}
      </Section>

      {reviews.length > 0 && (
        <Section title="Your reviews" sub="Replying publicly is usually worth more than the rating itself.">
          <Rows
            rows={reviews}
            render={(r) => (
              <>
                <div className="pxc-rowline">
                  <span className="pxc-rowmain">{r.author_name || 'A client'}</span>
                  <span className="pxc-rowmeta">{r.rating ? `${r.rating}/5` : ''}</span>
                </div>
                {r.body && <p className="pxc-rowbody">{r.body}</p>}
                {r.response ? (
                  <p className="pxc-rowbody"><strong>You replied:</strong> {r.response}</p>
                ) : (
                  <ReviewReply onSend={(text) => replyTo(r.id, text)} />
                )}
              </>
            )}
          />
        </Section>
      )}

      <Section title="Vendor directory" sub={`${data?.all?.count ?? rows.length} listed`}>
        <Rows
          rows={rows}
          empty="No vendors listed yet."
          render={(v) => (
            <>
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{v.business_name}</span>
                <span className="pxc-rowmeta">
                  {v.rating_count > 0 ? `${Number(v.rating || 0).toFixed(1)} (${v.rating_count})` : 'no reviews yet'}
                </span>
              </div>
              <p className="pxc-rowbody">
                {[v.category, [v.city, v.state].filter(Boolean).join(', '),
                  v.price_min_inr ? `from ${rupees.format(v.price_min_inr)}` : null,
                  v.availability_status,
                ].filter(Boolean).join(' · ')}
              </p>
            </>
          )}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}

function ReviewReply({ onSend }) {
  const [text, setText] = useState('');
  return (
    <div className="pxc-inline" style={{ marginTop: 8 }}>
      <input
        className="pxc-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Reply publicly…"
        aria-label="Reply to review"
      />
      <button
        type="button"
        className="pxc-btn pxc-btn--ghost"
        disabled={!text.trim()}
        onClick={() => { onSend(text.trim()); setText(''); }}
      >
        Reply
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Teams
export function Teams() {
  // The stored member is { name, role, photo_url, instagram } — a public
  // credit, not a platform account, so there is no contact number on it.
  const { data, error, loading, reload } = useAsync(() => api.teams().then((r) => r.data));
  const [f, setF] = useState({ name: '', role: '', instagram: '' });
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();
  const rows = data?.team || [];

  const add = async (e) => {
    e.preventDefault();
    setBusy('add');
    try { await api.saveTeamMember(f); setF({ name: '', role: '', instagram: '' }); flash('Added.'); reload(); }
    catch (e2) { flash(e2?.response?.data?.detail || 'Could not add them.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />
      <Section title="Your crew" sub="The people who shoot with you. This is your public credit list — for platform access and roles, use Team under Settings.">
        <form onSubmit={add} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <Field label="Name" htmlFor="tm-name"><input id="tm-name" className="pxc-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label="Role" htmlFor="tm-role"><input id="tm-role" className="pxc-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Lead editor" /></Field>
          <Field label="Instagram" htmlFor="tm-ig"><input id="tm-ig" className="pxc-input" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="@handle" /></Field>
          <button type="submit" className="pxc-btn pxc-btn--primary" disabled={busy === 'add' || !f.name.trim()}>Add</button>
        </form>

        <Rows
          rows={rows}
          empty="Nobody added yet."
          render={(m) => (
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{m.name}</span>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="pxc-rowmeta">{m.role || '—'}</span>
                <button
                  type="button"
                  className="pxc-btn pxc-btn--danger pxc-btn--sm"
                  disabled={busy === m.id}
                  onClick={async () => {
                    setBusy(m.id);
                    try { await api.removeTeamMember(m.id); flash('Removed.'); reload(); }
                    catch { flash('Could not remove them.'); }
                    finally { setBusy(null); }
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
          )}
        />
      </Section>
      <Toast message={toast} />
    </>
  );
}

// ─────────────────────────────────────────────────────── Collaborations
//
// The connections endpoint answers with three buckets — incoming, outgoing and
// accepted — each row carrying other_id / other_name / type / message. Responding
// takes { action: 'accept' | 'decline' }.
export function Collaborations() {
  const { data, error, loading, reload } = useAsync(() => api.connections().then((r) => r.data));
  const [busy, setBusy] = useState(null);
  const [toast, flash] = useFlash();

  const incoming = data?.incoming || [];
  const outgoing = data?.outgoing || [];
  const accepted = data?.accepted || [];

  const respond = async (cid, accept) => {
    setBusy(cid);
    try {
      await api.respondConnection(cid, accept);
      flash(accept ? 'Collaboration accepted.' : 'Declined.');
      reload();
    } catch (e) { flash(e?.response?.data?.detail || 'That did not go through.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Loading />;

  return (
    <>
      <ErrorNote message={error} onRetry={reload} />

      <Section title="Requests" sub="Studios asking to collaborate, partner or work a project with you.">
        <Rows
          rows={incoming}
          empty="No collaboration requests right now."
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

      <Section title="Collaborators" sub="Studios you work with. A connection unlocks direct messages and shared gig invites.">
        <Rows
          rows={accepted}
          empty="No collaborations yet. Send a request from Creators or the leaderboard."
          render={(c) => (
            <div className="pxc-rowline">
              <span className="pxc-rowmain">{c.other_name}</span>
              <Pill tone="good">{c.type || 'connected'}</Pill>
            </div>
          )}
        />
      </Section>

      {outgoing.length > 0 && (
        <Section title="Sent, awaiting a reply">
          <Rows
            rows={outgoing}
            render={(c) => (
              <div className="pxc-rowline">
                <span className="pxc-rowmain">{c.other_name}</span>
                <Pill tone="warn">{c.type || 'pending'}</Pill>
              </div>
            )}
          />
        </Section>
      )}
      <Toast message={toast} />
    </>
  );
}

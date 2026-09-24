// PortfolioBuildRequest — premium "have us build your portfolio" flow.
// Gate: needs an active portfolio (premium) plan. If not premium → send to the
// panel Plans page. If premium → an elegant full-details brief that is submitted
// to the platform team (lands in the admin panel) who build the page manually.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PanelTabs from '@/components/PanelTabs';
import { Crown, Loader2, Send, CheckCircle2, Sparkles, Users, Plus, Trash2 } from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Same loader the cart uses — the checkout script is not in index.html.
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const FIELDS = [
  { key: 'studio_name', label: 'Studio name' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'about', label: 'About your studio', textarea: true },
  { key: 'signature_style', label: 'Your signature style' },
  { key: 'best_work', label: 'Describe your best work / albums to feature', textarea: true },
  { key: 'packages', label: 'Packages & pricing to show', textarea: true },
  { key: 'awards', label: 'Awards / recognitions' },
  { key: 'social', label: 'Instagram / YouTube / website links', textarea: true },
  { key: 'contact', label: 'Contact (phone / email / city)' },
  { key: 'references', label: 'Reference portfolios or moodboard links', textarea: true },
];

export default function PortfolioBuildRequest() {
  const navigate = useNavigate();
  const [tier, setTier] = useState(null);
  const [details, setDetails] = useState({});
  const [notes, setNotes] = useState('');
  const [team, setTeam] = useState([]);   // [{ name, role, portfolio_link }]
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [help, setHelp] = useState(null);     // { fee_inr, unlocked, via }
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState('');

  const loadHelp = () => axios
    .get(`${API_URL}/api/portfolio/build-help`, { headers: authHeaders() })
    .then(({ data }) => setHelp(data))
    .catch(() => setHelp({ fee_inr: 100, unlocked: false, via: null }));

  // Razorpay checkout for the one-off unlock. The server verifies the signature
  // before unlocking — the client is never trusted to say "paid".
  const payForHelp = async () => {
    setPayErr(''); setPaying(true);
    try {
      const { data: order } = await axios.post(`${API_URL}/api/portfolio/build-help/order`, {},
        { headers: authHeaders() });
      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) throw new Error('Payment library did not load. Refresh and try again.');
      const rzp = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: 'MAJA Invites',
        description: 'Studio-built portfolio',
        handler: async (resp) => {
          try {
            await axios.post(`${API_URL}/api/portfolio/build-help/verify`, {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            }, { headers: authHeaders() });
            await loadHelp();          // now unlocked → the form renders
          } catch (e) {
            setPayErr('Payment went through but we could not verify it. Contact support with your payment id.');
          }
          setPaying(false);
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (e) {
      const status = e?.response?.status;
      setPayErr(status === 503
        ? 'Online payments are not enabled yet. Please contact support.'
        : (e?.response?.data?.detail || e.message || 'Could not start the payment.'));
      setPaying(false);
    }
  };

  useEffect(() => {
    loadHelp();
    axios.get(`${API_URL}/api/portfolio/tier`, { headers: authHeaders() }).then(({ data }) => setTier(data)).catch(() => setTier({ premium_unlocked: false }));
    axios.get(`${API_URL}/api/portfolio/build-request`, { headers: authHeaders() }).then(({ data }) => { if (data.request) { setExisting(data.request); setDetails(data.request.details || {}); setNotes(data.request.notes || ''); } }).catch(() => {});
    axios.get(`${API_URL}/api/portfolio/team`, { headers: authHeaders() }).then(({ data }) => { if (Array.isArray(data.team_members) && data.team_members.length) setTeam(data.team_members); }).catch(() => {});
  }, []);

  const set = (k, v) => setDetails((d) => ({ ...d, [k]: v }));
  const addMember = () => setTeam((t) => [...t, { name: '', role: '', portfolio_link: '' }]);
  const setMember = (i, k, v) => setTeam((t) => t.map((m, idx) => (idx === i ? { ...m, [k]: v } : m)));
  const removeMember = (i) => setTeam((t) => t.filter((_, idx) => idx !== i));

  const submit = async () => {
    setBusy(true);
    try {
      const cleanTeam = team.filter((m) => (m.name || '').trim());
      // Save the brief (team also included for the build team) + persist team so
      // it shows on the public portfolio immediately.
      await axios.post(`${API_URL}/api/portfolio/build-request`,
        { details: { ...details, team_members: cleanTeam }, notes }, { headers: authHeaders() });
      await axios.put(`${API_URL}/api/portfolio/team`, { team_members: cleanTeam }, { headers: authHeaders() }).catch(() => {});
      setDone(true);
    } catch (e) { /* gate handled below */ }
    setBusy(false);
  };

  const Wrap = ({ children }) => (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8 md:py-12 max-w-[900px] mx-auto relative z-10">
        <PanelTabs active="/studio/portfolio" />
        {children}
      </div>
    </div>
  );

  if (tier === null || help === null) return <Wrap><div className="flex items-center gap-2" style={{ color: 'var(--lux-text)' }}><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div></Wrap>;

  // Two ways in: the premium plan includes it, or a one-off ₹100 unlock. Before,
  // a Free studio hit a dead end here — which is exactly the studio most likely
  // to need someone to build the portfolio for them.
  if (!help.unlocked) {
    return (
      <Wrap>
        <div className="lux-glass p-10 text-center">
          <Crown className="w-10 h-10 mx-auto mb-3" style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>We’ll build it for you</h1>
          <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
            Can’t fill in your portfolio yourself? Pay <strong style={{ color: '#E8C97A' }}>₹{help.fee_inr}</strong> once,
            share your details, and our team designs and publishes the whole thing for you.
          </p>
          {payErr && (
            <p className="mb-4 text-sm" role="alert" style={{ color: '#FFB0A0' }} data-testid="build-pay-error">{payErr}</p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={payForHelp} disabled={paying} className="lux-btn min-h-[44px] disabled:opacity-60"
              data-testid="build-pay-100">
              {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Pay ₹{help.fee_inr} & continue
            </button>
            <button onClick={() => navigate('/studio/plans')} className="lux-btn lux-btn-ghost min-h-[44px]"
              data-testid="build-get-plan">
              Included in Premium
            </button>
          </div>
        </div>
      </Wrap>
    );
  }

  if (done) {
    return (
      <Wrap>
        <div className="lux-glass p-10 text-center" data-testid="build-done">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400" />
          <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>Brief received</h1>
          <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
            Our studio team will build your premium portfolio and notify you. You can update this brief anytime.
          </p>
          <button onClick={() => navigate('/studio/portfolio')} className="lux-btn lux-btn-ghost">Back to portfolio</button>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="mb-6">
        <span className="lux-eyebrow block mb-3">◆ Premium · studio-built</span>
        <h1 className="font-display text-[2rem] md:text-[2.6rem]" style={{ color: 'var(--lux-text)' }}>
          Tell us your <span className="text-gold italic font-script">story.</span>
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>
          Share everything below — our team designs and publishes your full portfolio for you.
        </p>
      </div>
      {existing && <div className="lux-glass p-3 mb-5 text-sm" style={{ color: '#E8C97A' }}>You have a {existing.status} request. Editing will resubmit it.</div>}
      <div className="lux-glass p-6 space-y-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <span className="lux-eyebrow block mb-1.5">{f.label}</span>
            {f.textarea
              ? <textarea value={details[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} rows={3} className="lux-input w-full" data-testid={`build-${f.key}`} />
              : <input value={details[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} className="lux-input w-full" data-testid={`build-${f.key}`} />}
          </div>
        ))}
        {/* Premium-only: team members — name, what they do, and their portfolio link */}
        <div className="pt-2 border-t" style={{ borderColor: 'var(--lux-border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="lux-eyebrow flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Team members</span>
            <button type="button" onClick={addMember} className="lux-btn lux-btn-ghost text-xs" data-testid="team-add">
              <Plus className="w-3.5 h-3.5" /> Add member
            </button>
          </div>
          <p className="text-[11px] mb-3" style={{ color: 'var(--lux-text-muted)' }}>
            Add your team — their name, what they do, and their portfolio link (optional). Shown on your public portfolio.
          </p>
          {team.length === 0 && (
            <div className="text-[11px] mb-2" style={{ color: 'var(--lux-text-faint)' }}>No team members added yet.</div>
          )}
          <div className="space-y-3">
            {team.map((m, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr_auto] gap-2 items-start" data-testid={`team-row-${i}`}>
                <input value={m.name} onChange={(e) => setMember(i, 'name', e.target.value)} placeholder="Name" className="lux-input w-full" data-testid={`team-name-${i}`} />
                <input value={m.role} onChange={(e) => setMember(i, 'role', e.target.value)} placeholder="What they do (e.g. Lead Cinematographer)" className="lux-input w-full" data-testid={`team-role-${i}`} />
                <input value={m.portfolio_link} onChange={(e) => setMember(i, 'portfolio_link', e.target.value)} placeholder="Portfolio link (optional)" className="lux-input w-full" data-testid={`team-link-${i}`} />
                <button type="button" onClick={() => removeMember(i)} className="lux-btn lux-btn-ghost px-2.5" title="Remove" data-testid={`team-remove-${i}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="lux-eyebrow block mb-1.5">Anything else for our team</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="lux-input w-full" data-testid="build-notes" />
        </div>
        <button onClick={submit} disabled={busy} className="lux-btn" data-testid="build-submit">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit brief
        </button>
      </div>
    </Wrap>
  );
}

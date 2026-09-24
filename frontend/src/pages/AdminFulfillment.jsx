// AdminFulfillment — the owner's operations console for the manual invitation
// build. See INVITATION_FULFILLMENT.md. Two tabs: Requests (incoming paid orders
// + download data + deliver link + Drive folders) and Events (delivered links,
// active/expired, premium vs normal). Super-admin auth (admin_token).
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Download, Search, Loader2, Send, HardDrive, Copy, Link2, Wand2 } from 'lucide-react';
import InvitationLinksPanel from '@/components/InvitationLinksPanel';

const API = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function AdminFulfillment() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('requests');
  const [kind, setKind] = useState('all'); // all | photographer | user
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({});
  const [code, setCode] = useState('');
  const [detail, setDetail] = useState(null);
  // Result of the last "build invitation" run: {profile_id, slug, warnings[...]}.
  const [build, setBuild] = useState(null);
  const [msg, setMsg] = useState('');
  const [vLevels, setVLevels] = useState({});   // studio_id -> chosen approve level
  const [rates, setRates] = useState({});       // currency editor

  const saveRates = async () => {
    try { await axios.put(`${API}/api/admin/currency/rates`, { rates }, { headers: authHeaders() }); setMsg('Currency rates saved'); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Save failed'); }
  };
  // Fulfillment settings: the WhatsApp number couples are sent to for changes,
  // and the global "editing allowed" switch.
  const [fulfil, setFulfil] = useState({ whatsapp_number: '', edit_enabled: true });
  const saveFulfil = async () => {
    try { await axios.put(`${API}/api/admin/fulfillment/settings`, fulfil, { headers: authHeaders() }); setMsg('Fulfillment settings saved'); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Save failed'); }
  };
  const toggleEditLock = async (code, locked) => {
    try { await axios.post(`${API}/api/admin/fulfillment/requests/${code}/edit-lock`, { locked }, { headers: authHeaders() }); setMsg(locked ? 'Editing deactivated for this order' : 'Editing re-enabled'); open(code); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Action failed'); }
  };
  const [vendorAnalytics, setVendorAnalytics] = useState({});
  const vendorAction = async (id, action) => {
    if (action === 'delete' && !window.confirm('Delete this vendor + its reviews?')) return;
    try { await axios.post(`${API}/api/admin/vendors/${id}/action`, { action }, { headers: authHeaders() }); setMsg(`Vendor ${action}`); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Action failed'); }
  };
  const talentAction = async (id, action) => {
    try { await axios.post(`${API}/api/admin/talent/${id}/action`, { action }, { headers: authHeaders() }); setMsg(`Talent ${action}`); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Action failed'); }
  };
  const campaignAction = async (id, action) => {
    if (action === 'remove' && !window.confirm('Remove this campaign from the marketplace?')) return;
    try { await axios.post(`${API}/api/admin/campaigns/${id}/action`, { action }, { headers: authHeaders() }); setMsg(`Campaign ${action}`); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Action failed'); }
  };
  const verifyBrand = async (id) => {
    try { await axios.post(`${API}/api/admin/brands/${id}/verify`, {}, { headers: authHeaders() }); setMsg('Brand verification toggled'); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Action failed'); }
  };
  const deleteEvent = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try { await axios.delete(`${API}/api/admin/events/${id}`, { headers: authHeaders() }); setMsg('Event deleted'); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Action failed'); }
  };
  const setPhotoReqStatus = async (id, status) => {
    try { await axios.post(`${API}/api/admin/photo-requests/${id}/status?status=${status}`, {}, { headers: authHeaders() }); setMsg(`Marked ${status}`); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Action failed'); }
  };

  const reviewVerification = async (studioId, decision, level) => {
    try {
      await axios.post(`${API}/api/admin/pixora/verifications/${studioId}/review`,
        { decision, level: level ? Number(level) : undefined }, { headers: authHeaders() });
      setMsg(`Verification ${decision === 'approve' ? 'approved' : 'rejected'} for ${studioId}`);
      load();
    } catch (e) { setMsg(e?.response?.data?.detail || 'Review failed'); }
  };

  const resolveReport = async (reportId, action) => {
    if (action === 'delete' && !window.confirm('Delete the reported content? This cannot be undone.')) return;
    try {
      await axios.post(`${API}/api/admin/pixora/reports/${reportId}/resolve`, { action }, { headers: authHeaders() });
      setMsg(`Report ${action === 'delete' ? 'resolved (content deleted)' : action === 'warn' ? 'resolved (user warned)' : 'dismissed'}`);
      load();
    } catch (e) { setMsg(e?.response?.data?.detail || 'Could not resolve report'); }
  };

  const load = useCallback(async () => {
    setData(null);
    if (tab === 'portfolio') {
      try {
        const { data } = await axios.get(`${API}/api/admin/portfolio-build-requests`, { headers: authHeaders() });
        setData(data.requests || []);
        setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'purchases') {
      try {
        const { data } = await axios.get(`${API}/api/admin/plan-purchase-details`, { headers: authHeaders() });
        setData(data.details || []);
        setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'verify') {
      try {
        const { data } = await axios.get(`${API}/api/admin/pixora/verifications`, { headers: authHeaders() });
        setData(data.verifications || []);
        setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'reports' || tab === 'members' || tab === 'audit') {
      const url = tab === 'reports' ? '/api/admin/pixora/reports'
        : tab === 'members' ? '/api/admin/pixora/members' : '/api/admin/pixora/audit-log';
      try {
        const { data } = await axios.get(`${API}${url}`, { headers: authHeaders() });
        setData(data.reports || data.members || data.log || []);
        setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'analytics') {
      try {
        const { data } = await axios.get(`${API}/api/admin/analytics/overview`, { headers: authHeaders() });
        setData([data]); setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'talent') {
      try { const { data } = await axios.get(`${API}/api/admin/talent`, { headers: authHeaders() }); setData(data.talent || []); setCounts({}); }
      catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'campaigns') {
      try { const { data } = await axios.get(`${API}/api/admin/campaigns`, { headers: authHeaders() }); setData([data]); setCounts({}); }
      catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'photos') {
      try { const { data } = await axios.get(`${API}/api/admin/photo-requests/all`, { headers: authHeaders() }); setData(data.requests || []); setCounts({ pending: data.pending }); }
      catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'global') {
      try { const { data } = await axios.get(`${API}/api/admin/analytics/global`, { headers: authHeaders() }); setData([data]); setCounts({}); }
      catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'gevents') {
      try { const { data } = await axios.get(`${API}/api/admin/events`, { headers: authHeaders() }); setData(data.events || []); setVendorAnalytics({ by_country: data.by_country || [] }); setCounts({}); }
      catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'industry') {
      try {
        const { data } = await axios.get(`${API}/api/admin/industry-analytics`, { headers: authHeaders() });
        setData([data]); setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    // 'links' is rendered by <InvitationLinksPanel/>, which fetches its own
    // data — nothing to load into this page's shared state.
    if (tab === 'links') { setData([]); setCounts({}); return; }
    if (tab === 'weddings') {
      try {
        const [ws, an] = await Promise.all([
          axios.get(`${API}/api/admin/workspaces`, { headers: authHeaders() }),
          axios.get(`${API}/api/admin/workspaces/analytics`, { headers: authHeaders() }).catch(() => ({ data: {} })),
        ]);
        setData(ws.data.workspaces || []); setVendorAnalytics(an.data || {}); setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'vendors') {
      try {
        const [vs, an] = await Promise.all([
          axios.get(`${API}/api/admin/vendors`, { headers: authHeaders() }),
          axios.get(`${API}/api/admin/vendors/analytics`, { headers: authHeaders() }).catch(() => ({ data: {} })),
        ]);
        setData(vs.data.vendors || []); setVendorAnalytics(an.data || {}); setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    if (tab === 'settings') {
      try {
        const [cr, ps, fs] = await Promise.all([
          axios.get(`${API}/api/admin/currency/rates`, { headers: authHeaders() }),
          axios.get(`${API}/api/admin/push/stats`, { headers: authHeaders() }).catch(() => ({ data: {} })),
          axios.get(`${API}/api/admin/fulfillment/settings`, { headers: authHeaders() }).catch(() => ({ data: {} })),
        ]);
        setRates(cr.data.rates || {});
        setFulfil({ whatsapp_number: fs.data.whatsapp_number || '', edit_enabled: fs.data.edit_enabled !== false });
        setData([{ currency: cr.data, push: ps.data }]); setCounts({});
      } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
      return;
    }
    const kq = kind === 'all' ? '' : `?buyer_kind=${kind}`;
    const url = tab === 'events' ? `/api/admin/fulfillment/events${kq}` : `/api/admin/fulfillment/requests${kq}`;
    try {
      const { data } = await axios.get(`${API}${url}`, { headers: authHeaders() });
      setData(tab === 'events' ? (data.events || []) : (data.requests || []));
      setCounts(data.counts || {});
    } catch (e) { setMsg(e?.response?.data?.detail || 'Load failed'); setData([]); }
  }, [tab, kind]);
  useEffect(() => { load(); }, [load]);

  const open = async (c) => {
    setDetail('loading');
    try { const { data } = await axios.get(`${API}/api/admin/fulfillment/requests/${c}`, { headers: authHeaders() }); setDetail(data.request); }
    catch (e) { setMsg('Could not load request'); setDetail(null); }
  };
  const download = (req) => {
    const blob = new Blob([JSON.stringify(req, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${req.code}.json`; a.click();
  };
  const deliver = async (c, url, profileId) => {
    if (!url) { setMsg('Enter the live URL'); return; }
    await axios.post(`${API}/api/admin/fulfillment/requests/${c}/deliver`, { live_url: url, profile_id: profileId || undefined }, { headers: authHeaders() });
    setMsg(`Delivered ${c}`); open(c); load();
  };
  const saveDrive = async (c, qr, selfies) => {
    await axios.post(`${API}/api/admin/fulfillment/requests/${c}/drive`, { drive_folder_qr: qr, drive_folder_selfies: selfies }, { headers: authHeaders() });
    setMsg('Drive folders saved'); open(c);
  };
  // Build the invitation FROM the filled details — no re-typing. Returns a DRAFT
  // (previewable, not delivered) plus the list of things that still need a human.
  const buildInvitation = async (c, rebuild = false) => {
    setBuild({ loading: true });
    try {
      const { data } = await axios.post(`${API}/api/admin/fulfillment/requests/${c}/build-invitation`,
        { rebuild }, { headers: authHeaders() });
      setBuild(data);
      setMsg(data.message || 'Invitation draft ready');
      open(c); load();
    } catch (e) {
      setBuild(null);
      setMsg(e?.response?.data?.detail || 'Could not build the invitation');
    }
  };

  return (
    <div className="min-h-screen text-yellow-50" style={{ background: 'radial-gradient(circle at top, #1a0f0a 0%, #0a0606 60%, #000 100%)' }} data-testid="admin-fulfillment">
      <header className="sticky top-0 z-30 backdrop-blur border-b border-yellow-200/15" style={{ background: 'rgba(10,6,6,0.85)' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/super-admin/dashboard')} className="text-yellow-200/70 hover:text-yellow-200 flex items-center gap-1 text-sm"><ChevronLeft className="w-4 h-4" /> Dashboard</button>
          <h1 className="text-xl md:text-2xl font-serif text-yellow-200">Invitation Fulfillment</h1>
        </div>
        <div className="max-w-6xl mx-auto px-6 pb-3 flex flex-wrap gap-2">
          {['requests', 'links', 'photos', 'events', 'portfolio', 'purchases', 'verify', 'reports', 'members', 'audit', 'analytics', 'global', 'vendors', 'campaigns', 'gevents', 'weddings', 'industry', 'talent', 'settings'].map((t) => (
            <button key={t} onClick={() => { setTab(t); setDetail(null); }} className={`px-4 py-1.5 rounded text-sm capitalize ${tab === t ? 'bg-yellow-300 text-black' : 'bg-black/40 text-yellow-200 border border-yellow-200/20'}`} data-testid={`fulfil-tab-${t}`}>{t}</button>
          ))}
          <span className="w-px bg-yellow-200/20 mx-1" />
          {[['all', 'All'], ['photographer', 'Premium (photographers)'], ['user', 'Normal users']].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={`px-3 py-1.5 rounded text-xs ${kind === k ? 'bg-yellow-300 text-black' : 'bg-black/40 text-yellow-200 border border-yellow-200/20'}`} data-testid={`fulfil-kind-${k}`}>{l}</button>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {msg && <div className="mb-4 px-3 py-2 rounded bg-emerald-800/40 text-emerald-200 text-sm" data-testid="fulfil-msg">{msg}</div>}

        {/* lookup by code */}
        <div className="flex items-center gap-2 mb-5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-yellow-200/50" />
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter code e.g. MAJA-AB12CD" className="bg-black/40 border border-yellow-200/20 rounded pl-9 pr-3 py-2 text-yellow-50 w-64" data-testid="fulfil-code-input" />
          </div>
          <button onClick={() => open(code)} className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium" data-testid="fulfil-lookup">Look up</button>
          {tab === 'requests' && counts.total != null && <span className="text-xs text-yellow-200/60 ml-2">Total {counts.total} · Premium {counts.premium} · Normal {counts.normal} · Delivered {counts.delivered}</span>}
        </div>

        {data === null ? <div className="flex items-center gap-2 text-yellow-200/70"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div> : tab === 'photos' ? (
          <div className="space-y-3" data-testid="admin-photo-requests">
            <div className="text-xs text-yellow-200/60">Guest photo requests — {data.length} total{counts.pending != null ? ` · ${counts.pending} pending` : ''}. Sort and share their photos over email / WhatsApp, then mark them shared.</div>
            {data.length === 0 ? <div className="text-yellow-200/50">No photo requests yet.</div> : (
              <div className="grid md:grid-cols-2 gap-3">
                {data.map((r) => (
                  <div key={r.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-3 flex gap-3" data-testid={`photo-req-${r.id}`}>
                    {r.selfie_url ? <img src={r.selfie_url} alt="selfie" className="w-16 h-16 rounded-lg object-cover shrink-0" /> : <div className="w-16 h-16 rounded-lg bg-black/40 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-serif text-yellow-200 truncate">{r.name || 'Guest'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: r.status === 'pending' ? 'rgba(234,179,8,0.2)' : r.status === 'shared' ? 'rgba(16,185,129,0.2)' : 'rgba(120,120,120,0.2)' }}>{r.status}</span>
                      </div>
                      <div className="text-[11px] text-yellow-200/70 truncate">✉ {r.email}</div>
                      <div className="text-[11px] text-yellow-200/70">✆ {r.whatsapp}</div>
                      <div className="text-[10px] text-yellow-200/40 truncate">/{r.slug} · {(r.created_at || '').slice(0, 10)}</div>
                      <div className="flex gap-1.5 mt-1.5">
                        {r.selfie_url && <a href={r.selfie_url} target="_blank" rel="noreferrer" className="rounded px-2 py-0.5 text-[11px] bg-black/40 border border-yellow-200/20 text-yellow-100">selfie</a>}
                        <a href={`https://wa.me/${(r.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="rounded px-2 py-0.5 text-[11px] bg-emerald-500/20 border border-emerald-300/30 text-emerald-100">WhatsApp</a>
                        {r.status !== 'shared' && <button onClick={() => setPhotoReqStatus(r.id, 'shared')} className="rounded px-2 py-0.5 text-[11px] bg-emerald-400/80 text-black" data-testid={`photo-shared-${r.id}`}>mark shared</button>}
                        {r.status !== 'closed' && <button onClick={() => setPhotoReqStatus(r.id, 'closed')} className="rounded px-2 py-0.5 text-[11px] bg-black/40 border border-yellow-200/20 text-yellow-100">close</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'campaigns' ? (
          (() => {
            const d = data[0] || {}; const t = d.totals || {};
            return (
              <div className="space-y-4" data-testid="admin-campaigns">
                <div className="grid grid-cols-3 gap-3">
                  {[['Campaigns', t.campaigns], ['Open', t.open], ['Brands', t.brands]].map(([l, v]) => (
                    <div key={l} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4 text-center"><div className="font-serif text-2xl text-yellow-200">{v ?? 0}</div><div className="text-[10px] uppercase tracking-wide text-yellow-200/50">{l}</div></div>
                  ))}
                </div>
                <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                  <div className="text-yellow-200/70 text-sm mb-2">Brands</div>
                  {(d.brands || []).length === 0 ? <div className="text-yellow-200/40 text-xs">No brands yet.</div> : (d.brands || []).map((b) => (
                    <div key={b.id} className="flex items-center justify-between py-1.5 flex-wrap gap-2">
                      <span className="text-sm text-yellow-100">{b.name}{b.verified ? ' ✓' : ''} <span className="text-[11px] text-yellow-200/50">· {b.campaigns} campaigns · {b.country || '—'}</span></span>
                      <button onClick={() => verifyBrand(b.id)} className="rounded px-2.5 py-1 text-[11px] bg-black/40 border border-yellow-200/20 text-yellow-100" data-testid={`brand-verify-${b.id}`}>{b.verified ? 'unverify' : 'verify'}</button>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                  <div className="text-yellow-200/70 text-sm mb-2">Campaigns</div>
                  {(d.campaigns || []).length === 0 ? <div className="text-yellow-200/40 text-xs">No campaigns yet.</div> : (d.campaigns || []).map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5 flex-wrap gap-2" data-testid={`admin-campaign-${c.id}`}>
                      <span className="text-sm text-yellow-100">{c.featured ? '★ ' : ''}{c.title} <span className="text-[11px] text-yellow-200/50">· {c.brand_name} · {c.status} · {c.applicant_count} applied</span></span>
                      <div className="flex flex-wrap gap-1.5">
                        {[c.featured ? 'unfeature' : 'feature', c.status === 'removed' ? 'reopen' : 'remove'].map((a) => (
                          <button key={a} onClick={() => campaignAction(c.id, a)} className={`rounded px-2.5 py-1 text-[11px] ${a === 'remove' ? 'bg-red-500/70 text-white' : 'bg-black/40 border border-yellow-200/20 text-yellow-100'}`} data-testid={`campaign-${a}-${c.id}`}>{a}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
        ) : tab === 'gevents' ? (
          <div className="space-y-3" data-testid="admin-gevents">
            <div className="text-xs text-yellow-200/60">By country: {(vendorAnalytics.by_country || []).map((c) => `${c.country} (${c.count})`).join(' · ') || '—'}</div>
            {data.length === 0 ? <div className="text-yellow-200/50">No events yet.</div> : (
              <div className="grid md:grid-cols-2 gap-3">
                {data.map((ev) => (
                  <div key={ev.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4" data-testid={`admin-event-${ev.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-serif text-yellow-200">{ev.title}</span>
                      <button onClick={() => deleteEvent(ev.id)} className="rounded px-2.5 py-1 text-[11px] bg-red-500/70 text-white" data-testid={`event-delete-${ev.id}`}>delete</button>
                    </div>
                    <div className="text-[11px] text-yellow-200/50 mt-1">{ev.kind}{ev.is_virtual ? ' · virtual' : ''} · {[ev.city, ev.country].filter(Boolean).join(', ') || ev.location || '—'} · {ev.date || 'no date'} · by {ev.host} · {ev.rsvp_count} RSVP</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'global' ? (
          (() => {
            const g = data[0] || {}; const geo = g.geography || {}; const gr = g.growth || {}; const en = g.engagement || {}; const rev = g.revenue || {}; const cr = g.creators || {};
            const Bars = ({ title, rows, kv }) => (
              <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                <div className="text-yellow-200/70 text-sm mb-2">{title}</div>
                {(rows || []).length === 0 ? <div className="text-yellow-200/40 text-xs">No data yet.</div> : (rows || []).slice(0, 12).map((r, i) => (
                  <div key={i} className="flex justify-between text-xs py-0.5"><span className="text-yellow-200/70">{r[kv[0]]}</span><span className="text-yellow-200">{r[kv[1]]}</span></div>
                ))}
              </div>
            );
            return (
              <div className="space-y-4" data-testid="admin-global">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[['Creators', cr.total], ['Verified', cr.verified], ['Brands', cr.brands], ['Campaigns', cr.campaigns], ['Countries active', geo.countries_active], ['Posts', en.posts], ['Avg likes/post', en.avg_likes_per_post], ['Payouts (₹)', `₹${Number(rev.campaign_payouts_inr || 0).toLocaleString('en-IN')}`]].map(([l, v]) => (
                    <div key={l} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4 text-center"><div className="font-serif text-xl text-yellow-200">{v ?? 0}</div><div className="text-[10px] uppercase tracking-wide text-yellow-200/50">{l}</div></div>
                  ))}
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <Bars title="Creators by country" rows={geo.by_country} kv={['country', 'creators']} />
                  <Bars title="Creators by state" rows={geo.by_state} kv={['state', 'creators']} />
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <Bars title="Revenue by currency" rows={rev.by_currency} kv={['currency', 'amount']} />
                  <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                    <div className="text-yellow-200/70 text-sm mb-2">Top creators (followers)</div>
                    {(cr.top || []).length === 0 ? <div className="text-yellow-200/40 text-xs">No data yet.</div> : (cr.top || []).map((c) => (
                      <div key={c.studio_id} className="flex justify-between text-xs py-0.5"><span className="text-yellow-200/70">{c.name}</span><span className="text-yellow-200">{c.followers}</span></div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                  <div className="text-yellow-200/70 text-sm mb-2">Growth — last 30 days</div>
                  <div className="text-xs text-yellow-200/60">New studios: {(gr.studios_daily || []).reduce((s, r) => s + r.count, 0)} · posts: {(gr.posts_daily || []).reduce((s, r) => s + r.count, 0)} · tracked events: {(gr.events_daily || []).reduce((s, r) => s + r.count, 0)}</div>
                </div>
              </div>
            );
          })()
        ) : tab === 'talent' ? (
          <div className="grid md:grid-cols-2 gap-3" data-testid="admin-talent">
            {data.length === 0 ? <div className="text-yellow-200/50">No talent applications.</div> : data.map((t) => (
              <div key={t.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4" data-testid={`admin-talent-${t.id}`}>
                <div className="flex items-center justify-between">
                  <span className="font-serif text-yellow-200">{t.name}{t.featured ? ' ★' : ''}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-300/20 text-yellow-200">{t.status}</span>
                </div>
                <div className="text-[11px] text-yellow-200/60 mt-1">{t.headline}</div>
                {(t.specialties || []).length > 0 && <div className="text-[10px] text-yellow-200/40 mt-0.5">{t.specialties.join(', ')}</div>}
                {t.showreel_url && <a href={t.showreel_url} target="_blank" rel="noreferrer" className="text-[11px] text-yellow-300 underline">Showreel</a>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['approve', 'reject', t.featured ? 'unfeature' : 'feature', 'delete'].map((a) => (
                    <button key={a} onClick={() => talentAction(t.id, a)} className={`rounded px-2.5 py-1 text-[11px] ${a === 'delete' ? 'bg-red-500/70 text-white' : a === 'approve' ? 'bg-emerald-400/80 text-black' : 'bg-black/40 border border-yellow-200/20 text-yellow-100'}`} data-testid={`talent-${a}-${t.id}`}>{a}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'industry' ? (
          (() => {
            const a = data[0] || {};
            const List = ({ title, rows }) => (
              <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                <div className="text-yellow-200/70 text-sm mb-2">{title}</div>
                {(rows || []).length === 0 ? <div className="text-yellow-200/40 text-xs">No data yet.</div> : (rows || []).map((r) => (
                  <div key={r.k} className="flex justify-between text-xs py-0.5"><span className="text-yellow-200/70">{r.k}</span><span className="text-yellow-200">{r.v}</span></div>
                ))}
              </div>
            );
            return (
              <div className="space-y-4" data-testid="admin-industry">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[['Workspaces', a.workspaces], ['Vendors', a.vendors], ['Bookings', a.bookings], ['Revenue (confirmed)', `₹${Number(a.revenue || 0).toLocaleString('en-IN')}`]].map(([l, v]) => (
                    <div key={l} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4 text-center"><div className="font-serif text-2xl text-yellow-200">{v ?? 0}</div><div className="text-[10px] uppercase tracking-wide text-yellow-200/50">{l}</div></div>
                  ))}
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <List title="Bookings by category" rows={a.by_category} />
                  <List title="Bookings by region" rows={a.by_region} />
                </div>
                <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                  <div className="text-yellow-200/70 text-sm mb-2">Booking status</div>
                  {Object.entries(a.by_status || {}).map(([k, v]) => <div key={k} className="flex justify-between text-xs py-0.5"><span className="text-yellow-200/70">{k}</span><span className="text-yellow-200">{v}</span></div>)}
                </div>
              </div>
            );
          })()
        ) : tab === 'links' ? (
          <InvitationLinksPanel />
        ) : tab === 'weddings' ? (
          <div className="space-y-3" data-testid="admin-weddings">
            <div className="text-xs text-yellow-200/60">Workspaces {vendorAnalytics.workspaces ?? 0} · bookings {vendorAnalytics.bookings ?? 0} · disputed {vendorAnalytics.disputed ?? 0} · statuses {JSON.stringify(vendorAnalytics.by_status || {})}</div>
            {data.length === 0 ? <div className="text-yellow-200/50">No workspaces yet.</div> : (
              <div className="grid md:grid-cols-2 gap-3">
                {data.map((w) => (
                  <div key={w.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4" data-testid={`admin-ws-${w.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-yellow-200">{w.wedding_name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-300/20 text-yellow-200">{w.status}</span>
                    </div>
                    <div className="text-[11px] text-yellow-200/50 mt-1">by {w.owner_name} · {[w.bride_name, w.groom_name].filter(Boolean).join(' & ')} · {w.bookings} bookings{w.wedding_date ? ` · ${w.wedding_date}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'vendors' ? (
          <div className="space-y-3" data-testid="admin-vendors">
            <div className="text-xs text-yellow-200/60">Total {vendorAnalytics.total_vendors ?? 0} · reviews {vendorAnalytics.reviews_total ?? 0} (verified {vendorAnalytics.verified_reviews ?? 0}) · statuses {JSON.stringify(vendorAnalytics.by_status || {})}</div>
            {data.length === 0 ? <div className="text-yellow-200/50">No vendors yet.</div> : (
              <div className="grid md:grid-cols-2 gap-3">
                {data.map((v) => (
                  <div key={v.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4" data-testid={`admin-vendor-${v.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-yellow-200">{v.business_name}{v.featured ? ' ★' : ''}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-300/20 text-yellow-200">{v.status}{v.hidden ? ' · hidden' : ''}</span>
                    </div>
                    <div className="text-[11px] text-yellow-200/50 mt-1">{v.category} · {[v.city, v.state, v.country].filter(Boolean).join(', ')} · ★{v.rating ?? '—'} ({v.review_count ?? 0}) · score {v.community_score ?? 0}</div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {['approve', 'reject', 'suspend', 'verify', v.featured ? 'unfeature' : 'feature', v.hidden ? 'unhide' : 'hide', 'delete'].map((a) => (
                        <button key={a} onClick={() => vendorAction(v.id, a)} className={`rounded px-2.5 py-1 text-[11px] ${a === 'delete' ? 'bg-red-500/70 text-white' : a === 'approve' ? 'bg-emerald-400/80 text-black' : 'bg-black/40 border border-yellow-200/20 text-yellow-100'}`} data-testid={`vendor-${a}-${v.id}`}>{a}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'settings' ? (
          (() => {
            const conf = data[0] || {}; const cc = conf.currency || {}; const push = conf.push || {};
            return (
              <div className="space-y-5" data-testid="admin-settings">
                <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                  <div className="text-yellow-200/80 text-sm mb-3">Currency rates (1 INR = …)</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {(cc.currencies || ['INR', 'USD', 'EUR', 'GBP', 'AED']).map((c) => (
                      <label key={c} className="text-xs text-yellow-200/70">{c}
                        <input type="number" step="0.0001" value={rates[c] ?? ''} disabled={c === 'INR'}
                          onChange={(e) => setRates((r) => ({ ...r, [c]: e.target.value }))}
                          className="w-full mt-1 bg-black/40 border border-yellow-200/20 rounded px-2 py-1 text-yellow-50" data-testid={`rate-${c}`} />
                      </label>
                    ))}
                  </div>
                  <button onClick={saveRates} className="mt-3 bg-yellow-300 text-black rounded px-4 py-1.5 text-sm font-medium" data-testid="rates-save">Save rates</button>
                </div>
                <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                  <div className="text-yellow-200/80 text-sm mb-3">Invitation editing &amp; support</div>
                  <label className="text-xs text-yellow-200/70 block mb-3">
                    WhatsApp number for change requests
                    <input value={fulfil.whatsapp_number}
                      onChange={(e) => setFulfil((f) => ({ ...f, whatsapp_number: e.target.value }))}
                      placeholder="919876543210 (country code, digits only)"
                      className="w-full mt-1 bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50"
                      data-testid="fulfil-whatsapp" />
                    <span className="block mt-1 text-[11px] text-yellow-200/40">
                      Couples whose 24-hour edit window has closed are sent straight to this number.
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-yellow-200/70">
                    <input type="checkbox" checked={fulfil.edit_enabled}
                      onChange={(e) => setFulfil((f) => ({ ...f, edit_enabled: e.target.checked }))}
                      data-testid="fulfil-edit-enabled" />
                    Allow couples to edit their details (uncheck to deactivate editing everywhere)
                  </label>
                  <button onClick={saveFulfil} className="mt-3 bg-yellow-300 text-black rounded px-4 py-1.5 text-sm font-medium" data-testid="fulfil-settings-save">Save</button>
                </div>
                <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                  <div className="text-yellow-200/80 text-sm mb-2">Push notifications</div>
                  <div className="text-xs text-yellow-200/70">Registered devices: <b>{push.tokens ?? 0}</b> · pending outbox: <b>{push.outbox_pending ?? 0}</b></div>
                  <div className="text-[11px] text-yellow-200/40 mt-1">Real delivery activates once FCM_SERVER_KEY / APNs creds are set (see external checklist). Until then, intents queue in push_outbox.</div>
                </div>
              </div>
            );
          })()
        ) : tab === 'analytics' ? (
          (() => {
            const a = data[0] || {};
            return (
              <div className="space-y-4" data-testid="admin-analytics">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[['Studios', a.studios], ['Published portfolios', a.portfolios_published], ['Verified', a.verified], ['Posts', a.posts], ['Connections', a.connections], ['CRM clients', a.crm_clients], ['Tracked events', a.total_events]].map(([l, v]) => (
                    <div key={l} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4 text-center">
                      <div className="font-serif text-2xl text-yellow-200">{v ?? 0}</div>
                      <div className="text-[10px] uppercase tracking-wide text-yellow-200/50">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-yellow-200/15 bg-black/20 p-4">
                  <div className="text-yellow-200/70 text-sm mb-2">Events by type</div>
                  {(a.by_type || []).length === 0 ? <div className="text-yellow-200/40 text-xs">No tracked events yet.</div> : (a.by_type || []).map((t) => (
                    <div key={t.type} className="flex justify-between text-xs py-0.5"><span className="text-yellow-200/70">{t.type}</span><span className="text-yellow-200">{t.count}</span></div>
                  ))}
                </div>
              </div>
            );
          })()
        ) : tab === 'reports' ? (
          <div className="grid md:grid-cols-2 gap-3">
            {data.length === 0 ? <div className="text-yellow-200/50">No open reports. 🎉</div> : data.map((r) => (
              <div key={r.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4" data-testid={`report-${r.id}`}>
                <div className="flex items-center justify-between">
                  <span className="font-serif text-yellow-200 capitalize">{r.target_type} · {r.reason}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-300/20 text-red-200">{r.status}</span>
                </div>
                <div className="text-[10px] text-yellow-200/50 mt-1">by {r.reporter_name || r.reporter}{r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString('en-IN')}` : ''}{r.owner_name ? ` · owner: ${r.owner_name}` : ''}</div>
                <div className="text-xs mt-2 p-2 rounded bg-black/40 text-yellow-50/90">“{r.target_preview}”</div>
                {r.note && <div className="text-xs mt-1 text-yellow-200/70">Note: {r.note}</div>}
                {r.status === 'open' && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => resolveReport(r.id, 'dismiss')} className="bg-black/40 border border-yellow-200/20 rounded px-3 py-1 text-xs" data-testid={`report-dismiss-${r.id}`}>Dismiss</button>
                    <button onClick={() => resolveReport(r.id, 'warn')} className="bg-amber-400/80 text-black rounded px-3 py-1 text-xs" data-testid={`report-warn-${r.id}`}>Warn</button>
                    <button onClick={() => resolveReport(r.id, 'delete')} className="bg-red-500/80 text-white rounded px-3 py-1 text-xs" data-testid={`report-delete-${r.id}`}>Delete content</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : tab === 'members' ? (
          <div className="grid md:grid-cols-3 gap-3">
            {data.length === 0 ? <div className="text-yellow-200/50">No community members yet.</div> : data.map((m) => (
              <div key={m.studio_id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-3" data-testid={`member-${m.studio_id}`}>
                <div className="font-serif text-yellow-200 text-sm truncate">{m.name}{m.verified_level > 0 ? ' ✓' : ''}</div>
                <div className="text-[11px] text-yellow-200/60 mt-1">{m.posts} posts · {m.followers} followers{m.verified_level ? ` · L${m.verified_level}` : ''}</div>
                <div className="text-[9px] text-yellow-200/40 mt-0.5">{m.studio_id}</div>
              </div>
            ))}
          </div>
        ) : tab === 'audit' ? (
          <div className="space-y-1.5">
            {data.length === 0 ? <div className="text-yellow-200/50">No admin actions logged yet.</div> : data.map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-xs rounded border border-yellow-200/10 bg-black/20 px-3 py-2" data-testid={`audit-${l.id}`}>
                <span className="text-yellow-300 font-mono">{l.action}</span>
                <span className="text-yellow-200/60">{l.target_type || ''} {l.target_id || ''}</span>
                <span className="ml-auto text-yellow-200/40">{l.actor} · {l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : ''}</span>
              </div>
            ))}
          </div>
        ) : tab === 'verify' ? (
          <div className="grid md:grid-cols-2 gap-3">
            {data.length === 0 ? <div className="text-yellow-200/50">No verification applications.</div> : data.map((v) => {
              const LEVELS = { 1: 'Verified Photographer', 2: 'Verified Studio', 3: 'Premium Studio', 4: 'Elite Pixora Professional' };
              const chosen = vLevels[v.studio_id] ?? v.requested_level ?? 1;
              return (
                <div key={v.studio_id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4" data-testid={`verify-${v.studio_id}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-yellow-200">{v.studio_name || 'Studio'}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-300/20 text-yellow-200">{v.status}</span>
                  </div>
                  <div className="text-[10px] text-yellow-200/50 mt-1">studio {v.studio_id} · requested L{v.requested_level} ({LEVELS[v.requested_level]})</div>
                  <div className="text-xs mt-2 space-y-0.5 text-yellow-50/90">
                    {v.website && <div><b>Website:</b> {v.website}</div>}
                    {v.instagram && <div><b>Instagram:</b> {v.instagram}</div>}
                    {v.portfolio_link && <div><b>Portfolio:</b> {v.portfolio_link}</div>}
                    {v.phone && <div><b>Phone:</b> {v.phone}</div>}
                    {v.email && <div><b>Email:</b> {v.email}</div>}
                    {v.note && <div><b>Note:</b> {v.note}</div>}
                    <div className="flex gap-3 mt-1">
                      {v.gov_id_url && <a href={v.gov_id_url} target="_blank" rel="noreferrer" className="text-yellow-300 underline">Gov ID</a>}
                      {v.business_proof_url && <a href={v.business_proof_url} target="_blank" rel="noreferrer" className="text-yellow-300 underline">Business proof</a>}
                    </div>
                  </div>
                  {v.status !== 'approved' && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <select value={chosen} onChange={(e) => setVLevels((s) => ({ ...s, [v.studio_id]: e.target.value }))}
                        className="bg-black/40 border border-yellow-200/20 rounded px-2 py-1 text-xs text-yellow-50" data-testid={`verify-level-${v.studio_id}`}>
                        {[1, 2, 3, 4].map((l) => <option key={l} value={l}>L{l} · {LEVELS[l]}</option>)}
                      </select>
                      <button onClick={() => reviewVerification(v.studio_id, 'approve', chosen)} className="bg-emerald-400 text-black rounded px-3 py-1 text-xs font-medium" data-testid={`verify-approve-${v.studio_id}`}>Approve</button>
                      <button onClick={() => reviewVerification(v.studio_id, 'reject')} className="bg-black/40 border border-yellow-200/20 rounded px-3 py-1 text-xs" data-testid={`verify-reject-${v.studio_id}`}>Reject</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : tab === 'purchases' ? (
          <div className="grid md:grid-cols-2 gap-3">
            {data.length === 0 ? <div className="text-yellow-200/50">No plan purchases yet.</div> : data.map((r) => (
              <div key={r.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4" data-testid={`purchase-${r.id}`}>
                <div className="flex items-center justify-between">
                  <span className="font-serif text-yellow-200">{r.studio_name || 'Studio'}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-300/20 text-emerald-200 capitalize">{r.product} · {r.tier || '—'}</span>
                </div>
                <div className="text-[10px] text-yellow-200/50 mt-1">
                  {r.cycle || ''}{r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString('en-IN')}` : ''} · studio {r.studio_id}
                </div>
                {r.details && (
                  <div className="text-xs mt-2 space-y-0.5 text-yellow-50/90">
                    {r.details.full_name && <div><b>Name:</b> {r.details.full_name}</div>}
                    {r.details.phone && <div><b>Phone:</b> {r.details.phone}</div>}
                    {r.details.email && <div><b>Email:</b> {r.details.email}</div>}
                    {r.details.studio_name && <div><b>Studio:</b> {r.details.studio_name}</div>}
                    {r.details.city && <div><b>City:</b> {r.details.city}</div>}
                    {r.details.requirements && <div className="mt-1"><b>Requirements:</b> {r.details.requirements}</div>}
                  </div>
                )}
                <button
                  onClick={() => { const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `purchase-${r.id}.json`; a.click(); }}
                  className="mt-3 bg-black/40 border border-yellow-200/20 rounded px-3 py-1.5 text-xs inline-flex items-center gap-1" data-testid={`purchase-download-${r.id}`}>
                  <Download className="w-3.5 h-3.5" /> Download details
                </button>
              </div>
            ))}
          </div>
        ) : tab === 'portfolio' ? (
          <div className="grid md:grid-cols-2 gap-3">
            {data.length === 0 ? <div className="text-yellow-200/50">No portfolio build requests.</div> : data.map((r) => (
              <div key={r.id} className="rounded-lg border border-yellow-200/15 bg-black/20 p-4" data-testid={`portfolio-req-${r.id}`}>
                <div className="flex items-center justify-between">
                  <span className="font-serif text-yellow-200">{r.studio_name || 'Studio'}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-300/20 text-yellow-200">{r.status || 'pending'}</span>
                </div>
                <div className="text-[10px] text-yellow-200/50 mt-1">ID {r.id} · studio {r.studio_id}{r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString('en-IN')}` : ''}</div>
                {r.notes && <div className="text-xs mt-2 text-yellow-50/90">{r.notes}</div>}
                {r.details && <pre className="text-[10px] bg-black/40 rounded p-2 mt-2 max-h-40 overflow-auto">{JSON.stringify(r.details, null, 2)}</pre>}
                <button
                  onClick={() => { const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `portfolio-${r.id}.json`; a.click(); }}
                  className="mt-3 bg-black/40 border border-yellow-200/20 rounded px-3 py-1.5 text-xs inline-flex items-center gap-1" data-testid={`portfolio-download-${r.id}`}>
                  <Download className="w-3.5 h-3.5" /> Download details
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {data.length === 0 ? <div className="text-yellow-200/50">Nothing here.</div> : data.map((c) => (
              <button key={c.order_id} onClick={() => open(c.code)} className="text-left rounded-lg border border-yellow-200/15 bg-black/20 p-4 hover:border-yellow-300/40" data-testid={`fulfil-card-${c.code}`}>
                <div className="flex items-center justify-between">
                  <span className="font-serif text-yellow-200">{c.code}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.buyer_kind === 'photographer' ? 'bg-yellow-300/20 text-yellow-200' : 'bg-white/10 text-white/70'}`}>{c.buyer_kind === 'photographer' ? 'Premium' : 'Normal'}</span>
                </div>
                <div className="text-sm mt-1">{c.buyer?.name || '—'} · {c.design_id}</div>
                <div className="text-xs text-yellow-200/60 mt-1 flex flex-wrap gap-2">
                  <span>{c.package_label} · {inr(c.amount_inr)}</span>
                  <span className="px-1.5 rounded" style={{ background: c.build_status === 'delivered' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)' }}>{c.build_status}</span>
                  {tab === 'events' && <span className="px-1.5 rounded" style={{ background: c.event_status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)' }}>{c.event_status}</span>}
                </div>
              </button>
            ))}
          </div>
        )}

        {detail && detail !== 'loading' && <DetailPanel req={detail} onClose={() => setDetail(null)} onDownload={download} onDeliver={deliver} onSaveDrive={saveDrive} onToggleEditLock={toggleEditLock}
          onBuild={buildInvitation} build={build} />}
        {detail === 'loading' && <div className="mt-4 text-yellow-200/70">Loading request…</div>}
      </div>
    </div>
  );
}

function DetailPanel({ req, onClose, onDownload, onDeliver, onSaveDrive, onToggleEditLock, onBuild, build: buildResult }) {
  const [liveUrl, setLiveUrl] = useState(req.live_url || '');
  const [profileId, setProfileId] = useState(req.profile_id || '');
  const [qr, setQr] = useState(req.drive_folder_qr || '');
  const [selfies, setSelfies] = useState(req.drive_folder_selfies || '');
  const sf = req.suggested_folders || {};   // auto-derived from the order's add-ons
  const copy = (t) => navigator.clipboard?.writeText(t);
  return (
    <div className="mt-6 rounded-xl border border-yellow-300/30 bg-black/40 p-5" data-testid="fulfil-detail">
      <div className="flex items-center justify-between mb-3">
        <div className="font-serif text-xl text-yellow-200 flex items-center gap-2">{req.code}
          <button onClick={() => copy(req.code)} className="text-yellow-200/60"><Copy className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onDownload(req)} className="bg-black/40 border border-yellow-200/20 rounded px-3 py-1.5 text-xs flex items-center gap-1" data-testid="fulfil-download"><Download className="w-3.5 h-3.5" /> Download data</button>
          <button onClick={onClose} className="text-yellow-200/60 text-sm">Close</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Buyer ({req.buyer_kind === 'photographer' ? 'premium' : 'normal'})</div>
          <div>{req.buyer?.name || '—'}</div>
          <div className="text-yellow-200/60 text-xs">{req.buyer?.email} · {req.buyer?.phone}</div>
          {/* Premium photographer's portfolio — travels with the request so the
              owner can open the studio's public portfolio in one click. */}
          {req.studio_portfolio && (
            <div className="mt-2 text-xs" data-testid="fulfil-studio-portfolio">
              <span className="text-white/50">Studio portfolio: </span>
              <a href={req.studio_portfolio.portfolio_url} target="_blank" rel="noreferrer"
                className="text-yellow-200 underline break-all">
                {req.studio_portfolio.studio_name || 'View portfolio'}
              </a>
              {!req.studio_portfolio.published && <span className="text-white/40"> (not yet published)</span>}
            </div>
          )}
          <div className="mt-2 text-[10px] uppercase tracking-wider text-white/50 mb-1">Order</div>
          <div className="text-xs">Design <b>{req.design_id}</b> · {req.theme_id} · {req.event_type}</div>
          <div className="text-xs">{req.package_label} · {inr(req.amount_inr)} · {req.build_status}</div>
          {/* The buyer's two build decisions — they change how the page is made,
              so they belong on the summary, not buried in the JSON. */}
          {(req.background_label || req.ceremony_label) && (
            <div className="text-xs mt-1 flex flex-wrap gap-x-3" data-testid="fulfil-choices">
              {req.ceremony_label && <span className="text-yellow-200/70">Ceremony: <b className="text-yellow-200">{req.ceremony_label}</b></span>}
              {req.background_label && <span className="text-yellow-200/70">Background: <b className="text-yellow-200">{req.background_label}</b></span>}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Filled details</div>
          <pre className="text-[11px] bg-black/40 rounded p-2 max-h-48 overflow-auto" data-testid="fulfil-info">{JSON.stringify(req.info || {}, null, 2)}</pre>
        </div>
      </div>

      {/* The build brief — everything needed to make this invitation, in words.
          This is what the owner copies or downloads and hands over. */}
      {req.build_brief && (
        <div className="mt-4 pt-4 border-t border-yellow-200/15" data-testid="fulfil-brief">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-wider text-white/50 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Build brief (copy this)
            </div>
            <div className="flex gap-2">
              <button onClick={() => copy(req.build_brief)}
                className="bg-black/40 border border-yellow-200/20 rounded px-3 py-1.5 text-xs flex items-center gap-1"
                data-testid="fulfil-brief-copy"><Copy className="w-3 h-3" /> Copy brief</button>
              <button onClick={() => {
                const blob = new Blob([req.build_brief], { type: 'text/plain' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `${req.code}-brief.txt`; a.click();
              }} className="bg-black/40 border border-yellow-200/20 rounded px-3 py-1.5 text-xs flex items-center gap-1"
                data-testid="fulfil-brief-download"><Download className="w-3 h-3" /> .txt</button>
            </div>
          </div>
          <pre className="text-[11px] bg-black/40 rounded p-3 max-h-72 overflow-auto whitespace-pre-wrap leading-relaxed"
            style={{ color: '#F5E6C8' }}>{req.build_brief}</pre>
        </div>
      )}

      {/* Build the invitation FROM the filled details — the step that used to be
          "read the JSON and re-type it". Produces a DRAFT: previewable, not
          delivered. Delivering stays the separate, explicit action below. */}
      <div className="mt-4 pt-4 border-t border-yellow-200/15" data-testid="fulfil-build">
        <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1">
          <Wand2 className="w-3.5 h-3.5" /> Build invitation from these details
        </div>
        {!req.has_info ? (
          <div className="text-xs text-yellow-200/50">The buyer hasn’t filled the details form yet — nothing to build from.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => onBuild(req.code, false)}
                className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium flex items-center gap-1"
                data-testid="fulfil-build-run">
                <Wand2 className="w-3.5 h-3.5" /> {req.profile_id ? 'Open / rebuild draft' : 'Build draft invitation'}
              </button>
              {req.profile_id && (
                <button onClick={() => onBuild(req.code, true)}
                  className="bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-xs text-yellow-100"
                  data-testid="fulfil-build-refresh">
                  Re-apply the latest details
                </button>
              )}
              <span className="text-[11px] text-yellow-200/50">
                Creates a draft you can preview and edit. Nothing reaches the buyer until you press Deliver.
              </span>
            </div>
            {buildResult && (buildResult.profile_id || buildResult.loading) && (
              <div className="mt-3 rounded border border-yellow-200/20 bg-black/30 p-3" data-testid="fulfil-build-result">
                {buildResult.loading ? (
                  <div className="flex items-center gap-2 text-xs text-yellow-200/70"><Loader2 className="w-4 h-4 animate-spin" /> Building…</div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <a href={buildResult.preview_url} target="_blank" rel="noreferrer"
                        className="bg-yellow-300 text-black rounded px-3 py-1.5 font-medium" data-testid="fulfil-build-preview">Preview invitation</a>
                      <a href={buildResult.edit_url} target="_blank" rel="noreferrer"
                        className="bg-black/40 border border-yellow-200/20 rounded px-3 py-1.5 text-yellow-100">Open editor</a>
                      <span className="text-yellow-200/50 break-all">/{buildResult.slug}</span>
                    </div>
                    {/* What the mapping could not decide for itself. Shown, never
                        silently guessed — this is the owner's correction list. */}
                    {(buildResult.warnings || []).length > 0 && (
                      <ul className="mt-3 space-y-1" data-testid="fulfil-build-warnings">
                        {buildResult.warnings.map((w, i) => (
                          <li key={i} className="text-[11px] text-amber-200/90 flex gap-1.5">
                            <span className="text-amber-300">•</span><span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(buildResult.warnings || []).length === 0 && (
                      <div className="mt-2 text-[11px] text-emerald-300/80">Every field in the order mapped cleanly.</div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* deliver the link (the "update" step) */}
      <div className="mt-4 pt-4 border-t border-yellow-200/15">
        <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> Deliver link (updates buyer panel)</div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://majainvites.com/wedding/raju-and-rai" className="bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 flex-1 min-w-[280px]" data-testid="fulfil-liveurl" />
          <input value={profileId} onChange={(e) => setProfileId(e.target.value)} placeholder="profile id (optional)" className="bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 w-48" />
          <button onClick={() => onDeliver(req.code, liveUrl, profileId)} className="bg-yellow-300 text-black rounded px-4 py-2 text-sm font-medium flex items-center gap-1" data-testid="fulfil-deliver"><Send className="w-3.5 h-3.5" /> Deliver</button>
        </div>
      </div>

      {/* per-order edit lock */}
      <div className="mt-4 pt-4 border-t border-yellow-200/15 flex items-center gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-white/50">Couple editing</span>
        <span className="text-xs text-yellow-200/70">
          {req.edit_locked ? 'Deactivated for this order' : 'Allowed (24h after the link is delivered)'}
        </span>
        <button onClick={() => onToggleEditLock(req.code, !req.edit_locked)}
          className={`rounded px-3 py-1.5 text-xs ${req.edit_locked ? 'bg-emerald-400/80 text-black' : 'bg-black/40 border border-yellow-200/20 text-yellow-100'}`}
          data-testid="fulfil-edit-lock">
          {req.edit_locked ? 'Re-enable editing' : 'Deactivate edit option'}
        </button>
      </div>

      {/* Drive folders — two per event (QR photos + guest selfies), auto-named,
          with the Google mail they live on. */}
      <div className="mt-4 pt-4 border-t border-yellow-200/15">
        <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2 flex items-center gap-1"><HardDrive className="w-3.5 h-3.5" /> Google Drive folders (auto-prepared)</div>

        {/* WHICH MAIL these folders live on — answered in every state, because
            "I can't see the mail" was the whole complaint. Three cases:
              provisioned        -> the folders really are on that mail
              reserved on a mail -> not created yet, but we know the address
              nothing connected  -> say plainly that no Google account exists,
                                    instead of a note that reads like a mail. */}
        {(() => {
          const acc = req.storage_account || {};
          const mail = acc.email || acc.label;
          if (mail) {
            return (
              <div className="text-[11px] mb-2 flex flex-wrap items-center gap-2" data-testid="fulfil-storage-account">
                <span className="text-yellow-200/80">
                  {acc.provisioned ? 'Created on ' : 'Reserved on '}
                  <b className="text-yellow-200 break-all">{mail}</b>
                </span>
                <button type="button" onClick={() => copy(mail)} title="Copy mail"
                  className="text-yellow-200/60 hover:text-yellow-200"><Copy className="w-3 h-3" /></button>
                {!acc.provisioned && (
                  <span className="text-yellow-200/45">— not created in Drive yet{acc.reason ? `. ${acc.reason}` : ''}</span>
                )}
              </div>
            );
          }
          return (
            <div className="text-[11px] mb-2 rounded border border-yellow-200/20 bg-yellow-200/5 px-2 py-1.5"
              data-testid="fulfil-storage-account">
              <span className="text-yellow-200/80 font-medium">No Google mail yet. </span>
              <span className="text-yellow-200/55">
                {acc.reason || 'No Google account is connected, so there is no mail to show. The photos are held in MAJA storage and these two names are reserved.'}
              </span>
            </div>
          );
        })()}

        {!sf.qr && !sf.selfies ? (
          <div className="text-xs text-yellow-200/50">Folder names appear once the couple has entered their details.</div>
        ) : (
          <>
            <div className="text-[11px] text-yellow-200/60 mb-2">
              These two folders are prepared automatically. Keep the names, or paste a Drive folder id.
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {sf.qr && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-white/50">All photos (QR)</span>
                  <div className="flex items-center gap-1">
                    <input value={qr} onChange={(e) => setQr(e.target.value)} placeholder={sf.qr} className="bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 w-72" data-testid="fulfil-drive-qr" />
                    <button type="button" onClick={() => navigator.clipboard?.writeText(sf.qr)} title="Copy folder name" className="px-2 py-2 rounded bg-black/40 border border-yellow-200/20 text-yellow-200"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="text-[10px] text-yellow-200/40">{sf.qr}</span>
                </label>
              )}
              {sf.selfies && (
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-white/50">Guest photo requests</span>
                  <div className="flex items-center gap-1">
                    <input value={selfies} onChange={(e) => setSelfies(e.target.value)} placeholder={sf.selfies} className="bg-black/40 border border-yellow-200/20 rounded px-3 py-2 text-yellow-50 w-72" data-testid="fulfil-drive-selfies" />
                    <button type="button" onClick={() => navigator.clipboard?.writeText(sf.selfies)} title="Copy folder name" className="px-2 py-2 rounded bg-black/40 border border-yellow-200/20 text-yellow-200"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="text-[10px] text-yellow-200/40">{sf.selfies}</span>
                </label>
              )}
              <button onClick={() => onSaveDrive(req.code, qr, selfies)} className="bg-black/40 border border-yellow-200/20 rounded px-4 py-2 text-sm" data-testid="fulfil-drive-save">Save folders</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

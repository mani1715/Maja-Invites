import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import PanelTabs from '@/components/PanelTabs';
import { FileText, Camera, Download, Plus, Send, Trash2, RefreshCw } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * StudioClientWork — the studio side of the client workflow, per invitation:
 * contracts (draft/send/void), proofing galleries (create/add photos, see picks),
 * and download/print requests the client raised. Reads /api/studio/*.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function StudioClientWork() {
  const [weddings, setWeddings] = useState([]);
  const [pid, setPid] = useState('');
  const [sub, setSub] = useState('contracts');
  const [contracts, setContracts] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cForm, setCForm] = useState({ title: '', body: '', amount_inr: '' });
  const [gTitle, setGTitle] = useState('');
  const [photoUrls, setPhotoUrls] = useState({});   // galleryId -> textarea
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    axios.get(`${API_URL}/api/studio/my-weddings`).then((r) => {
      const w = r.data?.weddings || []; setWeddings(w);
      if (w.length && !pid) setPid(w[0].id);
    }).catch(() => {});
  }, []); // eslint-disable-line

  const loadAll = useCallback(async () => {
    if (!pid) return;
    try {
      const [c, p, o] = await Promise.all([
        axios.get(`${API_URL}/api/studio/contracts`, { params: { profile_id: pid } }),
        axios.get(`${API_URL}/api/studio/proofing`, { params: { profile_id: pid } }),
        axios.get(`${API_URL}/api/studio/print-orders`, { params: { profile_id: pid } }),
      ]);
      setContracts(c.data?.contracts || []);
      setProofs(p.data?.galleries || []);
      setOrders(o.data?.orders || []);
    } catch (_) {}
  }, [pid]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const createContract = async (e) => {
    e.preventDefault(); setErr('');
    if (!cForm.title.trim() || cForm.body.trim().length < 10) { setErr('Add a title and terms.'); return; }
    setBusy(true);
    try { await axios.post(`${API_URL}/api/studio/contracts`, { profile_id: pid, title: cForm.title, body: cForm.body, amount_inr: Number(cForm.amount_inr) || 0 }); setCForm({ title: '', body: '', amount_inr: '' }); await loadAll(); }
    catch (e2) { setErr(e2?.response?.data?.detail || 'Could not create.'); }
    setBusy(false);
  };
  const contractAction = async (id, action) => {
    try { await axios.post(`${API_URL}/api/studio/contracts/${id}/${action}`); loadAll(); } catch (_) {}
  };

  const createGallery = async (e) => {
    e.preventDefault();
    if (!pid) return;
    setBusy(true);
    try { await axios.post(`${API_URL}/api/studio/proofing`, { profile_id: pid, title: gTitle }); setGTitle(''); await loadAll(); } catch (_) {}
    setBusy(false);
  };
  const addPhotos = async (gid) => {
    const urls = (photoUrls[gid] || '').split('\n').map((s) => s.trim()).filter(Boolean).map((u) => ({ image_url: u }));
    if (!urls.length) return;
    try { await axios.post(`${API_URL}/api/studio/proofing/${gid}/photos`, { photos: urls }); setPhotoUrls((s) => ({ ...s, [gid]: '' })); loadAll(); } catch (_) {}
  };
  const setOrderStatus = async (id, status) => {
    try { await axios.post(`${API_URL}/api/studio/print-orders/${id}/status`, { status }); loadAll(); } catch (_) {}
  };

  const SUBS = [['contracts', 'Contracts', FileText], ['proofs', 'Proofing', Camera], ['orders', 'Requests', Download]];

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 960, margin: '0 auto' }}>
        <PanelTabs active="/studio/client-work" />
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <FileText style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Client Workflow</h1>
          <select className="lux-input ml-auto" style={{ width: 'auto' }} value={pid} onChange={(e) => setPid(e.target.value)}>
            {weddings.length === 0 && <option value="">No invitations yet</option>}
            {weddings.map((w) => <option key={w.id} value={w.id}>{[w.bride_name, w.groom_name].filter(Boolean).join(' & ') || w.slug || w.id}</option>)}
          </select>
          <button onClick={loadAll} className="lux-btn lux-btn-ghost !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
        </div>

        {!pid ? <div className="lux-glass p-8 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>Create an invitation first — contracts and proofing attach to one.</div> : (
          <>
            <div className="flex gap-2 mb-5">
              {SUBS.map(([k, label, Icon]) => (
                <button key={k} onClick={() => setSub(k)} className={`px-4 py-2 rounded-full text-sm inline-flex items-center gap-2 ${sub === k ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            {err && <div className="text-xs mb-3" style={{ color: '#ff9a9a' }}>{err}</div>}

            {/* CONTRACTS */}
            {sub === 'contracts' && (
              <>
                <form onSubmit={createContract} className="lux-glass p-4 mb-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>New contract</div>
                  <div className="grid md:grid-cols-[1fr_auto] gap-2 mb-2">
                    <input className="lux-input" placeholder="Title (e.g. Wedding coverage agreement)" value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} />
                    <input className="lux-input" placeholder="Amount ₹ (optional)" value={cForm.amount_inr} onChange={(e) => setCForm({ ...cForm, amount_inr: e.target.value.replace(/[^0-9]/g, '') })} style={{ width: 160 }} />
                  </div>
                  <textarea className="lux-input w-full" style={{ minHeight: 100 }} placeholder="Contract terms…" value={cForm.body} onChange={(e) => setCForm({ ...cForm, body: e.target.value })} />
                  <button type="submit" disabled={busy} className="lux-btn mt-2 !px-4 !py-2 text-sm inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Create draft</button>
                </form>
                {contracts.map((c) => (
                  <div key={c.id} className="lux-glass p-4 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: 'var(--lux-text)' }}>{c.title}</span>
                      {c.amount_inr > 0 && <span className="text-xs text-gold">{inr(c.amount_inr)}</span>}
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{ background: c.status === 'signed' ? 'rgba(60,140,80,0.18)' : 'rgba(212,175,55,0.15)', color: c.status === 'signed' ? '#bff0c8' : '#FFE5A0' }}>{c.status}</span>
                    </div>
                    <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--lux-text-muted)' }}>{c.body}</div>
                    {c.status === 'signed' ? (
                      <div className="text-[11px] mt-2" style={{ color: 'var(--lux-text-faint)' }}>Signed by {c.signer_name} · {String(c.signed_at || '').slice(0, 10)}</div>
                    ) : (
                      <div className="flex gap-2 mt-2">
                        {c.status === 'draft' && <button onClick={() => contractAction(c.id, 'send')} className="lux-btn !px-3 !py-1.5 text-xs inline-flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Send</button>}
                        {c.status !== 'signed' && <button onClick={() => contractAction(c.id, 'void')} className="lux-btn lux-btn-ghost !px-3 !py-1.5 text-xs inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Void</button>}
                      </div>
                    )}
                  </div>
                ))}
                {contracts.length === 0 && <div className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>No contracts yet.</div>}
              </>
            )}

            {/* PROOFING */}
            {sub === 'proofs' && (
              <>
                <form onSubmit={createGallery} className="lux-glass p-3 mb-4 flex gap-2">
                  <input className="lux-input flex-1" placeholder="New proofing gallery title" value={gTitle} onChange={(e) => setGTitle(e.target.value)} />
                  <button type="submit" disabled={busy} className="lux-btn !px-4 !py-2 text-sm inline-flex items-center gap-1"><Plus className="w-4 h-4" /> Create</button>
                </form>
                {proofs.map((g) => (
                  <div key={g.id} className="lux-glass p-4 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Camera className="w-4 h-4 text-gold" />
                      <span className="font-medium" style={{ color: 'var(--lux-text)' }}>{g.title}</span>
                      <span className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>· {g.selected_count}/{g.photo_count} selected by client</span>
                    </div>
                    <textarea className="lux-input w-full text-xs" style={{ minHeight: 60 }} placeholder="Paste image URLs, one per line, then Add" value={photoUrls[g.id] || ''} onChange={(e) => setPhotoUrls((s) => ({ ...s, [g.id]: e.target.value }))} />
                    <button onClick={() => addPhotos(g.id)} className="lux-btn lux-btn-ghost !px-3 !py-1.5 text-xs mt-2 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add photos</button>
                  </div>
                ))}
                {proofs.length === 0 && <div className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>No proofing galleries yet.</div>}
              </>
            )}

            {/* PRINT / DOWNLOAD REQUESTS */}
            {sub === 'orders' && (
              <>
                {orders.length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>No download or print requests yet.</div>
                  : orders.map((o) => (
                    <div key={o.id} className="lux-glass p-4 mb-2 flex items-center gap-3 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(212,175,55,0.15)', color: '#FFE5A0' }}>{o.kind}</span>
                      <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{o.photo_count} photo{o.photo_count === 1 ? '' : 's'}</span>
                      {o.note && <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>“{o.note}”</span>}
                      <span className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>{String(o.created_at || '').slice(0, 10)}</span>
                      <select value={o.status} onChange={(e) => setOrderStatus(o.id, e.target.value)} className="lux-input text-xs ml-auto" style={{ width: 'auto' }}>
                        {['new', 'in_progress', 'ready', 'delivered', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

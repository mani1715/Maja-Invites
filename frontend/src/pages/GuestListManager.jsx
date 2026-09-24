import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  ArrowLeft, Users, Upload, Download, Plus, Trash2, Edit2, Mic, MicOff,
  Copy, MessageCircle, Crown, Search, X, Send, Sparkles, Play, Square,
  CheckCircle2, FileSpreadsheet, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const EVENT_OPTIONS = ['mehendi', 'sangeet', 'haldi', 'wedding', 'reception'];
const MEAL_OPTIONS = [
  { v: 'veg', l: 'Veg 🌱' },
  { v: 'non_veg', l: 'Non-Veg' },
  { v: 'jain', l: 'Jain' },
  { v: 'unspecified', l: 'Unspecified' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

const GuestListManager = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();
  const [data, setData] = useState({ guests: [], total: 0, vip: 0, sent: 0, opened: 0, with_voice: 0 });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [recordingFor, setRecordingFor] = useState(null);
  const [waLinks, setWaLinks] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login');
    else loadGuests();
    // eslint-disable-next-line
  }, [admin, authLoading]);

  const loadGuests = async () => {
    setLoading(true);
    try {
      const { data: d } = await axios.get(`${API_URL}/api/admin/profiles/${profileId}/guests`);
      setData(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const filtered = data.guests
    .filter((g) => filter === 'vip' ? g.is_vip : filter === 'opened' ? g.invitation_opened : filter === 'voice' ? g.voice_message_url : true)
    .filter((g) => !query || g.name?.toLowerCase().includes(query.toLowerCase()) || g.phone?.includes(query));

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(filtered.map((g) => g.id)));
  const clearSelection = () => setSelected(new Set());

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data: r } = await axios.post(`${API_URL}/api/admin/profiles/${profileId}/guests/import`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(r);
      await loadGuests();
    } catch (e) {
      setImportResult({ error: e?.response?.data?.detail || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const downloadTemplate = async () => {
    const a = document.createElement('a');
    a.href = `${API_URL}/api/admin/profiles/${profileId}/guests/template?format=xlsx`;
    a.download = 'guest_list_template.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const deleteGuest = async (gid) => {
    if (!window.confirm('Remove this guest?')) return;
    await axios.delete(`${API_URL}/api/admin/profiles/${profileId}/guests/${gid}`);
    loadGuests();
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Remove ${selected.size} guests?`)) return;
    await axios.post(`${API_URL}/api/admin/profiles/${profileId}/guests/bulk-delete`, {
      guest_ids: [...selected],
    });
    clearSelection();
    loadGuests();
  };

  const generateWhatsAppLinks = async () => {
    const guest_ids = selected.size > 0 ? [...selected] : null;
    const { data: r } = await axios.post(`${API_URL}/api/admin/profiles/${profileId}/guests/whatsapp-links`,
      { guest_ids });
    setWaLinks(r.links);
  };

  const copyLink = async (link) => {
    try { await navigator.clipboard.writeText(link); } catch (_) {}
  };

  if (loading) return (
    <div className="luxe min-h-screen grid place-items-center"><div className="lux-mandala" /></div>
  );

  return (
    <div className="luxe min-h-screen relative" data-testid="guest-list-manager">
      <div className="lux-orbit" style={{ width: 900, height: 900, top: -260, right: -260 }} />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12 py-10">
        <button onClick={() => navigate('/studio/dashboard')} className="lux-btn lux-btn-ghost text-xs mb-6"
          data-testid="glm-back">
          <ArrowLeft className="w-4 h-4" /> Back to Studio
        </button>

        {/* Hero */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-10">
          <span className="lux-eyebrow block mb-3">◆ Personalized Invitations · Sacred Guest List</span>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="font-display text-[2.4rem] md:text-[3.8rem] leading-[1.04]" style={{ color: 'var(--lux-text)' }}>
                Every guest, <span className="text-gold font-script italic">remembered</span>.
              </h1>
              <p className="mt-3 text-base max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
                Each guest receives a unique link. Names appear personally. VIPs get private voice notes. Tables, meals, events — all in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={downloadTemplate} className="lux-btn lux-btn-ghost text-xs" data-testid="glm-template">
                <Download className="w-4 h-4" /> Template
              </button>
              <label className="lux-btn lux-btn-ghost text-xs cursor-pointer" data-testid="glm-import-label">
                <Upload className="w-4 h-4" /> {importing ? 'Importing…' : 'Import Excel/CSV'}
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} className="hidden" />
              </label>
              <button onClick={() => setShowAdd(true)} className="lux-btn text-xs" data-testid="glm-add">
                <Plus className="w-4 h-4" /> Add Guest
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1}
          className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <Stat label="Total Guests" value={data.total} />
          <Stat label="VIPs" value={data.vip} accent="#D4AF37" />
          <Stat label="Invitations Sent" value={data.sent} accent="#E8C4B8" />
          <Stat label="Opened" value={data.opened} accent="#6FCF97" />
          <Stat label="Voice Notes" value={data.with_voice} accent="#C3A3E3" />
        </motion.div>

        {/* Import result */}
        <AnimatePresence>
          {importResult && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="lux-glass p-4 mb-6 flex items-start gap-3"
              style={{ borderColor: importResult.error ? 'rgba(240,133,133,0.45)' : 'rgba(111,207,151,0.4)' }}>
              {importResult.error ? <AlertTriangle className="w-5 h-5 text-red-300 mt-0.5" /> : <CheckCircle2 className="w-5 h-5" style={{ color: '#86EFAC' }} />}
              <div className="flex-1 text-sm">
                {importResult.error ? <div style={{ color: '#FFD7C9' }}>{importResult.error}</div> :
                  <div style={{ color: 'var(--lux-text)' }}>
                    Imported <span className="text-gold font-semibold">{importResult.added}</span> guests.
                    {importResult.skipped > 0 && <> Skipped <span className="text-red-300">{importResult.skipped}</span> rows missing name/phone.</>}
                  </div>}
              </div>
              <button onClick={() => setImportResult(null)} className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', l: 'All', n: data.total },
              { id: 'vip', l: 'VIPs', n: data.vip },
              { id: 'opened', l: 'Opened', n: data.opened },
              { id: 'voice', l: 'With Voice', n: data.with_voice },
            ].map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className="px-4 py-2 rounded-full text-xs tracking-[0.18em] uppercase transition-all"
                style={filter === f.id
                  ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                  : { background: 'transparent', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
                data-testid={`glm-filter-${f.id}`}>
                {f.l} <span className="opacity-60 ml-1">({f.n})</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <>
                <span className="text-xs" style={{ color: 'var(--lux-text)' }}>{selected.size} selected</span>
                <button onClick={generateWhatsAppLinks} className="lux-btn text-xs" data-testid="glm-wa-bulk">
                  <Send className="w-4 h-4" /> WhatsApp
                </button>
                <button onClick={bulkDelete} className="lux-btn lux-btn-ghost text-xs" data-testid="glm-bulk-del">
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button onClick={clearSelection} className="text-xs underline" style={{ color: 'var(--lux-text-muted)' }}>clear</button>
              </>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
              <input type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 rounded-full text-sm w-64"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
                data-testid="glm-search" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="lux-glass overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-20 text-center">
              <Users className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--lux-gold)' }} />
              <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>No guests yet</h3>
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                Click <span className="text-gold">Add Guest</span> or <span className="text-gold">Import Excel/CSV</span> to begin.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--lux-border)' }}>
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox" onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
                        checked={selected.size === filtered.length && filtered.length > 0} data-testid="glm-select-all" />
                    </th>
                    {['Guest', 'Phone', 'Table/Seat', 'Meal', 'Events', 'Voice', 'Status', ''].map((h) => (
                      <th key={h} className="text-left px-3 py-3 text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-gold)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => (
                    <tr key={g.id} style={{ borderBottom: '1px solid var(--lux-border)' }}
                      className="hover:bg-[rgba(212,175,55,0.04)] transition-colors" data-testid={`glm-row-${g.id}`}>
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {g.is_vip && <Crown className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />}
                          <div>
                            <div className="font-heading text-base" style={{ color: 'var(--lux-text)' }}>{g.name}</div>
                            {g.relationship && <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{g.relationship}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3" style={{ color: 'var(--lux-text)' }}>{g.phone || '—'}</td>
                      <td className="px-3 py-3" style={{ color: 'var(--lux-text-muted)' }}>
                        {g.table_number ? `T${g.table_number}` : '—'}{g.seat_number ? ` · S${g.seat_number}` : ''}
                      </td>
                      <td className="px-3 py-3 text-xs uppercase tracking-wider" style={{ color: 'var(--lux-text)' }}>
                        {g.meal_preference?.replace('_', ' ') || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(g.events_invited || []).slice(0, 3).map((e) => (
                            <span key={e} className="text-[10px] tracking-[0.15em] uppercase px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid var(--lux-border)' }}>
                              {e}
                            </span>
                          ))}
                          {g.events_invited?.length > 3 && (
                            <span className="text-[10px]" style={{ color: 'var(--lux-text-muted)' }}>+{g.events_invited.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {g.voice_message_url ? (
                          <button onClick={() => new Audio(`${API_URL}${g.voice_message_url}`).play()}
                            className="inline-flex items-center gap-1 text-xs" style={{ color: '#C3A3E3' }}
                            data-testid={`glm-voice-play-${g.id}`}>
                            <Play className="w-3 h-3" /> Play
                          </button>
                        ) : (
                          <button onClick={() => setRecordingFor(g)} className="text-xs"
                            style={{ color: 'var(--lux-text-muted)' }} data-testid={`glm-voice-add-${g.id}`}>
                            <Mic className="w-3.5 h-3.5 inline" /> add
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {g.invitation_opened ? (
                            <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#86EFAC' }}>opened</span>
                          ) : g.invitation_sent ? (
                            <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#E8C766' }}>sent</span>
                          ) : (
                            <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--lux-text-faint)' }}>pending</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditing(g)} className="p-1.5 hover:text-gold" style={{ color: 'var(--lux-text)' }}
                            data-testid={`glm-edit-${g.id}`}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteGuest(g.id)} className="p-1.5 hover:text-red-400" style={{ color: 'var(--lux-text-muted)' }}
                            data-testid={`glm-del-${g.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* WhatsApp links result */}
        <AnimatePresence>
          {waLinks && <WhatsAppLinksModal links={waLinks} onClose={() => setWaLinks(null)} />}
        </AnimatePresence>

        {/* Add / Edit modal */}
        <AnimatePresence>
          {(showAdd || editing) && (
            <GuestModal
              profileId={profileId}
              guest={editing}
              onClose={() => { setShowAdd(false); setEditing(null); }}
              onSaved={() => { setShowAdd(false); setEditing(null); loadGuests(); }}
            />
          )}
        </AnimatePresence>

        {/* Voice recorder modal */}
        <AnimatePresence>
          {recordingFor && (
            <VoiceRecorderModal
              profileId={profileId}
              guest={recordingFor}
              onClose={() => setRecordingFor(null)}
              onSaved={() => { setRecordingFor(null); loadGuests(); }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ===========================================================================
const Stat = ({ label, value, accent = 'var(--lux-gold)' }) => (
  <div className="luxe-stat-tile" style={{ '--accent': accent }}>
    <div className="luxe-stat-value" style={{ background: `linear-gradient(180deg, ${accent}, #8C6A1A)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
      {value || 0}
    </div>
    <div className="luxe-stat-label">{label}</div>
  </div>
);

// ===========================================================================
const GuestModal = ({ profileId, guest, onClose, onSaved }) => {
  const [form, setForm] = useState(guest || {
    name: '', phone: '', email: '', relationship: '', table_number: '', seat_number: '',
    meal_preference: 'unspecified', events_invited: [], is_vip: false,
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!guest;

  const toggleEvent = (e) => {
    const has = form.events_invited.includes(e);
    setForm({ ...form, events_invited: has ? form.events_invited.filter((x) => x !== e) : [...form.events_invited, e] });
  };

  const save = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await axios.put(`${API_URL}/api/admin/profiles/${profileId}/guests/${guest.id}`, form);
      } else {
        await axios.post(`${API_URL}/api/admin/profiles/${profileId}/guests`, form);
      }
      onSaved();
    } catch (e) { alert(e?.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(6,4,2,0.88)', backdropFilter: 'blur(10px)' }} onClick={onClose}>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="lux-glass relative w-full max-w-2xl p-7 max-h-[90vh] overflow-y-auto"
        style={{ background: 'rgba(14,10,6,0.97)' }}>
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center"
          style={{ color: 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }} data-testid="gmodal-close">
          <X className="w-4 h-4" />
        </button>
        <span className="lux-eyebrow block mb-3">◆ {isEdit ? 'Edit guest' : 'Invite a guest'}</span>
        <h3 className="font-display text-2xl mb-5" style={{ color: 'var(--lux-text)' }}>
          {isEdit ? form.name : 'A new'} <span className="font-script italic text-gold">presence</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Full name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testid="gmodal-name" />
          <Field label="Phone *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+91 98765 43210" testid="gmodal-phone" />
          <Field label="Email" value={form.email || ''} onChange={(v) => setForm({ ...form, email: v })} testid="gmodal-email" />
          <Field label="Relationship" value={form.relationship || ''} onChange={(v) => setForm({ ...form, relationship: v })}
            placeholder="Bride's cousin" testid="gmodal-rel" />
          <Field label="Table" value={form.table_number || ''} onChange={(v) => setForm({ ...form, table_number: v })} testid="gmodal-table" />
          <Field label="Seat" value={form.seat_number || ''} onChange={(v) => setForm({ ...form, seat_number: v })} testid="gmodal-seat" />
          <SelectField label="Meal preference" value={form.meal_preference} onChange={(v) => setForm({ ...form, meal_preference: v })}
            options={MEAL_OPTIONS} testid="gmodal-meal" />
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={form.is_vip} onChange={(e) => setForm({ ...form, is_vip: e.target.checked })} data-testid="gmodal-vip" />
            <span className="text-sm inline-flex items-center gap-1.5" style={{ color: 'var(--lux-text)' }}>
              <Crown className="w-3.5 h-3.5 text-gold" /> Mark as VIP
            </span>
          </label>
        </div>
        <div className="mt-4">
          <span className="text-[10px] tracking-[0.3em] uppercase block mb-2" style={{ color: 'var(--lux-text-muted)' }}>Events invited to</span>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((e) => {
              const on = form.events_invited.includes(e);
              return (
                <button key={e} type="button" onClick={() => toggleEvent(e)}
                  className="px-3 py-1.5 rounded-full text-xs tracking-[0.18em] uppercase transition-all"
                  style={on
                    ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                    : { background: 'transparent', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
                  data-testid={`gmodal-event-${e}`}>
                  {e}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={save} disabled={saving || !form.name?.trim()} className="lux-btn w-full justify-center mt-6"
          data-testid="gmodal-save">
          <Sparkles className="w-4 h-4" /> {saving ? 'Saving…' : isEdit ? 'Update guest' : 'Add to guest list'}
        </button>
      </motion.div>
    </motion.div>
  );
};

const Field = ({ label, value, onChange, placeholder, testid }) => (
  <label className="block">
    <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
      style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid={testid} />
  </label>
);

const SelectField = ({ label, value, onChange, options, testid }) => (
  <label className="block">
    <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm appearance-none pr-8"
        style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid={testid}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--lux-text-muted)' }} />
    </div>
  </label>
);

// ===========================================================================
const VoiceRecorderModal = ({ profileId, guest, onClose, onSaved }) => {
  const [state, setState] = useState('idle'); // idle | recording | ready | saving
  const [error, setError] = useState('');
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioUrlRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
  }, []);

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const b = new Blob(chunksRef.current, { type: 'audio/webm' });
        setBlob(b);
        audioUrlRef.current = URL.createObjectURL(b);
        setState('ready');
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRef.current = mr;
      setState('recording');
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => {
        const n = d + 1;
        if (n >= 30) { stop(); } // 30s cap
        return n;
      }), 1000);
    } catch (e) {
      setError('Microphone permission denied or unavailable.');
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
  };

  const save = async () => {
    if (!blob) return;
    setState('saving');
    const fd = new FormData();
    fd.append('file', blob, `${guest.token}.webm`);
    try {
      await axios.post(`${API_URL}/api/admin/profiles/${profileId}/guests/${guest.id}/voice`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Upload failed');
      setState('ready');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[75] flex items-center justify-center p-4"
      style={{ background: 'rgba(6,4,2,0.88)', backdropFilter: 'blur(10px)' }} onClick={onClose}>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="lux-glass relative w-full max-w-md p-8 text-center"
        style={{ background: 'rgba(14,10,6,0.97)' }}>
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center"
          style={{ color: 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}>
          <X className="w-4 h-4" />
        </button>
        <span className="lux-eyebrow block mb-3">◆ Voice Message</span>
        <h3 className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>
          For <span className="text-gold">{guest.name}</span>
        </h3>
        <p className="text-xs mb-6" style={{ color: 'var(--lux-text-muted)' }}>Max 30 seconds · plays on their personalized invitation</p>

        {/* Waveform/Circle indicator */}
        <div className="relative w-32 h-32 mx-auto mb-4">
          <motion.div
            animate={state === 'recording' ? { scale: [1, 1.15, 1] } : { scale: 1 }}
            transition={{ duration: 1.2, repeat: state === 'recording' ? Infinity : 0 }}
            className="absolute inset-0 rounded-full"
            style={{ background: state === 'recording'
              ? 'radial-gradient(circle, rgba(240,133,133,0.35), transparent 70%)'
              : 'radial-gradient(circle, rgba(212,175,55,0.25), transparent 70%)' }} />
          <button
            onClick={state === 'idle' ? start : state === 'recording' ? stop : null}
            className="absolute inset-3 rounded-full grid place-items-center transition-all"
            style={{ background: state === 'recording'
              ? 'linear-gradient(135deg, #8B0000, #F08585)'
              : 'linear-gradient(135deg, #B8902B, #D4AF37, #E8C766)',
              color: '#16110C' }}
            data-testid="voice-rec-btn">
            {state === 'recording' ? <Square className="w-7 h-7" /> : <Mic className="w-9 h-9" />}
          </button>
        </div>
        <div className="font-display text-3xl mb-5" style={{ color: 'var(--lux-text)' }}>
          {String(Math.floor(duration / 60)).padStart(2, '0')}:{String(duration % 60).padStart(2, '0')}
        </div>

        {state === 'ready' && audioUrlRef.current && (
          <audio src={audioUrlRef.current} controls className="w-full mb-4" data-testid="voice-preview" />
        )}

        {error && <p className="text-xs mb-3" style={{ color: '#FFD7C9' }}>{error}</p>}

        {state === 'idle' && <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Tap the mic to record</p>}
        {state === 'ready' && (
          <div className="flex gap-2 justify-center">
            <button onClick={() => { setBlob(null); setState('idle'); setDuration(0); }} className="lux-btn lux-btn-ghost text-xs">
              <MicOff className="w-4 h-4" /> Re-record
            </button>
            <button onClick={save} className="lux-btn text-xs" data-testid="voice-save">
              <Sparkles className="w-4 h-4" /> Save
            </button>
          </div>
        )}
        {state === 'saving' && <p className="text-xs" style={{ color: 'var(--lux-gold)' }}>Saving…</p>}
      </motion.div>
    </motion.div>
  );
};

// ===========================================================================
const WhatsAppLinksModal = ({ links, onClose }) => {
  const openAll = () => links.forEach((l, i) => l.whatsapp_link && setTimeout(() => window.open(l.whatsapp_link, '_blank'), i * 350));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(6,4,2,0.88)', backdropFilter: 'blur(10px)' }} onClick={onClose}>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="lux-glass relative w-full max-w-3xl p-7 max-h-[88vh] overflow-y-auto"
        style={{ background: 'rgba(14,10,6,0.97)' }}>
        <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center"
          style={{ color: 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}><X className="w-4 h-4" /></button>
        <span className="lux-eyebrow block mb-3">◆ WhatsApp Invitations</span>
        <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>
          {links.length} personalized <span className="font-script italic text-gold">invitations</span>
        </h3>
        <p className="text-xs mb-5" style={{ color: 'var(--lux-text-muted)' }}>Each link opens WhatsApp with the guest's pre-filled message. Open one or all.</p>
        <button onClick={openAll} className="lux-btn mb-5 w-full justify-center"><Send className="w-4 h-4" /> Open all in sequence</button>
        <div className="space-y-2">
          {links.map((l) => (
            <div key={l.guest_id} className="flex items-center gap-3 p-3 rounded-lg"
              style={{ border: '1px solid var(--lux-border)' }}>
              <div className="flex-1 min-w-0">
                <div className="font-heading text-sm" style={{ color: 'var(--lux-text)' }}>{l.name}</div>
                <div className="text-[11px] truncate" style={{ color: 'var(--lux-text-muted)' }}>{l.personal_link}</div>
              </div>
              <button onClick={() => navigator.clipboard.writeText(l.personal_link)}
                className="lux-btn lux-btn-ghost text-xs" title="Copy link"><Copy className="w-3.5 h-3.5" /></button>
              {l.whatsapp_link && (
                <a href={l.whatsapp_link} target="_blank" rel="noreferrer"
                  className="lux-btn text-xs" title="Open WhatsApp">
                  <MessageCircle className="w-3.5 h-3.5" /> Send
                </a>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default GuestListManager;

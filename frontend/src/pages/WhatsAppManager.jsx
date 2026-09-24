import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { ArrowLeft, MessageCircle, Send, Bell, History, Plus, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const WhatsAppManager = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();
  const [status, setStatus] = useState(null);
  const [recipients, setRecipients] = useState([{ name: '', phone: '' }]);
  const [customMsg, setCustomMsg] = useState('');
  const [reminderType, setReminderType] = useState('3_days');
  const [target, setTarget] = useState('pending');
  const [logs, setLogs] = useState([]);
  const [sending, setSending] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login');
    else load();
    /* eslint-disable-next-line */
  }, [admin, authLoading]);

  const load = async () => {
    try {
      const [s, l] = await Promise.all([
        axios.get(`${API_URL}/api/admin/whatsapp/status`),
        axios.get(`${API_URL}/api/admin/profiles/${profileId}/whatsapp/logs`),
      ]);
      setStatus(s.data);
      setLogs(l.data.logs || []);
    } catch (e) { console.error(e); }
  };

  const addRecipient = () => setRecipients([...recipients, { name: '', phone: '' }]);
  const removeRecipient = (i) => setRecipients(recipients.filter((_, idx) => idx !== i));
  const updateRecipient = (i, field, v) => {
    const copy = [...recipients]; copy[i][field] = v; setRecipients(copy);
  };

  const sendInvitations = async () => {
    const valid = recipients.filter((r) => r.phone.trim());
    if (valid.length === 0) { alert('Add at least one phone number.'); return; }
    setSending(true); setResult(null);
    try {
      const res = await axios.post(`${API_URL}/api/admin/whatsapp/send-invitation`, {
        profile_id: profileId, recipients: valid, custom_message: customMsg || null,
      });
      setResult(res.data);
      load();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to send.');
    } finally { setSending(false); }
  };

  const sendReminders = async () => {
    setReminding(true); setResult(null);
    try {
      const res = await axios.post(`${API_URL}/api/admin/whatsapp/send-reminder`, {
        profile_id: profileId, reminder_type: reminderType, target,
      });
      setResult(res.data);
      load();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to send reminders.');
    } finally { setReminding(false); }
  };

  return (
    <div className="luxe min-h-screen" data-testid="whatsapp-manager">
      <div className="px-6 md:px-12 py-10 max-w-[1400px] mx-auto">
        <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost mb-6" data-testid="wa-back">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="mb-8">
          <span className="lux-eyebrow block mb-3">◆ WhatsApp Business</span>
          <h1 className="font-display text-[2.2rem] md:text-[3.6rem] leading-tight" style={{ color: 'var(--lux-text)' }}>
            WhatsApp <span className="font-script italic text-gold">manager</span>
          </h1>
          <p className="mt-3 text-sm max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
            Send beautifully composed invitations and reminders via WhatsApp. Twilio-powered.
          </p>
          {status && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ border: '1px solid var(--lux-border-strong)',
                       background: status.mode === 'live' ? 'rgba(0,170,80,0.08)' : 'rgba(212,175,55,0.06)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: status.mode === 'live' ? '#43E07F' : '#D4AF37' }} />
              <span className="text-xs tracking-[0.2em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                {status.mode === 'live' ? `Live · ${status.from_number}` : 'Mock mode — Twilio creds not configured'}
              </span>
            </div>
          )}
        </div>

        {/* Send invitations */}
        <div className="lux-glass p-6 md:p-8 mb-6" data-testid="wa-invite-section">
          <h3 className="font-display text-2xl mb-4 flex items-center gap-2" style={{ color: 'var(--lux-text)' }}>
            <Send className="w-5 h-5 text-gold" /> Send invitations
          </h3>
          <div className="space-y-2 mb-4">
            {recipients.map((r, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_3fr_auto] gap-2">
                <input value={r.name} onChange={(e) => updateRecipient(i, 'name', e.target.value)} placeholder="Guest name"
                  className="px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
                  style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                  data-testid={`wa-recipient-name-${i}`} />
                <input value={r.phone} onChange={(e) => updateRecipient(i, 'phone', e.target.value)} placeholder="+91 9876543210"
                  className="px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
                  style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                  data-testid={`wa-recipient-phone-${i}`} />
                <button onClick={() => removeRecipient(i)} className="px-3 py-2 rounded-lg"
                  style={{ color: 'rgba(255,200,200,0.7)', border: '1px solid var(--lux-border)' }}
                  data-testid={`wa-recipient-remove-${i}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={addRecipient} className="lux-btn lux-btn-ghost text-xs" data-testid="wa-add-recipient">
              <Plus className="w-3.5 h-3.5" /> Add recipient
            </button>
          </div>
          <label className="block mb-4">
            <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>
              Custom message (optional, use {'{name}'} & {'{link}'})
            </span>
            <textarea value={customMsg} onChange={(e) => setCustomMsg(e.target.value)} rows={4}
              placeholder="Dear {name},&#10;Please join us…"
              className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
              data-testid="wa-custom-msg" />
          </label>
          <button onClick={sendInvitations} disabled={sending} className="lux-btn" data-testid="wa-send-invitations">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send to {recipients.filter((r) => r.phone.trim()).length} recipient(s)
          </button>
        </div>

        {/* Reminders */}
        <div className="lux-glass p-6 md:p-8 mb-6" data-testid="wa-reminder-section">
          <h3 className="font-display text-2xl mb-4 flex items-center gap-2" style={{ color: 'var(--lux-text)' }}>
            <Bell className="w-5 h-5 text-gold" /> Auto reminders
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Select label="When"   value={reminderType} onChange={setReminderType}
              options={[{ id: '7_days', label: '7 days before' }, { id: '3_days', label: '3 days before' }, { id: '1_day', label: '1 day before' }]}
              testid="wa-reminder-type" />
            <Select label="Target" value={target} onChange={setTarget}
              options={[{ id: 'all', label: 'All guests' }, { id: 'confirmed', label: 'Confirmed only' }, { id: 'pending', label: 'Pending only' }]}
              testid="wa-reminder-target" />
          </div>
          <button onClick={sendReminders} disabled={reminding} className="lux-btn" data-testid="wa-send-reminders">
            {reminding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Send reminders
          </button>
        </div>

        {result && (
          <div className="lux-glass p-5 mb-6 text-sm" data-testid="wa-result">
            <strong style={{ color: '#D4AF37' }}>{result.mode === 'live' ? 'Sent' : 'Mock'}:</strong>{' '}
            <span style={{ color: 'var(--lux-text)' }}>{result.sent} message(s) processed.</span>
            <details className="mt-2 text-xs" style={{ color: 'var(--lux-text)' }}>
              <summary>View details</summary>
              <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(result.results, null, 2)}</pre>
            </details>
          </div>
        )}

        {/* Logs */}
        <div className="lux-glass p-6 md:p-8" data-testid="wa-logs-section">
          <h3 className="font-display text-2xl mb-4 flex items-center gap-2" style={{ color: 'var(--lux-text)' }}>
            <History className="w-5 h-5 text-gold" /> Recent activity
          </h3>
          {logs.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No WhatsApp activity yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded-lg"
                  style={{ border: '1px solid var(--lux-border)' }} data-testid={`wa-log-${l.id}`}>
                  <div>
                    <div className="text-sm" style={{ color: 'var(--lux-text)' }}>
                      {l.kind === 'invitation' ? 'Invitation' : `Reminder (${l.reminder_type})`} · {l.count} recipient(s) · {l.mode}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
                      {new Date(l.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Select = ({ label, value, onChange, options, testid }) => (
  <label className="block">
    <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm cursor-pointer"
      style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
      data-testid={testid}>
      {options.map((o) => (<option key={o.id} value={o.id} style={{ background: '#1A130B', color: '#FFF8DC' }}>{o.label}</option>))}
    </select>
  </label>
);

export default WhatsAppManager;

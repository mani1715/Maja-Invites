/**
 * EventMoneyPortal.jsx — the money-collection member portal (Ganesh v2 §3).
 * Route: /e/:slug/money
 *
 * The ≤8 people the invitation owner authorises log in here (owner-created username +
 * password) to record who gave money and add spending. The scoped token authorises
 * exactly one event; a member only ever sees/edits their own event's money.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { EventService } from '../services/eventApi';

const TOKEN_KEY = 'event_money_token';

function money(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

export default function EventMoneyPortal() {
  const { slug } = useParams();
  const [token, setToken] = useState(() => (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null));
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [overview, setOverview] = useState(null);
  const [board, setBoard] = useState(null);
  const [don, setDon] = useState({ donor_name: '', amount: '', category: '', phone: '', is_anonymous: false });
  const [exp, setExp] = useState({ title: '', amount: '', category: '' });
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [o, b] = await Promise.all([EventService.moneyOverview(), EventService.moneyBoard()]);
      setOverview(o); setBoard(b);
    } catch (_) {
      // token expired / invalid → force re-login
      localStorage.removeItem(TOKEN_KEY); setToken(null);
    }
  }, []);

  useEffect(() => { if (token) refresh(); }, [token, refresh]);

  const login = async () => {
    setErr('');
    try {
      const r = await EventService.moneyLogin({ slug, username: creds.username, password: creds.password });
      localStorage.setItem(TOKEN_KEY, r.token); setToken(r.token);
    } catch (_) { setErr('Invalid username or password.'); }
  };

  const logout = () => { localStorage.removeItem(TOKEN_KEY); setToken(null); setOverview(null); setBoard(null); };

  const addDonation = async () => {
    setMsg('');
    if (!don.donor_name.trim() || !Number(don.amount)) { setMsg('Enter a name and amount.'); return; }
    try {
      await EventService.moneyAddDonation({ ...don, amount: Number(don.amount) });
      setDon({ donor_name: '', amount: '', category: '', phone: '', is_anonymous: false });
      setMsg('Recorded ✓'); refresh();
    } catch (_) { setMsg('Could not save. Try again.'); }
  };

  const addExpense = async () => {
    setMsg('');
    if (!exp.title.trim() || !Number(exp.amount)) { setMsg('Enter a title and amount.'); return; }
    try {
      await EventService.moneyAddExpense({ ...exp, amount: Number(exp.amount) });
      setExp({ title: '', amount: '', category: '' });
      setMsg('Spending added ✓'); refresh();
    } catch (_) { setMsg('Could not save. Try again.'); }
  };

  const downloadCsv = async () => {
    try {
      const res = await fetch(EventService.moneyReportUrl(), EventService.moneyHeaders());
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'money-report.csv'; a.click();
      URL.revokeObjectURL(a.href);
    } catch (_) { setMsg('Download failed.'); }
  };

  if (!token) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-950 px-4 text-white">
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[.03] p-6">
          <h1 className="mb-1 text-lg font-semibold">Money Collection Login</h1>
          <p className="mb-4 text-sm text-white/50">Enter the username &amp; password shared by the organiser.</p>
          {err && <p className="mb-3 rounded bg-red-500/10 p-2 text-sm text-red-300">{err}</p>}
          <input className="mb-2 w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm" placeholder="Username"
            value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} />
          <input className="mb-3 w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm" placeholder="Password" type="password"
            value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && login()} />
          <button onClick={login} className="w-full rounded-lg bg-amber-500 py-2 font-medium text-black">Log in</button>
        </div>
      </div>
    );
  }

  const tile = (label, val) => (
    <div className="rounded-lg border border-white/10 bg-white/[.03] p-3 text-center">
      <div className="text-lg font-semibold text-amber-200">{money(val)}</div>
      <div className="text-[10px] uppercase tracking-wide text-white/40">{label}</div>
    </div>
  );
  const inp = (props) => <input {...props} className="w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm" />;

  return (
    <div className="min-h-screen bg-neutral-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Money Collection</h1>
          <button onClick={logout} className="text-xs text-white/50 underline">Log out</button>
        </div>

        {overview && (
          <div className="grid grid-cols-3 gap-2">
            {tile('Collected', overview.collected)}{tile('Spent', overview.spent)}{tile('Balance', overview.balance)}
          </div>
        )}
        {msg && <p className="text-sm text-amber-200">{msg}</p>}

        <div className="rounded-xl border border-white/10 p-4">
          <p className="mb-2 text-sm font-medium">Record a contribution</p>
          <div className="space-y-2">
            {inp({ placeholder: 'Donor name', value: don.donor_name, onChange: (e) => setDon({ ...don, donor_name: e.target.value }) })}
            <div className="grid grid-cols-2 gap-2">
              {inp({ placeholder: 'Amount ₹', type: 'number', value: don.amount, onChange: (e) => setDon({ ...don, amount: e.target.value }) })}
              {inp({ placeholder: 'Cause (optional)', value: don.category, onChange: (e) => setDon({ ...don, category: e.target.value }) })}
            </div>
            {inp({ placeholder: 'Phone (optional)', value: don.phone, onChange: (e) => setDon({ ...don, phone: e.target.value }) })}
            <label className="flex items-center gap-2 text-sm text-white/60">
              <input type="checkbox" checked={don.is_anonymous} onChange={(e) => setDon({ ...don, is_anonymous: e.target.checked })} /> Anonymous
            </label>
            <button onClick={addDonation} className="w-full rounded-lg bg-amber-500 py-2 font-medium text-black">Add contribution</button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 p-4">
          <p className="mb-2 text-sm font-medium">Add spending (folder)</p>
          <div className="space-y-2">
            {inp({ placeholder: 'What for (e.g. Mandap decor)', value: exp.title, onChange: (e) => setExp({ ...exp, title: e.target.value }) })}
            <div className="grid grid-cols-2 gap-2">
              {inp({ placeholder: 'Amount ₹', type: 'number', value: exp.amount, onChange: (e) => setExp({ ...exp, amount: e.target.value }) })}
              {inp({ placeholder: 'Folder (Mandap / Food…)', value: exp.category, onChange: (e) => setExp({ ...exp, category: e.target.value }) })}
            </div>
            <button onClick={addExpense} className="w-full rounded-lg border border-white/15 py-2 font-medium">Add spending</button>
          </div>
        </div>

        {board && board.donors && board.donors.length > 0 && (
          <div className="rounded-xl border border-white/10 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Contributors ({board.count})</p>
              <button onClick={downloadCsv} className="text-xs text-amber-200 underline">Download report</button>
            </div>
            <ul className="space-y-1.5">
              {board.donors.map((d, i) => (
                <li key={d.id || i} className="flex items-center justify-between rounded-md bg-white/[.04] px-3 py-1.5 text-sm">
                  <span>{d.name}{d.phone ? <span className="text-white/40"> · {d.phone}</span> : ''}</span>
                  <span className="tabular-nums font-medium">{money(d.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

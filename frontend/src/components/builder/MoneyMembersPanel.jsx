/**
 * MoneyMembersPanel.jsx — owner manages the ≤8 money-collection member logins
 * (Ganesh v2 §3). Shown in the builder's Donations Setup section. The plaintext
 * password is returned once at creation for the owner to copy and share.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { EventService } from '../../services/eventApi';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

export default function MoneyMembersPanel({ eventId }) {
  const [data, setData] = useState({ members: [], max: 8 });
  const [form, setForm] = useState({ username: '', password: '' });
  const [created, setCreated] = useState(null);   // { username, password } shown once
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    EventService.moneyMembers(eventId).then(setData).catch(() => {});
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setErr(''); setCreated(null);
    try {
      const r = await EventService.moneyCreateMember(eventId, form);
      setCreated({ username: r.username, password: r.password });
      setForm({ username: '', password: '' });
      load();
    } catch (ex) {
      setErr(ex?.response?.data?.detail || 'Could not create this login.');
    }
  };
  const revoke = async (id) => { await EventService.moneyRevokeMember(eventId, id); load(); };

  const full = data.members.length >= data.max;
  return (
    <div className="mt-6 rounded-xl border p-4">
      <p className="text-sm font-semibold">Money-collection logins</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Create up to {data.max} logins for the people who collect money. They sign in at
        <span className="font-mono"> /e/&lt;your-link&gt;/money</span> to record who gave and add spending.
      </p>

      {data.members.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {data.members.map((m) => (
            <li key={m.member_id} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-sm">
              <span>{m.username} <span className="text-muted-foreground">· {m.status}</span></span>
              <button onClick={() => revoke(m.member_id)} className="text-xs text-red-500 underline">Revoke</button>
            </li>
          ))}
        </ul>
      )}

      {created && (
        <div className="mb-3 rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm">
          <p className="font-medium text-emerald-700">Login created — copy it now (shown once):</p>
          <p className="mt-1 font-mono">username: {created.username}</p>
          <p className="font-mono">password: {created.password}</p>
        </div>
      )}

      {!full ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input className="w-40" placeholder="Username" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input className="w-40" placeholder="Password" type="text" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Button size="sm" onClick={add}>Add login</Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Maximum {data.max} logins reached.</p>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}

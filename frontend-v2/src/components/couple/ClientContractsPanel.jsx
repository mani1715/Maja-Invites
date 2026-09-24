import { useCallback, useEffect, useState } from 'react';
import { clientContracts, clientSignContract } from '@/lib/clientAuth';

// GET  /api/client/contracts             -> { contracts: [{id,title,body,amount_inr,status,sent_at,signed_at,signer_name,...}] }
// POST /api/client/contracts/{id}/sign   -> { ok, signed_at, signer_name } (body: {signer_name})
// (client_studio_service.py ~379-390). Only contracts the studio actually
// sent (status "sent" or "signed") are ever returned to the client.
//
// Signing is legally meaningful and irreversible, so this is a two-step flow:
// the full contract body is shown, an explicit checkbox is required before the
// name field unlocks, and a confirm dialog restates what's being agreed to
// before the request fires.

function fmtWhen(v) {
  if (!v) return '';
  return String(v).slice(0, 16).replace('T', ' ');
}

function SignDialog({ contract, onClose, onSigned }) {
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const trimmedName = name.trim();
  const canSign = agreed && trimmedName.length >= 2;

  const doSign = async () => {
    setBusy(true);
    setErr('');
    try {
      const { data } = await clientSignContract(contract.id, trimmedName);
      onSigned(data);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not sign. Please try again.');
      setConfirming(false);
    }
    setBusy(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cap-sign-title"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(9,5,20,.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="cap-glass" style={{ width: '100%', maxWidth: 560, maxHeight: '86vh', display: 'flex', flexDirection: 'column', borderRadius: 20, padding: '26px 26px 22px' }}>
        <h2 id="cap-sign-title" style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 20, margin: '0 0 4px' }}>{contract.title}</h2>
        {contract.amount_inr > 0 && (
          <p style={{ fontSize: 14, color: '#e5a93c', margin: '0 0 14px' }}>&#8377;{Number(contract.amount_inr).toLocaleString('en-IN')}</p>
        )}
        <div style={{ overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.7, color: '#ede9fe', border: '1px solid rgba(196,181,253,.18)', borderRadius: 14, padding: 16, margin: '4px 0 18px' }}>
          {contract.body}
        </div>

        {!confirming ? (
          <>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#ddd6fe', marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 2 }} />
              I have read this contract in full and agree to its terms.
            </label>
            <label htmlFor="cap-sign-name" style={{ display: 'block', fontSize: 11.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 8px' }}>
              Type your full legal name to sign
            </label>
            <input
              id="cap-sign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!agreed}
              placeholder="Full name"
              style={{ width: '100%', minHeight: 46, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(196,181,253,.28)', background: '#190f33', color: '#f2eefb', fontSize: 14.5, marginBottom: 18 }}
            />
            {err && <p className="cap-error">{err}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} className="cap-btn cap-btn-outline" style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" disabled={!canSign} onClick={() => setConfirming(true)} className="cap-btn cap-btn-solid" style={{ minHeight: 44, padding: '0 22px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Review &amp; sign
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, color: '#ede9fe', lineHeight: 1.7, margin: '0 0 18px' }}>
              You are about to electronically sign <strong>&ldquo;{contract.title}&rdquo;</strong> as <strong>{trimmedName}</strong>. This
              is a legally binding signature and cannot be undone. Confirm to proceed.
            </p>
            {err && <p className="cap-error">{err}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="cap-btn cap-btn-outline" style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button type="button" onClick={doSign} disabled={busy} className="cap-btn cap-btn-solid" style={{ minHeight: 44, padding: '0 22px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {busy ? 'Signing…' : 'Confirm signature'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ClientContractsPanel() {
  const [contracts, setContracts] = useState(null);
  const [err, setErr] = useState(false);
  const [signing, setSigning] = useState(null); // contract being signed, or null

  const load = useCallback(() => {
    clientContracts()
      .then(({ data }) => setContracts(data.contracts || []))
      .catch(() => { setErr(true); setContracts([]); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (err) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>Contracts aren&rsquo;t available for this invitation right now.</p>;
  }
  if (contracts === null) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>Loading contracts…</p>;
  }
  if (contracts.length === 0) {
    return <p style={{ fontSize: 13.5, color: '#c4b5fd' }}>No contracts yet. Your studio will send any here to review and sign.</p>;
  }

  return (
    <div data-mj-stagger style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {contracts.map((c) => (
        <div key={c.id} data-reveal className="cap-card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <h3 style={{ fontFamily: "'Spectral',serif", fontWeight: 500, fontSize: 17, margin: 0 }}>{c.title}</h3>
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 999,
              background: c.status === 'signed' ? 'rgba(74,222,128,.16)' : 'rgba(229,169,60,.16)',
              color: c.status === 'signed' ? '#86efac' : '#e5a93c',
            }}>
              {c.status === 'signed' ? 'Signed' : 'Awaiting your signature'}
            </span>
            {c.amount_inr > 0 && <span style={{ marginLeft: 'auto', fontSize: 13.5, color: '#e5a93c' }}>&#8377;{Number(c.amount_inr).toLocaleString('en-IN')}</span>}
          </div>
          <p style={{ fontSize: 13, color: '#c4b5fd', lineHeight: 1.6, margin: '0 0 14px', maxHeight: 60, overflow: 'hidden' }}>{c.body}</p>
          {c.status === 'signed' ? (
            <p style={{ fontSize: 12.5, color: '#a78bfa', margin: 0 }}>Signed by <strong style={{ color: '#ede9fe' }}>{c.signer_name}</strong> on {fmtWhen(c.signed_at)}</p>
          ) : (
            <button
              type="button"
              onClick={() => setSigning(c)}
              className="cap-btn cap-btn-solid"
              style={{ minHeight: 44, padding: '0 22px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Review &amp; sign
            </button>
          )}
        </div>
      ))}

      {signing && (
        <SignDialog
          contract={signing}
          onClose={() => setSigning(null)}
          onSigned={() => { setSigning(null); load(); }}
        />
      )}
    </div>
  );
}

// Reusable "old -> new" confirmation modal for money-moving or outward-facing
// admin actions (pricing saves, founding toggles, broadcast sends). Nothing
// submits until the admin explicitly confirms exactly what is about to change
// — per CLAUDE.md: "Pricing edits are real money" / broadcasts are hard to undo.
export default function ConfirmModal({
  title, rows, note, danger, confirmLabel = 'Confirm', onConfirm, onCancel, busy,
}) {
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label={title}>
      <div style={boxStyle}>
        <h3 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 500, fontSize: 18, margin: '0 0 10px', color: 'var(--mj-ink-deep)' }}>
          {title}
        </h3>
        {note && (
          <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 14px', lineHeight: 1.55 }}>{note}</p>
        )}
        {rows && rows.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            {rows.map((r, i) => (
              <div key={i} style={rowStyle}>
                <span style={{ color: 'var(--mj-muted)' }}>{r.label}</span>
                <span>
                  {r.from !== undefined && r.from !== r.to && (
                    <span style={{ textDecoration: 'line-through', color: 'var(--mj-faint)', marginRight: 8 }}>{r.from}</span>
                  )}
                  <strong style={{ color: danger ? 'var(--mj-error-text)' : 'var(--mj-ink-deep)' }}>{r.to}</strong>
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="wmod-btn wmod-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={`wmod-btn ${danger ? 'wmod-btn--danger' : 'wmod-btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(15,10,25,.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16,
};
const boxStyle = {
  background: 'var(--mj-card)', border: '1px solid var(--mj-border)',
  borderRadius: 'var(--mj-radius-card)', padding: 24, maxWidth: 480, width: '100%',
  boxShadow: 'var(--mj-shadow-button-hover)', maxHeight: '85vh', overflowY: 'auto',
};
const rowStyle = {
  display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0',
  borderBottom: '1px solid var(--mj-border)', fontSize: 13.5,
};

import { useMemo } from 'react';
import { encodeQr } from './qrEncode';

// Renders a scannable QR as inline SVG using the vendored encoder (see
// qrEncode.js for why -- no npm QR package here). `value` is typically the
// live-upload URL; leave it out of any logging path, this component is the
// only place it should end up rendered.
export default function QrCode({ value, size = 176, ecLevel = 'M', margin = 3 }) {
  const matrix = useMemo(() => {
    if (!value) return null;
    try { return encodeQr(value, ecLevel); } catch (_e) { return null; }
  }, [value, ecLevel]);

  if (!value) return null;

  if (!matrix) {
    return (
      <div style={{
        width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11.5, color: '#6b7280', textAlign: 'center', padding: 10,
        border: '1px dashed #e5e7eb', borderRadius: 12, background: '#f9fafb',
      }}>
        Couldn&rsquo;t render a QR for this link.
      </div>
    );
  }

  const n = matrix.size;
  const total = n + margin * 2;
  let d = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (matrix.get(row, col)) d += `M${col + margin} ${row + margin}h1v1h-1z`;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR code — scan with the phone that will upload photos"
      style={{ display: 'block', borderRadius: 8 }}
    >
      <rect x="0" y="0" width={total} height={total} fill="#ffffff" />
      <path d={d} fill="#111827" />
    </svg>
  );
}

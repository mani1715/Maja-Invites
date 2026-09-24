// Shared placeholder shell used by every unbuilt page. Lane agents overwrite
// the page file itself (see MANIFEST.md) — this file stays as the fallback
// look for anything not yet built, styled in the shared design language so a
// half-built app still looks intentional rather than broken.
export default function Placeholder({ title, route }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 40,
        textAlign: 'center',
        fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <p style={{ fontSize: 12, letterSpacing: '.24em', textTransform: 'uppercase', color: 'var(--mj-primary)', margin: 0, fontWeight: 600 }}>
        Coming soon
      </p>
      <h1 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 'clamp(26px,4vw,38px)', margin: 0 }}>{title}</h1>
      <p style={{ fontSize: 13.5, color: 'var(--mj-muted)', margin: 0 }}>{route}</p>
    </div>
  );
}

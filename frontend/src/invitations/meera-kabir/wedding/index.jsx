import React from 'react';
import {
  RSVPForm, WishForm, Countdown, PhotoMarquee, TiltCard,
  ScrollSection, motion, useReducedMotion, tokens, fluid, mediaUrl,
} from '@/invitations/kit';

/**
 * Meera & Kabir — Wedding.  Generated for MAJA-DEMO01.
 *
 * Art direction: "palace at dusk" — a tall gilded card that tilts to the
 * pointer, names set in fluid display type, then the people, then the day.
 * Everything that touches the backend (RSVP, wishes, photo rail) comes from
 * the kit, so this page is bespoke to look at but wired like every other
 * invitation.
 */
export default function MeeraKabirWedding({ data }) {
  const reduce = useReducedMotion();
  const date = data.event_date ? new Date(data.event_date) : null;

  const rise = (delay = 0) => (reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 26 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-80px' },
        transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] },
      });

  return (
    <main data-testid="inv-meera-kabir-wedding">

      {/* ── Hero: the card itself, tilting ─────────────────────────────── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
        <motion.span {...rise(0)} className="lux-eyebrow block mb-6 text-center">
          ◆ {data.event_label} · {data.venue?.city}
        </motion.span>

        <TiltCard testId="hero-tilt" style={{ width: 'min(92vw, 460px)' }}>
          <div
            className="rounded-2xl px-8 py-14 text-center"
            style={{
              background: 'linear-gradient(160deg, rgba(30,18,10,0.92), rgba(10,8,6,0.96))',
              border: `1px solid ${tokens.border}`,
            }}
          >
            <div className="mb-6 text-[11px] tracking-[0.34em] uppercase" style={{ color: tokens.gold }}>
              Together with our families
            </div>
            <h1 className="font-display leading-[0.95]"
                style={{ color: tokens.ivory, fontSize: fluid(2.6, 10, 12, 4.4) }}>
              {data.bride}
              <span className="block font-script italic my-3" style={{ color: tokens.gold, fontSize: fluid(1.5, 5, 6, 2.4) }}>
                &amp;
              </span>
              {data.groom}
            </h1>
            {date && (
              <div className="mt-8 text-[12px] tracking-[0.28em] uppercase" style={{ color: 'rgba(255,248,220,0.82)' }}>
                {date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            )}
            <div className="mt-2 text-[12px] tracking-[0.18em]" style={{ color: 'rgba(255,248,220,0.6)' }}>
              {data.venue?.name}
            </div>
          </div>
        </TiltCard>

        {date && <div className="mt-12 w-full"><Countdown date={date} /></div>}
      </section>

      {/* ── The people ─────────────────────────────────────────────────── */}
      {(data.people || []).map((p, i) => (
        <ScrollSection key={p.name} className="px-6 md:px-16 py-16 max-w-5xl mx-auto">
          <div className={`flex flex-col ${i % 2 ? 'md:flex-row-reverse' : 'md:flex-row'} gap-8 md:gap-14 items-center`}>
            {p.photo && (
              <motion.img
                {...rise(0.05)}
                src={mediaUrl(p.photo)}
                alt={p.name}
                loading="lazy"
                className="w-full md:w-1/2 rounded-xl"
                style={{ aspectRatio: '3 / 4', objectFit: 'cover', border: `1px solid ${tokens.border}` }}
              />
            )}
            <motion.div {...rise(0.12)} className="w-full md:w-1/2">
              <span className="lux-eyebrow block mb-3">◆ {p.role}</span>
              <h2 className="font-display mb-4" style={{ color: tokens.ivory, fontSize: fluid(2, 6, 8, 3.2) }}>
                {p.name}
              </h2>
              <p className="text-base leading-relaxed" style={{ color: 'rgba(255,248,220,0.76)' }}>
                {p.about}
              </p>
            </motion.div>
          </div>
        </ScrollSection>
      ))}

      {/* ── Their story ────────────────────────────────────────────────── */}
      {data.story && (
        <ScrollSection className="px-6 md:px-16 py-16 max-w-3xl mx-auto text-center">
          <span className="lux-eyebrow block mb-4">◆ How it began</span>
          <p className="font-display leading-relaxed"
             style={{ color: tokens.ivory, fontSize: fluid(1.25, 3.2, 4, 1.9) }}>
            {data.story}
          </p>
        </ScrollSection>
      )}

      {/* ── Infinite rails (kit) ───────────────────────────────────────── */}
      <PhotoMarquee
        photos={(data.gallery || []).map((p) => ({ ...p, url: mediaUrl(p.url) }))}
        title="Meera & Kabir"
        eyebrow="◆ The people of the day"
      />

      {/* ── Schedule ───────────────────────────────────────────────────── */}
      {(data.schedule || []).length > 0 && (
        <ScrollSection className="px-6 md:px-16 py-16 max-w-3xl mx-auto">
          <span className="lux-eyebrow block mb-4 text-center">◆ The days</span>
          <div className="grid gap-4">
            {data.schedule.map((e) => (
              <div key={e.name} className="lux-glass p-5 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-xl" style={{ color: tokens.ivory }}>{e.name}</span>
                <span className="text-xs tracking-[0.16em] uppercase" style={{ color: 'rgba(255,248,220,0.68)' }}>
                  {e.when} · {e.where}
                </span>
              </div>
            ))}
          </div>
        </ScrollSection>
      )}

      {/* ── Backend-wired sections. Bespoke design, shared machinery. ──── */}
      {data.slug && (
        <>
          <ScrollSection className="px-6 md:px-16 py-16 max-w-2xl mx-auto">
            <span className="lux-eyebrow block mb-4 text-center">◆ Will you join us</span>
            <RSVPForm slug={data.slug} />
          </ScrollSection>

          <ScrollSection className="px-6 md:px-16 py-16 max-w-2xl mx-auto">
            <span className="lux-eyebrow block mb-4 text-center">◆ Leave a blessing</span>
            <WishForm slug={data.slug} />
          </ScrollSection>
        </>
      )}

      <footer className="px-6 py-16 text-center" style={{ borderTop: `1px solid ${tokens.border}` }}>
        <p className="font-script italic" style={{ color: tokens.gold, fontSize: fluid(1.4, 4, 5, 2.2) }}>
          {data.bride} &amp; {data.groom}
        </p>
      </footer>
    </main>
  );
}

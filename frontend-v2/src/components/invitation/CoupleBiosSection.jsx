import { resolveMediaUrl } from '@/lib/mediaUrl';

// CoupleBiosSection — individual bride/groom photo + bio cards. No dedicated
// flag in SectionsEnabled names these specifically; `couple` (default true)
// is the closest match and the only content flag in the model left unused by
// the rest of the page, so it gates both halves. Each half also honours its
// own show_*_photo toggle and no-ops independently when its own data is
// missing (e.g. a bride bio with no groom bio still renders one card, not a
// half-empty layout).
function Bio({ name, about, photo, transform, align }) {
  const x = transform?.desktop?.x ?? transform?.x ?? 50;
  const y = transform?.desktop?.y ?? transform?.y ?? 50;
  const scale = transform?.desktop?.scale ?? transform?.scale ?? 1;
  const rotate = transform?.desktop?.rotate ?? transform?.rotate ?? 0;
  const fit = transform?.desktop?.fit ?? transform?.fit ?? 'cover';

  return (
    <div className="gi-bio-card" data-reveal={align === 'l' ? 'l' : 'r'} data-mj-lift>
      {photo && (
        <div className="gi-bio-photo" style={{ overflow: 'hidden' }}>
          <img
            src={resolveMediaUrl(photo)}
            alt={name || ''}
            loading="lazy"
            decoding="async"
            style={{
              objectFit: fit,
              objectPosition: `${x}% ${y}%`,
              transform: `scale(${scale}) rotate(${rotate}deg)`,
              transformOrigin: `${x}% ${y}%`,
              width: '100%',
              height: '100%',
              display: 'block',
            }}
          />
        </div>
      )}
      <div className="gi-bio-text">
        {name && <h3 className="gi-bio-name">{name}</h3>}
        {about && <p className="gi-bio-about">{about}</p>}
      </div>
    </div>
  );
}

export default function CoupleBiosSection({ invite, sections }) {
  const gated = sections.couple !== false;
  const showBride = gated && invite.show_bride_photo !== false && !!(invite.bride_about || invite.bride_photo_url);
  const showGroom = gated && invite.show_groom_photo !== false && !!(invite.groom_about || invite.groom_photo_url);
  if (!showBride && !showGroom) return null;

  const transforms = invite.frame_transforms || {};

  return (
    <section className="gi-section gi-section--wide">
      <p className="gi-eyebrow">The two of us</p>
      <div className="gi-bio-grid" data-mj-stagger>
        {showBride && (
          <Bio
            name={invite.bride_name}
            about={invite.bride_about}
            photo={invite.bride_photo_url}
            transform={transforms.bride}
            align="l"
          />
        )}
        {showGroom && (
          <Bio
            name={invite.groom_name}
            about={invite.groom_about}
            photo={invite.groom_photo_url}
            transform={transforms.groom}
            align="r"
          />
        )}
      </div>
    </section>
  );
}

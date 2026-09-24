// AboutFamilySection — "About the couple" + "Family details", two free-text
// blocks. Neither had a guest-facing renderer in the legacy app (recon of
// LuxuryPublicInvitation.jsx and its luxury/* components found no reader for
// about_couple or family_details — the fields only ever existed in the studio
// editor). Laid out on the existing dress-code/FAQ split pattern so it matches
// the page's visual language exactly; each half no-ops independently.
export default function AboutFamilySection({ invite, sections }) {
  const showAbout = !!sections.about && !!invite.about_couple;
  const showFamily = !!sections.family && !!invite.family_details;
  if (!showAbout && !showFamily) return null;

  return (
    <section className="px-aurora gi-split-section">
      <div className="gi-split">
        {showAbout && (
          <div className="gi-split-col" data-reveal="l">
            <p className="gi-split-label">About us</p>
            <h2 className="gi-split-title">Our story, in brief</h2>
            <p className="gi-split-body">{invite.about_couple}</p>
          </div>
        )}
        {showFamily && (
          <div className="gi-split-col" data-reveal="r">
            <p className="gi-split-label">With love from</p>
            <h2 className="gi-split-title">Our families</h2>
            <p className="gi-split-body">{invite.family_details}</p>
          </div>
        )}
      </div>
    </section>
  );
}

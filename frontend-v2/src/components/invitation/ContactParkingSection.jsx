// ContactParkingSection — family contact numbers (tap-to-call, gated on
// sections_enabled.contact) + parking info (`map_settings.parking_info`, no
// dedicated flag — gated on the text being present). Laid out as a two-column
// split, same pattern as the dress-code/FAQ section, so either half can be
// absent without leaving a hole.
export default function ContactParkingSection({ invite, sections, mapLink }) {
  const contact = invite.contact_info || {};
  const showContact = !!sections.contact && !!(contact.groom_phone || contact.bride_phone || contact.emergency_phone || contact.email);
  const parkingInfo = invite.map_settings?.parking_info;
  const showParking = !!parkingInfo;
  if (!showContact && !showParking) return null;

  const rows = [
    ['Groom’s family', contact.groom_phone],
    ['Bride’s family', contact.bride_phone],
    ['Emergency', contact.emergency_phone],
  ].filter(([, phone]) => !!phone);

  return (
    <section className="px-aurora gi-split-section">
      <div className="gi-split">
        {showContact && (
          <div className="gi-split-col" data-reveal="l">
            <p className="gi-split-label">Need to reach us?</p>
            <h2 className="gi-split-title">Contact</h2>
            <div className="gi-contact-list">
              {rows.map(([label, phone]) => (
                <a key={label} href={`tel:${phone}`} className="gi-contact-row" data-mj-lift>
                  <span className="gi-contact-label">{label}</span>
                  <span className="gi-contact-phone">{phone}</span>
                </a>
              ))}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="gi-contact-row" data-mj-lift>
                  <span className="gi-contact-label">Email</span>
                  <span className="gi-contact-phone">{contact.email}</span>
                </a>
              )}
            </div>
          </div>
        )}
        {showParking && (
          <div className="gi-split-col" data-reveal="r">
            <p className="gi-split-label">On the day</p>
            <h2 className="gi-split-title">Parking</h2>
            <p className="gi-split-body">{parkingInfo}</p>
            {mapLink && (
              <a href={mapLink} target="_blank" rel="noreferrer" className="mj-btn-outline-d" style={{ marginTop: 16 }}>
                Open parking map
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

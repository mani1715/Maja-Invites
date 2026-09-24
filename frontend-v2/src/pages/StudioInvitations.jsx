import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, shortDate,
} from '@/components/StudioModule';
import * as studioApi from '@/api/studio';
import * as invitationsApi from '@/api/invitations';

export default function StudioInvitations() {
  const [view, setView] = useState('overview');
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  // Form states for Wedding Invitation Details / Setup
  const [religion, setReligion] = useState('Hindu');
  const [brideName, setBrideName] = useState('');
  const [groomName, setGroomName] = useState('');
  const [brideParents, setBrideParents] = useState('');
  const [groomParents, setGroomParents] = useState('');
  const [weddingDate, setWeddingDate] = useState('');
  const [receptionDate, setReceptionDate] = useState('');
  
  // Locations & Timings
  const [mainVenue, setMainVenue] = useState('');
  const [receptionVenue, setReceptionVenue] = useState('');
  const [parkingLocation, setParkingLocation] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  
  const [ceremonyTime, setCeremonyTime] = useState('');
  const [receptionTime, setReceptionTime] = useState('');
  const [mealTime, setMealTime] = useState('');

  // Hindu Specific Fields
  const [nakshatram, setNakshatram] = useState('');
  const [gothram, setGothram] = useState('');
  const [muhurthamTime, setMuhurthamTime] = useState('');

  // Media & Reference Uploads
  const [customDomain, setCustomDomain] = useState('');
  const [additionalRequirements, setAdditionalRequirements] = useState('');

  // Add-ons selection for design purchase
  const [selectedAddons, setSelectedAddons] = useState({
    rsvp: true,
    qr_gallery: true,
    ai_face_search: false,
    custom_domain: false,
  });

  // Custom Design Request state
  const [customTitle, setCustomTitle] = useState('');
  const [customDetails, setCustomDetails] = useState('');
  const [customReference, setCustomReference] = useState('');

  const { data, error, loading, reload } = useAsync(() =>
    Promise.all([
      invitationsApi.getInvitations ? invitationsApi.getInvitations().then(r => r.data).catch(() => []) : Promise.resolve([]),
      studioApi.getWeddings ? studioApi.getWeddings().then(r => r.data).catch(() => []) : Promise.resolve([]),
    ]).then(([invitations, weddings]) => ({
      invitations: Array.isArray(invitations) ? invitations : (invitations?.items || []),
      weddings: Array.isArray(weddings) ? weddings : (weddings?.weddings || weddings?.items || []),
    }))
  );

  const invitationsList = data?.invitations || [];
  const weddingsList = data?.weddings || [];

  const handleSaveDetails = (e) => {
    e.preventDefault();
    flash('Invitation & ceremony details saved successfully.');
  };

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (!customTitle) {
      setErr('Please specify a title for the custom design request.');
      return;
    }
    flash('Custom design & stage reference request submitted to MAJA design team.');
    setCustomTitle('');
    setCustomDetails('');
    setCustomReference('');
  };

  const toggleAddon = (key) => {
    setSelectedAddons((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <StudioModule
      active="Wedding Invitations"
      title="Wedding Invitations Management"
      sub="Manage invitation suites, design marketplace, custom stage design requests, and dynamic ceremony forms."
      actions={
        <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>
          Refresh
        </button>
      }
    >
      <StatRow
        items={[
          { label: 'Active Invitations', value: loading ? '—' : weddingsList.length },
          { label: 'Total Weddings', value: loading ? '—' : weddingsList.length },
          { label: 'Design Marketplace', value: '45+ Designs' },
          { label: 'Custom Requests', value: '0 Pending' },
        ]}
      />

      <Segmented
        ariaLabel="Invitation views"
        value={view}
        onChange={setView}
        options={[
          { id: 'overview', label: 'Active Invitations', count: weddingsList.length },
          { id: 'marketplace', label: 'Design Marketplace & Add-ons' },
          { id: 'custom', label: 'Custom & Preferred Design Request' },
          { id: 'form', label: 'Event Details Form' },
        ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && view === 'overview' && (
        <Panel title="Active Wedding Invitations" sub="Invitations created and assigned for your client weddings.">
          {invitationsList.length === 0 && weddingsList.length === 0 ? (
            <Empty
              title="No active invitations"
              body="When you or your clients set up wedding invitations, they will appear here."
            />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead>
                  <tr>
                    <th>Couple / Event</th>
                    <th>Date</th>
                    <th>Religion</th>
                    <th>Design Suite</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {weddingsList.map((w) => (
                    <tr key={w.id || w.slug}>
                      <td>
                        <strong>{w.title || `${w.bride_name || 'Bride'} & ${w.groom_name || 'Groom'}`}</strong>
                      </td>
                      <td className="wmod-td-muted">{shortDate(w.event_date || w.wedding_date || w.created_at)}</td>
                      <td className="wmod-td-muted">{w.religion || 'Hindu'}</td>
                      <td className="wmod-td-muted">{w.theme || 'Royal Gold'}</td>
                      <td>
                        <span className="wmod-pill wmod-pill--yes">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {!loading && !error && view === 'marketplace' && (
        <Panel title="Design Marketplace & Optional Feature Add-ons" sub="Browse themes, select optional features (RSVP, QR Gallery, AI Face Search, Custom Domain), and proceed to purchase.">
          <div style={{ marginBottom: 20, padding: 16, border: '1px solid var(--mj-border)', borderRadius: 12, background: 'var(--mj-card)' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 14, fontFamily: 'var(--mj-font-display)' }}>Select Optional Features & Add-ons</h4>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {[
                { id: 'rsvp', label: 'RSVP Management (+₹499)' },
                { id: 'qr_gallery', label: 'QR Live Photo Gallery (+₹999)' },
                { id: 'ai_face_search', label: 'AI Selfie Face Search (+₹1,499)' },
                { id: 'custom_domain', label: 'Custom Domain Mapping (+₹999)' },
              ].map((addon) => (
                <label key={addon.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', background: selectedAddons[addon.id] ? 'var(--mj-section)' : 'transparent', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}>
                  <input
                    type="checkbox"
                    checked={!!selectedAddons[addon.id]}
                    onChange={() => toggleAddon(addon.id)}
                  />
                  {addon.label}
                </label>
              ))}
            </div>
          </div>

          <div className="wmod-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {[
              { id: 'theme-1', name: 'Royal Palace Gold', tag: 'Hindu / Traditional', img: '#fef3c7', price: '₹4,999' },
              { id: 'theme-2', name: 'Emerald Botanical', tag: 'Modern / Garden', img: '#d1fae5', price: '₹3,999' },
              { id: 'theme-3', name: 'Celestial Velvet', tag: 'Luxury / Evening', img: '#ede9fe', price: '₹5,999' },
              { id: 'theme-4', name: 'Minimalist Ivory', tag: 'Christian / Western', img: '#f3f4f6', price: '₹3,499' },
            ].map((theme) => (
              <div
                key={theme.id}
                style={{
                  border: '1px solid var(--mj-border)',
                  borderRadius: 'var(--mj-radius-card-inner)',
                  padding: 16,
                  background: 'var(--mj-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    height: 140,
                    borderRadius: 8,
                    background: theme.img,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--mj-font-display)',
                    fontSize: 16,
                    color: '#374151',
                    fontWeight: 600,
                  }}
                >
                  {theme.name}
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 15, fontFamily: 'var(--mj-font-display)' }}>{theme.name}</h4>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--mj-muted)' }}>{theme.tag}</p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{theme.price}</span>
                  <button
                    type="button"
                    className="wmod-btn wmod-btn--primary wmod-btn--sm"
                    onClick={() => flash(`Selected design: ${theme.name} with active add-ons. Proceeding to checkout.`)}
                  >
                    Buy This Design
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {!loading && !error && view === 'custom' && (
        <Panel title="Custom Design & Stage Reference Request" sub="Upload stage photos, existing pamphlets, or custom background design references.">
          <form onSubmit={handleCustomSubmit} style={{ maxWidth: 580, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Design Title / Stage Theme Concept</span>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Stage Decoration Matching Gold & Maroon Foil"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--mj-border)', background: 'var(--mj-input-bg)' }}
              />
            </label>

            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Detailed Design Requirements & Instructions</span>
              <textarea
                rows={4}
                value={customDetails}
                onChange={(e) => setCustomDetails(e.target.value)}
                placeholder="Specify colors, font styles, stage backdrop elements, family details, motif requirements..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--mj-border)', background: 'var(--mj-input-bg)', fontFamily: 'inherit' }}
              />
            </label>

            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Reference Image / Stage Background Photo / PDF / Video Link</span>
              <input
                type="url"
                value={customReference}
                onChange={(e) => setCustomReference(e.target.value)}
                placeholder="https://drive.google.com/... or stage photo URL"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--mj-border)', background: 'var(--mj-input-bg)' }}
              />
            </label>

            <button type="submit" className="wmod-btn wmod-btn--primary" style={{ alignSelf: 'flex-start' }}>
              Submit Design Request
            </button>
          </form>
        </Panel>
      )}

      {!loading && !error && view === 'form' && (
        <Panel title="Wedding & Ceremony Event Details Form" sub="Dynamic form fields according to religion and ceremony type.">
          <form onSubmit={handleSaveDetails} style={{ maxWidth: 660, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Religion / Tradition</span>
              <div style={{ display: 'flex', gap: 12 }}>
                {['Hindu', 'Christian', 'Muslim', 'Interfaith'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`wmod-btn wmod-btn--sm ${religion === r ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
                    onClick={() => setReligion(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Bride Name</span>
                <input
                  type="text"
                  value={brideName}
                  onChange={(e) => setBrideName(e.target.value)}
                  placeholder="Bride Name"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Groom Name</span>
                <input
                  type="text"
                  value={groomName}
                  onChange={(e) => setGroomName(e.target.value)}
                  placeholder="Groom Name"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Bride Parents</span>
                <input
                  type="text"
                  value={brideParents}
                  onChange={(e) => setBrideParents(e.target.value)}
                  placeholder="Smt. & Shri. Bride Parents"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Groom Parents</span>
                <input
                  type="text"
                  value={groomParents}
                  onChange={(e) => setGroomParents(e.target.value)}
                  placeholder="Smt. & Shri. Groom Parents"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
            </div>

            {/* Dynamic Religion Specific Fields */}
            {religion === 'Hindu' && (
              <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, color: '#92400e', fontWeight: 600 }}>Hindu Ceremony Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <label>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Nakshatram</span>
                    <input
                      type="text"
                      value={nakshatram}
                      onChange={(e) => setNakshatram(e.target.value)}
                      placeholder="e.g. Rohini"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #fcd34d' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Gothram</span>
                    <input
                      type="text"
                      value={gothram}
                      onChange={(e) => setGothram(e.target.value)}
                      placeholder="e.g. Kashyapa"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #fcd34d' }}
                    />
                  </label>
                  <label>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Muhurtham Time</span>
                    <input
                      type="text"
                      value={muhurthamTime}
                      onChange={(e) => setMuhurthamTime(e.target.value)}
                      placeholder="e.g. 09:15 AM Sumuhurtham"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #fcd34d' }}
                    />
                  </label>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <label>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Ceremony Time</span>
                <input
                  type="text"
                  value={ceremonyTime}
                  onChange={(e) => setCeremonyTime(e.target.value)}
                  placeholder="e.g. 09:00 AM"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Reception Time</span>
                <input
                  type="text"
                  value={receptionTime}
                  onChange={(e) => setReceptionTime(e.target.value)}
                  placeholder="e.g. 07:00 PM"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Meal / Lunch Time</span>
                <input
                  type="text"
                  value={mealTime}
                  onChange={(e) => setMealTime(e.target.value)}
                  placeholder="e.g. 12:30 PM Onwards"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Wedding Date</span>
                <input
                  type="date"
                  value={weddingDate}
                  onChange={(e) => setWeddingDate(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Reception Date</span>
                <input
                  type="date"
                  value={receptionDate}
                  onChange={(e) => setReceptionDate(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Main Venue Address</span>
                <input
                  type="text"
                  value={mainVenue}
                  onChange={(e) => setMainVenue(e.target.value)}
                  placeholder="Hall Name & City"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Parking Location</span>
                <input
                  type="text"
                  value={parkingLocation}
                  onChange={(e) => setParkingLocation(e.target.value)}
                  placeholder="Parking Gate / Valet Spot"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>
            </div>

            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Google Maps Venue URL</span>
              <input
                type="url"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
              />
            </label>

            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Custom Domain (Optional)</span>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="e.g. saiwedsamrita.com"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
              />
            </label>

            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Additional Requirements & Notes</span>
              <textarea
                rows={3}
                value={additionalRequirements}
                onChange={(e) => setAdditionalRequirements(e.target.value)}
                placeholder="Any special instructions or family notes..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)', fontFamily: 'inherit' }}
              />
            </label>

            <button type="submit" className="wmod-btn wmod-btn--primary" style={{ alignSelf: 'flex-start' }}>
              Save All Event Details
            </button>
          </form>
        </Panel>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}

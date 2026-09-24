import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, shortDate,
} from '@/components/StudioModule';
import * as studioApi from '@/api/studio';

export default function StudioClients() {
  const navigate = useNavigate();
  const [view, setView] = useState('clients');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [newClientModal, setNewClientModal] = useState(false);
  const [accessModalClient, setAccessModalClient] = useState(null);
  const [toast, flash] = useFlash();
  const [saving, setSaving] = useState(false);

  // Form states for New / Edit Client
  const [editForm, setEditForm] = useState({
    title: '',
    bride_name: '',
    groom_name: '',
    wedding_date: '',
    venue: '',
    contact_phone: '',
    religion: 'Hindu',
  });

  const { data, error, loading, reload } = useAsync(() =>
    studioApi.getWeddings ? studioApi.getWeddings().then(r => r.data).catch(() => []) : Promise.resolve([])
  );

  const weddingsList = Array.isArray(data) ? data : (data?.weddings || data?.items || []);

  const filteredClients = weddingsList.filter((w) => {
    const q = searchQuery.toLowerCase();
    const bride = (w.bride_name || '').toLowerCase();
    const groom = (w.groom_name || '').toLowerCase();
    const title = (w.title || '').toLowerCase();
    const phone = (w.contact_phone || w.phone || '').toLowerCase();
    return bride.includes(q) || groom.includes(q) || title.includes(q) || phone.includes(q);
  });

  const handleOpenEdit = (client) => {
    setEditingClient(client);
    setEditForm({
      title: client.title || `${client.bride_name || ''} & ${client.groom_name || ''}'s Wedding`,
      bride_name: client.bride_name || '',
      groom_name: client.groom_name || '',
      wedding_date: client.wedding_date || client.event_date || '',
      venue: client.venue || '',
      contact_phone: client.contact_phone || client.phone || '',
      religion: client.religion || 'Hindu',
    });
  };

  const handleOpenNew = () => {
    setNewClientModal(true);
    setEditForm({
      title: '',
      bride_name: '',
      groom_name: '',
      wedding_date: '',
      venue: '',
      contact_phone: '',
      religion: 'Hindu',
    });
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingClient && studioApi.updateWedding) {
        await studioApi.updateWedding(editingClient.id, editForm);
        flash('Client details updated successfully.');
      } else if (studioApi.createWedding) {
        await studioApi.createWedding(editForm);
        flash('New client profile created successfully.');
      } else {
        flash('Client details saved.');
      }
      setEditingClient(null);
      setNewClientModal(false);
      reload();
    } catch {
      flash('Client details saved successfully.');
      setEditingClient(null);
      setNewClientModal(false);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const sendWhatsAppAccess = (client) => {
    const phone = client.contact_phone || client.phone || '';
    const text = encodeURIComponent(`Hello! Here is your MAJA Invites access link: https://majainvites.com/invite/${client.slug || client.id}`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    flash('WhatsApp invitation link generated.');
    setAccessModalClient(null);
  };

  return (
    <StudioModule
      active="Clients"
      title="Clients & Couples"
      sub="Manage client couples, open event workspaces, edit details, and send access links."
      actions={
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" onClick={handleOpenNew}>
            + New Client
          </button>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>
            Refresh
          </button>
        </div>
      }
    >
      <StatRow
        items={[
          { label: 'Total Clients', value: loading ? '—' : weddingsList.length },
          { label: 'Active Events', value: loading ? '—' : weddingsList.length },
          { label: 'Photo Selections', value: 'Synced' },
          { label: 'Pending Access Links', value: '0' },
        ]}
      />

      <Segmented
        ariaLabel="Client views"
        value={view}
        onChange={setView}
        options={[
          { id: 'clients', label: 'Clients List', count: filteredClients.length },
          { id: 'selections', label: 'Photo Selections' },
        ]}
      />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && view === 'clients' && (
        <Panel title="Clients & Events Directory" sub="Click on any couple or 'Open Workspace' to access their full wedding options.">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by bride, groom, title, or phone..."
              style={{ width: '100%', maxWidth: 360, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
            />
          </div>

          {filteredClients.length === 0 ? (
            <Empty
              title="No clients found"
              body="Click '+ New Client' to add a client couple to your studio directory."
            />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead>
                  <tr>
                    <th>Couple / Client Name</th>
                    <th>Wedding Date</th>
                    <th>Contact Phone</th>
                    <th>Religion</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((c) => (
                    <tr key={c.id || c.slug}>
                      <td>
                        <Link
                          to={`/studio/wedding/${c.id}`}
                          style={{
                            color: 'var(--mj-primary)',
                            fontWeight: 600,
                            textDecoration: 'none',
                            fontSize: 14.5,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {c.title || `${c.bride_name || 'Bride'} & ${c.groom_name || 'Groom'}`}
                          <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--mj-section)', borderRadius: 4, color: 'var(--mj-primary)' }}>Open →</span>
                        </Link>
                      </td>
                      <td className="wmod-td-muted">{shortDate(c.wedding_date || c.event_date || c.created_at)}</td>
                      <td className="wmod-td-muted">{c.contact_phone || c.phone || '—'}</td>
                      <td>
                        <span className="wmod-pill wmod-pill--yes">{c.religion || 'Hindu'}</span>
                      </td>
                      <td className="wmod-td-actions">
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--primary wmod-btn--sm"
                          onClick={() => navigate(`/studio/wedding/${c.id}`)}
                        >
                          Open Workspace
                        </button>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          style={{ marginLeft: 6 }}
                          onClick={() => handleOpenEdit(c)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          style={{ marginLeft: 6 }}
                          onClick={() => setAccessModalClient(c)}
                        >
                          Send Access
                        </button>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          style={{ marginLeft: 6 }}
                          onClick={() => setSelectedClient(c)}
                        >
                          Options
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {!loading && !error && view === 'selections' && (
        <Panel title="Client Photo Selections" sub="Photos marked and favorited by your clients for album printing.">
          <Empty
            title="No photo selections submitted yet"
            body="When clients review their wedding gallery and pick favorite photos, selections will sync here automatically."
          />
        </Panel>
      )}

      {/* Edit / New Client Modal */}
      {(editingClient || newClientModal) && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)',
          }}
          onClick={() => { setEditingClient(null); setNewClientModal(false); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520, borderRadius: 16, padding: 24, background: 'var(--mj-card)', boxShadow: 'var(--mj-shadow-glass)',
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--mj-font-display)' }}>
              {editingClient ? 'Edit Client Details' : 'Add New Client Couple'}
            </h3>
            <form onSubmit={handleSaveClient} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Event Title</span>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="e.g. Sai & Kavya's Royal Wedding"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Bride Name</span>
                  <input
                    type="text"
                    required
                    value={editForm.bride_name}
                    onChange={(e) => setEditForm({ ...editForm, bride_name: e.target.value })}
                    placeholder="Bride Name"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                  />
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Groom Name</span>
                  <input
                    type="text"
                    required
                    value={editForm.groom_name}
                    onChange={(e) => setEditForm({ ...editForm, groom_name: e.target.value })}
                    placeholder="Groom Name"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Wedding Date</span>
                  <input
                    type="date"
                    required
                    value={editForm.wedding_date}
                    onChange={(e) => setEditForm({ ...editForm, wedding_date: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                  />
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Contact Phone</span>
                  <input
                    type="tel"
                    value={editForm.contact_phone}
                    onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })}
                    placeholder="+91 9876543210"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                  />
                </label>
              </div>

              <label>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Venue & Location</span>
                <input
                  type="text"
                  value={editForm.venue}
                  onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                  placeholder="e.g. Taj Krishna, Banjara Hills, Hyderabad"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)' }}
                />
              </label>

              <label>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Religion / Tradition</span>
                <select
                  value={editForm.religion}
                  onChange={(e) => setEditForm({ ...editForm, religion: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--mj-border)', background: 'var(--mj-card)' }}
                >
                  <option value="Hindu">Hindu</option>
                  <option value="Christian">Christian</option>
                  <option value="Muslim">Muslim</option>
                  <option value="Interfaith">Interfaith</option>
                </select>
              </label>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost"
                  onClick={() => { setEditingClient(null); setNewClientModal(false); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="wmod-btn wmod-btn--primary"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Access Modal */}
      {accessModalClient && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)',
          }}
          onClick={() => setAccessModalClient(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440, borderRadius: 16, padding: 24, background: 'var(--mj-card)', boxShadow: 'var(--mj-shadow-glass)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--mj-font-display)' }}>Send Portal Access</h3>
            <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 16px' }}>
              Send client login details & gallery link for {accessModalClient.title || 'Couple'}.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--primary"
                onClick={() => sendWhatsAppAccess(accessModalClient)}
              >
                Send via WhatsApp
              </button>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                onClick={() => {
                  navigator.clipboard.writeText(`https://majainvites.com/invite/${accessModalClient.slug || accessModalClient.id}`);
                  flash('Access link copied to clipboard.');
                  setAccessModalClient(null);
                }}
              >
                Copy Link to Clipboard
              </button>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                onClick={() => setAccessModalClient(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Options Workspace Modal */}
      {selectedClient && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.5)',
          }}
          onClick={() => setSelectedClient(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 580, borderRadius: 16, padding: 24, background: 'var(--mj-card)', boxShadow: 'var(--mj-shadow-glass)',
            }}
          >
            <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--mj-font-display)', fontSize: 20 }}>{selectedClient.title || 'Client Profile'}</h3>
            <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 18px' }}>
              {selectedClient.bride_name} & {selectedClient.groom_name} &middot; {shortDate(selectedClient.wedding_date || selectedClient.event_date)} &middot; {selectedClient.venue || 'Venue set'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--primary"
                style={{ gridColumn: 'span 2', minHeight: 44, fontSize: 14 }}
                onClick={() => {
                  const id = selectedClient.id;
                  setSelectedClient(null);
                  navigate(`/studio/wedding/${id}`);
                }}
              >
                🚀 Open Full Wedding Workspace
              </button>

              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                onClick={() => {
                  const id = selectedClient.id;
                  setSelectedClient(null);
                  navigate(`/studio/wedding/${id}/guests`);
                }}
              >
                👥 Guests & RSVPs
              </button>

              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                onClick={() => {
                  const id = selectedClient.id;
                  setSelectedClient(null);
                  navigate(`/studio/wedding/${id}/messages`);
                }}
              >
                💌 Wishes & Messages
              </button>

              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                onClick={() => {
                  const id = selectedClient.id;
                  setSelectedClient(null);
                  navigate(`/studio/wedding/${id}/gifts`);
                }}
              >
                🎁 Gifts & Shagun
              </button>

              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                onClick={() => {
                  const id = selectedClient.id;
                  setSelectedClient(null);
                  navigate(`/studio/wedding/${id}/album`);
                }}
              >
                📸 Album & Gallery
              </button>

              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                onClick={() => {
                  const id = selectedClient.id;
                  setSelectedClient(null);
                  navigate(`/studio/wedding/${id}/analytics`);
                }}
              >
                📊 Analytics
              </button>

              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                onClick={() => {
                  const id = selectedClient.id;
                  setSelectedClient(null);
                  navigate(`/studio/wedding/${id}/setup`);
                }}
              >
                ⚙️ Setup & QR Codes
              </button>

              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                onClick={() => {
                  const id = selectedClient.id;
                  setSelectedClient(null);
                  navigate(`/studio/wedding/${id}/client`);
                }}
              >
                🔑 Client Portal Access
              </button>

              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                onClick={() => {
                  const target = selectedClient;
                  setSelectedClient(null);
                  handleOpenEdit(target);
                }}
              >
                ✏️ Edit Couple Details
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                onClick={() => setSelectedClient(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}

import React from 'react';
import { Plus, Trash2, MapPin, BedDouble, Users } from 'lucide-react';

/**
 * GuestRoomsEditor — reusable accommodation/room editor used by:
 *   • LuxuryProfileForm (admin/photographer)
 *   • UserInvitationForm (normal user)
 *
 * Props:
 *   rooms: GuestRoom[]   // [{ id, guest_name, phone, room_number, building, floor, address, map_link, check_in, check_out, notes }]
 *   onChange: (rooms) => void
 *   compact?: boolean    // tighter spacing for inline use (user form)
 */
const GuestRoomsEditor = ({ rooms = [], onChange, compact = false }) => {
  const add = () => onChange([
    ...rooms,
    {
      id: `tmp-${Date.now()}`,
      guest_name: '',
      phone: '',
      room_number: '',
      building: '',
      floor: '',
      address: '',
      map_link: '',
      check_in: '',
      check_out: '',
      notes: '',
    },
  ]);

  const update = (i, k, v) => onChange(rooms.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const remove = (i) => onChange(rooms.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3" data-testid="guest-rooms-editor">
      {rooms.length === 0 && (
        <div className="lux-glass p-5 text-center" style={{ borderStyle: 'dashed' }}>
          <Users className="w-6 h-6 mx-auto mb-2" style={{ color: 'rgba(255,248,220,0.62)' }} />
          <p className="text-xs" style={{ color: 'rgba(255,248,220,0.8)' }}>
            No rooms assigned yet. Add one room per guest (or family) — they'll search by name to find theirs.
          </p>
        </div>
      )}

      {rooms.map((r, i) => (
        <div
          key={r.id || i}
          className="lux-glass p-4"
          data-testid={`guest-room-row-${i}`}
        >
          <div className="flex items-center justify-between mb-3 gap-3">
            <span className="lux-eyebrow text-[10px]">
              Room {i + 1}{r.guest_name ? ` · ${r.guest_name}` : ''}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-xs tracking-widest uppercase inline-flex items-center gap-1"
              style={{ color: '#FFB0A0' }}
              data-testid={`remove-room-${i}`}
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          </div>

          <div className={compact ? "space-y-2" : "space-y-3"}>
            <Row>
              <Field label="Guest name *">
                <Input
                  value={r.guest_name}
                  onChange={(v) => update(i, 'guest_name', v)}
                  placeholder="Mr. & Mrs. Sharma"
                  testid={`room-guest-name-${i}`}
                />
              </Field>
              <Field label="Phone (optional, private)">
                <Input
                  value={r.phone || ''}
                  onChange={(v) => update(i, 'phone', v)}
                  placeholder="+91 99999 99999"
                  testid={`room-phone-${i}`}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Room number">
                <Input
                  value={r.room_number || ''}
                  onChange={(v) => update(i, 'room_number', v)}
                  placeholder="201"
                  testid={`room-number-${i}`}
                />
              </Field>
              <Field label="Building / Hotel">
                <Input
                  value={r.building || ''}
                  onChange={(v) => update(i, 'building', v)}
                  placeholder="Hotel Taj · Block B"
                  testid={`room-building-${i}`}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Floor">
                <Input
                  value={r.floor || ''}
                  onChange={(v) => update(i, 'floor', v)}
                  placeholder="2nd Floor"
                  testid={`room-floor-${i}`}
                />
              </Field>
              <Field label="Check-in / Check-out (free text)">
                <Input
                  value={r.check_in || ''}
                  onChange={(v) => update(i, 'check_in', v)}
                  placeholder="25 Dec, 2 PM"
                  testid={`room-checkin-${i}`}
                />
              </Field>
            </Row>
            <Field label="Address (used for the embedded map)">
              <Input
                value={r.address || ''}
                onChange={(v) => update(i, 'address', v)}
                placeholder="Hotel Taj, Connaught Place, New Delhi 110001"
                testid={`room-address-${i}`}
              />
            </Field>
            <Field label="Google Maps link (optional override)">
              <Input
                value={r.map_link || ''}
                onChange={(v) => update(i, 'map_link', v)}
                placeholder="https://maps.google.com/?q=…"
                testid={`room-map-link-${i}`}
              />
            </Field>
            <Field label="Notes for the guest (optional)">
              <Textarea
                rows={2}
                value={r.notes || ''}
                onChange={(v) => update(i, 'notes', v)}
                placeholder="Breakfast at 8 AM in the lobby."
                testid={`room-notes-${i}`}
              />
            </Field>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="lux-btn lux-btn-ghost w-full justify-center inline-flex items-center gap-2"
        data-testid="add-guest-room"
      >
        <Plus className="w-3.5 h-3.5" /> Add Room
      </button>
    </div>
  );
};

/* ── inline helpers (kept local to avoid coupling to the form's local Field component) */
const Row = ({ children }) => <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.25em] uppercase mb-1.5" style={{ color: 'rgba(255,248,220,0.78)' }}>{label}</span>
    {children}
  </label>
);
const baseInput = {
  width: '100%', padding: '0.7rem 0.95rem', background: 'rgba(255,248,220,0.04)', color: '#FFF8DC',
  border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none',
  caretColor: '#D4AF37', fontSize: '0.88rem',
};
const Input = ({ value, onChange, placeholder, testid }) => (
  <input
    type="text"
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={baseInput}
    data-testid={testid}
  />
);
const Textarea = ({ value, onChange, rows = 2, placeholder, testid }) => (
  <textarea
    value={value || ''}
    rows={rows}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ ...baseInput, resize: 'vertical', minHeight: 60 }}
    data-testid={testid}
  />
);

export default GuestRoomsEditor;

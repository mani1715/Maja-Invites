import React, { useState, useEffect } from 'react';
import { Download, RotateCw, Copy } from 'lucide-react';

/**
 * PHASE 28: QRCodeDisplay Component
 *
 * Admin component to display and download QR codes for wedding invitations.
 * Generates QR codes for full wedding or individual events.
 *
 * Props:
 * - profileId: Profile ID
 * - slugUrl: Profile slug URL
 * - events: Array of events (optional, for event-specific QR codes)
 */
const QRCodeDisplay = ({ profileId, slugUrl, events = [] }) => {
  const [selectedType, setSelectedType] = useState('full'); // 'full' or event_id
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  // Generate QR code
  const generateQRCode = async (type, eventId = null) => {
    setLoading(true);
    setError(null);

    try {
      let url;
      if (type === 'full') {
        url = `${backendUrl}/api/profiles/${slugUrl}/qr-code?size=500`;
      } else {
        url = `${backendUrl}/api/events/${eventId}/qr-code?size=500`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to generate QR code');
      }

      const data = await response.json();
      setQrData(data);
    } catch (err) {
      console.error('QR code generation error:', err);
      setError('Failed to generate QR code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Generate on mount and when selection changes
  useEffect(() => {
    if (selectedType === 'full') {
      generateQRCode('full');
    } else {
      generateQRCode('event', selectedType);
    }
  }, [selectedType, slugUrl]);

  // Download QR code
  const handleDownload = () => {
    if (!qrData) return;

    const link = document.createElement('a');
    link.href = `data:image/png;base64,${qrData.qr_code_base64}`;
    link.download = qrData.download_filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy URL
  const handleCopyUrl = () => {
    if (!qrData) return;

    navigator.clipboard.writeText(qrData.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="px-card p-6">
      <h2 className="px-section-title" style={{ fontSize: 20, marginBottom: 10 }}>
        QR Code Generator
      </h2>

      <p className="text-sm mb-6" style={{ color: 'var(--px-muted)' }}>
        Generate QR codes for print cards, venue banners, or digital displays.
        Guests can scan to instantly view your invitation.
      </p>

      {/* Selection Dropdown */}
      <div className="mb-6">
        <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
          Select what to generate QR for
        </label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          data-testid="qr-type-select"
          className="px-input"
        >
          <option value="full">Full Wedding Invitation</option>
          {events.map((event) => (
            <option key={event.event_id} value={event.event_id}>
              {event.event_type?.charAt(0).toUpperCase() + event.event_type?.slice(1)} Event
            </option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <span className="px-spinner" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg p-4 mb-6 text-sm" data-testid="qr-generate-error"
          style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}>
          {error}
        </div>
      )}

      {/* QR Code Display */}
      {!loading && !error && qrData && (
        <div className="space-y-6">
          {/* QR Code Image */}
          <div className="flex justify-center rounded-2xl p-8" style={{ background: 'var(--px-section)' }}>
            <div className="bg-white p-4 rounded-2xl" style={{ boxShadow: 'var(--px-shadow)' }}>
              <img
                src={`data:image/png;base64,${qrData.qr_code_base64}`}
                alt="QR Code"
                className="w-64 h-64 max-w-full"
              />
            </div>
          </div>

          {/* URL Display */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--px-section)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--px-muted)' }}>QR Code links to:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={qrData.url}
                readOnly
                data-testid="qr-target-url"
                className="px-input flex-1"
                style={{ background: '#fff' }}
              />
              <button
                onClick={handleCopyUrl}
                data-testid="qr-copy-url"
                className="px-btn px-btn-secondary text-sm"
              >
                <Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownload}
              data-testid="qr-download"
              className="px-btn flex-1"
              style={{ minWidth: 200 }}
            >
              <Download className="w-4 h-4" />
              Download QR Code
            </button>

            <button
              onClick={() => generateQRCode(selectedType === 'full' ? 'full' : 'event', selectedType !== 'full' ? selectedType : null)}
              data-testid="qr-regenerate"
              className="px-btn px-btn-secondary flex-1"
              style={{ minWidth: 200 }}
            >
              <RotateCw className="w-4 h-4" />
              Regenerate
            </button>
          </div>

          {/* Usage Tips */}
          <div className="rounded-2xl p-4" style={{ background: 'var(--px-violet-100)', border: '1px solid var(--px-border-tint)' }}>
            <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--px-primary)' }}>Usage tips</h3>
            <ul className="text-xs space-y-1 list-disc ml-4" style={{ color: 'var(--px-muted)' }}>
              <li>Print on wedding cards and save-the-dates</li>
              <li>Display on venue entrance banners</li>
              <li>Add to digital invitations and WhatsApp forwards</li>
              <li>Place on table cards for easy RSVP access</li>
              <li>High error correction ensures scanning works even if partially damaged</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRCodeDisplay;

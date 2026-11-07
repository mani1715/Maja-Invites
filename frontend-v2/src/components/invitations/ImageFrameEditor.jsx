import React, { useState } from 'react';
import './ImageFrameEditor.css';

/**
 * ImageFrameEditor:
 * Provides pan/positioning (x, y %), zoom (1.0x to 3.0x), rotation (90 deg increments),
 * object fit ('cover' vs 'contain'), background customization, and independent
 * desktop / mobile override controls.
 */
export default function ImageFrameEditor({
  imageUrl,
  title = 'Adjust Image Frame',
  initialTransform = {},
  onSave,
  onClose,
}) {
  const [deviceMode, setDeviceMode] = useState('desktop'); // 'desktop' | 'mobile'

  const [desktopTransform, setDesktopTransform] = useState({
    x: initialTransform?.desktop?.x ?? initialTransform?.x ?? 50,
    y: initialTransform?.desktop?.y ?? initialTransform?.y ?? 50,
    scale: initialTransform?.desktop?.scale ?? initialTransform?.scale ?? 1,
    rotate: initialTransform?.desktop?.rotate ?? initialTransform?.rotate ?? 0,
    fit: initialTransform?.desktop?.fit ?? initialTransform?.fit ?? 'cover',
  });

  const [mobileTransform, setMobileTransform] = useState({
    x: initialTransform?.mobile?.x ?? desktopTransform.x,
    y: initialTransform?.mobile?.y ?? desktopTransform.y,
    scale: initialTransform?.mobile?.scale ?? desktopTransform.scale,
    rotate: initialTransform?.mobile?.rotate ?? desktopTransform.rotate,
    fit: initialTransform?.mobile?.fit ?? desktopTransform.fit,
  });

  const current = deviceMode === 'desktop' ? desktopTransform : mobileTransform;
  const setCurrent = (updater) => {
    if (deviceMode === 'desktop') {
      setDesktopTransform((prev) => updater(prev));
    } else {
      setMobileTransform((prev) => updater(prev));
    }
  };

  const handleRotate = (delta) => {
    setCurrent((prev) => ({
      ...prev,
      rotate: (prev.rotate + delta + 360) % 360,
    }));
  };

  const handleReset = () => {
    setCurrent(() => ({
      x: 50,
      y: 50,
      scale: 1,
      rotate: 0,
      fit: 'cover',
    }));
  };

  const handleSave = () => {
    onSave({
      desktop: desktopTransform,
      mobile: mobileTransform,
      // Default top-level fallback
      ...desktopTransform,
    });
    onClose();
  };

  return (
    <div className="ife-modal-overlay" role="dialog" aria-modal="true">
      <div className="ife-modal-card">
        <header className="ife-header">
          <div className="ife-header-info">
            <h3 className="ife-title">{title}</h3>
            <p className="ife-subtitle">Crop, pan, zoom, and orient photo inside its frame.</p>
          </div>
          <button type="button" className="ife-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        <div className="ife-mode-tabs">
          <button
            type="button"
            className={`ife-mode-tab ${deviceMode === 'desktop' ? 'ife-mode-tab--active' : ''}`}
            onClick={() => setDeviceMode('desktop')}
          >
            Desktop View
          </button>
          <button
            type="button"
            className={`ife-mode-tab ${deviceMode === 'mobile' ? 'ife-mode-tab--active' : ''}`}
            onClick={() => setDeviceMode('mobile')}
          >
            Mobile View
          </button>
        </div>

        <div className="ife-workspace">
          <div className={`ife-preview-container ife-preview-container--${deviceMode}`}>
            <div className="ife-frame">
              <img
                src={imageUrl}
                alt="Frame preview"
                className="ife-image"
                style={{
                  objectFit: current.fit,
                  objectPosition: `${current.x}% ${current.y}%`,
                  transform: `scale(${current.scale}) rotate(${current.rotate}deg)`,
                  transformOrigin: `${current.x}% ${current.y}%`,
                }}
              />
            </div>
          </div>

          <div className="ife-controls">
            <div className="ife-control-group">
              <label className="ife-label">
                <span>Zoom / Scale: {current.scale.toFixed(2)}x</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={current.scale}
                  onChange={(e) => {
                    const scale = parseFloat(e.target.value);
                    setCurrent((prev) => ({ ...prev, scale }));
                  }}
                  className="ife-slider"
                />
              </label>
            </div>

            <div className="ife-control-group">
              <label className="ife-label">
                <span>Horizontal Pan (X): {Math.round(current.x)}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={current.x}
                  onChange={(e) => {
                    const x = parseFloat(e.target.value);
                    setCurrent((prev) => ({ ...prev, x }));
                  }}
                  className="ife-slider"
                />
              </label>
            </div>

            <div className="ife-control-group">
              <label className="ife-label">
                <span>Vertical Pan (Y): {Math.round(current.y)}%</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={current.y}
                  onChange={(e) => {
                    const y = parseFloat(e.target.value);
                    setCurrent((prev) => ({ ...prev, y }));
                  }}
                  className="ife-slider"
                />
              </label>
            </div>

            <div className="ife-control-group ife-actions-row">
              <button
                type="button"
                className="ife-btn ife-btn--secondary"
                onClick={() => handleRotate(90)}
              >
                Rotate 90&deg;
              </button>
              <button
                type="button"
                className="ife-btn ife-btn--secondary"
                onClick={() =>
                  setCurrent((prev) => ({
                    ...prev,
                    fit: prev.fit === 'cover' ? 'contain' : 'cover',
                  }))
                }
              >
                Fit: {current.fit.toUpperCase()}
              </button>
              <button
                type="button"
                className="ife-btn ife-btn--ghost"
                onClick={handleReset}
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <footer className="ife-footer">
          <button type="button" className="ife-btn ife-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ife-btn ife-btn--primary" onClick={handleSave}>
            Apply Changes
          </button>
        </footer>
      </div>
    </div>
  );
}

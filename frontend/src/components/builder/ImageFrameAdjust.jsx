/**
 * ImageFrameAdjust.jsx — crop / reposition an image to a frame before upload (v2).
 * The host drags to reposition + zooms, so photos aren't awkwardly cut. Outputs a
 * cropped JPEG Blob sized to the frame (canvas is both the live preview and the export).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';

const FW = 300; // frame display width (px)

export default function ImageFrameAdjust({ file, aspect = 941 / 1672, onCancel, onConfirm }) {
  const FH = Math.round(FW / aspect);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const drag = useRef(null);

  // load the file into an Image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setReady(true); };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseCover = useCallback(() => {
    const img = imgRef.current;
    if (!img) return { w: FW, h: FH };
    const s = Math.max(FW / img.naturalWidth, FH / img.naturalHeight);
    return { w: img.naturalWidth * s, h: img.naturalHeight * s };
  }, [FH]);

  const clamp = useCallback((off, drawW, drawH) => ({
    x: Math.min(0, Math.max(FW - drawW, off.x)),
    y: Math.min(0, Math.max(FH - drawH, off.y)),
  }), [FH]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    const base = baseCover();
    const drawW = base.w * zoom, drawH = base.h * zoom;
    const off = clamp(offset, drawW, drawH);
    ctx.clearRect(0, 0, FW, FH);
    ctx.drawImage(img, off.x, off.y, drawW, drawH);
  }, [zoom, offset, baseCover, clamp, FH]);

  useEffect(() => { if (ready) draw(); }, [ready, draw]);

  const onDown = (e) => {
    const p = e.touches ? e.touches[0] : e;
    drag.current = { x: p.clientX, y: p.clientY, ox: offset.x, oy: offset.y };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const p = e.touches ? e.touches[0] : e;
    const base = baseCover();
    const drawW = base.w * zoom, drawH = base.h * zoom;
    setOffset(clamp({ x: drag.current.ox + (p.clientX - drag.current.x),
                      y: drag.current.oy + (p.clientY - drag.current.y) }, drawW, drawH));
  };
  const onUp = () => { drag.current = null; };

  const confirm = () => {
    const canvas = canvasRef.current;
    canvas.toBlob((blob) => {
      if (blob) onConfirm(new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4" onMouseUp={onUp} onMouseLeave={onUp}>
      <div className="w-full max-w-xs rounded-xl bg-neutral-900 p-4 text-white">
        <p className="mb-2 text-sm font-medium">Adjust the photo</p>
        <p className="mb-3 text-xs text-white/50">Drag to move · slide to zoom</p>
        <canvas
          ref={canvasRef} width={FW} height={FH}
          style={{ width: FW, height: FH, touchAction: 'none', cursor: 'grab', borderRadius: 8, background: '#111' }}
          className="mx-auto"
          onMouseDown={onDown} onMouseMove={onMove}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
        <input type="range" min="1" max="3" step="0.01" value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))} className="mt-3 w-full" />
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="flex-1" onClick={confirm} disabled={!ready}>Use this</Button>
        </div>
      </div>
    </div>
  );
}

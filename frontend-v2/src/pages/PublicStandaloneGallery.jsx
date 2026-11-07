import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getPublicGalleryView } from '../api/gallery';
import './PublicStandaloneGallery.css';

export default function PublicStandaloneGallery() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = Boolean(searchParams.get('preview'));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState('all');

  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [newPhotosAlert, setNewPhotosAlert] = useState(0);

  // Polling & Touch swipe support
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isPollingRef = useRef(false);
  const errorBackoffRef = useRef(1);
  const activePhotoIdRef = useRef(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    getPublicGalleryView(slug, isPreview)
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Gallery not found or not published.');
        setLoading(false);
      });
  }, [slug, isPreview]);

  // Lightweight incremental polling (approx 12s) while gallery tab is visible
  useEffect(() => {
    if (!slug || isPreview) return;
    let timer = null;
    let isMounted = true;

    const poll = async () => {
      if (document.hidden || isPollingRef.current) return;
      isPollingRef.current = true;
      try {
        const res = await getPublicGalleryView(slug, false);
        if (!isMounted) return;
        const freshData = res.data;
        if (freshData && freshData.photos) {
          setData((prev) => {
            if (!prev) return freshData;
            const prevIds = new Set((prev.photos || []).map((p) => p.id));
            const newCount = freshData.photos.filter((p) => !prevIds.has(p.id)).length;
            if (newCount > 0) {
              setNewPhotosAlert((n) => n + newCount);
              setTimeout(() => setNewPhotosAlert(0), 5000);
            }
            return {
              ...freshData,
            };
          });
        }
        errorBackoffRef.current = 1;
      } catch {
        errorBackoffRef.current = Math.min(errorBackoffRef.current * 1.5, 4);
      } finally {
        isPollingRef.current = false;
        if (isMounted) {
          timer = setTimeout(poll, 12000 * errorBackoffRef.current);
        }
      }
    };

    timer = setTimeout(poll, 12000);

    const handleVisibility = () => {
      if (!document.hidden && !isPollingRef.current) {
        poll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [slug, isPreview]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') {
        setLightboxIndex(null);
        activePhotoIdRef.current = null;
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, data]);

  // Extract gallery, albums, and strictly de-duplicated photos
  const { gallery, albums = [], photos = [] } = data || {};

  const uniquePhotos = useMemo(() => {
    if (!photos || !photos.length) return [];
    const seen = new Set();
    const result = [];
    for (const p of photos) {
      if (p && p.id && !seen.has(p.id)) {
        seen.add(p.id);
        result.push(p);
      }
    }
    return result;
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    if (selectedAlbumId === 'all') return uniquePhotos;
    return uniquePhotos.filter((p) => p.album_id === selectedAlbumId);
  }, [uniquePhotos, selectedAlbumId]);

  const handlePrev = () => {
    if (lightboxIndex === null) return;
    const nextIdx = lightboxIndex > 0 ? lightboxIndex - 1 : filteredPhotos.length - 1;
    setLightboxIndex(nextIdx);
    activePhotoIdRef.current = filteredPhotos[nextIdx]?.id;
  };

  const handleNext = () => {
    if (lightboxIndex === null) return;
    const nextIdx = lightboxIndex < filteredPhotos.length - 1 ? lightboxIndex + 1 : 0;
    setLightboxIndex(nextIdx);
    activePhotoIdRef.current = filteredPhotos[nextIdx]?.id;
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].screenX;
    const diff = touchEndX.current - touchStartX.current;
    if (diff > 50) {
      handlePrev(); // Swiped right -> previous
    } else if (diff < -50) {
      handleNext(); // Swiped left -> next
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        Loading wedding gallery...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <h2 style={{ fontFamily: 'serif', color: '#1e293b', marginBottom: 8 }}>Gallery Unavailable</h2>
        <p style={{ color: '#64748b', textAlign: 'center', maxWidth: 400 }}>{error}</p>
      </div>
    );
  }

  const currentPhoto = lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;
  const coverPositionY = gallery.cover_position_y ?? 50;

  return (
    <div className="psg-wrapper">
      {/* Floating subtle new photos indicator */}
      {newPhotosAlert > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#f8fafc',
            padding: '8px 20px',
            borderRadius: 30,
            fontSize: '0.85rem',
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backdropFilter: 'blur(8px)',
          }}
        >
          <span style={{ fontSize: '1rem' }}>📸</span>
          <span>{newPhotosAlert} new photograph{newPhotosAlert > 1 ? 's' : ''} added</span>
        </div>
      )}

      {/* 1. Studio Logo / Name */}
      <header className="psg-header">
        <div className="psg-studio-tag">
          {gallery.branding?.studio_name || 'STUDIO PHOTOGRAPHY'}
        </div>
      </header>

      {/* 2. Selected Couple Photo as the Gallery Cover */}
      {gallery.cover_url ? (
        <div className="psg-cover-container">
          <div className="psg-cover-frame">
            <img
              src={gallery.cover_url}
              alt={gallery.title ? `${gallery.title} Cover` : 'Gallery Cover'}
              className="psg-cover-img"
              style={{ objectPosition: `center ${coverPositionY}%` }}
            />
          </div>
        </div>
      ) : isPreview ? (
        <div className="psg-cover-container">
          <div className="psg-cover-empty-preview">
            No cover photo selected yet. You can choose a couple photo as the cover from the gallery workspace.
          </div>
        </div>
      ) : null}

      {/* 3. Gallery / Event Title and Date */}
      <section className="psg-title-section">
        <h1 className="psg-title">{gallery.title}</h1>
        {gallery.event_date && (
          <div className="psg-date">
            {new Date(gallery.event_date).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        )}
      </section>

      {/* 4. Album Filters: All Photos, Engagement, Wedding, etc. */}
      {albums.length > 0 && (
        <nav className="psg-nav-container">
          <button
            type="button"
            onClick={() => setSelectedAlbumId('all')}
            className={`psg-filter-btn ${selectedAlbumId === 'all' ? 'psg-filter-btn--active' : ''}`}
          >
            All Photos ({uniquePhotos.length})
          </button>
          {albums.map((alb) => (
            <button
              key={alb.id}
              type="button"
              onClick={() => setSelectedAlbumId(alb.id)}
              className={`psg-filter-btn ${selectedAlbumId === alb.id ? 'psg-filter-btn--active' : ''}`}
            >
              {alb.name} ({alb.photo_count || 0})
            </button>
          ))}
        </nav>
      )}

      {/* 5. Compact Two-Column Photo Grid (Approx 760px Max Width, 4:3 Frames) */}
      <main className="psg-grid-container">
        {filteredPhotos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            No photos in this album.
          </div>
        ) : (
          <div className="psg-grid">
            {filteredPhotos.map((photo, index) => (
              <div
                key={photo.id}
                onClick={() => {
                  setLightboxIndex(index);
                  activePhotoIdRef.current = photo.id;
                }}
                className="psg-thumb-frame"
                title="Click to view full photograph"
              >
                <img
                  src={photo.thumb_url || photo.display_url}
                  srcSet={
                    photo.thumb_url && photo.display_url && photo.thumb_url !== photo.display_url
                      ? `${photo.thumb_url} 600w, ${photo.display_url} 1600w`
                      : undefined
                  }
                  sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 25vw"
                  alt={`Photo ${index + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="psg-thumb-img"
                  onContextMenu={(e) => e.preventDefault()}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 6. Existing Footer */}
      <footer className="psg-footer">
        <div>Captured with passion by {gallery.branding?.studio_name || 'Studio Photography'}</div>
        <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#cbd5e1' }}>Powered by metechq</div>
      </footer>

      {/* Fullscreen Lightbox Viewer (Original Aspect Ratio via contain, Watermarked Display Derivative) */}
      {lightboxIndex !== null && currentPhoto && (
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          {/* Top Bar: Counter & Close */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 20,
              right: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#ffffff',
              fontSize: '0.9rem',
              zIndex: 2,
            }}
          >
            <span style={{ opacity: 0.85, fontWeight: 500 }}>
              {lightboxIndex + 1} / {filteredPhotos.length}
            </span>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#ffffff',
                width: 36,
                height: 36,
                borderRadius: '50%',
                fontSize: '1.2rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label="Close viewer"
            >
              ✕
            </button>
          </div>

          {/* Previous Arrow */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            style={{
              position: 'absolute',
              left: 16,
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#ffffff',
              width: 44,
              height: 44,
              borderRadius: '50%',
              fontSize: '1.4rem',
              cursor: 'pointer',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Previous photo"
          >
            ‹
          </button>

          {/* Main Lightbox Image (Watermarked Display Derivative Only, Original Aspect Ratio via contain) */}
          <div
            style={{
              maxWidth: '92vw',
              maxHeight: '85vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentPhoto.display_url}
              alt="Full photograph view"
              style={{
                maxWidth: '100%',
                maxHeight: '85vh',
                objectFit: 'contain', // preserves full image aspect ratio
                borderRadius: 2,
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              }}
            />
          </div>

          {/* Next Arrow */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            style={{
              position: 'absolute',
              right: 16,
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#ffffff',
              width: 44,
              height: 44,
              borderRadius: '50%',
              fontSize: '1.4rem',
              cursor: 'pointer',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Next photo"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * demoStore.js — In-browser local storage CRUD store for Demo Mode.
 * Handles profiles, galleries, RSVPs, wishes, contracts, and proofing.
 * Includes quota error handling and safe fallbacks for private browsing.
 */

import { INITIAL_DEMO_DATA } from './demoFixtures';

const STORAGE_KEY = 'maja_demo_store_v1';

function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (_e) {
    return { ...obj };
  }
}

function loadStore() {
  if (typeof window === 'undefined') return deepClone(INITIAL_DEMO_DATA);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        // Merge with initial in case new keys were added
        return {
          ...deepClone(INITIAL_DEMO_DATA),
          ...parsed,
          auth: { ...INITIAL_DEMO_DATA.auth, ...(parsed.auth || {}) },
        };
      }
    }
  } catch (_e) {
    // Local storage disabled or private browsing
  }
  return deepClone(INITIAL_DEMO_DATA);
}

let currentStore = loadStore();

function persistStore() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentStore));
  } catch (err) {
    // If storage quota exceeded, try removing large items or ignore
    console.warn('[DemoStore] LocalStorage write failed (quota or restricted):', err?.message);
  }
}

export function getDemoStore() {
  return currentStore;
}

export function resetDemoStore() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_e) {}
  currentStore = deepClone(INITIAL_DEMO_DATA);
  try {
    window.dispatchEvent(new CustomEvent('maja:demo-reset'));
  } catch (_e) {}
  return currentStore;
}

// ================= Wedding Profiles =================
export function getProfiles() {
  return [...currentStore.profiles];
}

export function getProfileBySlugOrId(idOrSlug) {
  if (!idOrSlug) return null;
  return (
    currentStore.profiles.find((p) => p.slug === idOrSlug || p.id === idOrSlug) ||
    currentStore.profiles[0] // fallback to first demo profile if not found
  );
}

export function createProfile(data) {
  const newProfile = {
    id: `event-${Date.now().toString(36)}`,
    admin_id: currentStore.auth.studioUser.id,
    slug: (data.slug || `${data.groom_name || 'groom'}-${data.bride_name || 'bride'}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
    groom_name: data.groom_name || 'Groom',
    bride_name: data.bride_name || 'Bride',
    couple_names: `${data.groom_name || 'Groom'} & ${data.bride_name || 'Bride'}`,
    status: data.status || 'DRAFT',
    design_id: data.design_id || 'royal_mughal',
    theme_id: data.theme_id || 'royal_mughal',
    event_date: data.event_date || '2026-12-25',
    city: data.city || 'Udaipur',
    state: data.state || 'Rajasthan',
    venue: data.venue || 'Luxury Heritage Palace',
    cover_image: data.cover_image || '/designs/opt/Mughal/Marriage/3173d9216524700e93025f232b185831-a6119cd9-480.webp',
    music_url: data.music_url || '',
    story: data.story || 'A celebration of love, families, and lifelong memories.',
    events: data.events || [],
    created_at: new Date().toISOString(),
    views_count: 0,
    rsvps_count: 0,
    ...data,
  };
  currentStore.profiles.unshift(newProfile);
  persistStore();
  return newProfile;
}

export function updateProfile(id, updates) {
  const idx = currentStore.profiles.findIndex((p) => p.id === id || p.slug === id);
  if (idx === -1) return null;
  const updated = { ...currentStore.profiles[idx], ...updates, updated_at: new Date().toISOString() };
  currentStore.profiles[idx] = updated;
  persistStore();
  return updated;
}

export function deleteProfile(id) {
  const idx = currentStore.profiles.findIndex((p) => p.id === id || p.slug === id);
  if (idx !== -1) {
    currentStore.profiles.splice(idx, 1);
    persistStore();
    return true;
  }
  return false;
}

// ================= Gallery Photos =================
export function getGalleryPhotos(profileId) {
  return currentStore.gallery.filter((p) => !profileId || p.profile_id === profileId || p.profile_id === 'event-aarav-ananya');
}

export function addGalleryPhoto(photo) {
  const newPhoto = {
    id: `photo-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`,
    profile_id: photo.profile_id || 'event-aarav-ananya',
    url: photo.url || '/portfolio-reference/photo-0.jpg',
    thumb_url: photo.thumb_url || photo.url || '/portfolio-reference/photo-0.jpg',
    caption: photo.caption || '',
    guest_name: photo.guest_name || 'Guest Contributor',
    source: photo.source || 'guest',
    approved: photo.approved !== undefined ? photo.approved : true,
    favorite_count: 0,
    created_at: new Date().toISOString(),
    ...photo,
  };
  currentStore.gallery.unshift(newPhoto);
  persistStore();
  return newPhoto;
}

export function togglePhotoApproved(photoId) {
  const photo = currentStore.gallery.find((p) => p.id === photoId);
  if (photo) {
    photo.approved = !photo.approved;
    persistStore();
    return photo;
  }
  return null;
}

export function togglePhotoFavorite(photoId) {
  const photo = currentStore.gallery.find((p) => p.id === photoId);
  if (photo) {
    photo.favorite_count = (photo.favorite_count || 0) + 1;
    persistStore();
    return photo;
  }
  return null;
}

export function deleteGalleryPhoto(photoId) {
  const idx = currentStore.gallery.findIndex((p) => p.id === photoId);
  if (idx !== -1) {
    currentStore.gallery.splice(idx, 1);
    persistStore();
    return true;
  }
  return false;
}

// ================= RSVPs =================
export function getRsvps(profileId, status) {
  return currentStore.rsvps.filter((r) => {
    const matchProfile = !profileId || r.profile_id === profileId || r.profile_id === 'event-aarav-ananya';
    const matchStatus = !status || r.status === status;
    return matchProfile && matchStatus;
  });
}

export function addRsvp(rsvpData) {
  const newRsvp = {
    id: `rsvp-${Date.now().toString(36)}`,
    profile_id: rsvpData.profile_id || 'event-aarav-ananya',
    name: rsvpData.name || 'Wedding Guest',
    phone: rsvpData.phone || '',
    status: rsvpData.status || 'attending',
    guests_count: rsvpData.guests_count || 1,
    dietary: rsvpData.dietary || 'None',
    events: rsvpData.events || ['Marriage', 'Reception'],
    note: rsvpData.note || '',
    created_at: new Date().toISOString(),
    ...rsvpData,
  };
  currentStore.rsvps.unshift(newRsvp);
  persistStore();
  return newRsvp;
}

// ================= Wishes & Blessings =================
export function getWishes(profileId) {
  return currentStore.wishes.filter((w) => !profileId || w.profile_id === profileId || w.profile_id === 'event-aarav-ananya');
}

export function addWish(wishData) {
  const newWish = {
    id: `wish-${Date.now().toString(36)}`,
    profile_id: wishData.profile_id || 'event-aarav-ananya',
    name: wishData.name || 'Well Wisher',
    message: wishData.message || 'Heartiest congratulations!',
    approved: true,
    featured: false,
    created_at: new Date().toISOString(),
    ...wishData,
  };
  currentStore.wishes.unshift(newWish);
  persistStore();
  return newWish;
}

export function approveWish(wishId) {
  const wish = currentStore.wishes.find((w) => w.id === wishId);
  if (wish) {
    wish.approved = true;
    persistStore();
    return wish;
  }
  return null;
}

export function featureWish(wishId) {
  const wish = currentStore.wishes.find((w) => w.id === wishId);
  if (wish) {
    wish.featured = !wish.featured;
    persistStore();
    return wish;
  }
  return null;
}

export function deleteWish(wishId) {
  const idx = currentStore.wishes.findIndex((w) => w.id === wishId);
  if (idx !== -1) {
    currentStore.wishes.splice(idx, 1);
    persistStore();
    return true;
  }
  return false;
}

// ================= Contracts (Couple Portal) =================
export function getContracts() {
  return [...currentStore.contracts];
}

export function signContract(contractId, signerName) {
  const ctr = currentStore.contracts.find((c) => c.id === contractId);
  if (ctr) {
    ctr.status = 'signed';
    ctr.signed_at = new Date().toISOString();
    ctr.signer_name = signerName || 'Aarav Malhotra';
    persistStore();
    return ctr;
  }
  return null;
}

// ================= Proofing Photos =================
export function getProofs() {
  return [...currentStore.proofs];
}

export function selectProofPhoto(photoId, selected, note = '') {
  const pf = currentStore.proofs.find((p) => p.id === photoId);
  if (pf) {
    pf.selected = !!selected;
    if (note !== undefined) pf.note = note;
    persistStore();
    return pf;
  }
  return null;
}

// ================= Community =================
export function getCommunityPosts() {
  return [...currentStore.communityPosts];
}

export function togglePostLike(postId) {
  const post = currentStore.communityPosts.find((p) => p.id === postId);
  if (post) {
    post.viewer_liked = !post.viewer_liked;
    post.like_count = (post.like_count || 0) + (post.viewer_liked ? 1 : -1);
    persistStore();
    return post;
  }
  return null;
}

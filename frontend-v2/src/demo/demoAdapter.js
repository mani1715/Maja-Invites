/**
 * demoAdapter.js — Axios adapter for Demo Mode.
 * Intercepts all REST calls in-browser when isDemoMode() is true.
 * Returns synthetic data and updates demoStore.
 * Completely isolates demo operations without reaching any network or backend.
 */

import {
  getDemoStore,
  getProfiles,
  getProfileBySlugOrId,
  createProfile,
  updateProfile,
  deleteProfile,
  getGalleryPhotos,
  addGalleryPhoto,
  togglePhotoApproved,
  togglePhotoFavorite,
  deleteGalleryPhoto,
  getRsvps,
  addRsvp,
  getWishes,
  addWish,
  approveWish,
  featureWish,
  deleteWish,
  getContracts,
  signContract,
  getProofs,
  selectProofPhoto,
  getCommunityPosts,
  togglePostLike,
} from './demoStore';

function parseJsonBody(config) {
  if (!config.data) return {};
  if (typeof config.data === 'object' && !(config.data instanceof FormData)) {
    return config.data;
  }
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data);
    } catch (_e) {
      return {};
    }
  }
  return {};
}

function mockResponse(config, status, data, headers = {}) {
  return {
    data,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
    headers: { 'content-type': 'application/json', ...headers },
    config,
  };
}

export function createDemoAdapter(originalAdapter) {
  return async function demoAxiosAdapter(config) {
    const method = (config.method || 'get').toLowerCase();
    const rawUrl = config.url || '';
    // Strip query parameters for routing
    const [pathPart, queryPart] = rawUrl.split('?');
    const path = pathPart.replace(/^\/api/, '');
    const queryParams = new URLSearchParams(queryPart || '');

    // Allow slight artificial latency for realistic UI feedback
    await new Promise((res) => setTimeout(res, 80));

    const store = getDemoStore();

    // -------------------------------------------------------------
    // 1. AUTHENTICATION & SESSION
    // -------------------------------------------------------------
    if (path === '/auth/me') {
      let token = null;
      try {
        token = localStorage.getItem('admin_token');
      } catch (_e) {}

      // If token matches admin
      if (token === 'demo-admin-token') {
        return mockResponse(config, 200, store.auth.adminUser);
      }
      // If token exists (demo photographer / studio)
      if (token) {
        return mockResponse(config, 200, store.auth.studioUser);
      }
      return mockResponse(config, 401, { detail: 'Demo session expired or unauthenticated' });
    }

    if (path === '/auth/login') {
      const body = parseJsonBody(config);
      const ident = (body.username_or_email || body.email || body.username || '').toLowerCase();

      if (ident.includes('admin')) {
        return mockResponse(config, 200, {
          access_token: 'demo-admin-token',
          token_type: 'bearer',
          admin: store.auth.adminUser,
        });
      }

      // Default to studio photographer
      return mockResponse(config, 200, {
        access_token: 'demo-studio-token',
        token_type: 'bearer',
        admin: store.auth.studioUser,
      });
    }

    if (path === '/auth/logout') {
      return mockResponse(config, 200, { message: 'Logged out of demo session' });
    }

    if (path === '/auth/refresh') {
      return mockResponse(config, 200, {
        access_token: 'demo-studio-token',
        token_type: 'bearer',
      });
    }

    // -------------------------------------------------------------
    // 2. COUPLE PORTAL (/api/client/*)
    // -------------------------------------------------------------
    if (path === '/client/login') {
      return mockResponse(config, 200, store.auth.coupleUser);
    }

    if (path === '/client/overview') {
      return mockResponse(config, 200, {
        couple: 'Aarav & Ananya',
        event_date: '2026-12-18',
        city: 'Udaipur',
        venue: 'The Leela Palace, Udaipur',
        days_left: 41,
        total_rsvps: getRsvps('event-aarav-ananya').length,
        total_wishes: getWishes('event-aarav-ananya').length,
        total_photos: getGalleryPhotos('event-aarav-ananya').length,
      });
    }

    if (path === '/client/wishes') {
      return mockResponse(config, 200, getWishes('event-aarav-ananya'));
    }

    const wishApproveMatch = path.match(/^\/client\/wishes\/([^/]+)\/approve$/);
    if (wishApproveMatch && method === 'post') {
      const wish = approveWish(wishApproveMatch[1]);
      return mockResponse(config, 200, wish || { success: true });
    }

    const wishFeatureMatch = path.match(/^\/client\/wishes\/([^/]+)\/feature$/);
    if (wishFeatureMatch && method === 'post') {
      const wish = featureWish(wishFeatureMatch[1]);
      return mockResponse(config, 200, wish || { success: true });
    }

    const wishDeleteMatch = path.match(/^\/client\/wishes\/([^/]+)$/);
    if (wishDeleteMatch && method === 'delete') {
      deleteWish(wishDeleteMatch[1]);
      return mockResponse(config, 200, { success: true, message: 'Wish removed' });
    }

    if (path === '/client/rsvps') {
      const status = config.params?.status || queryParams.get('status');
      return mockResponse(config, 200, getRsvps('event-aarav-ananya', status));
    }

    if (path === '/client/rsvps/stats') {
      const rsvps = getRsvps('event-aarav-ananya');
      const attending = rsvps.filter((r) => r.status === 'attending');
      const declined = rsvps.filter((r) => r.status === 'declined');
      const totalGuests = attending.reduce((sum, r) => sum + (Number(r.guests_count) || 1), 0);
      return mockResponse(config, 200, {
        total_responses: rsvps.length,
        attending_count: attending.length,
        declined_count: declined.length,
        total_guests: totalGuests,
      });
    }

    if (path === '/client/rsvps/export') {
      const rsvps = getRsvps('event-aarav-ananya');
      const csv =
        'Name,Phone,Status,Guests,Dietary,Events,Note\n' +
        rsvps
          .map(
            (r) =>
              `"${r.name}","${r.phone}","${r.status}",${r.guests_count},"${r.dietary || ''}","${(r.events || []).join(';') || ''}","${r.note || ''}"`
          )
          .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      return mockResponse(config, 200, blob, { 'content-type': 'text/csv' });
    }

    if (path === '/client/contracts') {
      return mockResponse(config, 200, getContracts());
    }

    const contractSignMatch = path.match(/^\/client\/contracts\/([^/]+)\/sign$/);
    if (contractSignMatch && method === 'post') {
      const body = parseJsonBody(config);
      const ctr = signContract(contractSignMatch[1], body.signer_name);
      return mockResponse(config, 200, ctr || { success: true, simulated: true });
    }

    if (path === '/client/proofing') {
      return mockResponse(config, 200, getProofs());
    }

    const proofSelectMatch = path.match(/^\/client\/proofing\/photos\/([^/]+)\/select$/);
    if (proofSelectMatch && method === 'post') {
      const body = parseJsonBody(config);
      const pf = selectProofPhoto(proofSelectMatch[1], body.selected, body.note);
      return mockResponse(config, 200, pf || { success: true });
    }

    if (path === '/client/print-orders' && method === 'post') {
      return mockResponse(config, 201, {
        id: `demo-po-${Date.now().toString(36)}`,
        status: 'queued',
        simulated: true,
        message: '[Demo Mode] Simulated album & print order submitted.',
      });
    }

    if (path === '/client/analytics') {
      return mockResponse(config, 200, {
        views: 342,
        rsvps: getRsvps('event-aarav-ananya').length,
        photos: getGalleryPhotos('event-aarav-ananya').length,
        shares: 54,
      });
    }

    // -------------------------------------------------------------
    // 3. ADMIN PLATFORM (/api/admin/*)
    // -------------------------------------------------------------
    if (path === '/admin/overview') {
      return mockResponse(config, 200, store.platformOverview);
    }

    if (path === '/admin/system/health') {
      return mockResponse(config, 200, {
        status: 'operational',
        timestamp: new Date().toISOString(),
        services: store.platformOverview.services,
      });
    }

    if (path === '/admin/weddings' || path === '/admin/profiles') {
      return mockResponse(config, 200, getProfiles());
    }

    if (path === '/admin/studios' || path === '/admin/users') {
      return mockResponse(config, 200, [
        store.auth.studioUser,
        {
          id: 'studio-demo-002',
          name: 'The Vintage Shutter',
          studio_name: 'The Vintage Shutter',
          email: 'contact@vintageshutter.in',
          city: 'Jaipur',
          plan_tier: 'studio',
          storage_used_bytes: 840000000,
          is_active: true,
        },
      ]);
    }

    // -------------------------------------------------------------
    // 4. STUDIO PORTAL (/api/studio/*)
    // -------------------------------------------------------------
    if (path === '/studio/me' || path === '/studio/profile') {
      return mockResponse(config, 200, store.auth.studioUser);
    }

    if (path === '/studio/insights') {
      return mockResponse(config, 200, store.studioInsights);
    }

    if (path === '/studio/storage') {
      return mockResponse(config, 200, {
        used_bytes: store.auth.studioUser.storage_used_bytes,
        total_bytes: store.auth.studioUser.storage_total_bytes,
        percentage: 67.5,
        files_count: 840,
        galleries_count: 6,
      });
    }

    if (path === '/studio/backup') {
      return mockResponse(config, 200, {
        status: 'synced',
        last_backup_at: '2026-11-06T04:00:00Z',
        auto_backup_enabled: true,
        provider: 'AWS S3 (Simulated Demo)',
      });
    }

    if (path === '/studio/notifications') {
      return mockResponse(config, 200, [
        {
          id: 'notif-1',
          title: 'New RSVP Received',
          message: 'Devraj & Priya Kapoor confirmed for Aarav & Ananya wedding.',
          time: '10m ago',
          read: false,
        },
        {
          id: 'notif-2',
          title: 'Guest Photos Uploaded',
          message: '3 new guest photos added to Udaipur reception gallery.',
          time: '2h ago',
          read: false,
        },
        {
          id: 'notif-3',
          title: 'Contract Signed',
          message: 'Aarav Malhotra signed the photography agreement.',
          time: '1d ago',
          read: true,
        },
      ]);
    }

    if (path === '/studio/messages') {
      return mockResponse(config, 200, [
        {
          id: 'msg-1',
          sender: 'Ananya Sharma',
          preview: 'Could we change the mandap time to 5:30 PM on the invite?',
          time: 'Yesterday',
          unread: true,
        },
        {
          id: 'msg-2',
          sender: 'Devraj Kapoor',
          preview: 'Shared flight details for Udaipur airport pickup.',
          time: '2 days ago',
          unread: false,
        },
      ]);
    }

    if (path === '/studio/calendar') {
      return mockResponse(config, 200, [
        { id: 'cal-1', title: 'Royal Ring Ceremony', start: '2026-12-16T18:00:00', venue: 'The Leela Palace' },
        { id: 'cal-2', title: 'Sunlit Haldi', start: '2026-12-17T10:00:00', venue: 'Haveli Gardens' },
        { id: 'cal-3', title: 'Lakeside Pheras', start: '2026-12-18T17:00:00', venue: 'Pichola Ghat' },
      ]);
    }

    if (path === '/studio/clients') {
      return mockResponse(config, 200, [
        { id: 'cli-1', couple: 'Aarav & Ananya', event_date: '2026-12-18', status: 'Active', package: 'Cinematic Royal' },
        { id: 'cli-2', couple: 'Vikram & Diya', event_date: '2027-01-22', status: 'Booked', package: 'Temple Heritage' },
        { id: 'cli-3', couple: 'Rohan & Meera', event_date: '2027-02-14', status: 'Confirmed', package: 'Destination Beach' },
      ]);
    }

    // -------------------------------------------------------------
    // 5. PUBLIC INVITATIONS & WEDDING PROFILES (/api/profiles, /api/invite/*)
    // -------------------------------------------------------------
    if (path === '/profiles' || path === '/weddings' || path === '/invite') {
      if (method === 'post') {
        const body = parseJsonBody(config);
        const created = createProfile(body);
        return mockResponse(config, 201, created);
      }
      return mockResponse(config, 200, getProfiles());
    }

    const singleProfileMatch = path.match(/^\/profiles\/([^/]+)$/) || path.match(/^\/invite\/([^/]+)$/);
    if (singleProfileMatch) {
      const slugOrId = singleProfileMatch[1];
      if (method === 'get') {
        const p = getProfileBySlugOrId(slugOrId);
        if (p) return mockResponse(config, 200, p);
        return mockResponse(config, 404, { detail: 'Wedding profile not found' });
      }
      if (method === 'put' || method === 'patch') {
        const body = parseJsonBody(config);
        const updated = updateProfile(slugOrId, body);
        return mockResponse(config, 200, updated || body);
      }
      if (method === 'delete') {
        deleteProfile(slugOrId);
        return mockResponse(config, 200, { success: true });
      }
    }

    // RSVPs for specific invite or general
    const rsvpMatch = path.match(/^\/invite\/([^/]+)\/rsvp$/) || path.match(/^\/invite\/([^/]+)\/rsvps$/) || path === '/rsvps';
    if (rsvpMatch) {
      if (method === 'post') {
        const body = parseJsonBody(config);
        const saved = addRsvp(body);
        return mockResponse(config, 201, saved);
      }
      const slug = rsvpMatch[1] || 'aarav-ananya';
      return mockResponse(config, 200, getRsvps(slug));
    }

    // Wishes for specific invite or general
    const wishMatch = path.match(/^\/invite\/([^/]+)\/wishes$/) || path === '/wishes';
    if (wishMatch) {
      if (method === 'post') {
        const body = parseJsonBody(config);
        const saved = addWish(body);
        return mockResponse(config, 201, saved);
      }
      const slug = wishMatch[1] || 'aarav-ananya';
      return mockResponse(config, 200, getWishes(slug));
    }

    // Live Gallery Photos
    const galleryMatch = path.match(/^\/invite\/([^/]+)\/gallery$/) || path === '/gallery';
    if (galleryMatch) {
      const slug = galleryMatch[1] || 'aarav-ananya';
      return mockResponse(config, 200, getGalleryPhotos(slug));
    }

    // Gallery Photo Upload (Simulated browser upload)
    const galleryUploadMatch = path.match(/^\/invite\/([^/]+)\/gallery\/upload$/) || path === '/gallery/upload';
    if (galleryUploadMatch && method === 'post') {
      let caption = 'Guest photo';
      let guestName = 'Wedding Guest';
      let photoUrl = '/portfolio-reference/photo-3.jpg';

      // If FormData with file is sent, simulate blob preview
      if (config.data instanceof FormData) {
        caption = config.data.get('caption') || caption;
        guestName = config.data.get('guest_name') || guestName;
        const file = config.data.get('file');
        if (file && typeof URL !== 'undefined' && URL.createObjectURL) {
          try {
            photoUrl = URL.createObjectURL(file);
          } catch (_e) {}
        }
      }

      const uploaded = addGalleryPhoto({
        caption,
        guest_name: guestName,
        url: photoUrl,
        thumb_url: photoUrl,
      });

      return mockResponse(config, 201, {
        success: true,
        simulated: true,
        photo: uploaded,
        message: '[Demo Mode] Photo uploaded locally. Stored in browser memory.',
      });
    }

    const photoLikeMatch = path.match(/^\/gallery\/([^/]+)\/like$/) || path.match(/^\/gallery\/photos\/([^/]+)\/favorite$/);
    if (photoLikeMatch && method === 'post') {
      const p = togglePhotoFavorite(photoLikeMatch[1]);
      return mockResponse(config, 200, p || { success: true });
    }

    // -------------------------------------------------------------
    // 6. COMMUNITY & REELS (/api/community/*)
    // -------------------------------------------------------------
    if (path === '/community/posts' || path === '/community/feed') {
      return mockResponse(config, 200, getCommunityPosts());
    }

    const postLikeMatch = path.match(/^\/community\/posts\/([^/]+)\/like$/);
    if (postLikeMatch && method === 'post') {
      const post = togglePostLike(postLikeMatch[1]);
      return mockResponse(config, 200, post || { success: true });
    }

    // -------------------------------------------------------------
    // 7. SIMULATED ACTIONS (Checkout, Payments, WhatsApp, Email, AI)
    // -------------------------------------------------------------
    if (path.includes('/order') || path.includes('/checkout') || path.includes('/payment')) {
      return mockResponse(config, 200, {
        success: true,
        simulated: true,
        order_id: `demo-order-${Date.now().toString(36)}`,
        status: 'PAID',
        currency: 'INR',
        message: '[Demo Mode] Payment simulated successfully. No financial transaction occurred.',
      });
    }

    if (path.includes('/whatsapp') || path.includes('/send') || path.includes('/notify') || path.includes('/email')) {
      return mockResponse(config, 200, {
        success: true,
        simulated: true,
        message: '[Demo Mode] Message simulated successfully. No external service contacted.',
      });
    }

    if (path.includes('/face-match') || path.includes('/ai-search')) {
      return mockResponse(config, 200, {
        success: true,
        simulated: true,
        matches: getGalleryPhotos('event-aarav-ananya').slice(0, 3),
        message: '[Demo Mode] Facial match simulated with demo collection.',
      });
    }

    // -------------------------------------------------------------
    // Fallback for any unhandled GET/POST/PUT in demo mode
    // -------------------------------------------------------------
    if (originalAdapter) {
      try {
        return await originalAdapter(config);
      } catch (err) {
        // In demo mode, prevent network failure crashes
        return mockResponse(config, 200, {
          success: true,
          simulated: true,
          endpoint: path,
          message: '[Demo Mode] Request handled by demo fallback adapter.',
        });
      }
    }

    return mockResponse(config, 200, {
      success: true,
      simulated: true,
      path,
      message: '[Demo Mode] Request handled by demo adapter.',
    });
  };
}

export default createDemoAdapter;

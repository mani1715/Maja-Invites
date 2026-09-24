/**
 * PHASE 30: Analytics Tracker Utility
 * 
 * Lightweight tracking for guest behavior analytics
 * - NO cookies
 * - NO personal data
 * - NO admin tracking
 * - Privacy-first approach
 */

// Generate unique session ID (stored in sessionStorage, cleared on browser close)
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
};

// Detect device type
const getDeviceType = () => {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
};

// Check if user is an admin (logged in)
const isAdmin = () => {
  // Check if admin token exists in localStorage
  const token = localStorage.getItem('admin_token');
  return !!token;
};

// Send tracking event to backend
const sendTrackingEvent = async (eventData) => {
  // Don't track if user is admin
  if (isAdmin()) {
    return;
  }

  try {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
    await fetch(`${backendUrl}/api/analytics/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });
  } catch (error) {
    // Silently fail - don't interrupt user experience
    console.debug('Analytics tracking skipped:', error.message);
  }
};

// Track page view
export const trackPageView = (profileId, eventId = null) => {
  sendTrackingEvent({
    profile_id: profileId,
    event_id: eventId,
    session_id: getSessionId(),
    event_type: 'page_view',
    device_type: getDeviceType(),
    user_agent: navigator.userAgent,
  });
};

// Track gallery opened
export const trackGalleryOpened = (profileId, eventId = null) => {
  sendTrackingEvent({
    profile_id: profileId,
    event_id: eventId,
    session_id: getSessionId(),
    event_type: 'gallery_opened',
    device_type: getDeviceType(),
  });
};

// Track video played
export const trackVideoPlayed = (profileId, eventId = null, videoType = 'hero') => {
  sendTrackingEvent({
    profile_id: profileId,
    event_id: eventId,
    session_id: getSessionId(),
    event_type: 'video_played',
    device_type: getDeviceType(),
    event_metadata: { video_type: videoType },
  });
};

// Track music unmuted
export const trackMusicUnmuted = (profileId, eventId = null) => {
  sendTrackingEvent({
    profile_id: profileId,
    event_id: eventId,
    session_id: getSessionId(),
    event_type: 'music_unmuted',
    device_type: getDeviceType(),
  });
};

// Track map opened
export const trackMapOpened = (profileId, eventId = null) => {
  sendTrackingEvent({
    profile_id: profileId,
    event_id: eventId,
    session_id: getSessionId(),
    event_type: 'map_opened',
    device_type: getDeviceType(),
  });
};

// Track RSVP submitted
export const trackRSVPSubmitted = (profileId, eventId = null) => {
  sendTrackingEvent({
    profile_id: profileId,
    event_id: eventId,
    session_id: getSessionId(),
    event_type: 'rsvp_submitted',
    device_type: getDeviceType(),
  });
};

// Track scroll depth
let scrollDepthTracked = {
  '25': false,
  '50': false,
  '75': false,
  '100': false,
};

export const initScrollTracking = (profileId, eventId = null) => {
  // Reset on new page
  scrollDepthTracked = {
    '25': false,
    '50': false,
    '75': false,
    '100': false,
  };

  const handleScroll = () => {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = window.scrollY;
    const scrollPercent = (scrolled / scrollHeight) * 100;

    if (scrollPercent >= 25 && !scrollDepthTracked['25']) {
      scrollDepthTracked['25'] = true;
      sendTrackingEvent({
        profile_id: profileId,
        event_id: eventId,
        session_id: getSessionId(),
        event_type: 'scroll_25',
        device_type: getDeviceType(),
      });
    }

    if (scrollPercent >= 50 && !scrollDepthTracked['50']) {
      scrollDepthTracked['50'] = true;
      sendTrackingEvent({
        profile_id: profileId,
        event_id: eventId,
        session_id: getSessionId(),
        event_type: 'scroll_50',
        device_type: getDeviceType(),
      });
    }

    if (scrollPercent >= 75 && !scrollDepthTracked['75']) {
      scrollDepthTracked['75'] = true;
      sendTrackingEvent({
        profile_id: profileId,
        event_id: eventId,
        session_id: getSessionId(),
        event_type: 'scroll_75',
        device_type: getDeviceType(),
      });
    }

    if (scrollPercent >= 100 && !scrollDepthTracked['100']) {
      scrollDepthTracked['100'] = true;
      sendTrackingEvent({
        profile_id: profileId,
        event_id: eventId,
        session_id: getSessionId(),
        event_type: 'scroll_100',
        device_type: getDeviceType(),
      });
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });

  // Return cleanup function
  return () => {
    window.removeEventListener('scroll', handleScroll);
  };
};

// Track time spent on page
export const initTimeTracking = (profileId, eventId = null) => {
  const startTime = Date.now();

  const sendTimeSpent = () => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    if (timeSpent > 0) {
      sendTrackingEvent({
        profile_id: profileId,
        event_id: eventId,
        session_id: getSessionId(),
        event_type: 'page_view',
        device_type: getDeviceType(),
        time_spent_seconds: timeSpent,
      });
    }
  };

  // Send time spent when user leaves page
  window.addEventListener('beforeunload', sendTimeSpent);

  // Return cleanup function
  return () => {
    window.removeEventListener('beforeunload', sendTimeSpent);
  };
};

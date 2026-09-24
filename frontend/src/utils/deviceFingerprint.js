/**
 * PHASE 32: Device Fingerprinting Utility
 * 
 * Generates a simple device fingerprint for tracking submissions
 * Uses browser characteristics to create a unique-ish identifier
 * Stored in localStorage for persistence
 */

/**
 * Generate a simple hash from a string
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get device fingerprint components
 */
function getDeviceInfo() {
  const nav = navigator;
  const screen = window.screen;
  
  return {
    userAgent: nav.userAgent || '',
    language: nav.language || '',
    platform: nav.platform || '',
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    screenResolution: `${screen.width}x${screen.height}`,
    screenColorDepth: screen.colorDepth || 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    cookieEnabled: nav.cookieEnabled,
  };
}

/**
 * Generate device fingerprint
 * Combines browser characteristics into a unique identifier
 */
export function generateDeviceFingerprint() {
  const info = getDeviceInfo();
  
  // Combine all info into a string
  const fingerprintString = [
    info.userAgent,
    info.language,
    info.platform,
    info.hardwareConcurrency,
    info.screenResolution,
    info.screenColorDepth,
    info.timezone,
    info.cookieEnabled ? '1' : '0',
  ].join('|');
  
  // Generate hash
  const fingerprint = simpleHash(fingerprintString);
  
  return `device_${fingerprint}`;
}

/**
 * Get or create device ID
 * Persists in localStorage for consistent tracking across page loads
 */
export function getDeviceId() {
  const storageKey = 'wedding_device_id';
  
  try {
    // Try to get existing device ID
    let deviceId = localStorage.getItem(storageKey);
    
    if (!deviceId) {
      // Generate new device ID
      deviceId = generateDeviceFingerprint();
      
      // Store in localStorage
      localStorage.setItem(storageKey, deviceId);
    }
    
    return deviceId;
  } catch (error) {
    // localStorage might be blocked (private browsing)
    // Generate temporary device ID (won't persist)
    console.warn('Could not access localStorage:', error);
    return generateDeviceFingerprint();
  }
}

/**
 * Clear device ID (for testing)
 */
export function clearDeviceId() {
  const storageKey = 'wedding_device_id';
  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn('Could not clear device ID:', error);
  }
}

export default {
  generateDeviceFingerprint,
  getDeviceId,
  clearDeviceId,
};

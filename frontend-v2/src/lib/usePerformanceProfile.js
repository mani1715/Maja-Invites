import { useEffect, useState } from 'react';
import { getProfile, subscribe } from './performanceProfile';

/**
 * React binding for the canonical performance policy.
 *
 * Separate file from performanceProfile.js on purpose: the policy itself must
 * stay importable from non-React code (the uploader, plain helpers) without
 * dragging React in.
 */
export default function usePerformanceProfile() {
  const [profile, setProfile] = useState(getProfile);
  useEffect(() => subscribe(setProfile), []);
  return profile;
}

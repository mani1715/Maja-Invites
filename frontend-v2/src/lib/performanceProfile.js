/**
 * performanceProfile.js — the ONE place the app decides what a device can take.
 *
 * Before this, device checks were scattered: multipartUploader.pickConcurrency
 * read navigator.connection to size an upload pool, LivePhotoWall.pageLimit read
 * it again to size a gallery page, and neither knew about the other. Two files,
 * two thresholds, no way to reason about what a 4 GB phone on 3G actually gets.
 *
 * The rule this module exists to enforce: adapt the WORK, not the layout. A slow
 * device should fetch smaller images, decode fewer at once and upload with less
 * parallelism. It should not be handed shrunken CSS pixels — that hides a
 * performance problem behind a worse-looking page while moving exactly the same
 * bytes.
 *
 *   import { getProfile, usePerformanceProfile, reportDecodeMs } from '@/lib/performanceProfile';
 *
 * Everything degrades safely: every signal below is optional and absent on some
 * browser. `navigator.deviceMemory` and `hardwareConcurrency` are Chromium-only,
 * `navigator.connection` is absent on Safari and Firefox. A device that reports
 * nothing lands on `balanced` rather than being punished for its privacy.
 */

// --------------------------------------------------------------------------
// Tiers, weakest first. `score` is the upper bound of the capability score
// that lands here (0-100). Names are labels for logs and tests — behaviour
// comes from the knobs, never from matching on the name.
// --------------------------------------------------------------------------
const TIERS = [
  // name            score  thumb preview upCon prefetch decode batch  anim         virtual
  ['ultra-low',        8,     160,   640,    1,      0,      1,     8,  'none',       true],
  ['very-low',        16,     180,   720,    1,      1,      1,    10,  'none',       true],
  ['low',             25,     200,   800,    2,      2,      2,    12,  'minimal',    true],
  ['low-plus',        34,     240,   960,    2,      3,      2,    16,  'minimal',    true],
  ['balanced-low',    43,     280,  1080,    3,      4,      2,    20,  'reduced',    true],
  ['balanced',        54,     320,  1280,    3,      6,      3,    24,  'reduced',   false],
  ['balanced-plus',   64,     360,  1440,    4,      8,      3,    30,  'full',      false],
  ['high',            74,     400,  1600,    4,     10,      4,    36,  'full',      false],
  ['high-plus',       84,     480,  1920,    5,     12,      4,    42,  'full',      false],
  ['very-high',       93,     560,  2048,    5,     16,      6,    48,  'full',      false],
  ['ultra-high',     101,     640,  2560,    6,     20,      6,    60,  'full',      false],
].map(([name, score, thumbWidth, previewWidth, uploadConcurrency, prefetchCount,
        decodeConcurrency, galleryBatchSize, animationLevel, virtualizeGallery], i) => ({
  name,
  index: i,
  maxScore: score,
  thumbWidth,
  previewWidth,
  uploadConcurrency,
  prefetchCount,
  decodeConcurrency,
  galleryBatchSize,
  animationLevel,          // 'none' | 'minimal' | 'reduced' | 'full'
  virtualizeGallery,
}));

const DEFAULT_INDEX = TIERS.findIndex((t) => t.name === 'balanced');

const clampIndex = (i) => Math.max(0, Math.min(TIERS.length - 1, i));

// --------------------------------------------------------------------------
// Signals
// --------------------------------------------------------------------------
function readSignals() {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const win = typeof window !== 'undefined' ? window : {};
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection || null;
  const mm = (q) => {
    try { return !!win.matchMedia?.(q).matches; } catch (_e) { return false; }
  };

  return {
    viewportWidth: win.innerWidth || 1280,
    viewportHeight: win.innerHeight || 800,
    dpr: win.devicePixelRatio || 1,
    // Chromium caps deviceMemory at 8 and rounds to a power of two, so treat
    // it as a coarse bucket, never as "GB of RAM".
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    effectiveType: conn?.effectiveType || null,     // 'slow-2g' | '2g' | '3g' | '4g'
    downlinkMbps: typeof conn?.downlink === 'number' ? conn.downlink : null,
    rttMs: typeof conn?.rtt === 'number' ? conn.rtt : null,
    saveData: !!conn?.saveData,
    reducedMotion: mm('(prefers-reduced-motion: reduce)'),
    coarsePointer: mm('(pointer: coarse)'),
  };
}

// Each contributor returns a 0-100 sub-score, or null when the browser does not
// expose the signal. Averaging only the non-null ones is what stops Safari — which
// reports neither memory nor connection — from being scored as a weak device.
function scoreSignals(s) {
  const parts = [];
  const add = (v) => { if (v !== null) parts.push(v); };

  add(s.deviceMemory === null ? null
    : s.deviceMemory <= 1 ? 5 : s.deviceMemory <= 2 ? 18
      : s.deviceMemory <= 4 ? 38 : s.deviceMemory <= 6 ? 58
        : s.deviceMemory <= 8 ? 78 : 92);

  add(s.cores === null ? null
    : s.cores <= 2 ? 12 : s.cores <= 4 ? 38 : s.cores <= 6 ? 58
      : s.cores <= 8 ? 76 : 92);

  add(s.effectiveType === null ? null
    : s.effectiveType === 'slow-2g' ? 2 : s.effectiveType === '2g' ? 10
      : s.effectiveType === '3g' ? 32 : 80);

  add(s.downlinkMbps === null ? null
    : s.downlinkMbps < 0.5 ? 5 : s.downlinkMbps < 1.5 ? 20
      : s.downlinkMbps < 5 ? 45 : s.downlinkMbps < 12 ? 70 : 90);

  // Latency shapes prefetching more than raw throughput does.
  add(s.rttMs === null ? null
    : s.rttMs > 1200 ? 6 : s.rttMs > 600 ? 20 : s.rttMs > 300 ? 42
      : s.rttMs > 120 ? 68 : 88);

  // Viewport is a weak proxy for device class, and only used as one.
  const px = s.viewportWidth * s.viewportHeight;
  add(px < 200_000 ? 25 : px < 400_000 ? 40 : px < 900_000 ? 60
    : px < 2_100_000 ? 78 : 88);

  if (!parts.length) return 50;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function tierFor(signals) {
  let score = scoreSignals(signals);

  // Save-Data is a user instruction, not a measurement. It outranks a good
  // score: someone on an expensive connection asking for less data gets less
  // data even on a flagship phone.
  if (signals.saveData) score = Math.min(score, 14);

  // A high-DPR phone renders more pixels for the same layout, so the same
  // capability score buys less headroom.
  if (signals.dpr >= 3 && signals.coarsePointer) score -= 8;
  else if (signals.dpr >= 2 && signals.coarsePointer) score -= 4;

  const idx = TIERS.findIndex((t) => score < t.maxScore);
  return TIERS[idx === -1 ? TIERS.length - 1 : idx];
}

// --------------------------------------------------------------------------
// Observed feedback. Static signals describe the device; these describe what it
// is actually doing right now, which is the part a spec sheet cannot predict
// (a thermally throttled phone, a congested hotspot).
// --------------------------------------------------------------------------
const OBS = { decodeMs: [], uploadKbps: [], adjust: 0 };
const KEEP = 12;

function pushSample(arr, v) {
  arr.push(v);
  if (arr.length > KEEP) arr.shift();
}

function median(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function reconsider() {
  const d = median(OBS.decodeMs);
  const u = median(OBS.uploadKbps);
  let next = OBS.adjust;

  // Demote fast, promote slowly: a device that is struggling should get relief
  // immediately, but one brief good patch should not undo it.
  if (d !== null && d > 220) next = Math.min(next, -2);
  else if (d !== null && d > 110) next = Math.min(next, -1);
  else if (d !== null && d < 35 && u !== null && u > 4000) next = Math.min(2, next + 1);

  if (u !== null && u < 250) next = Math.min(next, -2);
  else if (u !== null && u < 800) next = Math.min(next, -1);

  next = Math.max(-3, Math.min(2, next));
  if (next !== OBS.adjust) {
    OBS.adjust = next;
    _cached = null;
    notify();
  }
}

/** Report how long one image took to decode (ms). Cheap; call it per image. */
export function reportDecodeMs(ms) {
  if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return;
  pushSample(OBS.decodeMs, ms);
  reconsider();
}

/** Report an observed upload throughput sample (kbps). */
export function reportUploadKbps(kbps) {
  if (typeof kbps !== 'number' || !isFinite(kbps) || kbps <= 0) return;
  pushSample(OBS.uploadKbps, kbps);
  reconsider();
}

// --------------------------------------------------------------------------
// Public surface
// --------------------------------------------------------------------------
let _cached = null;
const listeners = new Set();

function notify() {
  const p = getProfile();
  listeners.forEach((fn) => { try { fn(p); } catch (_e) { /* a bad listener is not our problem */ } });
}

/** The current profile. Frozen — callers read knobs, they do not tune them. */
export function getProfile() {
  if (_cached) return _cached;
  const signals = readSignals();
  const base = tierFor(signals);
  const tier = TIERS[clampIndex(base.index + OBS.adjust)];
  _cached = Object.freeze({
    ...tier,
    // Reduced motion is a stated preference and overrides the tier upward or
    // downward — a fast desktop that asked for less motion gets less motion.
    animationLevel: signals.reducedMotion ? 'none' : tier.animationLevel,
    baseTier: base.name,
    adjust: OBS.adjust,
    signals,
  });
  return _cached;
}

/** Names in order, weakest first. For tests and diagnostics. */
export const TIER_NAMES = TIERS.map((t) => t.name);

/** The whole ladder, frozen. Exported so the ordering can be asserted and so a
 *  debug overlay can show what a device was given. Not for tuning at runtime. */
export const TIER_TABLE = Object.freeze(TIERS.map((t) => Object.freeze({ ...t })));

/** Re-read the environment (viewport change, connection change). */
export function refreshProfile() {
  _cached = null;
  notify();
  return getProfile();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-evaluate when the environment actually changes, debounced so a drag-resize
// does not thrash every subscriber.
if (typeof window !== 'undefined') {
  let t = null;
  const bounce = () => { clearTimeout(t); t = setTimeout(refreshProfile, 250); };
  window.addEventListener('resize', bounce);
  try { navigator.connection?.addEventListener?.('change', bounce); } catch (_e) { /* not supported */ }
}

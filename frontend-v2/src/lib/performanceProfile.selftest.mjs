/**
 * Self-check for the performance policy. Pure logic, no DOM, no framework.
 *
 *     node frontend-v2/src/lib/performanceProfile.selftest.mjs
 *
 * Also run by backend/tests/test_performance_profile.py so it cannot rot
 * unnoticed — a green `yarn build` proves nothing about this file, because the
 * build never evaluates a tier.
 */
import assert from 'node:assert/strict';

let pass = 0;
const fail = [];
function check(label, fn) {
  try { fn(); pass += 1; console.log(`  ok    ${label}`); }
  catch (e) { fail.push(label); console.log(`  FAIL  ${label}\n        ${e.message}`); }
}

// --------------------------------------------------------------------------
// Minimal browser stubs. Re-imported per scenario because the module caches
// its profile, which is the behaviour we want in a browser and the thing we
// have to defeat in a test.
// --------------------------------------------------------------------------
function setEnv({ width = 1440, height = 900, dpr = 1, memory, cores,
                  effectiveType, downlink, rtt, saveData = false,
                  reducedMotion = false, coarse = false } = {}) {
  globalThis.window = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: dpr,
    matchMedia: (q) => ({
      matches: q.includes('reduced-motion') ? reducedMotion
        : q.includes('coarse') ? coarse : false,
    }),
    addEventListener() {},
  };
  const connection = (effectiveType || downlink != null || rtt != null || saveData)
    ? { effectiveType, downlink, rtt, saveData, addEventListener() {} }
    : undefined;
  // Node 22 ships a read-only `navigator` global, so a plain assignment throws
  // "Cannot set property navigator of #<Object> which has only a getter".
  Object.defineProperty(globalThis, 'navigator', {
    value: { deviceMemory: memory, hardwareConcurrency: cores, connection },
    configurable: true,
    writable: true,
  });
}

let nonce = 0;
/**
 * Load a fresh copy of the module under `env` AND snapshot its profile
 * immediately.
 *
 * The snapshot matters. The module reads navigator/window lazily, on the first
 * getProfile() call — correct in a browser, and a trap here: loading three
 * copies and only then calling getProfile() on each made all three read the
 * environment left behind by the LAST setEnv, so a 2 GB phone scored identically
 * to a flagship. The first version of this file did exactly that and reported
 * two failures that were the test's fault, not the module's.
 */
async function load(env) {
  setEnv(env);
  nonce += 1;
  const mod = await import(`./performanceProfile.js?n=${nonce}`);
  return { mod, profile: mod.getProfile() };
}

const flagship = { memory: 8, cores: 12, effectiveType: '4g', downlink: 25, rtt: 40, width: 1920, height: 1080 };
const cheapPhone = { memory: 2, cores: 4, effectiveType: '3g', downlink: 1.2, rtt: 500,
                     width: 360, height: 640, dpr: 2, coarse: true };

console.log('Performance profile self-check');

const flag = await load(flagship);
const cheap = await load(cheapPhone);
const bareDesktop = await load({});                      // Safari-ish, big window
const barePhone = await load({ width: 375, height: 667, dpr: 2, coarse: true });

check('a flagship desktop lands in the upper half', () => {
  assert.ok(flag.profile.index >= 6,
    `expected a high tier, got ${flag.profile.name} (index ${flag.profile.index})`);
});

check('a 2 GB phone on 3G lands in the lower half', () => {
  assert.ok(cheap.profile.index <= 4,
    `expected a low tier, got ${cheap.profile.name} (index ${cheap.profile.index})`);
});

check('a browser that reports nothing is NOT punished for it', () => {
  // Safari and Firefox expose neither deviceMemory nor navigator.connection.
  // Scoring only the signals that exist is what stops a privacy-preserving
  // browser from being treated as a cheap phone.
  assert.ok(bareDesktop.profile.index >= 5,
    `a signal-less desktop should not be demoted, got ${bareDesktop.profile.name}`);
});

check('a signal-less SMALL screen still lands below a signal-less desktop', () => {
  assert.ok(barePhone.profile.index < bareDesktop.profile.index,
    `viewport must still count: phone=${barePhone.profile.name} desktop=${bareDesktop.profile.name}`);
});

check('weaker device => strictly cheaper work, on every knob', () => {
  for (const k of ['thumbWidth', 'previewWidth', 'uploadConcurrency',
                   'prefetchCount', 'decodeConcurrency', 'galleryBatchSize']) {
    assert.ok(cheap.profile[k] <= flag.profile[k],
      `${k}: low tier (${cheap.profile[k]}) must not exceed high tier (${flag.profile[k]})`);
  }
});

check('there are 11 tiers and every knob is monotonic across all of them', () => {
  // The ladder IS the contract: a promotion must never ask for less work and a
  // demotion must never ask for more, or the observed-feedback loop oscillates
  // between two tiers forever.
  const table = flag.mod.TIER_TABLE;
  assert.equal(table.length, 11);
  const RISING = ['thumbWidth', 'previewWidth', 'uploadConcurrency',
                  'prefetchCount', 'decodeConcurrency', 'galleryBatchSize', 'maxScore'];
  for (let i = 1; i < table.length; i += 1) {
    for (const k of RISING) {
      assert.ok(table[i][k] >= table[i - 1][k],
        `${k} drops from ${table[i - 1].name} (${table[i - 1][k]}) to ${table[i].name} (${table[i][k]})`);
    }
    // Virtualization may only ever be turned OFF as tiers get stronger.
    assert.ok(!(table[i].virtualizeGallery && !table[i - 1].virtualizeGallery),
      `virtualization re-enabled at ${table[i].name}`);
  }
});

const saveData = await load({ ...flagship, saveData: true });
check('Save-Data overrides a fast device', () => {
  assert.ok(saveData.profile.index <= 2,
    `Save-Data must force a low tier, got ${saveData.profile.name}`);
});

const reduced = await load({ ...flagship, reducedMotion: true });
check('reduced-motion turns animation off regardless of tier', () => {
  assert.equal(reduced.profile.animationLevel, 'none');
});

check('the profile is frozen — callers read, never tune', () => {
  assert.throws(() => { flag.profile.uploadConcurrency = 99; }, TypeError);
});

// --------------------------------------------------------------------------
// Observed feedback
// --------------------------------------------------------------------------
const obs = (await load(flagship)).mod;
check('slow observed decodes demote the profile', () => {
  const before = obs.getProfile().index;
  for (let i = 0; i < 8; i += 1) obs.reportDecodeMs(400);
  const after = obs.getProfile().index;
  assert.ok(after < before, `expected a demotion from ${before}, still ${after}`);
});

check('a demotion never falls off the bottom of the ladder', () => {
  for (let i = 0; i < 40; i += 1) { obs.reportDecodeMs(9000); obs.reportUploadKbps(5); }
  assert.ok(obs.getProfile().index >= 0);
  assert.ok(obs.getProfile().uploadConcurrency >= 1, 'concurrency must never reach 0');
});

check('garbage samples are ignored rather than poisoning the median', () => {
  const before = obs.getProfile().index;
  obs.reportDecodeMs(NaN);
  obs.reportDecodeMs(-5);
  obs.reportUploadKbps(0);
  assert.equal(obs.getProfile().index, before);
});

const sub = (await load(flagship)).mod;
check('subscribers are told when the profile changes, and unsubscribe works', () => {
  let calls = 0;
  const off = sub.subscribe(() => { calls += 1; });
  sub.refreshProfile();
  off();
  sub.refreshProfile();
  assert.equal(calls, 1, 'unsubscribe must actually unsubscribe');
});

console.log(`\nPerformance profile: ${pass} checks, ${fail.length} failed`);
if (fail.length) {
  console.log('FAILED: ' + fail.join(', '));
  process.exit(1);
}

#!/usr/bin/env node
/*
 * loadtest-local.mjs — zero-dependency local load test for MAJA Invites.
 *
 * WHAT THIS IS
 *   A quick, no-install sanity check against a LOCAL dev stack (single
 *   uvicorn worker, shared laptop). It answers "does this endpoint fall over
 *   under N concurrent workers on my machine", not "what will the VM do in
 *   production". See docs/LOADTEST_RESULTS.md for the production procedure
 *   (VM, tiers 100-5000, k6 via scripts/loadtest.js).
 *
 * USAGE
 *   node scripts/loadtest-local.mjs
 *   TIER=100 DURATION=30 node scripts/loadtest-local.mjs
 *   TARGET=http://localhost:8001 TIER=25 DURATION=30 node scripts/loadtest-local.mjs
 *   ENDPOINTS=/api/health,/api/store/packages node scripts/loadtest-local.mjs
 *
 * ENV VARS
 *   TARGET     base URL, default http://localhost:8001
 *   TIER       concurrent workers, default 25
 *   DURATION   seconds to run, default 30
 *   ENDPOINTS  comma-separated paths, default the 4 below
 *
 * Each worker loops GET requests round-robin over ENDPOINTS for DURATION
 * seconds. Reports per-endpoint P50/P95/P99 (nearest-rank), throughput, and
 * non-200 count. No dependencies — plain node:http with a keep-alive agent.
 */
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const TARGET = (process.env.TARGET || 'http://localhost:8001').replace(/\/+$/, '');
const TIER = parseInt(process.env.TIER || '25', 10);
const DURATION = parseInt(process.env.DURATION || '30', 10);
const ENDPOINTS = (process.env.ENDPOINTS ||
  '/api/health,/api/invite/review-demo,/api/invite/review-demo/full,/api/store/packages'
).split(',').map((s) => s.trim()).filter(Boolean);

const base = new URL(TARGET);
const client = base.protocol === 'https:' ? https : http;
// maxSockets: Infinity — at TIER=250 a capped pool just queues requests
// invisibly (the per-request `timeout` option only starts once a socket is
// assigned, so a queued request can hang past DURATION with nothing to
// catch it). Unlimited sockets + the manual wall-clock timer below is what
// actually bounds every request.
const agent = new client.Agent({ keepAlive: true, maxSockets: Infinity });

function get(path) {
  return new Promise((resolve) => {
    const start = performance.now();
    let settled = false;
    const done = (status) => {
      if (settled) return;
      settled = true;
      resolve({ status, ms: performance.now() - start });
    };
    // Wall-clock safety net, independent of socket/timeout event delivery.
    const killer = setTimeout(() => { req.destroy(); done(0); }, 10_000);
    const req = client.get(base.origin + path, { agent }, (res) => {
      res.on('data', () => {}); // drain
      res.on('end', () => { clearTimeout(killer); done(res.statusCode); });
    });
    req.on('error', () => { clearTimeout(killer); done(0); }); // status 0 = connection error/timeout
  });
}

// per-endpoint: { latencies: [], nonOk: 0 }
const stats = Object.fromEntries(ENDPOINTS.map((e) => [e, { latencies: [], nonOk: 0 }]));

async function worker(id) {
  let i = id % ENDPOINTS.length;
  const endAt = Date.now() + DURATION * 1000;
  while (Date.now() < endAt) {
    const path = ENDPOINTS[i];
    const { status, ms } = await get(path);
    const s = stats[path];
    s.latencies.push(ms);
    if (status !== 200) s.nonOk += 1;
    i = (i + 1) % ENDPOINTS.length;
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

console.log(`Target: ${TARGET}  Tier: ${TIER} workers  Duration: ${DURATION}s`);
console.log(`Endpoints: ${ENDPOINTS.join(', ')}`);

const wallStart = performance.now();
await Promise.all(Array.from({ length: TIER }, (_, i) => worker(i)));
const wallSec = (performance.now() - wallStart) / 1000;

console.log('\nendpoint'.padEnd(42) + 'reqs'.padStart(7) + 'p50ms'.padStart(8) + 'p95ms'.padStart(8) + 'p99ms'.padStart(8) + 'req/s'.padStart(9) + 'non200'.padStart(8));
let grandTotal = 0, grandNonOk = 0;
for (const path of ENDPOINTS) {
  const s = stats[path];
  const sorted = s.latencies.slice().sort((a, b) => a - b);
  const n = sorted.length;
  grandTotal += n;
  grandNonOk += s.nonOk;
  console.log(
    path.padEnd(42) +
    String(n).padStart(7) +
    percentile(sorted, 50).toFixed(1).padStart(8) +
    percentile(sorted, 95).toFixed(1).padStart(8) +
    percentile(sorted, 99).toFixed(1).padStart(8) +
    (n / wallSec).toFixed(1).padStart(9) +
    String(s.nonOk).padStart(8)
  );
}
console.log('-'.repeat(88));
console.log(`TOTAL: ${grandTotal} reqs in ${wallSec.toFixed(1)}s = ${(grandTotal / wallSec).toFixed(1)} req/s overall, ${grandNonOk} non-200`);

agent.destroy();

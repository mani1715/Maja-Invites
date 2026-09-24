/*
 * loadtest.js — capacity test for MAJA Invites (k6).
 *
 * WHAT IT DOES
 *   Simulates real guests opening an invitation: the batched /full fetch, the
 *   gallery-info call the page makes on load, and a health ping as a cheap
 *   baseline. GET-only and idempotent — it never writes, never RSVPs, never
 *   touches an admin or payment path.
 *
 * WHERE TO RUN IT
 *   ON THE VM (or a same-region cloud box), NOT your laptop. Hammering from a
 *   home connection measures your own bandwidth, not the e2-standard-4. Run it
 *   at a LOW-TRAFFIC hour — while it runs it is indistinguishable from a DoS.
 *
 * INSTALL (Debian/Ubuntu VM):
 *   sudo apt-get install -y gnupg curl
 *   curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6.gpg
 *   echo "deb [signed-by=/usr/share/keyrings/k6.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
 *   sudo apt-get update && sudo apt-get install -y k6
 *
 * RUN (start against localhost on the VM so Caddy/TLS/WAF aren't in the path,
 * or against the public host to include them — pick one):
 *   BASE=http://localhost SLUG=aarav-and-riya-demo k6 run scripts/loadtest.js
 *   BASE=https://majainvites.com SLUG=aarav-and-riya-demo k6 run scripts/loadtest.js
 *
 * IT AUTO-ABORTS. The thresholds below stop the run the moment the server
 * starts failing (error rate > 5% or p95 latency > 1.5s), so you find the knee
 * without necessarily flattening the site. The last stage before the abort is
 * your rough ceiling. Read the end-of-run summary: http_reqs (throughput),
 * http_req_duration p95, http_req_failed rate, and the VU count at failure.
 *
 * TUNE the ramp with env vars if you want a gentler or harder push:
 *   PEAK=200 RAMP=2m HOLD=3m ...
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = (__ENV.BASE || 'http://localhost').replace(/\/+$/, '');
const SLUG = __ENV.SLUG || 'aarav-and-riya-demo';
const PEAK = parseInt(__ENV.PEAK || '150', 10);   // max concurrent virtual users
const RAMP = __ENV.RAMP || '1m';
const HOLD = __ENV.HOLD || '2m';

const errors = new Rate('app_errors');

export const options = {
  scenarios: {
    guests: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '20s', target: 20 },     // warm up
        { duration: RAMP, target: PEAK },     // ramp to peak
        { duration: HOLD, target: PEAK },     // hold at peak
        { duration: '20s', target: 0 },       // ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  // The run ABORTS the moment either threshold trips — this is the safety valve.
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_duration: [{ threshold: 'p(95)<1500', abortOnFail: true, delayAbortEval: '10s' }],
  },
};

export default function () {
  // The batched fetch the invitation page makes on load — the heaviest single
  // guest request (profile + events + gallery info in one call).
  const full = http.get(`${BASE}/api/invite/${SLUG}/full`, {
    headers: { 'User-Agent': 'k6-loadtest MAJA-capacity' },
    tags: { name: 'invite_full' },
  });
  check(full, { 'full 200': (r) => r.status === 200 }) || errors.add(1);

  // The gallery-info call the same page fires.
  const gal = http.get(`${BASE}/api/public/gallery/${SLUG}/info`, {
    headers: { 'User-Agent': 'k6-loadtest MAJA-capacity' },
    tags: { name: 'gallery_info' },
  });
  check(gal, { 'gallery <500': (r) => r.status < 500 }) || errors.add(1);

  // Cheap baseline — isolates "is the box alive" from "is the query slow".
  http.get(`${BASE}/api/health`, { tags: { name: 'health' } });

  sleep(Math.random() * 2 + 1); // 1–3s think time, like a real guest reading
}

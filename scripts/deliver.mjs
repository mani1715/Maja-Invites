#!/usr/bin/env node
/**
 * deliver.mjs — attach a finished invitation link to its order.
 *
 *   MAJA_ADMIN_TOKEN=... node scripts/deliver.mjs MAJA-AB12CD /invite/riya-aarav/wedding \
 *     --base https://majainvites.com
 *
 * Run this AFTER the code is deployed and you have loaded the URL yourself.
 * It flips the order to build_status=delivered and stores live_url, which is
 * what surfaces the link in the buyer's panel and the admin console. Until
 * this runs, the page exists but the couple has no way to find it.
 *
 * Token: log in as super-admin, copy localStorage['admin_token'].
 */
import process from 'node:process';

const [code, livePath, ...rest] = process.argv.slice(2);
const flag = (n) => {
  const i = rest.indexOf(`--${n}`);
  return i === -1 ? null : rest[i + 1];
};

// Site origin (where guests open the link) and API origin are the SAME in
// production — Caddy proxies /api to the backend — but differ locally
// (3100 vs 8001). Keeping one flag for both sent the POST to the SPA, which
// answered 404 for /api/....
const base = (flag('base') || process.env.MAJA_BASE_URL || 'http://localhost:3100').replace(/\/+$/, '');
const api = (flag('api') || process.env.MAJA_API_URL || base).replace(/\/+$/, '');
const token = process.env.MAJA_ADMIN_TOKEN;
const profileId = flag('profile-id');

if (!code || !livePath) {
  console.error('usage: MAJA_ADMIN_TOKEN=... node scripts/deliver.mjs <CODE> <live_url_or_path> [--base https://site] [--api https://api-origin] [--profile-id id]');
  console.error('  --base  site origin guests open (default http://localhost:3100)');
  console.error('  --api   API origin (defaults to --base; production proxies /api on the same host)');
  process.exit(1);
}
if (!token) {
  console.error('MAJA_ADMIN_TOKEN is not set (super-admin localStorage["admin_token"]).');
  process.exit(1);
}

// Git Bash (MSYS) rewrites a leading-slash argument into a Windows path, so
// "/invite/x/y" arrives as "C:/Program Files/Git/invite/x/y" and would be
// delivered to the couple as a dead link. The SPA answers 200 for it, so the
// reachability probe below cannot catch this — reject it here instead.
if (/^[A-Za-z]:[\\/]/.test(livePath) || livePath.includes('Program Files')) {
  console.error(`Path was mangled by the shell: ${livePath}`);
  console.error('Re-run with MSYS_NO_PATHCONV=1 (Git Bash), or pass the full https:// URL.');
  process.exit(1);
}

const liveUrl = /^https?:\/\//.test(livePath) ? livePath : `${base}${livePath.startsWith('/') ? '' : '/'}${livePath}`;

if (!/\/invite\//.test(liveUrl)) {
  console.error(`Refusing to deliver: ${liveUrl} does not look like an invitation URL (/invite/...).`);
  process.exit(1);
}

const main = async () => {
  // Reachability check only. This canNOT confirm the invitation exists: the
  // site is a single-page app, so an unknown path still returns 200 with
  // index.html and React decides what to render client-side. It does catch a
  // wrong host, a down site, or TLS problems — worth keeping, but open the URL
  // yourself before delivering.
  try {
    const probe = await fetch(liveUrl, { redirect: 'follow' });
    if (!probe.ok) {
      console.error(`Refusing to deliver: ${liveUrl} returned ${probe.status}.`);
      console.error('Deploy the invitation first (git pull + redeploy on the VM), then re-run.');
      process.exit(1);
    }
  } catch (e) {
    console.error(`Refusing to deliver: could not reach ${liveUrl} (${e.message}).`);
    process.exit(1);
  }

  const res = await fetch(`${api}/api/admin/fulfillment/requests/${encodeURIComponent(code)}/deliver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ live_url: liveUrl, ...(profileId ? { profile_id: profileId } : {}) }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`Deliver failed (${res.status}): ${body}`);
    process.exit(1);
  }
  console.log(`Delivered ${code} -> ${liveUrl}`);
  console.log(body);
};

main().catch((e) => { console.error(e); process.exit(1); });

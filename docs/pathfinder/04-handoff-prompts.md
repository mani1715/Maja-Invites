# Pathfinder Phase 4 -- Handoff Prompts

Copy-paste-ready prompts for the approved Tier 1 unifications in
`03-unified-proposal.md`. Run one at a time; each is self-contained.

## D1 -- Razorpay gateway consolidation

```
Consolidate every Razorpay order-create and signature-verify call in
C:\Users\yemin\Desktop\My Projects\M0001(MajaInvites)\backend onto the
existing shared helpers in backend/event_payments.py (create_order /
verify_signature). Exact call sites to rewrite (from
docs/pathfinder/02-duplication-report.md item B2):
monetization_features.py:429, store_features.py:799,
subscription_service.py:292, user_features.py:804,
link_reactivation.py:151, premium_features.py:989, server.py:11926,
server.py:13419, studio_storage.py:520.
Guards: mechanical swap only -- no new abstraction layer, no behavior
change to happy paths, keep each flow's fulfillment logic untouched.
Signature verification must stay fail-closed (forged signature and
gateway-unreachable must remain distinguishable). After each file:
py_compile; after all: run the module-script test suite
(python -m tests.<x> from backend/, NOT pytest) and the store checkout
smoke against the local stack (see docs/REVIEW_CREDENTIALS.md).
```

## D2 -- Live-gallery store unification

```
Unify the two live-gallery photo stores in
C:\Users\yemin\Desktop\My Projects\M0001(MajaInvites)\backend onto
db.live_photos and retire db.live_gallery_photos plus the
live_wall_feed.py dual-read merge (see docs/pathfinder/02-duplication-report.md
item A and docs/pathfinder/01-flowcharts context in 00-features.md).
Steps: (1) write an idempotent backfill script migrating
live_gallery_photos rows into live_photos preserving ids/timestamps and
defaulting approved per current merge semantics in
live_wall_feed.py:103-111; (2) repoint the guest-upload write path
live_gallery_features.py:321 to live_photos; (3) update the write paths in
premium_features.py:635-657 to single-store; (4) only after verifying the
wall renders the union, delete live_wall_feed.py's merge.
Guards: do NOT delete the old collection in the same change; leave it
read-only for one release. pg_adapter is Mongo-shaped over JSONB -- no
$lookup/$unwind; filter booleans in Python.
```

## D3 -- Delete orphaned invitation-viewer surfaces

```
In C:\Users\yemin\Desktop\My Projects\M0001(MajaInvites)\backend delete the
confirmed-orphaned invitation-viewer surfaces: backend/invitation_v2.py and
its include_router at server.py:15686, and the get_event_by_slug handler at
server.py:5502. Evidence of zero callers: repo-wide grep of frontend-v2/src
and frontend/src for the route shapes and viewer_v2//api/v2 (see
docs/pathfinder/03-evidence-for-proposal.md item 3). Router registration
ORDER in server.py is load-bearing -- remove the include_router line
without reordering others. Gates: py_compile server.py, boot smoke
(uvicorn starts, /api/health db:true), spot-check /invite/review-demo
still 200.
```

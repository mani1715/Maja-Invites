"""
run_event_suite.py — the Ganesh module quality gate (Spec 12).

    cd backend && python -m tests.run_event_suite

Runs every event-module self-test AND the regression suites that stand in for
"existing MAJA functionality remains unaffected" (Spec 12 §Regression Testing),
tallies the individual assertions, and prints a pass/fail report. Non-zero exit on
any failure — suitable as a pre-deploy gate.

No Postgres / S3 / network: every suite uses the in-memory FakeDB and (for media)
a real PIL pipeline into a temp dir. The event module stays flag-OFF, so a green
run also demonstrates zero impact on the running platform.
"""
from __future__ import annotations

import subprocess
import sys
import time

EVENT_SUITES = [
    ("event engine (lifecycle + schema)", "tests.test_event_engine"),
    ("child collections CRUD", "tests.test_event_children"),
    ("media pipeline", "tests.test_event_media"),
    ("finance & donations", "tests.test_event_finance"),
    ("platform administration", "tests.test_event_admin"),
    ("RBAC + members", "tests.test_event_rbac"),
    ("notifications", "tests.test_event_notifications"),
    ("translation", "tests.test_event_translation"),
    ("template catalog (design assets)", "tests.test_event_templates"),
    ("public invitation + RSVP", "tests.test_event_public"),
    ("rollout flag + env override", "tests.test_event_flag"),
    ("extensibility (new type = config)", "tests.test_event_extensibility"),
    ("ganesh v2 (phase 1: registry+schema)", "tests.test_event_ganesh_v2"),
    ("ganesh v2 (money portal + leaderboard)", "tests.test_event_money"),
    ("ganesh v2 (plan → feature gating)", "tests.test_event_plan_gating"),
    ("ganesh v2 (per-day photo rules)", "tests.test_event_day_photos"),
    ("ganesh v2 (owner-set design/plan/feature prices)", "tests.test_event_pricing"),
    ("event API route order (no catch-all shadowing)", "tests.test_event_route_order"),
    ("ganesh v2 (razorpay: signatures, orders, webhook)", "tests.test_event_payments"),
    ("ganesh v2 (extra-feature requests → owner grant)", "tests.test_event_feature_requests"),
    ("ganesh v2 (buy → auto-create)", "tests.test_event_purchase"),
]

REGRESSION_SUITES = [
    ("pricing resolver", "tests.test_pricing_resolver"),
    ("pricing migration", "tests.test_pricing_migration"),
    ("pricing activation (duration+pack enforce)", "tests.test_pricing_activation"),
    ("feature-pack visibility matrix", "tests.test_feature_visibility"),
    ("pricing e2e (campaigns+flow)", "tests.test_pricing_e2e"),
    ("community matrix", "tests.test_community_matrix"),
    ("storage orchestrator", "tests.test_storage_orchestrator"),
    ("storage soft-delete", "tests.test_storage_soft_delete"),
    ("storage mirror-delete", "tests.test_storage_mirror_delete"),
    ("storage capacity", "tests.test_storage_capacity"),
    ("storage pool hooks", "tests.test_storage_pool_hooks"),
    ("storage pool jobs", "tests.test_storage_pool_jobs"),
    ("storage pool service", "tests.test_storage_pool_service"),
    ("storage providers", "tests.test_storage_providers"),
    ("storage migrate", "tests.test_storage_migrate"),
    ("subscription gateway (portfolio/backup checkout)", "tests.test_subscription_gateway"),
    ("cart a-la-carte (design + features + languages)", "tests.test_store_alacarte"),
    ("photos-only uploads + feature requests", "tests.test_photo_guard"),
    ("event folders + which-mail on details submit", "tests.test_event_folders"),
    ("studio folders (portfolio + cloud storage per photographer)", "tests.test_studio_folders"),
    ("studio credit + portfolio past-works", "tests.test_studio_credit"),
    ("portfolio SEO + professional-website fields", "tests.test_portfolio_seo"),
    ("order → invitation build (fulfillment)", "tests.test_order_to_invitation"),
    ("travel links + bulk-upload fan-out", "tests.test_travel_links"),
    ("client budget ledger", "tests.test_client_budget"),
    ("wishes auto-approve visibility", "tests.test_wishes_visibility"),
    ("SEO discovery pages (resolver + endpoints)", "tests.test_discovery"),
    ("adaptive Reels interest ranking", "tests.test_pixora_reels_interest"),
    ("pixora reco foundation (C2-C6 pure core)", "tests.test_pixora_reco"),
    ("pixora community endpoints (C2-C6 e2e)", "tests.test_pixora_community_endpoints"),
    ("public Stories rail grouping", "tests.test_pixora_stories_public"),
    ("founding vs regular pricing (honest anchoring)", "tests.test_pricing_founding"),
    ("founding settings + status + portfolio catalogue", "tests.test_founding_pricing"),
    ("support desk (tickets lifecycle + SLA + audit)", "tests.test_support_desk"),
    ("system health (aggregation + heartbeats + staleness)", "tests.test_system_health"),
    ("user investigation (360° account view + failed attempts)", "tests.test_user_investigation"),
    ("business intelligence (MRR/ARR/churn/growth/revenue)", "tests.test_business_intelligence"),
    ("disputes & chargebacks (evidence + lifecycle)", "tests.test_disputes"),
    ("mass moderation (bulk delete/resolve/suspend/restore)", "tests.test_moderation_bulk"),
    ("qr analytics (scans + uploads + storage aggregates)", "tests.test_qr_analytics"),
    ("admin security (TOTP RFC6238 + RBAC + backup codes)", "tests.test_admin_security"),
    ("auto-moderation (heuristic screen + queue feed)", "tests.test_auto_moderation"),
    ("delivery tracking (send log + webhook events + rates)", "tests.test_delivery_tracking"),
    ("storage analytics (usage + top consumers + cost est)", "tests.test_storage_analytics"),
    ("profitability (real revenue − labelled cost estimates)", "tests.test_profitability"),
    ("face-ops + providers (usage + env presence, no secrets)", "tests.test_face_ops_providers"),
    ("account security (password/email/phone change + revoke)", "tests.test_account_security"),
    ("studio earnings (finance ledger aggregation, scoped)", "tests.test_studio_earnings"),
    ("studio insights (own QR/storage/face analytics, scoped)", "tests.test_studio_insights"),
    ("portfolio leads (public enquiry -> CRM lead + timeline)", "tests.test_portfolio_leads"),
    ("pixora DM (1:1 threads, seq unread, participant guard)", "tests.test_pixora_dm"),
    ("studio staff (roles + invite/accept + ownership transfer)", "tests.test_studio_staff"),
    ("client-studio (contracts/e-sign + proofing + print orders)", "tests.test_client_studio"),
    ("cloud-backup quota (backup OR storage plan activates)", "tests.test_backup_quota"),
    ("link reactivation (pay-per-day expiry extend + verify)", "tests.test_link_reactivation"),
]


def _run(module: str):
    proc = subprocess.run([sys.executable, "-m", module], capture_output=True, text=True)
    checks = proc.stdout.count("  ok  ")
    return proc.returncode == 0, checks, proc.stdout, proc.stderr


def _section(title, suites):
    print(f"\n=== {title} ===")
    passed = total_checks = 0
    failures = []
    for label, module in suites:
        ok, checks, out, err = _run(module)
        total_checks += checks
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {label:<34} {checks:>3} checks")
        if ok:
            passed += 1
        else:
            failures.append((label, out, err))
    return passed, len(suites), total_checks, failures


def main():
    t0 = time.time()
    print("MAJA — Ganesh Chaturthi Module — Test & Acceptance Gate (Spec 12)")
    ep, en, ec, ef = _section("Event module suites", EVENT_SUITES)
    rp, rn, rc, rf = _section("Regression (existing MAJA unaffected)", REGRESSION_SUITES)

    print("\n" + "=" * 60)
    print(f"Event module : {ep}/{en} suites, {ec} checks")
    print(f"Regression   : {rp}/{rn} suites, {rc} checks")
    print(f"TOTAL        : {ep + rp}/{en + rn} suites, {ec + rc} checks in {time.time() - t0:.1f}s")

    failures = ef + rf
    if failures:
        print(f"\n{len(failures)} SUITE(S) FAILED:")
        for label, out, err in failures:
            print(f"\n--- {label} ---\n{out[-1500:]}\n{err[-800:]}")
        print("\nRESULT: NOT READY")
        sys.exit(1)
    print("\nRESULT: ALL GREEN — module gate passed (flag OFF; wedding unaffected)")


if __name__ == "__main__":
    main()

"""
Concurrency race test for the atomic capacity reservation (real Postgres).

    cd backend && python -m tests.test_storage_race

Requires a reachable Postgres (the local stack's portable PG, or set
MAJA_PG_DSN). Skips with a clear message when no server is available — run it
on the dev machine / server where the stack lives.

WHY THIS EXISTS: pg_adapter's generic `find_one_and_update` compiles capacity
guards into an inner subquery that Postgres does NOT re-check after a lock
wait, so it can over-commit under concurrency. The orchestrator therefore uses
a raw conditional UPDATE with the guard in the OUTER where. This test fires 20
truly concurrent reservations at an account that only has room for 3 and
asserts EXACTLY 3 win — proving the 80% switch can't leak.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid

DSN = os.environ.get("MAJA_PG_DSN", "postgresql://postgres@localhost:5432/maja")


async def _run() -> int:
    try:
        import asyncpg
    except ImportError:
        print("SKIP: asyncpg not installed in this interpreter "
              "(run with the backend venv python).")
        return 0

    try:
        conn = await asyncio.wait_for(asyncpg.connect(DSN), timeout=4)
    except Exception as e:
        print(f"SKIP: Postgres not reachable at {DSN} ({type(e).__name__}). "
              "Start the local stack (run.ps1) or set MAJA_PG_DSN, then re-run.")
        return 0

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from pg_adapter import Database
    from storage.orchestrator import StorageOrchestrator

    table_ok = True
    try:
        pool = await asyncpg.create_pool(dsn=DSN, min_size=2, max_size=10)
        db = Database(pool)
        await db.ensure_table("storage_accounts")

        # account with room for exactly 3 × 100-byte reservations at the 80% cap:
        # capacity 500, soft 80% → 400; committed starts at 100 → 3 more fit.
        acc_id = f"acc_racetest_{uuid.uuid4().hex[:8]}"
        doc = {"id": acc_id, "kind": "gdrive", "capacity_bytes": 500,
               "committed_bytes": 100, "soft_limit_pct": 80, "status": "active"}
        await conn.execute(
            "INSERT INTO storage_accounts (id, data) VALUES ($1, $2::jsonb)",
            acc_id, json.dumps(doc))

        orch = StorageOrchestrator(db, provider_factory=lambda k: None)
        orch._ready = True

        results = await asyncio.gather(
            *[orch._reserve(acc_id, 100) for _ in range(20)])
        wins = sum(1 for r in results if r)

        row = await conn.fetchrow(
            "SELECT (data->>'committed_bytes')::bigint AS c "
            "FROM storage_accounts WHERE id = $1", acc_id)
        committed = int(row["c"])

        # release path sanity: give one back, floor never below zero
        await orch._release(acc_id, 100)
        await orch._release(acc_id, 10_000_000)
        row2 = await conn.fetchrow(
            "SELECT (data->>'committed_bytes')::bigint AS c "
            "FROM storage_accounts WHERE id = $1", acc_id)

        await conn.execute("DELETE FROM storage_accounts WHERE id = $1", acc_id)

        assert wins == 3, f"expected exactly 3 winning reservations, got {wins}"
        assert committed == 400, f"expected committed=400 (the 80% cap), got {committed}"
        assert int(row2["c"]) == 0, f"release floor failed: {row2['c']}"
        print(f"  ok  20 concurrent reservations -> exactly {wins} won")
        print(f"  ok  committed stopped exactly at the 80% cap ({committed}/500)")
        print("  ok  release floors at zero")
        print("\nRACE TEST PASSED — the 80% guard holds under concurrency")
        return 0
    finally:
        if table_ok:
            await conn.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run()))

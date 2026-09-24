"""Concurrent first-touch of a new collection must not 500.

Regression test for: `CREATE TABLE IF NOT EXISTS` is not atomic in Postgres.
Two coroutines both pass the existence check, then collide in the system
catalog -> asyncpg.UniqueViolationError on pg_type_typname_nsp_index, and the
request 500s. Seen live as `POST /api/pixora/checkin -> 500` on a fresh DB.

Needs a live Postgres (like tests/test_storage_race.py):
    python -m tests.test_adapter_ensure_table_race
"""
import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pg_adapter import Database  # noqa: E402

DB_URL = os.environ.get("SUPABASE_DB_URL", "postgresql://postgres@localhost:5432/maja")
CONCURRENCY = 12
ROUNDS = 15


async def main() -> int:
    db = Database.lazy(DB_URL, max_size=CONCURRENCY + 2)
    await db.ensure_connected()

    tables = []
    try:
      for _ in range(ROUNDS):
        # A brand-new table name each round: this is the first-touch path.
        table = f"race_probe_{uuid.uuid4().hex[:10]}"
        tables.append(table)
        # All coroutines race to create the same new table at once.
        db._ensured.discard(table)
        results = await asyncio.gather(
            *[db.ensure_table(table) for _ in range(CONCURRENCY)],
            return_exceptions=True,
        )
        errors = [r for r in results if isinstance(r, BaseException)]
        assert not errors, f"concurrent ensure_table raised: {errors[:2]}"

        # The table must actually exist and be usable afterwards.
        await db[table].insert_one({"id": "r1", "ok": True})
        row = await db[table].find_one({"id": "r1"})
        assert row and row.get("ok") is True, f"table unusable after race: {row}"

        # Second-touch path (cache warm) must stay clean too.
        await asyncio.gather(*[db.ensure_table(table) for _ in range(CONCURRENCY)])
    finally:
        for t in tables:
            try:
                async with db._pool.acquire() as conn:
                    await conn.execute(f"DROP TABLE IF EXISTS {t}")
            except Exception:
                pass
        await db.close()

    print("ENSURE_TABLE RACE CHECKS PASSED")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except AssertionError as e:
        print(f"FAILED: {e}")
        raise SystemExit(1)

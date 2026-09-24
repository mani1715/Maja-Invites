"""
Self-test for the module rollout flag + its env override.

    cd backend && python -m tests.test_event_flag

Proves: default OFF; GANESH_MODULE_ENABLED=1 enables at boot; =0 disables; and an
admin's stored choice is respected when the env var is absent.
"""
from __future__ import annotations

import asyncio
import os
import sys
import types

from tests.aws_stub import ensure_aws_service  # noqa: E402
ensure_aws_service()
from cryptography.fernet import Fernet
os.environ["STORAGE_CRED_KEY"] = Fernet.generate_key().decode()

from tests.test_storage_orchestrator import FakeDB
import event_schema as schema
import event_registry as registry


def _check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print(f"  ok  {msg}")


async def run():
    db = FakeDB()
    await schema.ensure_schema(db)
    os.environ.pop("GANESH_MODULE_ENABLED", None)

    await registry.seed_event_registry(db)
    _check(await registry.module_enabled(db) is False, "default OFF (no env)")

    os.environ["GANESH_MODULE_ENABLED"] = "1"
    await registry.seed_event_registry(db)
    _check(await registry.module_enabled(db) is True, "GANESH_MODULE_ENABLED=1 enables the module")

    os.environ["GANESH_MODULE_ENABLED"] = "false"
    await registry.seed_event_registry(db)
    _check(await registry.module_enabled(db) is False, "GANESH_MODULE_ENABLED=false disables it")

    # env absent → keep the admin's last stored choice (here: OFF from above)
    os.environ.pop("GANESH_MODULE_ENABLED", None)
    await db.app_settings.update_one({"key": registry.MODULE_FLAG},
                                     {"$set": {"value": True}}, upsert=True)
    await registry.seed_event_registry(db)
    _check(await registry.module_enabled(db) is True, "no env → admin's stored choice preserved")

    print("\nALL FLAG TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(run())

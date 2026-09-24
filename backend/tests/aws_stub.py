"""One `aws_service` stand-in, complete enough that it cannot break an import.

46 test modules used to plant `types.ModuleType("aws_service")` — an EMPTY
module — into `sys.modules` before importing `server.py`, so that pulling in
the server's import chain would not drag boto3/Pillow/CloudFront along. That is
harmless for the module that plants it and a trap for every module after it:
pytest collects the whole directory in ONE process, so the first event suite's
empty stub is still installed when a later module runs

    from aws_service import s3, bucket, upload_bytes, delete_prefix

and that fails with

    ImportError: cannot import name 's3' from 'aws_service' (unknown location)

Six modules could not be collected for that reason alone, and
`test_face_provider_wiring.py` carries a comment pinning its own alphabetical
position as a workaround rather than a fix. `pytest tests/` was unusable — only
the curated `run_event_suite` runner worked — so the rot stayed invisible.

The fix is not to stop stubbing; it is to stop stubbing with something
INCOMPLETE. This stub answers ANY name with a no-op through PEP-562 module
`__getattr__`, so it can never be the reason a later import fails, and it keeps
the exact semantics the event suites were written against: nothing here talks
to AWS. Suites that install a purpose-built fake (test_storage_providers,
test_storage_upload, test_travel_links, test_storage_orchestrator) and suites
that want the real module (test_face_provider_wiring) are both left alone —
`ensure_aws_service()` only fills a vacuum.
"""
from __future__ import annotations

import sys
import types

_MARK = "_maja_permissive_aws_stub"


def _noop(*_args, **_kwargs):
    """Every attribute of the stub. Returns None, touches nothing."""
    return None


def _is_furnished(mod: types.ModuleType) -> bool:
    """True if this module already means something to somebody.

    A real import has a `__file__`; a purpose-built fake has public attributes.
    Either way it is not ours to replace.
    """
    if getattr(mod, "__file__", None):
        return True
    if getattr(mod, _MARK, False):
        return True
    return any(not name.startswith("_") for name in vars(mod))


def ensure_aws_service() -> types.ModuleType:
    """Guarantee `import aws_service` resolves to something with every name.

    Idempotent, and safe to call from module scope before importing the server.
    """
    existing = sys.modules.get("aws_service")
    if existing is not None and _is_furnished(existing):
        return existing

    stub = types.ModuleType("aws_service")
    # PEP 562: module-level __getattr__ is consulted for any name not found in
    # the module dict, which is what makes `from aws_service import <anything>`
    # succeed no matter which names the importing module asks for.
    stub.__getattr__ = lambda _name: _noop
    setattr(stub, _MARK, True)
    sys.modules["aws_service"] = stub
    return stub

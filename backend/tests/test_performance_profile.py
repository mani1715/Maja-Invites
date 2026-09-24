"""
Runs the client performance policy's own self-check as part of the suite.

`yarn build` is the only static gate frontend-v2 has, and it never evaluates a
tier — a policy that scored every device identically would build perfectly
clean. Two `__main__`-style self-tests in this tree were never collected by
pytest and rotted unnoticed for exactly that reason, so this one is wired in
from the start.

Skips (never silently passes) when node is unavailable.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

SELFTEST = (Path(__file__).resolve().parent.parent.parent
            / "frontend-v2" / "src" / "lib" / "performanceProfile.selftest.mjs")

pytestmark = [
    pytest.mark.skipif(shutil.which("node") is None, reason="node not installed"),
    pytest.mark.skipif(not SELFTEST.exists(), reason="frontend-v2 not in this checkout"),
]


def test_performance_profile_selfcheck():
    r = subprocess.run(["node", str(SELFTEST)], capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, f"performance policy self-check failed:\n{r.stdout}\n{r.stderr}"
    assert "0 failed" in r.stdout, r.stdout

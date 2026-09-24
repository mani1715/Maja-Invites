"""normalize_rsvp_status — one vocabulary for three dashboards.

Regression for the 2026-08-17 forensic finding: three aggregation endpoints in
server.py filtered rsvps.status against three incompatible spellings
(yes/no/maybe vs confirmed/declined/pending vs accepted/declined/pending);
the submit path only ever writes yes/no/maybe, so two dashboards counted zero.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-a-real-key")

from rsvp_status import normalize_rsvp_status  # noqa: E402


def test_canonical_values_pass_through():
    assert normalize_rsvp_status("yes") == "yes"
    assert normalize_rsvp_status("no") == "no"
    assert normalize_rsvp_status("maybe") == "maybe"


def test_legacy_confirmed_declined_pending_map():
    assert normalize_rsvp_status("confirmed") == "yes"
    assert normalize_rsvp_status("declined") == "no"
    assert normalize_rsvp_status("pending") == "maybe"


def test_legacy_accepted_maps():
    assert normalize_rsvp_status("accepted") == "yes"
    assert normalize_rsvp_status("attending") == "yes"
    assert normalize_rsvp_status("not_attending") == "no"


def test_junk_and_missing_fall_to_maybe():
    assert normalize_rsvp_status(None) == "maybe"
    assert normalize_rsvp_status("") == "maybe"
    assert normalize_rsvp_status("  YES ") == "yes"   # case/space tolerant
    assert normalize_rsvp_status("banana") == "maybe"

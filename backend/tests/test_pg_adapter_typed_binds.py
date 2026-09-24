"""Promoted columns must be bound with their real Python type.

A "promoted" field is a REAL typed Postgres column generated from the JSONB
`data` blob (see db/schema.sql). `_bind()` has to hand asyncpg a value of the
matching Python type — asyncpg does no coercion and raises DataError when the
types disagree.

The timestamp half of this was already handled. The boolean half was not, and it
surfaced as a production 500: featuring a guest wish
(`POST /api/client/wishes/{id}/feature`, and the identical admin route in
`wishes_features.py`) filters on a promoted boolean column, so `_as_text(True)`
sent the string 'true' and asyncpg refused to bind it. Integers and numerics had
the same latent bug.

These are unit tests over the query builder — no database, no live stack — so
they stay honest even when Postgres isn't running.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pg_adapter import Collection, _Param


def _bind_one(coltype: str, value):
    """Bind `value` against a promoted column of `coltype`; return what asyncpg
    would actually receive."""
    col = Collection.__new__(Collection)          # no DB needed for the builder
    p = _Param()
    col._bind("flag", value, {"flag": coltype}, p)
    return p.vals[-1]


def test_boolean_column_binds_real_bool():
    for given in (True, False):
        got = _bind_one("boolean", given)
        assert isinstance(got, bool), f"{given!r} -> {got!r} ({type(got).__name__}), expected bool"
        assert got is given


def test_boolean_column_accepts_json_string_form():
    # JSONB round-trips booleans as the strings 'true'/'false'.
    assert _bind_one("boolean", "true") is True
    assert _bind_one("boolean", "false") is False


def test_integer_column_binds_real_int():
    assert _bind_one("integer", 7) == 7
    assert isinstance(_bind_one("bigint", "42"), int)
    # bool is a subclass of int — must not sneak through as True/False.
    assert _bind_one("integer", True) == 1
    assert not isinstance(_bind_one("integer", True), bool)


def test_numeric_column_binds_real_float():
    got = _bind_one("numeric", "12.5")
    assert isinstance(got, float) and got == 12.5


def test_timestamp_column_still_binds_datetime():
    """The case that was already correct — guard against a regression."""
    got = _bind_one("timestamp with time zone", "2026-08-17T10:00:00+00:00")
    assert isinstance(got, datetime)
    got2 = _bind_one("timestamp with time zone", datetime(2026, 8, 17, tzinfo=timezone.utc))
    assert isinstance(got2, datetime)


def test_unknown_and_text_columns_still_bind_text():
    """Anything without a typed rule keeps the old text behaviour, so JSONB
    comparisons are unaffected."""
    assert _bind_one("text", "hello") == "hello"
    assert isinstance(_bind_one("uuid", "not-a-uuid-but-text-is-fine"), str)
    # Garbage for a typed column falls back to text rather than raising here;
    # Postgres is what should reject it, not the query builder.
    assert isinstance(_bind_one("integer", "not-a-number"), str)


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"  ok  {name}")
    print("pg_adapter typed binds OK")

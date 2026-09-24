#!/usr/bin/env python3
"""Refuse to let a secret leave this machine.

CLAUDE.md says "before every push, scan the staged diff for secret patterns".
That was a habit, and habits are exactly what fails on the push you make at
11pm. This is the same rule as a gate.

CI already runs gitleaks, but only against the working tree of a commit that
has ALREADY been pushed — by then the secret is on a remote and rotation is the
only remedy. This runs before the push, where refusing still costs nothing.

  python scripts/scan_secrets.py                 # staged changes (pre-commit)
  python scripts/scan_secrets.py --range A..B    # a commit range (pre-push)
  python scripts/scan_secrets.py --tree          # every tracked file
  python scripts/scan_secrets.py --install-hooks # wire up .git/hooks

Exit code 1 means something matched. Findings are printed REDACTED — a scanner
that echoes the secret into your terminal scrollback has leaked it again.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Each rule is (name, regex). Written to match the CREDENTIAL, not the variable
# name — `AWS_SECRET_ACCESS_KEY=` in an .env.example is fine and must not fire,
# or the gate gets disabled within a week for crying wolf.
RULES: list[tuple[str, re.Pattern]] = [
    ("AWS access key id", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("AWS secret access key", re.compile(
        r"aws_secret_access_key\s*[=:]\s*['\"]?([A-Za-z0-9/+=]{40})['\"]?", re.I)),
    ("Razorpay live key", re.compile(r"\brzp_live_[A-Za-z0-9]{10,}\b")),
    ("Razorpay test key", re.compile(r"\brzp_test_[A-Za-z0-9]{10,}\b")),
    ("Stripe live key", re.compile(r"\bsk_live_[A-Za-z0-9]{16,}\b")),
    ("Google/Gemini API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("JWT (3-part, signed)", re.compile(
        r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b")),
    ("private key block", re.compile(
        r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----")),
    ("Slack token", re.compile(r"\bxox[abprs]-[0-9A-Za-z-]{10,}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("Postgres URL with password", re.compile(
        r"postgres(?:ql)?://[^:\s]+:(?!\*{3})([^@\s'\"]{6,})@[^\s'\"]+", re.I)),
]

# Anything whose captured value is one of these is a placeholder, not a secret.
#
# Getting this list right is the difference between a gate people keep and one
# they disable. The first run fired on three things that were all fine: a doc
# comment showing postgres/postgres, a `${POSTGRES_PASSWORD}` interpolation, and
# a fixture key literally named "LiveLooking123". A scanner that cries wolf
# three times out of three gets bypassed, and then it is worse than nothing.
# Applied to the matched VALUE. A value that says CHANGEME is not a secret.
PLACEHOLDER = re.compile(
    r"PLACEHOLDER|CHANGEME|CHANGE_ME|YOUR[_-]?|EXAMPLE|DUMMY|REPLACE|FAKE|"
    r"SAMPLE|xxxx+|\.{3}|<[^>]+>|localdev|test[_-]?only|LiveLooking|"
    r"\$\{[^}]+\}|"                      # ${VAR} interpolation, not a value
    r"\$[A-Z_]{3,}",                       # $VAR
    re.I,
)

# Applied to the whole LINE, and deliberately much narrower.
#
# The value-level list above must NOT be reused here. It contains "EXAMPLE", and
# a line-level match on that exempted
#     postgresql://maja_prod:S0meR3alP4ssw0rd@db.example.com:5432/maja
# from every rule — a real password waved through because its HOST was
# example.com. Caught by feeding the scanner a deliberate canary rather than by
# reading it. Only unambiguous "this line is illustrative" markers belong here.
LINE_PLACEHOLDER = re.compile(
    r"PLACEHOLDER|CHANGEME|CHANGE_ME|\$\{[^}]+\}|"
    r"#\s*(example|sample|e\.g\.)",
    re.I,
)

# Credential pairs that are documentation defaults everywhere, not anyone's
# password. Matched against the whole URL.
DUMMY_CREDS = re.compile(
    r"://(postgres:postgres|root:root|user:(pass(word)?|user)|admin:admin|"
    r"maja:localdev\w*)@", re.I,
)

# Razorpay TEST keys are detected but do NOT fail the run: they cannot move
# money, and the repo legitimately carries them in fixtures. Live keys do fail.
SOFT_RULES: list[tuple[str, re.Pattern]] = [
    ("Razorpay test key (not fatal)", re.compile(r"rzp_test_[A-Za-z0-9]{10,}")),
]

# Files that legitimately contain secret-SHAPED strings.
SKIP_PATHS = re.compile(
    r"(^|/)(\.git/|node_modules/|\.venv/|dist/|build/|__pycache__/)"
    r"|\.(png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|zip|tar|gz|lock)$"
    r"|(^|/)(yarn\.lock|package-lock\.json)$"
    r"|(^|/)scripts/scan_secrets\.py$",       # this file lists the patterns
    re.I,
)


def redact(s: str) -> str:
    s = s.strip()
    if len(s) <= 12:
        return s[:2] + "…"
    return f"{s[:6]}…{s[-4:]} ({len(s)} chars)"


def scan_text(text: str, origin: str) -> list[str]:
    out = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        if len(line) > 4000:            # minified bundle; not hand-written
            continue
        for name, rx in RULES:
            m = rx.search(line)
            if not m:
                continue
            full = m.group(0)
            value = m.group(1) if m.groups() else full
            if PLACEHOLDER.search(value) or LINE_PLACEHOLDER.search(line):
                continue
            if DUMMY_CREDS.search(full):
                continue
            out.append(f"{origin}:{lineno}  {name}  ->  {redact(value)}")
    return out


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True,
                          text=True, errors="replace").stdout


def added_lines(diff: str) -> str:
    """Only lines the change ADDS. A secret being deleted is a fix, not a leak."""
    keep = []
    for line in diff.splitlines():
        if line.startswith("+") and not line.startswith("+++"):
            keep.append(line[1:])
        elif line.startswith("+++ b/"):
            keep.append(f"\n### {line[6:]}\n")
    return "\n".join(keep)


def scan_diff(diff: str, label: str) -> list[str]:
    findings, current = [], label
    for lineno, line in enumerate(added_lines(diff).splitlines(), start=1):
        if line.startswith("### "):
            current = line[4:]
            continue
        if SKIP_PATHS.search(current):
            continue
        findings.extend(scan_text(line, current))
    return findings


def scan_tree() -> list[str]:
    findings = []
    for rel in git("ls-files").splitlines():
        if SKIP_PATHS.search(rel):
            continue
        p = REPO / rel
        try:
            if p.stat().st_size > 2_000_000:
                continue
            findings.extend(scan_text(p.read_text(encoding="utf-8", errors="replace"), rel))
        except (OSError, ValueError):
            continue
    return findings


HOOK = """#!/bin/sh
# Installed by scripts/scan_secrets.py --install-hooks
exec python "$(git rev-parse --show-toplevel)/scripts/scan_secrets.py" %s
"""


def install_hooks() -> int:
    hooks = REPO / ".git" / "hooks"
    hooks.mkdir(parents=True, exist_ok=True)
    for name, arg in (("pre-commit", ""), ("pre-push", "--range @{u}..HEAD")):
        p = hooks / name
        p.write_text(HOOK % arg, encoding="utf-8")
        os.chmod(p, 0o755)
        print(f"installed {p.relative_to(REPO)}")
    print("\nBypass in a genuine emergency with --no-verify, then rotate whatever "
          "you pushed.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--range", help="commit range, e.g. origin/main..HEAD")
    ap.add_argument("--tree", action="store_true", help="scan every tracked file")
    ap.add_argument("--install-hooks", action="store_true")
    args = ap.parse_args()

    if args.install_hooks:
        return install_hooks()

    if args.tree:
        findings, what = scan_tree(), "tracked files"
    elif args.range:
        rng = args.range
        if "@{u}" in rng and not git("rev-parse", "--abbrev-ref", "@{u}").strip():
            # No upstream yet (first push of a branch): fall back to everything
            # reachable, rather than silently scanning nothing.
            rng = "HEAD"
        findings, what = scan_diff(git("diff", "-U0", rng), rng), rng
    else:
        findings, what = scan_diff(git("diff", "-U0", "--cached"), "staged"), "staged changes"

    if not findings:
        print(f"secret scan: clean ({what})")
        return 0

    print(f"\nsecret scan: {len(findings)} finding(s) in {what}\n", file=sys.stderr)
    for f in findings:
        print(f"  {f}", file=sys.stderr)
    print("\nValues above are redacted. If one is a real credential:\n"
          "  1. do NOT push\n"
          "  2. move it into a gitignored .env\n"
          "  3. rotate it anyway if it was ever committed — see SECURITY_ROTATION.md\n",
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())

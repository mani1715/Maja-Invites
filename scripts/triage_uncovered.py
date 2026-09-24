"""Verify the classifier's UNCOVERED list instead of trusting it.

classify.py buckets by exact normalized path, so it reports UNCOVERED whenever
v2 reaches the same resource by a slightly different literal — e.g. it flagged
/api/public/discovery/{} and /api/public/p/{} as missing when both are called,
just written differently. It also flags paths the backend no longer serves.

For each candidate this checks two things independently:
  BACKEND  does a route for it still exist at all?
  V2       does anything under frontend-v2/src reference that path stem?

Only "backend yes, v2 no" is a real gap.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(r"C:\Claude\Maja invites\new_maja_invites")
BACK = ROOT / "backend"
V2 = ROOT / "frontend-v2" / "src"

CANDIDATES = [
    "/api/admin/photo-requests/all", "/api/admin/workspaces", "/api/admin/workspaces/analytics",
    "/api/analytics/export", "/api/analytics/summary", "/api/profiles/{}/features",
    "/api/admin/photographer/profile", "/api/admin/photographer/availability",
    "/api/push/preferences", "/api/push/register",
    "/api/campaigns/active", "/api/pricing/catalog", "/api/pricing/quote",
    "/api/auth/me-supabase", "/api/auth/sync-supabase-user",
    "/api/super-admin/gallery-uploads",
    "/api/super-admin/photographers/{}/detail", "/api/super-admin/profiles/{}/watermark",
    "/api/live-upload/{}/status", "/api/live-upload/{}",
    "/api/public/p/{}", "/api/track",
    "/api/public/addons", "/api/public/expiry-tiers",
    "/api/profiles/{}/theme",
    "/api/pixora/search", "/api/admin/upload-video", "/api/translate",
    "/api/cloud-backup/download-zip", "/api/store/design-offer/{}",
    "/api/public/design-pricing", "/api/admin/gallery/aws/health",
    "/api/public/photographer-stats", "/api/admin/expiry-tiers",
    "/api/public/discovery/{}", "/api/studio/wedding/{}", "/api/admin/bi/overview",
    "/api/admin/impersonate", "/api/public/food-donation",
    "/api/public/referral-code-by-slug/{}", "/api/public/invite/{}/wishes",
]

SKIP = {"node_modules", "dist", "build", "__pycache__"}


def read_all(root, exts):
    out = []
    for f in root.rglob("*"):
        if f.suffix not in exts or any(p in SKIP for p in f.parts):
            continue
        try:
            out.append((f, f.read_text(encoding="utf-8", errors="ignore")))
        except Exception:
            pass
    return out


back_files = read_all(BACK, {".py"})
v2_files = read_all(V2, {".js", ".jsx"})


def stem(p):
    """Everything before the first {} placeholder — the literal prefix that a
    caller must contain no matter how it writes the interpolation."""
    return p.split("{}")[0].rstrip("/")


real_gaps, dead, covered = [], [], []

for path in CANDIDATES:
    s = stem(path)
    in_back = any(re.search(re.escape(s) + r'[a-z0-9/{}_-]*"', t) or f'"{s}"' in t
                  for _, t in back_files)
    hit = next((f.name for f, t in v2_files if s in t), None)

    if not in_back:
        dead.append(path)
    elif hit:
        covered.append((path, hit))
    else:
        real_gaps.append(path)

print(f"=== DEAD — no backend route ({len(dead)}) ===")
for p in dead:
    print("   ", p)

print(f"\n=== FALSE POSITIVES — v2 does call these ({len(covered)}) ===")
for p, where in covered:
    print(f"    {p:<45} {where}")

print(f"\n=== REAL GAPS — backend serves it, v2 never mentions it ({len(real_gaps)}) ===")
for p in real_gaps:
    print("   ", p)

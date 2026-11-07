"""
audit_site_content.py - Exhaustive site-wide content and UI inspection.
Tests Home page, Before Login pages, and After Login (Studio/Admin) pages on http://localhost:8127.
Inspects text, headings, buttons, images, console errors, and placeholder strings.
"""
import os
import json
import re
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ARTIFACTS_DIR = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:8127"
API_URL = "http://127.0.0.1:8001"

SUSPICIOUS_PATTERNS = [
    re.compile(r"\blorem\s+ipsum\b", re.I),
    re.compile(r"\[object\s+Object\]", re.I),
    re.compile(r"\bundefined\b", re.I),
    re.compile(r"\bNaN\b"),
    re.compile(r"\bTODO\b"),
    re.compile(r"\bTBD\b"),
    re.compile(r"\{\{[^}]+\}\}"),  # Unrendered mustache templates
]

def get_auth_token():
    req = urllib.request.Request(
        f"{API_URL}/api/auth/login",
        data=json.dumps({"email": "test.studio@maja.test", "password": "MajaTest@123"}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        return data.get("access_token") or data.get("token")

def audit():
    token = get_auth_token()
    print("Obtained studio test JWT token:", token[:15] + "...")

    pages_to_audit = [
        # 1. Home Page
        {"category": "Home Page", "name": "Landing / Home", "path": "/", "auth": False},
        
        # 2. Before Login
        {"category": "Before Login", "name": "Sign In", "path": "/signin", "auth": False},
        {"category": "Before Login", "name": "Sign Up", "path": "/signup", "auth": False},
        {"category": "Before Login", "name": "Features", "path": "/features", "auth": False},
        {"category": "Before Login", "name": "Pricing", "path": "/pricing", "auth": False},
        {"category": "Before Login", "name": "How It Works", "path": "/how-it-works", "auth": False},
        {"category": "Before Login", "name": "Portfolio Samples", "path": "/samples", "auth": False},
        {"category": "Before Login", "name": "Browse Designs", "path": "/browse", "auth": False},
        {"category": "Before Login", "name": "FAQ", "path": "/faq", "auth": False},
        {"category": "Before Login", "name": "Contact & Support", "path": "/contact", "auth": False},
        {"category": "Before Login", "name": "Terms of Service", "path": "/terms", "auth": False},
        {"category": "Before Login", "name": "Privacy Policy", "path": "/privacy", "auth": False},
        
        # 3. After Login (Studio & Admin)
        {"category": "After Login", "name": "Studio Dashboard", "path": "/studio", "auth": True},
        {"category": "After Login", "name": "Studio Invitations", "path": "/studio/invitations", "auth": True},
        {"category": "After Login", "name": "Studio Clients", "path": "/studio/clients", "auth": True},
        {"category": "After Login", "name": "Studio Gallery & Camera Transfer", "path": "/studio/gallery-new", "auth": True},
        {"category": "After Login", "name": "Studio Portfolio", "path": "/studio/portfolio", "auth": True},
        {"category": "After Login", "name": "Studio Storage", "path": "/studio/storage", "auth": True},
        {"category": "After Login", "name": "Studio Backup", "path": "/studio/backup", "auth": True},
        {"category": "After Login", "name": "Studio Notifications", "path": "/studio/notifications", "auth": True},
        {"category": "After Login", "name": "Studio Messages", "path": "/studio/messages", "auth": True},
        {"category": "After Login", "name": "Admin Dashboard", "path": "/admin/dashboard", "auth": True},
    ]

    results = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            headless=True
        )
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        # Set cookie consent so banner does not block UI
        context.add_init_script("localStorage.setItem('maja_cookie_consent', JSON.stringify({version: '1.0', analytics: false, marketing: false, decided_at: new Date().toISOString()}));")
        page = context.new_page()

        for item in pages_to_audit:
            url = f"{BASE_URL}{item['path']}"
            page_errors = []
            console_errors = []
            failed_requests = []

            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            page.on("requestfailed", lambda req: failed_requests.append(req.url))

            # Set auth if needed
            if item["auth"]:
                page.goto(BASE_URL)
                page.evaluate(f"() => {{ localStorage.setItem('admin_token', '{token}'); }}")
            else:
                page.goto(BASE_URL)
                page.evaluate("() => { localStorage.removeItem('admin_token'); }")

            try:
                page.goto(url, wait_until="networkidle", timeout=12000)
            except Exception as e:
                # Fallback if networkidle timed out (e.g. background polling)
                page.wait_for_load_state("domcontentloaded")
                page.wait_for_timeout(1500)

            page.wait_for_timeout(1000)

            # Check headings
            h1s = page.locator("h1").all_inner_texts()
            h2s = page.locator("h2").all_inner_texts()[:6]
            h3s = page.locator("h3").all_inner_texts()[:6]
            
            # Check buttons & navigation links
            buttons = [b.strip() for b in page.locator("button").all_inner_texts() if b.strip()][:10]
            links = [l.strip() for l in page.locator("a").all_inner_texts() if l.strip()][:10]

            # Check body text
            body_text = page.locator("body").inner_text()
            
            # Look for suspicious strings
            found_suspicious = []
            for pattern in SUSPICIOUS_PATTERNS:
                matches = pattern.findall(body_text)
                if matches:
                    found_suspicious.extend(matches[:3])

            # Check image health
            img_stats = page.evaluate("""() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                const broken = imgs.filter(i => i.src && (i.naturalWidth === 0 || i.complete === false)).map(i => i.src);
                return { total: imgs.length, broken: broken.slice(0, 5) };
            }""")

            # Screenshot
            safe_name = item["name"].lower().replace(" ", "_").replace("/", "_").replace("&", "_")
            shot_filename = f"audit_{safe_name}.png"
            shot_path = ARTIFACTS_DIR / shot_filename
            try:
                page.screenshot(path=str(shot_path), full_page=False)
            except Exception:
                pass

            res = {
                "category": item["category"],
                "name": item["name"],
                "path": item["path"],
                "h1": [h.strip() for h in h1s if h.strip()],
                "h2_sample": [h.strip() for h in h2s if h.strip()],
                "buttons_sample": buttons,
                "links_sample": links,
                "text_length": len(body_text),
                "suspicious_patterns": found_suspicious,
                "img_total": img_stats["total"],
                "broken_images": img_stats["broken"],
                "page_errors": page_errors,
                "console_errors": [c for c in console_errors if not "favicon" in c and not "404" in c][:3],
                "screenshot": shot_filename
            }
            results.append(res)
            print(f"[{item['category']}] {item['name']} ({item['path']}) -> H1: {res['h1'][:1]} | Body: {len(body_text)} chars | Broken Img: {len(img_stats['broken'])} | Errors: {len(page_errors)}")

        browser.close()

    out_json = ARTIFACTS_DIR / "audit_site_content_results.json"
    out_json.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("\nSaved full audit results to:", out_json)

if __name__ == "__main__":
    audit()

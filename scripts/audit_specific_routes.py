import json
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")

req = urllib.request.Request(
    "http://127.0.0.1:8001/api/auth/login",
    data=json.dumps({"email": "test.studio@maja.test", "password": "MajaTest@123"}).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode())["access_token"]

with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        headless=True
    )
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    context.add_init_script("localStorage.setItem('maja_cookie_consent', JSON.stringify({version: '1.0', analytics: false, marketing: false, decided_at: new Date().toISOString()}));")
    
    # 1. /portfolio-samples
    page = context.new_page()
    page.goto("http://localhost:8127/portfolio-samples", wait_until="networkidle")
    page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT / "audit_portfolio_samples_real.png"))
    print("Portfolio Samples H1:", page.locator("h1").all_inner_texts())
    print("Portfolio Samples H2:", page.locator("h2").all_inner_texts()[:5])
    print("Portfolio Samples text snippet:", page.locator("body").inner_text()[:400])

    # 2. /studio/galleries/new
    page2 = context.new_page()
    page2.goto("http://localhost:8127/")
    page2.evaluate(f"() => localStorage.setItem('admin_token', '{token}');")
    page2.goto("http://localhost:8127/studio/galleries/new", wait_until="networkidle")
    page2.wait_for_timeout(1000)
    page2.screenshot(path=str(OUT / "audit_studio_gallery_new_real.png"))
    print("\nStudio Gallery New H1:", page2.locator("h1").all_inner_texts())
    print("Studio Gallery New H2:", page2.locator("h2").all_inner_texts()[:5])
    print("Studio Gallery New Buttons:", [b.strip() for b in page2.locator("button").all_inner_texts() if b.strip()][:8])
    print("Studio Gallery New text snippet:", page2.locator("body").inner_text()[:400])

    browser.close()

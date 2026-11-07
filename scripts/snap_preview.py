import os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT_DIR = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        
        # 1. Pricing
        page.goto("http://localhost:8127/pricing", wait_until="networkidle")
        page.wait_for_timeout(1000)
        pricing_shot = OUT_DIR / "snap_pricing_before.png"
        page.screenshot(path=str(pricing_shot), full_page=False)
        print("Captured:", pricing_shot)

        # 2. Community
        page.goto("http://localhost:8127/community", wait_until="networkidle")
        page.wait_for_timeout(1000)
        community_shot = OUT_DIR / "snap_community_before.png"
        page.screenshot(path=str(community_shot), full_page=False)
        print("Captured:", community_shot)

        browser.close()

if __name__ == "__main__":
    main()

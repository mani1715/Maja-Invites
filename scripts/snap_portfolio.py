from pathlib import Path
from playwright.sync_api import sync_playwright

OUT_DIR = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 850})
        
        # 1. Main portfolio samples page
        page.goto("http://localhost:8127/portfolio-samples", wait_until="networkidle")
        page.wait_for_timeout(1000)
        p1 = OUT_DIR / "snap_portfolio_samples_fixed.png"
        page.screenshot(path=str(p1), full_page=False)
        print("Captured:", p1)

        # 2. Click "Explore design" on first card or go to golden
        page.goto("http://localhost:8127/portfolio-samples?design=golden", wait_until="networkidle")
        page.wait_for_timeout(1000)
        p2 = OUT_DIR / "snap_portfolio_single_design_fixed.png"
        page.screenshot(path=str(p2), full_page=False)
        print("Captured:", p2)

        browser.close()

if __name__ == "__main__":
    main()

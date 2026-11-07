import asyncio
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir.parent))

from playwright.async_api import async_playwright

ARTIFACTS_DIR = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")

VIEWPORTS = [
    {"name": "desktop_1440", "width": 1440, "height": 900, "expected_cols": 4, "expected_gap": "16px"},
    {"name": "laptop_1024", "width": 1024, "height": 800, "expected_cols": 4, "expected_gap": "16px"},
    {"name": "tablet_768", "width": 768, "height": 1024, "expected_cols": 3, "expected_gap": "12px"},
    {"name": "mobile_390", "width": 390, "height": 844, "expected_cols": 2, "expected_gap": "8px"},
]

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        results = []

        for vp in VIEWPORTS:
            context = await browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                is_mobile=(vp["width"] < 768),
                has_touch=(vp["width"] < 768),
            )
            page = await context.new_page()
            await page.add_init_script("localStorage.setItem('maja_cookie_consent', 'true');")
            
            await page.goto("http://localhost:8127/gallery/aarav-meera-royal-wedding", wait_until="networkidle")
            await page.wait_for_timeout(600)
            
            # Dismiss cookie banner if visible
            accept_btn = page.locator("button:has-text('Accept all')")
            if await accept_btn.is_visible():
                await accept_btn.click()
                await page.wait_for_timeout(300)

            # Verification checks via JS
            data = await page.evaluate("""() => {
                const grid = document.querySelector('.psg-grid');
                const cover = document.querySelector('.psg-cover-frame');
                const coverContainer = document.querySelector('.psg-cover-container');
                const gridContainer = document.querySelector('.psg-grid-container');
                
                const style = window.getComputedStyle(grid);
                const cols = style.gridTemplateColumns.split(' ').filter(Boolean).length;
                const gap = style.gap || style.rowGap || style.columnGap;
                
                const docScrollWidth = document.documentElement.scrollWidth;
                const winInnerWidth = window.innerWidth;
                const hasOverflow = docScrollWidth > winInnerWidth;
                
                const coverHeight = cover ? cover.getBoundingClientRect().height : 0;
                const gridWidth = gridContainer ? gridContainer.getBoundingClientRect().width : 0;
                
                return {
                    cols,
                    gap,
                    hasOverflow,
                    docScrollWidth,
                    winInnerWidth,
                    coverHeight,
                    gridWidth
                };
            }""")
            
            # Capture screenshot
            shot_path = ARTIFACTS_DIR / f"screenshot_responsive_{vp['name']}.png"
            await page.screenshot(path=str(shot_path), full_page=False)
            
            # Check album switching on 1440px
            if vp["width"] == 1440:
                haldi_btn = page.locator("button:has-text('Haldi Ceremony')")
                if await haldi_btn.is_visible():
                    await haldi_btn.click()
                    await page.wait_for_timeout(400)
                    album_data = await page.evaluate("""() => {
                        const photos = document.querySelectorAll('.psg-thumb-frame');
                        const docScrollWidth = document.documentElement.scrollWidth;
                        const winInnerWidth = window.innerWidth;
                        return {
                            count: photos.length,
                            hasOverflow: docScrollWidth > winInnerWidth
                        };
                    }""")
                    album_shot = ARTIFACTS_DIR / "screenshot_responsive_album_switch.png"
                    await page.screenshot(path=str(album_shot), full_page=False)
                    print(f"Album switch: {album_data['count']} photos displayed, overflow={album_data['hasOverflow']}")
                
                # Test Lightbox
                first_photo = page.locator(".psg-thumb-frame").first
                if await first_photo.is_visible():
                    await first_photo.click()
                    await page.wait_for_timeout(500)
                    lb_shot = ARTIFACTS_DIR / "screenshot_responsive_lightbox.png"
                    await page.screenshot(path=str(lb_shot), full_page=False)
                    print(f"Lightbox captured at {lb_shot}")

            print(f"Viewport {vp['width']}x{vp['height']} ({vp['name']}): "
                  f"Columns = {data['cols']} (Expected {vp['expected_cols']}), "
                  f"Gap = {data['gap']} (Expected {vp['expected_gap']}), "
                  f"Horizontal Overflow = {data['hasOverflow']} (scroll={data['docScrollWidth']} vs inner={data['winInnerWidth']}), "
                  f"Cover Height = {data['coverHeight']}px, Grid Width = {data['gridWidth']}px")
                  
            results.append({
                "viewport": vp["name"],
                "width": vp["width"],
                "cols": data["cols"],
                "expected_cols": vp["expected_cols"],
                "gap": data["gap"],
                "hasOverflow": data["hasOverflow"],
                "coverHeight": data["coverHeight"],
                "gridWidth": data["gridWidth"]
            })
            
            await page.close()
            await context.close()

        await browser.close()
        print("\nAll responsive verifications complete!")
        return results

if __name__ == "__main__":
    asyncio.run(verify())

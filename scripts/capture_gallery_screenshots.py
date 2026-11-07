import asyncio
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))
sys.path.insert(0, str(backend_dir.parent))

from backend.auth import create_access_token
from playwright.async_api import async_playwright

ARTIFACTS_DIR = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")

async def main():
    token = create_access_token({
        "sub": "3e95a698-0371-4702-98fe-099717688213",
        "role": "photographer",
        "email": "test.studio@maja.test"
    })
    print("Generated token:", token[:25] + "...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # ----------------------------------------------------
        # Studio Workspace Appearance Tab with Cover Repositioning
        # ----------------------------------------------------
        studio_context = await browser.new_context(viewport={"width": 1280, "height": 950})
        studio_page = await studio_context.new_page()
        
        await studio_page.add_init_script(f"""
            localStorage.setItem('admin_token', '{token}');
            localStorage.setItem('maja_cookie_consent', 'true');
        """)
        
        await studio_page.goto("http://localhost:8127/studio/invitations?tab=gallery", wait_until="networkidle")
        await studio_page.wait_for_timeout(1000)
        
        # Dismiss cookies if any
        accept_btn_s = studio_page.locator("button:has-text('Accept all')")
        if await accept_btn_s.is_visible():
            await accept_btn_s.click()
            await studio_page.wait_for_timeout(300)
            
        # Click Manage button
        manage_btn = studio_page.locator("button:has-text('Manage')").first
        if await manage_btn.is_visible():
            await manage_btn.click()
            await studio_page.wait_for_timeout(800)
            
            # Switch to Appearance tab
            appear_tab = studio_page.locator("button:has-text('Appearance')").first
            if await appear_tab.is_visible():
                await appear_tab.click()
                await studio_page.wait_for_timeout(800)
                workspace_path = ARTIFACTS_DIR / "screenshot_workspace_cover_appearance.png"
                await studio_page.screenshot(path=str(workspace_path), full_page=False)
                print(f"Captured Workspace: {workspace_path}")
        else:
            print("Manage button not found, current url:", studio_page.url)

        await studio_page.close()
        await studio_context.close()
        await browser.close()
        print("Done!")

if __name__ == "__main__":
    asyncio.run(main())

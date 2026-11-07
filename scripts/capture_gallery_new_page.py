import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

ARTIFACTS_DIR = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZTk1YTY5OC0wMzcxLTQ3MDItOThmZS0wOTk3MTc2ODgyMTMiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3OTE3MjY2NTksImp0aSI6IjE0ODE5YjdhMzA3NjQxMzRhNTc1MTcxZmM5MTMxOWU2In0.G4jLYz8ajPPkc6PV6dD9sW-nd1fkH8nhf0qWPFVptEI"

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # 1. Desktop Browser Session (1280x800)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        init_script = f"""
            localStorage.setItem('admin_token', '{AUTH_TOKEN}');
            localStorage.setItem('maja_cookie_consent', 'true');
            localStorage.removeItem('maja_gallery_new_draft_v1');
        """
        await page.add_init_script(init_script)

        print("Navigating to /studio/invitations?tab=gallery...")
        await page.goto("http://localhost:8127/studio/invitations?tab=gallery", wait_until="networkidle")
        await page.wait_for_timeout(2000)

        # Screenshot StudioInvitations tab showing + Create Gallery link
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_01_invitations_gallery_tab.png"))
        print("Captured screenshot_01_invitations_gallery_tab.png")

        # Click Create Gallery
        create_btn = page.locator('a[href="/studio/galleries/new"]').first
        if await create_btn.is_visible():
            await create_btn.click()
        else:
            await page.goto("http://localhost:8127/studio/galleries/new", wait_until="networkidle")

        await page.wait_for_timeout(1500)

        # Step 1: Details (Desktop)
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_02_step1_details_desktop.png"), full_page=True)
        print("Captured screenshot_02_step1_details_desktop.png")

        # Step 1: Details (Mobile 390px)
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_03_step1_details_mobile_390.png"), full_page=True)
        print("Captured screenshot_03_step1_details_mobile_390.png")

        # Back to Desktop
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.wait_for_timeout(500)

        # Fill Step 1 details
        title_input = page.locator('input[placeholder*="Diya & Kabir"]')
        await title_input.fill("Aarav & Siya Royal Heritage Wedding")
        client_input = page.locator('input[placeholder*="Kabir Sharma"]')
        await client_input.fill("Kabir Singhania")
        date_input = page.locator('input[type="date"]')
        await date_input.fill("2026-12-15")

        # Select 180 Days expiry card
        cards = page.locator('.sgn-expiry-card')
        if await cards.count() >= 2:
            await cards.nth(1).click()

        # Continue to Step 2
        await page.click('button:has-text("Continue to Albums & Photos")')
        await page.wait_for_timeout(3000)

        # Step 2: Albums & Photos
        # Try adding Haldi chip if not already added
        haldi_chip = page.locator('button.sgn-chip:has-text("+ Haldi")')
        if await haldi_chip.is_visible():
            await haldi_chip.click()
            await page.wait_for_timeout(500)
        reception_chip = page.locator('button.sgn-chip:has-text("+ Reception")')
        if await reception_chip.is_visible():
            await reception_chip.click()
            await page.wait_for_timeout(500)

        # Add custom album via input
        custom_input = page.locator('input[placeholder="New album name..."]')
        if await custom_input.is_visible():
            await custom_input.fill("Sangeet Night")
            await page.click('button:has-text("+ Add")')
            await page.wait_for_timeout(500)

        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_04_step2_albums_desktop.png"), full_page=True)
        print("Captured screenshot_04_step2_albums_desktop.png")

        # Step 2: Albums & Photos (Mobile 390px)
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_05_step2_albums_mobile_390.png"), full_page=True)
        print("Captured screenshot_05_step2_albums_mobile_390.png")

        # Back to Desktop
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.wait_for_timeout(500)

        # Continue to Step 3
        await page.click('button:has-text("Continue to Appearance")')
        await page.wait_for_timeout(1500)

        # Step 3: Appearance & Branding (Desktop)
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_06_step3_appearance_desktop.png"), full_page=True)
        print("Captured screenshot_06_step3_appearance_desktop.png")

        # Step 3: Appearance (Mobile 390px)
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_07_step3_appearance_mobile_390.png"), full_page=True)
        print("Captured screenshot_07_step3_appearance_mobile_390.png")

        # Back to Desktop
        await page.set_viewport_size({"width": 1280, "height": 800})
        await page.wait_for_timeout(500)

        # Continue to Step 4
        await page.click('button:has-text("Continue to Review & Share")')
        await page.wait_for_timeout(1500)

        # Step 4: Review & Share (Desktop Draft)
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_08_step4_review_desktop.png"), full_page=True)
        print("Captured screenshot_08_step4_review_desktop.png")

        # Publish Gallery
        publish_btn = page.locator('button:has-text("Publish Gallery Live")')
        if await publish_btn.is_visible():
            await publish_btn.click()
            await page.wait_for_timeout(2500)

        # Step 4: Published (Desktop with Live Link & QR)
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_09_step4_published_desktop.png"), full_page=True)
        print("Captured screenshot_09_step4_published_desktop.png")

        # Step 4: Published (Mobile 390px)
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(ARTIFACTS_DIR / "screenshot_10_step4_published_mobile_390.png"), full_page=True)
        print("Captured screenshot_10_step4_published_mobile_390.png")

        await browser.close()
        print("ALL_SCREENSHOTS_CAPTURED_SUCCESSFULLY")

if __name__ == "__main__":
    asyncio.run(run())

import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

sys.path.insert(0, 'backend')
from server import db

ARTIFACTS_DIR = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")

DESIGNS = [
    ("free_studio_neutral", "Studio Neutral"),
    ("basic_golden_hour", "Golden Hour"),
    ("basic_darkroom", "Monochrome Darkroom"),
    ("basic_nordic", "Nordic Light"),
    ("premium_gallery_wall", "Gallery Wall"),
    ("premium_film_strip", "Film Strip Cinematic"),
    ("premium_liquid_glass", "Liquid Glass Editorial"),
    ("premium_contact_sheet", "Analog Contact Sheet"),
    ("premium_aurora", "Aurora Portfolio"),
    ("premium_editorial", "Premium Editorial"),
]

async def capture_all():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        for design_id, design_name in DESIGNS:
            print(f"Applying design: {design_id} ({design_name})...")
            # Update DB design_id
            await db.portfolio_profiles.update_one(
                {"id": "demo_audit_studio"},
                {"$set": {"design_id": design_id}}
            )

            # 1. Desktop capture (1280x800)
            context_desk = await browser.new_context(viewport={"width": 1280, "height": 800})
            page_desk = await context_desk.new_page()
            await page_desk.add_init_script("localStorage.setItem('maja_cookie_consent', 'true');")
            await page_desk.goto("http://localhost:8127/photographer/demo-audit-studio", wait_until="networkidle")
            await page_desk.wait_for_timeout(800)

            desk_file = ARTIFACTS_DIR / f"portfolio_audit_{design_id}_desktop.png"
            await page_desk.screenshot(path=str(desk_file), full_page=True)
            print(f"Captured: {desk_file.name}")
            await context_desk.close()

            # 2. Mobile capture (390x844)
            context_mob = await browser.new_context(
                viewport={"width": 390, "height": 844},
                is_mobile=True,
                has_touch=True
            )
            page_mob = await context_mob.new_page()
            await page_mob.add_init_script("localStorage.setItem('maja_cookie_consent', 'true');")
            await page_mob.goto("http://localhost:8127/photographer/demo-audit-studio", wait_until="networkidle")
            await page_mob.wait_for_timeout(800)

            mob_file = ARTIFACTS_DIR / f"portfolio_audit_{design_id}_mobile_390.png"
            await page_mob.screenshot(path=str(mob_file), full_page=True)
            print(f"Captured: {mob_file.name}")
            await context_mob.close()

        # Also capture Portfolio Samples page (/portfolio-samples)
        context_samples = await browser.new_context(viewport={"width": 1280, "height": 800})
        page_samples = await context_samples.new_page()
        await page_samples.add_init_script("localStorage.setItem('maja_cookie_consent', 'true');")
        await page_samples.goto("http://localhost:8127/portfolio-samples", wait_until="networkidle")
        await page_samples.wait_for_timeout(800)
        samples_file = ARTIFACTS_DIR / "portfolio_audit_samples_page_desktop.png"
        await page_samples.screenshot(path=str(samples_file), full_page=True)
        print(f"Captured: {samples_file.name}")
        await context_samples.close()

        # Also capture Studio Portfolio Editor (/studio/portfolio)
        context_editor = await browser.new_context(viewport={"width": 1280, "height": 800})
        page_editor = await context_editor.new_page()
        auth_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZTk1YTY5OC0wMzcxLTQ3MDItOThmZS0wOTk3MTc2ODgyMTMiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3OTE3MjY2NTksImp0aSI6IjE0ODE5YjdhMzA3NjQxMzRhNTc1MTcxZmM5MTMxOWU2In0.G4jLYz8ajPPkc6PV6dD9sW-nd1fkH8nhf0qWPFVptEI"
        await page_editor.add_init_script(f"""
            localStorage.setItem('admin_token', '{auth_token}');
            localStorage.setItem('maja_cookie_consent', 'true');
        """)
        await page_editor.goto("http://localhost:8127/studio/portfolio", wait_until="networkidle")
        await page_editor.wait_for_timeout(1000)
        editor_file = ARTIFACTS_DIR / "portfolio_audit_studio_editor_desktop.png"
        await page_editor.screenshot(path=str(editor_file), full_page=True)
        print(f"Captured: {editor_file.name}")
        await context_editor.close()

        await browser.close()
        print("ALL_AUDIT_SCREENSHOTS_COMPLETED")

if __name__ == "__main__":
    asyncio.run(capture_all())

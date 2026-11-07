import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ARTIFACTS = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwaG90b2dyYXBoZXJfZGVmYXVsdF8wMSIsInJvbGUiOiJhZG1pbiIsImV4cCI6MTc5MTk5NDU2NiwianRpIjoiYmI1ZmFlOGVmMGY4NDEzZTliNDY4ZGE3Zjk2YzMyMWIifQ.r-UZzcOW6mRnNK7yi67OJdw7T6ej3wyN2vbvqrKv3Uw"

async def capture_workspace():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.add_init_script(f"""
            localStorage.setItem('admin_token', '{token}');
            localStorage.setItem('maja_cookie_consent', 'true');
        """)
        await page.goto("http://127.0.0.1:8127/studio/portfolio", wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(ARTIFACTS / "observed_studio_workspace_active.png"), full_page=True)
        print("Captured observed_studio_workspace_active.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_workspace())

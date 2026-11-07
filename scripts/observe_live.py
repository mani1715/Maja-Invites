import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ARTIFACTS = Path(r"C:\Users\ettel\.gemini\antigravity\brain\91d5b73b-1564-49c0-a361-6e1d8f2f11a6")

async def eager_load(page):
    await page.evaluate("""() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        imgs.forEach(img => img.loading = 'eager');
        return Promise.all(imgs.map(img => img.decode().catch(() => {})));
    }""")
    await page.wait_for_timeout(300)

async def observe():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # 1. Samples board
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        await page.add_init_script("localStorage.setItem('maja_cookie_consent', 'true');")
        await page.goto("http://127.0.0.1:8127/portfolio-samples", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=str(ARTIFACTS / "observed_samples_board.png"), full_page=True)

        # 2. Golden Hour
        await page.goto("http://127.0.0.1:8127/portfolio-samples?design=basic_golden_hour", wait_until="networkidle")
        await eager_load(page)
        await page.screenshot(path=str(ARTIFACTS / "observed_golden_hour_v3.png"), full_page=True)

        # 3. Film Strip
        await page.goto("http://127.0.0.1:8127/portfolio-samples?design=premium_film_strip", wait_until="networkidle")
        await eager_load(page)
        await page.screenshot(path=str(ARTIFACTS / "observed_film_strip_v3.png"), full_page=True)

        # 4. Liquid Glass
        await page.goto("http://127.0.0.1:8127/portfolio-samples?design=premium_liquid_glass", wait_until="networkidle")
        await eager_load(page)
        await page.screenshot(path=str(ARTIFACTS / "observed_liquid_glass_v3.png"), full_page=True)

        # 5. Editorial
        await page.goto("http://127.0.0.1:8127/portfolio-samples?design=premium_editorial", wait_until="networkidle")
        await eager_load(page)
        await page.screenshot(path=str(ARTIFACTS / "observed_editorial_v3.png"), full_page=True)

        # 6. Studio Workspace (/studio/portfolio)
        auth_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZTk1YTY5OC0wMzcxLTQ3MDItOThmZS0wOTk3MTc2ODgyMTMiLCJyb2xlIjoiYWRtaW4iLCJleHAiOjE3OTE3MjY2NTksImp0aSI6IjE0ODE5YjdhMzA3NjQxMzRhNTc1MTcxZmM5MTMxOWU2In0.G4jLYz8ajPPkc6PV6dD9sW-nd1fkH8nhf0qWPFVptEI"
        await page.add_init_script(f"""
            localStorage.setItem('admin_token', '{auth_token}');
            localStorage.setItem('maja_cookie_consent', 'true');
        """)
        await page.goto("http://127.0.0.1:8127/studio/portfolio", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=str(ARTIFACTS / "observed_studio_workspace.png"), full_page=True)

        # 7. Mobile view for Golden Hour
        page_mob = await browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
        await page_mob.add_init_script("localStorage.setItem('maja_cookie_consent', 'true');")
        await page_mob.goto("http://127.0.0.1:8127/portfolio-samples?design=basic_golden_hour", wait_until="networkidle")
        await eager_load(page_mob)
        await page_mob.screenshot(path=str(ARTIFACTS / "observed_golden_hour_mobile_v3.png"), full_page=True)

        await browser.close()
        print("RE_OBSERVATION_COMPLETE")

if __name__ == "__main__":
    asyncio.run(observe())

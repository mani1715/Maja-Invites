import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch()
  results=[]
  for concept in ['cinematic','editorial','gallery','studio']:
   for width,height,label in [(1440,1000,'desktop'),(390,844,'mobile'),(768,1024,'tablet')]:
    page=await browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    await page.goto((ROOT/'concept.html').as_uri()+'?concept='+concept)
    await page.locator('main img').evaluate_all('(imgs)=>Promise.all(imgs.map(i=>{i.loading="eager";return i.decode().catch(()=>{})}))')
    await page.screenshot(path=str(ROOT/'previews'/f'{concept}-{label}.png'),full_page=True)
    await page.screenshot(path=str(ROOT/'previews'/f'{concept}-{label}-opening.png'))
    broken=await page.locator('main img').evaluate_all('(imgs)=>imgs.filter(i=>!i.naturalWidth).length')
    overflow=await page.evaluate('document.documentElement.scrollWidth>innerWidth')
    await page.locator('[data-photo]').first.click()
    assert await page.locator('dialog').is_visible()
    await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape')
    assert not await page.locator('dialog').is_visible()
    await page.locator('input[name=name]').fill('Preview reviewer')
    await page.locator('input[name=email]').fill('review@example.com')
    await page.locator('button[type=submit]').click()
    assert 'Nothing was sent' in await page.locator('.form-status').inner_text()
    results.append(dict(concept=concept,viewport=label,broken_images=broken,overflow=overflow,errors=errors,lightbox=True,demo_form=True))
    await page.close()
   page=await browser.new_page(viewport={'width':390,'height':844},reduced_motion='reduce')
   await page.goto((ROOT/'concept.html').as_uri()+'?concept='+concept+'&sparse=1')
   await page.screenshot(path=str(ROOT/'previews'/f'{concept}-sparse.png'),full_page=True)
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await page.close()
  await browser.close()
  (ROOT/'previews'/'qa.json').write_text(json.dumps(results,indent=2))
  print(json.dumps(results))
asyncio.run(main())

import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
async def run():
 async with async_playwright() as p:
  b=await p.chromium.launch();page=await b.new_page(viewport={'width':320,'height':800})
  for k in ['cinematic','editorial','gallery','studio']:
   await page.goto('http://127.0.0.1:8139/concept.html?concept='+k)
   print(k,await page.evaluate('document.documentElement.scrollWidth>innerWidth'),flush=True)
  await page.set_viewport_size({'width':390,'height':844})
  await page.goto('http://127.0.0.1:8139/concept.html?concept=gallery&sparse=1')
  await page.screenshot(path='design/photographer-proposals/previews/gallery-sparse.png',full_page=True)
  await page.goto('http://127.0.0.1:8139/concept.html?concept=gallery')
  await page.get_by_role('button',name='Details',exact=True).click();assert await page.locator('.photo-wall figure:visible').count()==1
  await page.get_by_role('button',name='All',exact=True).click();assert await page.locator('.photo-wall figure:visible').count()==5
  await page.goto('http://127.0.0.1:8139/')
  await page.set_viewport_size({'width':1440,'height':1000})
  await page.screenshot(path='design/photographer-proposals/previews/review-board.png',full_page=True)
  print('Gallery filters and review board passed',flush=True)
  await b.close()
asyncio.run(run())

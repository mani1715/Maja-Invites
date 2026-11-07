"""Local homepage QA. API fixtures are test-only; no customer data is changed."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'design/homepage';OUT.mkdir(exist_ok=True)
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch()
 context=browser.new_context()
 context.add_init_script("localStorage.setItem('maja_cookie_consent',JSON.stringify({version:'1.0',analytics:false,marketing:false,decided_at:new Date().toISOString()}));")
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 state={'populated':False,'failure':False}
 def api(route):
  path=urlsplit(route.request.url).path
  if not path.startswith('/api/'):
   route.continue_();return
  if state['failure']:
   route.fulfill(status=503,json={'detail':'Isolated QA unavailable'});return
  if path=='/api/store/packages':
   route.fulfill(json={'packages':[{'key':k,'price':{'english':997+i}} for i,k in enumerate(['classic','premium','royal','bespoke'])]} if state['populated'] else {'packages':[]})
  elif path=='/api/public/pixora/feed':
   route.fulfill(json={'posts':[{'id':'qa-post','title':'TEST POST — isolated fixture','author':'TEST STUDIO','image_url':'/portfolio-reference/photo-2.jpg','author_url':'/photographers'}]} if state['populated'] else {'posts':[]})
  elif path=='/api/event-categories':
   route.fulfill(json={'categories':[{'id':'wedding','label':'Wedding'},{'id':'baby_birthday','label':'Baby & birthday'}]})
  else:route.fulfill(json={})
 page.route('**/api/**',api)
 for width in [320,360,390,600,768,1024,1440,1920]:
  page.set_viewport_size({'width':width,'height':844 if width<600 else 1000})
  for populated in [False,True]:
   state['populated']=populated
   page.goto('http://127.0.0.1:8143/')
   page.locator('.pxh').wait_for()
   page.locator('.pxh img').evaluate_all("imgs=>{imgs.forEach(i=>i.loading='eager');return Promise.all(imgs.map(i=>i.decode().catch(()=>{})))}")
   assert page.locator('h1').count()==1
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,populated,'overflow')
   assert page.locator('.pxh img').evaluate_all('imgs=>imgs.every(i=>i.naturalWidth>0)'),(width,'broken')
   if populated:
    page.locator('.pxh-price').first.wait_for();assert '997' in page.locator('.pxh-price').first.inner_text()
    page.locator('.cstrip').wait_for();assert page.locator('.cstrip-card').count()==1
   else:
    assert page.locator('.pxh-price').count()==0
    assert page.locator('.cstrip').count()==0
    if width in [1440,390,320,768]:
     page.locator('.pxh-footer').scroll_into_view_if_needed();page.evaluate('scrollTo(0,0)')
     page.screenshot(path=str(OUT/f'homepage-{width}-full.png'),full_page=True)
     page.screenshot(path=str(OUT/f'homepage-{width}-opening.png'))
   results.append({'width':width,'content':'populated API fixture' if populated else 'empty API','pass':True})
  print('PASS responsive',width,flush=True)
 # Motion must change while running, freeze when paused, and persist on reload.
 state['populated']=False
 page.set_viewport_size({'width':1440,'height':1000});page.goto('http://127.0.0.1:8143/')
 canvas=page.locator('.pxh-atmosphere canvas');canvas.wait_for()
 before=canvas.evaluate('c=>c.toDataURL()');page.wait_for_timeout(250);assert before!=canvas.evaluate('c=>c.toDataURL()')
 page.get_by_role('button',name='Pause ambient motion').click()
 assert page.locator('.pxh').get_attribute('data-motion')=='paused'
 page.wait_for_timeout(100);before=canvas.evaluate('c=>c.toDataURL()');page.wait_for_timeout(180);assert before==canvas.evaluate('c=>c.toDataURL()')
 page.reload();assert page.locator('.pxh').get_attribute('data-motion')=='paused'
 page.get_by_role('button',name='Resume ambient motion').click()
 # FAQ and invitation collection disclosure, including a real preview modal.
 page.locator('.pxh-faq summary').first.click();assert page.locator('.pxh-faq details').first.get_attribute('open') is not None
 page.get_by_role('button',name='For every tradition.').click()
 page.locator('.tsc-card').first.wait_for();assert page.locator('.tsc-card').count()==10
 assert page.locator('.tsc-card').first.evaluate('e=>getComputedStyle(e).opacity')=='1'
 page.locator('.tsc-art-hit').first.click();page.locator('iframe').first.wait_for()
 page.keyboard.press('Escape')
 # Mobile menu disclosure and escape focus return.
 page.goto('http://127.0.0.1:8143/');page.set_viewport_size({'width':390,'height':844})
 button=page.get_by_role('button',name='Open navigation');button.click()
 page.locator('#pxh-mobile-navigation').get_by_role('link',name='Explore Pixora').click()
 assert page.locator('#pxh-mobile-navigation').count()==0
 button.click();page.keyboard.press('Escape');assert button.evaluate('e=>e===document.activeElement')
 page.get_by_role('link',name='Join Pixora',exact=True).first.click();page.wait_for_url('**/auth/signup')
 # An unavailable API must not fabricate prices or community content.
 state['failure']=True;page.goto('http://127.0.0.1:8143/');page.locator('.pxh').wait_for()
 assert page.locator('.pxh-price').count()==0 and page.locator('.cstrip').count()==0
 page.emulate_media(reduced_motion='reduce');page.reload()
 page.get_by_role('button',name='Motion reduced by your device').wait_for();assert page.get_by_role('button',name='Motion reduced by your device').is_disabled()
 assert page.locator('.pxh-cloud').first.evaluate('e=>getComputedStyle(e).animationName')=='none'
 assert page.locator('.pxh').get_attribute('data-motion')=='paused'
 before=page.locator('canvas').evaluate('c=>c.toDataURL()');page.wait_for_timeout(200);assert before==page.locator('canvas').evaluate('c=>c.toDataURL()')
 browser.close()
assert not errors,errors
(OUT/'verification.json').write_text(json.dumps({'responsive_cases':results,'page_errors':errors,'interactions':['motion change/pause/persistence','reduced motion','FAQ','catalogue and live preview','mobile menu/Escape/focus','signup route','live-price fixture','empty/unavailable API']},indent=2),encoding='utf-8')
print('PASS 16 responsive/content cases; motion, navigation, catalogue preview, FAQ, signup, API failure and reduced motion')

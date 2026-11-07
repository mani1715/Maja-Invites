"""Local navigation/accessibility/session tests. No real-account writes."""
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'design/sitewide';checks=[]
with sync_playwright() as p:
 b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844});ctx.add_init_script("if(!sessionStorage.getItem('qa-initialized')){localStorage.setItem('admin_token','qa-token');sessionStorage.setItem('qa-initialized','1');}localStorage.setItem('maja_cookie_consent',JSON.stringify({version:'1.0',analytics:false,marketing:false,decided_at:new Date().toISOString()}));")
 page=ctx.new_page();state={'role':'super_admin','offline':False};errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def api(route):
  path=urlsplit(route.request.url).path
  if not path.startswith('/api/'):route.continue_();return
  if path=='/api/auth/me' and not state['offline']:route.fulfill(json={'id':'qa','role':state['role'],'username':'QA Studio'});return
  route.fulfill(status=503,json={'detail':'Isolated QA service unavailable'})
 page.route('**/api/**',api)
 page.goto('http://127.0.0.1:8143/admin/system-health');page.get_by_role('button',name='Open menu').wait_for()
 trigger=page.get_by_role('button',name='Open menu');trigger.click();dialog=page.get_by_role('dialog');assert dialog.is_visible()
 assert dialog.get_by_role('link',name='Cameras',exact=True).count()==1
 dialog.get_by_placeholder('Search navigation').fill('camera');assert dialog.locator('nav a').count()==1
 page.keyboard.press('Escape');dialog.wait_for(state='hidden');assert not dialog.is_visible();assert trigger.evaluate('e=>e===document.activeElement');checks.append('mobile dialog Escape restores focus; admin Cameras searchable')
 trigger.click();dialog.get_by_placeholder('Search navigation').fill('');links=dialog.locator('nav a').evaluate_all('es=>es.map(e=>e.getAttribute("href"))');page.keyboard.press('Escape')
 page.set_viewport_size({'width':1440,'height':1000});page.locator('aside').wait_for();desktop=page.locator('aside a.mj-rail-item').evaluate_all('es=>es.filter(e=>!e.textContent.includes("Log out")).map(e=>e.getAttribute("href"))');assert links==desktop;checks.append('admin desktop/mobile navigation parity')
 page.get_by_placeholder('Search navigation').fill('camera');assert page.locator('aside .mj-rail-item').count()==2;page.get_by_placeholder('Search navigation').fill('')
 page.goto('http://127.0.0.1:8143/studio/security');page.locator('aside').wait_for();assert page.locator('aside a[aria-current=page]').inner_text()=='Security'
 page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='Open menu').click();dialog=page.get_by_role('dialog');dialog.get_by_placeholder('Search navigation').fill('calendar');dialog.get_by_role('link',name='Calendar').click();page.wait_for_url('**/studio/calendar');assert not page.get_by_role('dialog').is_visible();checks.append('studio navigation filtering, active state and route change')
 state['offline']=True;page.goto('http://127.0.0.1:8143/admin/system-health');page.get_by_role('button',name='Retry connection').wait_for(timeout=20000);assert page.locator('aside').count()==0;assert page.evaluate("localStorage.getItem('admin_token')")=='qa-token';checks.append('unverified admin session is closed without losing token')
 state['offline']=False;page.get_by_role('button',name='Retry connection').click();page.get_by_role('button',name='Open menu').wait_for();checks.append('session retry restores authenticated workspace')
 state['role']='admin';page.goto('http://127.0.0.1:8143/admin/system-health');page.wait_for_url('**/studio/dashboard');checks.append('ordinary studio account cannot open admin console')
 page.evaluate("localStorage.removeItem('admin_token')");page.goto('http://127.0.0.1:8143/studio/security');page.wait_for_url('**/auth');checks.append('signed out protected route opens sign-in')
 page.goto('http://127.0.0.1:8143/not-a-real-page');page.get_by_role('heading',name='Let’s find your way back.').wait_for();page.locator('.mj-skip-link').focus();page.keyboard.press('Enter');assert page.evaluate("document.activeElement.tagName==='MAIN'");checks.append('404 navigation and skip-to-content focus')
 page.goto('http://127.0.0.1:8143/pricing');trigger=page.get_by_role('button',name='Open menu');trigger.click();page.keyboard.press('Escape');assert trigger.evaluate('e=>e===document.activeElement');checks.append('marketing Escape focus return')
 page.goto('http://127.0.0.1:8143/auth');assert 'Ananya' not in page.locator('body').inner_text();assert 'wedding photograph' not in page.locator('body').inner_text()
 assert not errors,errors
 b.close()
(OUT/'interaction-results.json').write_text(json.dumps({'checks':checks,'page_errors':errors},indent=2),encoding='utf-8');print('PASS',len(checks),'navigation/session interactions')

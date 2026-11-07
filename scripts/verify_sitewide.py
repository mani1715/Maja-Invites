"""Read-only route audit against a local Vite preview. Services intentionally unavailable.
Screenshots are failure/static states, not a claim of populated live-account testing.
"""
import json,re,argparse
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'design/sitewide'; OUT.mkdir(exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--filter',default='');parser.add_argument('--resume',action='store_true');args=parser.parse_args()
routes=json.loads((OUT/'routes.json').read_text());seen=set();selected=[]
for route in routes:
 if not route['source'] or route['redirect'] or route['component'] in seen:continue
 seen.add(route['component']);selected.append(route)
params={'slug':'qa-missing','username':'qa-studio','themeId':'hindu','eventType':'ganesh','category':'hindu','code':'qa-missing','a':'hyderabad','b':'wedding','tag':'wedding'}
results=json.loads((OUT/'audit-results.json').read_text()) if (args.resume or args.filter) and (OUT/'audit-results.json').exists() else []
with sync_playwright() as p:
 browser=p.chromium.launch()
 for width in [1440,390]:
  context=browser.new_context(viewport={'width':width,'height':960 if width>600 else 844},reduced_motion='reduce')
  context.add_init_script("localStorage.setItem('maja_cookie_consent',JSON.stringify({version:'1.0',analytics:false,marketing:false,decided_at:new Date().toISOString()}));")
  page=context.new_page();page.set_default_timeout(10000);errors=[];requests=[];state={'guard':'public'}
  page.on('pageerror',lambda e:errors.append(str(e)))
  def api(route):
   path=urlsplit(route.request.url).path
   if not path.startswith('/api/'):route.continue_();return
   requests.append(path)
   if path=='/api/auth/me':route.fulfill(json={'id':'qa-studio','username':'QA Studio','name':'QA Studio','email':'qa@example.invalid','role':'super_admin' if state['guard']=='admin' else 'admin'});return
   route.fulfill(status=503,json={'detail':'Service unavailable in isolated UI audit'})
  page.route('**/api/**',api)
  for row in selected:
   if args.filter and not re.search(args.filter,row['component'],re.I):continue
   if args.resume and any(r['component']==row['component'] and r['width']==width for r in results):continue
   path=re.sub(r':(\w+)',lambda m:params.get(m[1],'qa-missing'),row['path']).replace('*','not-found')
   path='/' + path.lstrip('/')
   state['guard']=row['guard'];errors.clear();requests.clear()
   page.goto('http://127.0.0.1:8143/')
   page.evaluate("signed=>{if(signed)localStorage.setItem('admin_token','isolated-qa-token');else localStorage.removeItem('admin_token')}",row['guard']!='public')
   page.goto('http://127.0.0.1:8143'+path,wait_until='domcontentloaded')
   page.wait_for_function("document.querySelector('.px-experience') && document.body.innerText.length > 50",timeout=20000)
   page.wait_for_timeout(700)
   try:page.locator('.mj-loader').wait_for(state='hidden',timeout=3000)
   except:pass
   page.evaluate("document.querySelectorAll('[data-reveal]').forEach(e=>{e.style.opacity='1';e.style.transform='none';e.style.filter='none'})")
   shot=f"{row['component']}-{width}.jpg";page.screenshot(path=str(OUT/shot),full_page=True,type='jpeg',quality=65)
   overflow=page.evaluate("""()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);let parent=e.parentElement;while(parent&&parent!==document.body){const ps=getComputedStyle(parent);if(['auto','scroll','hidden','clip'].includes(ps.overflowX)&&parent.getBoundingClientRect().right<=innerWidth+2)return false;parent=parent.parentElement;}return r.width>0&&s.visibility!=='hidden'&&r.left<innerWidth&&(r.right>innerWidth+2||r.left< -2)&&!e.closest('aside,dialog,[hidden]')&&s.position!=='fixed'&&s.position!=='absolute'&&!['svg','path','circle','canvas'].includes(e.tagName.toLowerCase())}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,right:Math.round(e.getBoundingClientRect().right)}))""")
   result={**row,'url':path,'width':width,'screenshot':shot,'errors':errors.copy(),'overflow_candidates':overflow,'requests':sorted(set(requests)),'text':page.locator('body').inner_text()[:1200]}
   results=[r for r in results if not (r['component']==row['component'] and r['width']==width)]
   results.append(result)
   (OUT/'audit-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
   print(width,row['component'],'errors',len(errors),'overflow candidates',len(overflow),flush=True)
  context.close()
 browser.close()
print('Completed',len(results),'route/viewports')

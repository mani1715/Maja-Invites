from pathlib import Path
import json
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
OUT=Path('design/sitewide');results=[]
with sync_playwright() as p:
 b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');ctx.add_init_script("localStorage.setItem('admin_token','qa');localStorage.setItem('maja_cookie_consent',JSON.stringify({version:'1.0',analytics:false,marketing:false,decided_at:new Date().toISOString()}));")
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));state={'fail':True};writes=[]
 def api(route):
  path=urlsplit(route.request.url).path
  if not path.startswith('/api/'):route.continue_();return
  if path=='/api/auth/me':route.fulfill(json={'id':'qa','role':'super_admin','username':'QA'});return
  if route.request.method=='POST':writes.append(route.request.post_data_json)
  if state['fail']:route.fulfill(status=503,json={'detail':'TEST service temporarily unavailable'});return
  if path=='/api/studio/my-weddings':route.fulfill(json={'weddings':[{'id':'qa','title':'TEST couple — isolated fixture','bride_name':'Test bride','groom_name':'Test groom','wedding_date':'2027-02-20','contact_phone':9876543210}]});return
  if path=='/api/admin/profiles' and route.request.method=='POST':route.fulfill(json={'id':'qa-new'});return
  route.fulfill(json={})
 page.route('**/api/**',api)
 for path in ['/studio/clients','/studio/notifications','/studio/messages','/admin/face-ops','/admin/bi','/admin/platform']:
  page.goto('http://127.0.0.1:8143'+path);page.get_by_role('button',name='Try again',exact=True).first.wait_for();results.append(path+' shows retry on failure')
 page.goto('http://127.0.0.1:8143/studio/clients');page.get_by_role('button',name='+ New Client',exact=True).click()
 for label,val in [('Event Title','TEST unsaved client'),('Bride Name','Test bride'),('Groom Name','Test groom'),('Wedding Date','2027-02-20')]:page.get_by_label(label,exact=True).fill(val)
 page.get_by_role('button',name='Save Changes',exact=True).click();page.get_by_text('Could not save the client.',exact=False).wait_for();assert page.get_by_label('Event Title',exact=True).input_value()=='TEST unsaved client';results.append('failed create retains form and never reports success')
 state['fail']=False;page.get_by_role('button',name='Save Changes',exact=True).click();page.get_by_text('New client profile created successfully.',exact=True).wait_for();page.get_by_label('Event Title',exact=True).wait_for(state='hidden');assert writes[-1]['title']=='TEST unsaved client';results.append('successful retry sends retained payload and closes form')
 page.get_by_placeholder('Search by bride, groom, title, or phone...').fill('98765');page.get_by_role('link',name='TEST couple',exact=False).wait_for();results.append('numeric contact phone searchable without crash')
 page.screenshot(path=str(OUT/'Clients-populated-390.jpg'),full_page=True)
 assert not errors,errors;b.close()
(OUT/'recovery-results.json').write_text(json.dumps({'checks':results,'page_errors':errors},indent=2));print('PASS',len(results),'failure/retry checks')

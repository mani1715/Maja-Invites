"""Additional isolated browser fixtures: no backend or customer writes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
IDS=['free_studio_neutral','basic_golden_hour','basic_darkroom','basic_nordic','premium_gallery_wall','premium_film_strip','premium_liquid_glass','premium_contact_sheet','premium_aurora','premium_editorial']
with sync_playwright() as pw:
 browser=pw.chromium.launch()
 page=browser.new_page()
 page.add_init_script("localStorage.setItem('maja_cookie_consent',JSON.stringify({version:'1.0',analytics:false,marketing:false,decided_at:new Date().toISOString()}));")
 page.goto('http://127.0.0.1:8143/portfolio-samples?design=premium_editorial')
 data=page.evaluate("async()=> (await import('/src/portfolio/fixture.js')).demoPortfolio()")
 data['profile'].update(tagline='QA authored headline',cover_description='QA supporting introduction',team_members=[{'name':'TEST team member','role':'TEST role'}],pricing_packages=[{'name':'TEST package','description':'Layout fixture, not an offer','features':['TEST included item']}],faqs=[{'q':'TEST question','a':'TEST answer'}])
 data['testimonials']=[{'id':'qa','author':'TEST attribution','text':'TEST quotation for layout verification only.'}]
 data['albums']=[{'id':'collection-a','title':'TEST collection'}]
 data['works'][0]['album_id']='collection-a'
 data['works'][0]['gallery']=['/portfolio-reference/photo-1.jpg']
 data['works'][0]['story']='QA authored story for testing a complete editorial spread.'
 payload={}
 page.route('**/api/public/photographer/qa/portfolio',lambda route:route.fulfill(json=payload))
 for ident in IDS:
  for width in [1440,768,390,320]:
   for variant in ['populated','missing']:
    payload=json.loads(json.dumps(data));payload['design_id']=ident
    if variant=='missing':
     payload['profile']['hero_image']='/portfolio-reference/missing.jpg'
     payload['works'][0]['image_url']='/portfolio-reference/missing.jpg'
     payload['profile']['tagline']='';payload['profile']['cover_description']=''
    page.set_viewport_size({'width':width,'height':844})
    page.goto('http://127.0.0.1:8143/photographer/qa')
    page.locator('.pf2').wait_for()
    page.locator('.pf2 img').evaluate_all("imgs=>{imgs.forEach(i=>i.loading='eager');return Promise.all(imgs.map(i=>i.decode().catch(()=>{})))}")
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(ident,width,variant)
    if variant=='populated':
     assert page.locator('h1').text_content()=='QA authored headline'
     assert page.locator('.pf2-introduction').inner_text()=='QA supporting introduction'
     for selector in ['.pf2-team-section','.pf2-packages-section','.pf2-reviews','.pf2-faq-section']:
      assert page.locator(selector).is_visible(),(ident,selector)
     page.get_by_label('Browse collections').select_option('collection-a')
     assert page.locator('#pf-work .pf2-photo').count() in [1,2]
    else:
     assert page.locator('.pf2 img').evaluate_all('imgs=>imgs.filter(i=>!i.naturalWidth && i.getBoundingClientRect().width>0).length')==0
  print('PASS optional/missing:',ident,flush=True)
 # Actual work filtering and indexed browsing.
 for ident in ['premium_gallery_wall','premium_contact_sheet','basic_darkroom']:
  payload=json.loads(json.dumps(data));payload['design_id']=ident
  page.goto('http://127.0.0.1:8143/photographer/qa');page.locator('.pf2').wait_for()
  if ident=='basic_darkroom':
   page.locator('.pf2-project-browser ol button').nth(1).click()
   assert page.locator('.pf2-project-browser figcaption span').inner_text()=='A promise, held'
  else:
   page.get_by_role('button',name='Details',exact=True).click()
   assert page.locator('#pf-work .pf2-photo').count()==2
 # Version routing and video fallback are isolated fixtures, not persisted content.
 payload=json.loads(json.dumps(data));payload['renderer_version']=2
 page.goto('http://127.0.0.1:8143/photographer/qa');page.locator('.pf2old').wait_for();assert page.locator('.pf2').count()==0
 payload=json.loads(json.dumps(data));payload['design_id']='premium_film_strip';payload['works'][0]['video_url']='/portfolio-reference/unavailable.mp4';payload['profile']['presentation']['hero_video_work_id']='demo-0'
 page.goto('http://127.0.0.1:8143/photographer/qa');video=page.locator('.pf2-film-stage video');video.wait_for()
 assert video.evaluate('(v)=>v.controls&&!v.autoplay')
 video.evaluate("v=>v.dispatchEvent(new Event('error'))")
 assert page.locator('.pf2-film-stage .pf2-hero-photo').is_visible()
 browser.close()
print('PASS 80 additional content/viewport cases; collection filters, categories, index, V2 routing, native film controls and photo fallback')

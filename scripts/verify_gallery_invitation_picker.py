"""Actual gallery modal, isolated API responses; temporary Vite entry removed on exit."""
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
entry=root/'frontend-v2/portfolio-gallery-qa.html'
entry.write_text('''<!doctype html><html><head><title>Isolated gallery QA</title></head><body><div id="qa"></div><script type="module">import React from 'react';import{createRoot}from 'react-dom/client';import Modal from '/src/components/gallery/CreateGalleryModal.jsx';createRoot(document.getElementById('qa')).render(React.createElement(Modal,{isOpen:true,onClose:()=>{},onSuccess:()=>document.body.dataset.success='true'}));</script></body></html>''',encoding='utf-8')
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();page=browser.new_page();requested=[];submissions=[];fail=[True]
  def listings(route):
   if fail[0]:
    fail[0]=False;route.fulfill(status=503,json={'detail':'QA outage'});return
   p=int(parse_qs(urlsplit(route.request.url).query)['page'][0]);requested.append(p)
   route.fulfill(json={'items':[{'id':f'inv-{p}','title':f'QA invitation {p}','slug':f'qa-{p}'}],'page':p,'total_pages':2,'total':2})
  page.route('**/api/admin/profiles/paginated?*',listings)
  def submit(route):
   submissions.append(route.request.post_data_json);route.fulfill(json={'gallery':{'id':'qa-gallery'}})
  page.route('**/api/admin/galleries',submit)
  page.goto('http://127.0.0.1:8143/portfolio-gallery-qa.html')
  page.get_by_label('Optional: Attach to an existing invitation event').check()
  page.get_by_role('button',name='Retry invitations').click()
  page.locator('select').filter(has=page.locator('option[value="inv-2"]')).select_option('inv-2')
  page.get_by_placeholder('e.g. Aarav & Diya Royal Wedding').fill('QA gallery')
  page.get_by_role('button',name='Create Gallery').click()
  page.wait_for_function("document.body.dataset.success==='true'")
  assert requested==[1,2],requested
  assert submissions[0]['invitation_id']=='inv-2'
  browser.close()
 print('PASS gallery modal: recoverable error, retry, both invitation pages and selected ID in create payload')
finally:
 entry.unlink(missing_ok=True)

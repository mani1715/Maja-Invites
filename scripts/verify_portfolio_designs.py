"""Browser QA for real V2 React samples; local reference media only."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'design/photographer-proposals/previews/ten-designs'
OUT.mkdir(parents=True, exist_ok=True)
IDS = ['free_studio_neutral', 'basic_golden_hour', 'basic_darkroom', 'basic_nordic',
       'premium_gallery_wall', 'premium_film_strip', 'premium_liquid_glass',
       'premium_contact_sheet', 'premium_aurora', 'premium_editorial']
if len(sys.argv)>1:
    IDS=[ident for ident in IDS if ident in sys.argv[1:]]
results, errors = [], []
with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:8143/portfolio-samples?design=free_studio_neutral')
    page.get_by_role('button', name='Reject all', exact=True).click()
    for ident in IDS:
        for width in (1440, 768, 390, 320):
            page.set_viewport_size({'width': width, 'height': 1000 if width > 400 else 844})
            for content in ('rich', 'sparse', 'empty', 'long', 'commercial', 'portrait'):
                page.goto(f'http://127.0.0.1:8143/portfolio-samples?design={ident}&content={content}')
                page.wait_for_selector('.pf2')
                page.locator('.pf2 img').evaluate_all("(imgs)=>{imgs.forEach(img=>img.loading='eager');return Promise.all(imgs.map(img=>img.decode().catch(()=>{})))}")
                overflow = page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
                broken = page.locator('.pf2 img').evaluate_all('(imgs)=>imgs.filter(i=>i.complete&&!i.naturalWidth).length')
                assert not overflow, (ident, width, content, 'overflow')
                assert not broken, (ident, width, content, 'broken photos')
                if content == 'rich' and width in (1440, 390):
                    page.evaluate('document.documentElement.getBoundingClientRect()')
                    page.screenshot(path=str(OUT / f'{ident}-{width}.png'), full_page=True)
                    page.screenshot(path=str(OUT / f'{ident}-{width}-opening.png'))
                if content == 'rich' and width == 390:
                    button = page.locator('.pf2-photo-button').first
                    button.click()
                    assert page.locator('dialog').evaluate('(d)=>d.open')
                    page.keyboard.press('ArrowRight')
                    page.keyboard.press('Escape')
                    assert not page.locator('dialog').evaluate('(d)=>d.open')
                    assert button.evaluate('(b)=>b===document.activeElement')
                    page.get_by_role('button', name='Menu +').click()
                    page.locator('#pf-mobile-menu').get_by_role('link', name='Enquire').click()
                    assert page.locator('#pf-mobile-menu').count() == 0
                    page.locator('input[name=name]').fill('Preview visitor')
                    page.locator('input[name=email]').fill('preview@example.com')
                    page.get_by_role('button', name='Try preview form').click()
                    assert 'nothing was sent' in page.locator('form [role=status]').inner_text().lower()
                results.append({'design': ident, 'width': width, 'content': content, 'pass': True})
        print('PASS', ident, flush=True)
    page.emulate_media(reduced_motion='reduce')
    page.goto('http://127.0.0.1:8143/portfolio-samples')
    page.wait_for_selector('.pfw-board-grid')
    assert page.locator('.pfw-board-grid article').count() == 10
    page.get_by_label('Design category', exact=True).select_option('basic')
    assert page.locator('.pfw-board-grid article').count() == 3
    browser.close()
assert not errors, errors
(OUT / ('verification-targeted.json' if len(sys.argv)>1 else 'verification.json')).write_text(json.dumps({'cases': results, 'page_errors': errors}, indent=2), encoding='utf-8')
print(f'PASS {len(results)} responsive/content cases; 20 full-page screenshots; keyboard viewer, mobile navigation, preview enquiry and discovery filters')

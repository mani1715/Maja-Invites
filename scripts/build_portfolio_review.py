"""Build the offline review board from captured, real React-rendered designs."""
import html
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / 'design/photographer-proposals'
IMAGES = ROOT / 'previews/ten-designs'
DESIGNS = [
    ('free_studio_neutral','Studio Neutral','Free','Compact image-led introduction → selected work → studio → services. An accessible starter with intact photographs.'),
    ('basic_golden_hour','Golden Hour','Basic','Photographic opening → alternating image/story pairs → services → studio. Warm ivory and terracotta; vertical storytelling on phones.'),
    ('basic_darkroom','Darkroom','Basic','Typographic opening and contained hero → indexed project stage → studio → services. On phones the photograph precedes the project index.'),
    ('basic_nordic','Nordic Light','Basic','Centered navigation → split introduction → studio → irregular gallery → services. Calm sage neutrals and generous whitespace.'),
    ('premium_gallery_wall','Gallery Wall','Premium','Desktop side navigation → exhibition title → filtered photography wall → services → studio. The sidebar becomes a compact mobile menu.'),
    ('premium_film_strip','Film Strip','Premium','Wide screening stage and credit-style prologue → numbered vertical chapters → studio → services. Optional native video controls; no scroll hijacking.'),
    ('premium_liquid_glass','Liquid Glass','Premium','Restrained translucent navigation → image-dominant opening with a compact caption → offset projects → studio → services. Opaque mobile and reduced-transparency fallbacks.'),
    ('premium_contact_sheet','Contact Sheet','Premium','Compact introduction and three photographic proofs → filterable expandable project index → services → studio. Documentary labels and intact images.'),
    ('premium_aurora','Aurora Studio','Premium','Bold masthead → photographic diptych → services → asymmetric work mosaic → studio. On phones the second image is inset below the first.'),
    ('premium_editorial','Editorial / Folio','Premium','Asymmetric portrait cover and detail photograph → editorial spreads → studio → services. Offset mobile images preserve the editorial rhythm.'),
]
cards=[]
for ident,name,tier,description in DESIGNS:
    cards.append(f'''<article data-tier="{tier}"><header><small>{tier} design family</small><h2>{name}</h2><code>{ident}</code></header><div class="pair"><a href="previews/ten-designs/{ident}-1440.png"><img loading="lazy" src="previews/ten-designs/{ident}-1440-opening.png" alt="{name} desktop opening"><span>Desktop · open complete page ↗</span></a><a href="previews/ten-designs/{ident}-390.png"><img loading="lazy" src="previews/ten-designs/{ident}-390-opening.png" alt="{name} mobile opening"><span>Mobile · open complete page ↗</span></a></div><p>{html.escape(description)}</p></article>''')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pixora — Ten photographer portfolio designs</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f2e9;color:#28352c;font:16px/1.6 Arial,sans-serif}main{max-width:1500px;margin:auto;padding:50px 5%}h1{font:clamp(44px,6vw,88px)/1.05 Georgia,serif;max-width:16ch}h2{font:32px Georgia,serif;margin:10px 0}a{color:inherit}p{max-width:90ch}nav{display:flex;gap:24px;flex-wrap:wrap;margin:25px 0}article{border-top:1px solid #acb5a6;padding:40px 0}article header{margin-bottom:24px}code{font-size:12px}small{text-transform:uppercase;letter-spacing:.14em;font-size:11px}.pair{display:grid;grid-template-columns:3.2fr 1fr;gap:25px;align-items:start}.pair img{width:100%;display:block;border:1px solid #d6d8cf}.pair span{display:block;padding:8px 0;font-size:12px}select{font:inherit;padding:10px;min-height:44px;background:white}aside{background:#e3e8dc;padding:25px;margin:35px 0}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;border-bottom:1px solid #bcc4b6;padding:15px;vertical-align:top}:focus-visible{outline:3px solid #905d35;outline-offset:4px}@media(max-width:650px){main{padding:30px 18px}.pair{grid-template-columns:1fr}.pair a:last-child{max-width:320px}h1{font-size:48px}td,th{padding:10px 5px}}
</style><main><small>MAJA Invites / Pixora · Local implementation review · 13 October 2026</small><h1>Ten ways to frame your work.</h1><p>These are screenshots of the integrated React layouts used by the sample board, private editor preview and version 3 public renderer. The same fictional studio and reference photographs appear throughout. Enquiry controls in samples are explicitly preview-only. No customer portfolio was migrated and nothing was deployed.</p><nav><a href="before-after.html">Before / after comparisons</a><a href="REFINEMENT_REVIEW.md">Refinement verification</a><a href="IMPLEMENTATION_REVIEW.md">Implementation & verification report</a><a href="TEN_DESIGN_EXECUTION_PLAN.md">Design specifications & migration plan</a><a href="REVIEW.md">Verified original audit</a><a href="credits.html">Reference photo credits</a></nav><aside><strong>Recommended starting design: Golden Hour.</strong><p>It gives the existing wedding content a clear narrative, preserves portrait photographs and offers an uncomplicated enquiry path. Editorial / Folio is the premium flagship; Gallery Wall suits studios with larger mixed collections.</p><p>Visual verification: 320 content/viewport cases; desktop 1440, tablet 768, mobile 390 and narrow 320. All ten designs have complete desktop and mobile screenshots below.</p></aside><table><tr><th>Existing billing plan</th><th>Existing design access</th></tr><tr><td>Free / no subscription</td><td>Studio Neutral</td></tr><tr><td>Basic</td><td>Studio Neutral + Golden Hour, Darkroom, Nordic Light</td></tr><tr><td>Pro, Advanced, Premium, Custom</td><td>All ten, through their explicit premium portfolio entitlement</td></tr></table><p>Admin overrides, section lists, subscription status and grace remain authoritative. No prices or plan benefits have been changed.</p><label>Show design family <select id="filter"><option>All</option><option>Free</option><option>Basic</option><option>Premium</option></select></label>'''+''.join(cards)+'''<aside><h2>Publishing is deliberate.</h2><p>Save a private draft, review it at desktop/tablet/mobile sizes, then publish. Existing public URLs remain stable. Old portfolios use their original renderer until explicitly published as version 3. Both version 1 and version 2 portfolios retain their original renderer until explicit republication. Version history restores into a draft; it never silently replaces the public site.</p></aside><script>document.querySelector('#filter').addEventListener('change',e=>document.querySelectorAll('article').forEach(a=>a.hidden=e.target.value!=='All'&&a.dataset.tier!==e.target.value));</script></main></html>'''
(ROOT/'ten-designs.html').write_text(page,encoding='utf-8')
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',24)
canvas=Image.new('RGB',(1600,2220),'#f5f2e9')
draw=ImageDraw.Draw(canvas)
for i,(ident,name,tier,_) in enumerate(DESIGNS):
    x=(i%2)*800+25;y=(i//2)*440+20
    draw.text((x,y),f'{i+1:02d}  {name} / {tier}',font=font,fill='#28352c')
    for width,left,target in [(1440,x,(565,393)),(390,x+582,(175,379))]:
        with Image.open(IMAGES/f'{ident}-{width}-opening.png') as source:
            source.thumbnail(target)
            canvas.paste(source,(left,y+40))
canvas.save(ROOT/'ten-design-overview.jpg',quality=90)
print('Created offline review board and ten-design overview.')

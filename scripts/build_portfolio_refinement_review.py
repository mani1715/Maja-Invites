"""Build before/after review from actual rendered screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]/'design/photographer-proposals'
OUT=ROOT/'previews/comparisons';OUT.mkdir(exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',26)
parts=[]
for ident,name in [('premium_film_strip','Film Strip'),('premium_liquid_glass','Liquid Glass'),('premium_contact_sheet','Contact Sheet')]:
 canvas=Image.new('RGB',(1600,1600),'#f5f2e9');draw=ImageDraw.Draw(canvas)
 draw.text((30,20),name+' / desktop and mobile',font=font,fill='#28352c')
 for j,(folder,label) in enumerate([('before-refinement','Before'),('ten-designs','After')]):
  x=30+j*800
  draw.text((x,65),label,font=font,fill='#28352c')
  for width,y,size in [(1440,110,(740,515)),(390,680,(390,844))]:
   with Image.open(ROOT/f'previews/{folder}/{ident}-{width}-opening.png') as im:
    im.thumbnail(size);canvas.paste(im,(x,y))
 canvas.save(OUT/f'{ident}.jpg',quality=90)
 links=''.join(f'<a href="previews/{folder}/{ident}-{width}.png">{label} {width}px complete page</a>' for folder,label in [('before-refinement','Before'),('ten-designs','After')] for width in [1440,390])
 parts.append(f'<article><h2>{name}</h2><img src="previews/comparisons/{ident}.jpg" alt="{name} before and after desktop and mobile"><nav>{links}</nav></article>')
(ROOT/'before-after.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portfolio refinements — before and after</title><style>body{max-width:1500px;margin:auto;padding:30px;background:#f5f2e9;color:#28352c;font:16px/1.6 Arial}img{width:100%}h1,h2{font-family:Georgia;font-weight:400}article{border-top:1px solid;padding:30px 0}nav{display:flex;gap:24px;flex-wrap:wrap}a{color:inherit}</style><h1>Three openings, clearly different.</h1><p>Actual React screenshots. Before uses the preserved version 2 design; after uses the refined version 3. Reference photos and studio content are shared; the newly exposed supporting introduction is demo copy. All forms in these samples are preview-only.</p><a href="ten-designs.html">All ten designs</a>'+''.join(parts)+'</html>',encoding='utf-8')
print('Created three before/after comparison images and linked complete pages.')

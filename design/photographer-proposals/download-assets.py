import requests
from pathlib import Path
from PIL import Image,ImageDraw
from io import BytesIO
urls=['https://images.unsplash.com/photo-1744804298726-88ee70f07fdc','https://images.unsplash.com/photo-1760080839561-6b1228ed2e60','https://images.unsplash.com/photo-1519741497674-611481863552','https://images.unsplash.com/photo-1511285560929-80b456fea0bc']
root=Path('design/photographer-proposals/assets')
for i,u in enumerate(urls):
 r=requests.get(u+'?auto=format&fit=max&w=1600&q=85',timeout=25);r.raise_for_status();im=Image.open(BytesIO(r.content));im.convert('RGB').save(root/f'photo-{i}.jpg',quality=90);print(i,im.size)

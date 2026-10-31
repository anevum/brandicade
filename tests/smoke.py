from playwright.sync_api import sync_playwright
from pathlib import Path
import base64,re
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text();css=(root/'src/styles.css').read_text()
html=html.replace('<link rel="stylesheet" href="/src/styles.css">',f'<style>{css}</style>').replace('<script type="module" src="/src/app.mjs"></script>','')
for name in ['mark.svg','atrium.svg','icon.svg']:
 data=base64.b64encode((root/'assets'/name).read_bytes()).decode()
 html=html.replace(f'/assets/{name}',f'data:image/svg+xml;base64,{data}')
for name in ['icon-1024.png','share.png']:
 data=base64.b64encode((root/'assets'/name).read_bytes()).decode()
 html=html.replace(f'/assets/{name}',f'data:image/png;base64,{data}')
js='\n'.join(re.sub(r'\bexport\s+(?=(?:const|let|function|class)\b)','',re.sub(r'^import .*?;\s*$','', (root/'src'/n).read_text(),flags=re.M)) for n in ['engine.mjs','progression.mjs','app.mjs'])
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for k,w,h in [('desktop',1440,900),('iphone',390,844),('tiny',320,720)]:
  page=b.new_page(viewport={'width':w,'height':h},device_scale_factor=2 if k!='desktop' else 1,has_touch=k!='desktop',is_mobile=k!='desktop')
  errs=[]; page.on('pageerror',lambda e:errs.append(str(e)))
  page.set_content(html,wait_until='load');page.add_script_tag(content="Object.defineProperty(window,'localStorage',{configurable:true,value:(()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}})()}); history.pushState=()=>{};history.replaceState=()=>{};");page.add_script_tag(content=js)
  page.wait_for_timeout(300)
  print(k,'home',page.locator('#home').get_attribute('class'),'head',page.title(),'sections',page.locator('section').count(),'errors',errs)
  page.screenshot(path=str(root/f'tests/{k}-home.png'),full_page=True,animations='disabled')
  page.locator('[data-action="play"]').first.click();page.wait_for_timeout(300)
  print(k,'game',page.locator('#game').get_attribute('class'),'tiles',page.locator('#pop-board .charm').count(), 'board',page.locator('#pop-board').bounding_box())
  page.screenshot(path=str(root/f'tests/{k}-game.png'),full_page=True,animations='disabled')
  if k=='desktop':
   page.locator('#pop-board [data-cell="1"]').click(timeout=5000);page.locator('#pop-board [data-cell="8"]').click(timeout=5000);page.wait_for_timeout(700)
   print('After move',page.locator('#game-moves').inner_text(),page.locator('#game-score').inner_text(),'errors',errs)
  page.locator('.nav-button[data-go="profile"]').click();page.wait_for_timeout(150)
  print(k,'profile',page.locator('#profile').get_attribute('class'),'name',page.locator('#profile h2').first.inner_text(),'avatarcount',page.locator('.avatar-option').count(),'widths',page.evaluate('({sw:document.documentElement.scrollWidth,inner:innerWidth})'),'errors',errs)
  page.screenshot(path=str(root/f'tests/{k}-profile.png'),full_page=True,animations='disabled')
  page.locator('.nav-button[data-go="treasures"]').click();page.wait_for_timeout(150)
  print(k,'awards',page.locator('.achievement').count(),'errors',errs)
  page.screenshot(path=str(root/f'tests/{k}-treasures.png'),full_page=True,animations='disabled')
  page.close()
 b.close()

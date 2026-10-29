"""Production portraits and local-only catalog states."""
import re
import argparse
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--url',default='http://127.0.0.1:43135')
parser.add_argument('--out',default='/tmp/odoc-material-art')
parser.add_argument('--browser',default='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
args=parser.parse_args()
OUT=Path(args.out);OUT.mkdir(parents=True,exist_ok=True)
BASE=args.url.rstrip('/')
with tempfile.NamedTemporaryFile(mode='w',suffix='.html',prefix='.material-art-',dir=ROOT,delete=False) as f:
 html=Path(f.name)
 f.write('<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/material-art-preview.tsx"></script></body></html>')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=args.browser)
  for width in (1440,390,320):
   context=browser.new_context(viewport={'width':width,'height':1000})
   context.route(re.compile(re.escape(BASE)+r'/api/'),lambda route:route.abort('blockedbyclient'))
   page=context.new_page();errors=[];responses=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('response',lambda r:responses.append((r.status,r.from_service_worker)) if r.url.startswith(BASE+'/api/') else None)
   def go(view,state=''):
    page.goto(f'{BASE}/{html.name}?view={view}&mockState={state}');page.wait_for_load_state('networkidle')
   def fits():assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
   go('gallery')
   expect(page.locator('[data-material-row]')).to_have_count(16)
   expect(page.locator('[data-material-row] img')).to_have_count(64)
   images=page.locator('[data-material-row]').evaluate_all("rows=>rows.map(row=>Array.from(row.querySelectorAll('img')).map(img=>img.src))")
   assert all(len(set(row))==1 for row in images),'Cross-surface mismatch'
   assert len(set(row[0] for row in images))==16,'Duplicate sprites'
   fits();page.screenshot(path=str(OUT/f'gallery-{width}.png'),full_page=True)
   ids=page.locator('[data-material-row]').evaluate_all('rows=>rows.map(r=>r.dataset.materialRow)')
   go('atlas');search=page.get_by_placeholder('搜索材料或掉落来源...');expect(search).to_be_visible()
   for id in ids:
    search.fill(id);page.locator(f'button [data-material-art-id="{id}"]').click()
    expect(page.locator(f'[aria-label="材料详情"] [data-material-art-id="{id}"] img')).to_have_count(1)
   fits();page.screenshot(path=str(OUT/f'atlas-{width}.png'),full_page=True)
   search.fill('不存在的材料');expect(page.get_by_text('未找到匹配的材料')).to_be_visible()
   go('loot');expect(page.locator('[data-material-art-id] img')).to_have_count(16)
   page.get_by_role('button',name='查看焰羽，数量3',exact=True).click()
   expect(page.get_by_role('dialog').locator('[data-material-art-id="material.element.fire.firebird"] img')).to_have_count(1);fits()
   for state in ('slow','error'):
    page.goto(f'{BASE}/{html.name}?view=atlas&mockState={state}')
    if state=='slow':
     expect(page.get_by_role('status')).to_have_text('正在加载材料目录');expect(page.get_by_placeholder('搜索材料或掉落来源...')).to_be_visible()
    else:expect(page.get_by_role('alert')).to_have_text('材料目录加载失败')
    page.wait_for_load_state('networkidle');fits()
   assert not errors,errors
   assert responses and all(sw and status!=501 for status,sw in responses),responses
   print({'width':width,'sprites':16,'crossSurfaceInstances':64,'states':['populated','empty-search','loading','error'],'pageErrors':errors,'apiResponses':responses})
   context.close()
  browser.close()
finally:html.unlink(missing_ok=True)

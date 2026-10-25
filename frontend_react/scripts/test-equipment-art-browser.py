"""Inspect actual equipment portraits, local API states and shared display surfaces."""
import argparse
import json
import re
import tempfile
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def run(browser,base,filename,width,out):
    context=browser.new_context(viewport={'width':width,'height':1000})
    context.route(re.compile(re.escape(base)+r'/api/'),lambda route:route.abort('blockedbyclient'))
    page=context.new_page()
    errors,responses=[],[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('response',lambda response:responses.append((response.url,response.status,response.from_service_worker)) if response.url.startswith(base+'/api/') else None)
    url=f'{base}/{filename}'
    def go(view,state=''):
        page.goto(f'{url}?view={view}&mockState={state}')
        page.wait_for_load_state('networkidle')
    def fits():
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,page.locator('body').inner_text()[:150])
    try:
        go('gallery')
        expect(page.locator('[data-equipment-row]')).to_have_count(103)
        expect(page.locator('[data-equipment-pixel-version="2"]')).to_have_count(416)
        ids=page.locator('[data-equipment-row]').evaluate_all('rows=>rows.map(row=>row.dataset.equipmentRow)')
        art=page.locator('[data-equipment-row]').evaluate_all("rows=>rows.map(row=>Array.from(row.querySelectorAll('svg[data-equipment-pixel-version]')).map(svg=>svg.innerHTML))")
        assert all(len(set(row))==1 for row in art), 'Atlas / no-metadata / market snapshot / template-known record mismatch'
        fits()
        page.screenshot(path=str(out/f'gallery-{width}.png'),full_page=True)
        if width==1440:
            page.locator('[data-equipment-row]').evaluate_all("rows=>window.artExport=Object.fromEntries(rows.map(row=>[row.dataset.equipmentRow,{name:row.querySelector('p').textContent,svg:row.querySelector('svg').outerHTML}]))")
            (out/'art-export.json').write_text(json.dumps(page.evaluate('window.artExport'),ensure_ascii=False))
        go('atlas')
        expect(page.get_by_placeholder('搜索装备名称...')).to_be_visible()
        for id in ids:
            page.get_by_placeholder('搜索装备名称...').fill(id)
            icon=page.locator(f'button [data-equipment-art-id="{id}"]').first
            icon.click()
            expect(page.locator(f'[aria-label="装备详情"] [data-equipment-art-id="{id}"] svg')).to_have_attribute('data-equipment-pixel-version','2')
        fits()
        page.screenshot(path=str(out/f'atlas-{width}.png'),full_page=True)
        page.get_by_placeholder('搜索装备名称...').fill('不存在的装备')
        expect(page.get_by_text('未找到符合条件的装备')).to_be_visible()
        fits()
        go('surfaces')
        expect(page.locator('[data-equipment-pixel-version="2"]')).to_have_count(624)
        fits()
        page.locator('[data-equipment-row="equip.two_handed_sword"]').screenshot(path=str(out/f'bag-and-slot-{width}.png'))
        go('loot')
        expect(page.locator('[data-equipment-pixel-version="2"]')).to_have_count(103)
        page.get_by_role('button',name='查看双手剑，数量1',exact=True).click()
        expect(page.get_by_role('dialog')).to_contain_text('掉落详情')
        expect(page.get_by_role('dialog').locator('[data-equipment-pixel-version="2"]')).to_have_count(2)
        fits()
        page.screenshot(path=str(out/f'loot-detail-{width}.png'),full_page=True)
        go('market')
        expect(page.locator('[data-equipment-art-id="equip.two_handed_sword"] svg')).to_have_attribute('data-equipment-pixel-version','2')
        fits()
        page.screenshot(path=str(out/f'market-{width}.png'),full_page=True)
        for state in ('slow','error'):
            page.goto(f'{url}?view=atlas&mockState={state}')
            if state=='slow':
                expect(page.get_by_role('status')).to_have_text('正在加载装备目录')
                expect(page.get_by_placeholder('搜索装备名称...')).to_be_visible()
            else:expect(page.get_by_role('alert')).to_have_text('装备目录加载失败')
            page.wait_for_load_state('networkidle')
            fits()
        assert not errors,errors
        assert responses and all(sw for _,_,sw in responses),responses
        assert all(status!=501 for _,status,_ in responses),responses
        print({'width':width,'items':103,'states':['populated','empty-search','loading','error'],'apiResponses':len(responses),'pageErrors':errors,'overflow':False})
    except Exception:
        print({'width':width,'errors':errors,'body':page.locator('body').inner_text()[:1000]})
        page.screenshot(path=str(out/f'failure-{width}.png'),full_page=True)
        raise
    finally:context.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:43133')
    parser.add_argument('--browser')
    parser.add_argument('--out',default='/tmp/odoc-equipment-redesign/browser')
    args=parser.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    file=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',suffix='.html',prefix='.equipment-art-',dir=ROOT,delete=False) as html:
            file=Path(html.name)
            html.write('<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/equipment-art-preview.tsx"></script></body></html>')
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,**({'executable_path':args.browser}if args.browser else {}))
            try:
                for width in (1440,390,320):run(browser,args.url.rstrip('/'),file.name,width,out)
            finally:browser.close()
    finally:
        if file:file.unlink(missing_ok=True)

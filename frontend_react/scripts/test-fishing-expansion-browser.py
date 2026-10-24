"""Pure-local fishing expansion checks; temporary React entries are always removed."""
import argparse
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def entry():
    paths = []
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.tsx', prefix='.fishing-expansion-', dir=ROOT, delete=False) as source:
            paths.append(Path(source.name))
            source.write("""import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {FishingCatalog} from './src/components/Fishing/FishingCatalog';
import {FishingScene} from './src/components/Fishing/FishingScene';
import {FishingPanel} from './src/components/Fishing/FishingPanel';
import {FishPortrait} from './src/components/Fishing/FishPortrait';
import {InventoryBackpack} from './src/components/AgentWorld/InventoryBackpack';
import {InventoryItemIcon} from './src/components/AgentWorld/InventoryItemIcon';
import {MarketListingItemIcon} from './src/components/Market/MarketListingItemIcon';
import {MarketDetailSidebar} from './src/components/Market/MarketDetailSidebar';
import {TransactionItemIcon} from './src/components/Market/TransactionItemIcon';
import {fishingCatalog, fishingOverview, fishingTrips, fishingInventory} from './src/mocks/agentWorld/fishing';
import {listings, transactions} from './src/mocks/agentWorld/production';
import {worker} from './src/mocks/browser';
import {localMode} from './src/config/development';
import {saveAuthToken} from './src/utils/authStorage';
import './src/index.css';
if (!localMode) throw new Error('Requires pure local mode');
await worker.start({onUnhandledRequest:'bypass'});
saveAuthToken('local-demo-token',false);
const view = new URLSearchParams(location.search).get('view') || 'atlas';
const portraitItems = Object.entries(fishingCatalog.rules.fish).map(([id,fish]) => ({
  ...fishingInventory[0], id:`portrait-${id}`, name:fish.name, value:fish.value,
  rarity:fish.king?'rare':'normal', source:{sku:`fish.${id}`},
}));
const playback = {...fishingTrips.at(-1)!, id:'local-playback', status:'active' as const, endedAt:null, events:[], eventTotal:0};
if (view==='playback') fishingTrips.push(playback);
function App() {
  return <main style={{height:view==='gallery'?'auto':'100dvh',minHeight:'100dvh',display:'flex',flexDirection:'column',padding:16,gap:12}}>
    {view==='scene' ? <FishingScene trips={[]} enabled={true}/> :
    view==='panel' ? <FishingPanel/> :
    view==='playback' ? <><button onClick={() => {const event=fishingTrips.at(-2)!.events.at(-1)!; playback.events.push({...event,id:'new-trench-king'}); playback.eventTotal=1;}}>追加收获</button><FishingScene trips={[playback]} enabled={true}/></> :
    view==='bag' ? <InventoryBackpack items={portraitItems} name="白露"/> :
    view==='market' ? <MarketDetailSidebar type="listing" listing={listings.find(item => item.item.source?.sku==='fish.trench_king')}/> :
    view==='gallery' ? <><h1 className="text-xl font-bold">全部50种鱼 · 图鉴 / 背包 / 市场 / 交易</h1><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{portraitItems.map(item => {
      const id=item.source.sku!.slice(5), transaction=transactions.find(row => row.result.fishingSku===item.source.sku) || {id:item.id,actorId:item.actorId,actorName:item.actorName,sessionId:'portrait',operation:{kind:'sell'},result:{kind:'fish',name:item.name,fishingSku:item.source.sku},createdAt:new Date().toISOString()};
      return <article key={id} data-fish-row={id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><FishPortrait fishId={id} name={item.name} className="h-16 w-16"/><span className="text-sm font-semibold">{item.name}</span></div><div className="flex items-center justify-around border-t border-slate-100 pt-2">
        <InventoryItemIcon item={item} className="h-10 w-10" fallback={<span>缺图</span>}/>
        <MarketListingItemIcon item={{...item,kind:'fish'}} className="h-10 w-10" fallback={<span>缺图</span>}/>
        <TransactionItemIcon transaction={transaction} isBuy={false} isSell={true}/>
      </div></article>;
    })}</div></> : <FishingCatalog residents={fishingOverview.residents}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
""")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', prefix='.fishing-expansion-', dir=ROOT, delete=False) as html:
            paths.append(Path(html.name))
            html.write(f'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/{paths[0].name}"></script></body></html>')
        yield paths[1].name
    finally:
        for path in paths:
            path.unlink(missing_ok=True)


SPOTS = [('pond','青苇池塘',1),('river','流光河湾',10),('lake','镜月湖畔',20),('stream','松影溪涧',30),('wetland','雾苇湿地',40),('bay','咸风海湾',50),('reef','珊瑚浅礁',60),('frost_lake','霜镜寒湖',70),('hot_spring','赤岩温泉',80),('trench','幽蓝海沟',90)]


def run(browser, base, filename, width, output):
    context = browser.new_context(viewport={'width':width,'height':1000})
    context.route(re.compile(re.escape(base)+r'/api/'),lambda route:route.abort('blockedbyclient'))
    page=context.new_page()
    errors,responses=[],[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('response',lambda response:responses.append((response.url,response.status,response.from_service_worker)) if response.url.startswith(base+'/api/') else None)
    url=f'{base}/{filename}'
    def go(view='',extra=''):
        page.goto(f'{url}?view={view}{extra}')
        page.wait_for_load_state('networkidle')
    def fits():
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width,page.locator('body').inner_text()[:500])
    try:
        go('atlas')
        expect(page.locator('[aria-label="钓点筛选"] button')).to_have_count(10)
        for spot,name,level in SPOTS:
            page.locator('[aria-label="钓点筛选"] button').filter(has_text=name).click()
            expect(page.locator('.fishing-atlas-species')).to_have_count(5)
            page.locator('.fishing-atlas-species').last.click()
            expect(page.get_by_role('region',name='鱼类详情')).to_contain_text(name)
            expect(page.get_by_role('region',name='鱼类详情').locator('[data-fish-art-id] img')).to_have_count(1)
            fits()
            if spot=='wetland':
                for fish_name,fish_id in [('泥鳅','loach'),('泽鳗','marsh_eel')]:
                    page.locator('.fishing-atlas-species').filter(has_text=fish_name).click()
                    expect(page.get_by_role('region',name='鱼类详情').locator(f'[data-fish-art-id="{fish_id}"] img')).to_have_count(1)
                    page.screenshot(path=str(output/f'{fish_id}-detail-{width}.png'),full_page=True)
        page.screenshot(path=str(output/f'atlas-{width}.png'),full_page=True)
        page.get_by_role('button',name='查看居民钓鱼 · 逐题准备与鱼王对决').click()
        expect(page.get_by_role('dialog')).to_contain_text('50种鱼')
        expect(page.get_by_role('dialog')).to_contain_text('最高99级')
        expect(page.get_by_role('dialog')).to_contain_text('最多10项')
        go('scene')
        for spot,name,level in SPOTS:
            page.locator('[aria-label="钓场景观"] button[aria-haspopup="listbox"]').click()
            expect(page.get_by_role('option')).to_have_count(10)
            page.get_by_role('option',name=f'{name} · Lv.{level}',exact=True).click()
            expect(page.locator('canvas')).to_have_attribute('aria-label',re.compile(name))
            page.locator('canvas').screenshot(path=str(output/f'scene-{spot}-{width}.png'))
            fits()
        go('gallery')
        expect(page.locator('[data-fish-row]')).to_have_count(50)
        expect(page.locator('[data-fish-art-id] img')).to_have_count(200)
        page.wait_for_function("Array.from(document.images).every(img=>img.complete&&img.naturalWidth>0)")
        # Every icon entry for a species must use exactly the same generated PNG.
        images=page.locator('[data-fish-row]').evaluate_all("rows=>rows.map(row=>Array.from(row.querySelectorAll('img')).map(img=>img.src))")
        assert all(len(set(row))==1 for row in images)
        fits()
        page.screenshot(path=str(output/f'fish-gallery-{width}.png'),full_page=True)
        go('bag')
        expect(page.locator('[data-fish-art-id] img')).to_have_count(50)
        page.get_by_role('button',name=re.compile('星灯渊王，')).click()
        expect(page.get_by_role('region',name='物品档案详情')).to_contain_text('星灯渊王')
        expect(page.get_by_role('region',name='物品档案详情').locator('[data-fish-art-id="trench_king"] img')).to_have_count(1)
        fits()
        page.screenshot(path=str(output/f'bag-detail-{width}.png'),full_page=True)
        go('market')
        expect(page.locator('[data-fish-art-id="trench_king"] img')).to_have_count(1)
        expect(page.get_by_text('星灯渊王',exact=True)).to_be_visible()
        fits()
        go('panel')
        expect(page.locator('.fishing-resident-card')).to_have_count(4)
        page.get_by_role('tab',name='出钓手札').click()
        page.locator('.fishing-trip-card').filter(has_text='星灯渊王').click()
        expect(page.locator('p').filter(has_text='幽蓝海沟 · 计划')).to_be_visible()
        expect(page.locator('[data-fish-art-id="trench_king"] img').first).to_be_visible()
        fits()
        for state in ('empty','slow','error'):
            page.goto(f'{url}?view=panel&mockState={state}')
            if state=='slow':
                expect(page.get_by_role('status').filter(has_text='正在读取水边见闻')).to_be_visible()
                expect(page.locator('.fishing-resident-card')).to_have_count(4)
            elif state=='error':
                expect(page.get_by_role('alert')).to_contain_text('本地模拟接口失败')
            else:
                page.get_by_role('tab',name='出钓手札').click()
                expect(page.get_by_text('还没有返程记录',exact=True)).to_be_visible()
            page.wait_for_load_state('networkidle')
            fits()
        if width==1440:
            go('playback')
            page.wait_for_timeout(1200)
            page.get_by_role('button',name='追加收获').click()
            expect(page.get_by_role('status').filter(has_text='钓获 星灯渊王')).to_be_visible(timeout=12000)
            page.wait_for_timeout(2600)
            page.locator('canvas').screenshot(path=str(output/'trench-king-playback.png'))
            # Reduced motion retains the distinct scene with no page errors.
            page.emulate_media(reduced_motion='reduce')
        assert not errors,errors
        assert responses and all(sw for _,_,sw in responses),responses
        assert all(status!=501 for _,status,_ in responses),responses
        print({'width':width,'passed':['all fifty atlas fish across ten spots','ten scene selections','50 fish across four icon surfaces','inventory detail','market detail','new trip detail','empty/loading/error','no API bypass','no overflow'],'apiResponses':len(responses),'pageErrors':errors})
    except Exception:
        print({'width':width,'errors':errors,'body':page.locator('body').inner_text()[:2200],'responses':responses[-8:]})
        page.screenshot(path=str(output/f'failure-{width}.png'),full_page=True)
        raise
    finally:
        context.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:43131')
    parser.add_argument('--browser')
    parser.add_argument('--out',default='/tmp/odoc-fishing-expansion')
    args=parser.parse_args()
    output=Path(args.out);output.mkdir(parents=True,exist_ok=True)
    with entry() as filename,sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,**({'executable_path':args.browser} if args.browser else {}))
        try:
            for width in (1440,390,320):
                run(browser,args.url.rstrip('/'),filename,width,output)
        finally:
            browser.close()

"""Full-day schedule/filter acceptance in pure local mode; never reaches a backend."""
import argparse
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]

@contextmanager
def entry():
    paths = []
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.tsx', prefix='.life-recovery-', dir=ROOT, delete=False) as source:
            paths.append(Path(source.name))
            source.write("""import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import LifeScheduleDialog from './src/components/AgentLife/LifeScheduleDialog';
import {lifeItems, residents, at} from './src/mocks/agentWorld/residents';
import {worker} from './src/mocks/browser';
import {localMode} from './src/config/development';
import {saveAuthToken} from './src/utils/authStorage';
import './src/index.css';
if(!localMode) throw new Error('Requires pure local mode');
const seed=lifeItems[0];
lifeItems.splice(0,lifeItems.length,...Array.from({length:122},(_,i)=>({...seed,
 id:`overflow-${String(i).padStart(3,'0')}`,actorId:residents[i%residents.length].id,
 source:i<10||i>=100&&i<110?'schedule' as const:'interleaved' as const,
 activity:i<10||i>=100&&i<110?'farm':'cooking',scheduledAt:at(i<100?8:20),originalAt:at(i<100?8:20),
 status:i<100?'completed':'pending',recordId:'',result:{reason:'隔离分页回归'},domainDetail:null,
})));
await worker.start({onUnhandledRequest:'bypass'});
saveAuthToken('local-demo-token',false);
createRoot(document.getElementById('root')!).render(<BrowserRouter><LifeScheduleDialog onClose={()=>{}}/></BrowserRouter>);
""")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', prefix='.life-recovery-', dir=ROOT, delete=False) as html:
            paths.append(Path(html.name))
            html.write(f'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/{paths[0].name}"></script></body></html>')
        yield paths[1].name
    finally:
        for path in paths: path.unlink(missing_ok=True)

def run(browser, base, filename, width, output):
    context = browser.new_context(viewport={'width':width,'height':1000})
    blocked=[]
    context.route(re.compile(re.escape(base)+r'/api/'),lambda route:(blocked.append(route.request.url),route.abort('blockedbyclient')))
    page=context.new_page()
    errors=[];responses=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    page.on('response',lambda response:responses.append((response.url,response.status,response.from_service_worker)) if response.url.startswith(base+'/api/') else None)
    def go(state='populated'):
        page.goto(f'{base}/{filename}?mockState={state}')
        page.wait_for_load_state('networkidle')
    def fits():
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    try:
        go()
        expect(page.get_by_text('共 20 项日程 · 当前来源全天完整展示')).to_be_visible()
        expect(page.get_by_role('button',name=re.compile(r'^主日程\s*20$'))).to_be_visible()
        expect(page.get_by_role('button',name=re.compile(r'^自由\s*102$'))).to_be_visible()
        page.get_by_role('button',name=re.compile(r'^自由\s*102$')).click()
        expect(page.get_by_text('共 122 项日程 · 当前来源全天完整展示')).to_be_visible()
        page.get_by_role('button',name=re.compile(r'^主日程\s*20$')).click()
        expect(page.get_by_text('共 102 项日程 · 当前来源全天完整展示')).to_be_visible()
        page.get_by_role('button',name=re.compile(r'^自由\s*102$')).click()
        expect(page.get_by_text('共 20 项日程 · 当前来源全天完整展示')).to_be_visible()
        page.get_by_role('button',name=re.compile(r'^已完成\s*10$')).click()
        expect(page.get_by_text('今日已完成所有安排',exact=False)).to_have_count(0)
        fits(); page.screenshot(path=str(output/f'life-today-{width}.png'),full_page=True)
        page.get_by_role('button',name='状态看板',exact=True).click()
        expect(page.get_by_role('button',name='主日程',exact=True)).to_be_visible()
        fits(); page.screenshot(path=str(output/f'life-list-{width}.png'),full_page=True)
        go('empty'); expect(page.get_by_text('今天还没有安排',exact=False)).to_be_visible();fits()
        go('error'); expect(page.get_by_text('本地模拟接口失败',exact=False)).to_be_visible();fits()
        page.goto(f'{base}/{filename}?mockState=slow')
        expect(page.get_by_text('正在整理今日日程安排')).to_be_visible()
        expect(page.get_by_text('共 20 项日程 · 当前来源全天完整展示')).to_be_visible(timeout=10000)
        assert not errors,errors
        assert not blocked,blocked
        assert responses and all(status!=501 and sw for _,status,sw in responses),responses
        print(f'PASS width={width} API responses={len(responses)} all via Service Worker')
    finally: context.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--base',default='http://127.0.0.1:5177');parser.add_argument('--output',default='/tmp/odoc-life-browser');args=parser.parse_args()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    with entry() as filename,sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True, channel="chrome")
        try:
            for width in (1440,390):run(browser,args.base,filename,width,output)
        finally:browser.close()

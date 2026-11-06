"""Pure-local acceptance: sample/empty/loading/error, no backend requests."""
import argparse
import re
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://localhost:43127')
    parser.add_argument('--output', default='/private/tmp/odoc-market-retention-ui')
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    paths = []
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.tsx', prefix='.retention-', dir=ROOT, delete=False) as source:
            paths.append(Path(source.name))
            source.write("""import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import MarketDialog from './src/components/Market/MarketDialog';
import {residents} from './src/mocks/agentWorld/residents';
import {worker} from './src/mocks/browser';
import {localMode} from './src/config/development';
import {saveAuthToken} from './src/utils/authStorage';
import './src/index.css';
if(!localMode) throw new Error('Requires pure local mode');
await worker.start({onUnhandledRequest:'bypass'});
saveAuthToken('local-demo-token',false);
createRoot(document.getElementById('root')!).render(<BrowserRouter><MarketDialog residents={residents} onClose={()=>{}}/></BrowserRouter>);
""")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', prefix='.retention-', dir=ROOT, delete=False) as html:
            paths.append(Path(html.name))
            html.write(f'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/{paths[0].name}"></script></body></html>')
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args=['--no-sandbox'])
            for width in (1440, 768, 390):
                context = browser.new_context(viewport={'width': width, 'height': 1000})
                escaped, errors, responses = [], [], []
                context.route(re.compile(re.escape(args.base) + r'/api/'), lambda route: (escaped.append(route.request.url), route.abort('blockedbyclient')))
                page = context.new_page()
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('response', lambda r: responses.append((r.status, r.from_service_worker)) if r.url.startswith(args.base + '/api/') else None)
                def go(state):
                    page.goto(f'{args.base}/{paths[1].name}?mockState={state}', wait_until='domcontentloaded', timeout=60000)
                    page.get_by_role('button', name='市场规划', exact=True).click()
                go('sample')
                expect(page.get_by_text('用途保留与超量处置', exact=True).first).to_be_visible()
                page.get_by_text('用途保留与超量处置', exact=True).first.scroll_into_view_if_needed()
                page.wait_for_timeout(350)
                page.screenshot(path=str(output / f'market-{width}.png'))
                expect(page.get_by_text('部分失败', exact=True).first).to_be_visible()
                page.get_by_text('查看 1 笔失败操作', exact=True).first.click()
                expect(page.get_by_text('库存价格批次不一致，未提交本笔交易', exact=True).first).to_be_visible()
                page.screenshot(path=str(output / f'failures-{width}.png'))
                button = page.get_by_role('button', name=re.compile('全屏|放大|展开.*看板'))
                if button.count():
                    button.first.click()
                    page.wait_for_timeout(500)
                    page.get_by_text('用途保留与超量处置', exact=True).last.scroll_into_view_if_needed()
                    page.wait_for_timeout(350)
                    page.screenshot(path=str(output / f'details-{width}.png'))
                    page.keyboard.press('Escape')
                    page.wait_for_timeout(350)
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
                go('empty')
                expect(page.get_by_text('今天还没有市场规划', exact=True)).to_be_visible()
                go('error')
                expect(page.get_by_role('alert')).to_be_visible()
                go('slow')
                expect(page.get_by_text('正在翻看集市账本…', exact=True)).to_be_visible()
                page.wait_for_timeout(2500)
                expect(page.get_by_text('用途保留与超量处置', exact=True).first).to_be_visible()
                assert not escaped, escaped
                assert not errors, errors
                assert responses and all(status != 501 and sw for status, sw in responses), responses
                context.close()
            browser.close()
        print('PASS: 1440/768/390, four states, failures, local-only requests')
    finally:
        for path in paths:
            path.unlink(missing_ok=True)
if __name__ == '__main__':
    main()

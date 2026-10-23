"""Pure-local browser regressions; temporary entries are removed on exit.
Run with a VITE_LOCAL_MODE=true Vite server and Python Playwright:
python3 scripts/test-review-fixes-browser.py --url http://127.0.0.1:43129
"""
import argparse
import re
from contextlib import contextmanager
from pathlib import Path
import tempfile
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def entry():
    paths = []
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.tsx', prefix='.review-fixes-', dir=ROOT, delete=False) as source:
            paths.append(Path(source.name))
            source.write("""import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {FishingPanel} from './src/components/Fishing/FishingPanel';
import {FishingTripDetails} from './src/components/Fishing/FishingTripDetails';
import WorldWorksDialog from './src/components/AgentWorld/WorldWorksDialog';
import {fishingOverview, fishingTrip} from './src/mocks/agentWorld/adventure';
import {worldPosts} from './src/mocks/agentWorld/social';
import {worker} from './src/mocks/browser';
import {localMode} from './src/config/development';
import {saveAuthToken} from './src/utils/authStorage';
import './src/index.css';
if (!localMode) throw new Error('This regression requires pure local mode');
const [first, second] = fishingOverview.residents;
fishingOverview.items = [first, second].flatMap(resident => Array.from({length:22}, (_, index) => ({
  ...fishingTrip, id:`${resident.id}-${index}`, actorId:resident.id, actorName:resident.name,
})));
fishingOverview.active = [{...fishingTrip, id:'active-first', actorId:first.id, actorName:first.name,
  status:'paused', endedAt:null, authorized:false}];
worldPosts[0].postSummary = '';
worldPosts[0].content = '甲'.repeat(160) + '正文末尾回归关键字';
const detailEvents = Array.from({length:65}, (_, index) => ({
  id:`detail-${index}`, createdAt:fishingTrip.createdAt,
  kind:index < 2 ? 'cast' : index < 5 ? 'duel_round' : 'choice',
  data:index < 2 ? fishingTrip.events[0].data : index < 5 ? {player:'rock', king:'paper', result:'loss', wins:0, losses:1} : {key:'bait', value:'worm'},
}));
function DetailsPreview() {
  const [page, setPage] = React.useState(1);
  return <FishingTripDetails trip={{...fishingTrip, events:detailEvents.slice((page-1)*30,page*30), eventTotal:65, eventPage:page,
    rules:{...fishingTrip.rules, rod:{...fishingTrip.rules.rod, name:'历史钓竿'}, energyCost:7}}}
    loading={false} onBack={() => {}} onPage={setPage}/>;
}
await worker.start({onUnhandledRequest:'bypass'});
saveAuthToken('local-demo-token', false);
createRoot(document.getElementById('root')!).render(<BrowserRouter><main style={{height:'100vh',display:'flex',flexDirection:'column',padding:16}}>
{new URLSearchParams(location.search).get('view') === 'details' ? <DetailsPreview/> : new URLSearchParams(location.search).get('view') === 'works' ? <WorldWorksDialog onClose={() => {}}/> : <FishingPanel/>}
</main></BrowserRouter>);
""")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', prefix='.review-fixes-', dir=ROOT, delete=False) as html:
            paths.append(Path(html.name))
            html.write(f'<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/{paths[0].name}"></script></body></html>')
        yield paths[1].name
    finally:
        for path in paths:
            path.unlink(missing_ok=True)


def run(browser, base, filename, width):
    context = browser.new_context(viewport={'width': width, 'height': 1000})
    # A missing service-worker handler must never reach a real API.
    context.route(re.compile(re.escape(base) + r'/api/'), lambda route: route.abort('blockedbyclient'))
    page = context.new_page()
    errors, responses, console = [], [], []
    page.on('console', lambda message: console.append(message.text))
    page.on('requestfailed', lambda request: console.append(request.url + ' ' + str(request.failure)))
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: responses.append((response.url, response.status, response.from_service_worker)) if response.url.startswith(base + '/api/') else None)
    url = f'{base}/{filename}'
    try:
        page.goto(url)
        page.wait_for_load_state('networkidle')
        cards = page.locator('.fishing-resident-card')
        expect(cards).to_have_count(4)
        second_name = cards.nth(1).locator('h4').inner_text()
        first_name = cards.nth(0).locator('h4').inner_text()
        first_button = page.get_by_role('button', name=f'筛选 {first_name} 的出钓手札', exact=True)
        second_button = page.get_by_role('button', name=f'筛选 {second_name} 的出钓手札', exact=True)
        first_button.focus()
        page.keyboard.press('Tab')
        expect(second_button).to_be_focused()
        page.keyboard.press('Enter')
        expect(second_button).to_have_attribute('aria-pressed', 'true')
        page.keyboard.press('Space')
        expect(second_button).to_have_attribute('aria-pressed', 'false')
        page.keyboard.press('Enter')
        expect(page.get_by_role('heading', name=f'{second_name} 的出钓档案')).to_be_visible()
        archive = page.get_by_role('region', name='出钓档案')
        expect(archive.locator('.fishing-trip-card')).to_have_count(20)
        expect(page.get_by_text('1 / 2', exact=True)).to_be_visible()
        expect(archive.get_by_role('button', name='下一页', exact=True)).to_be_enabled()
        archive.get_by_role('button', name='下一页', exact=True).click()
        expect(archive.locator('.fishing-trip-card')).to_have_count(2)
        expect(page.get_by_text('2 / 2', exact=True)).to_be_visible()
        cards.nth(0).click()
        expect(page.get_by_role('heading', name=f'{first_name} 的出钓档案')).to_be_visible()
        expect(page.get_by_text('1 / 2', exact=True)).to_be_visible()
        expect(archive.locator('.fishing-trip-card')).to_have_count(20)
        page.get_by_role('button', name='显示全部').click()
        expect(page.get_by_text('1 / 3', exact=True)).to_be_visible()
        cards.nth(1).click()
        page.get_by_role('tab', name='水边观察').click()
        # Filtering history must preserve another resident's active trip.
        expect(page.get_by_role('region', name='当前出钓').get_by_text(first_name, exact=True)).to_be_visible()
        for state in ['empty', 'slow', 'error']:
            page.goto(f'{url}?mockState={state}')
            if state == 'slow':
                expect(page.get_by_role('status').filter(has_text='正在读取水边见闻')).to_be_visible()
                expect(page.locator('.fishing-resident-card')).to_have_count(4)
            elif state == 'error':
                expect(page.get_by_role('alert')).to_contain_text('本地模拟接口失败')
            else:
                page.get_by_role('tab', name='出钓手札').click()
                expect(page.get_by_text('还没有返程记录', exact=True)).to_be_visible()
            page.wait_for_load_state('networkidle')
        page.goto(f'{url}?view=works')
        page.wait_for_load_state('networkidle')
        search = page.get_by_placeholder('搜索作品、作者...')
        search.fill('正文末尾回归关键字')
        expect(page.get_by_role('link').filter(has_text='今天的收获与明天的计划')).to_have_count(1)
        expect(page.get_by_text('1 篇', exact=True)).to_be_visible()
        page.goto(f'{url}?view=details')
        page.wait_for_load_state('networkidle')
        expect(page.get_by_text('65 记', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='全部记录 (65)', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='🎣 本页起鱼 (2)', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='👑 本页对决 (3)', exact=True)).to_be_visible()
        expect(page.get_by_text('配备：历史钓竿', exact=True)).to_be_visible()
        expect(page.get_by_text('单竿耗体：7 点', exact=True)).to_be_visible()
        page.get_by_role('button', name='下一页', exact=True).click()
        expect(page.get_by_role('button', name='全部记录 (65)', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='🎣 本页起鱼 (0)', exact=True)).to_be_visible()
        assert not errors, errors
        assert responses and all(sw for _, _, sw in responses), responses
        assert all(status != 501 for _, status, _ in responses), responses
        print({'width': width, 'passed': ['resident pagination', 'reset page on resident change', 'clear filter', 'preserve global active trips', 'empty/loading/error local states', 'search full article beyond 130 characters', 'Tab/Enter/Space resident filter', 'total vs page event counts', 'historical rod and energy rules'], 'apiResponses': len(responses), 'allFromServiceWorker': True, 'pageErrors': errors})
    except Exception:
        print({'pageErrors': errors, 'console': console, 'body': page.locator('body').inner_text()[:3500], 'responses': responses})
        raise
    finally:
        context.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:43129')
    parser.add_argument('--browser', help='Optional Chromium executable path')
    args = parser.parse_args()
    with entry() as filename, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, **({'executable_path': args.browser} if args.browser else {}))
        try:
            for width in [1440, 390]:
                run(browser, args.url.rstrip('/'), filename, width)
        finally:
            browser.close()

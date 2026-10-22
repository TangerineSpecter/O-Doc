"""Read-only UI regression: run against Vite with Python Playwright installed.

python3 scripts/test-fishing-scene-return-browser.py --url http://localhost:43127
All API requests are intercepted; temporary UI entry files are removed on exit.
"""
import argparse
from contextlib import contextmanager
import json
from pathlib import Path
import tempfile
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def entry():
    paths = []
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.tsx', prefix='.fishing-return-', dir=ROOT, delete=False) as source:
            paths.append(Path(source.name))
            source.write("""import React from 'react';
import {createRoot} from 'react-dom/client';
import {FishingPanel} from './src/components/Fishing/FishingPanel';
import './src/index.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><main style={{height:'100vh',display:'flex',flexDirection:'column',padding:16}}><FishingPanel/></main></React.StrictMode>);
""")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', prefix='.fishing-return-', dir=ROOT, delete=False) as html:
            paths.append(Path(html.name))
            html.write(f'<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module" src="/{paths[0].name}"></script></body></html>')
        yield paths[1].name
    finally:
        for path in paths:
            path.unlink(missing_ok=True)


def run(browser, base, filename, with_next):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.clock.install()
    trip = dict(id='watched', actorId='a', actorName='钓手甲', status='active', plan=dict(spot='pond', minutes=30, baits=['worm']),
                casts=0, carried=[], duel=None, error='', reason='', catches=[], experience=0, authorized=True,
                departedAt='2026-10-22T12:00:00+08:00', deadline='2026-10-22T12:30:00+08:00',
                createdAt='2026-10-22T12:00:00+08:00', endedAt=None)
    next_trip = {**trip, 'id': 'next', 'actorId': 'b', 'actorName': '钓手乙'}
    state = dict(returned=False, events=[], detail_reads=0, fail=False, stale=False)
    errors = []
    writes = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def route_api(route):
        path = urlparse(route.request.url).path
        if '/fishing/' in path and route.request.method != 'GET':
            writes.append(path)
        if '/trips/' in path:
            identity = path.split('/trips/')[1].split('/')[0]
            if identity == 'watched':
                state['detail_reads'] += 1
                if state['fail']:
                    return route.fulfill(status=503, json={'msg': 'test unavailable'})
            data = {**(trip if identity == 'watched' else next_trip), 'events': state['events'] if identity == 'watched' else [],
                    'eventTotal': len(state['events']), 'eventPage': 1, 'rules': {'spots': {}, 'baits': {}}}
        elif path.endswith('/fishing/'):
            current_page = int(parse_qs(urlparse(route.request.url).query).get('page', ['1'])[0])
            active = [trip] if not state['returned'] else []
            if state['stale']:
                active = [{**trip, 'status': 'active', 'authorized': True}]
            if with_next:
                active.append(next_trip)
            data = dict(enabled=True, active=active, items=[trip] if state['returned'] and current_page == 1 else [],
                        total=40, page=current_page, residents=[])
        else:
            data = {}
        route.fulfill(status=200, json={'code': 200, 'data': data})

    page.route(f'{base}/api/**', route_api)
    try:
        page.goto(f'{base}/{filename}')
        page.wait_for_load_state('networkidle')
        expect(page.get_by_text('钓手甲 · 正在垂钓', exact=True)).to_be_visible()
        assert state['detail_reads'] >= 1
        page.get_by_role('button', name='下一页', exact=True).click()
        expect(page.get_by_text('2 / 2', exact=True)).to_be_visible()
        page.locator('canvas').evaluate('(canvas) => {canvas.dataset.observation = "original";}')
        state['returned'] = True
        state['fail'] = True
        trip.update(status='completed', authorized=False, endedAt='2026-10-22T12:30:00+08:00')
        for i, name in enumerate(['鲫鱼', '鲤鱼']):
            state['events'].insert(0, dict(id=f'final-{i}', kind='cast', createdAt='2026-10-22T12:30:00+08:00', data={
                'catch': dict(fishId='crucian' if i == 0 else 'carp', name=name, king=False, weight=1, experience=10, caughtAt='2026-10-22T12:30:00+08:00')}))
        page.get_by_role('button', name='刷新钓鱼状态').click()
        page.wait_for_load_state('networkidle')
        # The selected trip must survive disappearing from both visible lists.
        expect(page.locator('canvas')).to_have_attribute('data-observation', 'original')
        page.clock.run_for(5100)
        expect(page.get_by_text('逐竿记录暂时无法读取，正在重连…', exact=True)).to_be_visible()
        expect(page.locator('canvas')).to_have_attribute('data-observation', 'original')
        state['fail'] = False
        state['stale'] = True  # A lagging overview must not reselect the completed trip.
        page.clock.run_for(5100)
        page.wait_for_load_state('networkidle')
        page.clock.run_for(100)
        expect(page.get_by_role('status').filter(has_text='钓获 鲫鱼')).to_be_visible()
        expect(page.get_by_text('钓手甲 · 本次已返程', exact=True)).to_be_visible()
        # Changing archive pages while playing must not recreate the canvas/cursor.
        page.get_by_role('button', name='上一页', exact=True).click()
        page.wait_for_load_state('networkidle')
        page.clock.run_for(6100)
        expect(page.get_by_role('status').filter(has_text='钓获 鲤鱼')).to_be_visible()
        expect(page.locator('canvas')).to_have_attribute('data-observation', 'original')
        page.clock.run_for(6100)
        if with_next:
            expect(page.get_by_text('钓手乙 · 正在垂钓', exact=True)).to_be_visible()
        else:
            expect(page.get_by_role('button', name='预览挥杆', exact=True)).to_be_visible()
        page.clock.run_for(5100)
        assert page.locator('canvas').get_attribute('data-observation') is None
        assert not errors, errors
        assert not writes, writes
        print(json.dumps({'nextResident': with_next, 'passed': ['page 2 return', 'failed final fetch retains observation', 'all queued catches play', 'pagination during playback', 'release after drain', 'ignore stale overview'], 'pageErrors': errors}, ensure_ascii=False))
    finally:
        page.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://localhost:43127')
    parser.add_argument('--browser', help='Optional Chromium executable path')
    args = parser.parse_args()
    options = {'headless': True}
    if args.browser:
        options['executable_path'] = args.browser
    with entry() as filename, sync_playwright() as playwright:
        browser = playwright.chromium.launch(**options)
        try:
            for with_next in (False, True):
                run(browser, args.url.rstrip('/'), filename, with_next)
        finally:
            browser.close()

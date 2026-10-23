"""Pure-local fishing analytics UI regression; temporary entry is cleaned on exit."""
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
        with tempfile.NamedTemporaryFile(mode='w', suffix='.tsx', prefix='.fishing-analytics-', dir=ROOT, delete=False) as source:
            paths.append(Path(source.name))
            source.write("""import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import ResidentAnalyticsDialog from './src/components/AgentWorld/Analytics/ResidentAnalyticsDialog';
import {analytics} from './src/mocks/agentWorld/social';
import {worker} from './src/mocks/browser';
import {localMode} from './src/config/development';
import {saveAuthToken} from './src/utils/authStorage';
import './src/index.css';
if (!localMode) throw new Error('Requires pure local mode');
await worker.start({onUnhandledRequest:'bypass'});
saveAuthToken('local-demo-token', false);
const actor = new URLSearchParams(location.search).get('actor') || '';
createRoot(document.getElementById('root')!).render(<BrowserRouter><ResidentAnalyticsDialog
initialActorId={actor ? analytics.residents[0].id : ''} initialResidents={analytics.residents} onClose={() => {}}/></BrowserRouter>);
""")
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', prefix='.fishing-analytics-', dir=ROOT, delete=False) as html:
            paths.append(Path(html.name))
            html.write(f'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div><script type="module" src="/{paths[0].name}"></script></body></html>')
        yield paths[1].name
    finally:
        for path in paths:
            path.unlink(missing_ok=True)


def run(browser, base, filename, width, domain='fishing'):
    heading_text = '大乐透统计' if domain == 'lottery' else '钓鱼统计'
    empty_text = '所选日期内暂无大乐透购票或收支记录' if domain == 'lottery' else '所选日期内暂无钓鱼记录'
    context = browser.new_context(viewport={'width': width, 'height': 1000})
    context.route(re.compile(re.escape(base) + r'/api/'), lambda route: route.abort('blockedbyclient'))
    page = context.new_page()
    errors, responses = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: responses.append((response.status, response.from_service_worker)) if response.url.startswith(base + '/api/') else None)
    try:
        for state in ['populated', 'empty', 'slow', 'error']:
            page.goto(f'{base}/{filename}?mockState={state}')
            if state == 'slow':
                expect(page.locator('[aria-busy=true]')).to_be_visible()
            if state == 'error':
                expect(page.get_by_role('alert')).to_be_visible()
            else:
                heading = page.get_by_role('heading', name=heading_text, exact=True)
                heading.scroll_into_view_if_needed()
                expect(heading).to_be_visible()
                if state == 'empty':
                    expect(page.get_by_text(empty_text, exact=True)).to_be_visible()
                else:
                    table = heading.locator('xpath=ancestor::section[1]').locator('table[aria-label="大乐透居民统计"]' if domain == 'lottery' else 'table')
                    expect(table.locator('tbody tr')).to_have_count(4)
                    if state == 'populated':
                        page.screenshot(path=f'/tmp/{domain}-analytics-{width}.png', full_page=True)
                        if domain == 'lottery':
                            table.scroll_into_view_if_needed()
                            if width < 600:
                                table.locator('xpath=..').evaluate('(el) => {el.scrollLeft = el.scrollWidth}')
                                assert table.locator('xpath=..').evaluate('(el) => el.scrollLeft > 0')
                            page.screenshot(path=f'/tmp/{domain}-analytics-{width}-details.png', full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        page.goto(f'{base}/{filename}?actor=first')
        heading = page.get_by_role('heading', name=heading_text, exact=True)
        heading.scroll_into_view_if_needed()
        expect(heading.locator('xpath=ancestor::section[1]').locator('table[aria-label="大乐透居民统计"] tbody tr' if domain == 'lottery' else 'table tbody tr')).to_have_count(1)
        assert not errors, errors
        assert responses and all(worker and status != 501 for status, worker in responses), responses
        print(f'{width}px: populated, empty, slow, error, resident filter and local-only requests passed')
    finally:
        context.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:43139')
    parser.add_argument('--browser')
    parser.add_argument('--domain', choices=['fishing', 'lottery'], default='fishing')
    args = parser.parse_args()
    with entry() as filename, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, **({'executable_path': args.browser} if args.browser else {}))
        try:
            for width in [1440, 390]:
                run(browser, args.url.rstrip('/'), filename, width, args.domain)
        finally:
            browser.close()

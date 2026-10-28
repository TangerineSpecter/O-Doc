"""Verify local novel listing and reader without allowing real API requests."""
import asyncio
import sys

from playwright.async_api import async_playwright


async def scenario(browser, origin, state):
    context = await browser.new_context()
    page = await context.new_page()
    unexpected = []
    responses = []

    async def fail_unmocked(route):
        unexpected.append(route.request.url)
        await route.abort()

    await context.route(f'{origin}/api/**', fail_unmocked)
    page.on('response', lambda response: responses.append((response.url, response.status)) if '/api/' in response.url else None)
    try:
        await page.goto(f'{origin}/scripts/fixtures/novel-reader.html?mockState={state}', wait_until='domcontentloaded')
        if state == 'slow':
            await page.get_by_text('正在打开小说…').wait_for(timeout=5000)
        if state == 'error':
            await page.get_by_text('本地模拟接口失败，可切回样例状态重试').wait_for(timeout=10000)
        elif state == 'empty':
            await page.get_by_text('还没有发布章节。').wait_for(timeout=10000)
        else:
            await page.get_by_text('已发布目录 · 2 章').wait_for(timeout=10000)
            await page.get_by_text('这是已发布的本地阅读样例。').wait_for(timeout=10000)
            await page.get_by_role('button', name='下一章').click()
            await page.get_by_text('旅程从这里开始。').wait_for(timeout=10000)
        result = await page.evaluate("""async () => {
            const headers = location.search.includes('empty') ? {Authorization: 'Token local-demo-token'} : {};
            const paths = ['/api/anthology/list?type=novel', '/api/anthology/detail/local-novel-reader',
                '/api/novel/local-novel-reader/read/local-novel-broken/',
                '/api/novel/local-novel-reader/read/local-novel-wrong-owner/'];
            const responses = await Promise.all(paths.map(path => fetch(path, {headers})));
            return {statuses: responses.map(response => response.status), bodies: await Promise.all(responses.map(response => response.json()))};
        }""")
        expected = [503, 503, 503, 503] if state == 'error' else [200, 200, 404, 404]
        assert result['statuses'] == expected, result
        assert all(status != 501 for _, status in responses), responses
        assert not any(url.split('?')[0].endswith('/api/novel/local-novel-reader/')
                       or '/api/novel/models/' in url for url, _ in responses), responses
        assert not unexpected, unexpected
        print(f'novel reader local {state}: passed')
    finally:
        await context.close()


async def main(origin):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, channel='chrome')
        try:
            for state in ('populated', 'empty', 'slow', 'error'):
                await scenario(browser, origin, state)
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:5191'))

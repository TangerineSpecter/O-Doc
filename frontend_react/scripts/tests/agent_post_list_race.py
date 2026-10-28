"""Browser regression for the real Agent post list hook.

Start Vite in local mode and pass its origin, for example:
  VITE_LOCAL_MODE=true npm run dev -- --host 127.0.0.1 --port 5191
  python3 scripts/tests/agent_post_list_race.py http://127.0.0.1:5191
Requires Python Playwright and installed Chrome. Every /api request is intercepted.
"""
import asyncio
import json
import sys

from playwright.async_api import async_playwright


async def scenario(browser, origin, *, delays, fail_first=False, fail_second=False, unmount=False):
    page = await browser.new_page()
    await page.add_init_script('window.__odocPostRaceTest = true')
    counts = {'list': 0, 'comments': 0}
    unexpected = []

    async def route_handler(route):
        path = route.request.url.split('?', 1)[0]
        if path.endswith('/api/article/list'):
            counts['list'] += 1
            index = counts['list']
            await asyncio.sleep(delays[index - 1])
            if (index == 1 and fail_first) or (index == 2 and fail_second):
                await route.fulfill(status=200, content_type='application/json',
                                    body=json.dumps({'code': 400, 'msg': '模拟列表失败', 'data': None}))
                return
            data = [{'articleId': str(index), 'title': f'list-{index}', 'createdAt': '2026-01-01',
                     'content': '', 'collId': 'race'}]
        elif 'latest-comments' in path:
            counts['comments'] += 1
            index = counts['comments']
            data = {'comments': [{'commentId': str(index), 'content': f'comments-{index}'}], 'count': 1}
        elif path.endswith('/api/settings/agents/'):
            data = []
        else:
            unexpected.append(path)
            await route.abort()
            return
        await route.fulfill(status=200, content_type='application/json',
                            body=json.dumps({'code': 200, 'msg': 'ok', 'data': data}))

    await page.route(f'{origin}/api/**', route_handler)
    await page.goto(f'{origin}/scripts/fixtures/agent-post-list-race.html', wait_until='domcontentloaded')
    await page.get_by_role('button', name='重新加载').wait_for()
    await page.wait_for_function("document.querySelector('[data-testid=loading]').textContent === 'true'")
    await page.get_by_role('button', name='手动刷新' if fail_second else '重新加载').click()
    if unmount:
        await page.get_by_role('button', name='卸载').click()
    elif delays[0] < delays[1]:
        await page.wait_for_timeout(int((delays[0] + .15) * 1000))
        assert await page.get_by_test_id('loading').inner_text() == 'true', '旧请求结束不能关闭新请求的加载状态'
    await page.wait_for_timeout(int((max(delays) + .35) * 1000))
    if unmount:
        assert await page.get_by_test_id('title').count() == 0
        assert '加载 Agent 帖子失败' not in await page.locator('body').inner_text()
    else:
        assert await page.get_by_test_id('loading').inner_text() == 'false'
        assert await page.get_by_test_id('title').inner_text() == ('' if fail_second else 'list-2')
        if not fail_second:
            assert await page.get_by_test_id('comments').inner_text() == 'comments-2'
        if fail_second:
            body = await page.locator('body').inner_text()
            assert '加载 Agent 帖子失败' in body
            assert '已刷新最新帖子' not in body
        elif fail_first:
            assert '加载 Agent 帖子失败' not in await page.locator('body').inner_text()
    assert counts == {'list': 2, 'comments': 2}, counts
    assert not unexpected, unexpected
    await page.close()


async def main(origin):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, channel='chrome')
        try:
            await scenario(browser, origin, delays=(1.0, .05))
            await scenario(browser, origin, delays=(.2, 1.0))
            await scenario(browser, origin, delays=(1.0, .05), fail_first=True)
            await scenario(browser, origin, delays=(1.0, .05), fail_second=True)
            await scenario(browser, origin, delays=(1.0, .05), fail_first=True, unmount=True)
        finally:
            await browser.close()
    print('Agent post list: five request-order, error and unmount scenarios passed')


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:5191'))

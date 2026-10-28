"""Exercise out-of-order initial and periodic comment reads in a local-only browser."""
import asyncio
import json
import sys

from playwright.async_api import async_playwright


async def scenario(browser, origin, *, older_is_initial, older_fails=False, newer_fails=False):
    page = await browser.new_page()
    await page.add_init_script('window.__odocPostRaceTest = true')
    await page.clock.install()
    reads = 0
    delayed_started = asyncio.Event()
    release_delayed = asyncio.Event()
    delayed_finished = asyncio.Event()
    unexpected = []
    delayed_index = 1 if older_is_initial else 2

    async def api(route):
        nonlocal reads
        path = route.request.url.split('?', 1)[0]
        method = route.request.method
        if path.endswith('/api/article/list'):
            data = []
        elif 'latest-comments' in path:
            data = {'comments': [], 'count': 0}
        elif path.endswith('/api/settings/agents/'):
            data = []
        elif path.endswith('/api/article/detail/post-1'):
            data = {'articleId': 'post-1', 'title': '帖子', 'content': '', 'createdAt': '2026-01-01',
                    'updatedAt': '2026-01-01', 'collId': 'race', 'agentPostHasBeenRead': True}
        elif path.endswith('/api/article/agent-posts/post-1/comments') and method == 'GET':
            reads += 1
            index = reads
            if index == delayed_index:
                delayed_started.set()
                await release_delayed.wait()
            if (index == delayed_index and older_fails) or (index == delayed_index + 1 and newer_fails):
                await route.fulfill(status=200, content_type='application/json',
                                    body=json.dumps({'code': 400, 'msg': '模拟读取失败', 'data': None}))
                if index == delayed_index:
                    delayed_finished.set()
                return
            text = '较新评论' if index == delayed_index + 1 else '较旧评论'
            data = {'comments': [{'commentId': str(index), 'content': text, 'createdAt': '2026-01-01'}], 'count': 1}
        else:
            unexpected.append(f'{method} {path}')
            await route.abort()
            return
        await route.fulfill(status=200, content_type='application/json',
                            body=json.dumps({'code': 200, 'msg': 'ok', 'data': data}))
        if path.endswith('/api/article/agent-posts/post-1/comments') and reads >= delayed_index:
            if index == delayed_index:
                delayed_finished.set()

    async def wait_text(expected):
        async def wait():
            while await page.get_by_test_id('post-comments').inner_text() != expected:
                await asyncio.sleep(.02)
        await asyncio.wait_for(wait(), timeout=5)

    await page.route(f'{origin}/api/**', api)
    try:
        await page.goto(f'{origin}/scripts/fixtures/agent-post-list-race.html', wait_until='domcontentloaded')
        await page.get_by_role('button', name='打开详情').click()
        if not older_is_initial:
            await wait_text('较旧评论')
            await page.clock.fast_forward(30000)
        await asyncio.wait_for(delayed_started.wait(), timeout=5)
        await page.clock.fast_forward(30000)
        if not newer_fails:
            await wait_text('较新评论')
        else:
            async def wait_for_newer():
                while reads < delayed_index + 1:
                    await asyncio.sleep(.02)
            await asyncio.wait_for(wait_for_newer(), timeout=5)
            await asyncio.sleep(.1)
        release_delayed.set()
        await asyncio.wait_for(delayed_finished.wait(), timeout=5)
        await asyncio.sleep(.2)
        expected = '较旧评论' if newer_fails else '较新评论'
        assert await page.get_by_test_id('post-comments').inner_text() == expected
        assert not unexpected, unexpected
    finally:
        release_delayed.set()
        await page.close()


async def main(origin):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, channel='chrome')
        try:
            for older_is_initial, older_fails, newer_fails in [
                (True, False, False), (False, False, False), (True, True, False), (False, False, True),
            ]:
                await scenario(browser, origin, older_is_initial=older_is_initial,
                               older_fails=older_fails, newer_fails=newer_fails)
        finally:
            await browser.close()
    print('Agent post comments: initial/poll ordering and error recovery passed')


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:5191'))

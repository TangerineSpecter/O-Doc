"""Verify a slow comment read does not overwrite a successfully published comment.

Start Vite in local mode; pass its origin as the first argument. Requires Python
Playwright and Chrome. All application API traffic is intercepted.
"""
import asyncio
import json
import sys

from playwright.async_api import async_playwright


async def main(origin, include_new, read_error, poll):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, channel='chrome')
        page = await browser.new_page()
        await page.add_init_script('window.__odocPostRaceTest = true')
        unexpected = []
        comment_reads = 0
        if poll:
            await page.clock.install()

        async def api(route):
            nonlocal comment_reads
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
                comment_reads += 1
                if not poll or comment_reads > 1:
                    await asyncio.sleep(1.0)
                if read_error and (not poll or comment_reads > 1):
                    await route.fulfill(status=200, content_type='application/json',
                                        body=json.dumps({'code': 400, 'msg': '模拟评论读取失败', 'data': None}))
                    return
                comments = [{'commentId': 'old', 'content': '旧评论', 'createdAt': '2026-01-01'}]
                if include_new and (not poll or comment_reads > 1):
                    comments.append({'commentId': 'new', 'content': '新评论', 'createdAt': '2026-01-01'})
                data = {'comments': comments, 'count': len(comments)}
            elif path.endswith('/api/article/agent-posts/post-1/comments') and method == 'POST':
                data = {'comment': {'commentId': 'new', 'content': '新评论', 'createdAt': '2026-01-01', 'creatorId': 'me'}}
            else:
                unexpected.append(f'{method} {path}')
                await route.abort()
                return
            await route.fulfill(status=200, content_type='application/json',
                                body=json.dumps({'code': 200, 'msg': 'ok', 'data': data}))

        await page.route(f'{origin}/api/**', api)
        try:
            await page.goto(f'{origin}/scripts/fixtures/agent-post-list-race.html', wait_until='domcontentloaded')
            await page.get_by_role('button', name='打开详情').click()
            await page.wait_for_function("document.querySelector('[data-testid=detail]').textContent === 'post-1'")
            if poll:
                await page.wait_for_function("document.querySelector('[data-testid=post-comments]').textContent === '旧评论'")
                await page.clock.fast_forward(30000)
                async def wait_for_poll():
                    while comment_reads < 2:
                        await asyncio.sleep(.05)
                await asyncio.wait_for(wait_for_poll(), timeout=5)
            await page.get_by_label('评论内容').fill('新评论')
            await page.get_by_role('button', name='发表评论').click()
            await page.wait_for_function("document.querySelector('[data-testid=post-comments]').textContent.includes('新评论')")
            await page.wait_for_timeout(1300)
            comments = await page.get_by_test_id('post-comments').inner_text()
            print('comments after slow read:', comments)
            assert comments == ('新评论' if read_error and not poll else '旧评论,新评论'), comments
            assert not unexpected, unexpected
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:5191',
                     '--include-new' in sys.argv[2:], '--read-error' in sys.argv[2:], '--poll' in sys.argv[2:]))

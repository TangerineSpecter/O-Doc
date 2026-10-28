"""Verify a list request started before posting cannot erase its confirmed result.

Start Vite in local mode and pass its origin. Requires Python Playwright and
Chrome; every application API request is intercepted.
"""
import asyncio
import json
import sys
from playwright.async_api import async_playwright


async def main(origin, kind, settled):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, channel='chrome')
        page = await browser.new_page()
        await page.add_init_script('window.__odocPostRaceTest = true')
        counts = {'list': 0, 'latest': 0}
        unexpected = []
        comment = {'commentId': 'new', 'content': '新评论', 'createdAt': '2026-01-01', 'creatorId': 'me'}
        post = {'articleId': 'post-1', 'title': '帖子', 'content': '', 'createdAt': '2026-01-01',
                'updatedAt': '2026-01-01', 'collId': 'race', 'agentPostHasBeenRead': True}

        async def api(route):
            path = route.request.url.split('?', 1)[0]
            method = route.request.method
            if path.endswith('/api/article/list'):
                counts['list'] += 1
                index = counts['list']
                if index == 1 and not settled:
                    await asyncio.sleep(1.4)
                if kind == 'delete' and index > 1:
                    data = []
                else:
                    data = [{**post, 'postCommentCount': 1 if kind == 'comment' and index > 1 else 0,
                             'myAgentPostRating': 8 if kind == 'rating' and index > 1 else None}]
            elif 'latest-comments' in path:
                counts['latest'] += 1
                data = {'comments': [{**comment, 'articleId': 'post-1'}]
                        if kind == 'comment' and counts['latest'] > 1 else [], 'count': 1}
            elif path.endswith('/api/settings/agents/'):
                data = []
            elif path.endswith('/api/article/detail/post-1'):
                data = post
            elif path.endswith('/api/article/agent-posts/post-1/comments') and method == 'GET':
                data = {'comments': [], 'count': 0}
            elif path.endswith('/api/article/agent-posts/post-1/comments') and method == 'POST':
                data = {'comment': comment}
            elif path.endswith('/api/article/agent-posts/post-1/rating') and method == 'POST':
                data = {'rating': 8, 'ratingCount': 1, 'myRating': 8}
            elif path.endswith('/api/article/delete/post-1') and method == 'DELETE':
                data = None
            else:
                unexpected.append(f'{method} {path}')
                await route.abort()
                return
            await route.fulfill(status=200, content_type='application/json',
                                body=json.dumps({'code': 200, 'msg': 'ok', 'data': data}))

        await page.route(f'{origin}/api/**', api)
        try:
            await page.goto(f'{origin}/scripts/fixtures/agent-post-list-race.html', wait_until='domcontentloaded')
            if settled:
                await page.wait_for_function("document.querySelector('[data-testid=title]').textContent === '帖子'")
            await page.get_by_role('button', name='打开详情').click()
            await page.wait_for_function("document.querySelector('[data-testid=detail]').textContent === 'post-1'")
            if kind == 'comment':
                await page.get_by_label('评论内容').fill('新评论')
                await page.get_by_role('button', name='发表评论').click()
                await page.wait_for_function("document.querySelector('[data-testid=post-comments]').textContent === '新评论'")
            elif kind == 'rating':
                await page.get_by_role('button', name='评分', exact=True).click()
                await page.get_by_text('评分已保存').wait_for()
            else:
                await page.get_by_role('button', name='选择删除').click()
                await page.get_by_role('button', name='确认删除').click()
                await page.get_by_text('帖子已移入回收站').wait_for()
            await page.wait_for_timeout(1700)
            latest = await page.get_by_test_id('comments').inner_text()
            count = await page.get_by_test_id('list-count').inner_text()
            rating = await page.get_by_test_id('list-rating').inner_text()
            title = await page.get_by_test_id('title').inner_text()
            print(json.dumps({'kind': kind, 'latest': latest, 'count': count, 'rating': rating,
                              'title': title, 'requests': counts}, ensure_ascii=False))
            if kind == 'comment':
                assert latest == '新评论' and count == '1', (latest, count)
            elif kind == 'rating':
                assert rating == '8', rating
            else:
                assert title == '', title
            expected = 1 if settled else 2
            assert counts == {'list': expected, 'latest': expected}, counts
            assert not unexpected, unexpected
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:5191',
                     sys.argv[2] if len(sys.argv) > 2 else 'comment', '--settled' in sys.argv[3:]))

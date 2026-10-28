"""Verify local photo-group list and editor scenarios through the service worker."""
import asyncio
import sys
from playwright.async_api import async_playwright


async def scenario(browser, origin, state):
    context = await browser.new_context()
    page = await context.new_page()
    api_responses = []
    page.on('response', lambda response: api_responses.append((response.url, response.status)) if '/api/' in response.url else None)
    try:
        await page.goto(f'{origin}/scripts/fixtures/image-group.html?mockState={state}', wait_until='domcontentloaded')
        if state == 'slow':
            await page.get_by_text('正在加载照片').wait_for(timeout=5000)
        if state == 'error':
            await page.get_by_text('照片加载失败').wait_for(timeout=10000)
        elif state == 'empty':
            await page.get_by_text('暂无照片').wait_for(timeout=10000)
        else:
            await page.get_by_text('照片数量：3').wait_for(timeout=10000)
            await page.get_by_role('button', name='编辑本地拍摄组').click()
            await page.get_by_role('heading', name='编辑拍摄组').wait_for()
            await page.get_by_role('button', name='保存拍摄组').click()
            await page.get_by_text('拍摄组已更新').wait_for(timeout=10000)
            await page.get_by_text('照片数量：3').wait_for(timeout=10000)
            results = await page.evaluate("""async () => {
                const headers = {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'};
                const before = await (await fetch('/api/article/image/list/local-photo-collection')).json();
                const update = await fetch('/api/article/image/group/local-photo-group', {
                    method: 'PUT', headers, body: JSON.stringify({photos: [{imageId: 'local-photo-foreign'}]})
                });
                const after = await (await fetch('/api/article/image/list/local-photo-collection')).json();
                return {status: update.status, before: before.data, after: after.data};
            }""")
            assert results['status'] == 400 and results['before'] == results['after']
            regroup = await page.evaluate("""async () => {
                const headers = {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'};
                const response = await fetch('/api/article/image/group/create', {method: 'POST', headers,
                    body: JSON.stringify({collId: 'local-photo-collection', title: '新组',
                        photos: [{imageId: 'local-photo-1'}, {imageUrl: '/favicon.svg'}]})});
                const list = await (await fetch('/api/article/image/list/local-photo-collection')).json();
                return {status: response.status, list: list.data};
            }""")
            assert regroup['status'] == 200 and len(regroup['list']) == 4
            assert next(image for image in regroup['list'] if image['imageId'] == 'local-photo-2')['photoGroupId'] == ''
            move = await page.evaluate("""async () => {
                const headers = {'Content-Type': 'application/json', Authorization: 'Token local-demo-token'};
                const updated = await fetch('/api/article/image/update/local-photo-1', {
                    method: 'PUT', headers, body: JSON.stringify({collId: 'local-photo-secondary'})
                });
                const source = await (await fetch('/api/article/image/list/local-photo-collection')).json();
                const target = await (await fetch('/api/article/image/list/local-photo-secondary')).json();
                const detail = await (await fetch('/api/article/image/detail/local-photo-1')).json();
                return {status: updated.status, source: source.data, target: target.data, detail: detail.data};
            }""")
            assert move['status'] == 200
            assert not any(image['imageId'] == 'local-photo-1' for image in move['source'])
            assert next(image for image in move['source'] if image['imageId'] == 'local-photo-2')['photoGroupId'] == ''
            assert move['target'][0]['imageId'] == 'local-photo-1'
            assert move['detail']['collId'] == 'local-photo-secondary' and move['detail']['photoGroupId'] == ''
        if state in ('empty', 'error'):
            target = await page.evaluate("""async () => {
                const response = await fetch('/api/article/image/list/local-photo-secondary');
                return {status: response.status, body: await response.json()};
            }""")
            assert target['status'] == (503 if state == 'error' else 200)
            if state == 'empty':
                assert target['body']['data'] == []
        assert all(status != 501 for _, status in api_responses), api_responses
        print(f'image group local {state}: passed')
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

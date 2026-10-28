"""Exercise success and interruption through the real chat hook, with all API traffic intercepted."""
import asyncio
import json
import sys
from playwright.async_api import async_playwright


async def scenario(browser, origin, interrupted):
    page = await browser.new_page()
    await page.add_init_script('window.__odocChatStreamTest = true')
    unexpected = []
    answer = '回答😀中文' * 20
    thinking = '思考🌿' * 20

    async def api(route):
        path = route.request.url.split('?', 1)[0]
        if path.endswith('/api/ai/chat/'):
            events = [{'type': 'thinking', 'content': thinking}, {'type': 'content', 'content': answer}]
            if not interrupted:
                events.append({'type': 'done'})
            await route.fulfill(status=200, content_type='application/x-ndjson',
                                body='\n'.join(json.dumps(event, ensure_ascii=False) for event in events) + '\n')
        elif '/api/system/logs/' in path:
            await route.fulfill(status=200, content_type='application/json', body='{}')
        else:
            unexpected.append(path)
            await route.abort()

    await page.route(f'{origin}/api/**', api)
    try:
        await page.goto(f'{origin}/scripts/fixtures/chat-stream.html', wait_until='domcontentloaded')
        await page.get_by_role('button', name='发送').click()
        await page.wait_for_function("""() => {
            const list = JSON.parse(document.querySelector('[data-testid=messages]').textContent);
            return list.some(item => item.role === 'assistant' && (item.error || item.content.length >= 100))
                && document.querySelector('[data-testid=loading]').textContent === 'false';
        }""", timeout=15000)
        messages = json.loads(await page.get_by_test_id('messages').inner_text())
        assistant = [message for message in messages if message.get('role') == 'assistant' and not message.get('status')][-1]
        assert assistant['content'] == answer, (interrupted, len(assistant['content']))
        assert assistant['thinking'] == thinking
        assert bool(assistant.get('error')) == interrupted
        assert not unexpected, unexpected
        print(f"chat {'interrupted' if interrupted else 'success'}: text and thinking preserved")
    finally:
        await page.close()


async def main(origin):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, channel='chrome')
        try:
            await scenario(browser, origin, False)
            await scenario(browser, origin, True)
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:5191'))

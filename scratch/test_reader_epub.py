import os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/tmp/reader-slide')
TOKEN = os.environ.get('ODOC_TOKEN', '')
if not TOKEN:
    raise SystemExit('Set ODOC_TOKEN')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context(viewport={'width': 1440, 'height': 900}).new_page()
    page.goto('http://localhost:5173/login')
    page.evaluate(f"localStorage.setItem('token', '{TOKEN}')")
    page.goto('http://localhost:5173/books/coll_HUs1KMlIWu')
    page.get_by_text('我的书架').wait_for(timeout=20000)
    page.locator('h2', has_text='深度学习').first.click()
    page.get_by_text('返回书架').wait_for(timeout=60000)
    for _ in range(40):
        if page.locator('[aria-label="正在打开图书"]').count() == 0:
            break
        page.wait_for_timeout(400)
    page.wait_for_timeout(2000)
    try:
        page.wait_for_function("() => document.querySelectorAll('.reader-epub-snapshot iframe').length > 0", timeout=20000)
        print('probe ready', flush=True)
    except Exception as exc:
        print('probe not ready', exc, flush=True)
    session = page.context.new_cdp_session(page)
    def snap(name):
        raw = session.send('Page.captureScreenshot', {'format': 'png'})
        (OUT / name).write_bytes(__import__('base64').b64decode(raw['data']))
        print('wrote', name, flush=True)
    snap('e1-open.png')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(140)
    info = page.evaluate("""() => {
        const stack = document.querySelector('.reader-paper-stack');
        const over = document.querySelector('.reader-paper-over');
        return {
            hasStack: Boolean(stack),
            transform: over && getComputedStyle(over).transform,
            snapshotIframes: document.querySelectorAll('.reader-epub-snapshot iframe').length,
        };
    }""")
    print('anim', info, flush=True)
    snap('e2-anim.png')
    page.wait_for_timeout(700)
    snap('e3-after.png')
    print('done', flush=True)
    browser.close()

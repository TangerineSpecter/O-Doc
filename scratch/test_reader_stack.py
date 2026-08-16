from pathlib import Path
import base64
import os
from playwright.sync_api import sync_playwright

OUT = Path('/tmp/reader-stack')
OUT.mkdir(parents=True, exist_ok=True)
TOKEN = os.environ.get('ODOC_TOKEN', '')
if not TOKEN:
    raise SystemExit('Set ODOC_TOKEN')

def snap(session, name):
    raw = session.send('Page.captureScreenshot', {'format': 'png'})
    (OUT / name).write_bytes(base64.b64decode(raw['data']))
    print('wrote', name, flush=True)

def inspect(page, label):
    info = page.evaluate("""() => {
        const over = document.querySelector('.reader-paper-over');
        const liveDoc = over && over.querySelector('iframe') && over.querySelector('iframe').contentDocument;
        const liveText = liveDoc ? (liveDoc.body && liveDoc.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 80) : '';
        const layers = [...document.querySelectorAll('.reader-paper-under .reader-paper-layer')];
        const layerText = layers.map(layer => {
            const iframe = layer.querySelector('iframe');
            const doc = iframe && iframe.contentDocument;
            return {
                display: layer.style.display,
                iframes: layer.querySelectorAll('iframe').length,
                text: doc && doc.body ? (doc.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 60) : '',
            };
        });
        return {
            hasStack: Boolean(document.querySelector('.reader-paper-stack')),
            overTransform: over && getComputedStyle(over).transform,
            liveText,
            layers: layerText,
        };
    }""")
    print(f'[{label}]', info, flush=True)
    return info

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context(viewport={'width': 1440, 'height': 900}).new_page()
    session = page.context.new_cdp_session(page)
    page.goto('http://localhost:5173/login')
    page.evaluate(f"localStorage.setItem('token', '{TOKEN}')")
    page.goto('http://localhost:5173/books/coll_HUs1KMlIWu')
    page.get_by_text('我的书架').wait_for(timeout=20000)

    # PDF
    page.locator('h2', has_text='数学之美').first.click()
    page.get_by_text('返回书架').wait_for(timeout=60000)
    for _ in range(40):
        if page.locator('[aria-label="正在打开图书"]').count() == 0:
            break
        page.wait_for_timeout(400)
    page.wait_for_timeout(800)
    inspect(page, 'pdf-open')
    snap(session, 'p1-open.png')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(140)
    inspect(page, 'pdf-anim')
    snap(session, 'p2-anim.png')
    page.wait_for_timeout(500)
    snap(session, 'p3-after.png')
    page.get_by_text('返回书架').click()
    page.get_by_text('我的书架').wait_for()

    # EPUB
    page.locator('h2', has_text='深度学习').first.click()
    page.get_by_text('返回书架').wait_for(timeout=60000)
    for _ in range(50):
        if page.locator('[aria-label="正在打开图书"]').count() == 0:
            break
        page.wait_for_timeout(400)
    try:
        page.wait_for_function(
            "() => document.querySelectorAll('.reader-paper-under iframe').length >= 1",
            timeout=25000,
        )
        print('epub snapshots ready', flush=True)
    except Exception as exc:
        print('epub snapshot wait failed', exc, flush=True)
    page.wait_for_timeout(800)
    inspect(page, 'epub-open')
    snap(session, 'e1-open.png')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(150)
    inspect(page, 'epub-next-anim')
    snap(session, 'e2-next-anim.png')
    page.wait_for_timeout(600)
    inspect(page, 'epub-next-after')
    snap(session, 'e3-next-after.png')
    page.wait_for_timeout(1800)
    page.keyboard.press('ArrowLeft')
    page.wait_for_timeout(150)
    inspect(page, 'epub-prev-anim')
    snap(session, 'e4-prev-anim.png')
    page.wait_for_timeout(600)
    snap(session, 'e5-prev-after.png')
    print('done', flush=True)
    browser.close()

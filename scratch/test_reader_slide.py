import os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/tmp/reader-slide')
OUT.mkdir(parents=True, exist_ok=True)
TOKEN = os.environ.get('ODOC_TOKEN', '')
if not TOKEN:
    raise SystemExit('Set ODOC_TOKEN')
URL = 'http://localhost:5173/books/coll_HUs1KMlIWu'

def wait_reader(page, timeout=60000):
    page.get_by_text('返回书架').wait_for(timeout=timeout)
    page.wait_for_timeout(400)
    # Wait until the opening spinner overlay is gone.
    for _ in range(60):
        if page.locator('[aria-label="正在打开图书"]').count() == 0:
            break
        page.wait_for_timeout(500)
    page.wait_for_timeout(800)

def close_reader(page):
    page.get_by_text('返回书架').click()
    page.get_by_text('我的书架').wait_for(timeout=15000)
    page.wait_for_timeout(400)

def open_book(page, title):
    page.locator('h2', has_text=title).first.click()
    wait_reader(page)

def reveal_controls(page):
    bar = page.get_by_text('阅读控制')
    if bar.count():
        bar.hover()
        page.wait_for_timeout(400)

def inspect(page, label):
    info = page.evaluate("""() => {
        const stack = document.querySelector('.reader-paper-stack');
        const over = document.querySelector('.reader-paper-over');
        const snapshots = [...document.querySelectorAll('.reader-epub-snapshot iframe')];
        const canvases = [...document.querySelectorAll('.reader-pdf-canvas')];
        const turn = document.querySelector('.reader-turn-layer');
        return {
            hasStack: Boolean(stack),
            transform: over ? getComputedStyle(over).transform : null,
            snapshotCount: snapshots.length,
            snapshotSizes: snapshots.map(el => ({w: el.offsetWidth, h: el.offsetHeight})),
            canvasCount: canvases.length,
            canvasSizes: canvases.map(el => ({w: el.width, h: el.height, cssW: el.style.width})),
            hasTxtTurn: Boolean(turn),
        };
    }""")
    print(f'[{label}]', info, flush=True)
    return info

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = context.new_page()
    page.on('console', lambda msg: print(f'CONSOLE[{msg.type}] {msg.text}') if msg.type in {'error', 'warning'} else None)
    page.goto('http://localhost:5173/login')
    page.evaluate(f"localStorage.setItem('token', '{TOKEN}')")
    page.goto(URL)
    page.wait_for_load_state('networkidle')
    page.get_by_text('我的书架').wait_for(timeout=20000)
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / '00-shelf.png'))

    # PDF
    open_book(page, '数学之美')
    inspect(page, 'pdf-open')
    page.screenshot(path=str(OUT / '01-pdf-open.png'))
    box = page.locator('.reader-desk').bounding_box()
    if box:
        page.mouse.move(box['x'] + box['width'] * 0.7, box['y'] + box['height'] * 0.5)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] * 0.35, box['y'] + box['height'] * 0.5, steps=12)
        page.wait_for_timeout(80)
        inspect(page, 'pdf-drag')
        page.screenshot(path=str(OUT / '02-pdf-drag.png'))
        page.mouse.up()
        page.wait_for_timeout(500)
    inspect(page, 'pdf-after-drag')
    page.screenshot(path=str(OUT / '03-pdf-after.png'))
    reveal_controls(page)
    page.get_by_role('button', name='下一页').click()
    page.wait_for_timeout(120)
    page.screenshot(path=str(OUT / '04-pdf-anim.png'))
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / '05-pdf-next.png'))
    close_reader(page)

    # EPUB — wait until the next-spread probe has painted, then use keyboard.
    open_book(page, '深度学习')
    page.wait_for_timeout(1500)
    try:
        page.wait_for_function(
            "() => document.querySelectorAll('.reader-epub-snapshot iframe').length > 0",
            timeout=20000,
        )
    except Exception as exc:
        print('epub probe wait failed', exc)
    inspect(page, 'epub-open')
    page.screenshot(path=str(OUT / '06-epub-open.png'), timeout=15000)
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(160)
    inspect(page, 'epub-anim')
    page.screenshot(path=str(OUT / '07-epub-anim.png'), timeout=15000)
    page.wait_for_timeout(700)
    inspect(page, 'epub-after')
    page.screenshot(path=str(OUT / '08-epub-after.png'), timeout=15000)
    close_reader(page)

    # TXT still uses 3D flip
    open_book(page, '白夜行')
    inspect(page, 'txt-open')
    page.screenshot(path=str(OUT / '11-txt-open.png'))
    reveal_controls(page)
    page.get_by_role('button', name='下一页').click()
    page.wait_for_timeout(150)
    inspect(page, 'txt-anim')
    page.screenshot(path=str(OUT / '12-txt-anim.png'))
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / '13-txt-next.png'))
    close_reader(page)

    browser.close()
    print('saved to', OUT)

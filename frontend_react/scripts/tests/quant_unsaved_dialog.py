"""Browser regression for Quant's nested modal discard guard (local mock only).

Start Vite with VITE_LOCAL_MODE=true, then run:
  python3 scripts/tests/quant_unsaved_dialog.py --url http://127.0.0.1:43127
Requires Python Playwright; --browser can point to an installed Chrome binary.
Uses a fresh browser context; never starts an experiment or a model request.
"""
import argparse
import re
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


def check_confirmation(page, confirmation):
    expect(confirmation).to_be_visible()
    assert confirmation.evaluate("""dialog => {
        const root = dialog.closest('[data-modal-scroll-lock]');
        const rect = dialog.getBoundingClientRect();
        return root.parentElement === document.body
            && dialog.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
            && [...document.querySelectorAll('[data-modal-scroll-lock]')]
                .filter(other => other !== root)
                .every(other => Number(getComputedStyle(root).zIndex) > Number(getComputedStyle(other).zIndex));
    }"""), 'Confirmation must be the top visible modal, directly under body'
    expect(confirmation.get_by_role('button', name='保存并继续')).to_have_count(0)
    for _ in range(6):
        page.keyboard.press('Tab')
        assert confirmation.evaluate('dialog => dialog.contains(document.activeElement)'), 'Focus escaped confirmation'


def check_flow(page, action, title, field):
    details = page.get_by_role('dialog', name='研究详情', exact=True)
    details.get_by_role('button', name=action, exact=True).click()
    form = page.get_by_role('dialog', name=title, exact=True)
    name = form.get_by_label(field)
    name.fill('未提交的回归测试配置')
    close = form.get_by_role('button', name='关闭弹窗', exact=True)
    confirmation = page.get_by_role('dialog', name='还有未保存的修改', exact=True)

    close.click()
    check_confirmation(page, confirmation)
    confirmation.get_by_role('button', name='继续编辑', exact=True).click()
    expect(confirmation).to_have_count(0)
    expect(name).to_have_value('未提交的回归测试配置')
    expect(close).to_be_focused()

    close.click()
    check_confirmation(page, confirmation)
    page.keyboard.press('Escape')
    expect(confirmation).to_have_count(0)
    expect(form).to_be_visible()
    expect(name).to_have_value('未提交的回归测试配置')

    close.click()
    check_confirmation(page, confirmation)
    confirmation.get_by_role('button', name='放弃修改', exact=True).click()
    expect(confirmation).to_have_count(0)
    expect(form).to_have_count(0)
    expect(details).to_be_visible()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:43127')
    parser.add_argument('--browser', help='Installed Chromium/Chrome executable')
    args = parser.parse_args()
    target = urlparse(args.url)
    if target.hostname not in ('localhost', '127.0.0.1', '::1'):
        parser.error('Only a localhost Vite server in local mock mode is allowed')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **({'executable_path': args.browser} if args.browser else {}))
        try:
            for width in (1440, 390):
                context = browser.new_context(viewport={'width': width, 'height': 1000})
                page = context.new_page()
                errors, unexpected = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))

                def block_api(route):
                    unexpected.append(route.request.url)
                    route.abort()

                # A local mock request is resolved by the worker before reaching the network.
                context.route(re.compile(r'^https?://[^/]+/api/'), block_api)
                page.goto(args.url.rstrip('/') + '/quant/local-quant/entries/local-momentum?mockState=sample')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_text('LOCAL · Mock 数据', exact=True)).to_be_visible()
                page.get_by_role('button', name='查看研究详情', exact=True).click()
                check_flow(page, '按此方案准备实验', '准备参数与组合实验', '实验名称')
                check_flow(page, '开启连续研究', '启动 AI 连续研究', '连续研究名称')
                page.get_by_role('dialog', name='研究详情', exact=True).get_by_role('button', name='关闭弹窗').click()
                expect(page.get_by_role('dialog')).to_have_count(0)
                expect(page.locator('body')).not_to_have_css('overflow-y', 'hidden')
                assert not errors, errors
                assert not unexpected, unexpected
                print(f'PASS {width}px: experiment/campaign confirmation, click, Escape, focus and scroll restoration')
                context.close()
        finally:
            browser.close()


if __name__ == '__main__':
    main()

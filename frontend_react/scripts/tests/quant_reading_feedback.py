"""Local mock browser regression for copy errors/retry and report heading anchors.

Run Vite with VITE_LOCAL_MODE=true; requires Python Playwright.
python3 scripts/tests/quant_reading_feedback.py --browser /path/to/chrome
"""
import argparse
import re
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:43127')
    parser.add_argument('--browser')
    args = parser.parse_args()
    if urlparse(args.url).hostname not in ('localhost', '127.0.0.1', '::1'):
        parser.error('Use a localhost server in pure local mock mode')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **({'executable_path': args.browser} if args.browser else {}))
        try:
            for width in (1440, 390):
                context = browser.new_context(viewport={'width': width, 'height': 1000})
                context.add_init_script("""window.copyAllowed = false;
                    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {
                        writeText: () => Promise.reject(new Error('simulated clipboard denial'))}});
                    document.execCommand = () => window.copyAllowed;
                    const original = Element.prototype.scrollIntoView;
                    Element.prototype.scrollIntoView = function(...args) {
                        window.lastAnchor = this.id; return original.apply(this, args);
                    };
                """)
                page = context.new_page()
                errors, network = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                def block_api(route):
                    network.append(route.request.url)
                    route.abort()
                context.route(re.compile(r'^https?://[^/]+/api/'), block_api)
                page.goto(args.url.rstrip('/') + '/quant/local-quant/entries/local-momentum?mockState=sample')
                page.wait_for_load_state('networkidle')
                expect(page.get_by_text('LOCAL · Mock 数据', exact=True)).to_be_visible()
                report = page.locator('section[aria-label="研究报告内容"]')
                report.get_by_role('button', name='复制报告', exact=True).click()
                expect(report.get_by_role('alert')).to_have_text('复制失败，请选中文本后手动复制。')
                expect(report.get_by_role('button', name='已复制正文', exact=True)).to_have_count(0)
                page.evaluate('window.copyAllowed = true')
                report.get_by_role('button', name='复制报告', exact=True).click()
                expect(report.get_by_role('button', name='已复制正文', exact=True)).to_be_visible()
                expect(report.get_by_role('alert')).to_have_count(0)

                page.get_by_role('button', name=re.compile('^使用反馈')).click()
                page.get_by_role('button', name='阅读报告与修订', exact=True).click()
                report.get_by_role('button', name='编辑与删减', exact=True).click()
                report.get_by_role('textbox', name='编辑研究报告').fill(
                    '## **重复**\n\n第一节\n\n## 重复\n\n第二节\n\n'
                    '~~~python\n## 代码中的标题\nresult = 1\n~~~\n\n'
                    'Setext `标题`\n---\n\n末节\n')
                report.get_by_role('button', name='预览报告', exact=True).click()
                headings = report.locator('h2').filter(has_text='重复')
                expect(headings).to_have_count(2)
                ids = headings.evaluate_all('nodes => nodes.map(node => node.id)')
                assert len(set(ids)) == 2
                buttons = report.get_by_role('button', name='重复', exact=True)
                expect(buttons).to_have_count(2)
                for i in range(2):
                    buttons.nth(i).click()
                    assert page.evaluate('window.lastAnchor') == ids[i]
                expect(report.get_by_role('button', name='代码中的标题', exact=True)).to_have_count(0)
                report.get_by_role('button', name='Setext 标题', exact=True).click()
                assert page.evaluate('document.getElementById(window.lastAnchor).textContent').strip() == 'Setext 标题'

                page.evaluate('window.copyAllowed = false')
                code = report.locator('pre').filter(has_text='result = 1').locator('..')
                code.get_by_role('button', name='复制', exact=True).click()
                expect(code.get_by_role('alert')).to_have_text('复制失败，请选中文本后手动复制。')
                page.evaluate('window.copyAllowed = true')
                code.get_by_role('button', name='复制', exact=True).click()
                expect(code.get_by_role('button', name='已复制', exact=True)).to_be_visible()
                expect(code.get_by_role('alert')).to_have_count(0)

                report.get_by_role('button', name='保存修订', exact=True).first.click()
                expect(report.get_by_role('button', name='保存修订', exact=True)).to_have_count(0)
                # Original and revision sections remain mounted even while collapsed.
                all_ids = report.locator('[id]').evaluate_all('nodes => nodes.map(node => node.id)')
                assert len(all_ids) == len(set(all_ids)), 'Original/revision headings reused report ids'
                assert not errors, errors
                assert not network, network
                print(f'PASS {width}px: clipboard rejection/fallback/retry, duplicate/Setext/fenced headings and revision scopes')
                context.close()
        finally:
            browser.close()


if __name__ == '__main__':
    main()

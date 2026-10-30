"""Pure-local research details layout and responsiveness regression.

Run Vite with VITE_LOCAL_MODE=true. Prints interaction timings under 4x CPU slowdown.
Only synthetic browser mock records are modified; unhandled real API calls are blocked.
"""
import argparse
import json
import re
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:5173')
    parser.add_argument('--browser')
    parser.add_argument('--screenshots', default='/private/tmp/odoc-details')
    args = parser.parse_args()
    if urlparse(args.url).hostname not in ('localhost', '127.0.0.1', '::1'):
        parser.error('Requires a localhost server in pure local mode')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **({'executable_path': args.browser} if args.browser else {}))
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        network, errors, responses = [], [], []
        def block_api(route):
            network.append(route.request.url)
            route.abort()
        context.route(re.compile(r'^https?://[^/]+/api/'), block_api)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda r: responses.append(r.status) if urlparse(r.url).path.startswith('/api/') else None)
        base = args.url.rstrip('/')
        page.goto(base + '/quant/local-quant?mockState=sample')
        expect(page.get_by_text('LOCAL · Mock 数据', exact=True)).to_be_visible(timeout=30000)
        eid = page.evaluate(r'''async () => {
            const {data} = await (await fetch('/api/quant/local-quant/intake/', {method:'POST',
                headers:{Authorization:'Token local-demo-token','Content-Type':'application/json'},
                body:JSON.stringify({requestKey:'details_reading_regression_001',description:'人工说明，没有计算代码'})})).json();
            const {quantState,persistQuantState} = await import('/src/mocks/quant/state.ts');
            const entry=quantState().entries.find(e=>e.id===data.entry.id);
            entry.runs.forEach(r=>r.createdAt='2020-01-01T00:00:00Z');
            await fetch(`/api/quant/local-quant/entries/${entry.id}/status/`,{headers:{Authorization:'Token local-demo-token'}});
            const report=entry.reports[0];
            report.currentRevisionId='local-details-revision';
            report.markdown=Array.from({length:45},(_,i)=>`## 人工长报告段落 ${i+1}\n\n这是用于测试界面性能的人工文本，不代表实际模型研究。\n\n$$M_t=P_t/P_{t-20}-1$$\n\n`+'```python\n'+'value = close / previous - 1\n'.repeat(5)+'```\n').join('\n');
            report.originalMarkdown=report.markdown;
            persistQuantState();
            return entry.id;
        }''')
        page.goto(f'{base}/quant/local-quant/entries/{eid}?mockState=sample')
        open_button = page.get_by_role('button', name='查看研究详情', exact=True)
        expect(open_button).to_be_visible(timeout=30000)
        cdp = context.new_cdp_session(page)
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        def measure(label):
            return page.evaluate('''async label => {
                const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
                const start=performance.now(); button.focus(); button.click();
                await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                return Math.round(performance.now()-start);
            }''', label)
        timings = []
        for width in (1440, 768, 390):
            page.set_viewport_size({'width': width, 'height': 1000})
            opened = measure('查看研究详情')
            dialog = page.get_by_role('dialog', name='研究详情', exact=True)
            expected = dialog.bounding_box()
            tabs = []
            for label in ('实验规划', '源码与进度', '全部', '实验规划'):
                tabs.append(measure(label))
                box = dialog.bounding_box()
                assert abs(box['height']-expected['height']) < 1, (width, label, box)
                assert abs(box['y']-expected['y']) < 1, (width, label, box)
            note = dialog.get_by_role('region', name='实验规划说明', exact=True)
            expect(note.get_by_role('heading', name='研究结论', exact=True)).to_be_visible()
            expect(note.get_by_role('heading', name='需要补齐', exact=True)).to_be_visible()
            assert '说明与边界' not in note.inner_text()
            assert '作者' not in note.inner_text() and '第461行' not in note.inner_text()
            assert 'initial_proposal' not in note.inner_text()
            assert note.locator('li').count() >= 3
            page.screenshot(path=f'{args.screenshots}-{width}.png')
            note.locator('summary').filter(has_text='技术依据').click()
            expect(note.get_by_role('heading', name='信号时点')).to_be_visible()
            assert '第461行' not in note.inner_text()
            note.get_by_text('查看完整原文', exact=True).click()
            original = note.get_by_label('完整原文', exact=True)
            expect(original).to_contain_text('作者第461行')
            expect(original).to_contain_text('initial_proposal')
            # Scroll inside content: classification controls and dialog frame stay put.
            group = dialog.get_by_role('group', name='研究详情分类')
            before = group.bounding_box()['y']
            note.evaluate('el => { const scroller=el.closest(".overflow-y-auto"); scroller.scrollTop=400; }')
            assert abs(group.bounding_box()['y']-before) < 1
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            dialog.get_by_role('button', name='关闭弹窗', exact=True).click()
            expect(open_button).to_be_focused()
            timings.append({'width':width,'open_ms':opened,'tabs_ms':tabs,'height':expected['height']})
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
        page.set_viewport_size({'width': 1440, 'height': 1000})
        report = page.get_by_role('region', name='研究报告内容', exact=True)
        report.get_by_role('button', name='编辑与删减', exact=True).click()
        editor = report.get_by_role('textbox', name='编辑研究报告', exact=True)
        editor.fill(editor.input_value() + '\n\n## 人工保存验收标记\n\n仅验证本地编辑保持有效。')
        report.get_by_role('button', name='保存修订', exact=True).first.click()
        expect(report.get_by_role('button', name='编辑与删减', exact=True)).to_be_visible()
        expect(report.get_by_role('heading', name='人工保存验收标记', exact=True).first).to_be_visible()
        report.get_by_role('button', name=re.compile('^参数分析')).click()
        report.get_by_role('link', name='查看 AI 实验方案', exact=True).click()
        dialog = page.get_by_role('dialog', name='研究详情', exact=True)
        expect(dialog.get_by_role('button', name='实验规划', exact=True)).to_have_attribute('aria-pressed', 'true')
        dialog.get_by_role('button', name='关闭弹窗', exact=True).click()
        assert not errors, errors
        assert not network, network
        assert 501 not in responses
        print(json.dumps(timings, ensure_ascii=False))
        print('PASS: stable dialog, pinned tabs, concise reading, original evidence, focus return, local API isolation')
        browser.close()


if __name__ == '__main__':
    main()

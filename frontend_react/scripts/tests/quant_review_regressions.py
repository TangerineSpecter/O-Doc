"""Pure-local review adoption/restoration and composite program export regression."""
import argparse
import json
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:43129')
parser.add_argument('--browser')
parser.add_argument('--screenshots', default='/private/tmp/odoc-quant-review-ui')
args = parser.parse_args()
if urlparse(args.url).hostname not in ('localhost', '127.0.0.1', '::1'):
    parser.error('Requires a localhost pure-local Vite server')
output = Path(args.screenshots).resolve()
if not any(output.is_relative_to(root.resolve()) for root in (Path('/private/tmp'), Path(tempfile.gettempdir()))):
    parser.error('Screenshots must stay in a temporary directory')
output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, **({'executable_path': args.browser} if args.browser else {}))
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    network, errors, statuses = [], [], []
    def block(route):
        network.append(route.request.url)
        route.abort()
    context.route(re.compile(r'^https?://[^/]+/api/'), block)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: statuses.append(response.status) if urlparse(response.url).path.startswith('/api/') else None)
    page.goto(args.url.rstrip('/') + '/quant/local-quant/entries/local-momentum?mockState=sample')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_text('LOCAL · Mock 数据', exact=True)).to_be_visible(timeout=30000)
    baseline = page.evaluate('''async () => {
        const {quantState,persistQuantState}=await import('/src/mocks/quant/state.ts');
        const {initDocument,offerDocument}=await import('/src/mocks/quant/documents.ts');
        const entry=quantState().entries.find(row=>row.id==='local-momentum');
        const doc=initDocument(entry),base=entry.reports.find(row=>row.id===doc.sections.reading.reportId);
        const next=structuredClone(base);next.id='review-adoption-regression';next.runId='review-regression-run';
        next.data.sourceFindingsVersion=1;next.data.sourceFindings=[];next.data.sourceFindingsNote='评审修复范围：含循环更新';
        next.data.memoryNote='本次重新核对历史范围';
        next.researchMemoryJson=JSON.stringify({version:3,method:'library-history-v3',scope:'same_collection',cutoff:'2026-10-31T00:00:00Z',scan_limit:2000,
            scanned:{experiments:0,feedback:0,comparisons:0,fixed_validations:0},eligible:{experiments:0,feedback:0,comparisons:0,fixed_validations:0},omitted_for_size:0,items:[],
            scan_limits:{seconds:5,max_chars:20000000,chars_read:0,budget_limited:false,size_limited:false}});
        entry.reports.unshift(next);offerDocument(entry,next);entry.updatedAt=new Date().toISOString();persistQuantState();
        return {reading:doc.sections.reading.reportId,note:base.data.sourceFindingsNote};
    }''')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name=re.compile('查看待采用变更')).click()
    dialog = page.get_by_role('dialog')
    dialog.locator('label').filter(has_text='评价与审查').locator('input').check()
    dialog.get_by_role('button', name='采用所选变更', exact=True).click()
    page.get_by_text('查看原稿中的检查记录', exact=True).click()
    expect(page.get_by_text('评审修复范围：含循环更新', exact=True)).to_be_visible()
    page.get_by_text('评审修复范围：含循环更新', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(output / 'review-adopted.png'))
    page.get_by_role('button', name='查看研究详情', exact=True).click()
    dialog = page.get_by_role('dialog')
    dialog.locator('details[aria-label="跨来源历史研究记忆"] summary').click()
    expect(dialog.get_by_text('本次重新核对历史范围', exact=False)).to_be_visible()
    dialog.get_by_role('button', name='关闭弹窗', exact=True).click()
    page.get_by_role('button', name='更新记录', exact=True).click()
    page.get_by_role('dialog').get_by_role('button', name='比对与恢复', exact=True).first.click()
    dialog = page.get_by_role('dialog')
    dialog.locator('label').filter(has_text='评价与审查').locator('input').check()
    dialog.get_by_role('button', name='恢复所选内容', exact=True).click()
    expect(page.get_by_text('评审修复范围：含循环更新', exact=True)).to_have_count(0)
    current = page.evaluate('''async () => (await (await fetch('/api/quant/local-quant/entries/local-momentum/document/',
        {headers:{Authorization:'Token local-demo-token'}})).json()).data''')
    assert current['sections']['reading']['reportId'] == baseline['reading']
    assert current['report']['data'].get('sourceFindingsNote') == baseline.get('note')

    page.evaluate('''async () => {
        const {quantState,persistQuantState}=await import('/src/mocks/quant/state.ts');
        const {collectMockFactors}=await import('/src/mocks/quant/factors.ts');
        const samples=await (await fetch('/src/mocks/quant/sourceAlgorithmSamples.json')).json();
        const state=quantState(),entry=state.entries.find(row=>row.id==='local-momentum');
        const candidate=structuredClone(collectMockFactors([entry])[0]);
        candidate.id='local-composite-program';candidate.createdAt=new Date().toISOString();
        candidate.data={...structuredClone(samples[0]),name:'组合程序导出回归',expression:{op:'add',args:[samples[0].expression,samples[1].expression]}};
        candidate.curation={...candidate.curation,name:'组合程序导出回归'};
        state.derivedFactors.push(candidate);persistQuantState();
    }''')
    page.get_by_role('button', name='因子算法库', exact=True).click()
    page.get_by_label('候选列表', exact=True).get_by_role('button').filter(has_text='组合程序导出回归').click()
    page.get_by_role('button', name='导出计算代码', exact=True).click()
    dialog = page.get_by_role('dialog')
    expect(dialog.get_by_role('button', name='下载候选代码', exact=True)).to_be_visible()
    dialog.locator('button[aria-haspopup="listbox"]').click()
    options = page.get_by_role('option').all_text_contents()
    assert len(options) == 1 and 'Python' in options[0], options
    for width in (1440, 390):
        page.set_viewport_size({'width': width, 'height': 1000})
        dialog.locator('button[aria-haspopup="listbox"]').click()
        dialog.locator('button[aria-haspopup="listbox"]').click()
        menu = page.get_by_role('listbox')
        expect(menu).to_be_visible()
        page.wait_for_function('(id) => {const box=document.getElementById(id)?.getBoundingClientRect();return box&&box.left>=0&&box.right<=innerWidth;}', arg=menu.get_attribute('id'), timeout=3000)
        page.screenshot(path=str(output / f'composite-export-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not network, network
    assert not errors, errors
    assert 501 not in statuses, statuses
    print(json.dumps({'review_adopt_restore': True, 'composite_python_only': True,
        'api_responses': len(statuses), 'real_api_requests': network, 'page_errors': errors}))
    browser.close()

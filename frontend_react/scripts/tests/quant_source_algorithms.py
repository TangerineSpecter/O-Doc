"""Pure-local source algorithm UI regression. No real backend or model is accessed."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:5173')
parser.add_argument('--browser')
parser.add_argument('--screenshots', default='/private/tmp/odoc-source-algorithm-ui')
args = parser.parse_args()
if urlparse(args.url).hostname not in ('localhost', '127.0.0.1', '::1'):
    parser.error('Requires a localhost pure-local Vite server')
output = Path(args.screenshots)
output.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, **({'executable_path': args.browser} if args.browser else {}))
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    network, errors, responses = [], [], []
    def block(route):
        network.append(route.request.url)
        route.abort()
    context.route(re.compile(r'^https?://[^/]+/api/'), block)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: responses.append(response.status) if urlparse(response.url).path.startswith('/api/') else None)
    page.goto(args.url.rstrip('/') + '/quant/local-quant?mockState=sample')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_text('LOCAL · Mock 数据', exact=True)).to_be_visible(timeout=30000)
    page.evaluate('''async () => {
        const headers={Authorization:'Token local-demo-token','Content-Type':'application/json'};
        const {data}=await (await fetch('/api/quant/local-quant/intake/',{method:'POST',headers,body:JSON.stringify({requestKey:'source_algorithm_ui_001',code:'LOCAL_SOURCE_ALGORITHMS',language:'pine'})})).json();
        const {quantState,persistQuantState}=await import('/src/mocks/quant/state.ts');
        const entry=quantState().entries.find(row=>row.id===data.entry.id);
        entry.runs.forEach(row=>row.createdAt='2020-01-01T00:00:00Z');persistQuantState();
        await fetch(`/api/quant/local-quant/entries/${entry.id}/`,{headers});
    }''')
    page.get_by_role('button', name='因子算法库', exact=True).click()
    expect(page.get_by_role('heading', name='因子算法库', exact=True)).to_be_visible()
    algorithm = page.get_by_label('因子算法', exact=True)
    expect(algorithm.get_by_text('数据输入', exact=True)).to_be_visible()
    expect(algorithm).to_contain_text('close')
    expect(algorithm).to_contain_text('predictedEstimate = estimate')
    expect(algorithm).to_contain_text('smoothingPeriod')
    for width in (1440, 768, 390):
        page.set_viewport_size({'width': width, 'height': 1000})
        page.get_by_label('候选详情', exact=True).scroll_into_view_if_needed()
        page.screenshot(path=str(output / f'definition-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.get_by_label('候选列表', exact=True).get_by_role('button').filter(has_text='重大异常创新判定').click()
    expect(algorithm).to_contain_text('isMajorMove')
    expect(algorithm).to_contain_text('surpriseVariance')
    expect(algorithm).to_contain_text('anomalyMultiple')
    page.get_by_role('button', name='导出计算代码', exact=True).click()
    dialog = page.get_by_role('dialog')
    expect(dialog.get_by_role('button', name='下载候选代码', exact=True)).to_be_visible()
    dialog.get_by_role('button', name='关闭弹窗', exact=True).click()
    page.get_by_role('button', name='查看关系图谱', exact=True).click()
    expect(page.get_by_role('heading', name='因子算法图谱', exact=True)).to_be_visible()
    group = page.get_by_role('group', name='关系分类', exact=True)
    expect(group.get_by_role('button', name=re.compile('算法与属性'))).to_have_attribute('aria-pressed', 'true')
    expect(page.get_by_text('算法属性相似', exact=False).first).to_be_visible()
    assert '来源用途与条件' not in page.locator('body').inner_text()
    assert '语义与假设' not in page.locator('body').inner_text()
    for width in (1440, 768, 390):
        page.set_viewport_size({'width': width, 'height': 1000})
        page.screenshot(path=str(output / f'graph-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
    group.get_by_role('button', name=re.compile('来源与计算记录')).click()
    expect(group.get_by_role('button', name=re.compile('来源与计算记录'))).to_have_attribute('aria-pressed', 'true')
    page.get_by_role('button', name='返回因子库', exact=True).click()
    for state, text in [('slow', '正在加载候选库…'), ('error', '本地模拟接口失败'), ('empty', '没有匹配的算法')]:
        page.evaluate('(state) => history.replaceState(null,"","?mockState="+state)', state)
        page.get_by_role('button', name='刷新因子库', exact=True).click()
        expect(page.get_by_text(text, exact=state != 'error')).to_be_visible()
        if state == 'slow': expect(page.get_by_label('因子算法', exact=True)).to_be_visible(timeout=15000)
    page.evaluate('history.replaceState(null,"","?mockState=sample")')
    page.get_by_role('button', name='刷新因子库', exact=True).click()
    expect(page.get_by_label('因子算法', exact=True)).to_be_visible()
    assert not network, network
    assert not errors, errors
    assert 501 not in responses, responses
    print(json.dumps({'widths':[1440,768,390], 'api_responses':len(responses), 'real_api_requests':network, 'page_errors':errors}))
    browser.close()

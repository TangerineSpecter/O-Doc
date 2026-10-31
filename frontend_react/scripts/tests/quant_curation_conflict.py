"""Pure-local inherited curation conflict, fresh retry and responsive editor."""
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
parser.add_argument('--screenshots', default='/private/tmp/odoc-quant-curation-ui')
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
    seeded = page.evaluate('''async () => {
        const {quantState,persistQuantState}=await import('/src/mocks/quant/state.ts');
        const entry=quantState().entries.find(row=>row.id==='local-momentum');
        const original=entry.reports.find(row=>row.data.factors?.length && row.publicationMode!=='pending');
        const duplicate=structuredClone(original);duplicate.id='curation-browser-duplicate';duplicate.publicationMode='legacy';
        duplicate.createdAt=new Date(Date.parse(original.createdAt)+1000).toISOString();
        entry.reports.push(duplicate);
        const a='candidate-'+original.id+'-0',b='candidate-'+duplicate.id+'-0',data=original.data.factors[0];
        quantState().factorRevisions[b]=[{id:'local-curation-browser-r1',parentId:'',
            data:{name:'继承整理初始名',family:data.family,tags:['原标签'],aliases:[],note:''},createdAt:new Date().toISOString()}];
        persistQuantState();return {a,b};
    }''')
    page.get_by_role('button', name='因子算法库', exact=True).click()
    page.get_by_role('heading', name='继承整理初始名', exact=True).first.click()
    page.get_by_role('button', name='整理名称与标签', exact=True).click()
    dialog = page.get_by_role('dialog')
    expect(dialog.get_by_text(re.compile('当前整理来自同一来源'))).to_be_visible()
    dialog.get_by_label('研究备注').fill('只修改备注的旧草稿')
    updated = page.evaluate('''async ({b}) => {
        const path='/api/quant/local-quant/factors/'+b+'/',headers={Authorization:'Token local-demo-token','Content-Type':'application/json'};
        const current=(await (await fetch(path,{headers})).json()).data;
        const response=await fetch(path,{method:'PATCH',headers,body:JSON.stringify({
            data:{...current.curation,name:'共享整理已更新',tags:['新标签']},
            expectedRevisionId:current.currentRevisionId,expectedCurationRevisionId:current.curationRevisionId})});
        return {status:response.status,body:await response.json()};
    }''', seeded)
    assert updated['status'] == 200, updated
    dialog.get_by_role('button', name='保存修订', exact=True).click()
    expect(dialog.get_by_role('alert')).to_contain_text('同一算法的整理已有新修订')
    expect(dialog.get_by_label('研究备注')).to_have_value('只修改备注的旧草稿')
    page.screenshot(path=str(output / 'curation-conflict-desktop.png'))
    after_conflict = page.evaluate('''async ({a}) => (await (await fetch('/api/quant/local-quant/factors/'+a+'/',
        {headers:{Authorization:'Token local-demo-token'}})).json()).data''', seeded)
    assert after_conflict['currentRevisionId'] == '' and after_conflict['curation']['tags'] == ['新标签']
    assert after_conflict['revisions'] == []
    page.once('dialog', lambda native: native.accept())
    page.reload()
    page.wait_for_load_state('networkidle')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='因子算法库', exact=True).click()
    page.get_by_role('heading', name='共享整理已更新', exact=True).first.click()
    page.get_by_role('button', name='整理名称与标签', exact=True).click()
    dialog = page.get_by_role('dialog')
    expect(dialog.get_by_text(re.compile('当前整理来自同一来源'))).to_be_visible()
    assert dialog.bounding_box()['width'] <= 390
    dialog.get_by_label('研究备注').fill('核对新标签后保存备注')
    dialog.get_by_role('button', name='保存修订', exact=True).scroll_into_view_if_needed()
    page.screenshot(path=str(output / 'curation-inherited-mobile.png'))
    dialog.get_by_role('button', name='保存修订', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    final = page.evaluate('''async ({a,b}) => Promise.all([a,b].map(async id=>(await (await fetch(
        '/api/quant/local-quant/factors/'+id+'/',{headers:{Authorization:'Token local-demo-token'}})).json()).data))''', seeded)
    assert final[0]['curation']['tags'] == ['新标签']
    assert final[0]['curation']['note'] == '核对新标签后保存备注'
    assert len(final[0]['revisions']) == 1 and final[0]['revisions'][0]['parentId'] == ''
    assert not final[0]['curationInherited'] and final[1]['curationInherited']
    assert len(final[1]['revisions']) == 2
    assert final[1]['currentRevisionId'] == updated['body']['data']['currentRevisionId']
    assert not network, network
    assert not errors, errors
    assert 409 in statuses and 501 not in statuses, statuses
    print(json.dumps({'api_responses': len(statuses), 'expected_conflicts': statuses.count(409),
        'real_api_requests': len(network), 'page_errors': errors, 'screenshots': str(output)}, ensure_ascii=False))
    context.close()
    browser.close()

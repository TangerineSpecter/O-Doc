"""Pure local regression for report evidence, legacy memory and revision loading.
Run against VITE_LOCAL_MODE=true with Python Playwright; --url and --browser supported.
"""
import argparse
import re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:5194')
parser.add_argument('--browser', default='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
args = parser.parse_args()
assert urlparse(args.url).hostname in ('localhost', '127.0.0.1')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=args.browser)
    try:
        context = browser.new_context()
        unexpected, errors = [], []
        context.route(re.compile(r'^https?://[^/]+/api/'), lambda route: (unexpected.append(route.request.url), route.abort()))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url + '/quant/local-quant?mockState=sample')
        expect(page.get_by_text('LOCAL · Mock 数据', exact=True)).to_be_visible()
        page.wait_for_load_state('networkidle')
        page.evaluate('''async () => {
            await fetch('/api/quant/local-quant/entries/local-momentum/', {headers:{Authorization:'Token local-demo-token'}});
            const {quantState} = await import('/src/mocks/quant/state.ts');
            const {normalizeMockExecution} = await import('/src/mocks/quant/platformEvidence.ts');
            const {executionTemplate} = await import('/src/utils/quantExecutionTemplates.ts');
            const {defaultExecutionOptions} = await import('/src/utils/quantPlatformEvidence.ts');
            const entry = quantState().entries.find(e=>e.id==='local-momentum');
            entry.runs.forEach(r=>{r.status='completed'; r.createdAt='2020-01-01T00:00:00Z';});
            const report = entry.reports[0], source = entry.sources.find(s=>s.id===report.sourceId);
            report.schemaVersion=5; report.researchMemoryJson=null;
            report.data.executionAssessment={summary:'人工核算回归', findings:[], unknowns:[]};
            source.payload.executionPreviewJson=JSON.stringify(normalizeMockExecution({
                document:executionTemplate('standard-execution-json-v1','reconciled'),
                executionAdapter:'standard-execution-json-v1', executionOptionsJson:JSON.stringify(defaultExecutionOptions())}));
            const run = entry.runs.find(r=>r.id===report.runId);
            run.researchMemoryJson=JSON.stringify({version:1, method:'library-history-v1', scope:'same_collection',
                cutoff:'2026-01-02T00:00:00Z', scan_limit:2000, scanned:{experiments:0,feedback:0},
                eligible:{experiments:0,feedback:0}, omitted_for_size:0, items:[]});
            report.revisions=Array.from({length:22},(_,i)=>({id:'dependency-revision-'+i, markdown:'修订回归正文 '+i, createdAt:new Date(2025,0,i+1).toISOString()}));
            const {quantReadingApi:api} = await import('/src/api/quantReading.ts');
            window.dependencyReads={source:0,revision:0};
            const sourceRead=api.source, revisionRead=api.revision;
            api.source=async(...args)=>{window.dependencyReads.source++; await new Promise(r=>setTimeout(r,300));
                if(window.dependencyReads.source===1)throw Error('人工来源读取失败'); return sourceRead(...args);};
            api.revision=async(...args)=>{window.dependencyReads.revision++; await new Promise(r=>setTimeout(r,700)); return revisionRead(...args);};
        }''')
        page.get_by_role('button', name=re.compile('区间动量因子')).click()
        evidence = page.locator('details').filter(has=page.locator('summary').filter(has_text='完整执行证据与核算'))
        expect(evidence).to_be_visible()
        assert page.evaluate('window.dependencyReads.source') == 0
        evidence.locator('summary').click()
        expect(evidence.get_by_role('status')).to_contain_text('正在读取')
        expect(evidence.get_by_role('alert')).to_contain_text('人工来源读取失败')
        evidence.get_by_role('button', name='重试', exact=True).click()
        expect(evidence.get_by_role('region', name='平台执行证据与核算')).to_be_visible()
        page.get_by_role('button', name='查看研究详情', exact=True).click()
        dialog = page.get_by_role('dialog', name='研究详情', exact=True)
        expect(dialog.get_by_label('跨来源历史研究记忆', exact=True)).to_be_visible()
        dialog.get_by_role('button', name='关闭弹窗', exact=True).click()
        page.get_by_text('查看 AI 原稿与历史修订', exact=True).click()
        history = page.locator('details').filter(has=page.locator('summary').filter(has_text='查看 AI 原稿与历史修订'))
        expect(history.get_by_text('更多修订', exact=True)).to_be_visible()
        revision = history.locator('details').first
        revision.locator('summary').click()
        expect(revision.get_by_role('status')).to_be_visible()
        history.get_by_role('button', name='更多修订', exact=True).click()
        expect(revision.get_by_text(re.compile('修订回归正文'))).to_be_visible()
        assert page.evaluate('window.dependencyReads.revision') == 1
        # A saved feedback report can legitimately lack full source evidence.
        page.goto(args.url + '/quant/local-quant?mockState=sample')
        page.wait_for_load_state('networkidle')
        page.evaluate('''async () => {
            await fetch('/api/quant/local-quant/entries/local-momentum/', {headers:{Authorization:'Token local-demo-token'}});
            const {quantState} = await import('/src/mocks/quant/state.ts');
            const entry=quantState().entries.find(e=>e.id==='local-momentum'), report=entry.reports[0];
            entry.runs.forEach(r=>{r.status='completed'; r.createdAt='2020-01-01T00:00:00Z';});
            report.schemaVersion=5;
            report.data.executionAssessment={summary:'人工空证据回归', findings:[], unknowns:[]};
            delete entry.sources.find(s=>s.id===report.sourceId).payload.executionPreviewJson;
        }''')
        page.get_by_role('button', name=re.compile('区间动量因子')).click()
        page.get_by_text('完整执行证据与核算', exact=True).click()
        expect(page.get_by_text('该来源未保存完整执行证据。', exact=True)).to_be_visible()
        assert not unexpected and not errors, (unexpected, errors)
        print('PASS: lazy evidence loading/error/retry, legacy memory and stable in-flight revision; no real API traffic')
    finally:
        browser.close()

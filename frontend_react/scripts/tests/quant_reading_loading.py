"""Pure-local pagination, on-demand bodies, cache, edit and tab regression.

Start Vite with VITE_LOCAL_MODE=true. All non-MSW API traffic is blocked.
No real model, source execution or business database is used.
"""
import argparse
import re
import json
import time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:5173')
    parser.add_argument('--browser')
    args=parser.parse_args()
    if urlparse(args.url).hostname not in ('127.0.0.1','localhost','::1'):
        parser.error('Requires pure-local mode on localhost')
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,**({'executable_path':args.browser} if args.browser else {}))
        context=browser.new_context(viewport={'width':1440,'height':1000})
        unexpected=[];errors=[];requests=[];statuses=[]
        def block(route):
            unexpected.append(route.request.url);route.abort()
        context.route(re.compile(r'^https?://[^/]+/api/'),block)
        page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('request',lambda r:requests.append(urlparse(r.url).path) if urlparse(r.url).path.startswith('/api/') else None)
        page.on('response',lambda r:statuses.append(r.status) if urlparse(r.url).path.startswith('/api/') else None)
        base=args.url.rstrip('/')
        page.goto(base+'/quant/local-quant?mockState=sample')
        expect(page.get_by_text('LOCAL · Mock 数据',exact=True)).to_be_visible(timeout=30000)
        ids=page.evaluate('''async()=>{
            await fetch('/api/quant/local-quant/entries/local-momentum/',{headers:{Authorization:'Token local-demo-token'}});
            const {quantState,persistQuantState}=await import('/src/mocks/quant/state.ts');
            const state=quantState(),entry=state.entries.find(row=>row.id==='local-momentum');
            const original=entry.reports.find(row=>row.schemaVersion===3);
            for(let i=0;i<5;i++)original.revisions.push({id:`reading-revision-${i}`,markdown:'人工历史正文'+String(i)+'长'.repeat(10000),createdAt:'2020-01-01T00:00:00Z'});
            for(let i=0;i<30;i++)entry.reports.push({...structuredClone(original),id:`reading-report-${i}`,currentRevisionId:'',revisions:[],data:{...original.data,title:`人工历史报告 ${i}`},createdAt:'2020-01-01T00:00:00Z'});
            for(let i=0;i<1000;i++)state.entries.push({id:`reading-entry-${i}`,collId:'local-quant',title:`容量样例 ${i}`,kind:'factor',content:`远端唯一关键词${i} `+'长'.repeat(10000),sourceUrl:'',tags:[],isValid:true,createdAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-01T00:00:00Z',reports:[],sources:[],implementations:[],runs:[],attachments:[],backtests:[]});
            persistQuantState();return {report:original.id,entry:entry.id};
        }''')
        # Client-side route change keeps synthetic in-memory fixtures even if localStorage quota is small.
        page.get_by_role('button',name='当前按更新时间排序，点击按标题排序').click()
        expect(page.get_by_role('button',name='加载更多',exact=True)).to_be_visible()
        page.get_by_role('button',name='加载更多',exact=True).click()
        expect(page.get_by_text('100/1003',exact=True)).to_be_visible()
        search=page.get_by_role('textbox',name='搜索研究标题或标签')
        search.fill('远端唯一关键词999')
        expect(page.get_by_role('button',name=re.compile('容量样例 999'))).to_be_visible()
        expect(page.get_by_text('1/1',exact=True)).to_be_visible()
        search.fill('区间动量因子')
        page.get_by_role('button',name=re.compile('区间动量因子')).click()
        expect(page.get_by_role('button',name='查看研究详情',exact=True)).to_be_visible(timeout=30000)
        assert not [path for path in requests if '/original/' in path or '/revisions/' in path or '/reading/versions/' in path]
        before=list(requests)
        root=page.get_by_role('region',name='研究报告内容',exact=True)
        root.locator('summary').filter(has_text='查看 AI 原稿与历史修订').click()
        expect(root.get_by_text('AI 不可变原稿',exact=True)).to_be_visible()
        expect(root.locator('summary').filter(has_text='修订 ·').first).to_be_visible()
        assert not [path for path in requests if re.search(r'/revisions/[^/]+/$',path)]
        root.locator('summary').filter(has_text='修订 ·').first.click()
        expect(root.get_by_text(re.compile('人工历史正文'))).to_be_visible()
        assert any(re.search(r'/revisions/[^/]+/$',path) for path in requests)
        root.locator('summary').filter(has_text='查看 AI 原稿与历史修订').click()
        # Header selection reads one chosen report, then revisiting the original hits the body cache.
        page.get_by_role('button',name='更多历史报告',exact=True).click()
        first_started=time.perf_counter()
        page.get_by_role('button',name=re.compile(r'静态研究.*人工历史报告 0(?:\s|$)')).click()
        expect(root.get_by_role('heading',name='人工历史报告 0',exact=True)).to_be_visible()
        first_ms=round((time.perf_counter()-first_started)*1000)
        original_calls=sum(path.endswith(f'/reading/reports/{ids["report"]}/') for path in requests)
        cached_started=time.perf_counter()
        page.get_by_role('button',name=re.compile('静态研究.*区间动量因子')).click()
        expect(root.get_by_role('heading',name='区间动量因子 · 本地演示报告',exact=True)).to_be_visible()
        cached_ms=round((time.perf_counter()-cached_started)*1000)
        assert sum(path.endswith(f'/reading/reports/{ids["report"]}/') for path in requests)==original_calls
        print('QUANT_BROWSER_CACHE',json.dumps({'first_report_switch_ms':first_ms,'cached_report_switch_ms':cached_ms,'cached_body_requests':0}))
        root.get_by_role('button',name='编辑与删减',exact=True).click()
        editor=root.get_by_role('textbox',name='编辑研究报告',exact=True)
        editor.fill(editor.input_value()+'\n\n## 加载回归保存标记\n\n仅用于人工本地回归。')
        root.get_by_role('button',name='保存修订',exact=True).first.click()
        expect(root.get_by_role('heading',name='加载回归保存标记',exact=True)).to_be_visible()
        # Unopened source is fetched only after entering the code tab.
        page.get_by_role('button',name=re.compile('^代码实现')).click()
        expect(page.get_by_role('button',name='保存新版本',exact=True)).to_be_visible()
        assert any('/reading/versions/' in path for path in requests)
        code_editor=page.get_by_role('textbox',name='代码编辑器',exact=True)
        code_editor.fill('value = 2\n# 读取回归代码版本')
        page.get_by_role('button',name='保存新版本',exact=True).click()
        expect(page.get_by_role('button',name='刷新量化研究',exact=True)).to_be_enabled()
        expect(page.get_by_role('button',name='保存新版本',exact=True)).to_be_disabled()
        page.evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))')
        expect(code_editor).to_contain_text('读取回归代码版本')
        page.get_by_role('button',name=re.compile('^补充笔记')).click()
        expect(page.get_by_role('textbox',name='研究说明 Markdown')).to_be_visible()
        page.get_by_role('button',name=re.compile('^AI 研究报告')).click()
        expect(page.get_by_role('button',name='查看研究详情',exact=True)).to_be_visible()
        page.get_by_role('button',name='查看研究详情',exact=True).click()
        comparison_dialog=page.get_by_role('dialog',name='研究详情',exact=True)
        comparison_dialog.get_by_role('button',name='源码与进度',exact=True).click()
        comparison=comparison_dialog.locator('summary').filter(has_text='报告对照 ·')
        comparison.click()
        expect(comparison_dialog.get_by_text('两份报告分别保留原稿事实与修订，不调用模型、不自动改变评分或证据等级。',exact=True)).to_be_visible()
        report_requests=lambda:sum(bool(re.search(r'/reading/reports/[^/]+/$',path)) for path in requests)
        previous_reads=report_requests()
        comparison.click()
        comparison.click()
        expect(comparison_dialog.get_by_text('两份报告分别保留原稿事实与修订，不调用模型、不自动改变评分或证据等级。',exact=True)).to_be_visible()
        assert report_requests()==previous_reads
        comparison_dialog.get_by_role('button',name='关闭弹窗',exact=True).click()
        for width in (1440,768,390):
            page.set_viewport_size({'width':width,'height':1000})
            page.get_by_role('button',name='查看研究详情',exact=True).click()
            dialog=page.get_by_role('dialog',name='研究详情',exact=True)
            height=dialog.bounding_box()['height']
            for label in ('实验规划','源码与进度','全部'):
                dialog.get_by_role('button',name=label,exact=True).click()
                assert abs(dialog.bounding_box()['height']-height)<1
            page.screenshot(path=f'/private/tmp/odoc-reading-{width}.png')
            dialog.get_by_role('button',name='关闭弹窗',exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        # Failed append retains the first page; retry resumes the same offset.
        page.set_viewport_size({'width':1440,'height':1000})
        search.fill('')
        expect(page.get_by_role('button',name='加载更多',exact=True)).to_be_visible()
        expect(page.get_by_text('50/1003',exact=True)).to_be_visible()
        page.evaluate("history.replaceState(history.state,'',location.pathname+'?mockState=error')")
        page.get_by_role('button',name='加载更多',exact=True).click()
        expect(page.locator('aside').filter(has=search).get_by_role('button',name='重试',exact=True)).to_be_visible()
        expect(page.get_by_text('50/1003',exact=True)).to_be_visible()
        page.evaluate("history.replaceState(history.state,'',location.pathname+'?mockState=sample')")
        page.locator('aside').filter(has=search).get_by_role('button',name='重试',exact=True).click()
        expect(page.get_by_text('100/1003',exact=True)).to_be_visible()
        # Slow requests for abandoned tabs cannot overwrite the active target.
        page.evaluate("history.replaceState(history.state,'',location.pathname+'?mockState=slow')")
        page.get_by_role('button',name=re.compile('^附件')).click()
        page.get_by_role('button',name=re.compile('^补充笔记')).click()
        expect(page.get_by_role('textbox',name='研究说明 Markdown')).to_be_visible()
        page.wait_for_timeout(2000)
        expect(page.get_by_role('textbox',name='研究说明 Markdown')).to_be_visible()
        page.evaluate("history.replaceState(history.state,'',location.pathname+'?mockState=sample')")
        def navigate(path):
            page.evaluate("path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));}",path)
        navigate('/quant/local-quant/entries/reading-entry-999?mockState=sample')
        expect(page.get_by_role('heading',name='容量样例 999',exact=True)).to_be_visible()
        before_deep=len(requests)
        navigate('/quant/local-quant/entries/local-momentum?mockState=sample&report=reading-report-0')
        expect(page.get_by_role('region',name='研究报告内容').get_by_role('heading',name='人工历史报告 0',exact=True)).to_be_visible()
        bodies=[path for path in requests[before_deep:] if re.search(r'/reading/reports/[^/]+/$',path)]
        assert bodies and all(path.endswith('/reading/reports/reading-report-0/') for path in bodies),bodies
        navigate('/quant/local-quant/entries/local-momentum?mockState=sample&report=not-owned')
        expect(page.get_by_text('报告不存在',exact=False).first).to_be_visible()
        expect(page.get_by_role('region',name='研究报告内容')).to_have_count(0)
        navigate('/quant/local-quant/entries/local-momentum?mockState=sample&report=reading-report-0')
        expect(page.get_by_role('region',name='研究报告内容')).to_be_visible()
        active_id=page.evaluate("""async()=>{
            const {quantState}=await import('/src/mocks/quant/state.ts');
            const {createRun}=await import('/src/mocks/quant/runs.ts');
            const entry=quantState().entries.find(row=>row.id==='local-momentum');
            const source=entry.sources.find(row=>row.payload.provenance!=='external_feedback');
            const run=createRun(entry,{kind:'analyze',sourceId:source.id,requestKey:'reading-draft-poll'});
            run.createdAt='2020-01-01T00:00:00Z';return run.id;
        }""")
        page.get_by_role('button',name='刷新量化研究',exact=True).click()
        expect(page.get_by_role('button',name='刷新量化研究',exact=True)).to_be_enabled()
        root=page.get_by_role('region',name='研究报告内容')
        root.get_by_role('button',name='编辑与删减',exact=True).click()
        editor=root.get_by_role('textbox',name='编辑研究报告',exact=True)
        draft=editor.input_value()+'\n\n未保存草稿必须在任务完成后保留。'
        editor.fill(draft)
        page.wait_for_function("""async id=>{
            const {quantState}=await import('/src/mocks/quant/state.ts');
            return quantState().entries.find(row=>row.id==='local-momentum').runs.find(row=>row.id===id)?.status==='completed';
        }""",arg=active_id,timeout=30000)
        page.wait_for_timeout(2000)
        expect(editor).to_have_value(draft)
        page.get_by_role('button',name=re.compile('^补充笔记')).click()
        expect(page.get_by_role('dialog',name='还有未保存的修改',exact=True)).to_be_visible()
        page.get_by_role('button',name='放弃修改',exact=True).click()
        expect(page.get_by_role('textbox',name='研究说明 Markdown')).to_be_visible()
        for scenario in ('empty','slow','error'):
            page.goto(base+'/quant/local-quant?mockState='+scenario)
            expect(page.get_by_text('LOCAL · Mock 数据',exact=True)).to_be_visible()
            if scenario=='empty':expect(page.get_by_text('0/0',exact=True)).to_be_visible(timeout=10000)
            elif scenario=='slow':expect(page.get_by_role('button',name=re.compile('区间动量因子'))).to_be_visible(timeout=30000)
            else:expect(page.get_by_text('本地模拟接口失败，可切回样例状态重试',exact=False).first).to_be_visible()
        assert not errors,errors
        assert not unexpected,unexpected
        assert 501 not in statuses,statuses
        print('PASS: whole-library search, 50-row pages, lazy original/revision/source, report cache, edit/save, fixed dialog, three widths, failed append/retry, slow-tab cancellation, deep links/404, task-completion draft protection, empty/slow/error, MSW isolation')
        browser.close()


if __name__=='__main__':main()

"""Isolated UI acceptance against deterministic book-analysis API fixtures.

Run with the webapp-testing with_server helper; no real account/API writes.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.getenv('ODOC_READING_TEST_URL', 'http://127.0.0.1:5179')
OUTPUT = Path(os.getenv('ODOC_READING_TEST_OUTPUT', '/private/tmp/odoc-reading-ui'))
OUTPUT.mkdir(parents=True, exist_ok=True)


def fixtures(mode):
    def node(identity, kind, name, ordinal, description):
        return {'id': identity, 'kind': kind, 'name': name, 'ordinal': ordinal, 'aliases': [], 'timeLabel': '某天夜里' if mode == 'story' else '', 'timeOrder': '', 'thread': '匿名信调查' if kind == 'event' else '', 'facts': [{'description': description, 'status': 'explicit', 'evidence': {'chapterId': 'chapter1', 'chapterTitle': '匿名信' if mode == 'story' else '事务基础', 'ordinal': 1, 'quote': description, 'locator': {'format': 'txt', 'offset': 0}}}]}
    nodes = [node('event1', 'event', '收到匿名信', 1, '林雨收到匿名信，随后前往旧宅。'), node('event2', 'event', '发现手表', 2, '林雨在旧宅门边发现一枚手表。'), node('person1', 'person', '林雨', 1, '林雨参与调查，并与陈青核对证词。'), node('place1', 'place', '旧宅', 1, '匿名信提到的旧宅，是发现手表的地点。'), node('clue1', 'clue', '手表', 2, '手表提供了核对证词的线索。'), node('time1', 'time', '某天夜里', 1, '某天夜里林雨在旧宅发现手表。')] if mode == 'story' else [node('concept1', 'concept', '事务', 1, '事务是一组作为整体完成的数据库操作。'), node('concept2', 'concept', '原子性', 2, '原子性要求操作全部完成或全部回滚。'), node('method1', 'method', '事务边界', 3, '将有关联的数据修改放在同一事务内。'), node('example1', 'example', '转账案例', 4, '转账的扣款与入账需要一起成功。')]
    triples = [('person1', 'event1', 'participates'), ('person1', 'event2', 'participates'), ('event2', 'place1', 'located_at'), ('event2', 'clue1', 'reveals'), ('event2', 'time1', 'at_time')] if mode == 'story' else [('concept1', 'concept2', 'contains'), ('method1', 'concept2', 'depends_on'), ('example1', 'concept1', 'illustrates')]
    edges = [{'id': 'edge' + str(i), 'source': a, 'target': b, 'kind': kind, 'label': kind, 'origin': 'ai', 'context': {'chapterTitle': '第一章'}, 'evidence': [nodes[0]['facts'][0]['evidence']]} for i, (a, b, kind) in enumerate(triples)]
    graph = {'nodes': nodes, 'edges': edges, 'total': len(nodes), 'page': 1, 'limit': 200, 'threads': ['匿名信调查'] if mode == 'story' else []}
    chapter = {'id': 'chapter1', 'ordinal': 1, 'title': '匿名信' if mode == 'story' else '事务基础', 'charCount': 1000, 'locator': {'format': 'txt', 'offset': 0}, 'analyzed': True}
    digest = {'summary': '林雨追踪匿名信，在旧宅发现手表，并开始核对证词。' if mode == 'story' else '本章介绍事务、原子性及转账中的事务边界。', 'points': [{'text': '找到关键线索' if mode == 'story' else '理解原子性', 'nodeIds': [nodes[0]['id']]}], 'qa': [{'question': '本章的重点是什么？', 'answer': '注意证据与结论的关系。', 'nodeIds': [nodes[0]['id']]}], 'inspiration': [{'question': '什么操作应放在同一事务？', 'application': '支付场景', 'exercise': '设计一个转账失败回滚练习'}] if mode == 'knowledge' else [], 'nodeIds': [node['id'] for node in nodes]}
    status = {'book': {'bookId': mode, 'collId': 'fixture', 'title': '匿名信 · 情节回顾' if mode == 'story' else '数据库事务 · 知识导读', 'author': '测试样本', 'format': 'txt', 'localState': 'local'}, 'mode': mode, 'canManage': True, 'inspection': {'supported': True, 'chapterCount': 1, 'charCount': 1000}, 'stale': False, 'revisionId': 'revision1', 'overview': {'summary': digest['summary'], 'complete': True, 'coveredChapters': [1], 'totalChapters': 1}, 'run': {'id': 'run1', 'state': 'completed', 'stage': '完成', 'completed': 1, 'total': 1, 'indexState': 'ready', 'kind': 'analyze'}}
    now = datetime.now(timezone.utc).isoformat()
    status['run'].update({'error': '', 'cancelRequested': False, 'serverTime': now, 'events': [
        {'id': 1, 'kind': 'model_request_started', 'title': '正在请求模型，等待返回', 'level': 'info', 'createdAt': now, 'details': {'requestId': 'req1', 'modelName': 'test-chat', 'providerName': '测试提供商', 'modelRole': 'simple', 'phase': 'extract', 'attempt': 1}},
        {'id': 2, 'kind': 'model_response', 'title': '模型已返回，准备检查输出', 'level': 'info', 'createdAt': now, 'details': {'requestId': 'req1', 'durationMs': 2300, 'chars': 1234, 'finishReason': 'stop'}},
        {'id': 3, 'kind': 'run_completed', 'title': '任务处理完成', 'level': 'success', 'createdAt': now, 'details': {}},
    ]})
    return status, chapter, digest, graph


with sync_playwright() as playwright:
    executable = os.getenv('ODOC_READING_CHROMIUM', '/Users/zhouliangjun/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell')
    browser = playwright.chromium.launch(headless=True, executable_path=executable)
    try:
        for mode in ('story', 'knowledge'):
            status, chapter, digest, graph = fixtures(mode)
            context = browser.new_context(viewport={'width': 1440, 'height': 1100})
            context.add_init_script("if (location.origin !== 'null') localStorage.setItem('token', 'isolated-test-token')")
            errors = []
            context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
            def api(route):
                url = urlparse(route.request.url)
                path, params = url.path, parse_qs(url.query)
                data = {}
                if '/book-analysis/' in path:
                    if path.endswith('/chapters'):
                        data = {'items': [chapter], 'total': 1, 'page': 1, 'limit': 50}
                    elif '/chapters/chapter1' in path:
                        data = {**chapter, 'digest': digest, 'sourcePreview': digest['summary'], 'sourceAvailable': True}
                    elif path.endswith('/graph'):
                        data = dict(graph)
                        nodes = graph['nodes']
                        if params.get('view', [''])[0] in ('flow', 'timeline'):
                            nodes = [n for n in nodes if n['kind'] == 'event']
                            data['limit'] = 50
                        if params.get('query', [''])[0]:
                            nodes = [n for n in nodes if params['query'][0] in n['name']]
                        if params.get('thread', [''])[0]:
                            nodes = [n for n in nodes if n.get('thread') == params['thread'][0]]
                        if params.get('query', [''])[0] == '图谱样本':
                            nodes = [{**graph['nodes'][0], 'id': 'sample' + str(i), 'kind': 'clue', 'name': '图谱样本线索 ' + str(i)} for i in range(50)]
                        data['nodes'], data['total'] = nodes, len(nodes)
                        data['edges'] = [e for e in graph['edges'] if e['source'] in {n['id'] for n in nodes} and e['target'] in {n['id'] for n in nodes}]
                    elif '/nodes/' in path:
                        identity = path.rsplit('/', 1)[-1]
                        data = {'node': next(n for n in graph['nodes'] if n['id'] == identity), 'neighbors': graph}
                    elif path.endswith('/ask'):
                        source = {**graph['nodes'][0]['facts'][0]['evidence'], 'sourceId': 'S1'}
                        route.fulfill(status=200, content_type='text/event-stream', body='event: sources\ndata: ' + json.dumps({'sources': [source], 'method': 'keyword'}, ensure_ascii=False) + '\n\nevent: answer\ndata: {"content":"根据原文证据回答 [S1]"}\n\nevent: done\ndata: {}\n\n')
                        return
                    else:
                        data = status
                elif path.endswith('/user/profile'):
                    data = {'username': 'reading-test', 'nickname': '测试用户', 'role': 'admin'}
                elif path.endswith('/anthology/fixture/books'):
                    data = [{**status['book'], 'size': 1000, 'formattedSize': '1 KB', 'progress': 0, 'remoteAvailable': False, 'canRead': True}]
                elif '/anthology/book/' in path and path.endswith('/file'):
                    route.fulfill(status=200, content_type='text/plain; charset=utf-8', body=('第一章\n' + '\n'.join(n['facts'][0]['evidence']['quote'] for n in graph['nodes']) + '\n') * 10)
                    return
                elif '/anthology/book/' in path and path.endswith('/progress'):
                    data = {'location': '', 'progress': 0}
                elif 'anthology' in path or 'agents' in path:
                    data = []
                route.fulfill(status=200, content_type='application/json', body=json.dumps({'code': 200, 'msg': 'success', 'data': data}, ensure_ascii=False))
            context.route(BASE_URL + '/api/**', api)
            page = context.new_page()
            page.goto(BASE_URL + '/books/fixture/guide/' + mode)
            page.wait_for_load_state('networkidle')
            page.screenshot(path=str(OUTPUT / (mode + '-initial.png')), full_page=True)
            expect(page.get_by_role('heading', name=status['book']['title'])).to_be_visible()
            expect(page.get_by_role('log', name='执行步骤时间线')).to_contain_text('简易模型 · 测试提供商 / test-chat')
            expect(page.get_by_role('log', name='执行步骤时间线')).to_contain_text('结束原因：stop')
            if mode == 'story':
                expect(page.get_by_role('region', name='故事情节画布')).to_be_visible()
                page.get_by_role('button', name='查看情节：收到匿名信', exact=True).click()
                expect(page.get_by_role('heading', name='收到匿名信', level=2)).to_be_visible()
                page.get_by_role('button', name='关闭节点详情').click()
                page.get_by_role('button', name='发现手表', exact=False).last.click()
                expect(page.get_by_role('heading', name='发现手表', level=2)).to_be_visible()
                page.get_by_role('button', name='林雨', exact=False).last.click()
                expect(page.get_by_role('heading', name='林雨')).to_be_visible()
                page.screenshot(path=str(OUTPUT / 'story-details.png'), full_page=True)
                page.get_by_role('button', name='关闭节点详情').click()
                page.get_by_role('button', name='关系图谱', exact=True).click()
                drawing = page.get_by_role('img', name='可点击的书籍知识图谱')
                expect(drawing.locator('svg')).to_be_visible()
                def assert_round_nodes(count):
                    # Neutral state: hover emphasis can lighten SVG fill colors.
                    page.mouse.move(0, 0)
                    selector = '[aria-label="可点击的书籍知识图谱"] svg path'
                    page.wait_for_function('''([selector, count]) => Array.from(document.querySelectorAll(selector)).filter(p => p.getAttribute('fill') && p.getAttribute('fill') !== 'none').length === count''', arg=[selector, count])
                    shapes = page.locator(selector).evaluate_all('''paths => paths.filter(p => p.getAttribute('fill') && p.getAttribute('fill') !== 'none').map(p => {const r=p.getBoundingClientRect(); return [r.width,r.height];})''')
                    assert len(shapes) == count
                    assert all(4 < w < 30 and abs(w-h) < .1 for w, h in shapes), shapes
                    # Readable force spacing may extend beyond the viewport;
                    # pan/zoom explores it instead of squeezing all nodes in.
                assert_round_nodes(6)
                drawing.locator("path[fill='#f97316']").first.click()
                expect(page.get_by_role('heading', name='收到匿名信', level=2)).to_be_visible()
                page.get_by_role('button', name='关闭节点详情').click()
                assert_round_nodes(6)
                page.screenshot(path=str(OUTPUT / 'story-relation-round.png'), full_page=True)
                page.get_by_role('textbox', name='搜索图谱').fill('图谱样本')
                assert_round_nodes(50)
                page.screenshot(path=str(OUTPUT / 'story-relation-50-nodes.png'), full_page=True)
                page.get_by_role('textbox', name='搜索图谱').fill('')
                assert_round_nodes(6)
                page.get_by_role('button', name='全部故事线', exact=True).click()
                page.get_by_text('匿名信调查', exact=True).last.click()
                assert_round_nodes(2)
                page.screenshot(path=str(OUTPUT / 'story-relation-two-nodes.png'), full_page=True)
                drawing.hover()
                page.mouse.wheel(0, -300)
                page.wait_for_timeout(200)
                page.get_by_role('button', name='重置视图', exact=True).click()
                assert_round_nodes(2)
                page.set_viewport_size({'width': 390, 'height': 844})
                assert_round_nodes(2)
                page.screenshot(path=str(OUTPUT / 'story-relation-mobile.png'), full_page=True)
                page.get_by_role('textbox', name='搜索图谱').fill('收到')
                assert_round_nodes(1)
                page.get_by_role('textbox', name='搜索图谱').fill('')
                page.set_viewport_size({'width': 1440, 'height': 1100})
                page.get_by_role('button', name='时间线', exact=True).click()
                expect(page.get_by_text('故事事件记录', exact=False)).to_be_visible()
            else:
                page.get_by_role('button', name='1. 事务基础', exact=False).click()
                expect(page.get_by_text('AI 延伸建议', exact=False)).to_be_visible()
                page.get_by_role('button', name='思维导图', exact=True).click()
                expect(page.get_by_role('img', name='可点击的知识思维导图')).to_be_visible()
                page.screenshot(path=str(OUTPUT / 'knowledge-mindmap.png'), full_page=True)
            page.get_by_role('textbox', name='图书问题').fill('本章重点是什么？')
            page.get_by_role('button', name='发送问题', exact=True).click()
            expect(page.get_by_text('根据原文证据回答 [S1]', exact=True)).to_be_visible()
            page.get_by_role('button', name='[S1]', exact=False).click()
            expect(page.locator('.reader-txt-page-content').first).to_contain_text(graph['nodes'][0]['facts'][0]['evidence']['quote'])
            page.get_by_role('button', name='返回书架', exact=True).click()
            page.set_viewport_size({'width': 390, 'height': 844})
            page.wait_for_load_state('networkidle')
            page.screenshot(path=str(OUTPUT / (mode + '-mobile.png')), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'mobile overflow: ' + str(page.evaluate("Array.from(document.querySelectorAll('*')).filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 1).slice(0,12).map(e => [e.tagName,e.className,e.getBoundingClientRect().width])"))
            assert not errors, '\n'.join(errors)
            if mode == 'story':
                moment = datetime.now(timezone.utc)
                status['run'].update({'state': 'running', 'completed': 0, 'stage': '第 1 章 · 分段 1', 'serverTime': moment.isoformat(), 'heartbeatAt': moment.isoformat(), 'events': [{'id': 4, 'kind': 'model_request_started', 'title': '正在请求模型，等待首个输出', 'level': 'info', 'createdAt': (moment - timedelta(seconds=5)).isoformat(), 'details': {'requestId': 'req2', 'modelName': 'test-chat', 'providerName': '测试提供商', 'modelRole': 'simple', 'phase': 'extract', 'timeoutSeconds': 120, 'deadlineSeconds': 120, 'streaming': 1, 'sdkRetries': 0, 'thinkingMode': 'disabled', 'jsonMode': 'json_object', 'maxTokens': 6000}}]})
                page.reload()
                page.wait_for_load_state('networkidle')
                expect(page.get_by_text('正在等待简易模型首个输出', exact=False)).to_be_visible()
                expect(page.get_by_text('已发送关闭思考参数。', exact=False)).to_be_visible()
                expect(page.get_by_role('button', name='开始分析', exact=True)).to_be_disabled()
                timeline = page.get_by_role('log', name='执行步骤时间线')
                status['run']['events'].append({'id': 5, 'kind': 'model_first_output', 'title': '收到首个输出，继续接收', 'level': 'info', 'createdAt': moment.isoformat(), 'details': {'requestId': 'req2', 'chars': 420, 'durationMs': 800}})
                expect(page.get_by_text('正在接收模型输出 · 已收到 420 字符', exact=False)).to_be_visible(timeout=10000)
                status['run']['events'].extend([{'id': 6, 'kind': 'model_response', 'title': '模型已完整返回，准备检查输出', 'level': 'info', 'createdAt': moment.isoformat(), 'details': {'requestId': 'req2', 'chars': 900, 'finishReason': 'stop'}}, {'id': 7, 'kind': 'validation_failed', 'title': '模型结果校验未通过', 'level': 'warning', 'createdAt': moment.isoformat(), 'details': {'reason': 'JSON 语法错误：缺少闭合括号'}}])
                expect(timeline).to_contain_text('缺少闭合括号', timeout=10000)
                page.screenshot(path=str(OUTPUT / 'execution-running.png'), full_page=True)
                status['run'].update({'state': 'failed', 'error': '本段 AI 结果校验失败：JSON 语法错误', 'stage': '处理失败，可断点重试'})
                expect(page.get_by_role('button', name='断点续跑', exact=True)).to_be_visible(timeout=10000)
                expect(page.get_by_role('alert')).to_contain_text('JSON 语法错误')
                page.screenshot(path=str(OUTPUT / 'execution-failed.png'), full_page=True)
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'execution panel mobile overflow'
            context.close()
        print('PASS: canvas event cards, circular graph (1/2/6/50 nodes, graph click, zoom/reset, resize/mobile), story/knowledge navigation, execution metadata, failure recovery UI, linked details, mind map, Q&A, original TXT jump, mobile layout')
    finally:
        browser.close()

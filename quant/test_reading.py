"""Bounded browsing regression and synthetic before/after payload benchmark."""
import json
import re
import time
import tracemalloc
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from anthology.models import Anthology
from quant.models import Entry, SourceMaterial, SourceRevision, AIRun, ResearchReport, ReportRevision, WorkflowStep, WorkflowOutcome
from quant.presentation import entry_detail
from djangorestframework_camel_case.render import CamelCaseJSONRenderer


@override_settings(QUANT_DISABLE_WORKERS=True, MEDIA_ROOT='/private/tmp/odoc-quant-reading-test-media')
class ReadingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('reading-owner')
        cls.collection = Anthology.objects.create(type='quant', title='隔离加载基准', permission='private', user_id=f'user_{cls.user.pk}')
        cls.entry = Entry.objects.create(anthology=cls.collection, title='隔离研究', content='正文' * 5000, tags=['未加载标签'])
        cls.material = SourceMaterial.objects.create(entry=cls.entry)
        cls.source = SourceRevision.objects.create(material=cls.material, payload={'code': '源码' * 5000, 'language': 'python'}, content_hash='a' * 64)
        cls.task = AIRun.objects.create(entry=cls.entry, source=cls.source, status='completed', kind='analyze', request_key='isolated_reading_001', result={'title': '隔离分析', 'summary': '正文' * 5000})
        cls.report = ResearchReport.objects.create(entry=cls.entry, source=cls.source, run=cls.task, schema_version=3,
            data={'title': '隔离分析', 'summary': '正文' * 5000, 'total_score': 60}, markdown='报告' * 5000, content_hash='b' * 64)
        cls.base = f'/api/quant/{cls.collection.pk}/entries/'

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def get(self, path='', params=None):
        response = self.client.get(self.base + path, params or {})
        self.assertEqual(response.status_code, 200, response.data)
        self.last_response_content=response.content
        if hasattr(self,'wire_sizes'): self.wire_sizes.append(len(response.content))
        return response.data['data']

    def test_directory_pagination_filter_and_sql_projection(self):
        Entry.objects.bulk_create([Entry(anthology=self.collection, title=f'条目{i:03}', content='隐藏' * 5000) for i in range(100)])
        with CaptureQueriesContext(connection) as queries:
            data = self.get()
        self.assertEqual(len(data['items']), 50)
        self.assertEqual(data['total'], 101)
        self.assertTrue(data['has_more'])
        self.assertNotIn('content', data['items'][0])
        self.assertTrue(all('note_preview' not in row for row in data['items']))
        self.assertLessEqual(len(data['items'][0]['preview']), 160)
        self.assertIn('SUBSTR', ' '.join(row['sql'] for row in queries))
        self.assertEqual(self.get(params={'q': '未加载标签'})['total'], 1)
        self.assertEqual(self.get(params={'q': '隐藏'})['total'], 100)
        self.assertEqual(self.get(params={'offset': 100})['total'], 101)
        self.assertEqual(len(self.get(params={'offset': 100})['items']), 1)
        self.assertEqual(self.client.get(self.base, {'limit': 101}).status_code, 400)

    def test_overview_and_current_report_do_not_expand_history(self):
        ReportRevision.objects.bulk_create([ReportRevision(report=self.report, markdown='历史' * 5000, content_hash=str(i)) for i in range(100)])
        current = self.get(f'{self.entry.pk}/')
        self.assertEqual(current['default_report_id'], self.report.pk)
        self.assertNotIn('reports', current)
        self.assertNotIn('content', current)
        body = self.get(f'{self.entry.pk}/reading/reports/{self.report.pk}/')
        self.assertNotIn('original_markdown', body)
        self.assertNotIn('revisions', body)
        self.assertEqual(body['revision_count'], 100)
        history = self.get(f'{self.entry.pk}/reading/reports/{self.report.pk}/revisions/')
        self.assertEqual(len(history['items']), 20)
        self.assertNotIn('markdown', history['items'][0])
        revision = self.get(f"{self.entry.pk}/reading/reports/{self.report.pk}/revisions/{history['items'][0]['id']}/")
        self.assertEqual(revision['markdown'], '历史' * 5000)

    def test_status_and_stage_summary_do_not_select_full_json(self):
        self.task.workflow_version = 25
        self.task.save(update_fields=['workflow_version'])
        step = WorkflowStep.objects.create(run=self.task, stage='research', ordinal=1, input={'huge': '输入' * 50000}, content_hash='c' * 64)
        WorkflowOutcome.objects.create(step=step, data={'status': 'completed', 'output': {'huge': '输出' * 50000}}, content_hash='d' * 64)
        with CaptureQueriesContext(connection) as queries:
            state = self.get(f'{self.entry.pk}/status/')
            summary = self.get(f'{self.entry.pk}/reading/runs/{self.task.pk}/')
        self.assertNotIn('result', summary)
        self.assertNotIn('输入', json.dumps(summary, ensure_ascii=False, default=str))
        self.assertNotIn('输出', json.dumps(state, ensure_ascii=False, default=str))
        sql = ' '.join(row['sql'] for row in queries)
        self.assertNotRegex(sql, r'(?:SELECT|,)\s*"quant_workflowstep"\."input"\s*(?:,| FROM)')
        self.assertNotRegex(sql, r'(?:SELECT|,)\s*"quant_workflowoutcome"\."data"\s*(?:,| FROM)')
        self.assertNotIn('"quant_airun"."result",', sql)

    def test_owner_boundary(self):
        other = get_user_model().objects.create_user('reading-other')
        self.client.force_authenticate(other)
        for path in ['', f'{self.entry.pk}/', f'{self.entry.pk}/reading/reports/{self.report.pk}/', f'{self.entry.pk}/status/']:
            self.assertEqual(self.client.get(self.base + path).status_code, 404)

    def test_history_payload_benchmark(self):
        ReportRevision.objects.bulk_create([ReportRevision(report=self.report,markdown='修订'*5000,content_hash=str(j)) for j in range(5)])
        for i in range(99):
            run = AIRun.objects.create(entry=self.entry, source=self.source, kind='analyze', status='completed', request_key=f'benchmark_{i}', result={'summary': '正文' * 5000})
            report = ResearchReport.objects.create(entry=self.entry, source=self.source, run=run, data={'title': f'报告{i}'}, markdown='正文' * 5000, content_hash=str(i))
            ReportRevision.objects.bulk_create([ReportRevision(report=report, markdown='修订' * 5000, content_hash=str(j)) for j in range(5)])
        def measure(callback):
            self.wire_sizes=[]
            tracemalloc.start()
            started = time.perf_counter()
            with CaptureQueriesContext(connection) as queries:
                result = callback()
                size = sum(self.wire_sizes) if self.wire_sizes else len(CamelCaseJSONRenderer().render({'code':200,'msg':'','data':result}))
            _, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            return {'bytes': size, 'queries': len(queries), 'ms': round((time.perf_counter()-started)*1000), 'peak_bytes': peak}
        def initial_read():
            base=f'{self.entry.pk}/'
            head=self.get(base)
            selected=self.get(f"{base}reading/reports/{head['default_report_id']}/")
            return {'overview':head,'reports':self.get(base+'reading/reports/'),'sources':self.get(base+'reading/sources/'),
                    'runs':self.get(base+'reading/runs/'),'body':selected,
                    'run':self.get(f"{base}reading/runs/{selected['run_id']}/")}
        legacy = measure(lambda: entry_detail(self.entry))
        bounded = measure(lambda: self.get(f'{self.entry.pk}/'))
        initial=measure(initial_read)
        repeated=measure(initial_read)
        self.assertLess(bounded['bytes'], legacy['bytes'] / 100)
        print('QUANT_HISTORY_BENCHMARK', json.dumps({'legacy': legacy, 'overview': bounded,'initial':initial,'repeat_without_browser_cache':repeated}))

    def test_directory_scale_and_query_plans(self):
        from quant.reading.directory import directory
        from quant.research.list_scores import with_default_report_score
        from quant.serializers import EntryListSerializer
        from django.http import QueryDict
        from django.db.models.functions import Substr
        def measure(callback):
            self.wire_sizes=[]
            tracemalloc.start()
            started=time.perf_counter()
            with CaptureQueriesContext(connection) as queries:
                result=callback()
                size=len(CamelCaseJSONRenderer().render({'code':200,'msg':'','data':result}))
            _,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
            return {'bytes':size,'queries':len(queries),'ms':round((time.perf_counter()-started)*1000),'peak_bytes':peak}
        for count in (100,1000):
            start=Entry.objects.filter(anthology=self.collection).count()
            entries=[Entry(anthology=self.collection,title=f'容量样例{i:04}',content='正文'*5000) for i in range(start,count)]
            Entry.objects.bulk_create(entries,batch_size=50)
            materials=[SourceMaterial(entry=row) for row in entries]
            SourceMaterial.objects.bulk_create(materials,batch_size=50)
            sources=[SourceRevision(material=material,payload={'code':'源码'*5000,'language':'python'},content_hash='c'*64) for material in materials]
            SourceRevision.objects.bulk_create(sources,batch_size=50)
            runs=[AIRun(entry=row,source=source,kind='analyze',status='completed',request_key=f'capacity_{row.pk}') for row,source in zip(entries,sources)]
            AIRun.objects.bulk_create(runs,batch_size=50)
            ResearchReport.objects.bulk_create([ResearchReport(entry=row,source=source,run=run,data={'title':row.title,'total_score':60},markdown='报告'*5000,content_hash='d'*64) for row,source,run in zip(entries,sources,runs)],batch_size=50)
            legacy=lambda:EntryListSerializer(list(with_default_report_score(Entry.objects.filter(anthology=self.collection,is_valid=True))),many=True).data
            bounded=lambda:directory(self.collection,QueryDict('limit=50'))
            values={'count':count,'legacy_cold':measure(legacy),'bounded_cold':measure(bounded),'legacy_warm':measure(legacy),'bounded_warm':measure(bounded)}
            self.assertLess(values['bounded_cold']['bytes'],100000)
            self.assertEqual(len(bounded()['items']),50)
            print('QUANT_DIRECTORY_BENCHMARK',json.dumps(values))
        with connection.cursor() as cursor: cursor.execute('ANALYZE quant_entry')
        query=Entry.objects.filter(anthology=self.collection,is_valid=True).annotate(preview=Substr('content',1,640)).order_by('-updated_at','-id').values('id','preview')[:50]
        print('QUANT_DIRECTORY_QUERY_PLAN',connection.vendor,query.explain())
        self.assertIn('quant_entry_read_idx',query.explain())
        self.assertNotIn('TEMP B-TREE',query.explain())
        for rows in [self.entry.reports.order_by('-created_at','-id').values('id'),self.report.revisions.order_by('-created_at','-id').values('id')]:
            print('QUANT_HISTORY_QUERY_PLAN',connection.vendor,rows[:20].explain())

    def test_capacity_diagnostic_is_read_only_and_content_free(self):
        from quant.reading.capacity import capacity
        with CaptureQueriesContext(connection) as queries:
            data=capacity(self.collection.pk)
        self.assertEqual(data['categories']['reports']['count'],1)
        self.assertEqual(data['categories']['reports']['field_bytes']['markdown'],30000)
        self.assertNotIn('正文',json.dumps(data,ensure_ascii=False))
        self.assertFalse(any(row['sql'].lstrip().upper().startswith(('INSERT','UPDATE','DELETE')) for row in queries))

    def test_active_status_json_projection_benchmark_and_recovery(self):
        from datetime import timedelta
        from django.utils import timezone
        from quant.models import Job
        self.task.workflow_version=25
        self.task.result={'huge':'结果'*100000}
        self.task.requirements='要求'*50000
        self.task.planning_context={'huge':'计划'*100000}
        self.task.save(update_fields=['workflow_version','result','requirements','planning_context'])
        step=WorkflowStep.objects.create(run=self.task,stage='research',ordinal=1,input={'huge':'输入'*100000},content_hash='f'*64)
        WorkflowOutcome.objects.create(step=step,data={'status':'completed','output':{'huge':'输出'*100000}},content_hash='e'*64)
        Job.objects.create(run=self.task,lease_until=timezone.now()+timedelta(hours=1),preview='进行中')
        results=[]
        for state in ('running','failed','cancelled','completed'):
            type(self.task).objects.filter(pk=self.task.pk).update(status=state)
            for visit in ('first','repeat'):
                tracemalloc.start();started=time.perf_counter()
                with CaptureQueriesContext(connection) as queries:
                    result=self.get(f'{self.entry.pk}/status/')
                    encoded=self.last_response_content
                _,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
                results.append({'state':state,'visit':visit,'bytes':len(encoded),'queries':len(queries),'ms':round((time.perf_counter()-started)*1000),'peak_bytes':peak})
                self.assertLess(len(encoded),10000)
                self.assertNotIn('要求',encoded.decode())
                sql=' '.join(row['sql'] for row in queries)
                self.assertNotRegex(sql,r'(?:SELECT|,)\s*"quant_airun"\."(?:result|planning_context|requirements)"\s*(?:,| FROM)')
        type(self.task).objects.filter(pk=self.task.pk).update(status='running')
        Job.objects.filter(run=self.task).update(lease_until=timezone.now()-timedelta(hours=1))
        self.get(f'{self.entry.pk}/')
        self.task.refresh_from_db();self.assertEqual(self.task.status,'running')
        self.get(f'{self.entry.pk}/status/')
        self.task.refresh_from_db();self.assertEqual(self.task.status,'interrupted')
        print('QUANT_STAGE_JSON_BENCHMARK',connection.vendor,json.dumps(results))

    def test_snippet_summary_counts_are_projected_in_both_databases(self):
        from quant.workflows.presentation import summary
        self.task.workflow_version=28
        self.task.save(update_fields=['workflow_version'])
        WorkflowStep.objects.create(run=self.task,stage='snippets',ordinal=1,content_hash='1'*64,
            input={'snippet_plan':{'units':[{'reused_from':{'run_id':'parent'}},{'reused_from':{}}],
                                 'omitted':3,'baseline':{'run_id':'parent'},'huge':'输入'*50000}})
        result=summary(self.task)
        self.assertEqual(result['local_reading'],{'selected':2,'reused':1,'omitted':3,'baseline_run_id':'parent'})
        self.assertNotIn('输入',json.dumps(result,ensure_ascii=False))

    def test_code_history_and_source_metadata_are_separate(self):
        from quant.services import create_implementation,save_version
        impl=create_implementation(self.entry,{'name':'隔离实现','language':'python','code':'old_code = 1'})
        oldest=impl.current_version_id
        for i in range(21):save_version(impl,{'code':f'new_code = {i}','language':'python'})
        root=f'{self.entry.pk}/reading/'
        headers=self.get(root+'implementations/')
        self.assertNotIn('versions',headers['items'][0])
        page=self.get(root+f'implementations/{impl.pk}/versions/')
        self.assertEqual(len(page['items']),20)
        self.assertNotIn('code',page['items'][0])
        self.assertEqual(self.get(root+f'versions/{oldest}/')['code'],'old_code = 1')
        source=self.get(root+f'sources/{self.source.pk}/',{'metadata':1})
        self.assertNotIn('payload',source)
        self.assertEqual(source['latest_report_id'],self.report.pk)
        receipt=self.client.patch(self.base+f'{self.entry.pk}/implementations/{impl.pk}/',{'name':'改名'},format='json')
        self.assertEqual(receipt.status_code,200,receipt.data)
        self.assertNotIn('versions',receipt.data['data'])
        self.assertEqual(len(self.get(root+f'implementations/{impl.pk}/versions/',{'offset':20})['items']),2)

    def test_manual_capacity_command_returns_counts_without_content(self):
        from io import StringIO
        from django.core.management import call_command
        out=StringIO()
        with CaptureQueriesContext(connection) as queries:
            call_command('quant_storage_audit',collection_id=self.collection.pk,stdout=out)
        payload=json.loads(out.getvalue())
        self.assertEqual(payload['categories']['reports']['count'],1)
        self.assertNotIn('正文',out.getvalue())
        self.assertTrue(all(row['sql'].lstrip().upper().startswith('SELECT') for row in queries))

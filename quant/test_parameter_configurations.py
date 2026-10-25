import copy
import json
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant import test_feedback as fixtures
from quant.models import AIRun, ResearchReport, SourceRevision, Job
from quant.parameters.mql_set import parse
from quant.parameters.comparison import declarations, compare
from quant.feedback.evidence import for_run
from quant.worker import execute, prompt
from quant.sync import metadata, validate
from quant.research.contracts import digest
from utils.sync_manager import SyncManager, SyncError

CODE = '''// input int Fake=999;
input int N=20;
extern double Lots=0.1;
input bool Enabled=true;
input string Label="a;=b";
input ENUM_TIMEFRAMES Period=PERIOD_H1;
input int Missing=7;
'''
DOCUMENT = '; saved configuration\nN=10\nN,F=1\nN,1=5\nN,2=5\nN,3=30\nLots=0.2\nEnabled=1\nLabel=a;=b\nPeriod=60\nUnknown=2'


class ParameterConfigurationTests(TestCase):
    setUp = fixtures.FeedbackTests.setUp
    collect = fixtures.FeedbackTests.collect
    prepare = fixtures.FeedbackTests.prepare

    def configuration(self):
        self.payload.update(code=CODE, language='mql4')
        entry, target, url, data = self.prepare()
        data.update(document_format='mql_set', mode='configuration', document=DOCUMENT)
        return entry, target, url, data

    def test_parser_preserves_values_ranges_and_ambiguity(self):
        data = parse(DOCUMENT)
        self.assertEqual(data['parameters'][0]['raw_value'], '10')
        self.assertEqual(data['parameters'][0]['optimization']['step'], '5')
        self.assertEqual(len(data['parameters']), 6)
        inline = parse('N=10||5||5||30||Y\nLabel=x=y')
        self.assertEqual(inline['parameters'][0]['optimization']['enabled'], True)
        self.assertEqual(inline['parameters'][1]['raw_value'], 'x=y')
        huge = parse('N=99999999999999999999999999')
        self.assertEqual(huge['parameters'][0]['kind'], 'unknown')
        for invalid in ('N=1\nN=2', 'N=1\nN,F=1\nN,F=0', 'N=1||1||1||2||Y\nN,F=1', 'not a preset', 'N=\x00', 'N=' + 'a'*2001):
            with self.assertRaises(ValidationError): parse(invalid)
        self.assertEqual(parse('N=20\nUnknown,1=5')['warnings'][0]['line'], 2)
        text = parse('Label=hello||start||step||end||Y')
        self.assertEqual(text['parameters'][0]['raw_value'], 'hello||start||step||end||Y')
        self.assertIsNone(text['parameters'][0]['optimization'])
        self.assertTrue(text['warnings'])

    def test_declarations_match_exact_names_without_parsing_comments_or_strings_as_code(self):
        rows = declarations(CODE)
        self.assertEqual(len(rows), 6)
        self.assertEqual(next(row for row in rows if row['name'] == 'Label')['default_raw'], '"a;=b"')
        result = compare(parse(DOCUMENT), {'id': 'source', 'content_hash': 'hash', 'payload': {'language': 'mql4', 'code': CODE}})
        self.assertEqual({row['name']: row['status'] for row in result['rows']},
            {'N': 'different', 'Lots': 'different', 'Enabled': 'same', 'Label': 'same', 'Period': 'unknown_type', 'Unknown': 'unmatched'})
        self.assertEqual(result['missing'][0]['name'], 'Missing')
        duplicate = compare(parse('N=3'), {'id': 's', 'content_hash': 'h', 'payload': {'language': 'mql4', 'code': 'input int N=1;\nextern int N=2;'}})
        self.assertEqual(duplicate['rows'][0]['status'], 'ambiguous')
        expression = compare(parse('Label=hello'), {'id': 's', 'content_hash': 'h', 'payload': {'language': 'mql4', 'code': 'input string Label=DEFAULT_LABEL;'}})
        self.assertEqual(expression['rows'][0]['status'], 'default_unknown')
        text_inline = compare(parse('Label=10||5||5||30||Y'), {'id': 's', 'content_hash': 'h', 'payload': {'language': 'mql4', 'code': 'input string Label="10";'}})
        self.assertEqual(text_inline['rows'][0]['status'], 'ambiguous')
        with self.assertRaises(ValidationError):
            declarations('\n'.join(f'input int P{i}=1;' for i in range(301)))

    def test_preview_archive_ai_context_and_restore_preserve_configuration(self):
        entry, target, url, data = self.configuration()
        preview_url = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/parameters/preview/'
        before = SourceRevision.objects.count()
        preview = self.client.post(preview_url, {'target_source_id': target.pk, 'document': DOCUMENT}, format='json')
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(SourceRevision.objects.count(), before)
        saved = self.client.post(url, data, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        source = SourceRevision.objects.get(pk=saved.data['data']['source']['id'])
        self.assertEqual(source.payload['feedback_version'], 2)
        run = AIRun.objects.get(kind='feedback_review')
        context = for_run(run)
        self.assertEqual(context['parameter_comparison']['source_id'], target.pk)
        result = fixtures.response(); result['reported_metrics'] = []; result['counter_evidence'] = []
        with patch('quant.worker.complete', return_value=json.dumps(result)):
            execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        report = ResearchReport.objects.get(run=run)
        self.assertIn('文件配置参数', report.markdown)
        self.assertEqual(report.data['parameter_comparison']['rows'][0]['status'], 'different')
        before_prompt = prompt(run)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        for key in ('parameter_configuration', 'parameter_comparison'):
            altered = copy.deepcopy(snapshot)
            if key == 'parameter_configuration':
                row = next(row for row in altered if row['model'] == 'quant.sourcerevision' and row['pk'] == source.pk)
                row['fields']['payload'][key]['parameters'][0]['raw_value'] = '99'
                row['fields']['content_hash'] = digest(row['fields']['payload'])
            else:
                row = next(row for row in altered if row['model'] == 'quant.airun' and row['pk'] == run.pk)
                row['fields']['result'][key]['rows'][0]['status'] = 'same'
            with self.assertRaises(SyncError): validate(altered, metadata(altered))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)), before_prompt)
        self.assertFalse(Job.objects.exists())
        self.assertEqual(self.client.post(url, data, format='json').status_code, 200)
        self.assertEqual(AIRun.objects.count(), 1)

    def test_config_cannot_invent_performance_or_cross_entry_and_invalid_input_stays_atomic(self):
        entry, target, url, data = self.configuration()
        self.assertEqual(self.client.post(url, {**data, 'mode': 'live'}, format='json').status_code, 400)
        self.assertFalse(AIRun.objects.exists()); self.assertEqual(SourceRevision.objects.count(), 1)
        self.client.post(url, data, format='json')
        run = AIRun.objects.get(kind='feedback_review')
        result = fixtures.response(); result['reported_metrics'][0] = {'name': '收益', 'value': '10', 'unit': '', 'quote': 'N=10'}; result['counter_evidence'] = []
        with patch('quant.worker.complete', return_value=json.dumps(result)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'failed')
        self.assertFalse(ResearchReport.objects.exists())
        path = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/parameters/preview/'
        self.assertEqual(self.client.post(path, {'target_source_id': 'missing', 'document': DOCUMENT}, format='json').status_code, 400)

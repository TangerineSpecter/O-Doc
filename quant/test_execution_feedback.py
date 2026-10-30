"""Imported accounting drives bounded AI research, never platform verification."""
from quant.testing_reading import read_fixture
import copy
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import ValidationError

from quant import test_feedback as fixtures
from quant.feedback.contracts import FeedbackInput, validate_analysis
from quant.feedback.evidence import for_run, for_source
from quant.feedback.execution import preview
from quant.feedback.planning import options
from quant.models import AIRun, ExperimentJob, ExperimentProposal, Job, ResearchReport, SourceRevision
from quant.research.contracts import digest
from quant.sync import metadata, validate
from quant.worker import execute, prompt
from utils.sync_manager import SyncError, SyncManager


def document():
    return json.dumps({'version': 1, 'metadata': {'currency': 'USD', 'timezone': 'UTC',
        'initial_balance': '1000', 'profit_basis': 'net', 'cash_flow_coverage': 'complete'},
        'parameters': [{'name': 'N', 'value': '10', 'unit': 'bar'}],
        'reported_metrics': [{'name': 'net_profit', 'value': '99', 'unit': 'USD'}],
        'records': [
            {'kind': 'trade', 'id': 'loss', 'timestamp': '2026-01-01T00:00:00Z', 'profit': '-20',
             'commission': '-2', 'swap': '-1', 'fees': '0', 'balance': '980'},
            {'kind': 'cash_flow', 'id': 'deposit', 'timestamp': '2026-01-02T00:00:00Z', 'amount': '100', 'balance': '1080'},
            {'kind': 'trade', 'id': 'gain', 'timestamp': '2026-01-03T00:00:00Z', 'profit': '5', 'balance': '1085'},
            {'kind': 'equity', 'id': 'eq1', 'timestamp': '2026-01-04T00:00:00Z', 'equity': '980'},
            {'kind': 'equity', 'id': 'eq2', 'timestamp': '2026-01-04T00:01:00Z', 'equity': '950'}]})


def analysis(context):
    value = fixtures.response()
    for key in ('reported_parameters', 'reported_metrics', 'supporting_evidence', 'counter_evidence'):
        value[key] = []
    summary = context['execution_summary']
    ref = next((row['ref'] for row in summary['reconciliation']['examples']),
               next((row['ref'] for row in summary['reported_comparison'] if row['status'] == 'mismatch'), 'accounting:net_profit'))
    value['execution_assessment'] = {'summary': '记录净收益为负；声明指标不一定与给定记录一致，真实性未验证',
        'findings': [{'kind': 'counters' if summary['status'] == 'mismatch' else 'limitation',
                      'claim': '保留负面事实及缺失口径，不能据此证明源码实际运行', 'refs': [ref]}],
        'unknowns': ['平台原件真实性及盘中未采样净值']}
    compared=context.get('execution_parameter_comparison',{})
    if compared.get('version')==2:
        value['execution_assessment']['findings'].append({'kind':'limitation',
            'claim':'人工测试：源码默认、初始赋值与报告声明分开，动态或缺失映射仍未知，不补运行值。',
            'refs':[compared['ref']]})
    return value


class ExecutionFeedbackTests(TestCase):
    setUp = fixtures.FeedbackTests.setUp
    collect = fixtures.FeedbackTests.collect
    prepare = fixtures.FeedbackTests.prepare

    def input(self, data, **extra):
        return {**data, 'document_format': 'json', 'document': document(),
                'execution_adapter': 'standard-execution-json-v1', 'execution_options_json': '{}', **extra}

    def save(self, **extra):
        entry, target, url, data = self.prepare()
        data = self.input(data, **extra)
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        source = SourceRevision.objects.get(pk=response.data['data']['source']['id'])
        return entry, target, url, data, source, response

    def finish(self, source):
        run = AIRun.objects.get(source=source, kind='feedback_review')
        value = analysis(for_run(run))
        with patch('quant.worker.complete', return_value=json.dumps(value)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        return run

    def test_preview_readonly_and_save_recomputes_and_preserves_literal_names(self):
        entry, _, url, data = self.prepare()
        data = self.input(data)
        before = SourceRevision.objects.count()
        first = self.client.post(url + 'preview/', data, format='json')
        self.assertEqual(first.status_code, 200, first.data)
        computed = json.loads(first.json()['data']['previewJson'])
        self.assertEqual(SourceRevision.objects.count(), before)
        self.assertFalse(AIRun.objects.exists())
        self.assertEqual(computed['execution_evidence']['parameters'][0]['name'], 'N')
        changed = json.loads(data['document']); changed['records'][0]['profit'] = '-30'
        saved = self.client.post(url, {**data, 'document': json.dumps(changed), 'analyze': False}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        source = SourceRevision.objects.get(pk=saved.data['data']['source']['id'])
        self.assertNotEqual(source.payload['execution_accounting']['content_hash'], computed['execution_accounting']['content_hash'])
        projected = json.loads(saved.json()['data']['source']['payload']['executionPreviewJson'])
        self.assertEqual(projected['execution_evidence'], source.payload['execution_evidence'])
        self.assertEqual(source.payload['feedback_version'], 5)
        self.assertFalse(Job.objects.exists())

    def test_model_receives_compact_negative_facts_and_rejects_fabricated_refs_or_quotes(self):
        _, _, _, data, source, _ = self.save()
        run = AIRun.objects.get(source=source)
        context = for_run(run)
        self.assertEqual(context['feedback']['document'], '')
        self.assertNotIn(data['document'], prompt(run))
        self.assertEqual(context['execution_summary']['metrics']['net_profit']['value'], '-15')
        self.assertEqual(context['execution_summary']['parameters'][0]['value'], '10')
        valid = analysis(context)
        result = validate_analysis(valid, context)
        self.assertEqual(result['execution_summary'], context['execution_summary'])
        invalid = copy.deepcopy(valid); invalid['execution_assessment']['findings'][0]['refs'] = ['execution:record:invented']
        with self.assertRaises(ValidationError): validate_analysis(invalid, context)
        invalid = copy.deepcopy(valid); invalid['reported_metrics'] = fixtures.response()['reported_metrics']
        with self.assertRaises(ValidationError): validate_analysis(invalid, context)
        invalid = copy.deepcopy(valid); invalid['execution_summary'] = {**context['execution_summary'], 'status': 'reconciled'}
        with self.assertRaises(ValidationError): validate_analysis(invalid, context)
        invalid = copy.deepcopy(valid); del invalid['execution_assessment']
        with self.assertRaises(ValidationError): validate_analysis(invalid, context)
        invalid = copy.deepcopy(valid); invalid['execution_assessment']['findings'][0]['refs'] = ['accounting:net_profit']
        with self.assertRaises(ValidationError): validate_analysis(invalid, context)

    def test_completed_report_round_trip_first_pass_and_restore_replay(self):
        entry, _, url, data, source, _ = self.save()
        run = self.finish(source)
        report = ResearchReport.objects.get(run=run)
        self.assertEqual(validate_analysis(run.result), run.result)
        self.assertNotIn('total_score', report.data)
        self.assertIn('平台执行证据核算', report.markdown)
        saved_prompt = prompt(run)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)), saved_prompt)
        self.assertFalse(Job.objects.exists())
        replay = self.client.post(url, data, format='json')
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(AIRun.objects.count(), 1)
        self.assertFalse(Job.objects.exists())
        changed = self.client.post(url, {**data, 'notes': 'different'}, format='json')
        self.assertEqual(changed.status_code, 409)
        detail = read_fixture(self.client, f'/api/quant/{self.collection.pk}/entries/{entry.pk}/')
        report_data = detail['reports'][0]['data']
        self.assertEqual(json.loads(report_data['computedExecutionJson'])['execution_summary'], report.data['execution_summary'])
        self.assertEqual(report_data['executionAssessment']['findings'][0]['refs'], run.result['execution_assessment']['findings'][0]['refs'])

    def test_rehashed_payload_or_computed_evidence_tampering_rejected(self):
        _, _, _, _, source, _ = self.save()
        self.finish(source)
        snapshot = SyncManager().build_snapshot_data()
        for field in ('document', 'execution_accounting', 'execution_options', 'execution_evidence'):
            changed = copy.deepcopy(snapshot)
            row = next(row for row in changed if row['model'] == 'quant.sourcerevision' and row['pk'] == source.pk)
            payload = row['fields']['payload']
            if field == 'document': payload[field] = payload[field].replace('"-20"', '"-25"')
            elif field == 'execution_options': payload[field]['balance_tolerance'] = '9999'
            elif field == 'execution_evidence': payload[field]['parameters'][0]['value'] = '99'
            else: payload[field]['metrics']['net_profit']['value'] = '9999'
            row['fields']['content_hash'] = digest(payload)
            with self.subTest(field=field), self.assertRaises(SyncError): validate(changed, metadata(changed))

    def test_bounded_large_raw_report_archives_without_raw_prompt_or_history(self):
        large = json.loads(document())
        for index in range(450):
            large['records'].append({'kind': 'trade', 'id': f'trade-{index}',
                                     'timestamp': '2026-02-01T00:00:00Z', 'profit': '-1', 'symbol': 'SYNTHETIC'})
        raw = json.dumps(large, indent=3)
        self.assertGreater(len(raw), 60000)
        _, _, url, data, source, _ = self.save(document=raw)
        self.assertEqual(source.payload['document'], raw)
        self.assertLess(len(json.dumps(for_source(source)['execution_summary'])), 90000)
        self.assertNotIn(raw, prompt(AIRun.objects.get(source=source)))
        next_saved = self.client.post(url, {**data, 'request_key': 'next_execution_evidence_01'}, format='json')
        self.assertEqual(next_saved.status_code, 200, next_saved.data)
        next_run = AIRun.objects.get(source_id=next_saved.data['data']['source']['id'])
        self.assertNotIn(raw, prompt(next_run))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_input_formats_limits_legacy_and_permission(self):
        entry, _, url, data = self.prepare()
        raw = self.input(data)
        invalid = [dict(raw, document_format='html'), dict(raw, mode='configuration'),
                   dict(raw, execution_options_json='{"timezone":"UTC","timezone":"Asia/Shanghai"}'),
                   dict(raw, execution_options_json='{"unexpected":true}'),
                   dict(raw, execution_adapter='generic-html'), dict(raw, document='x' * 1048577)]
        for bad in invalid:
            with self.subTest(bad=list(bad)), self.assertRaises(ValidationError):
                serializer = FeedbackInput(data=bad); serializer.is_valid(raise_exception=True)
        self.assertEqual(self.client.post(url, {**data, 'document': 'a' * 60001}, format='json').status_code, 400)
        other = get_user_model().objects.create_user('execution-other')
        self.client.force_authenticate(other)
        self.assertIn(self.client.post(url + 'preview/', raw, format='json').status_code, (403, 404))
        self.assertIn(self.client.post(url, raw, format='json').status_code, (403, 404))
        self.assertEqual(SourceRevision.objects.count(), 1)

    def test_actual_parameters_compared_to_fixed_mql_defaults_without_filling_missing(self):
        self.payload.update(language='mql4', code='input int N=20;\ninput int n=30;\ninput double Lots=0.1;')
        _, target, _, _, source, _ = self.save(analyze=False)
        compared = for_source(source)['execution_parameter_comparison']
        self.assertEqual(compared['source_id'], target.pk)
        self.assertEqual(compared['rows'][0]['name'], 'N')
        self.assertEqual(compared['rows'][0]['configured']['value'], 10)
        self.assertEqual(compared['rows'][0]['default']['value'], 20)
        self.assertEqual(compared['rows'][0]['status'], 'different')
        self.assertEqual([row['name'] for row in compared['missing']], ['n', 'Lots'])
        self.assertEqual(len(for_source(source)['execution_summary']['parameters']), 1)

    def test_timestamp_anomaly_cannot_replace_actual_mismatch_counter_evidence(self):
        raw = json.loads(document()); raw['metadata']['timezone'] = ''
        for row in raw['records']:
            row['timestamp'] = row['timestamp'].removesuffix('Z')
        _, _, _, _, source, _ = self.save(document=json.dumps(raw), analyze=False)
        context = for_source(source)
        value = analysis(context)
        self.assertEqual(context['execution_summary']['status'], 'mismatch')
        self.assertTrue(validate_analysis(value, context))
        value['execution_assessment']['findings'][0]['refs'] = [context['execution_summary']['anomalies']['examples'][0]['ref']]
        with self.assertRaises(ValidationError): validate_analysis(value, context)

    def test_rehashed_report_and_run_cannot_forge_computed_summary(self):
        from quant.feedback.contracts import markdown
        _, _, _, _, source, _ = self.save()
        run = self.finish(source)
        snapshot = SyncManager().build_snapshot_data()
        altered = copy.deepcopy(snapshot)
        run_row = next(row for row in altered if row['model'] == 'quant.airun' and row['pk'] == run.pk)
        result = run_row['fields']['result']
        result['execution_summary']['metrics']['net_profit']['value'] = '9999'
        self.assertEqual(validate_analysis(result), result)  # Structurally plausible first pass.
        report = next(row['fields'] for row in altered if row['model'] == 'quant.researchreport' and row['fields']['run'] == run.pk)
        report.update(data=copy.deepcopy(result), markdown=markdown(result))
        report['content_hash'] = digest({'schema_version': 5, 'data': report['data'], 'markdown': report['markdown']})
        with self.assertRaises(SyncError): validate(altered, metadata(altered))


class ExecutionPlanningTests(TestCase):
    setUp = fixtures.FeedbackExperimentTests.setUp
    collect = fixtures.FeedbackExperimentTests.collect
    publish = fixtures.FeedbackExperimentTests.publish
    prepare = fixtures.FeedbackExperimentTests.prepare
    start = fixtures.FeedbackExperimentTests.start

    def test_accounting_ref_plan_runs_real_local_experiment_and_restores(self):
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.experiments.worker import execute as calculate
        candidate, dataset = self.prepare()
        url = f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/'
        raw = json.loads(document())
        raw['records'][0].update(id='r' * 80, balance='979')
        raw = json.dumps(raw)
        long_ref = 'accounting:reconciliation:' + 'r' * 80
        saved = self.client.post(url, {'request_key': 'execution_plan_0001', 'title': '平台核算失败复核',
            'target_source_id': candidate.report.source_id, 'document_format': 'json', 'document': raw,
            'execution_adapter': 'standard-execution-json-v1', 'execution_options_json': '{}'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        run = AIRun.objects.get(kind='feedback_review')
        context = for_run(run); value = analysis(context); parent = options(context)[0]
        value['feedback_proposal'] = {'name': '费用与参数反证', 'hypothesis': '参数变化不能稳定解释平台负收益',
            'falsification': '新行情不同成本下符号不稳', 'data_requirement': '同口径全新行情',
            'evidence_refs': ['feedback', 'accounting:net_profit', long_ref,context['execution_parameter_comparison']['ref']],
            'seeds': [{'candidate_id': parent['id'], 'variants': [[{'name': 'N', 'value': 10}]]}],
            'config': {'seed': 42, 'max_candidates': 4, 'generations': 2, 'threshold': 0, 'fee_bps': 5,
                       'slippage_bps': 5, 'gap': 2, 'seconds': 5}}
        if run.planning_context.get('library_memory') is not None:
            value.update(memory_note='保留成本与失败证据', memory_assessment=[])
        with patch('quant.worker.complete', return_value=json.dumps(value)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        proposal = ExperimentProposal.objects.get(run=run)
        self.assertIn(context['execution_parameter_comparison']['ref'],proposal.data['evidence_refs'])
        self.assertIn('accounting:net_profit', proposal.data['evidence_refs'])
        self.assertIn(long_ref, proposal.data['evidence_refs'])
        self.assertFalse(ExperimentJob.objects.exists())
        self.input = experiment_input(proposal, dataset.pk, 'execution_adopt_0001')
        request = self.start(); calculate(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        self.assertTrue(any(row.attempt.get('requested_parameters') == {'N': 10} for row in request.checkpoints.all()))
        next_saved = self.client.post(url, {'request_key': 'execution_plan_history_0002', 'title': '第二份失败反馈',
            'target_source_id': candidate.report.source_id, 'document_format': 'json', 'document': document(),
            'execution_adapter': 'standard-execution-json-v1', 'execution_options_json': '{}'}, format='json')
        self.assertEqual(next_saved.status_code, 200, next_saved.data)
        next_run = AIRun.objects.get(source_id=next_saved.data['data']['source']['id'])
        memory = for_run(next_run)['research_memory']['library_memory']['items']
        historical = [row['evidence']['feedback'] for row in memory if row['kind'] == 'feedback']
        self.assertTrue(historical)
        self.assertTrue(all('document' not in row and 'execution_summary' in row for row in historical))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists())

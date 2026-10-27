"""Ordinary paste analysis must bind lexical inputs, without a dependency upload."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from quant import test_research_analysis as fixtures
from quant.test_factors import extracted
from quant.models import AIRun, FactorCandidate, ResearchReport, WorkflowStep, Job
from quant.parameters.inventory import build
from quant.research.contracts import digest
from quant.sync import validate, metadata
from quant.worker import execute
from utils.sync_manager import SyncManager, SyncError


class SingleParameterIdentityTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect

    def complete(self, value):
        entry = self.collect(); run = AIRun.objects.get(entry=entry)
        with patch('quant.worker.complete', return_value=json.dumps(value)) as model: execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        return run, model

    def test_plain_paste_separates_function_parameters_and_restores_without_execution(self):
        self.payload.update(language='python', code='def fast(close, N=5): return close / close.shift(N) - 1\n'
            'def slow(close, N=20): return close / close.shift(N) - 1\n')
        entry = self.collect(); run = AIRun.objects.get(entry=entry)
        self.assertEqual(run.workflow_version, 25)
        inventory = build(run.source.payload, 2)
        rows = [row for row in inventory['declarations'] if row['source_name'] == 'N']
        self.assertEqual([row['scope'] for row in rows], ['<module>/fast#1', '<module>/slow#1'])
        response = extracted(); response['parameters'] = []; factors = []
        for row in rows:
            parameter = {**copy.deepcopy(fixtures.result()['parameters'][0]), 'name': row['symbol'], 'binding_id': row['id'],
                'default_value': str(row['literal']['value']), 'evidence': f"N={row['literal']['value']}"}
            response['parameters'].append(parameter)
            factor = copy.deepcopy(extracted()['factors'][0]); factor['name'] = row['scope']
            factor['parameters'] = [copy.deepcopy(parameter)]
            factor['expression']['args'][0]['args'][1]['args'][1]['name'] = row['symbol']; factors.append(factor)
        response['factors'] = factors
        with patch('quant.worker.complete', return_value=json.dumps(response)) as model: execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(model.call_count, 6)
        self.assertEqual(len(FactorCandidate.objects.all()), 2)
        self.assertEqual([row['source_binding']['scope'] for row in run.result['parameters']], [row['scope'] for row in rows])
        self.assertEqual([row['default_value'] for row in run.result['parameters']], ['5', '20'])
        self.assertEqual(len({row['name'] for row in run.result['parameters']}), 2)
        self.assertIn('fast#1', run.report.markdown); self.assertIn('slow#1', run.report.markdown)
        saved = SyncManager().build_snapshot_data(); WorkflowStep.objects.all().delete()
        validate(saved, metadata(saved))
        bad = copy.deepcopy(saved)
        outcome = next(row for row in bad if row['model'] == 'quant.workflowoutcome'
            and 'parameter_inventory' in row['fields']['data']['output'])
        outcome['fields']['data']['output']['parameter_inventory']['declarations'][1]['scope'] = '<module>/slow#1'
        outcome['fields']['content_hash'] = digest(outcome['fields']['data'])
        with self.assertRaises(SyncError): validate(bad, metadata(bad))
        with patch('quant.worker.complete', side_effect=AssertionError('restore cannot call provider')):
            SyncManager().apply_snapshot_data(saved, remote_meta=metadata(saved))
        self.assertFalse(Job.objects.exists())

    def test_new_comparison_ignores_origin_but_keeps_old_report_and_candidate_hashes(self):
        with patch('quant.workflows.contracts.VERSION', 21): first, _ = self.complete(extracted())
        self.payload['request_key'] = 'single_legacy21_other_01'
        with patch('quant.workflows.contracts.VERSION', 21): second, _ = self.complete(extracted())
        old = copy.deepcopy(second.result); old_hash = second.report.content_hash
        self.assertEqual(second.workflow_steps.get(stage='compare').outcome.data['output']['matches'][0]['items'][0]['basis'], 'shared_declared_family')
        self.payload['request_key'] = 'single_current23_next01'
        current, _ = self.complete(extracted())
        comparison = current.workflow_steps.get(stage='compare').outcome.data['output']
        self.assertEqual(comparison['method'], 'bounded-structure-family-v2')
        self.assertTrue(all(row['basis'] == 'same_expression_contract' for row in comparison['matches'][0]['items']))
        from quant.workflows.comparison import match
        parent = FactorCandidate.objects.get(report__run=first)
        changed = copy.deepcopy(parent.data); changed['parameters'][0]['default_value'] = '25'
        self.assertEqual(match(changed, parent.data, parent.pk, parent.content_hash, 23)['basis'], 'shared_declared_family')
        self.assertEqual(second.result, old); self.assertEqual(ResearchReport.objects.get(run=second).content_hash, old_hash)
        from quant.factors.expression import expression_hash
        for candidate in FactorCandidate.objects.all(): self.assertEqual(candidate.expression_hash, expression_hash(candidate.data))
        snapshot = SyncManager().build_snapshot_data(); WorkflowStep.objects.all().delete(); validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete', side_effect=AssertionError('offline')):
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(AIRun.objects.get(pk=first.pk).workflow_version, 21)

    def test_mql_and_pine_inputs_and_dynamic_defaults_use_same_plain_entry(self):
        for index, language, code, default in [(0, 'mql4', 'input int N=20;\n', '20'),
                (1, 'pine', 'N=input(20)\n', '20'), (2, 'python', 'N=load_config()\n', ''),
                (3, 'pine', 'N=input(20)*2\n', '')]:
            with self.subTest(language=language, code=code):
                self.payload.update(language=language, code=code, request_key=f'single_parameter_case_{index:02}')
                response = fixtures.result(); response['parameters'][0]['default_value'] = default
                run, _ = self.complete(response)
                self.assertEqual(run.workflow_version, 25)
                self.assertEqual(run.result['parameters'][0]['source_binding']['status'], 'resolved')
                self.assertEqual(run.result['parameters'][0]['default_value'], default)

    def test_plain_entry_rejects_model_default_that_contradicts_source(self):
        entry = self.collect(); run = AIRun.objects.get(entry=entry)
        response = fixtures.result(); response['parameters'][0]['default_value'] = '99'
        with patch('quant.worker.complete', return_value=json.dumps(response)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'failed')
        self.assertEqual(run.workflow_steps.last().stage, 'parameters')
        self.assertFalse(ResearchReport.objects.filter(run=run).exists())
        self.collect(); self.assertEqual(AIRun.objects.count(), 1)

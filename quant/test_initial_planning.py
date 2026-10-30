"""Source → report → initial proposal → local experiment, with no prior experiment."""
from quant.testing_reading import read_fixture
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant import test_research_analysis as fixtures
from quant.test_factors import extracted
from quant.test_experiment_search import data as market_data
from quant.research.analysis import validate_analysis
from quant.experiments.datasets import create_dataset
from quant.experiments.campaigns.contracts import experiment_input
from quant.experiments.worker import execute as calculate
from quant.models import AIRun, ResearchReport, FactorCandidate, ExperimentProposal, ExperimentJob, ExperimentRequest
from quant.worker import execute
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager, SyncError


def initial_response():
    result = extracted()
    result.update(initial_planning_version=1, initial_planning_note='使用源码默认窗口与邻域，费用为实验假设，非实际账户配置。',
        initial_proposal={'name': '首轮窗口稳定性', 'hypothesis': '邻近窗口方向一致', 'falsification': '方向反复或成本后优势消失',
            'data_requirement': '一致价格口径的日线行情，足够覆盖窗口和分区', 'evidence_refs': ['factor:0'],
            'seeds': [{'factor_index': 0, 'bindings': [{'name': 'close', 'column': 'close'}],
                'variants': [[{'name': 'N', 'value': value}] for value in (15, 25)]}],
            'config': {'seed': 42, 'max_candidates': 8, 'generations': 1, 'threshold': 0,
                'fee_bps': 5, 'slippage_bps': 5, 'gap': 2, 'seconds': 5}})
    return result


class InitialPlanningTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect

    def ready(self, value=None):
        entry = self.collect()
        run = AIRun.objects.get()
        response = value or initial_response()
        from quant.repairs.contracts import plan as repair_plan
        targets = repair_plan(response['factors'])['selected']
        def answer(config, prompt, **kwargs):
            if '只完成“修订候选定义”' in prompt:
                return json.dumps({'items': [{'factor_index': i, 'status': 'unresolved', 'summary': '测试保留缺失配置', 'definition': None, 'evidence': [], 'remaining_unknowns': ['参数待补齐']} for i in targets]})
            return json.dumps(response)
        with patch('quant.worker.complete', side_effect=answer) as model:
            execute(run.pk)
        self.assertEqual(model.call_count, 7 if targets else 6)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        return entry, run

    def dataset(self):
        rows = market_data()['rows']
        fields = ('timestamp', 'open', 'high', 'low', 'close', 'volume')
        csv = ','.join(fields) + '\n' + '\n'.join(','.join(str(row[key]) for key in fields) for row in rows)
        return create_dataset(self.collection, {'name': 'Synthetic initial test', 'csv_text': csv,
            'symbol': 'TEST', 'timeframe': '1d', 'timezone': 'UTC', 'source': 'synthetic', 'price_adjustment': 'none'})

    def test_initial_report_publishes_exact_plan_without_executing_and_survives_restore(self):
        entry, run = self.ready()
        proposal = ExperimentProposal.objects.get(run=run)
        candidate = FactorCandidate.objects.get()
        self.assertEqual(proposal.data['origin'], 'source_analysis')
        self.assertEqual(proposal.data['seeds'][0]['id'], candidate.pk)
        self.assertEqual(proposal.data['seeds'][0]['parameters'], {'N': 20})
        self.assertEqual(proposal.data['seeds'][0]['variants'], [{'N': 15}, {'N': 25}])
        self.assertFalse(ExperimentJob.objects.exists())
        detail = read_fixture(self.client, f'/api/quant/{self.collection.pk}/entries/{entry.pk}/')
        self.assertEqual(detail['reports'][0]['proposal']['id'], proposal.pk)
        self.assertIn('首轮实验规划', detail['reports'][0]['markdown'])
        dataset = self.dataset()
        response = self.client.post(f'/api/quant/{self.collection.pk}/experiments/',
            experiment_input(proposal, dataset.pk, 'initial_experiment_0001'), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        request = ExperimentRequest.objects.get(pk=response.data['data']['id'])
        self.assertFalse(request.plan['proposal_adapted'])
        calculate(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        self.assertEqual(request.plan['seeds'][0]['parameters'], {'N': 20})
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(ExperimentProposal.objects.get(pk=proposal.pk).data, proposal.data)
        self.assertFalse(ExperimentJob.objects.exists())

    def test_initial_proposal_can_start_campaign_without_previous_experiment(self):
        self.ready()
        proposal, dataset = ExperimentProposal.objects.get(), self.dataset()
        response = self.client.post(f'/api/quant/{self.collection.pk}/campaigns/', {
            'request_key': 'initial_campaign_0001', 'name': '首轮连续研究', 'proposal_id': proposal.pk,
            'dataset_ids': [dataset.pk], 'max_rounds': 1, 'max_attempts': 8, 'compute_seconds': 5,
            'wall_seconds': 120, 'model_id': self.model.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        from quant.models import ResearchCampaignJob
        from quant.experiments.campaigns.worker import advance
        job = ResearchCampaignJob.objects.get()
        self.assertTrue(advance(job.pk, job.lease_token))
        request = ExperimentRequest.objects.get()
        self.assertEqual(request.plan['proposal_id'], proposal.pk)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_missing_defaults_unmapped_inputs_wrong_types_and_fabricated_factors_rejected(self):
        invalid = []
        for default in ('', 'unknown', 'None', 'true', '20.5', 'null', 'NaN', '"20"'):
            row = initial_response(); row['factors'][0]['parameters'][0]['default_value'] = default; invalid.append(row)
        for index in (-1, True, 1, '0'):
            row = initial_response(); row['initial_proposal']['seeds'][0]['factor_index'] = index; invalid.append(row)
        for column in ('future', '', 'Close'):
            row = initial_response(); row['initial_proposal']['seeds'][0]['bindings'][0]['column'] = column; invalid.append(row)
        for variant in (True, 2001, 0, 20, 4.5, '15'):
            row = initial_response(); row['initial_proposal']['seeds'][0]['variants'][0][0]['value'] = variant; invalid.append(row)
        row = initial_response(); row['initial_proposal']['evidence_refs'] = ['execution']; invalid.append(row)
        row = initial_response(); row['initial_proposal']['config']['max_candidates'] = 1; invalid.append(row)
        row = initial_response(); row['initial_proposal']['seeds'] *= 2; invalid.append(row)
        row = initial_response(); row['factors'][0]['expression'] = None; invalid.append(row)
        row = initial_response(); row['factors'][0]['role'] = 'display'; invalid.append(row)
        for row in invalid:
            with self.subTest(value=row['initial_proposal']), self.assertRaises(ValidationError):
                validate_analysis(row)
        self.collect()
        with patch('quant.worker.complete', return_value=json.dumps(invalid[-1])):
            execute(AIRun.objects.get().pk)
        self.assertEqual(AIRun.objects.get().status, 'failed')
        self.assertFalse(ResearchReport.objects.exists())
        self.assertFalse(ExperimentProposal.objects.exists())

    def test_explicit_no_plan_and_legacy_results_remain_valid(self):
        row = initial_response(); row['initial_proposal'] = None
        self.payload['code'] = self.payload['code'].replace('N=20', 'N=load_config()')
        row['parameters'][0]['default_value'] = ''
        row['factors'][0]['parameters'][0]['default_value'] = ''
        self.ready(row)
        self.assertFalse(ExperimentProposal.objects.exists())
        self.assertIn('initial_planning_note', ResearchReport.objects.get().data)
        legacy = extracted()
        for key in ('initial_planning_version', 'initial_planning_note', 'initial_proposal'):
            legacy.pop(key)
        self.assertNotIn('initial_proposal', validate_analysis(legacy))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_missing_or_forged_initial_proposal_rejected_even_with_rehashed_snapshot(self):
        self.ready()
        original = SyncManager().build_snapshot_data()
        missing = [row for row in original if row['model'] != 'quant.experimentproposal']
        with self.assertRaises(SyncError): validate(missing, metadata(missing))
        forged = copy.deepcopy(original)
        proposal = next(row['fields'] for row in forged if row['model'] == 'quant.experimentproposal')
        proposal['data']['seeds'][0]['parameters']['N'] = 99
        from quant.research.contracts import digest
        proposal['content_hash'] = digest(proposal['data'])
        with self.assertRaises(SyncError): validate(forged, metadata(forged))

"""Opt-in real-data acceptance, no network, real credentials or native execution.

Run explicitly with QUANT_MARKET_ACCEPTANCE_DIR pointing to the documented
official bundle. Source analysis is a declared fake; financial inputs are real.
"""
import json
import os

from django.conf import settings
from django.db import connection
from django.test import TestCase
from quant import test_factor_curation as source_fixture
from quant.acceptance.market_reference import ledger
from quant.acceptance.market_bundle import ARCHIVE_SHA, CSV_SHA, SOURCE, read_bundle
from quant.experiments.worker import execute
from quant.experiments.review_evidence import for_result
from quant.models import ExperimentRequest, ExperimentCheckpoint, ExperimentJob, MarketDataset
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager

def bundle():
    location = os.environ.get('QUANT_MARKET_ACCEPTANCE_DIR')
    if not location:
        raise ValueError('显式设置 QUANT_MARKET_ACCEPTANCE_DIR；缺真实数据不能算验收通过')
    return read_bundle(location)


class OfficialMarketAcceptance(TestCase):
    setUp = source_fixture.CurationTests.setUp
    collect = source_fixture.CurationTests.collect
    publish = source_fixture.CurationTests.publish

    def assert_metrics(self, actual, expected):
        for key, reference in expected.items():
            if key == 'curve':
                self.assertEqual(len(actual[key]), len(reference))
                for observed, wanted in zip(actual[key], reference):
                    self.assertEqual(observed['timestamp'], wanted['timestamp'])
                    self.assertAlmostEqual(observed['equity'], wanted['equity'], delta=2e-11)
            elif key == 'returns':
                self.assertEqual(len(actual[key]), len(reference))
                for observed, wanted in zip(actual[key], reference):
                    self.assertAlmostEqual(observed, wanted, delta=2e-11)
            elif isinstance(reference, float):
                self.assertAlmostEqual(actual[key], reference, delta=2e-11, msg=key)
            else:
                self.assertEqual(actual[key], reference, key)

    def test_import_search_decimal_ledger_evidence_and_restore(self):
        self.assertEqual(settings.DATABASES['default']['ENGINE'], 'django.db.backends.sqlite3')
        self.assertTrue(connection.creation.is_in_memory_db(connection.settings_dict['NAME']))
        self.assertTrue(settings.QUANT_DISABLE_WORKERS)
        root, text, rows = bundle()
        candidate = self.publish('real_market_fixture_00001')
        response = self.client.post(f'/api/quant/{self.collection.pk}/datasets/', {
            'name':'Official BTCUSDT 2024-01 1h acceptance', 'csv_text':text,
            'symbol':'BTCUSDT', 'timeframe':'1h', 'timezone':'UTC',
            'price_adjustment':'spot raw OHLCV; no equity adjustment', 'source':SOURCE}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        dataset = MarketDataset.objects.get()
        self.assertEqual(len(dataset.snapshot['rows']), 744)
        self.assertEqual(dataset.raw_csv, text)
        config = {'seed':123, 'max_candidates':12, 'generations':1, 'threshold':0,
                  'fee_bps':5, 'slippage_bps':5, 'gap':2, 'seconds':30,
                  'walk_forward':{'version':1,'mode':'expanding','folds':3,
                                  'train_bars':200,'validation_bars':80,'test_bars':80,'warmup_bars':20}}
        response = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', {
            'request_key':'official_market_acceptance_0001','name':'真实数据独立账本核对', 'dataset_id':dataset.pk,
            'seeds':[{'candidate_id':candidate.pk,'bindings':[{'name':'close','column':'close'}],
                      'parameters':[{'name':'N','value':5}],
                      'variants':[[{'name':'N','value':n}] for n in (3,8,0)]}], 'config':config}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        request = ExperimentRequest.objects.get()
        execute(request.job.pk)
        result = request.result
        self.assertEqual(result.data['status'], 'completed', result.data['error'])
        output = result.data['output']
        attempts = output['attempts']
        self.assertEqual(len(attempts), 12)
        self.assertEqual(sum(a['status']=='evaluated' for a in attempts), 9)
        self.assertEqual(sum(a['status']=='rejected' for a in attempts), 3)
        self.assertEqual(ExperimentCheckpoint.objects.filter(request=request).count(), 12)
        folds = output['walk_forward']['folds']
        self.assertEqual(len(folds), 3)
        for index, fold in enumerate(folds):
            split = {'train':[217,417+80*index], 'validation':[420+80*index,500+80*index],
                     'holdout':[503+80*index,583+80*index]}
            self.assertEqual(fold['calculation_start'], 196)
            self.assertEqual(fold['partitions'], split)
            scoped = [a for a in attempts if a['fold']==index+1]
            for attempt in scoped:
                window = attempt['requested_parameters']['N']
                self.assertNotIn('holdout', attempt['metrics'])
                if not window:
                    self.assertEqual(attempt['status'], 'rejected')
                    self.assertTrue(attempt['reason'])
                    continue
                for part in ('train','validation'):
                    reference = ledger(rows, *split[part], window)
                    self.assert_metrics(attempt['metrics'][part], {k:v for k,v in reference.items() if k not in ('curve','returns')})
            selected = next(a for a in scoped if a['id']==fold['selected_id'])
            window = selected['requested_parameters']['N']
            self.assert_metrics(fold['holdout'], ledger(rows, *split['holdout'], window))
            self.assert_metrics(fold['buy_hold_baseline'], ledger(rows, *split['holdout'], window, baseline=True))
        frozen = for_result(result)
        self.assertFalse(frozen['independent_holdout_proven'])
        self.assertEqual(frozen['evidence']['dataset']['row_count'], 744)
        for attempt in attempts:
            self.assertEqual(frozen['evidence'][attempt['id']]['status'], attempt['status'])
        from quant.research.contracts import digest
        fingerprint = digest(result.data)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        request.refresh_from_db()
        self.assertEqual(digest(request.result.data), fingerprint)
        self.assertEqual(MarketDataset.objects.get().raw_csv, text)
        self.assertFalse(ExperimentJob.objects.exists())
        packet = {'source':SOURCE,'archive_sha256':ARCHIVE_SHA,'normalized_csv_sha256':CSV_SHA,
                  'row_count':744,'source_analysis':'synthetic_fixture_not_real_ai',
                  'scope':'controlled_momentum_expression_next_open_long_flat_not_native_platform',
                  'reference':'independent_decimal_ledger_45_digits','tolerance':2e-11,
                  'request':request.plan,'outcome':request.result.data,'result_hash':fingerprint,
                  'checks':['pinned_archive_checksum','lossless_csv_conversion','api_import','three_folds','all_12_attempts','all_18_development_metric_sets',
                            'three_holdout_ledgers','three_cost_matched_baselines','frozen_review_evidence',
                            'snapshot_roundtrip','no_execution_authority_restored']}
        with (root/'acceptance-result.json').open('x') as stream:
            json.dump(packet, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write('\n')

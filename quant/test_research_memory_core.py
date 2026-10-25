"""Pure history contracts preserve negative evidence and enforce causal provenance."""
import copy
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from django.test import SimpleTestCase, override_settings
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.research_memory.contract import select, summary, amount, MAX_CHARS
from quant.research_memory.rows import validate_from_rows

BEFORE = '2026-01-03T00:00:00+00:00'
EARLIER = '2026-01-02T00:00:00+00:00'
ORIGINAL = '2026-01-01T00:00:00+00:00'


def fixture():
    candidate = {'name': '动量', 'family': 'momentum', 'tags': ['趋势'], 'formula': 'close/lag(close,N)-1',
        'expression': {'op': 'input', 'name': 'close'}, 'output_type': 'numeric_series', 'units': 'ratio'}
    seed = {'id': 'factor', 'candidate': candidate, 'bindings': {'close': 'close'}, 'parameters': {'N': 10}, 'variants': []}
    plan = {'name': '旧研究', 'dataset_hash': 'market-hash', 'engine_version': 'quant-local-search-2', 'seeds': [seed],
        'config': {'fee_bps': 2, 'slippage_bps': 3, 'threshold': 0}}
    checkpoint = {'id': 'attempt-1', 'parents': ['factor'], 'operation': 'source_candidate', 'generation': 0,
        'requested_parameters': {'N': 10}, 'status': 'evaluated', 'reason': '',
        'metrics': {'train': {'total_return': -.1, 'max_drawdown': .2},
                    'validation': {'total_return': -.2}, 'holdout': {'total_return': 999}},
        'recipe': {'expression': candidate['expression'], 'bindings': {'i0': 'close'}, 'parameters': {'p0': 10},
            'parameter_names': {'p0': 'N'}, 'output_type': 'numeric_series', 'units': 'ratio'}}
    stopped = {**copy.deepcopy(checkpoint), 'id': 'attempt-2', 'status': 'rejected', 'reason': '缺少预热数据', 'metrics': {}}
    data = {'status': 'completed', 'error': '', 'checkpoint_hashes': [digest(checkpoint), digest(stopped)],
        'output': {'holdout': {'total_return': 999, 'curve': ['large omitted']}, 'selected_id': 'attempt-1'}}
    target = {'provenance': 'intake', 'code': 'indicator()'}
    feedback = {'provenance': 'external_feedback', 'feedback_version': 1, 'title': '负面用户报告',
        'target_source_id': 'target', 'factor_id': 'factor', 'experiment_result_id': '',
        'document': '经测试出现亏损，全部记录保留。', 'mode': 'backtest', 'document_format': 'text',
        'platform': 'MT4', 'notes': '不适用当前品种', 'request_fingerprint': 'x' * 64}
    rows = {'quant.entry': {'entry': {'anthology': 'collection', 'is_valid': True}},
        'quant.sourcematerial': {'material': {'entry': 'entry'}},
        'quant.sourcerevision': {'target': {'material': 'material', 'payload': target, 'content_hash': digest(target), 'created_at': ORIGINAL},
            'feedback': {'material': 'material', 'payload': feedback, 'content_hash': digest(feedback), 'created_at': EARLIER}},
        'quant.researchreport': {'report': {'source': 'target', 'entry': 'entry'}},
        'quant.factorcandidate': {'factor': {'report': 'report', 'data': candidate, 'created_at': ORIGINAL}},
        'quant.marketdataset': {'dataset': {'anthology': 'collection', 'content_hash': 'market-hash',
            'snapshot': {'symbol': 'TEST', 'timeframe': '1d', 'timezone': 'UTC', 'price_adjustment': 'none', 'source': 'synthetic',
                'rows': [{'timestamp': ORIGINAL}, {'timestamp': EARLIER}]}}},
        'quant.experimentrequest': {'request': {'anthology': 'collection', 'dataset': 'dataset', 'plan': plan,
            'content_hash': digest(plan), 'created_at': ORIGINAL}},
        'quant.experimentresult': {'result': {'request': 'request', 'data': data, 'content_hash': digest(data), 'created_at': EARLIER}},
        'quant.experimentcheckpoint': {'c1': {'request': 'request', 'ordinal': 1, 'attempt': checkpoint, 'content_hash': digest(checkpoint)},
            'c2': {'request': 'request', 'ordinal': 2, 'attempt': stopped, 'content_hash': digest(stopped)}}}
    return rows, [{key: copy.deepcopy(seed[key]) for key in ('id', 'candidate', 'bindings', 'parameters')}]


def freeze_rows(rows, options, **kwargs):
    from quant.research_memory.rows import RowReader
    reader = RowReader(rows)
    records = [reader.experiment('result'), reader.feedback('feedback')]
    return select(records, options, collection_id='collection', cutoff=BEFORE,
        scanned={'experiments': 1, 'feedback': 1}, **kwargs)


class ResearchMemoryCoreTests(SimpleTestCase):
    @override_settings(USE_TZ=False, TIME_ZONE='Asia/Shanghai')
    def test_project_naive_dates_use_application_timezone_and_restore_equivalently(self):
        from quant.research_memory.contract import instant
        self.assertEqual(instant('2026-01-03T08:00:00').isoformat(), BEFORE)
        self.assertEqual(instant('2026-01-03T08:00:00.123987').isoformat(), '2026-01-03T00:00:00.123000+00:00')
        rows, options = fixture()
        for values in rows.values():
            for row in values.values():
                if 'created_at' in row:
                    row['created_at'] = instant(row['created_at']).astimezone(
                        ZoneInfo('Asia/Shanghai')).replace(tzinfo=None).isoformat()
        frozen = freeze_rows(rows, options)
        self.assertEqual(frozen['items'][0]['created_at'], EARLIER)
        validate_from_rows(frozen, rows, collection_id='collection', latest_at='2026-01-03T08:00:00', options=options)

    def test_facts_keep_every_attempt_and_verbatim_feedback_without_holdout_or_curves(self):
        rows, options = fixture(); original = copy.deepcopy((rows, options))
        frozen = freeze_rows(rows, options)
        validate_from_rows(frozen, rows, collection_id='collection', latest_at=BEFORE, options=options)

        experiment, feedback = frozen['items']
        self.assertTrue(experiment['has_negative_evidence'])
        self.assertEqual([row['id'] for row in experiment['evidence']['attempts']], ['attempt-1', 'attempt-2'])
        self.assertEqual(experiment['evidence']['attempts'][1]['reason'], '缺少预热数据')
        self.assertEqual(experiment['evidence']['attempts'][0]['actual_parameters'], {'p0': 10})
        self.assertEqual(experiment['evidence']['attempts'][0]['formula']['parameter_names'], {'p0': 'N'})
        self.assertNotIn('holdout', experiment['evidence']['attempts'][0]['metrics'])
        self.assertNotIn('999', str(experiment)); self.assertNotIn('curve', str(experiment))
        self.assertTrue(experiment['evidence']['historical_holdout_exposed'])
        self.assertEqual(feedback['evidence']['feedback']['document'], rows['quant.sourcerevision']['feedback']['payload']['document'])
        self.assertIsNone(feedback['has_negative_evidence'])
        self.assertNotIn('evidence', summary(frozen)['items'][0])
        self.assertEqual((rows, options), original)
        rows['quant.entry']['entry']['is_valid'] = False
        validate_from_rows(frozen, rows, collection_id='collection', latest_at=BEFORE, options=options)

    def test_sync_codec_millisecond_precision_reconstructs_exact_item_timestamps(self):
        from utils.sync_datetime import SyncJSONEncoder
        rows, options = fixture()
        for values in rows.values():
            for row in values.values():
                if 'created_at' in row:
                    row['created_at'] = row['created_at'].replace('+00:00', '.123987+00:00')
        frozen = freeze_rows(rows, options)
        self.assertEqual(frozen['items'][0]['created_at'], '2026-01-02T00:00:00.123000+00:00')
        serialized = copy.deepcopy(rows)
        for values in serialized.values():
            for row in values.values():
                if 'created_at' in row:
                    row['created_at'] = datetime.fromisoformat(row['created_at'])
        restored = json.loads(json.dumps(serialized, cls=SyncJSONEncoder))
        self.assertNotEqual(rows['quant.experimentresult']['result']['created_at'], restored['quant.experimentresult']['result']['created_at'])
        validate_from_rows(frozen, restored, collection_id='collection', latest_at=BEFORE, options=options)

    def test_causal_cutoff_ownership_self_reference_and_missing_facts_are_rejected(self):
        rows, options = fixture(); frozen = freeze_rows(rows, options)
        for mutate in [
            lambda memory, facts: memory.update(cutoff='2027-01-01T00:00:00+00:00'),
            lambda memory, facts: facts['quant.experimentresult']['result'].update(created_at=BEFORE),
            lambda memory, facts: facts['quant.experimentrequest']['request'].update(anthology='other'),
            lambda memory, facts: facts['quant.sourcerevision'].pop('target'),
            lambda memory, facts: memory['items'][0]['reason'].update(rank_score=999),
            lambda memory, facts: memory['items'][1]['evidence']['feedback'].update(notes='删掉负面证据'),
            lambda memory, facts: facts['quant.experimentcheckpoint'].pop('c2'),
        ]:
            memory, facts = copy.deepcopy(frozen), copy.deepcopy(rows)
            mutate(memory, facts)
            with self.assertRaises(ValidationError):
                validate_from_rows(memory, facts, collection_id='collection', latest_at=BEFORE, options=options)
        for exclusions in [{'exclude_result_id': 'result'}, {'exclude_source_id': 'feedback'}]:
            with self.assertRaises(ValidationError):
                validate_from_rows(frozen, rows, collection_id='collection', latest_at=BEFORE, options=options, **exclusions)
        for exclusions in [{'exclude_result_id': 'result'}, {'exclude_source_id': 'feedback'}]:
            value = freeze_rows(rows, options, **exclusions)
            self.assertEqual(len(value['items']), 1)

    def test_negative_slot_is_reserved_and_size_omissions_never_clip_raw_records(self):
        rows, options = fixture()
        from quant.research_memory.rows import RowReader
        negative = RowReader(rows).experiment('result')
        records = []
        for index in range(12):
            record = copy.deepcopy(negative); record.update(id=f'positive-{index:02}', has_negative_evidence=False)
            record['seeds'] = [*record['seeds'], {'id': 'extra', 'candidate': {'family': 'trend', 'tags': []}}]
            records.append(record)
        records.append(negative)
        large = copy.deepcopy(negative); large.update(id='too-large', kind='feedback', has_negative_evidence=None)
        large['evidence'] = {'document': '坏' * 35000}; records.append(large)
        kwargs = {'collection_id': 'collection', 'cutoff': BEFORE, 'scanned': {'experiments': 13, 'feedback': 1}}
        frozen = select(records, options, **kwargs)
        self.assertEqual(frozen, select(reversed(records), options, **kwargs))
        self.assertEqual(frozen['items'][0]['id'], 'result')
        self.assertEqual(len(frozen['items']), 6)
        self.assertEqual(frozen['omitted_for_size'], 1)
        self.assertLessEqual(amount(frozen), MAX_CHARS)
        self.assertEqual(large['evidence']['document'], '坏' * 35000)

    def test_matching_is_immutable_fact_relevance_and_does_not_prove_equivalence(self):
        rows, options = fixture()
        frozen = freeze_rows(rows, options)
        before = copy.deepcopy(frozen)
        rows['quant.factorcandidate']['factor']['current_revision_id'] = 'new-curation'
        rows['quant.entry']['entry']['title'] = '后来改名'
        validate_from_rows(frozen, rows, collection_id='collection', latest_at=BEFORE, options=options)
        self.assertEqual(frozen, before)
        self.assertEqual(frozen['items'][0]['reason']['shared_candidate_ids'], ['factor'])
        unrelated = copy.deepcopy(options); unrelated[0].update(id='other')
        unrelated[0]['candidate'].update(family='other', tags=[])
        self.assertFalse(freeze_rows(rows, unrelated)['items'])
        self.assertIn('not_equivalence', summary(frozen)['claim'])

    def test_failed_results_keep_partial_attempts_and_holdout_magnitude_cannot_rank_history(self):
        rows, options = fixture()
        first = freeze_rows(rows, options)
        data = rows['quant.experimentresult']['result']['data']
        data['output']['holdout']['total_return'] = -999999
        rows['quant.experimentresult']['result']['content_hash'] = digest(data)
        second = freeze_rows(rows, options)
        self.assertEqual([item['id'] for item in first['items']], [item['id'] for item in second['items']])
        self.assertEqual(first['items'][0]['reason'], second['items'][0]['reason'])
        data.update(status='failed', output=None, error='资源预算耗尽')
        rows['quant.experimentresult']['result']['content_hash'] = digest(data)
        failed = freeze_rows(rows, options)['items'][0]
        self.assertEqual(failed['evidence']['status'], 'failed')
        self.assertEqual(len(failed['evidence']['attempts']), 2)
        self.assertTrue(failed['has_negative_evidence'])

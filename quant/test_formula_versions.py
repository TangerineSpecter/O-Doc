"""Independent authored definitions, stable working heads and exact sync lineage."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from quant import test_research_analysis as fixtures
from quant import test_factor_curation as curation_fixtures
from quant.models import FactorCandidate, FactorFormulaVersion, FactorFormulaSelection, Job
from quant.sync import metadata, validate
from quant.research.contracts import digest
from quant.factors.versions.presentation import definition_json
from utils.sync_manager import SyncManager, SyncError


class FormulaVersionTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect
    publish = curation_fixtures.CurationTests.publish

    def seed(self):
        self.root = self.publish('formula_version_root001')
        self.base = f'/api/quant/{self.collection.pk}/factors/'
        self.definition = json.loads(definition_json(self.root))
        self.definition['name'] = '局部修订动量'
        self.definition['formula'] = '(close / close[N] - 1) * 2'
        self.definition['expression'] = {'op': 'mul', 'args': [self.definition['expression'], {'op': 'constant', 'value': 2}]}
        return self.root

    def edit(self, parent=None, key='formula_version_edit001', definition=None):
        parent = parent or self.root
        response = self.client.post(self.base + parent.pk + '/formula-versions/', {
            'request_key': key, 'definition_json': json.dumps(definition or self.definition), 'reason': '比较尺度变化，收益与平台尚未验证'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return FactorCandidate.objects.get(pk=response.data['data']['candidate']['id'])

    def select(self, candidate, expected='', key='formula_version_select01'):
        return self.client.post(self.base + candidate.pk + '/formula-versions/select/', {
            'request_key': key, 'expected_selection_id': expected, 'reason': '选择当前研究工作版，不是提高实证评价'}, format='json')

    def test_edit_retains_ancestor_and_can_restore_selection_without_changing_scores(self):
        root = self.seed(); before = copy.deepcopy(root.data); report = copy.deepcopy(root.report.data)
        jobs_before = Job.objects.count()
        child = self.edit()
        self.assertNotEqual(child.pk, root.pk)
        self.assertEqual(child.data['evidence'], [])
        self.assertNotIn('derivation', child.data)
        self.assertEqual(child.data['formula_version']['root_id'], root.pk)
        self.assertEqual(self.edit().pk, child.pk)
        history = self.client.get(self.base + child.pk + '/formula-versions/').json()['data']
        self.assertEqual(history['versionsTotal'], 2)
        self.assertEqual(history['currentCandidateId'], root.pk)
        grouped = self.client.get(self.base + '?groupBy=lineage').json()['data']
        self.assertEqual(grouped['total'], 1)
        self.assertEqual(grouped['items'][0]['id'], root.pk)
        selected = self.select(child)
        self.assertEqual(selected.status_code, 200, selected.data)
        pointer = selected.data['data']['current_selection_id']
        grouped = self.client.get(self.base + '?groupBy=lineage').json()['data']
        self.assertEqual(grouped['items'][0]['id'], child.pk)
        self.assertEqual(grouped['items'][0]['formulaLineage']['rootCandidateId'], root.pk)
        self.assertEqual(grouped['items'][0]['occurrenceCount'], 2)
        self.assertEqual(self.select(child).status_code, 200)
        self.assertEqual(self.select(root, key='formula_version_stale01').status_code, 409)
        reverted = self.select(root, expected=pointer, key='formula_version_revert01')
        self.assertEqual(reverted.status_code, 200, reverted.data)
        self.assertEqual(reverted.data['data']['current_candidate_id'], root.pk)
        self.assertEqual(self.client.get(self.base + '?groupBy=lineage').json()['data']['items'][0]['id'], root.pk)
        root.refresh_from_db()
        self.assertEqual(root.data, before); self.assertEqual(root.report.data, report)
        self.assertEqual(FactorFormulaSelection.objects.count(), 2)
        candidate = self.client.get(self.base + child.pk + '/').json()['data']
        self.assertEqual(candidate['modelName'], '人工公式修订')
        bundle = self.client.get(self.base + child.pk + '/export/?target=python')
        self.assertEqual(bundle.status_code, 200, bundle.data)
        self.assertEqual(Job.objects.count(), jobs_before)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(FactorFormulaVersion.objects.get(candidate=child).root_id, root.pk)
        self.assertEqual(FactorFormulaSelection.objects.count(), 2)

    def test_authored_child_is_a_real_experiment_seed_and_lineage_is_stable(self):
        self.seed(); child = self.edit()
        next_definition = copy.deepcopy(self.definition)
        next_definition['name'] = '再次修订'
        next_definition['expression'] = {'op': 'mul', 'args': [next_definition['expression'], {'op': 'constant', 'value': 3}]}
        nested = self.edit(child, key='formula_version_nested01', definition=next_definition)
        self.assertEqual(FactorFormulaVersion.objects.get(candidate=nested).root_id, self.root.pk)
        from quant.experiments.search import recipe
        from quant.experiments.expression import calculate
        data = nested.data
        spec = recipe(data, {'close': 'close'}, {'N': 20})
        values = calculate(spec['expression'], {key: list(range(1, 71)) for key in spec['bindings']}, spec['parameters'])
        self.assertIsNotNone(values[-1])
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_real_api_experiment_uses_new_formula_and_auto_registers_descendants(self):
        from quant.experiments.datasets import create_dataset
        from quant.experiments.worker import execute
        from quant import test_experiment_search as search_fixtures
        from quant.models import ExperimentRequest
        self.seed(); child = self.edit()
        rows = search_fixtures.data()['rows']
        columns = ('timestamp', 'open', 'high', 'low', 'close', 'volume')
        csv = ','.join(columns) + '\n' + '\n'.join(','.join(str(row[key]) for key in columns) for row in rows)
        dataset = create_dataset(self.collection, {'name': 'Formula fixture', 'csv_text': csv, 'symbol': 'SYNTHETIC',
            'timeframe': '1d', 'timezone': 'UTC', 'source': 'artificial test', 'price_adjustment': 'not applicable'})
        response = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', {'request_key': 'authored_experiment_0001',
            'name': '修订公式本机计算', 'dataset_id': dataset.pk, 'config': search_fixtures.SearchTests.config,
            'seeds': [{'candidate_id': child.pk, 'bindings': [{'name': 'close', 'column': 'close'}],
                'parameters': [{'name': 'N', 'value': 5}], 'variants': [[{'name': 'N', 'value': 3}], [{'name': 'N', 'value': 8}]]}]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        request = ExperimentRequest.objects.get(pk=response.data['data']['id']); execute(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        self.assertEqual(request.plan['seeds'][0]['candidate'], child.data)
        from quant.experiments.review_evidence import project
        review_context = project(request.plan, dataset.snapshot, request.result.data, request.result.data['output']['attempts'])
        self.assertEqual(review_context['evidence'][f'seed:{child.pk}']['formula_version'], child.data['formula_version'])
        self.assertEqual(review_context['evidence'][f'seed:{child.pk}']['source_role'], 'ancestor_context_not_authored_formula_source')
        side = lambda candidate: {'candidate_id': candidate.pk, 'bindings': [{'name': 'close', 'column': 'close'}],
            'parameters': [{'name': 'N', 'value': 5}]}
        compared = self.client.post(f'/api/quant/{self.collection.pk}/comparisons/', {
            'request_key': 'authored_formula_compare01', 'name': '祖先与修订公式直接对照', 'dataset_id': dataset.pk,
            'left': side(self.root), 'right': side(child), 'policy': {'absolute_tolerance': 0, 'relative_tolerance': 0, 'warmup_bars': 5}}, format='json')
        self.assertEqual(compared.status_code, 200, compared.data)
        from quant.research_memory.storage import freeze
        from quant.experiments.library_contract import option
        from django.utils import timezone
        from datetime import timedelta
        memory = freeze([option(child.pk, child.data)], self.collection.pk, before=(timezone.now() + timedelta(seconds=1)).isoformat(), version=2)
        evidence = next(row['evidence'] for row in memory['items'] if row['kind'] == 'comparison')
        self.assertEqual(evidence['sides']['right']['source_role'], 'ancestor_context_not_authored_formula_source')
        self.assertEqual(evidence['sides']['right']['formula_version'], child.data['formula_version'])
        descendants = list(FactorCandidate.objects.exclude(derived_checkpoint_id=''))
        self.assertTrue(descendants)
        for descendant in descendants:
            version = FactorFormulaVersion.objects.get(pk=descendant.formula_version_id)
            self.assertEqual(version.root_id, self.root.pk)
            self.assertEqual(version.data['parents'], [{'id': child.pk, 'hash': child.content_hash}])
        graph = self.client.get(f'/api/quant/{self.collection.pk}/graph/?candidateId={child.pk}').json()['data']
        self.assertTrue(any(edge['label'] == '公式修订' for edge in graph['edges']))
        self.assertFalse(any(edge['kind'] == 'extracted_from' and edge['to'] == f'factor:{child.pk}' for edge in graph['edges']))
        self.assertEqual(self.client.get(self.base + child.pk + '/').json()['data']['fingerprints']['raw'], '')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_request_conflicts_invalid_ir_permissions_and_history_bounds(self):
        self.seed(); child = self.edit()
        wrong = copy.deepcopy(self.definition); wrong['name'] = 'different'
        reply = self.client.post(self.base + self.root.pk + '/formula-versions/', {
            'request_key': 'formula_version_edit001', 'definition_json': json.dumps(wrong), 'reason': 'different'}, format='json')
        self.assertEqual(reply.status_code, 409)
        for bad in ('{broken', json.dumps(dict(self.definition, expression={'op': 'exec', 'args': []})),
                json.dumps(dict(self.definition, evidence=[{'quote': 'fake'}])), definition_json(child)):
            reply = self.client.post(self.base + child.pk + '/formula-versions/', {
                'request_key': 'formula_version_invalid1', 'definition_json': bad, 'reason': 'invalid'}, format='json')
            self.assertEqual(reply.status_code, 400)
        self.assertEqual(self.client.get(self.base + child.pk + '/formula-versions/?limit=1').json()['data']['versionsTotal'], 2)
        self.assertEqual(len(self.client.get(self.base + child.pk + '/formula-versions/?offset=1&limit=1').json()['data']['versions']), 1)
        other = self.publish('formula_independent_root01')
        self.assertEqual(self.client.get(self.base + '?groupBy=lineage').json()['data']['total'], 2)
        selected = self.select(other, key='formula_other_root_head01')
        self.assertEqual(selected.status_code, 200, selected.data)
        self.assertEqual(self.select(child, expected=selected.data['data']['current_selection_id'], key='formula_cross_root_head01').status_code, 409)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.base + child.pk + '/formula-versions/').status_code, (401, 403))

    def test_rehashed_missing_versions_forged_parent_and_false_promotion_rejected(self):
        self.seed(); child = self.edit(); self.select(child)
        snapshot = SyncManager().build_snapshot_data()
        FactorFormulaSelection.objects.all().delete(); FactorFormulaVersion.objects.all().delete()
        validate(snapshot, metadata(snapshot))
        for change in ('drop', 'parent', 'formula', 'promotion', 'pointer'):
            data = copy.deepcopy(snapshot)
            version = next(row for row in data if row['model'] == 'quant.factorformulaversion')
            selection = next(row for row in data if row['model'] == 'quant.factorformulaselection')
            if change == 'drop': data.remove(version)
            elif change == 'parent': version['fields']['data']['parents'][0]['id'] = child.pk
            elif change == 'formula': version['fields']['data']['definition']['expression'] = {'op': 'input', 'name': 'close'}
            elif change == 'promotion': selection['fields']['data']['kind'] = 'profitable_verified'
            else: next(row for row in data if row['model'] == 'quant.factorcandidate' and row['pk'] == self.root.pk)['fields']['formula_selection_id'] = 'missing'
            for row in (version, selection): row['fields']['content_hash'] = digest(row['fields']['data'])
            with self.assertRaises(SyncError): validate(data, metadata(data))

    def test_old_backup_does_not_borrow_new_working_pointer_or_restore_execution(self):
        root = self.seed()
        snapshot = SyncManager().build_snapshot_data()
        for row in snapshot:
            if row['model'] == 'quant.factorcandidate':
                row['fields'].pop('formula_version_id'); row['fields'].pop('formula_selection_id')
        meta = metadata(snapshot); meta['quant_schema_version'] = 37
        child = self.edit(); self.select(child)
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as experiment:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=meta)
        model.assert_not_called(); experiment.assert_not_called()
        root.refresh_from_db()
        self.assertEqual(root.formula_selection_id, '')
        self.assertFalse(FactorFormulaSelection.objects.exists()); self.assertFalse(FactorFormulaVersion.objects.exists())
        self.assertFalse(FactorCandidate.objects.filter(pk=child.pk).exists())
        validate(SyncManager().build_snapshot_data(), metadata(SyncManager().build_snapshot_data()))

    def test_lineage_list_and_history_queries_stay_bounded_as_versions_accumulate(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        self.seed()
        for index in range(24):
            value = copy.deepcopy(self.definition); value['name'] = f'修订定义 {index}'
            self.edit(key=f'formula_many_versions_{index:04d}', definition=value)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.base + '?groupBy=lineage')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.json()['data']['items'][0]['occurrenceCount'], 25)
        self.assertLessEqual(len(queries), 18)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.base + self.root.pk + '/formula-versions/?offset=20&limit=20')
        self.assertEqual(response.json()['data']['versionsTotal'], 25)
        self.assertEqual(len(response.json()['data']['versions']), 5)
        self.assertLessEqual(len(queries), 15)

    def test_feedback_keeps_authored_defaults_distinct_from_ancestor_source(self):
        from quant.feedback.evidence import for_source
        from quant.feedback.planning import planning_prompt, options
        from quant.models import SourceRevision, AIRun, ResearchReport
        from quant import test_feedback as feedback_fixture
        from quant.worker import execute as execute_ai
        self.seed(); child = self.edit()
        response = self.client.post(f'/api/quant/{self.collection.pk}/entries/{self.root.report.entry_id}/feedback/', {
            'request_key': 'authored_feedback_scope01', 'title': '修订版实际配置反馈', 'target_source_id': self.root.report.source_id,
            'factor_id': child.pk, 'mode': 'backtest', 'document_format': 'text', 'document': 'N=10\nnet=-2%',
            'platform': 'user-reported platform', 'notes': '应区分祖先源码与人工公式声明', 'analyze': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        source = SourceRevision.objects.get(pk=response.data['data']['source']['id'])
        context = for_source(source)
        self.assertEqual(context['factor_source_scope']['parameter_comparison_scope'], 'target_source_ancestor_only')
        self.assertEqual(options(context)[0]['candidate'], child.data)
        self.assertIn('人工公式版本声明默认值', planning_prompt(context))
        run = AIRun.objects.get(source=source, kind='feedback_review')
        with patch('quant.worker.complete', return_value=json.dumps(feedback_fixture.response())) as model:
            execute_ai(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        self.assertIn('factor_source_scope', model.call_args.args[1])
        self.assertNotIn('scores', ResearchReport.objects.get(run=run).data)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

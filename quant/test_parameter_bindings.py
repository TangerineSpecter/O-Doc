"""Source identity survives aliasing; source defaults never become experiment facts."""
import copy
import json
from unittest import TestCase as PureTestCase
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant.parameters.inventory import build, encode
from quant.parameters.bindings import bind, extension, validate_source, validate_admission, validate_inheritance, repair_origins, normalize_model_binding_ids, propagate
from quant.research.supplements.contracts import build as bundle
from quant.research.contracts import digest
from quant.test_research_analysis import result
from quant.test_factors import extracted


def source(main='N=20\ndef f(close): return close/N\n', helper='N=30\n'):
    parent = {'code': main, 'language': 'python', 'provenance': 'intake'}
    return bundle('parent', digest(parent), parent, {'expected_source_id': 'parent',
        'files': [{'name': 'helper.py', 'code': helper}], 'reason': '补交正文'})


def parameter(name, default='20', **changes):
    return {**copy.deepcopy(result()['parameters'][0]), 'name': name, 'default_value': default, **changes}


class ParameterIdentityTests(PureTestCase):
    def test_candidate_compact_parameter_reference_preserves_parent_and_rejects_forgery(self):
        inventory = build({'language': 'python', 'code': 'N=20\n'})
        parent = bind([parameter('N')], [parameter('N')], inventory)[0]
        factor = {'parameters': [{'name': 'N'}], 'expression': None}
        expanded = propagate([factor], [factor], [parent])
        self.assertEqual(expanded[0]['parameters'], [parent])
        expanded[0]['parameters'][0]['default_value'] = '999'
        self.assertEqual(parent['default_value'], '20')
        for item in ({'name': 'missing'}, {'name': 'N', 'default_value': '99'}):
            bad = {'parameters': [item], 'expression': None}
            with self.assertRaises(ValidationError): propagate([bad], [bad], [parent])

    def test_bad_model_hint_recovers_only_independent_unique_match(self):
        inventory = build({'language': 'python', 'code': 'N=20\nM=30\n'})
        n, m = inventory['declarations']
        for bad_id in ('parameter-binding:0e...', m['id']):
            raw = parameter('N', binding_id=bad_id)
            fixed = normalize_model_binding_ids([raw], inventory)
            self.assertEqual(raw['binding_id'], bad_id)
            self.assertNotIn('binding_id', fixed[0])
            bound = bind([parameter('N')], fixed, inventory)
            self.assertEqual(bound[0]['source_binding']['id'], n['id'])
            with self.assertRaises(ValidationError):
                bind([parameter('N', '99')], fixed, inventory)
        ambiguous = build(source())
        raw = parameter('N', binding_id='foreign')
        with self.assertRaises(ValidationError):
            bind([raw], normalize_model_binding_ids([raw], ambiguous), ambiguous)
        forged = parameter('N', binding_id='foreign', source_binding={'status': 'resolved', 'id': n['id']})
        self.assertEqual(normalize_model_binding_ids([forged], inventory), [forged])

    def test_files_scopes_repeated_and_stable_identity_do_not_merge(self):
        original = source('N=20\ndef f(N=5): return N\n', 'N=30\n')
        inventory = build(original)
        rows = [row for row in inventory['declarations'] if row['source_name'] == 'N']
        self.assertEqual(len(rows), 3)
        self.assertEqual(len({row['id'] for row in rows}), 3)
        self.assertEqual(len({row['symbol'] for row in rows}), 3)
        changed = build(source('# new line\nN=22\ndef f(N=5): return N\n', 'N=30\n'))
        self.assertEqual([row['id'] for row in rows], [row['id'] for row in changed['declarations']])
        self.assertNotEqual(inventory['source_hash'], changed['source_hash'])
        for row in rows:
            item = parameter(row['symbol'], str(row['literal']['value']), binding_id=row['id'])
            bound = bind([item], [item], inventory)
            self.assertEqual(bound[0]['source_binding']['source_name'], 'N')
            self.assertEqual(bound[0]['source_binding']['file'], row['file'])
            self.assertEqual(bind(bound, bound, inventory), bound)

    def test_ambiguous_name_dynamic_default_and_spoofed_default_fail_closed(self):
        inventory = build(source())
        bound = bind([parameter('N')], [parameter('N')], inventory)
        self.assertEqual(bound[0]['source_binding']['status'], 'unresolved')
        row = inventory['declarations'][0]
        for changes in ({'default_value': '99'}, {'binding_id': 'foreign'}):
            raw = parameter(row['symbol'], binding_id=row['id'], **changes) if 'binding_id' not in changes else parameter(row['symbol'], **changes)
            with self.assertRaises(ValidationError): bind([raw], [raw], inventory)
        inventory = build({'language': 'python', 'code': 'N=load_config()\n'})
        self.assertEqual(bind([parameter('N', '')], [parameter('N', '')], inventory)[0]['source_binding']['literal']['kind'], 'unknown')
        with self.assertRaises(ValidationError): bind([parameter('N')], [parameter('N')], inventory)
        inventory = build({'language': 'pine', 'code': 'N=input(20)*2\n'})
        value = bind([parameter('N')], [parameter('N')], inventory)[0]
        self.assertEqual(value['source_binding']['literal']['kind'], 'unknown')
        self.assertEqual(value['default_value'], '')
        inventory = build({'language': 'python', 'code': 'N=20\nfor N in []: pass\n'})
        self.assertFalse(inventory['declarations'][0]['auto_match'])
        bound = bind([parameter('N')], [parameter('N')], inventory)
        self.assertEqual(bound[0]['source_binding']['status'], 'unresolved')
        self.assertEqual(bind(bound, bound, inventory), bound)

    def test_cross_language_declarations_unicode_and_parse_limits(self):
        for language, code in [('mql4', 'input int N=20;\n'), ('pine', 'N=input(20)\n')]:
            inventory = build({'language': language, 'code': code})
            self.assertEqual(inventory['declarations'][0]['literal']['value'], 20)
            self.assertEqual(bind([parameter('N')], [parameter('N')], inventory)[0]['source_binding']['status'], 'resolved')
        inventory = build({'language': 'python', 'code': '周期=20\n'})
        bound = bind([parameter('周期')], [parameter('周期')], inventory)
        self.assertTrue(bound[0]['name'].startswith('p_'))
        self.assertEqual(bind(bound, bound, inventory), bound)
        for code in ['N=', '\n'.join(f'N{i}=20' for i in range(301)), 'N="' + 'a' * 7000 + '"']:
            inventory = build({'language': 'python', 'code': code})
            self.assertFalse(inventory['declarations'])
            self.assertIn(inventory['status'], ('unparsed', 'limited'))

    def test_rehashed_source_facts_and_untrusted_authored_origins_rejected(self):
        payload = source(); inventory = build(payload); row = inventory['declarations'][0]
        raw = parameter(row['symbol'], binding_id=row['id'])
        params = bind([raw], [raw], inventory)
        value = {'parameters': params, 'parameter_binding_version': 1, 'parameter_inventory_json': encode(inventory)}
        validate_source(value, payload); validate_admission(value, 21)
        for mutate in [lambda v: v['parameters'][0].update(default_value='99'),
                lambda v: v['parameters'][0]['source_binding'].update(file='foreign.py')]:
            bad = copy.deepcopy(value); mutate(bad)
            with self.assertRaises(ValidationError): validate_source(bad, payload)
        with self.assertRaises(ValidationError): validate_admission(value, 19)
        with self.assertRaises(ValidationError): validate_admission({'parameters': params}, 19)
        with self.assertRaises(ValidationError): validate_inheritance(params, [])
        validate_inheritance(params, params)
        # Rehashed canonical JSON cannot replace source reconstruction.
        bad = copy.deepcopy(value); forged = copy.deepcopy(inventory)
        forged['declarations'][0]['default_raw'] = '99'
        bad['parameter_inventory_json'] = encode(forged)
        bad['parameters'][0]['source_binding']['default_raw'] = '99'
        extension(bad)
        with self.assertRaises(ValidationError): validate_source(bad, payload)

    def test_repair_keeps_ancestry_but_new_knobs_are_hypotheses(self):
        inventory = build({'language': 'python', 'code': 'N=20\n'})
        params = bind([parameter('N')], [parameter('N')], inventory)
        factors = [{'parameters': params}]
        raw = {'items': [{'factor_index': 0, 'definition': {'parameters': [parameter('N', '25'), parameter('extra', '2')]}}]}
        repaired = repair_origins(raw, factors, inventory['source_hash'])
        values = repaired['items'][0]['definition']['parameters']
        self.assertEqual(values[0]['source_binding'], params[0]['source_binding'])
        self.assertEqual(values[0]['default_value'], '25')
        self.assertEqual(values[1]['source_binding']['status'], 'hypothesis')
        values[0]['source_binding']['default_raw'] = '25'
        with self.assertRaises(ValidationError): repair_origins(repaired, factors, inventory['source_hash'])
        for malformed in ({'items': 'bad'}, {'items': ['bad']}, {'items': [{'factor_index': 0, 'definition': {'parameters': None}}]}):
            with self.assertRaises(ValidationError): repair_origins(malformed, factors, inventory['source_hash'])

    def test_combined_experiments_keep_original_identity_and_independent_values(self):
        from quant.test_experiment_search import seed, data
        from quant.experiments.search import recipe, combine
        from quant.experiments.derivation import build_candidate
        from quant.experiments.expression import calculate
        inventory = build(source())
        seeds = [seed('main', 3, False), seed('helper', 8, False)]
        for selected, declaration in zip(seeds, [row for row in inventory['declarations'] if row['source_name'] == 'N']):
            raw = parameter(declaration['symbol'], str(declaration['literal']['value']), binding_id=declaration['id'])
            selected['candidate']['parameters'] = bind([raw], [raw], inventory)
            selected['parameters'] = {declaration['symbol']: next(iter(selected['parameters'].values()))}
            selected['candidate']['expression']['args'][0]['args'][1]['args'][1]['name'] = declaration['symbol']
        attempts = [{'id': f'a{index}', 'operation': 'source_candidate', 'parents': [item['id']],
            'recipe': recipe(item['candidate'], item['bindings'], item['parameters'])} for index, item in enumerate(seeds)]
        combined = {'id': 'combined', 'operation': 'mean', 'parents': ['a0', 'a1'],
            'recipe': combine(attempts[0]['recipe'], attempts[1]['recipe'], 'mean')}
        attempts.append(combined)
        plan = {'name': '分离同名参数', 'engine_version': 'quant-local-search-2', 'dataset_hash': 'synthetic', 'seeds': seeds}
        child = build_candidate('request', 'checkpoint', plan, data(), attempts, combined)
        self.assertEqual([row['source_binding']['file'] for row in child['parameters']], ['__source__.py', 'helper.py'])
        values = {row['name']: json.loads(row['default_value']) for row in child['parameters']}
        self.assertEqual(values, {'a_p0': 3, 'b_p0': 8})
        self.assertEqual([row['source_binding']['literal']['value'] for row in child['parameters']], [20, 30])
        series = {'close': [row['close'] for row in data()['rows']]}
        self.assertEqual(calculate(child['expression'], series, values), calculate(combined['recipe']['expression'],
            {name: series[column] for name, column in combined['recipe']['bindings'].items()}, combined['recipe']['parameters']))


class BoundReportTests(TestCase):
    from quant.test_research_analysis import AnalysisTests
    setUp = AnalysisTests.setUp
    collect = AnalysisTests.collect

    def test_bundle_report_candidate_experiment_and_restore_bind_exact_file(self):
        from quant.models import AIRun, SourceRevision, FactorCandidate, WorkflowStep
        from quant.worker import execute
        from quant.sync import validate, metadata
        from utils.sync_manager import SyncManager, SyncError
        self.payload.update(analyze=False, code='N=20\ndef f(close): return close / close.shift(N) - 1\n')
        entry = self.collect(); parent = SourceRevision.objects.get(material__entry=entry)
        response = self.client.post(f'/api/quant/{self.collection.pk}/entries/{entry.pk}/sources/{parent.pk}/supplements/',
            {'request_key': 'parameter_binding_bundle_01', 'expected_source_id': parent.pk, 'reason': '区分同名参数',
             'files': [{'name': 'helper.py', 'code': 'N=30\n'}], 'analyze': True, 'model_id': self.model.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        child = SourceRevision.objects.get(pk=response.data['data']['source_id']); run = AIRun.objects.get(source=child)
        inventory = build(child.payload, 2)
        row = next(row for row in inventory['declarations'] if row['file'] == '__source__.py' and row['source_name'] == 'N')
        fake = extracted(); p = parameter(row['symbol'], binding_id=row['id'])
        fake['parameters'] = [p]; fake['factors'][0]['parameters'] = [copy.deepcopy(p)]
        fake['factors'][0]['expression']['args'][0]['args'][1]['args'][1]['name'] = row['symbol']
        with patch('quant.worker.complete', return_value=json.dumps(fake)) as provider: execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(run.workflow_version, 25)
        candidate = FactorCandidate.objects.get()
        actual = candidate.data['parameters'][0]
        self.assertEqual(actual, run.result['parameters'][0]); self.assertEqual(actual['source_binding']['file'], '__source__.py')
        self.assertIn('parameter_inventory', provider.call_args_list[1].args[1])
        later = json.loads(provider.call_args_list[2].args[1].split('材料：', 1)[1])
        self.assertNotIn('parameter_inventory_json', later['previous']['parameters'])
        self.assertIn('原始默认表达式', run.report.markdown)
        from quant.workflows.contracts import validate_output
        original = extracted()
        with self.assertRaises(ValidationError):
            validate_output('extract', original, {'parameters': {'parameters': run.result['parameters']}}, child.payload, 21)
        from quant.test_experiment_search import data as synthetic, SearchTests
        from quant.experiments.datasets import create_dataset
        from quant.experiments.worker import execute as compute
        from quant.models import ExperimentRequest
        rows = synthetic()['rows']; columns = ('timestamp', 'open', 'high', 'low', 'close', 'volume')
        csv = ','.join(columns) + '\n' + '\n'.join(','.join(str(item[key]) for key in columns) for item in rows)
        dataset = create_dataset(self.collection, {'name': '合成身份验收', 'csv_text': csv, 'symbol': 'SYNTHETIC',
            'timeframe': '1d', 'timezone': 'UTC', 'source': 'test fixture', 'price_adjustment': 'not applicable'})
        saved = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', {
            'request_key': 'binding_experiment_api_01', 'name': '独立符号受控计算', 'dataset_id': dataset.pk,
            'seeds': [{'candidate_id': candidate.pk, 'bindings': [{'name': 'close', 'column': 'close'}],
                'parameters': [{'name': row['symbol'], 'value': 20}],
                'variants': [[{'name': row['symbol'], 'value': value}] for value in (10, 30)]}], 'config': SearchTests.config}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        experiment = ExperimentRequest.objects.get(pk=saved.data['data']['id'])
        with patch('quant.experiments.reviews.auto_review'): compute(experiment.job.pk)
        self.assertEqual(experiment.result.data['status'], 'completed')
        self.assertEqual(experiment.plan['seeds'][0]['parameters'], {row['symbol']: 20})
        descendants = list(FactorCandidate.objects.exclude(derived_checkpoint_id=''))
        self.assertTrue(descendants)
        for descendant in descendants:
            for value in descendant.data['parameters']:
                self.assertEqual(value['source_binding'], actual['source_binding'])
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        WorkflowStep.objects.all().delete(); validate(snapshot, metadata(snapshot))
        bad = copy.deepcopy(snapshot)
        step = next(row for row in bad if row['model'] == 'quant.workflowstep' and row['fields']['stage'] == 'normalize')
        outcome = next(row for row in bad if row['model'] == 'quant.workflowoutcome' and row['fields']['step'] == step['pk'])
        outcome['fields']['data']['output']['parameter_inventory']['declarations'][0]['default_raw'] = '99'
        outcome['fields']['content_hash'] = digest(outcome['fields']['data'])
        with self.assertRaises(SyncError): validate(bad, metadata(bad))
        with patch('quant.worker.complete', side_effect=AssertionError('restore cannot call provider')):
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(FactorCandidate.objects.get(pk=candidate.pk).data['parameters'][0], actual)

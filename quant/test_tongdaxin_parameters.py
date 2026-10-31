"""TDX declarations and user-provided parameter tables are separate source facts."""
import copy
import json
from unittest import TestCase as PureTestCase
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant.parameters.inventory import build, encode
from quant.parameters.bindings import bind, validate_source, extension
from quant.parameters import domains
from quant import test_research_analysis as fixtures

TABLE = '参数,最小,最大,缺省\nN,2,60,20\n'


def parameter(name='N', default='20'):
    return {**copy.deepcopy(fixtures.result()['parameters'][0]), 'name': name, 'default_value': default}


class TongdaxinCatalogTests(PureTestCase):
    def test_literals_computed_state_and_outputs_are_distinct_and_old_parser_unchanged(self):
        payload = {'language': 'tongdaxin', 'code': '{注释N:=99;}\r\nN:=20;\r\n均线:=MA(C,N);\r\n输出:均线;'}
        self.assertEqual(build(payload)['status'], 'unsupported')
        value = build(payload, 2); rows = value['declarations']
        self.assertEqual([row['kind'] for row in rows], ['module_literal', 'formula_assignment', 'formula_output'])
        self.assertEqual([row['line'] for row in rows], [2, 3, 4])
        self.assertEqual([row['literal']['kind'] for row in rows], ['int', 'unknown', 'unknown'])
        raw = [parameter('N'), parameter('均线', ''), parameter('输出', '')]
        result = bind(raw, raw, value)
        self.assertEqual([row['category'] for row in result], ['constant', 'state', 'state'])
        self.assertEqual([row['default_value'] for row in result], ['20', '', ''])
        self.assertTrue(result[1]['name'].startswith('p_'))
        self.assertEqual(bind(result, result, value), result)

    def test_external_table_default_bounds_and_parameter_provenance(self):
        for field, text in [('description', TABLE), ('parameters', '最大\t缺省\t参数\t最小\n60\t20\tN\t2\n')]:
            with self.subTest(field=field):
                source = {'language': 'tongdaxin', 'code': 'MOM:C/REF(C,N)-1;', field: text}
                inventory = build(source, 2); row = next(row for row in inventory['declarations'] if row['kind'] == 'external_parameter')
                raw = parameter(row['symbol']); values = bind([raw], [raw], inventory)
                self.assertEqual(values[0]['category'], 'signal')
                self.assertEqual(values[0]['source_binding']['scope'], '<external_parameters:' + field + '>')
                domain = values[0]['domain']; self.assertEqual(domain['version'], 5)
                self.assertEqual((domain['minimum'], domain['maximum'], domain['step']), (2, 60, None))
                domains.validate_values(values, {'N': 20})
                with self.assertRaises(ValidationError): domains.validate_values(values, {'N': 61})
                value = {'parameters': values, 'parameter_binding_version': 2, 'parameter_inventory_json': encode(inventory)}
                validate_source(value, source)
                bad = copy.deepcopy(value); bad['parameters'][0]['domain']['maximum'] = 100
                with self.assertRaises(ValidationError): validate_source(bad, source)
                bad_domain = copy.deepcopy(domain); bad_domain['version'] = 4
                if field == 'parameters':
                    with self.assertRaises(ValidationError): domains.validate_domain(bad_domain)

    def test_case_collisions_and_missing_table_do_not_create_defaults(self):
        for source in [dict(language='tongdaxin', code='N:=20;', description=TABLE),
                dict(language='tongdaxin', code='N:=20;n:=30;'),
                dict(language='tongdaxin', code='M:C;', parameters=TABLE + 'n,1,30,10\n')]:
            inventory = build(source, 2)
            blocked = [row for row in inventory['declarations'] if row['blocked']]
            self.assertGreaterEqual(len(blocked), 2)
            raw = parameter(blocked[0]['symbol']); raw['binding_id'] = blocked[0]['id']
            result = bind([raw], [raw], inventory)
            self.assertEqual(result[0]['source_binding']['status'], 'unresolved')
            self.assertEqual(result[0]['default_value'], '')
            self.assertEqual(bind(result, result, inventory), result)
        source = {'language': 'tongdaxin', 'code': 'M:MA(C,N);', 'description': '作者说N可能是20，但没有参数表。'}
        inventory = build(source, 2); raw = parameter()
        result = bind([raw], [raw], inventory)
        self.assertEqual(result[0]['source_binding']['status'], 'unresolved')
        self.assertEqual(result[0]['default_value'], '')

    def test_malformed_or_over_budget_tables_and_incomplete_formula_do_not_leak_partial_rows(self):
        for text in [TABLE.replace('20', '61'), TABLE.replace('2,60', '60,2'), TABLE.replace('20', 'NaN'),
                TABLE + 'X,1,2\n', TABLE + 'X,"1,2,1\n', '参数,最小,最大,缺省\n']:
            inventory = build({'language': 'tongdaxin', 'code': 'K:=3;', 'parameters': text}, 2)
            self.assertEqual(inventory['status'], 'limited'); self.assertEqual(inventory['declarations'], [])
        for code in ['N:=20;M:MA(C,N)', 'N:=20;M:MA(C,N;', 'N:=20;{bad', 'N:=20;M:"bad;']:
            inventory = build({'language': 'tongdaxin', 'code': code}, 2)
            self.assertEqual(inventory['status'], 'unparsed'); self.assertEqual(inventory['declarations'], [])
        source = {'language': 'tongdaxin', 'code': 'N:=20;'}
        original = build(source, 2); forged = copy.deepcopy(original)
        forged['declarations'][0]['blocked'] = []
        with self.assertRaises(ValidationError): extension({'parameters': [], 'parameter_binding_version': 2, 'parameter_inventory_json': encode(forged)})


class TongdaxinReportTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect

    def test_plain_table_report_proposal_experiment_restore_and_v1_preservation(self):
        from quant.models import AIRun, FactorCandidate, ExperimentProposal, WorkflowStep, ExperimentRequest, ResearchReport
        from quant.worker import execute
        from quant.test_initial_planning import initial_response, InitialPlanningTests
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.experiments.worker import execute as calculate
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager
        self.payload.update(language='tongdaxin', code='MOM:C/REF(C,N)-1;', description=TABLE)
        entry = self.collect(); run = AIRun.objects.get(entry=entry)
        response = initial_response(); response['factors'][0]['evidence'] = [{'field': 'code', 'quote': 'C/REF(C,N)-1'}]
        def answer(config, text, **kwargs):
            value = copy.deepcopy(response)
            context = json.loads(text.split('材料：', 1)[1])
            if 'parameters' in context['previous']:
                value['factors'][0]['parameters'] = [{'name': row['name']} for row in context['previous']['parameters']['parameters']]
            return json.dumps(value)
        with patch('quant.worker.complete', side_effect=answer) as provider: execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(run.workflow_version, 25); self.assertEqual(run.result['parameter_binding_version'], 2)
        self.assertIn('范围由系统读取用户提供的参数表', ResearchReport.objects.get(run=run).markdown)
        self.assertEqual(provider.call_count, 6)
        candidate = FactorCandidate.objects.get(); proposal = ExperimentProposal.objects.get()
        self.assertEqual(candidate.data['parameters'][0]['domain']['maximum'], 60)
        dataset = InitialPlanningTests.dataset(self)
        path = f'/api/quant/{self.collection.pk}/experiments/'
        body = experiment_input(proposal, dataset.pk, 'tdx_parameter_experiment01')
        invalid = copy.deepcopy(body); invalid['seeds'][0]['parameters'][0]['value'] = 61
        self.assertEqual(self.client.post(path, invalid, format='json').status_code, 400)
        body['seeds'][0]['variants'].append([{'name': 'N', 'value': 61}])
        saved = self.client.post(path, body, format='json'); self.assertEqual(saved.status_code, 200, saved.data)
        request = ExperimentRequest.objects.get(pk=saved.data['data']['id'])
        with patch('quant.experiments.reviews.auto_review'): calculate(request.job.pk)
        self.assertTrue(any(row['status'] == 'rejected' and '上限' in row['reason'] for row in request.result.data['output']['attempts']))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        WorkflowStep.objects.all().delete(); validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete', side_effect=AssertionError('offline restore')):
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(FactorCandidate.objects.get(pk=candidate.pk).data['parameters'][0]['domain']['maximum'], 60)

import copy
from types import SimpleNamespace
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.test_algorithms import algorithm
from quant.algorithms.extraction import resolve
from quant.algorithms.python_definition import validate_python
from quant.verification.structure import qualification
from quant.exports.service import bundle
from quant.experiments.expression import calculate

CODE = '''import math

def helper(values):
    return [math.sqrt(abs(x)) for x in values]

def compute(inputs, parameters=None):
    window = (parameters or {}).get("window", 5000)
    result = []
    for i, value in enumerate(helper(inputs["close"])):
        result.append(sum(inputs["close"][max(0, i-window+1):i+1]) + value)
    return result
'''


class PythonAlgorithmsTests(SimpleTestCase):
    def test_loops_imports_helpers_and_large_windows_are_stored_and_exported(self):
        data=algorithm();data['expression']={'op':'python','version':1,'code':CODE}
        rows, failures=resolve([data], {'language':'python','code':CODE}, [], python_algorithms=True)
        self.assertFalse(failures);self.assertEqual(rows[0]['expression']['code'],CODE)
        checked=qualification(rows[0]);self.assertEqual(checked['reuse_status'],'reusable')
        self.assertFalse(checked['automatic_experiment_ready'])
        candidate=SimpleNamespace(data=data,pk='a',report_id='r',report=SimpleNamespace(source_id='s'))
        self.assertEqual(bundle(candidate,'python')['code'],CODE)
        with self.assertRaises(ValidationError): calculate(data['expression'],{'close':[1,2]}, {})
        from quant.experiments.search import recipe
        with self.assertRaisesRegex(ValidationError, 'Python compute'):
            recipe(data, {'close':'close'}, {})

    def test_python_in_formula_is_kept_when_expression_was_null(self):
        data=algorithm();data['expression']=None;data['formula']='```python\n'+CODE+'\n```'
        rows,errors=resolve([data],{'language':'python','code':CODE},[],python_algorithms=True)
        self.assertFalse(errors);self.assertEqual(rows[0]['expression']['op'],'python')

    def test_python_asset_is_not_blocked_by_parameter_parser_coverage(self):
        from quant.parameters.bindings import propagate
        data = algorithm()
        data['expression'] = {'op':'python','version':1,'code':CODE}
        for parameter in data['parameters']:
            parameter['source_binding'] = {'version':1, 'status':'unresolved',
                'source_name':parameter['name'], 'source_hash':'0'*64, 'reason':'声明语法不在本机目录解析范围'}
        result = propagate([data], [data], data['parameters'])
        self.assertEqual(result[0]['expression']['code'], CODE)
        self.assertEqual(result[0]['parameters'], data['parameters'])

    def test_parsing_does_not_execute_top_level_code(self):
        source={'op':'python','version':1,'code':'raise RuntimeError("never execute at extraction")\n'+CODE}
        self.assertEqual(validate_python(source),source)
        broken=copy.deepcopy(source);broken['code']='def compute(:'
        with self.assertRaises(ValidationError): validate_python(broken)

    def test_review_context_keeps_metadata_without_repeating_implementations(self):
        from quant.workflows.algorithm_context import compact
        data = algorithm()
        data['expression'] = {'op':'python','version':1,'code':CODE}
        original = {'previous':{'extract':{'factors':[data]}}, 'factors_for_initial_plan':[data]}
        snapshot = copy.deepcopy(original)
        result = compact(original)
        self.assertEqual(original, snapshot)
        for row in (result['previous']['extract']['factors'][0], result['factors_for_initial_plan'][0]):
            self.assertNotIn('expression', row)
            self.assertNotIn('formula', row)
            self.assertEqual(row['inputs'], data['inputs'])
            self.assertEqual(row['implementation'], {'format':'python','output':'compute'})
            self.assertFalse(row['experiment_execution']['local_engine_supported'])
            self.assertEqual(row['experiment_execution']['required_inputs'], ['close'])

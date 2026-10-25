"""Minimized failures observed in the first real-provider acceptance run.

The product must keep rejecting invented empty constraints and unbound leaves;
the prompt fix does not weaken the publication contract or rewrite answers.
"""
import copy

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.factors.contracts import validate_extraction
from quant.test_factors import extracted


class ExtractionAdmissionTests(SimpleTestCase):
    def test_empty_domain_is_rejected_in_candidate_parameters(self):
        response = extracted()
        parameter = response['factors'][0]['parameters'][0]
        parameter['domain'] = {'version':1, 'minimum':None, 'maximum':None,
            'step':None, 'step_origin':None, 'choices':[], 'relations':[],
            'evidence':[{'field':'code','quote':'N=20'}]}
        with self.assertRaisesRegex(ValidationError, '没有明确约束'):
            validate_extraction(response)
        del parameter['domain']
        cleaned = validate_extraction(response)
        self.assertNotIn('domain', cleaned['factors'][0]['parameters'][0])

    def test_inline_middle_variable_requires_its_actual_input(self):
        response = extracted()
        factor = response['factors'][0]
        window = factor['parameters'][0]
        enabled = dict(copy.deepcopy(window), name='ShowBands', type='bool',
                       default_value='true', category='display')
        factor['parameters'] = [window, enabled]
        factor['role'] = 'display'
        factor['expression'] = {'op':'gate','args':[
            {'op':'sma','args':[{'op':'input','name':'close'}, {'op':'parameter','name':window['name']}]},
            {'op':'parameter','name':'ShowBands'}]}
        factor['inputs'][0]['name'] = 'b'
        with self.assertRaisesRegex(ValidationError, '未声明的输入'):
            validate_extraction(response)
        factor['inputs'][0]['name'] = 'close'
        cleaned = validate_extraction(response)
        self.assertEqual(cleaned['factors'][0]['expression'], factor['expression'])

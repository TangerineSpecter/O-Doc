from decimal import Decimal
from django.test import SimpleTestCase
from quant.acceptance.plan_reference import signals, check_metrics


class PlanReferenceTests(SimpleTestCase):
    def test_sma_known_values_are_causal_and_unsupported_nodes_fail(self):
        rows = [{'close':value} for value in ('1','3','2')]
        recipe = {'bindings':{'price':'close'},'parameters':{'n':2},'expression':{'op':'sub','args':[
            {'op':'div','args':[{'op':'input','name':'price'},
                {'op':'sma','args':[{'op':'input','name':'price'},{'op':'parameter','name':'n'}]}]},
            {'op':'constant','value':1}]}}
        self.assertEqual(signals(recipe, rows), [None,Decimal('0.5'),Decimal('-0.2')])
        self.assertEqual(signals(recipe, rows+[{'close':'999'}])[:3], signals(recipe, rows))
        recipe['expression'] = {'op':'future','args':[]}
        with self.assertRaises(ValueError): signals(recipe,rows)

    def test_nonfinite_numbers_cannot_pass_reference_comparison(self):
        for value in (float('nan'),float('inf'),True):
            with self.subTest(value=value), self.assertRaises(AssertionError):
                check_metrics({'total_return':value},{'total_return':1.0})
        with self.assertRaises(AssertionError):
            check_metrics({'total_return':1.0},{'total_return':float('nan')})

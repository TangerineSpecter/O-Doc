"""V4 rational condition operands are bounded assertions, never uploaded source."""
import copy
from fractions import Fraction
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.parameters import arithmetic, conditions, domains


def parameter(name):
    return {'parameter': name}


def literal(value):
    return {'value': value}


def binary(operator, left, right):
    return {'operator': operator, 'left': left, 'right': right}


def comparison(left, operator='lte', right=None):
    return binary(operator, left, parameter('slow') if right is None else right)


def predicate():
    return comparison(binary('add', parameter('fast'), literal(2)))


def contract(require=None, when=None):
    domain = {'version': 4, 'minimum': None, 'maximum': None, 'step': None, 'step_origin': None, 'choices': [],
        'relations': [], 'conditions': [{'when': when or comparison(parameter('enabled'), 'eq', literal(True)),
                                       'require': require or predicate()}],
        'evidence': [{'field': 'code', 'quote': 'enabled implies fast + 2 <= slow'}]}
    return [{'name': 'fast', 'type': 'float', 'domain': domain}, {'name': 'slow', 'type': 'float'},
            {'name': 'enabled', 'type': 'bool'}, {'name': 'mode', 'type': 'string'}]


class ParameterArithmeticCoreTests(SimpleTestCase):
    def test_nested_arithmetic_truth_table_and_decimal_equality_are_exact(self):
        rows = contract(); original = copy.deepcopy(rows)
        for enabled, fast, slow, allowed in [(True, 8, 10, True), (True, 9, 10, False), (False, 99, 10, True)]:
            actual = {'enabled': enabled, 'fast': fast, 'slow': slow}
            if allowed:
                domains.validate_values(rows, actual)
            else:
                with self.assertRaisesRegex(ValidationError, '条件约束'):
                    domains.validate_values(rows, actual)
        value = comparison(binary('add', parameter('fast'), literal(.2)), 'eq', literal(.3))
        conditions.validate(value, {'fast': 'number'}, allow_arithmetic=True)
        self.assertTrue(conditions.evaluate(value, {'fast': .1}, exact=True))
        divided = binary('mul', binary('div', parameter('fast'), literal(3)), literal(3))
        self.assertTrue(conditions.evaluate(comparison(divided, 'eq', parameter('fast')), {'fast': .1}, exact=True))
        negative = {'operator': 'neg', 'argument': binary('sub', parameter('fast'), literal(.2))}
        self.assertTrue(conditions.evaluate(comparison(negative, 'eq', literal(.1)), {'fast': .1}, exact=True))
        self.assertEqual(rows, original)

    def test_inactive_require_is_lazy_but_all_dependencies_and_input_bounds_are_checked(self):
        bad_division = comparison(binary('div', parameter('fast'), literal(0)))
        rows = contract(require=bad_division)
        domains.validate_values(rows, {'enabled': False, 'fast': 1, 'slow': 2})
        with self.assertRaisesRegex(ValidationError, '除以零'):
            domains.validate_values(rows, {'enabled': True, 'fast': 1, 'slow': 2})
        for actual in ({'enabled': False, 'fast': 1}, {'enabled': False, 'fast': True, 'slow': 2},
                {'enabled': False, 'fast': 9007199254740992, 'slow': 2}):
            with self.subTest(actual=actual), self.assertRaises(ValidationError):
                domains.validate_values(rows, actual)
        for name, kind in [('missing', 'number'), ('enabled', 'bool'), ('mode', 'string')]:
            value = contract(require=comparison(binary('add', parameter(name), literal(1))))
            with self.subTest(name=name), self.assertRaises(ValidationError):
                domains.validate_contract(value)

    def test_all_and_any_short_circuit_arithmetic_without_skipping_static_validation(self):
        safe = comparison(parameter('fast'), 'eq', literal(1))
        fault = comparison(binary('div', literal(1), parameter('slow')), 'gt', literal(0))
        for op, first_value in [('any', 1), ('all', 2)]:
            expression = {'operator': op, 'arguments': [safe, fault]}
            conditions.validate(expression, {'fast': 'int', 'slow': 'number'}, allow_arithmetic=True)
            self.assertEqual(conditions.evaluate(expression, {'fast': first_value, 'slow': 0}, exact=True), op == 'any')
            conditions.validate_values(expression, {'fast': first_value, 'slow': 0})
            with self.assertRaises(ValidationError):
                conditions.validate_values(expression, {'fast': first_value, 'slow': 9007199254740992})
        invalid = {'operator': 'any', 'arguments': [safe, comparison(binary('add', parameter('missing'), literal(1)))]}
        with self.assertRaises(ValidationError):
            conditions.validate(invalid, {'fast': 'int', 'slow': 'number'}, allow_arithmetic=True)

    def test_old_versions_keep_old_leaf_semantics_and_reject_arithmetic(self):
        for version in (1, 2, 3):
            value = contract()[0]['domain']; value['version'] = version
            if version == 1:
                value.pop('conditions')
                value['relations'] = [{'operator': 'lt', 'parameter': 'slow'}]
                domains.validate_domain(value)
            else:
                with self.assertRaises(ValidationError):
                    domains.validate_domain(value)
        plain = comparison(parameter('fast'), 'eq', literal(.3))
        self.assertFalse(conditions.evaluate(plain, {'fast': .1 + .2}))
        for expression in [predicate(), comparison({'operator': 'neg', 'argument': parameter('fast')})]:
            with self.assertRaises(ValidationError):
                conditions.validate(expression, {'fast': 'number', 'slow': 'number'})
        leaves = {'operator': 'all', 'arguments': [comparison(parameter('fast'), 'eq', literal(index)) for index in range(8)]}
        conditions.validate(leaves, {'fast': 'number'})

    def test_string_v4_enum_and_boolean_conditions_stay_same_type_only(self):
        rows = contract(when=comparison(parameter('mode'), 'eq', literal('trend')))
        rows[-1]['domain'] = {**copy.deepcopy(rows[0]['domain']), 'choices': ['trend', 'reverse'], 'conditions': []}
        domains.validate_values(rows, {'enabled': True, 'fast': 8, 'slow': 10, 'mode': 'trend'})
        for invalid in [comparison(parameter('mode'), 'gt', literal('trend')),
                comparison(parameter('mode'), 'eq', literal(True)), comparison(parameter('enabled'), 'eq', literal(1))]:
            with self.assertRaises(ValidationError):
                conditions.validate(invalid, {'mode': 'string', 'enabled': 'bool'}, allow_text=True, allow_arithmetic=True)
        with self.assertRaisesRegex(ValidationError, '引文'):
            domains.validate_evidence(rows, {'code': 'no such declaration'})

    def test_operand_shape_unknown_functions_and_total_node_depth_budgets_fail_closed(self):
        for value in [binary('pow', parameter('fast'), literal(2)), {'operator': 'eval', 'code': 'bad()'},
                dict(binary('add', parameter('fast'), literal(2)), extra=True), literal(float('inf')),
                literal(9007199254740992), binary('add', literal(True), parameter('fast'))]:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                conditions.validate(comparison(value), {'fast': 'number', 'slow': 'number'}, allow_arithmetic=True)
        constant_only = comparison(binary('add', literal(1), literal(2)), 'eq', literal(3))
        with self.assertRaises(ValidationError):
            conditions.validate(constant_only, {}, allow_arithmetic=True)
        deep = parameter('fast')
        for _ in range(6): deep = {'operator': 'neg', 'argument': deep}
        conditions.validate(comparison(deep), {'fast': 'number', 'slow': 'number'}, allow_arithmetic=True)
        with self.assertRaisesRegex(ValidationError, '8 层'):
            conditions.validate(comparison({'operator': 'neg', 'argument': deep}), {'fast': 'number', 'slow': 'number'}, allow_arithmetic=True)
        def tree(level):
            if level == 0: return comparison(parameter('fast'), 'eq', literal(1))
            return {'operator': 'all', 'arguments': [tree(level - 1), tree(level - 1)]}
        conditions.validate(tree(4), {'fast': 'number'}, allow_arithmetic=True)
        conditions.validate({'operator': 'not', 'argument': tree(4)}, {'fast': 'number'}, allow_arithmetic=True)
        with self.assertRaisesRegex(ValidationError, '64 个节点'):
            conditions.validate({'operator': 'not', 'argument': {'operator': 'not', 'argument': tree(4)}},
                {'fast': 'number'}, allow_arithmetic=True)

    def test_safe_input_limits_rational_bit_budgets_and_intermediate_magnitude(self):
        for value in (9007199254740991, -9007199254740991, 5e-324, .1):
            arithmetic.rational(value)
        for value in (9007199254740992, -9007199254740992, 1e20, True, '1'):
            with self.assertRaises(ValidationError): arithmetic.rational(value)
        with self.assertRaises(ValidationError): arithmetic.checked(Fraction(1 << 4096, 1))
        with self.assertRaises(ValidationError): arithmetic.checked(Fraction(1, 1 << 4096))
        with self.assertRaises(ValidationError): arithmetic.checked(arithmetic.MAX_VALUE + 1)
        arithmetic.checked(arithmetic.MAX_VALUE)
        huge_denominator = parameter('fast')
        for _ in range(3): huge_denominator = binary('mul', huge_denominator, parameter('fast'))
        expr = comparison(huge_denominator, 'lt', literal(1))
        conditions.validate(expr, {'fast': 'number'}, allow_arithmetic=True)
        with self.assertRaisesRegex(ValidationError, '精度预算'):
            conditions.evaluate(expr, {'fast': 5e-324}, exact=True)
        def product(count):
            if count == 1:
                return parameter('fast')
            return binary('mul', product(count // 2), product(count - count // 2))
        overflow = comparison(product(21), 'gt', literal(0))
        conditions.validate(overflow, {'fast': 'number'}, allow_arithmetic=True)
        with self.assertRaisesRegex(ValidationError, '数值或精度预算'):
            conditions.evaluate(overflow, {'fast': 1e15}, exact=True)

    def test_recursive_renaming_description_and_evidence_do_not_mutate_parent(self):
        rows = contract(require=comparison(binary('div', binary('add', parameter('fast'), literal(2)),
            {'operator': 'neg', 'argument': parameter('slow')}), 'lt', literal(1)))
        original = copy.deepcopy(rows)
        mapping = {'fast': 'a_fast', 'slow': 'a_slow', 'enabled': 'a_enabled', 'mode': 'a_mode'}
        renamed = domains.renamed(rows, mapping)
        rule = renamed[0]['domain']['conditions'][0]
        self.assertEqual(conditions.references(rule['require']), {'a_fast', 'a_slow'})
        self.assertIn('((a_fast + 2) ÷ −(a_slow)) < 1', domains.describe('a_fast', renamed[0]['domain']))
        domains.validate_values(renamed, {'a_fast': 8, 'a_slow': 10, 'a_enabled': True})
        self.assertEqual(rows, original)
        domains.validate_evidence(renamed, {'code': original[0]['domain']['evidence'][0]['quote']})

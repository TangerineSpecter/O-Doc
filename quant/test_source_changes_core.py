"""Source changes are bounded read-only clues, never cross-source reuse proof."""
import copy
from unittest.mock import patch
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.source_changes import preview
from quant.source_changes.diff import compare_code, MAX_HUNKS, MAX_EXCERPT
from quant.source_changes.quotes import QuoteMatcher
from quant.source_structure.common import source_lines


class SourceChangeCoreTests(SimpleTestCase):
    def source(self, code, language='python', **fields):
        return {'code': code, 'language': language, **fields}

    def factor(self, quote, **fields):
        return {'name': '候选', 'evidence': [{'field': 'code', 'quote': quote}], **fields}

    def test_deterministic_and_no_mutation_or_source_execution(self):
        old = self.source('raise RuntimeError("do not execute")\nx = 1\n')
        new = self.source('raise RuntimeError("do not execute")\nx = 2\n')
        report = {'factors': [self.factor('x = 1')], 'parameters': []}
        saved = copy.deepcopy((old, new, report))
        value = preview(old, new, report)
        self.assertEqual(value, preview(old, new, report))
        self.assertEqual((old, new, report), saved)
        self.assertEqual(value['factors'][0]['status'], 'direct')
        self.assertEqual(value['recommendation']['start_stage'], 'normalize')
        self.assertFalse(value['recommendation']['can_reuse_stages'])

    def test_function_change_and_reverse_candidates_without_module_fanout(self):
        code = ('def base(x):\n    return x + 1\n\ndef caller(x):\n    return base(x)\n'
                '\ndef independent(x):\n    return x * 2\n')
        value = preview(self.source(code), self.source(code.replace('x + 1', 'x + 2')),
                        {'factors': [self.factor('return base(x)')]})
        nodes = {row['name']: row for row in value['structure']['nodes']}
        self.assertEqual(nodes['base']['impact'], 'direct')
        self.assertEqual(nodes['caller']['impact'], 'potential')
        self.assertEqual(nodes['independent']['impact'], 'not_observed')
        self.assertNotEqual(nodes['<module>']['impact'], 'direct')
        self.assertEqual(value['factors'][0]['status'], 'potential')
        self.assertEqual(value['factors'][0]['quotes'][0]['status'], 'present')

    def test_removed_dependency_uses_old_reference_graph(self):
        old = self.source('def base(x): return x\ndef caller(x): return base(x)\n')
        new = self.source('def caller(x): return base(x)\n')
        value = preview(old, new, {})
        nodes = {row['name']: row for row in value['structure']['nodes']}
        self.assertEqual(nodes['base']['change'], 'removed')
        self.assertEqual(nodes['caller']['impact'], 'potential')
        self.assertEqual(nodes['caller']['change'], 'moved')

    def test_moved_quote_and_metadata_do_not_authorize_reuse(self):
        code = 'def f(x):\n    return x\n'
        old = self.source(code, description='说明一')
        new = self.source('# inserted\n' + code, description='说明二')
        value = preview(old, new, {'factors': [self.factor('return x')]})
        function = next(row for row in value['structure']['nodes'] if row['name'] == 'f')
        self.assertEqual(function['change'], 'moved')
        self.assertNotEqual(function['impact'], 'direct')
        self.assertEqual(value['factors'][0]['quotes'][0]['status'], 'moved')
        self.assertEqual(value['factors'][0]['status'], 'unknown')
        self.assertIn('description', value['changed_fields'])
        self.assertTrue(value['source_context_changed'])

    def test_unchanged_source_is_identical_but_quotes_are_only_present(self):
        source = self.source('def f(x): return x\n')
        value = preview(source, source, {'factors': [self.factor('return x')]})
        self.assertEqual(value['status'], 'identical')
        self.assertEqual(value['code']['hunks'], [])
        self.assertEqual(value['factors'][0]['status'], 'quote_present')
        self.assertFalse(value['recommendation']['can_reuse_stages'])
        extra = preview(source, {**source, 'unrelated_archive_marker': 'new'}, {})
        self.assertFalse(extra['source_context_changed'])

    def test_parameter_prose_is_not_invented_evidence_and_domains_are_matched(self):
        old, new = self.source('N = 20\n'), self.source('N = 30\n')
        value = preview(old, new, {'parameters': [
            {'name': 'prose', 'evidence': '第1行的窗口参数'},
            {'name': 'N', 'evidence': 'N = 20'},
            {'name': 'domain', 'domain': {'evidence': [{'field': 'code', 'quote': 'N = 20'}]}}]})
        self.assertEqual([row['status'] for row in value['parameters']], ['unknown', 'direct', 'direct'])
        self.assertEqual(value['parameters'][0]['quotes'], [])

    def test_ambiguous_repeated_quotes_and_duplicate_names_remain_unknown(self):
        source = self.source('def f(): return 1\ndef f(): return 1\n')
        value = preview(source, source, {'factors': [self.factor('return 1')]})
        quote = value['factors'][0]['quotes'][0]
        self.assertEqual(quote['status'], 'ambiguous')
        self.assertEqual(quote['old_occurrences'], 2)
        self.assertEqual(value['factors'][0]['status'], 'unknown')
        self.assertTrue(all(row['impact'] == 'unknown' for row in value['structure']['nodes']))

    def test_hunk_budget_counts_all_and_excerpt_budget_is_explicit(self):
        old = ''.join(f'x{i} = 0\n# separator {i}\n' for i in range(90))
        new = old.replace(' = 0', ' = 1')
        code, ranges = compare_code(old, new)
        self.assertEqual(code['total_hunks'], 90)
        self.assertEqual(code['omitted_hunks'], 90 - MAX_HUNKS)
        self.assertEqual(len(ranges), 90)
        value = preview(self.source(old), self.source(new), {})
        last = next(row for row in value['structure']['nodes'] if row['name'] == 'x89')
        self.assertEqual(last['impact'], 'direct')
        large, _ = compare_code('a' * 2000, 'b' * 2000)
        self.assertEqual(len(large['hunks'][0]['old_text']), MAX_EXCERPT)
        self.assertTrue(large['hunks'][0]['old_truncated'])

    def test_repetitive_diff_and_structural_work_budgets_are_conservative(self):
        code = 'x = 0\n' * 1500
        value = preview(self.source(code), self.source(code.replace('0', '1')), {})
        self.assertEqual(value['code']['status'], 'limited')
        self.assertEqual(value['code']['total_hunks'], 1)
        self.assertEqual(value['status'], 'limited')
        pine = self.source(''.join(f'n{i} = {i}\n' for i in range(1000)), 'pine')
        with patch('quant.source_changes.impact.analyze', side_effect=AssertionError('unbounded parser called')):
            limited = preview(pine, pine, {})
        self.assertEqual(limited['structure']['old_status'], 'limited')
        self.assertEqual(limited['structure']['nodes'], [])

    def test_partial_unparsed_and_unknown_languages_show_unknown(self):
        for language, old_code, new_code in (
                ('python', 'def f(:\n', 'def f(:\nx=1\n'),
                ('pine', 'N=input.int(20)\n', 'N=input.int(30)\n'),
                ('text', 'custom A\n', 'custom B\n')):
            with self.subTest(language=language):
                value = preview(self.source(old_code, language), self.source(new_code, language),
                                {'parameters': [{'name': 'N', 'evidence': 'unlocated prose'}]})
                self.assertEqual(value['parameters'][0]['status'], 'unknown')
                self.assertTrue(value['structure']['limitations'])
                self.assertFalse(value['recommendation']['can_reuse_stages'])

    def test_physical_lines_and_empty_hunk_sides(self):
        for newline in ('\n', '\r\n', '\r'):
            code = newline.join(['text = "a\u2028b"', 'def f(x):', '    return x'])
            value = preview(self.source(code), self.source(code.replace('return x', 'return x + 1')),
                            {'factors': [self.factor('return x')]})
            self.assertEqual(value['code']['old_line_count'], 3)
            self.assertEqual(value['code']['hunks'][0]['old_start'], 3)
        insert, _ = compare_code('', 'x = 1\n')
        self.assertIsNone(insert['hunks'][0]['old_start'])
        self.assertIsNone(insert['hunks'][0]['old_end'])
        delete, _ = compare_code('x = 1\n', '')
        self.assertIsNone(delete['hunks'][0]['new_start'])

    def test_quote_line_indexes_cached_per_source_field_and_positions_bounded(self):
        text = ''.join(f'x{i} = {i}\n' for i in range(100)) + 'repeat\n' * 20
        source = self.source(text)
        matcher = QuoteMatcher(source, source)
        with patch('quant.source_changes.quotes.source_lines', wraps=source_lines) as split:
            for i in range(100):
                matcher.quote('code', f'x{i} = {i}')
            self.assertEqual(split.call_count, 2)
            repeated = matcher.quote('code', 'repeat')
        self.assertEqual(repeated['old_occurrences'], 20)
        self.assertEqual(len(repeated['old_lines']), 8)
        self.assertTrue(repeated['truncated'])

    def test_item_limits_and_invalid_inputs(self):
        source = self.source('x=1\n')
        value = preview(source, source, {'parameters': [{'name': 'x'}] * 103,
                                         'factors': [self.factor('x=1')] * 22})
        self.assertEqual(value['omitted'], {'parameters': 3, 'factors': 2})
        with self.assertRaises(ValidationError):
            preview({'code': None}, source, {})
        with self.assertRaises(ValidationError):
            preview(source, source, [])

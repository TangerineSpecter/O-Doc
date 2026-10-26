"""Lexical preview regressions: shadowing, transitive reads and unknowns."""
import copy
from unittest.mock import patch
from django.test import SimpleTestCase
from quant.source_changes import preview
from quant.source_changes.impact import preview_outline
from quant.source_changes.python_bindings import PARSER
from quant.source_structure import analyze
from quant.research.contracts import digest
from quant.workflows import snippets


class PythonSourceBindingTests(SimpleTestCase):
    def source(self, code, **extra):
        return dict(language='python', code=code, **extra)

    def changes(self, code, before, after):
        return preview(self.source(code), self.source(code.replace(before, after)), {})

    def functions(self, value):
        return {row['name']: row for row in value['structure']['nodes'] if row['kind'] == 'function'}

    def test_assignment_chain_reaches_callers_without_module_fanout(self):
        code = ('N=20\nM=N*2\ndef feature(x): return x / M\n'
                'def signal(x): return feature(x) > 1\ndef independent(x): return x*2\n')
        value = self.changes(code, 'N=20', 'N=30')
        nodes = {row['name']: row for row in value['structure']['nodes']}
        self.assertEqual(value['structure']['old_parser'], PARSER)
        self.assertEqual(nodes['N']['impact'], 'direct')
        self.assertTrue(all(nodes[key]['impact'] == 'potential' for key in ('M', 'feature', 'signal')))
        self.assertEqual(nodes['independent']['impact'], 'not_observed')
        self.assertIn('赋值读取链', nodes['signal']['reasons'][-1])
        self.assertFalse(value['recommendation']['can_reuse_stages'])
        ordinary = self.changes(code + 'def builtin_size(x): return len(x)\n', 'N=20', 'N=30')
        self.assertEqual(ordinary['structure']['new_parser'], PARSER)
        self.assertEqual(self.functions(ordinary)['builtin_size']['impact'], 'not_observed')

    def test_parameters_local_names_and_nested_shadowing_do_not_link_global(self):
        code = ('N=20\ndef parameter(N): return N*2\n'
                'def local(x):\n    N=3\n    return x*N\n'
                'def outer(N):\n    def inner(): return N\n    return inner()\n'
                'def global_read(x): return x*N\n')
        value = self.changes(code, 'N=20', 'N=30')
        nodes = self.functions(value)
        self.assertEqual(nodes['global_read']['impact'], 'potential')
        self.assertTrue(all(nodes[key]['impact'] == 'not_observed' for key in ('parameter', 'local', 'outer', 'inner')))

    def test_closure_and_declaration_defaults_preserve_enclosing_bindings(self):
        code = ('N=20\ndef outer(x=N):\n    scale=N*2\n'
                '    def inner(y=x): return y*scale\n    return inner()\n'
                'def unrelated(x): return x\n')
        value = self.changes(code, 'N=20', 'N=30')
        nodes = self.functions(value)
        self.assertEqual(nodes['outer']['impact'], 'potential')
        self.assertEqual(nodes['inner']['impact'], 'potential')
        self.assertEqual(nodes['unrelated']['impact'], 'not_observed')
        # A literal default change also reaches a nested closure reading it.
        value = self.changes(code.replace('x=N', 'x=1'), 'x=1', 'x=2')
        self.assertEqual(self.functions(value)['inner']['impact'], 'potential')

    def test_call_targets_obey_shadowing_and_removed_dependencies_use_old_graph(self):
        code = ('def base(x): return x+1\ndef direct(x): return base(x)\n'
                'def injected(base, x): return base(x)\n')
        value = self.changes(code, 'x+1', 'x+2')
        nodes = self.functions(value)
        self.assertEqual(nodes['direct']['impact'], 'potential')
        self.assertEqual(nodes['injected']['impact'], 'unknown')
        self.assertFalse(any('可到达变更节点' in reason for reason in nodes['injected']['reasons']))
        value = self.changes(code, 'def base(x): return x+1\n', '')
        self.assertEqual(self.functions(value)['direct']['impact'], 'potential')

    def test_conditional_rebinding_and_indirect_calls_stay_unknown(self):
        cases = [
            'N=20\nif flag:\n    N=5\ndef f(x): return x*N\n',
            'N=20\ndef f(obj): return obj.evaluate(N)\n',
            'N=20\ndef f(x): return missing(x)\n',
            'N=20\ndef f(x): return globals()[x]\n',
            'N=20\nfrom vendor import transform\ndef f(x): return transform(x)\n',
            'N=20\nfrom vendor import transform as len\ndef f(x): return len(x)\n',
            'N=20\ndef f(N):\n    N=N+1\n    return N\n',
        ]
        for code in cases:
            with self.subTest(code=code):
                value = self.changes(code + 'def independent(x): return x\n', 'N=20', 'N=30')
                self.assertEqual(self.functions(value)['independent']['impact'], 'unknown')
                self.assertFalse(value['recommendation']['can_reuse_stages'])

    def test_unsupported_scopes_and_file_bundles_do_not_masquerade_as_resolved(self):
        cases = ['class C:\n    N=1\n', 'values=[x for x in data]\n', 'f=lambda x:x\n',
                 'def f():\n    global N\n    return N\n',
                 'for N in range(2):\n    pass\n', 'try:\n    pass\nexcept Exception as N:\n    pass\n',
                 'def f():\n    with manager() as N:\n        return N\n']
        for code in cases:
            source = self.source('N=20\n' + code)
            value = preview_outline(source)
            self.assertEqual(value['parser'], 'python-3.11-ast-v1')
            self.assertTrue(value['binding_uncertainties'])
        value = preview_outline(self.source('N=20\n', bundle_version=1, files=[{'name': 'vendor.py'}]))
        self.assertEqual(value['parser'], 'python-3.11-ast-v1')
        self.assertTrue(value['binding_uncertainties'])

    def test_ast_and_reference_limits_never_claim_complete_graph(self):
        source = self.source('N=20\ndef f(x): return x+N\n')
        with patch('quant.source_changes.python_bindings.MAX_AST_NODES', 2):
            value = preview_outline(source)
        self.assertNotEqual(value['parser'], PARSER)
        self.assertTrue(value['binding_uncertainties'])
        with patch('quant.source_changes.python_bindings.MAX_REFERENCES', 1):
            value = preview_outline(source)
        self.assertTrue(any('上限' in message for message in value['binding_uncertainties']))

    def test_preview_is_deterministic_and_does_not_change_persisted_outline(self):
        source = self.source('raise RuntimeError("must not execute")\nN=20\nM=N*2\n')
        original = analyze(source)
        before = copy.deepcopy(source)
        scoped = preview_outline(source)
        self.assertEqual(scoped, preview_outline(source))
        self.assertEqual(source, before)
        self.assertEqual(original, analyze(source))
        self.assertEqual(original['parser'], 'python-3.11-ast-v1')
        self.assertEqual(scoped['parser'], PARSER)

    def test_immutable_workflow_preview_retains_original_exact_hash(self):
        old = self.source('N=20\nM=N*2\ndef f(x): return x*M\n')
        new = self.source(old['code'].replace('N=20', 'N=30'))
        original = preview(old, new, {}, scoped=False)
        # Captured with the committed AST-v1 preview, independently of overlay.
        self.assertEqual(digest(original), '41c96564633d98b8cc47f79287719ad8f752c8de04e0064e7030378efb65d6fa')
        baseline = dict(payload=old, analysis={}, run_id='r', source_id='s', source_hash='h', outcome_id='o')
        plan = snippets.plan(new, analyze(new), '', {}, baseline)
        self.assertEqual(plan['change']['structure'], original['structure'])
        current = preview(old, new, {})
        self.assertNotEqual(current['structure'], original['structure'])

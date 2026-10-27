"""Provided files form distinct scopes, with bounded literal import candidates."""
import copy
from unittest.mock import patch
from django.test import SimpleTestCase
from quant.research.contracts import digest
from quant.research.supplements.contracts import build
from quant.source_changes import preview
from quant.source_changes.bundle_imports import BundleLimit
from quant.source_changes.python_bundle import analyze_bundle, analyze_source, model_context, PARSER


def bundle(main, files):
    parent = {'language': 'python', 'code': main}
    return build('parent', digest(parent), parent, {'expected_source_id': 'parent',
        'files': [{'name': name, 'code': code} for name, code in files.items()],
        'reason': '人工提供文件，不运行或安装', 'request_key': 'bundle_fixture_0001', 'analyze': False, 'model_id': ''})


def replace_file(value, name, code):
    return build('current', digest(value), value, {'expected_source_id': 'current',
        'files': [{'name': name, 'code': code}], 'reason': '核对改动',
        'request_key': 'bundle_fixture_0002', 'analyze': False, 'model_id': ''})


class PythonFileBundleTests(SimpleTestCase):
    def impacts(self, first, second):
        return {row['name']: row for row in preview(first, second, {}, bundle=True)['structure']['nodes']}

    def test_from_import_propagates_values_across_files_and_keeps_local_names_distinct(self):
        helper = 'N=20\nM=N*2\ndef calc(x): return x*M\n'
        first = bundle('from helper import calc as h\nN=3\ndef f(x): return h(x)\ndef own(x): return x*N\n', {'helper.py': helper})
        second = replace_file(first, 'helper.py', helper.replace('N=20', 'N=30'))
        graph = analyze_bundle(first)
        self.assertEqual((graph['parser'], graph['status']), (PARSER, 'parsed'))
        self.assertEqual(graph['binding_uncertainties'], [])
        nodes = self.impacts(first, second)
        self.assertEqual(nodes['helper.py::N']['impact'], 'direct')
        for name in ('helper.py::M', 'helper.py::calc', '__source__.py::f'):
            self.assertEqual(nodes[name]['impact'], 'potential')
        self.assertNotEqual(nodes['__source__.py::N']['impact'], 'potential')
        self.assertNotEqual(nodes['__source__.py::own']['impact'], 'potential')
        refs = model_context(graph)['references']
        self.assertTrue(any('helper.py::calc' in row['static_candidates'] and row['owner'] == '__source__.py::f' for row in refs))
        self.assertTrue(any(row['kind'] == 'read' and row['name'] == 'N' for row in refs))

    def test_module_alias_and_dotted_import_attribute_reads_are_linked(self):
        helper = 'N=20\ndef calc(x): return x*N\n'
        for statement, expression in (('import helper as h', 'h.calc(x)+h.N'),
                ('import pkg.helper', 'pkg.helper.calc(x)+pkg.helper.N')):
            filename = 'pkg/helper.py' if 'pkg.' in statement else 'helper.py'
            first = bundle(statement + '\ndef f(x): return '+expression+'\n', {filename: helper})
            nodes = self.impacts(first, replace_file(first, filename, helper.replace('N=20', 'N=30')))
            self.assertEqual(nodes['__source__.py::f']['impact'], 'potential')
            graph = analyze_bundle(first)
            ids = {node['id']: node['name'] for node in graph['nodes']}
            self.assertTrue(any(row['kind'] == 'read' and filename+'::N' in [ids[key] for key in row['candidate_ids']] for row in graph['references']))

    def test_relative_import_and_package_reexport_bind_only_supplied_names(self):
        files = {'pkg/__init__.py': 'from .core import calc\n',
            'pkg/core.py': 'from .base import N\ndef calc(x): return x*N\n', 'pkg/base.py': 'N=20\n'}
        first = bundle('from pkg import calc\ndef f(x): return calc(x)\n', files)
        nodes = self.impacts(first, replace_file(first, 'pkg/base.py', 'N=30\n'))
        self.assertEqual(nodes['pkg/base.py::N']['impact'], 'direct')
        self.assertEqual(nodes['pkg/core.py::calc']['impact'], 'potential')
        self.assertEqual(nodes['__source__.py::f']['impact'], 'potential')

    def test_local_parameter_or_assignment_shadowing_does_not_link_module_alias(self):
        first = bundle('import helper as h\ndef f(h): return h.calc(1)\n'
            'def local():\n    h=3\n    return h\n', {'helper.py': 'N=20\ndef calc(x): return x*N\n'})
        nodes = self.impacts(first, replace_file(first, 'helper.py', 'N=30\ndef calc(x): return x*N\n'))
        self.assertNotEqual(nodes['__source__.py::f']['impact'], 'potential')
        self.assertNotEqual(nodes['__source__.py::local']['impact'], 'potential')

    def test_missing_star_ambiguous_and_dynamic_dependencies_stay_unknown(self):
        examples = [
            ('from missing import calc\ndef f(x): return calc(x)\n', {'helper.py': 'N=20\n'}),
            ('from helper import *\ndef f(x): return calc(x)\n', {'helper.py': 'def calc(x): return x\n'}),
            ('from helper import calc\ndef f(x): return calc(x)\n', {'helper.py': 'def calc(x): return x\n', 'helper/__init__.py': 'def calc(x): return x*2\n'}),
            ('import helper as h\nh=object()\ndef f(x): return h.calc(x)\n', {'helper.py': 'def calc(x): return x\n'}),
            ('from helper import calc\ndef f(x): return calc(x)\n', {'helper.py': 'class C:\n    pass\n'}),
        ]
        for main, files in examples:
            with self.subTest(main=main):
                graph = analyze_bundle(bundle(main, files))
                self.assertTrue(graph['binding_uncertainties'])
                self.assertNotIn('runtime_verified', graph['reference_semantics'])

    def test_cyclic_reexports_and_module_initialization_do_not_loop_or_claim_validity(self):
        first = bundle('from a import f\ndef run(x): return f(x)\n',
            {'a.py': 'from b import f\n', 'b.py': 'from a import f\n'})
        graph = analyze_bundle(first)
        self.assertTrue(any('循环' in row or '导入环' in row for row in graph['binding_uncertainties']))
        self.assertLessEqual(len(graph['references']), 2048)

    def test_file_identity_coordinates_and_assembly_are_verified_without_execution(self):
        first = bundle('raise RuntimeError("must not execute")\nfrom helper import N\n', {'helper.py': 'N=20\n'})
        before = copy.deepcopy(first)
        with patch('builtins.open', side_effect=AssertionError('host path was opened')):
            graph = analyze_bundle(first)
        self.assertEqual(graph, analyze_bundle(first)); self.assertEqual(first, before)
        for mutate in (lambda value: value['files'][1].update(content_hash='0'*64),
                lambda value: value['files'][1].update(start_line=True),
                lambda value: value['files'][1].update(name='../helper.py'),
                lambda value: value.update(code=value['code']+'# unbound\n')):
            bad = copy.deepcopy(first); mutate(bad)
            rejected = analyze_bundle(bad)
            self.assertEqual(rejected['status'], 'unparsed')
            self.assertEqual(rejected['nodes'], [])

    def test_budget_caps_preserve_full_source_and_never_publish_partial_as_complete(self):
        first = bundle('from helper import N\ndef f(x): return x*N\n', {'helper.py': 'N=20\n'})
        for target in ('quant.source_changes.python_bundle.MAX_AST_NODES', 'quant.source_changes.python_bundle.MAX_NODES', 'quant.source_changes.python_bundle.MAX_IMPORTS'):
            with patch(target, 0):
                graph = analyze_bundle(first)
            self.assertEqual(graph['status'], 'limited'); self.assertEqual(graph['nodes'], [])
        with patch('quant.source_changes.bundle_imports.ImportResolver.tick', side_effect=BundleLimit('工作量上限')):
            self.assertEqual(analyze_bundle(first)['status'], 'limited')
        self.assertEqual(analyze_source(first)['code_hash'], digest(first['code']))

    def test_old_workflow_preview_stays_frozen_and_first_file_keeps_identity(self):
        main = 'from helper import calc\ndef f(x): return calc(x)\n'
        before = {'code': main, 'language': 'python'}
        after = bundle(main, {'helper.py': 'def calc(x): return x+1\n'})
        legacy = preview(before, after, {}, scoped=True)
        current = preview(before, after, {}, scoped=True, bundle=True)
        self.assertNotEqual(legacy['structure']['new_parser'], PARSER)
        nodes = {row['name']: row for row in current['structure']['nodes']}
        self.assertEqual(nodes['__source__.py::f']['change'], 'moved')
        self.assertEqual(nodes['__source__.py::f']['impact'], 'potential')
        self.assertFalse(current['recommendation']['can_reuse_stages'])

    def test_parameters_are_not_function_values_but_closure_ownership_is_explicit(self):
        main = 'def outer(x=1):\n    def inner(y=x): return y+x\n    return inner()\n'
        first = bundle(main, {'helper.py': 'N=20\n'})
        graph = analyze_bundle(first)
        self.assertTrue(all(not row['candidate_ids'] for row in graph['references'] if row['name'] in ('x', 'y')))
        names = {row['id']: row['name'] for row in graph['nodes']}
        ownership = [row for row in graph['references'] if row['name'] == '<形参所属函数>:x']
        self.assertTrue(ownership)
        self.assertTrue(all(names[key] == '__source__.py::outer' for row in ownership for key in row['candidate_ids']))
        second = bundle(main.replace('x=1', 'x=2'), {'helper.py': 'N=20\n'})
        self.assertEqual(self.impacts(first, second)['__source__.py::inner']['impact'], 'potential')

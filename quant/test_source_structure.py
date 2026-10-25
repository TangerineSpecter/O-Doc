"""Language fixtures assert coordinates, complete source retention and honest limits."""
from django.test import SimpleTestCase
from quant.source_structure import analyze, model_context
from quant.source_structure.common import source_lines
from quant.research.contracts import digest


class SourceStructureTests(SimpleTestCase):
    def structure(self, language, code):
        value = analyze({'language': language, 'code': code})
        lines = source_lines(code)
        cursor = 1
        for part in value['slices']:
            self.assertEqual(part['start_line'], cursor)
            text = ''.join(lines[part['start_line'] - 1:part['end_line']])
            self.assertEqual(part['content_hash'], digest(text))
            cursor = part['end_line'] + 1
        self.assertEqual(cursor - 1, len(lines))
        self.assertEqual(value['code_hash'], digest(code))
        return value

    def test_python_nested_definitions_decorators_and_default_scope(self):
        code = 'import os as operating\nN=20\ndef window(x):\n    return x\n@decorate(window(1))\ndef factor(close=window(2)):\n    def local(x):\n        return window(x)\n    return local(close)\nraise RuntimeError("never execute")\n'
        value = self.structure('python', code)
        self.assertEqual(value['status'], 'parsed')
        nodes = {row['name']: row for row in value['nodes']}
        self.assertEqual((nodes['factor']['start_line'], nodes['factor']['end_line']), (5, 9))
        self.assertEqual(nodes['local']['parent_id'], nodes['factor']['id'])
        calls = [row for row in value['references'] if row['kind'] == 'call']
        for row in calls:
            if row['line'] in (5, 6): self.assertEqual(row['from_id'], nodes['<module>']['id'])
        nested = next(row for row in calls if row['line'] == 8)
        self.assertEqual(nested['from_id'], nodes['local']['id'])
        self.assertEqual(nested['candidate_ids'], [nodes['window']['id']])
        self.assertEqual(value['imports'][0]['name'], 'os')
        self.assertEqual(value['imports'][0]['status'], 'external_not_loaded')
        self.assertEqual(model_context(value)['calls_omitted'], 0)

    def test_dynamic_and_shadowed_names_are_not_proven_dependencies(self):
        value = self.structure('python', 'def f(): return 1\ndef f(): return 2\ndef g(f):\n    return f() + obj.f() + factory()()\n')
        calls = [row for row in value['references'] if row['kind'] == 'call']
        self.assertEqual(len(next(row for row in calls if row['name'] == 'f')['candidate_ids']), 2)
        self.assertEqual(next(row for row in calls if row['name'] == 'obj.f')['candidate_ids'], [])
        self.assertIn('<动态调用>', [row['name'] for row in calls])
        self.assertEqual(value['reference_semantics'], 'syntactic_name_candidates_not_runtime_dependencies')

    def test_python_errors_and_unknown_languages_keep_every_line(self):
        for language, code, status in [('python', 'def broken(:\n  x=1\n', 'unparsed'),
                                      ('unknown', 'alpha(x) {\n未知代码\n}\n', 'unsupported'),
                                      ('python', ' \n\n', 'no_code')]:
            with self.subTest(language=language):
                value = self.structure(language, code)
                self.assertEqual(value['status'], status)
                self.assertFalse(value['nodes'])

    def test_pine_functions_multiline_comments_and_qualified_calls(self):
        code = '// fake(x) => x\n//@version=6\nf(x) =>\n    ta.sma(x, 20)\ng(\n    float x) => f(x)\nplot(g(close), title="fake(z) => z")\n'
        value = self.structure('pine', code)
        self.assertEqual(value['status'], 'partial')
        functions = [row for row in value['nodes'] if row['kind'] == 'function']
        self.assertEqual([(row['name'], row['start_line'], row['end_line']) for row in functions], [('f', 3, 4), ('g', 5, 6)])
        calls = [row for row in value['references'] if row['kind'] == 'call']
        self.assertIn('ta.sma', [row['name'] for row in calls])
        self.assertNotIn('fake', [row['name'] for row in calls])

    def test_mql4_braces_strings_includes_and_control_blocks(self):
        code = '#include <Math\\Stat.mqh>\n// double Fake() { }\ninput int N=20;\ndouble Mean(double x) { return x; }\nvoid OnTick() {\n if(N>0) { Print("fake() { }"); Mean(Close[0]); }\n}\n'
        value = self.structure('mql4', code)
        self.assertEqual([row['name'] for row in value['nodes']], ['<module>', 'Mean', 'OnTick', 'N'])
        self.assertEqual(value['nodes'][-1]['kind'], 'parameter')
        self.assertEqual(value['imports'][0]['name'], 'Math\\Stat.mqh')
        self.assertEqual(value['imports'][0]['line'], 1)
        call = next(row for row in value['references'] if row['kind'] == 'call' and row['name'] == 'Mean')
        self.assertEqual(call['from_id'], value['nodes'][2]['id'])
        self.assertEqual(call['candidate_ids'], [value['nodes'][1]['id']])

    def test_tongdaxin_formula_references_and_unfinished_tail(self):
        code = '{fake:=MA(C,1);}\nFAST:=MA(CLOSE,5);\nSIGNAL:CROSS(FAST,MA(CLOSE,20)),COLORRED;\n未完成:=FAST\n'
        value = self.structure('tongdaxin', code)
        self.assertEqual([row['name'] for row in value['nodes']], ['<module>', 'FAST', 'SIGNAL'])
        linked = [row for row in value['references'] if row['name'] == 'FAST' and row['line'] == 3]
        self.assertEqual(linked[0]['candidate_ids'], [value['nodes'][1]['id']])
        self.assertTrue(any('末尾' in row['message'] for row in value['diagnostics']))

    def test_malformed_lexical_input_keeps_source_without_fake_boundaries(self):
        for code in ('void F(){', 'void F(){Print("unterminated);}', 'void F(){ /* unclosed'):
            value = self.structure('mql4', code)
            self.assertEqual(value['status'], 'unparsed')
            self.assertEqual(value['nodes'], [])

    def test_resource_limits_are_explicit_and_slices_remain_complete(self):
        value = self.structure('python', '\n'.join(f'def f{i}(): return {i}' for i in range(300)))
        self.assertEqual(len(value['nodes']), 256)
        self.assertTrue(any('256' in row['message'] for row in value['diagnostics']))
        value = self.structure('text', 'x\r\n' * 600)
        self.assertEqual(len(value['slices']), 3)
        self.assertEqual(value['line_count'], 600)

    def test_declared_bindings_remain_candidates_and_macro_bodies_are_not_functions(self):
        python = self.structure('python', 'N=20\ndef f(x): return x + N\n')
        self.assertEqual(next(row for row in python['nodes'] if row['name'] == 'N')['kind'], 'variable')
        reference = next(row for row in python['references'] if row['name'] == 'N')
        self.assertEqual(len(reference['candidate_ids']), 1)
        pine = self.structure('pine', 'N = input.int(20)\nx = ta.sma(\n    close, N)\nplot(x)\n')
        self.assertEqual([(row['name'], row['kind']) for row in pine['nodes'][1:]], [('N', 'parameter'), ('x', 'variable')])
        self.assertEqual(pine['nodes'][-1]['end_line'], 3)
        mql = self.structure('mql4', '#define WRAPPER \\\n fake() {}\n#import "library.dll"\ndouble Func();\n#import\nvoid OnTick() {}\n')
        self.assertNotIn('fake', [row['name'] for row in mql['nodes']])
        self.assertEqual(mql['imports'][0]['name'], 'library.dll')

    def test_physical_lines_ignore_unicode_separators_and_support_cr_sources(self):
        for newline in ('\n', '\r\n', '\r'):
            with self.subTest(newline=repr(newline)):
                code = newline.join(['text = "a\u2028b\x0cc"', 'def factor(x):', '    return x'])
                value = self.structure('python', code)
                self.assertEqual(value['line_count'], 3)
                factor = next(row for row in value['nodes'] if row['name'] == 'factor')
                self.assertEqual((factor['start_line'], factor['end_line']), (2, 3))
                from quant.workflows.prompts import prompt
                import json
                request = prompt('identify', {'code': code, 'language': 'python'}, '', {'normalize': {'structure': value}}, 2)
                source = json.loads(request.split('\n材料：', 1)[1])['source']['code']
                self.assertIn('2: def factor(x):', source)
                self.assertNotIn('4:', source)
                pine = self.structure('pine', newline.join(['// ignored', 'n = input.int(20)', 'f(x) => x + n']))
                self.assertEqual(pine['line_count'], 3)
                self.assertEqual({row['name']: row['start_line'] for row in pine['nodes'] if row['kind'] != 'module'}, {'f': 3, 'n': 2})
                mql = self.structure('mql4', newline.join(['// ignored', '#include "a.mqh"', '#define WRAPPER \\', ' fake() {}', 'void OnTick() {}']))
                self.assertEqual(mql['imports'][0]['line'], 2)
                self.assertEqual([row['name'] for row in mql['nodes']], ['<module>', 'OnTick'])

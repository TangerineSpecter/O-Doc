"""AI must review exactly the selected new facts; history stays frozen."""
import copy
import json
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.source_structure import analyze
from quant.source_changes.review import facts, from_review, extension, validate_admission, encode, markdown
from quant.workflows import snippets


def artificial_review(fixed):
    return {'source_change_assessment': {'summary': '人工响应：需要结合新原文重新核查。',
        'nodes': [{'node_id': node['id'], 'analysis': '该节点的静态线索需要结合原文核对。',
            'verification_needed': '尚需运行时与时间对齐验证。'} for node in fixed['nodes']],
        'limitations': ['静态绑定不证明运行时依赖或最优参数。']}}


class SourceChangeReviewTests(SimpleTestCase):
    def make(self, code='N=20\nM=N*2\ndef f(x): return x*M\n', change=True):
        old = {'language': 'python', 'code': code}
        new = {**old, 'code': code.replace('N=20', 'N=30')} if change else old
        baseline = dict(run_id='r1', source_id='s1', source_hash=digest(old), outcome_id='', payload=old, analysis={})
        plan = snippets.plan(new, analyze(new), '', {}, baseline, version=2)
        return old, new, plan, facts(new, plan)

    def test_scoped_transitive_facts_publish_ai_assessment_without_score_promotion(self):
        old, source, plan, fixed = self.make()
        self.assertEqual(fixed['new_parser'], 'python-3.11-scoped-preview-v1')
        self.assertEqual({row['name']: row['impact'] for row in fixed['nodes']}, {'N': 'direct', 'M': 'potential', 'f': 'potential'})
        result = from_review(artificial_review(fixed), source, plan)
        self.assertEqual(result, extension(result))
        self.assertEqual(json.loads(result['source_change_facts_json']), fixed)
        validate_admission(result, 18)
        self.assertIn('源码变化影响复核', '\n'.join(markdown(result)))
        self.assertNotIn('scores', result)
        self.assertEqual(fixed['baseline']['source_hash'], digest(old))

    def test_missing_duplicate_extra_and_incomplete_reviews_rejected(self):
        _, source, plan, fixed = self.make()
        for mutate in (lambda v: v.pop('source_change_assessment'),
                lambda v: v['source_change_assessment']['nodes'].pop(),
                lambda v: v['source_change_assessment']['nodes'].append(v['source_change_assessment']['nodes'][0]),
                lambda v: v['source_change_assessment']['nodes'][0].update(node_id='foreign-node'),
                lambda v: v['source_change_assessment']['nodes'][0].update(verification_needed=''),
                lambda v: v['source_change_assessment'].update(limitations=[])):
            value = artificial_review(fixed); mutate(value)
            with self.assertRaises(ValidationError): from_review(value, source, plan)

    def test_server_copied_facts_cannot_be_rehashed_or_bool_coerced(self):
        _, source, plan, fixed = self.make()
        result = from_review(artificial_review(fixed), source, plan)
        for mutate in (lambda v: v.update(target_source_hash='0'*64),
                lambda v: v['counts'].update(direct=True),
                lambda v: v['nodes'][0].update(impact='unknown'),
                lambda v: v['baseline'].update(source_id='foreign')):
            bad = copy.deepcopy(fixed); mutate(bad)
            incoming = {**result, 'source_change_facts_json': encode(bad)}
            with self.assertRaises(ValidationError): from_review(incoming, source, plan)
        bad = {**result, 'source_change_review_version': True}
        with self.assertRaises(ValidationError): extension(bad)

    def test_unchanged_payload_has_explicit_facts_and_no_invented_node_review(self):
        _, source, plan, fixed = self.make(change=False)
        self.assertEqual(fixed['status'], 'identical')
        self.assertEqual(fixed['nodes'], [])
        self.assertEqual(from_review(artificial_review(fixed), source, plan)['source_change_review_version'], 1)

    def test_old_workflows_and_old_snippet_plan_cannot_add_new_assessment(self):
        _, source, plan, fixed = self.make()
        result = from_review(artificial_review(fixed), source, plan)
        for version in (0, 1, 3, 16, 17):
            with self.assertRaises(ValidationError): validate_admission(result, version)
            validate_admission({'summary': 'old'}, version)
        with self.assertRaises(ValidationError): validate_admission({'summary': 'new but missing facts'}, 18)
        with self.assertRaises(ValidationError): facts(source, {**plan, 'version': 1})
        with self.assertRaises(ValidationError): facts(source, {**plan, 'change': None})

    def test_complete_record_omission_and_unknowns_are_visible(self):
        code = 'N=20\n' + ''.join(f'v{i}=N*{i}\n' for i in range(70))
        _, source, plan, fixed = self.make(code)
        self.assertEqual(fixed['eligible_nodes'], 71)
        self.assertLessEqual(len(fixed['nodes']), 24)
        self.assertEqual(len(fixed['nodes']) + fixed['omitted_nodes'], 71)
        self.assertLessEqual(len(encode(fixed)), 18000)
        result = from_review(artificial_review(fixed), source, plan)
        self.assertIn('另省略', '\n'.join(markdown(result)))
        _, _, _, unknown = self.make('N=20\ndef f(obj): return obj.method(N)\ndef unrelated(x): return x\n')
        self.assertEqual(next(row for row in unknown['nodes'] if row['name'] == 'unrelated')['impact'], 'unknown')

    def test_output_binding_and_plan_inputs_remain_immutable(self):
        _, source, plan, fixed = self.make()
        before = copy.deepcopy((source, plan, fixed))
        raw = artificial_review(fixed)
        result = from_review(raw, source, plan)
        result['source_change_assessment']['nodes'][0]['analysis'] = 'client changed'
        self.assertEqual((source, plan, fixed), before)
        self.assertNotEqual(raw['source_change_assessment']['nodes'][0]['analysis'], 'client changed')

    def test_plan3_uses_facts2_and_literal_names_without_rewriting_old_report(self):
        old, source, plan2, fixed1 = self.make('N=20\n__value__=N*2\ndef __calc__(x): return x*__value__\n')
        old_result = from_review(artificial_review(fixed1), source, plan2)
        baseline = {**plan2['baseline'], 'payload': old, 'analysis': {}}
        plan3 = snippets.plan(source, analyze(source), '', {}, baseline, version=3)
        fixed2 = facts(source, plan3)
        result = from_review(artificial_review(fixed2), source, plan3)
        self.assertEqual(fixed2['version'], 2)
        self.assertEqual(result['source_change_review_version'], 2)
        self.assertIn('### `__source__.py::__value__`', '\n'.join(markdown(result)))
        self.assertIn('### __value__', '\n'.join(markdown(old_result)))
        self.assertEqual(old_result['source_change_review_version'], 1)
        validate_admission(result, 20)
        with self.assertRaises(ValidationError): validate_admission(old_result, 20)
        with self.assertRaises(ValidationError): validate_admission(result, 18)

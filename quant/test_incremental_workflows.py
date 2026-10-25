"""Local reading reuse is exact and scoped; full reports remain newly reviewed."""
import copy
import json
from unittest import TestCase as PureTestCase
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant import test_research_analysis as fixtures
from quant.models import AIRun, Entry, Job, ResearchReport, SourceRevision, WorkflowStep
from quant.research.contracts import digest
from quant.source_structure import analyze
from quant.sync import metadata, validate, reset_execution
from quant.worker import execute
from quant.workflows import snippets
from quant.workflows.runner import model_identity
from utils.sync_manager import SyncManager, SyncError


def local_answer(value):
    return {'units': [{'input_hash': item['input_hash'], 'observations': [
        {'quote': item['code'].splitlines()[0], 'start_line': 1, 'end_line': 1, 'reading': '局部文本的人工模拟解读'}],
        'unknowns': ['全局行为尚待结合整份源码核对']} for item in value['units']]}


class LocalReadingContractTests(PureTestCase):
    def make(self, code, baseline=None, **changes):
        payload = {'code': code, 'language': 'python'} | changes
        value = snippets.plan(payload, analyze(payload), '核查时序', {'configuration_hash': 'test'}, baseline)
        return payload, value

    def test_exact_inputs_reuse_with_new_positions_but_not_config_or_model(self):
        code = 'N=20\ndef first(x):\n    return x + 1\ndef second(x):\n    return x * 2\n'
        payload, old = self.make(code)
        answer = local_answer(json.loads(snippets.prompt(payload, old, '核查时序').split('材料：', 1)[1]))
        output = snippets.assemble(answer, payload, old)
        baseline = dict(run_id='old', source_id='s1', source_hash=digest(payload), outcome_id='o1', output=output, payload=payload, analysis={})
        new_payload, new = self.make(code.replace('N=20', 'N=20\n# Added line'), baseline)
        self.assertEqual(sum(bool(row['reused_from']) for row in new['units']), len(old['units']))
        self.assertEqual(new['units'][-1]['locations'][0]['start_line'], old['units'][-1]['locations'][0]['start_line'] + 1)
        pending = json.loads(snippets.prompt(new_payload, new, '核查时序').split('材料：', 1)[1])
        self.assertEqual(len(pending['units']), 1)
        combined = snippets.assemble(local_answer(pending), new_payload, new, baseline)
        snippets.validate_output(combined, new_payload, new, baseline)
        for changes in ({'parameters': 'N=25'}, {'language_version': 'different'}, {'dependencies': 'different'}):
            _, changed = self.make(code, baseline, **changes)
            self.assertFalse(any(row['reused_from'] for row in changed['units']))
        changed = snippets.plan(payload, analyze(payload), '不同关注点', {'configuration_hash': 'test'}, baseline)
        self.assertFalse(any(row['reused_from'] for row in changed['units']))
        changed = snippets.plan(payload, analyze(payload), '核查时序', {'configuration_hash': 'different'}, baseline)
        self.assertFalse(any(row['reused_from'] for row in changed['units']))

    def test_invalid_quotes_unknown_keys_and_partial_answers_rejected(self):
        payload, value = self.make('N=20\ndef first(x): return x\n')
        good = local_answer(json.loads(snippets.prompt(payload, value, '核查时序').split('材料：', 1)[1]))
        for mutate in (lambda v: v['units'].pop(), lambda v: v['units'][0].update(input_hash='foreign'),
                lambda v: v['units'][0]['observations'][0].update(quote='not in source'),
                lambda v: v['units'][0]['observations'][0].update(start_line=True)):
            bad = copy.deepcopy(good); mutate(bad)
            with self.assertRaises(ValidationError): snippets.assemble(bad, payload, value)

    def test_resource_bounds_and_no_code_need_no_model(self):
        payload, value = self.make('\n'.join(f'def f{i}(x): return x+{i}' for i in range(100)))
        self.assertEqual(len(value['units']), 48)
        self.assertGreater(value['omitted'], 0)
        self.assertLessEqual(value['selected_chars'], 40000)
        payload, value = self.make('')
        self.assertEqual(snippets.assemble({'units': []}, payload, value)['units'], [])

    def test_non_python_fragments_are_local_text_not_resolved_dependencies(self):
        for language, code in [('pine', '//@version=5\nindicator("x")\nplot(close)\n'),
                ('mql4', 'input int N=20;\nvoid OnTick(){ Print(N); }\n'), ('unknown', 'unparsed material\n')]:
            payload, value = self.make(code, language=language)
            answer = local_answer(json.loads(snippets.prompt(payload, value, '核查时序').split('材料：', 1)[1]))
            output = snippets.assemble(answer, payload, value)
            self.assertEqual(output['scope'], 'local_text_only_not_runtime_semantics')
            self.assertGreater(len(output['units']), 0)

    def test_global_projection_omits_whole_records_with_explicit_counts(self):
        payload, value = self.make('\n'.join(f'def f{i}(x): return x + {i}' for i in range(48)))
        pending = json.loads(snippets.prompt(payload, value, '核查时序').split('材料：', 1)[1])
        answer = local_answer(pending)
        for row in answer['units']:
            row['observations'] = [dict(row['observations'][0], reading='局部意见' * 190)] * 4
            row['unknowns'] = ['未知事项' * 190] * 4
        output = snippets.assemble(answer, payload, value)
        projected = snippets.prompt_context(output, value)
        self.assertLessEqual(len(json.dumps(projected, ensure_ascii=False)), 48000)
        self.assertGreater(projected['model_units_omitted'], 0)
        self.assertEqual(len(projected['units']) + projected['model_units_omitted'], len(output['units']))
        bad = dict(output, version=True)
        with self.assertRaises(ValidationError): snippets.validate_output(bad, payload, value)


class IncrementalWorkflowTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp

    def seed(self):
        self.entry = Entry.objects.create(anthology=self.collection, title='增量源码研究')
        self.base = f'/api/quant/{self.collection.pk}/entries/{self.entry.pk}/'
        self.code = self.payload['code'] + '\n\ndef independent(x):\n    return x * 2\n'
        saved = self.client.post(self.base + 'implementations/', {'name': 'Python', 'language': 'python', 'code': self.code}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.implementation_id = saved.data['data']['id']
        self.source = SourceRevision.objects.get(material__entry=self.entry)
        old = self.start(self.source, 'incremental_baseline_0001')
        self.finish(old)
        return old

    def version(self, code):
        saved = self.client.post(self.base + f'implementations/{self.implementation_id}/versions/', {'code': code, 'language': 'python'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        return SourceRevision.objects.get(code_version_id=saved.data['data']['id'])

    def start(self, source, key, old=None, **extra):
        response = self.client.post(self.base + 'runs/', {'kind': 'analyze', 'source_id': source.pk,
            'model_id': self.model.pk, 'request_key': key, **({'resume_run_id': old.pk} if old else {}), **extra}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return AIRun.objects.get(pk=response.data['data']['id'])

    def finish(self, run, fail_snippets=False):
        def answer(_config, text, **kwargs):
            if '源码片段静态解读员' in text:
                if fail_snippets: return '{"units": []}'
                return json.dumps(local_answer(json.loads(text.split('材料：', 1)[1])))
            return json.dumps(fixtures.result())
        with patch('quant.worker.complete', side_effect=answer) as model:
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed' if fail_snippets else 'completed', run.error)
        return model

    def test_first_incremental_then_exact_partial_reuse_and_new_report(self):
        old = self.seed()
        original = copy.deepcopy(ResearchReport.objects.get(run=old).data)
        source2 = self.version(self.code.replace('x * 2', 'x * 3'))
        run2 = self.start(source2, 'incremental_first_0001', old)
        self.assertEqual(run2.workflow_version, 15)
        self.assertEqual(self.finish(run2).call_count, 7)
        source3 = self.version(self.code.replace('x * 2', 'x * 4'))
        run3 = self.start(source3, 'incremental_second_0001', run2)
        model = self.finish(run3)
        self.assertEqual(model.call_count, 7)
        step = run3.workflow_steps.get(stage='snippets')
        value = step.input['snippet_plan']
        self.assertGreater(sum(bool(unit['reused_from']) for unit in value['units']), 0)
        local_prompt = next(call.args[1] for call in model.call_args_list if '源码片段静态解读员' in call.args[1])
        pending = json.loads(local_prompt.split('材料：', 1)[1])
        self.assertEqual(len(pending['units']), 1)
        self.assertIn('x * 4', pending['units'][0]['code'])
        self.assertNotIn('N=20', local_prompt)
        # Holistic stages never inherit scores or whole-source results.
        self.assertTrue(all(not row.outcome.data['reused_from'] for row in run3.workflow_steps.select_related('outcome')))
        self.assertIn('local_reading_and_source_changes', model.call_args_list[-2].args[1])
        detail = self.client.get(self.base + 'runs/' + run3.pk + '/').json()['data']['workflow']
        self.assertEqual((detail['maxModelCalls'], detail['maxSeconds'], len(detail['stages'])), (8, 960, 11))
        self.assertGreater(detail['localReading']['reused'], 0)
        self.assertEqual(ResearchReport.objects.get(run=old).data, original)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        reset_execution()
        with patch('quant.worker.dispatch') as dispatch:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        dispatch.assert_not_called(); self.assertFalse(Job.objects.exists())
        # Same request key must still recover exactly this new run.
        self.assertEqual(self.start(source3, 'incremental_second_0001', run2).pk, run3.pk)

    def test_unchanged_text_skips_optional_call_and_restores_old_contract(self):
        old = self.seed()
        source2 = self.version(self.code + '# v2\n')
        second = self.start(source2, 'incremental_metadata_01', old); self.finish(second)
        # A new code-version note changes source identity but not local text.
        saved = self.client.post(self.base + f'implementations/{self.implementation_id}/versions/',
            {'code': self.code + '# v2\n', 'note': 'new metadata', 'language': 'python'}, format='json')
        source3 = SourceRevision.objects.get(code_version_id=saved.data['data']['id'])
        third = self.start(source3, 'incremental_metadata_02', second)
        self.assertEqual(self.finish(third).call_count, 6)
        self.assertTrue(all(unit['reused_from'] for unit in third.workflow_steps.get(stage='snippets').input['snippet_plan']['units']))
        self.assertEqual(old.workflow_version, 14)
        self.assertEqual(old.workflow_steps.count(), 10)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_failed_local_reading_never_publishes_and_resumes(self):
        old = self.seed(); source = self.version(self.code + '# v2\n')
        run = self.start(source, 'incremental_fail_00001', old)
        self.finish(run, fail_snippets=True)
        self.assertFalse(ResearchReport.objects.filter(run=run).exists())
        retry = self.start(source, 'incremental_retry_0001', run)
        self.finish(retry)
        validate(SyncManager().build_snapshot_data(), metadata(SyncManager().build_snapshot_data()))

    def test_same_source_resume_and_restart_keep_frozen_baseline_and_prompt_inputs(self):
        old = self.seed(); source = self.version(self.code + '# v2\n')
        current = self.start(source, 'incremental_freeze_001', old)
        def failed(_config, text, **kwargs):
            if '源码片段静态解读员' in text: return json.dumps(local_answer(json.loads(text.split('材料：', 1)[1])))
            if '“研究分析”' in text: raise RuntimeError('isolated model failure')
            return json.dumps(fixtures.result())
        with patch('quant.worker.complete', side_effect=failed): execute(current.pk)
        current.refresh_from_db(); self.assertEqual(current.status, 'failed')
        retry = self.start(source, 'incremental_freeze_002', current)
        self.assertEqual(self.finish(retry).call_count, 4)
        for stage in ('normalize', 'snippets', 'identify', 'parameters'):
            self.assertEqual(retry.workflow_steps.get(stage=stage).outcome.data['reused_from'], current.workflow_steps.get(stage=stage).outcome.pk)
        # An explicit plan rerun has exactly one model call and cannot silently
        # move the original old->new source-change context to a newer baseline.
        again = self.start(source, 'incremental_freeze_003', retry, restart_stage='plan')
        self.assertEqual(self.finish(again).call_count, 1)
        self.assertEqual(again.workflow_steps.get(stage='snippets').input, retry.workflow_steps.get(stage='snippets').input)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_rehashed_input_or_reused_observation_is_rejected(self):
        old = self.seed(); source2 = self.version(self.code + '# v2\n')
        second = self.start(source2, 'incremental_tamper_001', old); self.finish(second)
        source3 = self.version(self.code.replace('x * 2', 'x * 4') + '# v2\n')
        third = self.start(source3, 'incremental_tamper_002', second); self.finish(third)
        snapshot = SyncManager().build_snapshot_data()
        # Replay validation must reject tampering even on a device that has no
        # local step/outcome snapshots to compare against.
        step = third.workflow_steps.get(stage='snippets')
        WorkflowStep.objects.all().delete()
        validate(snapshot, metadata(snapshot))
        bad = copy.deepcopy(snapshot)
        row = next(item for item in bad if item['model'] == 'quant.workflowstep' and item['pk'] == step.pk)
        row['fields']['input']['snippet_plan']['units'][0]['input_hash'] = 'f' * 64
        row['fields']['content_hash'] = digest(row['fields']['input'])
        with self.assertRaises(SyncError): validate(bad, metadata(bad))
        bad = copy.deepcopy(snapshot)
        row = next(item for item in bad if item['model'] == 'quant.workflowstep' and item['pk'] == step.pk)
        row['fields']['input']['snippet_plan']['version'] = True
        row['fields']['content_hash'] = digest(row['fields']['input'])
        with self.assertRaises(SyncError): validate(bad, metadata(bad))
        bad = copy.deepcopy(snapshot)
        outcome = next(item for item in bad if item['model'] == 'quant.workflowoutcome' and item['fields']['step'] == step.pk)
        reused_key = next(unit['input_hash'] for unit in step.input['snippet_plan']['units'] if unit['reused_from'])
        next(item for item in outcome['fields']['data']['output']['units'] if item['input_hash'] == reused_key)['observations'][0]['reading'] = '伪造沿用解释'
        outcome['fields']['content_hash'] = digest(outcome['fields']['data'])
        with self.assertRaises(SyncError): validate(bad, metadata(bad))

    def test_no_cross_material_or_cross_entry_baseline(self):
        old = self.seed()
        saved = self.client.post(self.base + 'implementations/', {'name': 'different', 'code': self.code, 'language': 'python'}, format='json')
        source = SourceRevision.objects.get(code_version_id=saved.data['data']['current_version_id'])
        reply = self.client.post(self.base + 'runs/', {'kind': 'analyze', 'source_id': source.pk,
            'resume_run_id': old.pk, 'request_key': 'incremental_foreign_01'}, format='json')
        self.assertEqual(reply.status_code, 400)
        other = Entry.objects.create(anthology=self.collection, title='独立研究条目')
        base = f'/api/quant/{self.collection.pk}/entries/{other.pk}/'
        self.client.post(base + 'implementations/', {'name': 'other', 'code': self.code, 'language': 'python'}, format='json')
        foreign = SourceRevision.objects.get(material__entry=other)
        reply = self.client.post(base + 'runs/', {'kind': 'analyze', 'source_id': foreign.pk,
            'resume_run_id': old.pk, 'request_key': 'incremental_foreign_02'}, format='json')
        self.assertEqual(reply.status_code, 404)

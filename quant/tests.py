import asyncio
import hashlib
import json
import tempfile
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import serializers
from django.core.exceptions import ValidationError as ModelValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from anthology.models import Anthology
from assets.models import Asset
from system_settings.models import AIModel, AIProvider, SystemSetting
from utils.bounded_completion import AIOutputTruncated, AIRequestTimeout
from utils.sync_manager import SyncError, SyncManager
from .models import AIRun, Attachment, Backtest, CodeVersion, Entry, Implementation, Job, ResearchReport
from .services import create_implementation, parse_result, save_version
from .sync import SCHEMA_VERSION, metadata, reset_execution, validate
from .worker import execute, prompt, recover


class QuantTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_superuser('admin', 'quant@test.invalid', 'test')
        self.other = get_user_model().objects.create_user('quant-other')
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.collection = Anthology.objects.create(type='quant', title='量化研究', permission='private', user_id='admin')
        self.entry = Entry.objects.create(anthology=self.collection, title='均线斜率', tags=['动量'])
        provider = AIProvider.objects.create(name='隔离测试', type='OpenAi', base_url='https://unused.invalid/v1', api_key='test-key')
        self.model = AIModel.objects.create(provider=provider, name='test-chat', type='chat')
        SystemSetting.objects.update_or_create(key='system_ai_config', defaults={'value': {'defaultChatModelId': self.model.pk}})
        self.directory = tempfile.TemporaryDirectory(prefix='odoc-quant-test-')
        self.addCleanup(self.directory.cleanup)
        self.override = override_settings(MEDIA_ROOT=Path(self.directory.name), QUANT_DISABLE_WORKERS=True)
        self.override.enable()
        self.addCleanup(self.override.disable)

    def url(self, suffix='', entry=None):
        if entry is False:
            return f'/api/quant/{self.collection.pk}/{suffix}'
        return f'/api/quant/{self.collection.pk}/entries/{(entry or self.entry).pk}/{suffix}'

    def implementation(self, entry=None):
        return create_implementation(entry or self.entry, {'name': 'Python 原版', 'language': 'python',
            'language_version': '3.11', 'dependencies': 'pandas', 'parameters': 'window=20',
            'code': 'def factor(close):\n    return close.pct_change(20)\n'})

    def asset(self, name='factor.py', content=b'def factor(x):\n    return x\n', owner='admin', path=None):
        target = Path(settings.MEDIA_ROOT) / name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(content)
        return Asset.objects.create(id=hashlib.md5(name.encode()).hexdigest(), name=name, original_name=name,
            file_type='code', file_size=len(content), file_path=path or name, file_extension=target.suffix,
            mime_type='text/plain', uploader=owner, file_hash=hashlib.md5(content).hexdigest(), source_type='quant')

    def queue(self, implementation=None, kind='convert', **extra):
        impl = implementation or self.implementation()
        body = {'request_key': 'test_request_key_0001', 'kind': kind, 'source_version_id': impl.current_version_id,
                'target_language': 'pine', 'target_version': '6', **extra}
        response = self.client.post(self.url('runs/'), body, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return AIRun.objects.get(pk=response.data['data']['id']), body

    def snapshot(self):
        models = [Anthology, Asset, Entry, Implementation, CodeVersion, Backtest, Attachment, AIRun]
        return json.loads(serializers.serialize('json', [obj for model in models for obj in model.objects.all()]))

    def result(self):
        return {'code': '//@version=6\nindicator("动量")\nplot(close / close[20] - 1)',
                'explanation': '二十期收益率', 'differences': '按 bar 计算', 'assumptions': '使用收盘价',
                'dependencies': '', 'limitations': '尚未编译、运行及核对结果'}

    def test_minimal_entry_create_edit_search_and_detail(self):
        response = self.client.post(self.url('entries/', entry=False), {'title': '仅标题'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        entry = Entry.objects.get(pk=response.data['data']['id'])
        self.assertEqual(entry.kind, 'factor')
        response = self.client.patch(self.url(entry=entry), {'content': '# 逻辑', 'tags': ['趋势', '趋势'], 'source_url': 'https://example.invalid/source'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['tags'], ['趋势'])
        result = self.client.get(self.url('entries/', entry=False), {'q': '趋势'})
        self.assertEqual(len(result.data['data']), 1)
        self.assertIn('implementations', self.client.get(self.url(entry=entry)).data['data'])
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 2)
        self.assertEqual(self.client.patch(self.url(), {'source_url': 'ftp://example.invalid/file'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url('entries/', entry=False), {'title': ''}, format='json').status_code, 400)

    def test_private_owner_and_collection_type_are_enforced(self):
        for user in (None, self.other):
            self.client.force_authenticate(user)
            self.assertIn(self.client.get(self.url()).status_code, (401, 403, 404))
            self.assertIn(self.client.post(self.url('implementations/'), {'name': 'bad'}, format='json').status_code, (401, 403, 404))
        self.client.force_authenticate(self.owner)
        for field, value in [('permission', 'public'), ('type', 'article'), ('is_valid', False)]:
            old = getattr(self.collection, field)
            setattr(self.collection, field, value)
            # Use update because Anthology now forces quant private on save.
            Anthology.objects.filter(pk=self.collection.pk).update(**{field: value})
            self.assertEqual(self.client.get(self.url()).status_code, 404)
            Anthology.objects.filter(pk=self.collection.pk).update(**{field: old})
        self.assertFalse(Implementation.objects.exists())

    def test_versions_are_immutable_and_backtests_keep_their_source(self):
        impl = self.implementation()
        first = CodeVersion.objects.get(pk=impl.current_version_id)
        test = self.client.post(self.url('backtests/'), {'name': '首次实验', 'version_id': first.pk,
            'start_date': '2024-01-01', 'end_date': '2025-01-01', 'metrics': [{'name': 'Sharpe', 'value': '1.2'}]}, format='json')
        self.assertEqual(test.status_code, 200, test.data)
        second = save_version(impl, {'code': 'changed()', 'note': '调整窗口'})
        self.assertNotEqual(second.pk, first.pk)
        restored = save_version(impl, {'code': first.code, 'source_version_id': first.pk, 'language': first.language,
            'language_version': first.language_version, 'dependencies': first.dependencies, 'parameters': first.parameters})
        self.assertNotEqual(restored.pk, first.pk)
        self.assertEqual(Backtest.objects.get().version_id, first.pk)
        first.code = 'mutated()'
        with self.assertRaises(ModelValidationError):
            first.save()
        first.refresh_from_db()
        response = self.client.patch(self.url(f'versions/{first.pk}/verification/'), {'compile_check': 'passed', 'run_check': 'failed', 'verification_notes': '平台报告'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        first.refresh_from_db()
        self.assertEqual(first.code, restored.code)
        self.assertEqual(first.compile_check, 'passed')

    def test_cross_entry_references_and_partial_creation_roll_back(self):
        other_entry = Entry.objects.create(anthology=self.collection, title='另一条研究')
        other_impl = self.implementation(other_entry)
        response = self.client.post(self.url('implementations/'), {'name': '非法来源', 'language': 'pine', 'code': 'test', 'source_version_id': other_impl.current_version_id}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Implementation.objects.filter(entry=self.entry).exists())
        response = self.client.post(self.url('backtests/'), {'name': '非法关联', 'version_id': other_impl.current_version_id}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Backtest.objects.count(), 0)
        self.assertEqual(self.client.post(self.url('backtests/'), {'name': '未知版本', 'version_id': None, 'metrics': []}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(self.url(f'backtests/{Backtest.objects.get().pk}/'), {'start_date': '2025-03-01', 'end_date': '2024-01-01'}, format='json').status_code, 400)

    def test_attachment_ownership_deduplication_and_safe_script_read(self):
        asset = self.asset()
        response = self.client.post(self.url('attachments/'), {'asset_id': asset.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        identity = response.data['data']['id']
        duplicate = self.client.post(self.url('attachments/'), {'asset_id': asset.pk}, format='json')
        self.assertEqual(duplicate.data['data']['id'], identity)
        result = self.client.get(self.url(f'attachments/{identity}/text/'))
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['data']['language'], 'python')
        wrong = self.asset('other.py', owner='other-owner')
        self.assertEqual(self.client.post(self.url('attachments/'), {'asset_id': wrong.pk}, format='json').status_code, 404)
        self.assertEqual(Attachment.objects.count(), 1)
        Asset.objects.filter(pk=asset.pk).update(file_path='../outside.py')
        self.assertEqual(self.client.get(self.url(f'attachments/{identity}/text/')).status_code, 400)
        Asset.objects.filter(pk=asset.pk).update(file_path='factor.py')
        (Path(settings.MEDIA_ROOT) / 'factor.py').write_bytes(b'\xff\x00binary')
        self.assertEqual(self.client.get(self.url(f'attachments/{identity}/text/')).status_code, 400)
        self.client.delete(self.url())
        self.assertTrue(Attachment.objects.filter(pk=identity).exists())
        from utils.resource_assets import is_asset_referenced
        self.assertTrue(is_asset_referenced(asset))

    def test_backtest_version_change_rejects_conflicting_attachment_evidence(self):
        impl = self.implementation()
        first = impl.current_version_id
        second = save_version(impl, {'code': 'changed()'}).pk
        asset = self.asset()
        for original in (first, None):
            with self.subTest(original=original):
                backtest = Backtest.objects.create(entry=self.entry, name='原始实验', version_id=original)
                reference = self.client.post(self.url('attachments/'), {
                    'asset_id': asset.pk, 'version_id': first, 'backtest_id': backtest.pk,
                }, format='json')
                self.assertEqual(reference.status_code, 200, reference.data)
                before = self.snapshot()
                validate(before, metadata(before))

                response = self.client.patch(self.url(f'backtests/{backtest.pk}/'), {
                    'version_id': second, 'conclusion': '不应保存的改动',
                }, format='json')

                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn('附件已关联其他代码版本', response.data['msg'])
                backtest.refresh_from_db()
                self.assertEqual(backtest.version_id, original)
                self.assertEqual(backtest.conclusion, '')
                after = self.snapshot()
                self.assertEqual(after, before)
                validate(after, metadata(after))

    def test_backtest_version_change_accepts_compatible_and_unspecified_evidence(self):
        impl = self.implementation()
        first = impl.current_version_id
        second = save_version(impl, {'code': 'changed()'}).pk
        asset = self.asset()
        cases = (
            ('same version', first, first, {'version_id': first}),
            ('clear version', first, first, {'version_id': None}),
            ('assign matching version', None, first, {'version_id': first}),
            ('attachment version unspecified', first, None, {'version_id': second}),
            ('version field omitted', first, first, {'conclusion': '仅补充实验结论'}),
        )
        for name, original, attachment_version, changes in cases:
            with self.subTest(name=name):
                backtest = Backtest.objects.create(entry=self.entry, name=name, version_id=original)
                reference = Attachment.objects.create(entry=self.entry, asset=asset, backtest=backtest,
                    implementation=impl, version_id=attachment_version)
                response = self.client.patch(self.url(f'backtests/{backtest.pk}/'), changes, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                backtest.refresh_from_db()
                reference.refresh_from_db()
                self.assertEqual(backtest.version_id, changes.get('version_id', original))
                self.assertEqual(reference.version_id, attachment_version)
                data = self.snapshot()
                validate(data, metadata(data))

        unreferenced = Backtest.objects.create(entry=self.entry, name='无附件实验', version_id=first)
        response = self.client.patch(self.url(f'backtests/{unreferenced.pk}/'), {
            'version_id': second,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        unreferenced.refresh_from_db()
        self.assertEqual(unreferenced.version_id, second)
        data = self.snapshot()
        validate(data, metadata(data))

    def test_ai_requests_are_idempotent_and_cancel_does_not_create_versions(self):
        run, body = self.queue()
        result = self.client.post(self.url('runs/'), body, format='json')
        self.assertEqual(result.data['data']['id'], run.pk)
        body['requirements'] = 'different request'
        self.assertEqual(self.client.post(self.url('runs/'), body, format='json').status_code, 409)
        response = self.client.post(self.url(f'runs/{run.pk}/cancel/'), {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['status'], 'cancelled')
        with patch('quant.worker.complete') as completion:
            execute(run.pk)
            completion.assert_not_called()
        self.assertEqual(CodeVersion.objects.count(), 1)
        self.assertEqual(self.client.post(self.url(f'runs/{run.pk}/adopt/'), {}, format='json').status_code, 409)

    def test_new_entry_task_recovers_expired_collection_jobs_without_restarting_them(self):
        original_entry = self.entry
        implementation = self.implementation()
        stale_runs = [self.queue(implementation, request_key=f'expired_collection_job_{index:04d}')[0]
                      for index in range(4)]
        AIRun.objects.filter(pk=stale_runs[0].pk).update(status='running')
        Job.objects.filter(run__in=stale_runs).update(lease_until=timezone.now() - timedelta(seconds=1))
        new_entry = Entry.objects.create(anthology=self.collection, title='重启后新研究')
        new_implementation = self.implementation(new_entry)
        body = {'request_key': 'new_entry_after_restart_0001', 'kind': 'explain',
                'source_version_id': new_implementation.current_version_id}
        with patch('quant.worker.dispatch') as dispatch, patch('quant.worker.complete') as completion:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(self.url('runs/', entry=new_entry), body, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            identity = response.data['data']['id']
            dispatch.assert_called_once_with(identity)
            for run in stale_runs:
                run.refresh_from_db()
                self.assertEqual(run.status, 'interrupted')
                self.assertEqual(run.result, {})
                job = Job.objects.get(run=run)
                self.assertTrue(job.cancelled)
                self.assertIsNone(job.lease_until)
                # Even an old executor callback cannot restart recovered work.
                execute(run.pk)
            completion.assert_not_called()
            dispatch.reset_mock()
            with self.captureOnCommitCallbacks(execute=True):
                repeated = self.client.post(self.url('runs/', entry=new_entry), body, format='json')
            self.assertEqual(repeated.status_code, 200, repeated.data)
            self.assertEqual(repeated.data['data']['id'], identity)
            dispatch.assert_not_called()
            completion.assert_not_called()
        self.assertEqual(AIRun.objects.filter(entry=original_entry).count(), 4)
        self.assertEqual(AIRun.objects.filter(entry=new_entry).count(), 1)
        self.assertEqual(CodeVersion.objects.count(), 2)

    def test_collection_task_limit_still_counts_live_leases(self):
        implementation = self.implementation()
        live = [self.queue(implementation, request_key=f'live_collection_job_{index:04d}')
                for index in range(4)]
        AIRun.objects.filter(pk=live[0][0].pk).update(status='running')
        Job.objects.filter(run__in=[run for run, _body in live]).update(
            lease_until=timezone.now() + timedelta(minutes=3))
        other_entry = Entry.objects.create(anthology=self.collection, title='其他研究')
        other_implementation = self.implementation(other_entry)
        with patch('quant.worker.dispatch') as dispatch, patch('quant.worker.complete') as completion:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(self.url('runs/', entry=other_entry), {
                    'request_key': 'fifth_live_collection_job', 'kind': 'explain',
                    'source_version_id': other_implementation.current_version_id}, format='json')
            self.assertEqual(response.status_code, 409, response.data)
            # The same request remains idempotent even when the collection is full.
            with self.captureOnCommitCallbacks(execute=True):
                repeated = self.client.post(self.url('runs/'), live[0][1], format='json')
            self.assertEqual(repeated.status_code, 200, repeated.data)
            self.assertEqual(repeated.data['data']['id'], live[0][0].pk)
            dispatch.assert_not_called()
            completion.assert_not_called()
        self.assertEqual(AIRun.objects.count(), 4)
        self.assertEqual(AIRun.objects.filter(status='running').count(), 1)
        self.assertEqual(AIRun.objects.filter(status='pending').count(), 3)
        self.assertFalse(Job.objects.filter(cancelled=True).exists())

    def test_repeating_expired_request_recovers_without_requeueing_or_model_call(self):
        run, body = self.queue()
        Job.objects.filter(run=run).update(lease_until=timezone.now() - timedelta(seconds=1))
        with patch('quant.worker.dispatch') as dispatch, patch('quant.worker.complete') as completion:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(self.url('runs/'), body, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['data']['id'], run.pk)
            self.assertEqual(response.data['data']['status'], 'interrupted')
            execute(run.pk)
            dispatch.assert_not_called()
            completion.assert_not_called()
        self.assertEqual(AIRun.objects.count(), 1)
        self.assertEqual(CodeVersion.objects.count(), 1)

    def test_complete_candidate_is_explicitly_adopted_once(self):
        run, _ = self.queue()
        with patch('quant.worker.complete', return_value=json.dumps(self.result())) as completion:
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(Implementation.objects.count(), 1)
        self.assertFalse(completion.call_args.kwargs['allow_retries'])
        self.assertEqual(completion.call_args.kwargs['deadline_seconds'], 120)
        response = self.client.post(self.url(f'runs/{run.pk}/adopt/'), {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        identity = response.data['data']['implementation']['id']
        duplicate = self.client.post(self.url(f'runs/{run.pk}/adopt/'), {}, format='json')
        self.assertEqual(duplicate.data['data']['implementation']['id'], identity)
        self.assertEqual(Implementation.objects.count(), 2)
        converted = Implementation.objects.get(pk=identity)
        version = CodeVersion.objects.get(pk=converted.current_version_id)
        self.assertEqual(version.compile_check, 'pending')
        self.assertEqual(version.source_version_id, run.source_version_id)

    def test_explanation_never_overwrites_notes_and_uses_selected_code_only(self):
        self.entry.content = 'private-unrelated-entry-note'
        self.entry.save()
        run, _ = self.queue(kind='explain')
        self.assertNotIn(self.entry.content, prompt(run))
        with patch('quant.worker.complete', return_value=json.dumps({'explanation': '代码的解释'})):
            execute(run.pk)
        response = self.client.post(self.url(f'runs/{run.pk}/adopt/'), {}, format='json')
        self.assertEqual(response.data['data']['explanation'], '代码的解释')
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.content, 'private-unrelated-entry-note')
        report = ResearchReport.objects.get(run=run)
        self.assertEqual(report.data['evidence_status'], 'unverified')
        self.assertIn('代码的解释', report.markdown)
        self.assertEqual(Implementation.objects.count(), 1)

    def test_truncation_timeout_and_invalid_result_never_publish(self):
        for index, failure in enumerate([AIOutputTruncated('truncated'), AIRequestTimeout('timeout'), ValueError('provider-secret')]):
            with self.subTest(failure=type(failure).__name__):
                run, _ = self.queue(request_key=f'test_request_failure_{index:04d}')
                with patch('quant.worker.complete', side_effect=failure):
                    execute(run.pk)
                run.refresh_from_db()
                self.assertEqual(run.status, 'failed')
                self.assertEqual(run.result, {})
                self.assertNotIn('provider-secret', run.error)
                self.assertEqual(self.client.post(self.url(f'runs/{run.pk}/adopt/'), {}, format='json').status_code, 409)
        with self.assertRaises(ValidationError):
            parse_result('convert', json.dumps({'code': 'partial'}))
        self.assertEqual(Implementation.objects.count(), 3)
        self.assertEqual(CodeVersion.objects.count(), 3)

    def test_cancel_during_completion_revokes_worker_commit(self):
        run, _ = self.queue()
        def completion(*args, **kwargs):
            Job.objects.filter(run=run).update(cancelled=True)
            return json.dumps(self.result())
        with patch('quant.worker.complete', side_effect=completion):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'cancelled')
        self.assertEqual(run.result, {})

    def test_empty_ai_source_and_oversize_utf8_code_are_rejected(self):
        impl = create_implementation(self.entry, {'name': '待补充', 'language': 'python', 'code': ''})
        response = self.client.post(self.url('runs/'), {'kind': 'explain', 'source_version_id': impl.current_version_id,
            'request_key': 'empty_source_request_0001'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AIRun.objects.exists())
        with self.assertRaises(ValidationError):
            save_version(impl, {'code': '中' * 400000})
        self.assertEqual(CodeVersion.objects.count(), 1)

    def test_sync_metadata_integrity_owner_references_and_old_snapshot(self):
        impl = self.implementation()
        asset = self.asset()
        Attachment.objects.create(entry=self.entry, asset=asset, implementation=impl)
        data = self.snapshot()
        validate(data, metadata(data))
        for mutate in ('code', 'owner', 'pointer', 'job', 'manifest'):
            changed = deepcopy(data)
            meta = metadata(changed)
            if mutate == 'code':
                next(row for row in changed if row['model'] == 'quant.codeversion')['fields']['code'] = 'tampered'
                meta = metadata(changed)
            elif mutate == 'owner':
                next(row for row in changed if row['model'] == 'assets.asset')['fields']['uploader'] = 'different-owner'
                meta = metadata(changed)
            elif mutate == 'pointer':
                next(row for row in changed if row['model'] == 'quant.implementation')['fields']['current_version_id'] = 'missing'
                meta = metadata(changed)
            elif mutate == 'job':
                changed.append({'model': 'quant.job', 'pk': 'not-a-lease', 'fields': {}})
                meta = metadata(changed)
            else:
                meta['quant_manifest'] = {}
            with self.subTest(mutate=mutate), self.assertRaises(SyncError):
                validate(changed, meta)
        validate([], {})
        with self.assertRaises(SyncError):
            validate(data, {'quant_schema_version': SCHEMA_VERSION + 1})
        changed = deepcopy(data)
        code_row = next(row for row in changed if row['model'] == 'quant.codeversion')
        code_row['fields']['code'] = 'different-but-hashed()'
        code_row['fields']['content_hash'] = hashlib.sha256(b'different-but-hashed()').hexdigest()
        with self.assertRaisesRegex(SyncError, '不可变'):
            validate(changed, metadata(changed))

    def test_restored_running_task_is_interrupted_and_never_requeued(self):
        run, _ = self.queue()
        Job.objects.filter(run=run).update(lease_until=timezone.now() - timedelta(seconds=1))
        self.assertEqual(recover(run).status, 'interrupted')
        second, _ = self.queue(request_key='another_valid_request_key')
        with patch('quant.worker.dispatch') as dispatch:
            reset_execution()
            second.refresh_from_db()
            self.assertEqual(second.status, 'interrupted')
            self.assertFalse(Job.objects.exists())
            dispatch.assert_not_called()

    def test_sync_roundtrip_keeps_versions_results_and_excludes_jobs(self):
        impl = self.implementation()
        first = impl.current_version_id
        save_version(impl, {'code': 'updated()', 'note': 'next'})
        asset = self.asset()
        backtest = Backtest.objects.create(entry=self.entry, name='历史实验', version_id=first)
        Attachment.objects.create(entry=self.entry, asset=asset, version_id=first, implementation=impl, backtest=backtest)
        run, _ = self.queue(implementation=impl)
        manager = SyncManager()
        data = manager.build_snapshot_data()
        quant_meta = metadata(data)
        self.assertFalse(any(row['model'] == 'quant.job' for row in data))
        validate(data, quant_meta)
        # The standard restore path works against the test database and temp media;
        # no fake provider or real user data is involved in this round trip.
        with patch('quant.worker.dispatch') as dispatch:
            manager.apply_snapshot_data(data, remote_meta=quant_meta)
            dispatch.assert_not_called()
        self.assertEqual(CodeVersion.objects.count(), 2)
        self.assertEqual(Backtest.objects.get().version_id, first)
        self.assertEqual(Attachment.objects.get().asset_id, asset.pk)
        self.assertEqual(AIRun.objects.get(pk=run.pk).status, 'interrupted')
        self.assertFalse(Job.objects.exists())

    def test_restore_removes_stale_protected_research_in_dependency_order(self):
        manager = SyncManager()
        clean = manager.build_snapshot_data()
        impl = self.implementation()
        asset = self.asset()
        backtest = Backtest.objects.create(entry=self.entry, name='旧实验', version_id=impl.current_version_id)
        Attachment.objects.create(entry=self.entry, asset=asset, implementation=impl,
                                  version_id=impl.current_version_id, backtest=backtest)
        self.queue(implementation=impl)
        manager.apply_snapshot_data(clean, remote_meta=metadata(clean))
        self.assertFalse(Attachment.objects.exists())
        self.assertFalse(Backtest.objects.exists())
        self.assertFalse(AIRun.objects.exists())
        self.assertFalse(CodeVersion.objects.exists())
        self.assertFalse(Implementation.objects.exists())
        self.assertTrue(Entry.objects.filter(pk=self.entry.pk).exists())

    def test_real_bounded_receiver_rejects_provider_length_finish(self):
        """Fake transport drives the real finish_reason gate, never a real model."""
        import queue as inbox_queue
        from utils.bounded_completion import _receive
        class Stream:
            def __aiter__(self):
                async def chunks():
                    yield SimpleNamespace(usage=None, choices=[SimpleNamespace(
                        delta=SimpleNamespace(content='{"code":"incomplete', reasoning_content=None), finish_reason='length')])
                return chunks()
            async def close(self):
                pass
        class Client:
            def __init__(self, **kwargs):
                self.chat = SimpleNamespace(completions=self)
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def create(self, **kwargs):
                return Stream()
        with patch('utils.bounded_completion.AsyncOpenAI', Client), self.assertRaises(AIOutputTruncated):
            asyncio.run(_receive({'api_key': 'test', 'base_url': 'https://unused.invalid'}, {}, 1, inbox_queue.Queue()))

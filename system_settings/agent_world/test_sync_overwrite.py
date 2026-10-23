"""单机覆盖同步：领域完整性不再拦住上传或下载，对比模式交回逐条选择。"""
import json
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings

from system_settings.models import AgentLongTermMemory
from system_settings.tests import MemoryStorageClient
from utils.sync_manager import SyncChoicesRequired, SyncError, SyncManager

from . import test_farm_automation as farm_fixture
from .farm_queue_sync import validate_queue_source
from .farm_queue_window_repair import snapshot_data
from .memory.sync import metadata, validate_source


@override_settings(USE_TZ=True)
class ForceUploadQueueWindowTests(TestCase):
    def setUp(self):
        self.fx = farm_fixture.FarmQueueTests('setUp')
        self.fx.setUp()
        self.addCleanup(self.fx.doCleanups)
        self.fx.stock()
        self.fx.plan()

    def test_force_upload_succeeds_when_plant_is_outside_the_queue_window(self):
        self.fx.activate(self.fx.item.scheduled_at.replace(microsecond=123456))
        with self.assertRaises(SyncError) as caught:
            validate_queue_source(snapshot_data([self.fx.agent.pk]))
        self.assertIn('活动时段', str(caught.exception))

        manager = SyncManager(MemoryStorageClient(), '/backup')
        snapshot, summary, _backup = manager.sync_v2(manual_upload=True, force_overwrite=True)

        self.assertTrue(summary['force_overwrite'])
        self.assertTrue(snapshot['meta']['snapshot_id'])
        self.assertIn(manager.remote.v2_current_file, manager.remote.client.files)
        self.assertIsNone(self._source_error())

    def _source_error(self):
        try:
            validate_queue_source(snapshot_data([self.fx.agent.pk]))
        except SyncError as exc:
            return str(exc)
        return None


class ForceDownloadMemoryTests(TestCase):
    def setUp(self):
        from .memory.tests import MemoryTests
        self.mem = MemoryTests('setUp')
        self.mem.setUp()
        self.addCleanup(self.mem.doCleanups)

    def test_force_download_into_empty_database_accepts_mismatched_memory_sources(self):
        self.mem.cooking()
        with patch(
            'system_settings.agent_world.memory.consolidate.complete',
            return_value=json.dumps({'memories': [self.mem.proposal()]}),
        ):
            from .memory.consolidate import process
            process(self.mem.state, self.mem.now)
        memory = AgentLongTermMemory.objects.get(agent=self.mem.agent)
        sources = memory.metadata['world_memory']['sources']
        sources[0] = {**sources[0], 'facts': {'tampered': True}}
        memory.metadata = {**memory.metadata, 'world_memory': {**memory.metadata['world_memory'], 'sources': sources}}
        memory.save(update_fields=['metadata'])

        manager = SyncManager(MemoryStorageClient(), '/backup')
        data = manager.build_snapshot_data(relax_integrity=True, allow_exploration_review_mismatch=True)
        with self.assertRaisesMessage(SyncError, '居民记忆来源内容与实际活动不一致'):
            validate_source(data, metadata(data))
        published = manager.publish_v2_snapshot(source='test', data_list=data, revisions=manager._build_revision_manifest(data))

        AgentLongTermMemory.objects.all().delete()
        self.assertFalse(AgentLongTermMemory.objects.exists())
        restored, summary, _backup = manager.force_download_v2(runner_id='download')

        self.assertTrue(summary['force_overwrite'])
        self.assertEqual(summary['direction'], 'download')
        self.assertEqual(restored['meta']['snapshot_id'], published['meta']['snapshot_id'])
        healed = AgentLongTermMemory.objects.get(pk=memory.pk)
        self.assertNotEqual(healed.metadata['world_memory']['sources'][0]['facts'], {'tampered': True})
        healed_data = manager.build_snapshot_data(relax_integrity=True)
        validate_source(healed_data, metadata(healed_data))


class CompareConflictTests(TestCase):
    def test_compare_lists_each_conflict_and_does_not_abort_on_memory_check(self):
        manager = SyncManager(MemoryStorageClient(), '/backup')
        base_item = {'model': 'anthology.anthology', 'pk': 'A', 'fields': {'title': '旧标题'}}
        local_item = {'model': 'anthology.anthology', 'pk': 'A', 'fields': {'title': '本机标题'}}
        remote_item = {'model': 'anthology.anthology', 'pk': 'A', 'fields': {'title': '云端标题'}}
        base_rev = {'hash': 'base', 'revision_at': '2026-01-01T00:00:00+00:00', 'origin_device': 'base', 'deleted': False}
        local_rev = {'hash': 'local', 'revision_at': '2026-01-02T00:00:00+00:00', 'origin_device': 'local', 'deleted': False}
        remote_rev = {'hash': 'remote', 'revision_at': '2026-01-03T00:00:00+00:00', 'origin_device': 'remote', 'deleted': False}
        remote = {'data': [remote_item], 'revisions': {'anthology.anthology:A': remote_rev}, 'meta': {}}

        def reject_memory(*_args, **_kwargs):
            raise SyncError('居民记忆来源内容与实际活动不一致')

        with patch('system_settings.agent_world.memory.sync.validate_source', side_effect=reject_memory):
            _merged, _revisions, preview = manager.merge_v2_data(
                {'data': [base_item], 'revisions': {'anthology.anthology:A': base_rev}},
                [local_item], {'anthology.anthology:A': local_rev}, remote,
                relax_integrity=True, conflicts_only=True,
            )
            merged, revisions, summary = manager.merge_v2_data(
                {'data': [base_item], 'revisions': {'anthology.anthology:A': base_rev}},
                [local_item], {'anthology.anthology:A': local_rev}, remote,
                relax_integrity=True,
                resolutions=[{'key': 'anthology.anthology:A', 'side': 'local'}],
            )

        self.assertEqual(preview['choice_total'], 1)
        self.assertEqual(preview['choice_items'][0]['key'], 'anthology.anthology:A')
        self.assertEqual(preview['choice_items'][0]['label'], '本机标题')
        self.assertEqual(preview['choice_items'][0]['remote_label'], '云端标题')
        self.assertTrue(any('居民记忆来源内容与实际活动不一致' in item for item in preview['integrity_warnings']))
        self.assertEqual(merged[0]['fields']['title'], '本机标题')
        self.assertFalse(revisions['anthology.anthology:A']['deleted'])
        self.assertEqual(summary['conflicts'], 1)

    def test_review_without_confirmation_raises_choices_instead_of_sync_error_chain(self):
        from memos.models import Memo

        manager = SyncManager(MemoryStorageClient(), '/backup')
        Memo.objects.create(memo_id='m1', content='本机已改', user_id='owner')
        remote = {
            'meta': {'snapshot_id': 'snap', 'format': 2, 'app_version': manager.get_current_app_version()},
            'data': [{'model': 'memos.memo', 'pk': 'm1', 'fields': {'content': '云端', 'memo_id': 'm1', 'user_id': 'owner'}}],
            'revisions': {'memos.memo:m1': {
                'hash': 'remote', 'revision_at': '2099-02-01T00:00:00+00:00', 'origin_device': 'remote', 'deleted': False,
            }},
            'media': {},
        }
        with patch.object(manager, 'get_v2_current', return_value=remote):
            with self.assertRaises(SyncChoicesRequired) as caught:
                manager.sync_v2(source='manual-pull', review_conflicts=True, base_snapshot_id='missing-base')
        self.assertGreaterEqual(caught.exception.total, 1)
        self.assertEqual(caught.exception.conflicts[0]['label'], '本机已改')
        self.assertEqual(caught.exception.conflicts[0]['remote_label'], '云端')
        self.assertNotIn('居民记忆来源内容与实际活动不一致', str(caught.exception))

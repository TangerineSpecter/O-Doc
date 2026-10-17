"""播种窗口修复：只动开工标记或越界时间，上传校验保持原规则。"""
import io
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase, override_settings

from system_settings.models import WorldAction
from utils.sync_manager import SyncError

from . import test_farm_automation as farm_fixture
from .farm_automation import validate_plan
from .farm_models import FarmOperation
from .farm_queue_sync import validate_queue_source
from .farm_queue_window_repair import snapshot_data, wire_timestamp
from .life_time import SHANGHAI


class WireTimestampTests(SimpleTestCase):
    def test_snapshot_drops_submillisecond_and_naive_wall_is_shanghai(self):
        at = datetime(2026, 10, 13, 9, 0, 0, 123456, tzinfo=SHANGHAI)
        self.assertLess(wire_timestamp(at), at.timestamp())
        self.assertLess(at.timestamp() - wire_timestamp(at), 0.001)
        naive = datetime(2026, 10, 13, 1, 0, 0)
        labeled = datetime(2026, 10, 13, 1, 0, 0, tzinfo=SHANGHAI)
        self.assertEqual(wire_timestamp(naive), wire_timestamp(labeled))


@override_settings(USE_TZ=True)
class FarmQueueWindowRepairTests(TestCase):
    def setUp(self):
        self.fx = farm_fixture.FarmQueueTests('setUp')
        self.fx.setUp()
        self.addCleanup(self.fx.doCleanups)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = override_settings(SYSTEM_LOG_DIR=self.tmp.name)
        patcher.enable()
        self.addCleanup(patcher.disable)
        self.fx.stock()
        self.fx.plan()

    def run_command(self, *args):
        out = io.StringIO()
        call_command('repair_farm_queue_window', *args, stdout=out)
        return out.getvalue()

    def source_error(self):
        try:
            validate_queue_source(snapshot_data([self.fx.agent.pk]))
        except SyncError as exc:
            return str(exc)
        return None

    def test_millisecond_snapshot_fails_upload_while_live_schedule_stays_valid(self):
        at = self.fx.item.scheduled_at.replace(microsecond=123456)
        self.fx.activate(at)
        validate_plan(self.fx.farm())
        self.assertEqual(self.fx.item.status, 'completed')
        self.assertEqual(WorldAction.objects.get(pk=self.fx.item.pk).status, 'success')
        error = self.source_error()
        self.assertIn('活动时段', error)
        self.assertIn(self.fx.agent.pk, error)
        plants = list(FarmOperation.objects.filter(operation__kind='plant'))
        before = [(row.pk, row.created_at) for row in plants]
        progress = self.fx.farm().state['planting_plans']
        planted = {pid: dict(plan['progress']) for pid, plan in progress.items()}
        preview = self.run_command('--agent', self.fx.agent.pk)
        self.assertIn('不到 1 毫秒', preview)
        self.assertIn('未写库', preview)
        self.assertEqual([(row.pk, row.created_at) for row in FarmOperation.objects.filter(operation__kind='plant')], before)
        day = next(iter(self.fx.farm().state['planting_plans'].values()))['day']
        backup = Path(self.tmp.name) / 'window.json'
        applied = self.run_command('--apply', '--agent', self.fx.agent.pk, '--day', day, '--backup', str(backup))
        self.assertIn('队列校验 PASS', applied)
        self.assertTrue(backup.exists())
        self.assertEqual([(row.pk, row.created_at) for row in FarmOperation.objects.filter(operation__kind='plant')], before)
        farm = self.fx.farm()
        self.assertEqual({pid: plan['progress'] for pid, plan in farm.state['planting_plans'].items()}, planted)
        plan = next(iter(farm.state['planting_plans'].values()))
        self.assertEqual(WorldAction.objects.get(pk=self.fx.item.pk).snapshot['activated_at'], plan['activated_at'])
        self.assertIsNone(self.source_error())
        self.assertIn('无需修复', self.run_command('--agent', self.fx.agent.pk))
        op = FarmOperation.objects.get(operation__kind='plant')
        op.created_at = datetime.fromtimestamp(plan['cutoff'] + 86400, SHANGHAI)
        op.save(update_fields=['created_at'])
        self.assertIn('活动时段', self.source_error())

    def test_early_plant_moves_activation_and_keeps_the_operation_clock(self):
        self.fx.activate(self.fx.item.scheduled_at.replace(microsecond=0))
        op = FarmOperation.objects.get(operation__kind='plant')
        shown = op.created_at - timedelta(hours=2)
        op.created_at = shown
        op.save(update_fields=['created_at'])
        self.assertIn('2.0 小时', self.run_command())
        day = next(iter(self.fx.farm().state['planting_plans'].values()))['day']
        self.run_command('--apply', '--agent', self.fx.agent.pk, '--day', day, '--backup', str(Path(self.tmp.name) / 'early.json'))
        op.refresh_from_db()
        self.assertEqual(op.created_at, shown)
        self.assertIsNone(self.source_error())

    def test_late_plant_is_pulled_before_cutoff_without_deleting_it(self):
        self.fx.activate(self.fx.item.scheduled_at.replace(microsecond=0))
        plan = next(iter(self.fx.farm().state['planting_plans'].values()))
        op = FarmOperation.objects.get(operation__kind='plant')
        op.created_at = datetime.fromtimestamp(plan['cutoff'] + 3600, SHANGHAI)
        op.save(update_fields=['created_at'])
        activated = plan['activated_at']
        self.run_command('--apply', '--all', '--backup', str(Path(self.tmp.name) / 'late.json'))
        self.assertEqual(FarmOperation.objects.filter(operation__kind='plant').count(), 1)
        op.refresh_from_db()
        self.assertLess(wire_timestamp(op.created_at), plan['cutoff'])
        self.assertEqual(next(iter(self.fx.farm().state['planting_plans'].values()))['activated_at'], activated)
        self.assertIsNone(self.source_error())

    def test_apply_requires_a_target_and_unknown_agent_is_rejected(self):
        self.fx.activate(self.fx.item.scheduled_at.replace(microsecond=123456))
        with self.assertRaises(CommandError):
            self.run_command('--apply', '--backup', str(Path(self.tmp.name) / 'nope.json'))
        with self.assertRaises(CommandError):
            self.run_command('--agent', 'agent_missing')
        with self.assertRaises(CommandError):
            self.run_command('--agent', self.fx.agent.pk, '--day', '1999-01-01')
        self.assertIn('活动时段', self.source_error())

"""旧库修复命令：隔离数据库与临时目录，不读写真实数据库、不启动调度。"""
import io
import json
import tempfile
from types import SimpleNamespace
from pathlib import Path
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from .farm_catalog import DEFAULT_RULES
from .farm_models import AgentFarm, FarmCatalog
from .life_models import LifeConfig, LifeIntegrity, LifeItem
from . import test_farm_automation as farm_fixture


class RepairFixture:
    activate = True

    def setUp(self):
        # 复用已验证的种植队列夹具，但不继承其测试用例。
        self.fx = farm_fixture.FarmQueueTests('setUp')
        self.fx.setUp()
        self.addCleanup(self.fx.doCleanups)
        self.fx.stock(); self.fx.plan()
        if self.activate:
            self.fx.activate()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = override_settings(SYSTEM_LOG_DIR=self.tmp.name)
        patcher.enable(); self.addCleanup(patcher.disable)
        self.backup = Path(self.tmp.name) / 'backup.json'
        self.old_catalog()

    def old_catalog(self):
        """模拟旧库：目录缺少后加入的内置作物与肥料，生活账号缺少配置并留有孤立摘要。"""
        catalog = FarmCatalog.objects.get(pk='owner')
        rules = json.loads(json.dumps(catalog.rules))
        del rules['crops']['potato']
        del rules['fertilizers']
        FarmCatalog.objects.filter(pk='owner').update(rules=rules)
        LifeConfig.objects.filter(pk='owner').delete()
        LifeIntegrity.objects.all().delete()
        LifeIntegrity.objects.create(pk='ghost', hashes={})

    def run_command(self, *args):
        out = io.StringIO()
        call_command('repair_agent_world_catalog', *args, stdout=out)
        return out.getvalue()


@override_settings(USE_TZ=True)
class CatalogRepairTests(RepairFixture, TestCase):
    def test_dry_run_reports_and_changes_nothing(self):
        before = FarmCatalog.objects.get(pk='owner')
        output = self.run_command()
        self.assertIn('缺少作物 [\'potato\']', output)
        self.assertIn("SKU='seed.potato'：补齐目录后可解析", output)
        self.assertIn("缺少 LifeConfig：['owner']", output)
        self.assertIn("无对应记录的遗留摘要：['ghost']", output)
        self.assertIn('预览：上传校验', output)
        after = FarmCatalog.objects.get(pk='owner')
        self.assertEqual((before.rules, before.updated_at), (after.rules, after.updated_at))
        self.assertFalse(LifeConfig.objects.filter(pk='owner').exists())
        self.assertTrue(LifeIntegrity.objects.filter(pk='ghost').exists())
        self.assertFalse(LifeIntegrity.objects.filter(pk='owner').exists())
        self.assertEqual(list(Path(self.tmp.name).iterdir()), [])

    def test_apply_repairs_validates_and_is_idempotent(self):
        output = self.run_command('--apply', '--backup', str(self.backup))
        self.assertIn('上传校验 PASS', output)
        rules = FarmCatalog.objects.get(pk='owner').rules
        self.assertEqual(rules['crops']['potato'], DEFAULT_RULES['crops']['potato'])
        self.assertEqual(set(rules['fertilizers']), set(DEFAULT_RULES['fertilizers']))
        self.assertTrue(LifeConfig.objects.filter(pk='owner').exists())
        self.assertTrue(LifeIntegrity.objects.filter(pk='owner').exists())
        self.assertFalse(LifeIntegrity.objects.filter(pk='ghost').exists())
        backup = json.loads(self.backup.read_text(encoding='utf-8'))
        self.assertIn('system_settings.farmcatalog', {row['model'] for row in backup})
        # 重复执行不再有改动，目录更新时间不变。
        stamp = FarmCatalog.objects.get(pk='owner').updated_at
        again = self.run_command('--apply', '--backup', str(Path(self.tmp.name) / 'second.json'))
        self.assertIn('无需改动，未写库；上传校验 PASS', again)
        self.assertFalse((Path(self.tmp.name) / 'second.json').exists())
        self.assertEqual(FarmCatalog.objects.get(pk='owner').updated_at, stamp)
        self.assertIn('缺少 LifeConfig：无', again)

    def test_apply_refuses_to_overwrite_existing_backup(self):
        self.backup.write_text('keep', encoding='utf-8')
        with self.assertRaises(CommandError):
            self.run_command('--apply', '--backup', str(self.backup))
        self.assertEqual(self.backup.read_text(encoding='utf-8'), 'keep')
        self.assertNotIn('potato', FarmCatalog.objects.get(pk='owner').rules['crops'])

    def test_drop_requires_apply(self):
        with self.assertRaises(CommandError):
            self.run_command('--drop-unmappable')


@override_settings(USE_TZ=True)
class UnmappableQueueTests(RepairFixture, TestCase):
    activate = False

    def corrupt_queue(self):
        farm = AgentFarm.objects.get(pk=self.fx.agent.pk)
        item = LifeItem.objects.get(pk='start')
        plan = next(iter(farm.state['planting_plans'].values()))
        pid = plan['id']
        # 尚未开工的计划：把项目改成目录与内置作物中都不存在的 SKU。
        holders = [plan, *plan['versions'], *item.context['farm_plan_sources'].values(), item.context['farm_plan_source']]
        for holder in holders:
            holder['entries'][0]['sku'] = 'seed.ghost'
        farm.state['planting_plans'][pid] = plan
        farm.save(update_fields=['state'])
        item.save(update_fields=['context'])

    def test_unmappable_is_reported_and_only_dropped_on_request(self):
        self.corrupt_queue()
        output = self.run_command()
        self.assertIn('无法映射', output)
        with self.assertRaises(CommandError) as caught:
            self.run_command('--apply', '--backup', str(self.backup))
        self.assertIn('整体回滚', str(caught.exception))
        # 校验失败则整体回滚：目录和生活配置都保持原样。
        self.assertNotIn('potato', FarmCatalog.objects.get(pk='owner').rules['crops'])
        self.assertFalse(LifeConfig.objects.filter(pk='owner').exists())
        farm = AgentFarm.objects.get(pk=self.fx.agent.pk)
        self.assertEqual(len(next(iter(farm.state['planting_plans'].values()))['entries']), 1)
        output = self.run_command('--apply', '--drop-unmappable', '--backup', str(Path(self.tmp.name) / 'drop.json'))
        self.assertIn('已移除：', output)
        farm = AgentFarm.objects.get(pk=self.fx.agent.pk)
        self.assertEqual(next(iter(farm.state['planting_plans'].values()))['entries'], [])
        self.assertIn('上传校验 PASS', output)


class MigrationAndBackupTests(TestCase):
    def test_migration_0075_adds_only_missing_builtins(self):
        import importlib
        from django.apps import apps
        from types import SimpleNamespace
        migration = importlib.import_module('system_settings.migrations.0075_backfill_farm_catalog_builtins')
        custom = {**DEFAULT_RULES['crops']['radish'], 'seed_price': 99}
        FarmCatalog.objects.create(pk='old', seed='s', rules={'crops': {'radish': custom, 'potato': DEFAULT_RULES['crops']['potato']}, 'animals': {}})
        FarmCatalog.objects.create(pk='bad', seed='s', rules=[])
        editor = SimpleNamespace(connection=SimpleNamespace(alias='default'))
        migration.backfill(apps, editor)
        rules = FarmCatalog.objects.get(pk='old').rules
        self.assertEqual(rules['crops']['radish'], custom)
        self.assertEqual(set(rules['crops']), set(DEFAULT_RULES['crops']))
        self.assertEqual(set(rules['fertilizers']), set(DEFAULT_RULES['fertilizers']))
        self.assertEqual(rules['item_icons'], {})
        self.assertEqual(FarmCatalog.objects.get(pk='bad').rules, [])
        stamp = FarmCatalog.objects.get(pk='old').updated_at
        migration.backfill(apps, editor)
        self.assertEqual(FarmCatalog.objects.get(pk='old').updated_at, stamp)

    def test_sqlite_backup_copies_database_and_refuses_overwrite(self):
        import sqlite3
        from unittest.mock import patch
        from django.core.management.base import CommandError
        from system_settings.management.commands.repair_agent_world_catalog import backup_sqlite
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'db.sqlite3'
            with sqlite3.connect(source) as db:
                db.execute('create table t (v text)'); db.execute("insert into t values ('x')")
            settings_dict = {'ENGINE': 'django.db.backends.sqlite3', 'NAME': str(source)}
            with patch('system_settings.management.commands.repair_agent_world_catalog.connection', SimpleNamespace(settings_dict=settings_dict)):
                target = backup_sqlite('20260101-000000')
                self.assertEqual(target.name, 'db.sqlite3.bak-20260101-000000')
                with sqlite3.connect(target) as db:
                    self.assertEqual(db.execute('select v from t').fetchall(), [('x',)])
                with self.assertRaises(CommandError):
                    backup_sqlite('20260101-000000')

"""Real schema upgrade checks against valid and corrupted old market checkpoints."""
from importlib import import_module
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class RetentionMigrationTests(TransactionTestCase):
    def test_checked_upgrade_preserves_assets_and_rejects_corruption(self):
        migration = import_module('system_settings.migrations.0107_inventory_retention_strategy')
        before = [('system_settings', '0106_combat_solo_settlement')]
        after = [('system_settings', '0107_inventory_retention_strategy')]
        MigrationExecutor(connection).migrate(before)
        old = MigrationExecutor(connection).loader.project_state(before).apps
        Config = old.get_model('system_settings', 'MarketConfig')
        Policy = old.get_model('system_settings', 'MarketDisposition')
        Integrity = old.get_model('system_settings', 'MarketIntegrity')
        Config.objects.create(pk='upgrade-owner', seed='frozen')
        Policy.objects.create(pk='old-policy', owner_id='upgrade-owner', actor_id='actor', sku='crop.radish',
                              target_hold=2, sell_ratio=0, list_ratio=0)
        checkpoint = Integrity.objects.create(pk='upgrade-owner', hashes=migration.hashes(old, connection.alias, 'upgrade-owner'))
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(after)
            new = executor.loader.project_state(after).apps
            policy = new.get_model('system_settings', 'MarketDisposition').objects.get(pk='old-policy')
            self.assertEqual(policy.strategy, {})
            self.assertEqual((policy.target_hold, policy.sell_ratio, policy.list_ratio), (2, 0, 0))
            self.assertEqual(new.get_model('system_settings', 'MarketIntegrity').objects.get(pk='upgrade-owner').hashes,
                             migration.hashes(new, connection.alias, 'upgrade-owner'))
            MigrationExecutor(connection).migrate(before)
            Policy.objects.filter(pk='old-policy').update(target_hold=595)
            with self.assertRaisesRegex(ValueError, '检查点不一致'):
                MigrationExecutor(connection).migrate(after)
        finally:
            Integrity.objects.filter(pk=checkpoint.pk).update(hashes=migration.hashes(old, connection.alias, 'upgrade-owner'))
            MigrationExecutor(connection).migrate(after)

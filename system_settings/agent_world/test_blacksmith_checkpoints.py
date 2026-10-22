"""Forge-only checkpoint batching keeps hashes inside the transaction boundary."""
from unittest.mock import call, patch

from django.test import TransactionTestCase

from .blacksmith_catalog import catalog_for
from .blacksmith_integrity import fingerprints
from .blacksmith_models import BlacksmithCatalog, BlacksmithIntegrity
from .blacksmith_sync import checkpoint


class BlacksmithCheckpointTests(TransactionTestCase):
    def setUp(self):
        catalog_for('batch-owner')
        catalog_for('nested-owner')

    def save_catalog(self, owner='batch-owner'):
        catalog = BlacksmithCatalog.objects.get(pk=owner)
        catalog.version += 1
        catalog.save(update_fields=['version', 'updated_at'])
        return catalog.version

    def assert_current_hashes(self, owner='batch-owner'):
        self.assertEqual(BlacksmithIntegrity.objects.get(pk=owner).hashes, fingerprints(owner))

    def test_nested_batches_refresh_each_owner_once_before_return(self):
        from .blacksmith_sync import batch_checkpoints
        with patch('system_settings.agent_world.blacksmith_sync.checkpoint', wraps=checkpoint) as refresh:
            with batch_checkpoints():
                self.save_catalog()
                with batch_checkpoints():
                    self.save_catalog()
                    self.save_catalog('nested-owner')
                refresh.assert_not_called()
            self.assertEqual(refresh.call_args_list, [call('batch-owner'), call('nested-owner')])
        self.assert_current_hashes()
        self.assert_current_hashes('nested-owner')

    def test_rolled_back_batch_does_not_suppress_later_save(self):
        from .blacksmith_sync import batch_checkpoints
        before = BlacksmithIntegrity.objects.get(pk='batch-owner').hashes
        with patch('system_settings.agent_world.blacksmith_sync.checkpoint', wraps=checkpoint) as refresh:
            with self.assertRaisesRegex(ValueError, 'rollback'):
                with batch_checkpoints():
                    self.save_catalog()
                    raise ValueError('rollback')
            refresh.assert_not_called()
            self.assertEqual(BlacksmithCatalog.objects.get(pk='batch-owner').version, 1)
            self.assertEqual(BlacksmithIntegrity.objects.get(pk='batch-owner').hashes, before)
            self.save_catalog()
            refresh.assert_called_once_with('batch-owner')
        self.assert_current_hashes()

    def test_failed_nested_savepoint_preserves_outer_batch_and_later_batch(self):
        from .blacksmith_sync import batch_checkpoints
        with patch('system_settings.agent_world.blacksmith_sync.checkpoint', wraps=checkpoint) as refresh:
            with batch_checkpoints():
                version = self.save_catalog()
                with self.assertRaisesRegex(ValueError, 'inner rollback'):
                    with batch_checkpoints():
                        self.save_catalog()
                        self.save_catalog('nested-owner')
                        raise ValueError('inner rollback')
                self.assertEqual(BlacksmithCatalog.objects.get(pk='batch-owner').version, version)
                self.assertEqual(BlacksmithCatalog.objects.get(pk='nested-owner').version, 1)
                refresh.assert_not_called()
            refresh.assert_called_once_with('batch-owner')
            refresh.reset_mock()
            with batch_checkpoints():
                self.save_catalog('nested-owner')
            refresh.assert_called_once_with('nested-owner')
        self.assert_current_hashes()
        self.assert_current_hashes('nested-owner')

    def test_unbatched_save_still_refreshes_immediately(self):
        with patch('system_settings.agent_world.blacksmith_sync.checkpoint', wraps=checkpoint) as refresh:
            self.save_catalog()
            refresh.assert_called_once_with('batch-owner')
            self.assert_current_hashes()

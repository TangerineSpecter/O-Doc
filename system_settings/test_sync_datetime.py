import datetime
import json
import tempfile

from django.apps import apps
from django.test import SimpleTestCase, TestCase

from utils.sync_datetime import SyncJSONEncoder, normalize_datetime_fraction


class SyncDatetimeEncodingTests(SimpleTestCase):
    def test_zero_fraction_and_timezone(self):
        for suffix in ('', 'Z', '+08:00', '-03:30'):
            for fraction in ('.000', '.000000'):
                value = '2026-10-17T08:00:00' + fraction + suffix
                self.assertEqual(normalize_datetime_fraction(value), '2026-10-17T08:00:00' + suffix)
            for fraction in ('.123', '.000123'):
                value = '2026-10-17T08:00:00' + fraction + suffix
                self.assertEqual(normalize_datetime_fraction(value), value)

    def test_encoder_only_normalizes_typed_times(self):
        for zone in (None, datetime.timezone.utc, datetime.timezone(datetime.timedelta(hours=8))):
            for microsecond, fraction in ((0, ''), (123, ''), (123000, '.123')):
                stamp = datetime.datetime(2026, 10, 17, 8, tzinfo=zone, microsecond=microsecond)
                value = json.loads(json.dumps({'at': stamp, 'note': '2026-10-17T08:00:00.000'}, cls=SyncJSONEncoder))
                suffix = '' if zone is None else 'Z' if zone == datetime.timezone.utc else '+08:00'
                self.assertEqual(value['at'], '2026-10-17T08:00:00' + fraction + suffix)
                self.assertEqual(value['note'], '2026-10-17T08:00:00.000')
        self.assertEqual(json.loads(json.dumps(datetime.time(8, microsecond=123), cls=SyncJSONEncoder)), '08:00:00')


class SyncDatetimeSnapshotTests(TestCase):
    def setUp(self):
        media = tempfile.TemporaryDirectory()
        self.addCleanup(media.cleanup)
        self.enterContext(self.settings(MEDIA_ROOT=media.name))

    def test_export_and_restore_naive_dates(self):
        with self.settings(USE_TZ=False):
            self.assert_export_restore(False)

    def test_export_and_restore_aware_dates(self):
        with self.settings(USE_TZ=True):
            self.assert_export_restore(True)

    def assert_export_restore(self, use_tz):
        from utils.sync_manager import SyncManager
        from system_settings.agent_world.market_models import MarketConfig, MarketBatch, MarketIntegrity
        from system_settings.agent_world.investment_models import InvestmentAccount, InvestmentIntegrity
        from system_settings.agent_world.social_models import SocialConfig
        from system_settings.agent_world import market_sync, investment_sync

        zone = datetime.timezone.utc if use_tz else None
        stamp = datetime.datetime(2026, 10, 17, 8, microsecond=123, tzinfo=zone)
        owner = f'dates-{use_tz}'
        MarketConfig.objects.create(pk=owner)
        MarketBatch.objects.create(pk=owner, owner_id=owner, starts_at=stamp,
            expires_at=stamp + datetime.timedelta(hours=1), feed_price=1)
        MarketBatch.objects.filter(pk=owner).update(updated_at=stamp)
        InvestmentAccount.objects.create(pk=owner, owner_id=owner)
        InvestmentAccount.objects.filter(pk=owner).update(updated_at=stamp)
        SocialConfig.objects.create(pk=owner)
        SocialConfig.objects.filter(pk=owner).update(updated_at=stamp)
        # Upgrade only checkpoints that exactly match the previous algorithm.
        MarketIntegrity.objects.update_or_create(pk=owner, defaults={'hashes': market_sync.fingerprints(owner, legacy=True)})
        InvestmentIntegrity.objects.create(pk=owner, hashes=investment_sync.fingerprints(owner, legacy=True))
        manager = SyncManager()
        data = manager.build_snapshot_data()
        for row in data:
            model = apps.get_model(row['model'])
            for field in model._meta.fields:
                value = row['fields'].get(field.name)
                if field.get_internal_type() in ('DateTimeField', 'TimeField') and isinstance(value, str):
                    self.assertEqual(normalize_datetime_fraction(value), value, (row['model'], field.name))
        self.assertEqual(MarketIntegrity.objects.get(pk=owner).hashes, market_sync.fingerprints(owner))
        self.assertEqual(InvestmentIntegrity.objects.get(pk=owner).hashes, investment_sync.fingerprints(owner))
        manager.apply_snapshot_data(data, full_overwrite=True)
        manager.apply_snapshot_data(manager.build_snapshot_data(), full_overwrite=True)
        self.assertEqual(InvestmentAccount.objects.get(pk=owner).updated_at.microsecond, 0)

    def test_invalid_checkpoint_is_not_rebuilt_by_date_upgrade(self):
        from system_settings.agent_world.market_models import MarketIntegrity
        from system_settings.agent_world.investment_models import InvestmentIntegrity
        from system_settings.agent_world import market_sync, investment_sync

        for model, module in ((MarketIntegrity, market_sync), (InvestmentIntegrity, investment_sync)):
            model.objects.create(pk='broken', hashes={'missing': 'facts'})
            module.normalize_legacy_dates()
            self.assertEqual(model.objects.get(pk='broken').hashes, {'missing': 'facts'})

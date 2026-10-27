import hashlib
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import serializers
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from anthology.models import Anthology
from assets.models import Asset
from quant.models import MT4Attachment, MT4Backtest, MT4Expert
from quant.sync import metadata, validate
from utils.sync_manager import SyncError, SyncManager
from .test_parser import HTML, make_zip


class ArchiveAPITests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_superuser('admin', 'admin@example.invalid', 'test')
        self.other = get_user_model().objects.create_user('other')
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.collection = Anthology.objects.create(type='backtest', title='回测', permission='private', user_id='admin')
        self.expert = MT4Expert.objects.create(anthology=self.collection, name='EA')
        self.directory = tempfile.TemporaryDirectory(prefix='mt4-test-')
        self.addCleanup(self.directory.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.directory.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        Path(settings.MEDIA_ROOT, 'report.htm').write_bytes(HTML)
        self.asset = Asset.objects.create(id='report', name='report.htm', original_name='report.htm',
            file_type='document', file_size=len(HTML), file_path='report.htm', file_extension='.htm',
            mime_type='text/html', uploader='admin', file_hash=hashlib.md5(HTML).hexdigest(), source_type='quant')

    def url(self, suffix=''):
        return f'/api/quant/{self.collection.pk}/mt4/experts/{self.expert.pk}/{suffix}'

    def test_preview_save_duplicate_and_owner_boundary(self):
        preview = self.client.post(self.url('preview/'), {'asset_id': self.asset.pk}, format='json')
        self.assertEqual(preview.status_code, 200, preview.data)
        data = preview.data['data']
        self.assertEqual(len(data['report']['events']), 2)
        body = {'title': '测试记录', 'data': data['report'], 'report_asset_id': self.asset.pk}
        saved = self.client.post(self.url('tests/'), body, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        test = MT4Backtest.objects.get(pk=saved.data['data']['id'])
        self.assertEqual(test.data['events'][1]['balance'], '10001.00')
        self.assertTrue(test.attachments.filter(asset=self.asset, role='report').exists())
        listing = self.client.get(self.url()).data['data']['backtests'][0]
        self.assertNotIn('events', listing['data'])
        detail = self.client.get(self.url(f'tests/{test.pk}/')).data['data']['backtest']
        self.assertEqual(len(detail['data']['events']), 2)
        self.assertEqual(self.client.post(self.url('tests/'), body, format='json').status_code, 400)
        body['allow_duplicate'] = True
        self.assertEqual(self.client.post(self.url('tests/'), body, format='json').status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url()).status_code, 404)
        self.assertEqual(self.client.post(self.url('preview/'), {'asset_id': self.asset.pk}, format='json').status_code, 404)

    def test_sync_rejects_foreign_attachment(self):
        test = MT4Backtest.objects.create(expert=self.expert, title='回测', data={})
        MT4Attachment.objects.create(expert=self.expert, backtest=test, asset=self.asset, role='report')
        objects = [self.collection, self.asset, self.expert, test, *test.attachments.all()]
        rows = json.loads(serializers.serialize('json', objects))
        validate(rows, metadata(rows))
        asset = next(row for row in rows if row['model'] == 'assets.asset')
        asset['fields']['uploader'] = 'another-user'
        with self.assertRaises(SyncError):
            validate(rows, metadata(rows))

    def test_snapshot_restores_archive_with_report_reference(self):
        from .parser import parse_report
        test = MT4Backtest.objects.create(expert=self.expert, title='同步回测', data=parse_report(HTML))
        MT4Attachment.objects.create(expert=self.expert, backtest=test, asset=self.asset, role='report')
        manager = SyncManager()
        snapshot = manager.build_snapshot_data()
        meta = metadata(snapshot)
        self.assertEqual(meta['quant_schema_version'], 76)
        self.assertTrue(any(row['model'] == 'quant.mt4attachment' for row in snapshot))
        media = manager.media.compose_media_manifest()
        self.assertIn(self.asset.file_path, media)
        MT4Attachment.objects.all().delete()
        MT4Backtest.objects.all().delete()
        MT4Expert.objects.all().delete()
        manager.apply_snapshot_data(snapshot, remote_meta=meta)
        restored = MT4Backtest.objects.get(pk=test.pk)
        self.assertEqual(restored.data['events'][0]['sequence'], '1')
        self.assertTrue(restored.attachments.filter(asset_id=self.asset.pk).exists())

    def test_missing_referenced_report_is_not_silently_invalidated(self):
        test = MT4Backtest.objects.create(expert=self.expert, title='回测', data={})
        MT4Attachment.objects.create(expert=self.expert, backtest=test, asset=self.asset, role='report')
        Path(settings.MEDIA_ROOT, self.asset.file_path).unlink()
        SyncManager().reconcile_missing_book_media(drop_missing_assets=True)
        self.asset.refresh_from_db()
        self.assertTrue(self.asset.is_valid)

    def test_collection_is_not_an_article_destination(self):
        from article.access import can_access_anthology, can_manage_anthology
        request = type('Request', (), {'user': self.owner})()
        self.assertFalse(can_access_anthology(request, self.collection.pk))
        self.assertFalse(can_manage_anthology(request, self.collection.pk))

    def test_summary_projects_events_in_database_without_loading_deferred_data(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from .queries import with_summary
        from .serializers import TestSummarySerializer
        test = MT4Backtest.objects.create(expert=self.expert, title='长报告',
            data={'fields': {'symbol': 'EURUSD'}, 'metrics': [['收益', '1']],
                  'events': [{'sequence': str(i), 'payload': 'x' * 100} for i in range(20000)],
                  'nested': {'events': ['保留']}})
        with CaptureQueriesContext(connection) as captured:
            projected = with_summary(MT4Backtest.objects.filter(pk=test.pk)).get()
            self.assertNotIn('data', projected.__dict__)
            result = TestSummarySerializer(projected).data
        self.assertEqual(len(captured), 1)
        self.assertNotIn('events', result['data'])
        self.assertEqual(result['data']['nested']['events'], ['保留'])
        self.assertEqual(result['data']['fields']['symbol'], 'EURUSD')
        sql = captured[0]['sql'].lower()
        self.assertIn('json_remove' if connection.vendor == 'sqlite' else 'cast(', sql)
        self.assertNotIn('data', projected.__dict__)

    def test_zip_report_can_restore_original_chart(self):
        gif = bytes.fromhex('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b')
        contents = make_zip([('report.htm', HTML), ('StrategyTester.gif', gif)])
        Path(settings.MEDIA_ROOT, 'report.zip').write_bytes(contents)
        asset = Asset.objects.create(id='zip-report', name='report.zip', original_name='report.zip', file_type='archive',
            file_size=len(contents), file_path='report.zip', file_extension='.zip', mime_type='application/zip',
            uploader='admin', file_hash=hashlib.md5(contents).hexdigest(), source_type='quant')
        preview = self.client.post(self.url('preview/'), {'asset_id': asset.pk}, format='json')
        self.assertTrue(preview.data['data']['has_chart'])
        response = self.client.post(self.url('tests/'), {'title': 'ZIP', 'data': preview.data['data']['report'], 'report_asset_id': asset.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        chart = self.client.get(self.url(f"tests/{response.data['data']['id']}/zip-chart/"))
        self.assertEqual(chart.status_code, 200)
        self.assertEqual(chart.content, gif)
        self.assertEqual(chart['Content-Type'], 'image/gif')

    def test_vision_results_are_explicitly_requested(self):
        with patch('quant.mt4_reports.vision.recognize', return_value={'metrics': [{'name': '盈利', 'value': '1'}], 'model_name': 'test'}):
            response = self.client.post(self.url('recognize/'), {'asset_id': self.asset.pk}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['metrics'][0]['value'], '1')

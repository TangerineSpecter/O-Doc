import copy
from django.test import TestCase
from django.contrib.auth import get_user_model
from quant import test_research_analysis as fixtures
from quant import test_experiment_engine as data_fixtures
from quant.models import MarketDataset
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager, SyncError


class DatasetTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp

    def create(self):
        self.path = f'/api/quant/{self.collection.pk}/datasets/'
        return self.client.post(self.path, {'name': '测试行情', 'csv_text': data_fixtures.DataTests.raw, **data_fixtures.DataTests.metadata}, format='json')

    def test_import_idempotence_read_permissions_and_sync_restore(self):
        response = self.create()
        self.assertEqual(response.status_code, 200, response.data)
        dataset = MarketDataset.objects.get()
        self.assertEqual(self.create().data['data']['id'], dataset.pk)
        self.assertEqual(MarketDataset.objects.count(), 1)
        self.assertEqual(self.client.get(self.path).json()['data']['items'][0]['rowCount'], 2)
        detail = self.client.get(self.path + dataset.pk + '/').json()['data']
        self.assertEqual(len(detail['preview']), 2)
        self.assertNotIn('rawCsv', detail)
        self.assertEqual(self.client.post(self.path + dataset.pk + '/', {}, format='json').status_code, 405)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(MarketDataset.objects.get().raw_csv, data_fixtures.DataTests.raw)
        self.client.force_authenticate(get_user_model().objects.create_user('dataset-stranger'))
        self.assertIn(self.client.get(self.path).status_code, (403, 404))
        self.assertIn(self.client.get(self.path + dataset.pk + '/').status_code, (403, 404))

    def test_restore_rejects_changed_raw_prices_and_orphan_dataset(self):
        self.create()
        snapshot = SyncManager().build_snapshot_data()
        for field in ('raw_csv', 'snapshot', 'anthology'):
            changed = copy.deepcopy(snapshot)
            row = next(row for row in changed if row['model'] == 'quant.marketdataset')
            if field == 'snapshot':
                row['fields'][field]['rows'][0]['close'] = 999
            elif field == 'raw_csv':
                row['fields'][field] = 'bad'
            else:
                row['fields'][field] = 'missing'
            with self.assertRaises(SyncError):
                validate(changed, metadata(changed))

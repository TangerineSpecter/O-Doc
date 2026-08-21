import os
import shutil
import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory

from anthology.models import Anthology, Book
from assets.models import Asset
from assets.views import ResourceDownloadView, ResourceListView
from utils.error_codes import ErrorCode


TEST_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class ResourceAvailabilityTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.factory = APIRequestFactory()
        self.anthology = Anthology.objects.create(
            coll_id='coll_resource_book_test', title='书架测试', type='book', user_id='admin')
        self.asset = Asset.objects.create(
            id='missing_book_asset', name='missing.txt', original_name='missing.txt',
            file_type='document', file_size=10, file_path='books/missing.txt',
            file_extension='.txt', mime_type='text/plain', uploader='admin',
            file_hash='missing-book-asset', metadata={'book': True})
        self.book = Book.objects.create(
            book_id='book_resource_test', anthology=self.anthology, asset=self.asset,
            title='缺失正文的书', book_format='txt', local_state='cloud_only')

    def _create_cover_asset(self):
        return Asset.objects.create(
            id='book_cover_asset', name='cover.jpg', original_name='cover.jpg',
            file_type='image', file_size=10, file_path='book_covers/cover.jpg',
            file_extension='.jpg', mime_type='image/jpeg', uploader='admin',
            file_hash='book-cover-asset', metadata={'book_cover': True})

    def test_list_marks_missing_book_file_and_keeps_book_reference_linked(self):
        request = self.factory.get('/api/resource/list', {'type': 'document'})
        response = ResourceListView.as_view()(request)

        resource = response.data['data']['list'][0]
        self.assertFalse(resource['fileExists'])
        self.assertTrue(resource['linked'])
        self.assertEqual(resource['sourceBook']['id'], self.book.book_id)
        self.assertEqual(resource['sourceBook']['title'], self.book.title)

        unlinked_request = self.factory.get('/api/resource/list', {'linked': 'false'})
        unlinked_response = ResourceListView.as_view()(unlinked_request)
        self.assertEqual(unlinked_response.data['data']['total'], 0)

        missing_request = self.factory.get('/api/resource/list', {'missing': 'true'})
        missing_response = ResourceListView.as_view()(missing_request)
        self.assertEqual(missing_response.data['data']['total'], 1)

    def test_download_missing_file_returns_http_not_found(self):
        request = self.factory.get(f'/api/resource/download/{self.asset.id}')
        response = ResourceDownloadView.as_view()(request, self.asset.id)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], ErrorCode.RESOURCE_NOT_FOUND.code)

    def test_list_marks_book_cover_as_linked(self):
        cover_asset = self._create_cover_asset()
        self.book.cover_asset = cover_asset
        self.book.save(update_fields=['cover_asset'])
        os.makedirs(os.path.join(TEST_MEDIA_ROOT, 'book_covers'), exist_ok=True)
        with open(os.path.join(TEST_MEDIA_ROOT, cover_asset.file_path), 'wb') as output:
            output.write(b'cover-bytes')

        request = self.factory.get('/api/resource/list', {'type': 'image'})
        response = ResourceListView.as_view()(request)

        resource = response.data['data']['list'][0]
        self.assertTrue(resource['linked'])
        self.assertEqual(resource['sourceBook']['role'], 'cover')
        self.assertEqual(resource['sourceBook']['title'], self.book.title)

        download_request = self.factory.get(f'/api/resource/view/{cover_asset.id}')
        download_response = ResourceDownloadView.as_view()(download_request, cover_asset.id)
        self.assertEqual(download_response.status_code, 200)

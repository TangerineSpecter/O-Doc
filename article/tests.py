import os
import shutil
import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory

from anthology.models import Anthology
from article.models import Image
from article.views import ImageDeleteView
from assets.models import Asset
from assets.views import ResourceDeleteView, ResourceListView
from utils.error_codes import ErrorCode


TEST_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class ImageResourceCleanupTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.factory = APIRequestFactory()
        self.anthology = Anthology.objects.create(
            coll_id='coll_image_test',
            title='图片测试',
            type='image',
        )
        os.makedirs(os.path.join(TEST_MEDIA_ROOT, 'image'), exist_ok=True)

    def _create_asset(self, asset_id='asset_image_test'):
        file_path = f'image/{asset_id}.png'
        abs_path = os.path.join(TEST_MEDIA_ROOT, file_path)
        with open(abs_path, 'wb') as file_obj:
            file_obj.write(b'fake image')

        return Asset.objects.create(
            id=asset_id,
            name=f'{asset_id}.png',
            original_name=f'{asset_id}.png',
            file_type='image',
            file_size=10,
            file_path=file_path,
            file_extension='.png',
            mime_type='image/png',
            file_hash=asset_id,
            source_type='image',
        )

    def test_resource_delete_blocks_gallery_image_asset(self):
        asset = self._create_asset()
        Image.objects.create(
            title='图一',
            image_url=f'/api/resource/view/{asset.id}',
            coll_id=self.anthology.coll_id,
        )

        request = self.factory.delete(f'/api/resource/delete/{asset.id}')
        response = ResourceDeleteView.as_view()(request, asset.id)

        self.assertEqual(response.data['code'], ErrorCode.RESOURCE_IS_LINKED.code)
        self.assertTrue(Asset.objects.filter(id=asset.id).exists())

    def test_resource_list_marks_gallery_image_as_linked(self):
        asset = self._create_asset()
        Image.objects.create(
            title='图一',
            image_url=f'/api/resource/view/{asset.id}',
            coll_id=self.anthology.coll_id,
        )

        request = self.factory.get('/api/resource/list', {'type': 'image'})
        response = ResourceListView.as_view()(request)
        resource = response.data['data']['list'][0]

        self.assertTrue(resource['linked'])
        self.assertEqual(resource['sourceImage']['title'], '图一')

        request = self.factory.get('/api/resource/list', {'linked': 'false'})
        response = ResourceListView.as_view()(request)

        self.assertEqual(response.data['data']['total'], 0)

    def test_image_delete_removes_unshared_asset_file(self):
        asset = self._create_asset()
        image = Image.objects.create(
            title='图一',
            image_url=f'/api/resource/view/{asset.id}',
            coll_id=self.anthology.coll_id,
        )
        abs_path = os.path.join(TEST_MEDIA_ROOT, asset.file_path)

        request = self.factory.delete(f'/api/article/image/delete/{image.image_id}')
        response = ImageDeleteView.as_view()(request, image.image_id)

        self.assertEqual(response.data['code'], ErrorCode.SUCCESS.code)
        self.assertFalse(Asset.objects.filter(id=asset.id).exists())
        self.assertFalse(os.path.exists(abs_path))

    def test_image_delete_keeps_asset_when_shared_by_another_image(self):
        asset = self._create_asset()
        image = Image.objects.create(
            title='图一',
            image_url=f'/api/resource/view/{asset.id}',
            coll_id=self.anthology.coll_id,
        )
        Image.objects.create(
            title='图二',
            image_url=f'/api/resource/view/{asset.id}',
            coll_id=self.anthology.coll_id,
        )

        request = self.factory.delete(f'/api/article/image/delete/{image.image_id}')
        response = ImageDeleteView.as_view()(request, image.image_id)

        self.assertEqual(response.data['code'], ErrorCode.SUCCESS.code)
        self.assertTrue(Asset.objects.filter(id=asset.id).exists())

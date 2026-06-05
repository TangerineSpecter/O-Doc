import os
import shutil
import tempfile
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory

from anthology.models import Anthology
from article.models import Article, Image
from article.serializers import ArticleSerializer
from article.views import ArticleDeleteView, ImageDeleteView, ImageListView
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

    def test_resource_list_marks_article_content_image_as_linked(self):
        asset = self._create_asset()
        Article.objects.create(
            title='正文图片文章',
            content=f'![ChatGPT Image 2026年5月14日 00_25_18.png](/api/resource/view/{asset.id})',
            coll_id='coll_article_test',
        )

        request = self.factory.get('/api/resource/list', {'type': 'image'})
        response = ResourceListView.as_view()(request)
        resource = response.data['data']['list'][0]

        self.assertTrue(resource['linked'])
        self.assertEqual(resource['sourceArticle']['title'], '正文图片文章')

        request = self.factory.get('/api/resource/list', {'linked': 'false'})
        response = ResourceListView.as_view()(request)

        self.assertEqual(response.data['data']['total'], 0)

    def test_image_list_orders_by_shooting_time_with_created_at_fallback(self):
        now = timezone.now()
        older_shooting = Image.objects.create(
            title='较早拍摄',
            image_url='/api/resource/view/older-shooting',
            coll_id=self.anthology.coll_id,
            shooting_time=now - timedelta(days=10),
        )
        fallback_newer = Image.objects.create(
            title='无拍摄时间但创建较新',
            image_url='/api/resource/view/fallback-newer',
            coll_id=self.anthology.coll_id,
        )
        fallback_older = Image.objects.create(
            title='无拍摄时间且创建较旧',
            image_url='/api/resource/view/fallback-older',
            coll_id=self.anthology.coll_id,
        )
        latest_shooting = Image.objects.create(
            title='最新拍摄',
            image_url='/api/resource/view/latest-shooting',
            coll_id=self.anthology.coll_id,
            shooting_time=now + timedelta(days=1),
        )

        Image.objects.filter(image_id=fallback_newer.image_id).update(created_at=now)
        Image.objects.filter(image_id=fallback_older.image_id).update(created_at=now - timedelta(days=20))
        Image.objects.filter(image_id=older_shooting.image_id).update(created_at=now + timedelta(days=2))
        Image.objects.filter(image_id=latest_shooting.image_id).update(created_at=now - timedelta(days=30))

        request = self.factory.get(f'/api/article/image/list/{self.anthology.coll_id}')
        response = ImageListView.as_view()(request, self.anthology.coll_id)

        self.assertEqual(response.data['code'], ErrorCode.SUCCESS.code)
        self.assertEqual(
            [image['title'] for image in response.data['data']],
            ['最新拍摄', '无拍摄时间但创建较新', '较早拍摄', '无拍摄时间且创建较旧'],
        )

    def test_article_save_does_not_unlink_content_images_when_attachments_change(self):
        content_asset = self._create_asset('content_image_asset')
        attachment_asset = self._create_asset('attachment_asset')
        attachment_asset.source_type = 'attachment'
        attachment_asset.save(update_fields=['source_type'])
        article = Article.objects.create(
            title='正文图片文章',
            content=f'![ChatGPT Image 2026年5月14日 00_25_18.png](/api/resource/view/{content_asset.id})',
            coll_id='coll_article_test',
        )
        content_asset.linked_article = article
        content_asset.is_linked = True
        content_asset.source_type = 'content'
        content_asset.save(update_fields=['linked_article', 'is_linked', 'source_type'])

        serializer = ArticleSerializer(
            article,
            data={
                'title': article.title,
                'content': article.content,
                'assets': [attachment_asset.id],
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        content_asset.refresh_from_db()
        attachment_asset.refresh_from_db()
        self.assertEqual(content_asset.linked_article_id, article.article_id)
        self.assertTrue(content_asset.is_linked)
        self.assertEqual(attachment_asset.linked_article_id, article.article_id)
        self.assertTrue(attachment_asset.is_linked)

    def test_article_delete_removes_article_vectors(self):
        anthology = Anthology.objects.create(
            coll_id='coll_article_delete_test',
            title='文章删除测试',
            type='article',
            user_id='admin',
        )
        article = Article.objects.create(
            title='待删除文章',
            content='有向量的文章内容',
            coll_id=anthology.coll_id,
            author='admin',
            is_rag_synced=True,
        )

        request = self.factory.delete(f'/api/article/delete/{article.article_id}')
        with patch('article.views.RagClient.delete_article') as mock_delete_article:
            response = ArticleDeleteView.as_view()(request, article.article_id)

        self.assertEqual(response.data['code'], ErrorCode.SUCCESS.code)
        mock_delete_article.assert_called_once_with(article.article_id)
        article.refresh_from_db()
        self.assertFalse(article.is_valid)

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

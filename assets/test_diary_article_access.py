"""Diary deduplication must preserve article grants without exposing private media."""
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article, ArticleAsset
from assets.models import Asset


class DiaryArticleAccessTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix='odoc-diary-article-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.enterContext(override_settings(MEDIA_ROOT=self.root, SYSTEM_LOG_ENABLED=False))
        self.owner = get_user_model().objects.create_user('diary-share-owner')
        self.other = get_user_model().objects.create_user('diary-share-reader')
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        from utils.drf_utils import get_current_user_identifier
        class Request:
            user = self.owner
        self.owner_id = get_current_user_identifier(Request())
        data = BytesIO()
        Image.new('RGB', (12, 8), 'orange').save(data, 'PNG')
        self.photo = data.getvalue()
        self.collection = Anthology.objects.create(coll_id='diary-share-articles', title='公开文章', user_id=self.owner_id, permission='public', type='article')

    def upload(self, source):
        self.assertEqual(Path(settings.MEDIA_ROOT).resolve(), self.root)
        response = self.client.post('/api/resource/upload', {
            'source_type': source,
            'file': SimpleUploadedFile('shared-photo.png', self.photo, content_type='image/png'),
        }, format='multipart')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['code'], 200)
        return response.json()['data']

    def public_article(self, asset, mode):
        article = Article.objects.create(title='引用图片', coll_id=self.collection.pk, author=self.owner_id, permission='public', content=(f'![图片](/api/resource/view/{asset.pk})' if mode == 'content' else '正文'))
        if mode == 'reference':
            ArticleAsset.objects.create(article=article, asset=asset, role='material')
        elif mode == 'linked':
            asset.linked_article = article
            asset.save(update_fields=['linked_article'])
        return article

    def attach_diary(self, asset_id):
        self.client.force_authenticate(self.owner)
        response = self.client.post('/api/diary/', {'title': '今天', 'content': '复用已有图片', 'entryDate': '2026-11-03', 'imageAssetIds': [asset_id]}, format='json')
        self.assertEqual(response.status_code, 200)
        return response.json()['data']['diaryId']

    def assert_public(self, asset):
        for reader in (self.owner, self.other, None):
            self.client.force_authenticate(reader)
            for path in (f'/api/resource/view/{asset.pk}', f'/api/resource/download/{asset.pk}', f'/media/{asset.file_path}'):
                with self.subTest(reader=getattr(reader, 'username', 'anonymous'), path=path):
                    response = self.client.get(path)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(b''.join(response.streaming_content), self.photo)

    def shared_article_scenario(self, mode):
        asset_id = self.upload('content')['id']
        asset = Asset.objects.get(pk=asset_id)
        self.public_article(asset, mode)
        self.assert_public(asset)
        self.client.force_authenticate(self.owner)
        duplicate = self.upload('diary')
        self.assertTrue(duplicate['duplicate'])
        self.assertEqual(duplicate['id'], asset.pk)
        self.assertEqual(Asset.objects.count(), 1)
        key = self.attach_diary(asset.pk)
        self.assert_public(asset)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(f'/api/diary/{key}').status_code, 200)
        self.assert_public(asset)
        self.collection.permission = 'private'
        self.collection.save(update_fields=['permission'])
        for reader in (self.other, None):
            self.client.force_authenticate(reader)
            self.assertEqual(self.client.get(f'/api/resource/view/{asset.pk}').status_code, 404)
            self.assertEqual(self.client.get(f'/media/{asset.file_path}').status_code, 404)

    def test_body_reference_survives_diary_dedup_and_deletion(self):
        self.shared_article_scenario('content')

    def test_structured_reference_survives_diary_dedup_and_deletion(self):
        self.shared_article_scenario('reference')

    def test_linked_article_survives_diary_dedup_and_deletion(self):
        self.shared_article_scenario('linked')

    def test_diary_only_images_remain_private_after_deletion(self):
        asset = Asset.objects.get(pk=self.upload('diary')['id'])
        key = self.attach_diary(asset.pk)
        for deleted in (False, True):
            if deleted:
                self.client.force_authenticate(self.owner)
                self.client.delete(f'/api/diary/{key}')
            for reader in (self.other, None):
                self.client.force_authenticate(reader)
                self.assertEqual(self.client.get(f'/api/resource/view/{asset.pk}').status_code, 404)
                self.assertEqual(self.client.get(f'/media/{asset.file_path}').status_code, 404)

    def test_diary_origin_can_be_explicitly_shared_by_an_article(self):
        asset = Asset.objects.get(pk=self.upload('diary')['id'])
        self.attach_diary(asset.pk)
        self.public_article(asset, 'reference')
        self.assert_public(asset)

    def test_private_note_in_public_collection_is_not_exposed(self):
        asset = Asset.objects.get(pk=self.upload('content')['id'])
        article = self.public_article(asset, 'reference')
        article.permission = 'private'
        article.enforce_note_privacy = True
        article.save(update_fields=['permission', 'enforce_note_privacy'])
        self.attach_diary(asset.pk)
        for reader in (self.other, None):
            self.client.force_authenticate(reader)
            for path in (f'/api/resource/view/{asset.pk}', f'/api/resource/download/{asset.pk}', f'/media/{asset.file_path}'):
                self.assertEqual(self.client.get(path).status_code, 404)

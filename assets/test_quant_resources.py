"""Quant integration tests only use an isolated DB and temporary media tree."""
import hashlib
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article, ArticleAsset
from assets.models import Asset
from quant.models import Attachment, Entry
from utils.resource_assets import delete_asset_record_and_file, is_asset_referenced


class QuantResourceIntegrationTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='odoc-quant-media-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.override = override_settings(MEDIA_ROOT=self.root)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.owner = get_user_model().objects.create_user('quant-resource-owner')
        self.other = get_user_model().objects.create_user('quant-resource-other')
        from user.models import UserProfile
        for user in (self.owner, self.other):
            UserProfile.objects.update_or_create(user=user, defaults={'userid': user.username})
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.collection = Anthology.objects.create(coll_id='quant-resource-test', title='量化资料',
            description='隔离测试', type='quant', permission='private', user_id=self.owner.username)
        self.entry = Entry.objects.create(anthology=self.collection, title='原始研究')
        self.path = (self.root / 'quant-source.py').resolve()
        self.assertTrue(self.path.is_relative_to(self.root))
        self.path.write_text('def factor(close):\n    return close.pct_change(10)\n')
        self.asset = Asset.objects.create(id='quant-source-asset', name='factor.py', original_name='factor.py',
            file_type='code', file_size=self.path.stat().st_size, file_path=self.path.name,
            file_extension='.py', mime_type='text/x-python', uploader=self.owner.username,
            source_type='quant', file_hash=hashlib.md5(self.path.read_bytes()).hexdigest())
        self.reference = Attachment.objects.create(entry=self.entry, asset=self.asset)

    def public_article(self, *, content=''):
        collection = Anthology.objects.create(title='公开文集', type='article',
            permission='public', user_id=self.other.username)
        return Article.objects.create(title='公开引用', content=content, coll_id=collection.pk,
            author=self.other.username, permission='public')

    def assert_private_resource(self):
        for reader, expected in ((self.owner, 200), (self.other, 404), (None, 404)):
            self.client.force_authenticate(reader)
            for route in ('view', 'download'):
                with self.subTest(reader=getattr(reader, 'username', 'anonymous'), route=route):
                    response = self.client.get(f'/api/resource/{route}/{self.asset.pk}')
                    self.assertEqual(response.status_code, expected)
                    if expected == 200:
                        self.assertEqual(response.content, self.path.read_bytes())

    def test_quant_upload_cannot_be_exposed_by_public_article_content(self):
        self.reference.delete()
        self.public_article(content=f'[研究附件](/api/resource/view/{self.asset.pk})')
        self.assert_private_resource()

    def test_quant_attachment_keeps_legacy_asset_private_despite_article_reference(self):
        self.asset.source_type = 'attachment'
        self.asset.save(update_fields=['source_type'])
        ArticleAsset.objects.create(article=self.public_article(), asset=self.asset, role='material')
        self.assert_private_resource()

    def test_soft_deleted_quant_attachment_cannot_use_linked_article_fallback(self):
        self.entry.is_valid = False
        self.entry.save(update_fields=['is_valid'])
        self.collection.is_valid = False
        self.collection.save(update_fields=['is_valid'])
        self.asset.source_type = 'other'
        self.asset.linked_article = self.public_article()
        self.asset.save(update_fields=['source_type', 'linked_article'])
        self.assert_private_resource()

    def test_quant_asset_cannot_be_exposed_by_another_accounts_moment(self):
        from system_settings.agent_world.social_models import Moment
        Moment.objects.create(owner_id=self.other.username, actor_id='other-resident',
            content='引用附件', images=[self.asset.pk])
        self.assert_private_resource()

    def test_nonquant_public_article_assets_keep_existing_access(self):
        self.reference.delete()
        self.asset.source_type = 'content'
        self.asset.save(update_fields=['source_type'])
        self.public_article(content=f'[普通附件](/api/resource/view/{self.asset.pk})')
        for reader in (self.owner, self.other, None):
            self.client.force_authenticate(reader)
            for route in ('view', 'download'):
                with self.subTest(reader=getattr(reader, 'username', 'anonymous'), route=route):
                    response = self.client.get(f'/api/resource/{route}/{self.asset.pk}')
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.content, self.path.read_bytes())

    def test_resource_list_reports_quant_source_and_linked_filter(self):
        response = self.client.get('/api/resource/list', {'linked': 'true'})
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        self.assertEqual(data['total'], 1)
        self.assertTrue(data['list'][0]['linked'])
        self.assertEqual(data['list'][0]['sourceQuant']['id'], self.entry.pk)
        self.assertEqual(self.client.get('/api/resource/list', {'linked': 'false'}).json()['data']['total'], 0)

    def test_only_owner_can_download_and_legacy_media_is_closed(self):
        response = self.client.get(f'/api/resource/download/{self.asset.pk}')
        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment', response['Content-Disposition'])
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/resource/download/{self.asset.pk}').status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/resource/view/{self.asset.pk}').status_code, 404)
        self.assertEqual(self.client.get('/media/' + self.path.name).status_code, 404)

    def test_soft_deleted_research_still_protects_media(self):
        self.entry.is_valid = False
        self.entry.save()
        self.collection.is_valid = False
        self.collection.save()
        before = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.assertTrue(is_asset_referenced(self.asset))
        self.assertFalse(delete_asset_record_and_file(self.asset))
        response = self.client.delete(f'/api/resource/delete/{self.asset.pk}')
        self.assertNotEqual(response.json()['code'], 200)
        self.assertTrue(Asset.objects.filter(pk=self.asset.pk).exists())
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), before)

    def test_anthology_is_private_and_cannot_convert_or_accept_articles(self):
        response = self.client.post('/api/anthology/create', {'title': '新量化', 'description': '测试',
            'type': 'quant', 'permission': 'public'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['permission'], 'private')
        response = self.client.put(f'/api/anthology/update/{self.collection.pk}', {'permission': 'public'}, format='json')
        self.assertEqual(response.status_code, 400)
        response = self.client.put(f'/api/anthology/update/{self.collection.pk}', {'type': 'article'}, format='json')
        self.assertEqual(response.status_code, 400)
        from article.access import can_manage_anthology
        from rest_framework.test import APIRequestFactory, force_authenticate
        from rest_framework.request import Request
        raw = APIRequestFactory().post('/')
        force_authenticate(raw, self.owner)
        self.assertFalse(can_manage_anthology(Request(raw), self.collection.pk))
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/anthology/detail/{self.collection.pk}').status_code, 404)

    def test_upload_quant_script_classification_and_rejects_invalid_image(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        for extension in ('.pine', '.mq4', '.mqh', '.ipynb'):
            contents = b'{"cells":[]}' if extension == '.ipynb' else ('// ' + extension).encode()
            response = self.client.post('/api/resource/upload', {'source_type': 'quant',
                'file': SimpleUploadedFile('source' + extension, contents)}, format='multipart')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['data']['type'], 'code')
        response = self.client.post('/api/resource/upload', {'source_type': 'quant',
            'file': SimpleUploadedFile('invalid.png', b'not-image')}, format='multipart')
        self.assertEqual(response.status_code, 400)

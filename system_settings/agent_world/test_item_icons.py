import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from PIL import Image
from django.contrib.auth.models import User
from django.core import serializers
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from assets.models import Asset
from assets.serializers import AssetSerializer
from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS, suspend_tracking
from utils.resource_assets import delete_asset_record_and_file
from utils.sync_manager import SyncManager
from .item_icon_images import compress_icon, MAX_BYTES
from .item_icons import bind_icon, normalize_item_name, upload_icon
from .travel_models import AgentInventoryItem


def image_file(size=(2048, 2048), color=(255, 0, 0, 128), format='PNG'):
    out = BytesIO()
    Image.new('RGBA', size, color).save(out, format=format)
    return SimpleUploadedFile('icon.png', out.getvalue(), content_type='image/png')


class ItemIconTests(TestCase):
    def setUp(self):
        self.media = TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.media.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.user = User.objects.create_user('icon-owner', password='test')
        self.other = User.objects.create_user('other-owner', password='test')
        from user.models import UserProfile
        for user in [self.user, self.other]:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.userid = user.username; profile.save()
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.item = AgentInventoryItem.objects.create(id='one', actor_id='actor', owner_id='icon-owner',
            actor_name='菲伦', name='枫叶徽章（虚拟商品）', quantity=2)
        self.second = AgentInventoryItem.objects.create(id='two', actor_id='actor', owner_id='icon-owner',
            name='枫叶徽章', quantity=1)
        self.root = '/api/settings/agent-world/'

    def test_shrink_alpha_and_strip_metadata(self):
        data, meta = compress_icon(image_file())
        with Image.open(BytesIO(data)) as image:
            self.assertEqual(image.size, (256, 256))
            self.assertEqual(image.format, 'WEBP')
            self.assertEqual(image.convert('RGBA').getpixel((128, 128))[3], 128)
            self.assertFalse(image.getexif())
        self.assertEqual(meta['content_width'], 256)

    def test_rectangle_and_no_upscale(self):
        for size, content in [((2048, 1024), (256, 128)), ((32, 16), (32, 16))]:
            data, meta = compress_icon(image_file(size))
            image = Image.open(BytesIO(data)).convert('RGBA')
            self.assertEqual(image.getpixel((0, 0))[3], 0)
            self.assertEqual((meta['content_width'], meta['content_height']), content)

    def test_exif_orientation(self):
        out = BytesIO()
        source = Image.new('RGB', (80, 40), 'red')
        exif = Image.Exif(); exif[274] = 6
        source.save(out, format='JPEG', exif=exif)
        _, meta = compress_icon(SimpleUploadedFile('a.jpg', out.getvalue()))
        self.assertEqual((meta['content_width'], meta['content_height']), (40, 80))

    def test_invalid_animated_oversized(self):
        for data in [b'<svg/>', b'broken', image_file().read()[:50]]:
            with self.assertRaises(ValueError):
                compress_icon(SimpleUploadedFile('invalid', data))
        file = image_file((2, 2)); file.size = MAX_BYTES + 1
        with self.assertRaises(ValueError): compress_icon(file)
        with self.assertRaises(ValueError): compress_icon(image_file((4001, 4000)))
        out = BytesIO()
        Image.new('RGBA', (10, 10), 'red').save(out, format='PNG', save_all=True,
            append_images=[Image.new('RGBA', (10, 10), 'blue')], duration=100)
        with self.assertRaises(ValueError): compress_icon(SimpleUploadedFile('animation.png', out.getvalue()))

    def test_dedup_account_scope_and_only_processed_file(self):
        first, duplicate = upload_icon(image_file(), 'icon-owner', '枫叶徽章')
        same, duplicate = upload_icon(image_file(), 'icon-owner', '另一个名字')
        self.assertTrue(duplicate); self.assertEqual(first.pk, same.pk)
        other, _ = upload_icon(image_file(), 'other-owner', '枫叶徽章')
        self.assertNotEqual(first.pk, other.pk)
        self.assertEqual(len(list(Path(self.media.name).rglob('*.webp'))), 2)
        self.assertEqual(first.file_size, (Path(self.media.name) / first.file_path).stat().st_size)

    def test_manual_reuse_replace_clear_and_failure(self):
        icon, _ = upload_icon(image_file(), 'icon-owner', '徽章')
        bind_icon(self.item.pk, 'icon-owner', icon.pk)
        bind_icon(self.second.pk, 'icon-owner', icon.pk)
        replacement, _ = upload_icon(image_file(color=(0, 0, 255, 255)), 'icon-owner', '蓝色')
        bind_icon(self.item.pk, 'icon-owner', replacement.pk)
        self.second.refresh_from_db(); self.assertEqual(self.second.icon_asset_id, icon.pk)
        with self.assertRaises(ValueError): bind_icon(self.item.pk, 'icon-owner', 'missing')
        self.item.refresh_from_db(); self.assertEqual(self.item.icon_asset_id, replacement.pk)
        bind_icon(self.item.pk, 'icon-owner', None)
        self.item.refresh_from_db(); self.assertIsNone(self.item.icon_asset_id)
        self.assertFalse(delete_asset_record_and_file(icon))
        self.assertTrue(Asset.objects.filter(pk=icon.pk).exists())

    def test_api_upload_recommend_bind_list_delete(self):
        result = self.client.post(self.root+'item-icons/', {'file': image_file(), 'name': '枫叶徽章'}, format='multipart')
        self.assertEqual(result.status_code, 200)
        icon_id = result.json()['data']['id']
        recommendations = self.client.get(self.root+'item-icons/', {'itemId': self.item.pk}).json()['data']['list']
        self.assertTrue(recommendations[0]['recommended'])
        self.item.refresh_from_db(); self.assertIsNone(self.item.icon_asset_id)
        bound = self.client.patch(self.root+f'inventory/{self.item.pk}/icon/', {'assetId': icon_id}, format='json')
        self.assertEqual(bound.status_code, 200)
        self.assertEqual(bound.json()['data']['iconAssetId'], icon_id)
        self.assertTrue(bound.json()['data']['iconUrl'].endswith(icon_id))
        managed = self.client.get(self.root+'inventory/manage/').json()['data']['list']
        self.assertEqual(managed[0]['id'], self.second.pk)
        self.assertEqual(self.client.delete(self.root+f'item-icons/{icon_id}/').status_code, 409)
        self.client.patch(self.root+f'inventory/{self.item.pk}/icon/', {'assetId': None}, format='json')
        self.assertEqual(self.client.delete(self.root+f'item-icons/{icon_id}/').status_code, 200)
        self.assertFalse(Asset.objects.filter(pk=icon_id).exists())

    def test_isolation_type_and_missing_file(self):
        foreign, _ = upload_icon(image_file(), 'other-owner', '他人')
        for resource_id in [foreign.pk, 'missing']:
            response = self.client.patch(self.root+f'inventory/{self.item.pk}/icon/', {'assetId': resource_id}, format='json')
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(self.root+'item-icons/').json()['data']['total'], 0)
        self.assertEqual(self.client.delete(self.root+f'item-icons/{foreign.pk}/').status_code, 404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.root+'inventory/manage/').json()['data']['total'], 0)
        self.assertEqual(self.client.patch(self.root+f'inventory/{self.item.pk}/icon/', {'assetId': None}, format='json').status_code, 404)
        self.client.force_authenticate(self.user)
        own, _ = upload_icon(image_file(), 'icon-owner', '自己的')
        own.source_type = 'other'; own.save()
        with self.assertRaises(ValueError): bind_icon(self.item.pk, 'icon-owner', own.pk)
        own.source_type = 'item_icon'; own.save()
        (Path(self.media.name)/own.file_path).unlink()
        with self.assertRaises(ValueError): bind_icon(self.item.pk, 'icon-owner', own.pk)

    def test_failure_retains_association_and_immutable_generic_serializer(self):
        icon, _ = upload_icon(image_file(), 'icon-owner', '徽章')
        bind_icon(self.item.pk, 'icon-owner', icon.pk)
        with patch('system_settings.agent_world.item_icons.Asset.objects.create', side_effect=OSError('disk')):
            with self.assertRaises(OSError): upload_icon(image_file(color=(1, 2, 3, 255)), 'icon-owner', '失败')
        self.assertEqual(len(list(Path(self.media.name).rglob('*.webp'))), 1)
        self.item.refresh_from_db(); self.assertEqual(self.item.icon_asset_id, icon.pk)
        serializer = AssetSerializer(icon, data={'file_path': 'replacement'}, partial=True)
        self.assertFalse(serializer.is_valid())

    def test_snapshot_roundtrip_stable_ids_and_metadata(self):
        icon, _ = upload_icon(image_file(), 'icon-owner', '徽章')
        bind_icon(self.item.pk, 'icon-owner', icon.pk)
        labels = {model._meta.label_lower for model in SyncManager()._iter_target_models()}
        self.assertIn('assets.asset', labels)
        self.assertIn('system_settings.agentinventoryitem', labels)
        self.assertNotIn('system_settings.agentinventoryitem', LOCAL_ONLY_MODEL_LABELS)
        icon.refresh_from_db()
        snapshot = serializers.serialize('json', [icon, AgentInventoryItem.objects.get(pk=self.item.pk)])
        with suspend_tracking():
            AgentInventoryItem.objects.filter(pk=self.item.pk).delete()
            Asset.objects.filter(pk=icon.pk).delete()
        SyncManager().apply_snapshot_data(json.loads(snapshot), remote_meta={'app_version':'0.0.1'})
        restored = AgentInventoryItem.objects.get(pk=self.item.pk)
        restored_icon = Asset.objects.get(pk=restored.icon_asset_id)
        self.assertEqual(restored_icon.pk, icon.pk)
        self.assertEqual(restored_icon.source_type, 'item_icon')
        self.assertIn('枫叶徽章', restored_icon.metadata['confirmed_names'])
        self.assertTrue((Path(self.media.name)/restored_icon.file_path).exists())
        paths, missing = SyncManager()._collect_asset_relative_paths()
        self.assertIn(restored_icon.file_path, paths)
        self.assertEqual(missing, [])
        self.assertEqual(SyncManager._hash_file(str(Path(self.media.name)/restored_icon.file_path)), restored_icon.file_hash)

    def test_name_normalization_is_conservative(self):
        self.assertEqual(normalize_item_name('  枫叶  徽章 （虚拟商品） '), '枫叶 徽章')
        self.assertNotEqual(normalize_item_name('枫叶纪念徽章'), normalize_item_name('枫叶徽章'))

    def test_generic_delete_list_read_and_upload_protection(self):
        icon, _ = upload_icon(image_file(), 'icon-owner', '徽章')
        bind_icon(self.item.pk, 'icon-owner', icon.pk)
        listed = self.client.get('/api/resource/list', {'type': 'image', 'linked': 'true'}).json()['data']
        self.assertEqual(listed['total'], 1)
        self.assertTrue(listed['list'][0]['linked'])
        self.assertEqual(self.client.get('/api/resource/list', {'linked': 'false'}).json()['data']['total'], 0)
        self.client.delete(f'/api/resource/delete/{icon.pk}')
        self.assertTrue(Asset.objects.filter(pk=icon.pk).exists())
        self.assertTrue((Path(self.media.name)/icon.file_path).exists())
        response = self.client.post('/api/resource/upload', {'file': image_file(), 'source_type': 'item_icon'}, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post('/api/resource/create', {'sourceType':'item_icon'}, format='json').status_code, 400)
        self.assertEqual(len(list(Path(self.media.name).rglob('*.webp'))), 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/resource/view/{icon.pk}').status_code, 404)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(self.root+'item-icons/').status_code, [401, 403])

    def test_inventory_list_contract_and_missing_filter(self):
        self.assertIsNone(AgentInventoryItem.objects.get(pk=self.item.pk).icon_asset_id)
        data = self.client.get(self.root+'inventory/').json()['data']
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 2)
        self.assertIsNone(data[0]['iconAssetId'])
        self.assertEqual(data[0]['iconUrl'], '')
        self.assertEqual(self.client.get(self.root+'inventory/manage/', {'picture':'missing'}).json()['data']['total'], 2)
        self.assertEqual(self.client.get(self.root+'inventory/manage/', {'picture':'set'}).json()['data']['total'], 0)

    def test_icon_download_with_normal_token_login(self):
        icon, _ = upload_icon(image_file(), 'icon-owner', '私有图标')
        self.client.force_authenticate(user=None)
        response = self.client.post('/api/auth/login', {'email': self.user.username, 'password': 'test'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('sessionid', self.client.cookies)
        token = response.json()['data']['token']
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token)
        self.assertEqual(self.client.get(self.root+'item-icons/').status_code, 200)
        downloaded = self.client.get('/api/resource/download/' + icon.pk)
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded['Content-Type'], 'image/webp')
        self.assertEqual(len(downloaded.content), icon.file_size)
        self.client.credentials()
        self.assertEqual(self.client.get('/api/resource/download/' + icon.pk).status_code, 404)

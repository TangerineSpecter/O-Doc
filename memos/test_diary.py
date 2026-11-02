from tempfile import TemporaryDirectory
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from system_settings.sync_state import should_track
from utils.sync_models import SnapshotModels
from .diary_models import DiaryEntry


class DiaryTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.temp.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.owner = get_user_model().objects.create_user(username='diary-owner')
        self.other = get_user_model().objects.create_user(username='diary-other')
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.draft = {'title': '今天', 'content': '记住今天。', 'entryDate': '2026-11-03', 'coverAssetId': None, 'mood': 'happy', 'weather': 'sunny', 'tags': ['日常', '旅行']}

    def test_crud_and_ownership(self):
        created = self.client.post('/api/diary/', self.draft, format='json')
        self.assertEqual(created.status_code, 200)
        entry = created.json()['data']
        key = entry['diaryId']
        self.assertEqual(entry['entryDate'], '2026-11-03')
        self.assertNotIn('category', entry)
        self.assertEqual(len(self.client.get('/api/diary/').json()['data']), 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/diary/').json()['data'], [])
        for method in ('get', 'put', 'delete'):
            response = getattr(self.client, method)(f'/api/diary/{key}', self.draft, format='json') if method == 'put' else getattr(self.client, method)(f'/api/diary/{key}')
            self.assertEqual(response.status_code, 404)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.put(f'/api/diary/{key}', {**self.draft, 'content': '修改'}, format='json').json()['data']['content'], '修改')
        self.assertEqual(self.client.delete(f'/api/diary/{key}').status_code, 200)
        self.assertFalse(DiaryEntry.objects.get(pk=key).is_valid)
        self.assertEqual(self.client.delete(f'/api/diary/{key}').status_code, 404)
        self.assertEqual(self.client.get('/api/diary/').json()['data'], [])

    def test_validation_and_authentication(self):
        for patch in ({'content': '  '}, {'entryDate': 'bad'}, {'coverAssetId': 'missing'}, {'mood': 'bad'}, {'weather': 'bad'}, {'tags': ['x' * 31]}, {'tags': list(map(str, range(11)))}, {'title': 'x' * 151}):
            self.assertEqual(self.client.post('/api/diary/', {**self.draft, **patch}, format='json').status_code, 400)
        self.assertEqual(self.client.put('/api/diary/', self.draft, format='json').status_code, 405)
        self.assertEqual(self.client.post('/api/diary/unknown', self.draft, format='json').status_code, 405)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/diary/').status_code, (401, 403))

    def test_sync_selection_and_soft_delete_revision(self):
        from system_settings.models import SyncEntityState
        from django.core import serializers
        self.assertTrue(should_track(DiaryEntry))
        self.assertIn(DiaryEntry, list(SnapshotModels(['memos']).iter_target_models()))
        created = self.client.post('/api/diary/', self.draft, format='json').json()['data']
        key = created['diaryId']
        exported = serializers.serialize('python', DiaryEntry.objects.filter(pk=key))[0]
        self.assertEqual(exported['fields']['mood'], 'happy')
        self.assertEqual(exported['fields']['weather'], 'sunny')
        self.assertEqual(exported['fields']['tags'], self.draft['tags'])
        payload = serializers.serialize('json', DiaryEntry.objects.filter(pk=key))
        from system_settings.sync_state import suspend_tracking
        with suspend_tracking():
            for _ in range(2):
                for record in serializers.deserialize('json', payload):
                    record.save()
        self.assertEqual(DiaryEntry.objects.filter(pk=key).count(), 1)
        self.assertEqual(DiaryEntry.objects.get(pk=key).content, self.draft['content'])
        from copy import deepcopy
        from utils.sync_merge import merge_records
        remote = deepcopy(exported)
        remote['fields']['content'] = '另一台设备修改'
        revision_key = f'memos.diaryentry:{key}'
        merged, _, _ = merge_records(
            None, [exported], {revision_key: {'hash': 'local', 'revision_at': '2026-11-03T01:00:00Z', 'deleted': False}},
            {'data': [remote], 'revisions': {revision_key: {'hash': 'remote', 'revision_at': '2026-11-03T02:00:00Z', 'deleted': False}}},
        )
        self.assertEqual(merged[0]['fields']['content'], '另一台设备修改')
        self.client.delete(f'/api/diary/{key}')
        self.assertTrue(SyncEntityState.objects.filter(model_label='memos.diaryentry', object_pk=key).exists())
        self.assertFalse(serializers.serialize('python', DiaryEntry.objects.filter(pk=key))[0]['fields']['is_valid'])

    def upload_image(self, name='diary.png', color='red'):
        from io import BytesIO
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.conf import settings
        from pathlib import Path
        self.assertEqual(Path(settings.MEDIA_ROOT).resolve(), Path(self.temp.name).resolve())
        data = BytesIO()
        Image.new('RGB', (20, 10), color).save(data, 'PNG')
        return self.client.post('/api/resource/upload', {'source_type': 'diary', 'file': SimpleUploadedFile(name, data.getvalue(), content_type='image/png')}, format='multipart')

    def test_image_library_link_privacy_and_delete_protection(self):
        from pathlib import Path
        from assets.models import Asset
        from utils.resource_assets import delete_asset_record_and_file, is_asset_referenced
        from utils.sync_media import SnapshotMedia
        uploaded = self.upload_image()
        self.assertEqual(uploaded.status_code, 200)
        asset_id = uploaded.json()['data']['id']
        duplicate = self.upload_image().json()['data']
        self.assertEqual(duplicate['id'], asset_id)
        asset = Asset.objects.get(pk=asset_id)
        self.assertEqual(asset.source_type, 'diary')
        path = (Path(self.temp.name) / asset.file_path).resolve()
        self.assertTrue(path.is_relative_to(Path(self.temp.name).resolve()))
        original = path.read_bytes()
        entry = self.client.post('/api/diary/', {**self.draft, 'coverAssetId': asset_id}, format='json').json()['data']
        key = entry['diaryId']
        self.assertEqual(entry['coverUrl'], f'/api/resource/view/{asset_id}')
        from django.core import serializers
        snapshot = serializers.serialize('python', DiaryEntry.objects.filter(pk=key))[0]
        self.assertEqual(snapshot['fields']['cover_asset'], asset_id)
        listing = self.client.get('/api/resource/list?linked=true').json()['data']['list']
        row = next(row for row in listing if row['id'] == asset_id)
        self.assertEqual(row['sourceDiary'], {'id': key, 'title': '今天'})
        self.assertTrue(row['linked'])
        self.assertTrue(is_asset_referenced(asset))
        self.assertFalse(delete_asset_record_and_file(asset))
        self.assertEqual(self.client.delete(f'/api/resource/delete/{asset_id}').status_code, 409)
        self.assertEqual(path.read_bytes(), original)
        download = self.client.get(f'/api/resource/download/{asset_id}')
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b''.join(download.streaming_content), original)
        relative_paths, missing = SnapshotMedia(None).collect_asset_relative_paths()
        self.assertIn(asset.file_path, relative_paths)
        self.assertEqual(missing, [])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/resource/download/{asset_id}').status_code, 404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/resource/download/{asset_id}').status_code, 404)
        self.assertEqual(self.client.get(f'/media/{asset.file_path}').status_code, 404)
        self.assertEqual(self.client.post('/api/diary/', {**self.draft, 'coverAssetId': asset_id}, format='json').status_code, 400)
        self.client.force_authenticate(self.owner)
        updated = self.client.put(f'/api/diary/{key}', {**self.draft, 'coverAssetId': asset_id, 'tags': ['旅行', '旅行', '  阅读  ']}, format='json').json()['data']
        self.assertEqual(updated['tags'], ['旅行', '阅读'])
        self.client.delete(f'/api/diary/{key}')
        self.assertFalse(is_asset_referenced(asset))
        row = self.client.get('/api/resource/list?linked=false').json()['data']['list'][0]
        self.assertIsNone(row['sourceDiary'])
        self.assertEqual(path.read_bytes(), original)

    def test_bad_image_bytes_and_legacy_cover(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        for name, data in [('bad.png', b'not image'), ('bad.svg', b'<svg/>')]:
            response = self.client.post('/api/resource/upload', {'source_type': 'diary', 'file': SimpleUploadedFile(name, data, content_type='image/png')}, format='multipart')
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.upload_image('wrong.jpg').status_code, 400)
        from assets.diary_images import validate_diary_image
        oversized = SimpleUploadedFile('large.png', b'x', content_type='image/png')
        oversized.size = 10 * 1024 * 1024 + 1
        self.assertIn('10 MB', validate_diary_image(oversized))
        from utils.drf_utils import get_current_user_identifier
        class Request:
            user = self.owner
        legacy = DiaryEntry.objects.create(user_id=get_current_user_identifier(Request()), title='旧日记', content='正文', cover_url='https://example.com/old.jpg')
        updated = self.client.put(f'/api/diary/{legacy.pk}', {k: v for k, v in self.draft.items() if k != 'coverAssetId'}, format='json').json()['data']
        self.assertEqual(updated['coverUrl'], 'https://example.com/old.jpg')
        updated = self.client.put(f'/api/diary/{legacy.pk}', self.draft, format='json').json()['data']
        self.assertEqual(updated['coverUrl'], '')

    def test_multiple_images_order_privacy_and_resource_protection(self):
        from assets.models import Asset
        from utils.resource_assets import is_asset_referenced
        first = self.upload_image('first.png', 'red').json()['data']['id']
        second = self.upload_image('second.png', 'blue').json()['data']['id']
        entry = self.client.post('/api/diary/', {**self.draft, 'imageAssetIds': [first, second]}, format='json').json()['data']
        key = entry['diaryId']
        self.assertEqual(entry['imageAssetIds'], [first, second])
        self.assertEqual(entry['coverAssetId'], first)
        for asset_id in (first, second):
            self.assertTrue(is_asset_referenced(Asset.objects.get(pk=asset_id)))
            self.assertEqual(self.client.delete(f'/api/resource/delete/{asset_id}').status_code, 409)
        rows = self.client.get('/api/resource/list?linked=true').json()['data']['list']
        self.assertEqual({row['id'] for row in rows if row['sourceDiary']['id'] == key}, {first, second})
        reordered = self.client.put(f'/api/diary/{key}', {**self.draft, 'imageAssetIds': [second, first]}, format='json').json()['data']
        self.assertEqual(reordered['imageAssetIds'], [second, first])
        self.assertEqual(reordered['coverAssetId'], second)
        Asset.objects.filter(pk=first).update(source_type='content')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/resource/download/{first}').status_code, 404)
        self.assertEqual(self.client.get(f'/media/{Asset.objects.get(pk=first).file_path}').status_code, 404)
        self.assertEqual(self.client.post('/api/diary/', {**self.draft, 'imageAssetIds': [second]}, format='json').status_code, 400)
        self.assertEqual(self.client.get(f'/api/resource/download/{second}').status_code, 404)
        self.client.force_authenticate(self.owner)
        from django.core import serializers
        from system_settings.sync_state import suspend_tracking
        payload = serializers.serialize('json', DiaryEntry.objects.filter(pk=key))
        with suspend_tracking():
            for _ in range(2):
                for record in serializers.deserialize('json', payload):
                    record.save()
        self.assertEqual(DiaryEntry.objects.get(pk=key).image_asset_ids, [second, first])
        for patch in ([first, first], ['missing'], [str(index) for index in range(16)]):
            response = self.client.put(f'/api/diary/{key}', {**self.draft, 'imageAssetIds': patch}, format='json')
            self.assertEqual(response.status_code, 400)
            self.assertEqual(DiaryEntry.objects.get(pk=key).image_asset_ids, [second, first])
        self.client.put(f'/api/diary/{key}', {**self.draft, 'imageAssetIds': [second]}, format='json')
        self.assertFalse(is_asset_referenced(Asset.objects.get(pk=first)))
        self.assertTrue(is_asset_referenced(Asset.objects.get(pk=second)))
        self.client.put(f'/api/diary/{key}', {**self.draft, 'imageAssetIds': []}, format='json')
        self.assertFalse(is_asset_referenced(Asset.objects.get(pk=second)))
        self.assertIsNone(DiaryEntry.objects.get(pk=key).cover_asset_id)

    def test_legacy_single_image_read_projection(self):
        from assets.models import Asset
        from utils.drf_utils import get_current_user_identifier
        class Request:
            user = self.owner
        asset_id = self.upload_image().json()['data']['id']
        legacy = DiaryEntry.objects.create(user_id=get_current_user_identifier(Request()), title='历史单图', content='正文', cover_asset=Asset.objects.get(pk=asset_id))
        data = self.client.get(f'/api/diary/{legacy.pk}').json()['data']
        self.assertEqual(data['imageAssetIds'], [asset_id])

    def test_fifteen_image_limit(self):
        image_ids = [self.upload_image(f'photo-{index}.png', (index * 10, 30, 60)).json()['data']['id'] for index in range(15)]
        created = self.client.post('/api/diary/', {**self.draft, 'imageAssetIds': image_ids}, format='json')
        self.assertEqual(created.status_code, 200)
        entry = created.json()['data']
        self.assertEqual(entry['imageAssetIds'], image_ids)
        rejected = self.client.put(f"/api/diary/{entry['diaryId']}", {**self.draft, 'imageAssetIds': [*image_ids, 'one-too-many']}, format='json')
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(DiaryEntry.objects.get(pk=entry['diaryId']).image_asset_ids, image_ids)

    def test_photo_library_groups_selection_and_reuse(self):
        from anthology.models import Anthology
        from article.models import Image
        from assets.models import Asset
        from utils.drf_utils import get_current_user_identifier
        from utils.resource_assets import is_asset_referenced
        class Request:
            user = self.owner
        owner_id = get_current_user_identifier(Request())
        album = Anthology.objects.create(coll_id='diary-photo-album', title='周末照片', type='image', user_id=owner_id, permission='public', count=3)
        first = self.upload_image('album-1.png', 'red').json()['data']['id']
        second = self.upload_image('album-2.png', 'blue').json()['data']['id']
        # Album-backed resources retain their original public visibility.
        Asset.objects.filter(pk__in=[first, second]).update(source_type='image')
        for index, asset_id in enumerate([first, second]):
            Image.objects.create(image_id=f'diary-album-photo-{index}', title='一起散步', coll_id=album.pk, author=owner_id, photo_group_id='diary-album-group', group_index=index, image_url=f'/api/resource/view/{asset_id}')
        Image.objects.create(image_id='diary-album-external', title='外链', coll_id=album.pk, author=owner_id, image_url='https://example.com/photo.png')
        listing = self.client.get('/api/diary/photo-library').json()['data']
        self.assertEqual(listing['collections'][0]['count'], 3)
        result = self.client.get(f'/api/diary/photo-library?collId={album.pk}').json()['data']
        group = next(g for g in result['groups'] if g['id'] == 'diary-album-group')
        self.assertEqual([p['assetId'] for p in group['photos']], [first, second])
        self.assertTrue(all(p['selectable'] for p in group['photos']))
        self.assertFalse(next(g for g in result['groups'] if g['id'] == 'diary-album-external')['photos'][0]['selectable'])
        count_before = Asset.objects.count()
        entry = self.client.post('/api/diary/', {**self.draft, 'imageAssetIds': [first, second]}, format='json').json()['data']
        self.assertEqual(Asset.objects.count(), count_before)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/diary/photo-library?collId={album.pk}').status_code, 404)
        public = self.client.get(f'/api/resource/download/{second}')
        self.assertEqual(public.status_code, 200)
        self.assertTrue(b''.join(public.streaming_content))
        self.client.force_authenticate(self.owner)
        # Removing original photo records must not orphan diary resources.
        deleted = self.client.delete('/api/article/image/group/diary-album-group/delete')
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()['code'], 200)
        self.assertTrue(Asset.objects.filter(pk__in=[first, second], is_valid=True).count() == 2)
        self.assertTrue(is_asset_referenced(Asset.objects.get(pk=second)))
        self.assertEqual(self.client.delete(f'/api/resource/delete/{second}').status_code, 409)
        diary = self.client.get(f"/api/diary/{entry['diaryId']}").json()['data']
        self.assertEqual(diary['imageAssetIds'], [first, second])
        self.client.force_authenticate(self.other)
        private = self.client.get(f'/api/resource/download/{second}')
        self.assertEqual(private.status_code, 404)

    def test_photo_library_missing_files_and_auth(self):
        from anthology.models import Anthology
        from article.models import Image
        from assets.models import Asset
        from utils.drf_utils import get_current_user_identifier
        from pathlib import Path
        class Request:
            user = self.owner
        album = Anthology.objects.create(coll_id='diary-missing-album', title='缺失照片', type='image', user_id=get_current_user_identifier(Request()))
        resource = self.upload_image().json()['data']['id']
        path = (Path(self.temp.name) / Asset.objects.get(pk=resource).file_path).resolve()
        self.assertTrue(path.is_relative_to(Path(self.temp.name).resolve()))
        path.unlink()
        Image.objects.create(image_id='diary-missing-photo', title='文件缺失', coll_id=album.pk, image_url=f'/api/resource/view/{resource}')
        group = self.client.get(f'/api/diary/photo-library?collId={album.pk}').json()['data']['groups'][0]
        self.assertFalse(group['photos'][0]['selectable'])
        self.assertEqual(self.client.get(f'/api/diary/photo-library?collId={album.pk}&page=bad').status_code, 400)
        self.assertEqual(self.client.post('/api/diary/photo-library', {}, format='json').status_code, 405)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/diary/photo-library').status_code, (401, 403))

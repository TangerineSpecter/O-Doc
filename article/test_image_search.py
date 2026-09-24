from io import BytesIO
from datetime import timedelta
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import serializers
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image as PILImage
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.image_search_jobs import claim_job, create_index_job, execute_claim
from article.image_search_service import PROMPT_VERSION, image_index_status, image_source_hash, index_image, remove_image_index
from article.models import Image, ImageIndexJob, ImageIndexLease, ImageVisualIndex
from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
from utils.sync_manager import SyncManager


class FakeCollection:
    def __init__(self):
        self.values = {}

    def upsert(self, ids, embeddings, documents, metadatas):
        for image_id, vector, document, metadata in zip(ids, embeddings, documents, metadatas):
            self.values[image_id] = (vector, document, metadata)

    def delete(self, ids):
        for image_id in ids:
            self.values.pop(image_id, None)

    def count(self):
        return len(self.values)

    def get(self, ids, include):
        found = [image_id for image_id in ids if image_id in self.values]
        return {'ids': found, 'embeddings': [self.values[image_id][0] for image_id in found]}

    def query(self, query_embeddings, where, n_results, include):
        allowed = where.get('coll_id')
        if isinstance(allowed, dict):
            allowed = allowed['$in']
        else:
            allowed = [allowed]
        vector = query_embeddings[0]
        rows = [
            (image_id, 0.0 if item[0] == vector else 1.0)
            for image_id, item in self.values.items() if item[2]['coll_id'] in allowed
        ]
        rows.sort(key=lambda item: item[1])
        return {'ids': [[item[0] for item in rows[:n_results]]], 'distances': [[item[1] for item in rows[:n_results]]]}


class ImageSearchTests(TestCase):
    def setUp(self):
        self.test_media_root = TemporaryDirectory()
        self.addCleanup(self.test_media_root.cleanup)
        media_override = override_settings(MEDIA_ROOT=self.test_media_root.name)
        media_override.enable()
        self.addCleanup(media_override.disable)
        self.user = User.objects.create_user(username='image-owner', password='password')
        self.owner = f'user_{self.user.pk}'
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.anthology = Anthology.objects.create(coll_id='images-owned', title='我的图片', type='image', user_id=self.owner, permission='private')
        self.other = Anthology.objects.create(coll_id='images-other', title='他人图片', type='image', user_id='other', permission='private')
        self.target = Image.objects.create(image_id='image-target', title='星空', description='插画', image_url='target.png', coll_id=self.anthology.pk, author=self.owner, tags='费伦')
        self.private = Image.objects.create(image_id='image-private', title='秘密', image_url='private.png', coll_id=self.other.pk, author='other')
        self.model = SimpleNamespace(pk='embed-one', provider_id='provider-one', name='embedding-model')
        self.collections = {}
        self.collection_patch = patch('utils.rag_client.RagClient.get_collection', side_effect=lambda name='odoc_knowledge_base': self.collections.setdefault(name, FakeCollection()))
        self.model_patch = patch('utils.rag_client.RagClient.get_embedding_model', return_value=self.model)
        self.embed_patch = patch('utils.rag_client.RagClient.create_embeddings', side_effect=lambda texts, **_: [[1.0, 0.0] for _ in texts])
        self.collection_patch.start(); self.model_patch.start(); self.embed_patch.start()
        self.addCleanup(self.collection_patch.stop); self.addCleanup(self.model_patch.stop); self.addCleanup(self.embed_patch.stop)

    def make_caption(self, image, text='紫色长发少女拿着法杖'):
        image.ai_visual_description = text
        image.ai_visual_source_hash = image_source_hash(image)
        image.ai_visual_prompt_version = PROMPT_VERSION
        image.save()

    def test_manual_index_and_search_respects_permissions_and_exact_tags(self):
        self.make_caption(self.target)
        self.make_caption(self.private)
        index_image(self.target, mode='index_only')
        index_image(self.private, mode='index_only')
        response = self.client.post('/api/article/image/search', {'query': '紫发法杖少女'}, format='json')
        self.assertEqual(response.data['code'], 200)
        self.assertEqual([item['image']['image_id'] for item in response.data['data']['items']], [self.target.pk])
        response = self.client.post('/api/article/image/search', {'query': '费伦'}, format='json')
        self.assertEqual(response.data['data']['items'][0]['match_reason'], '人工标签命中')
        self.assertNotIn(self.private.pk, str(response.data))

    def test_no_automatic_index_and_cross_device_caption_reuse(self):
        self.assertFalse(ImageIndexJob.objects.exists())
        self.make_caption(self.target)
        self.assertEqual(image_index_status(self.target, None, self.model), 'recognized')
        job = create_index_job(self.anthology.pk, self.owner, [self.target.pk], 'index_only')
        self.assertEqual(create_index_job(self.anthology.pk, self.owner, [self.target.pk], 'index_only').pk, job.pk)
        execute_claim(claim_job())
        job.refresh_from_db()
        self.assertEqual(job.state, 'completed')
        self.assertEqual(image_index_status(self.target, ImageVisualIndex.objects.get(image=self.target), self.model), 'indexed')
        remove_image_index(self.target)
        self.assertEqual(image_index_status(self.target, ImageVisualIndex.objects.get(image=self.target), self.model), 'recognized')
        self.assertTrue(self.target.ai_visual_description)
        self.assertIn('ai_visual_description', serializers.serialize('json', [self.target]))
        self.assertIn('article.imagevisualindex', LOCAL_ONLY_MODEL_LABELS)
        self.assertIn('article.imageindexjob', LOCAL_ONLY_MODEL_LABELS)
        whole = create_index_job(self.anthology.pk, self.owner, 'all', 'index_only')
        self.assertEqual(whole.image_ids, [self.target.pk])

    def test_stale_image_and_changed_embedding_model(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        state = ImageVisualIndex.objects.get(image=self.target)
        changed_model = SimpleNamespace(pk='embed-two', provider_id='provider-one', name='embedding-model')
        self.assertEqual(image_index_status(self.target, state, changed_model), 'needs_index')
        self.target.image_url = 'replaced.png'
        self.target.save()
        self.assertEqual(image_index_status(self.target, state, self.model), 'needs_recognition')
        self.target.image_url = 'target.png'
        self.target.coll_id = 'different-anthology'
        self.target.save()
        self.assertEqual(image_index_status(self.target, state, self.model), 'needs_index')

    def test_current_manual_correction_remains_searchable_after_image_changes(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        self.target.image_url = 'replaced.png'
        self.target.save()

        response = self.client.put(f'/api/article/image/visual/{self.target.pk}', {
            'override': '新画面中紫发少女拿着法杖',
        }, format='json')
        self.assertEqual(response.data['data']['status'], 'needs_index')
        execute_claim(claim_job())

        self.target.refresh_from_db()
        record = ImageVisualIndex.objects.get(image=self.target)
        self.assertEqual(image_index_status(self.target, record, self.model), 'indexed')
        search = self.client.post('/api/article/image/search', {'query': '法杖'}, format='json')
        self.assertEqual(search.data['data']['items'][0]['image']['image_id'], self.target.pk)

    def test_keyword_ranking_includes_older_exact_tag_past_two_thousand_matches(self):
        self.target.tags = '紫发'
        self.target.save()
        Image.objects.filter(pk=self.target.pk).update(updated_at=timezone.now() - timedelta(days=1))
        Image.objects.bulk_create([
            Image(image_id=f'keyword-filler-{index}', title='其他图片', description='紫发',
                  image_url=f'filler-{index}.png', coll_id=self.anthology.pk, author=self.owner)
            for index in range(2000)
        ])

        with patch('utils.rag_client.RagClient.get_embedding_model', return_value=None):
            response = self.client.post('/api/article/image/search', {'query': '紫发'}, format='json')
            last_page = self.client.post('/api/article/image/search', {'query': '紫发', 'page': 67}, format='json')
        self.assertEqual(response.data['data']['items'][0]['image']['image_id'], self.target.pk)
        self.assertEqual(response.data['data']['items'][0]['match_reason'], '人工标签命中')
        self.assertEqual(len(last_page.data['data']['items']), 21)
        self.assertFalse(last_page.data['data']['has_more'])

    def test_reference_search_does_not_save_image(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        output = BytesIO()
        PILImage.new('RGB', (16, 16), 'purple').save(output, format='PNG')
        before = Image.objects.count()
        with patch('utils.ai_service.AIService.image_visual_fingerprint', return_value=('紫发少女拿法杖', 'vision-model')):
            response = self.client.post('/api/article/image/search-by-image', {
                'collId': self.anthology.pk,
                'image': SimpleUploadedFile('reference.png', output.getvalue(), content_type='image/png'),
            }, format='multipart')
        self.assertEqual(response.data['code'], 200)
        self.assertEqual(Image.objects.count(), before)
        self.assertEqual(response.data['data']['items'][0]['image']['image_id'], self.target.pk)

    def test_cancelled_job_does_not_call_image_model(self):
        job = create_index_job(self.anthology.pk, self.owner, [self.target.pk], 'reuse')
        job.cancel_requested = True
        job.save()
        with patch('article.image_search_service.recognize_image') as recognize:
            execute_claim(claim_job())
        recognize.assert_not_called()
        job.refresh_from_db()
        self.assertEqual(job.state, 'cancelled')

    def test_failed_image_can_be_retried_and_worker_resumes_expired_lease(self):
        job = create_index_job(self.anthology.pk, self.owner, [self.target.pk], 'reuse')
        with patch('article.image_search_service.recognize_image', side_effect=ValueError('图片文件损坏')):
            execute_claim(claim_job())
        job.refresh_from_db()
        self.assertEqual(job.state, 'completed')
        self.assertIn(self.target.pk, job.failures)
        self.assertEqual(image_index_status(self.target, ImageVisualIndex.objects.get(image=self.target), self.model), 'failed')

        self.make_caption(self.target)
        retry = create_index_job(self.anthology.pk, self.owner, [self.target.pk], 'index_only')
        retry.state = 'running'
        retry.save()
        ImageIndexLease.objects.update_or_create(pk='image-index', defaults={
            'owner': 'dead-worker', 'job_id': retry.pk, 'expires_at': timezone.now() - timedelta(seconds=1),
        })
        execute_claim(claim_job())
        retry.refresh_from_db()
        self.assertEqual(retry.state, 'completed')
        self.assertEqual(retry.failures, {})
        self.assertEqual(image_index_status(self.target, ImageVisualIndex.objects.get(image=self.target), self.model), 'indexed')

    def test_group_search_returns_best_matched_photo(self):
        self.target.photo_group_id = 'group-one'
        self.target.group_index = 0
        self.target.save()
        matched = Image.objects.create(
            image_id='group-matched', title='魔法少女', image_url='matched.png', coll_id=self.anthology.pk,
            author=self.owner, photo_group_id='group-one', group_index=1,
        )
        self.make_caption(matched)
        index_image(matched, mode='index_only')
        response = self.client.post('/api/article/image/search', {'query': '紫发法杖少女'}, format='json')
        items = response.data['data']['items']
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['image']['image_id'], matched.pk)
        self.assertEqual(items[0]['match_reason'], '视觉描述相关')

    def test_editing_visual_text_reindexes_existing_image(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        response = self.client.put(f'/api/article/image/visual/{self.target.pk}', {'override': '红色帽子和蓝色背景'}, format='json')
        self.assertEqual(response.data['code'], 200)
        self.assertEqual(response.data['data']['status'], 'needs_index')
        self.assertEqual(ImageIndexJob.objects.count(), 1)
        execute_claim(claim_job())
        record = ImageVisualIndex.objects.get(image=self.target)
        self.target.refresh_from_db()
        self.assertEqual(image_index_status(self.target, record, self.model), 'indexed')
        self.assertIn('红色帽子', self.collections[record.collection_name].values[self.target.pk][1])

    def test_repeated_visual_edits_reuse_one_pending_job(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        for override in ('红色帽子', '红色帽子', '蓝色背景'):
            response = self.client.put(f'/api/article/image/visual/{self.target.pk}', {'override': override}, format='json')
            self.assertEqual(response.data['code'], 200)
        self.assertEqual(ImageIndexJob.objects.filter(state='queued').count(), 1)
        execute_claim(claim_job())
        record = ImageVisualIndex.objects.get(image=self.target)
        self.assertIn('蓝色背景', self.collections[record.collection_name].values[self.target.pk][1])

    def test_visual_edit_reuses_queued_bulk_job_but_follows_running_job(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        existing = create_index_job(self.anthology.pk, self.owner, 'all', 'index_only')
        self.client.put(f'/api/article/image/visual/{self.target.pk}', {'override': '第一次修正'}, format='json')
        self.assertEqual(ImageIndexJob.objects.count(), 1)

        existing.state = 'running'
        existing.save(update_fields=['state'])
        self.client.put(f'/api/article/image/visual/{self.target.pk}', {'override': '第二次修正'}, format='json')
        self.assertEqual(ImageIndexJob.objects.count(), 2)
        self.assertTrue(ImageIndexJob.objects.filter(state='queued', mode='index_only', image_ids=[self.target.pk]).exists())

    def test_sync_soft_deleted_image_removes_local_vector_after_commit(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        record = ImageVisualIndex.objects.get(image=self.target)
        snapshot = SyncManager().build_snapshot_data()
        for item in snapshot:
            if item['model'] == 'article.image' and item['pk'] == self.target.pk:
                item['fields']['is_valid'] = False

        with self.captureOnCommitCallbacks(execute=True):
            SyncManager().apply_snapshot_data(snapshot, full_overwrite=True)

        self.target.refresh_from_db()
        record.refresh_from_db()
        self.assertFalse(self.target.is_valid)
        self.assertFalse(record.enabled)
        self.assertNotIn(self.target.pk, self.collections[record.collection_name].values)

    def test_sync_hard_deleted_image_removes_vector_after_commit(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        record = ImageVisualIndex.objects.get(image=self.target)
        snapshot = [item for item in SyncManager().build_snapshot_data()
                    if not (item['model'] == 'article.image' and item['pk'] == self.target.pk)]

        with self.captureOnCommitCallbacks(execute=True):
            SyncManager().apply_snapshot_data(snapshot, full_overwrite=True)

        self.assertFalse(Image.objects.filter(pk=self.target.pk).exists())
        self.assertNotIn(self.target.pk, self.collections[record.collection_name].values)

    def test_failed_sync_keeps_image_and_local_vector(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        record = ImageVisualIndex.objects.get(image=self.target)
        snapshot = SyncManager().build_snapshot_data()
        for item in snapshot:
            if item['model'] == 'article.image' and item['pk'] == self.target.pk:
                item['fields']['is_valid'] = False

        with patch.object(SyncManager, '_reset_restored_sequences', side_effect=RuntimeError('restore failed')):
            with self.assertRaisesMessage(RuntimeError, 'restore failed'):
                with self.captureOnCommitCallbacks(execute=True):
                    SyncManager().apply_snapshot_data(snapshot, full_overwrite=True)

        self.target.refresh_from_db()
        record.refresh_from_db()
        self.assertTrue(self.target.is_valid)
        self.assertTrue(record.enabled)
        self.assertIn(self.target.pk, self.collections[record.collection_name].values)

    def test_missing_embedding_model_keeps_keyword_search_and_blocks_index_job(self):
        with patch('utils.rag_client.RagClient.get_embedding_model', return_value=None):
            search = self.client.post('/api/article/image/search', {'query': '费伦'}, format='json')
            self.assertEqual(search.data['code'], 200)
            self.assertFalse(search.data['data']['semantic_available'])
            self.assertEqual(search.data['data']['items'][0]['image']['image_id'], self.target.pk)
            job = self.client.post('/api/article/image/index-jobs', {
                'collId': self.anthology.pk, 'imageIds': [self.target.pk], 'mode': 'reuse',
            }, format='json')
            self.assertNotEqual(job.data['code'], 200)
            self.assertFalse(ImageIndexJob.objects.exists())

    def test_public_anthology_viewer_cannot_manage_or_see_owner_job(self):
        self.other.permission = 'public'
        self.other.save()
        ImageIndexJob.objects.create(coll_id=self.other.pk, owner='other', image_ids=[self.private.pk])
        response = self.client.get(f'/api/article/image/index-status/{self.other.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assertFalse(response.data['data']['can_manage'])
        self.assertIsNone(response.data['data']['job'])

    def test_deleting_image_removes_vector_and_preserves_soft_deleted_record(self):
        self.make_caption(self.target)
        index_image(self.target, mode='index_only')
        record = ImageVisualIndex.objects.get(image=self.target)
        self.assertIn(self.target.pk, self.collections[record.collection_name].values)
        deleted = self.client.delete(f'/api/article/image/delete/{self.target.pk}')
        self.assertEqual(deleted.data['code'], 200)
        self.target.refresh_from_db()
        self.assertFalse(self.target.is_valid)
        self.assertNotIn(self.target.pk, self.collections[record.collection_name].values)

"""Photo deletion must not remove media shared with other business records."""
import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import transaction
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article, ArticleAsset, ArticlePostComment, Image
from assets.models import Asset
from system_settings.models import Agent, AgentActivity
from system_settings.models import SyncEntityState
from user.models import UserProfile


class PhotoSharedResourceTests(TransactionTestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix='odoc-photo-sharing-')
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.media = self.root / 'media'
        self.media.mkdir()
        self.outside = self.root / 'outside.bin'
        self.outside.write_bytes(b'outside')
        self.enterContext(override_settings(MEDIA_ROOT=self.media, SYSTEM_LOG_ENABLED=False))
        user = User.objects.create_user(username='photo-owner')
        self.owner = f'user_{user.pk}'
        UserProfile.objects.update_or_create(user=user, defaults={'userid': self.owner})
        self.collection = Anthology.objects.create(coll_id='photo-sharing', title='照片', type='image',
                                                   user_id=self.owner, permission='private', count=3)
        self.client = APIClient()
        self.client.force_authenticate(user)

    def asset_and_image(self, index, group=''):
        path = (self.media / f'photo-{index}.png').resolve()
        self.assertTrue(path.is_relative_to(self.media.resolve()))
        self.assertTrue(path.is_relative_to(self.root))
        path.write_bytes(f'photo-{index}'.encode())
        asset = Asset.objects.create(id=f'shared-asset-{index}', name=path.name, original_name=path.name,
            file_type='image', file_size=path.stat().st_size, file_path=path.name, file_extension='.png',
            mime_type='image/png', uploader=self.owner, source_type='image', file_hash=f'photo-{index}')
        image = Image.objects.create(image_id=f'shared-photo-{index}', title=f'照片{index}',
            image_url=f'/api/resource/view/{asset.pk}', coll_id=self.collection.pk, author=self.owner,
            photo_group_id=group, group_index=index)
        return asset, image, path

    def assert_preserved(self, asset, path, content):
        self.assertTrue(path.resolve().is_relative_to(self.root))
        self.assertTrue(Asset.objects.filter(pk=asset.pk).exists())
        self.assertTrue(path.exists())
        self.assertEqual(hashlib.sha256(path.read_bytes()).digest(), hashlib.sha256(content).digest())
        self.assertEqual(self.outside.read_bytes(), b'outside')

    @patch('article.image_views.remove_image_index')
    def test_single_photo_deletion_keeps_file_used_by_agent(self, _remove_index):
        asset, image, path = self.asset_and_image(0)
        agent = Agent.objects.create(name='引用照片的居民', avatar=image.image_url)
        self.assertTrue(self.outside.resolve().is_relative_to(self.root))
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        image.refresh_from_db()
        self.assertFalse(image.is_valid)
        agent.refresh_from_db()
        self.assertEqual(agent.avatar, f'/api/resource/view/{asset.pk}')
        self.assert_preserved(asset, path, b'photo-0')

    @patch('article.image_views.remove_image_index')
    def test_photo_deletion_preserves_agent_avatar_with_absolute_url(self, _remove_index):
        asset, image, path = self.asset_and_image(21)
        Agent.objects.create(name='完整头像地址的居民',
                             avatar=f'http://testserver/api/resource/view/{asset.pk}?size=small')
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assert_preserved(asset, path, b'photo-21')

    @patch('article.image_views.remove_image_index')
    def test_photo_deletion_preserves_activity_and_comment_avatar_snapshots(self, _remove_index):
        asset, image, path = self.asset_and_image(22)
        AgentActivity.objects.create(event_key='absolute-avatar', activity_type='work', title='头像快照',
                                     metadata={'agentSnapshot': {'avatar': f'/api/resource/download/{asset.pk}'}})
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assert_preserved(asset, path, b'photo-22')

        other_asset, other_image, other_path = self.asset_and_image(23)
        article = Article.objects.create(title='头像快照帖子', content='正文', coll_id='post-example', author=self.owner)
        ArticlePostComment.objects.create(article=article, content='评论',
            creator_avatar=f'http://testserver/api/resource/view/{other_asset.pk}?size=small')
        response = self.client.delete(f'/api/article/image/delete/{other_image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assert_preserved(other_asset, other_path, b'photo-23')

    @patch('article.image_views.remove_image_index')
    def test_unrelated_or_malformed_avatar_url_does_not_block_cleanup(self, _remove_index):
        asset, image, path = self.asset_and_image(24)
        Agent.objects.create(name='相似编号头像',
                             avatar=f'http://testserver/api/resource/view/{asset.pk}-other?size=small')
        Agent.objects.create(name='异常地址头像', avatar=f'http://[invalid/{asset.pk}')
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assertFalse(Asset.objects.filter(pk=asset.pk).exists())
        self.assertFalse(path.exists())
        self.assertEqual(self.outside.read_bytes(), b'outside')

    @patch('article.image_views.remove_image_index')
    def test_group_deletion_preserves_structured_article_reference(self, _remove_index):
        asset, image, path = self.asset_and_image(1, group='photo-group')
        _, _, other_path = self.asset_and_image(2, group='photo-group')
        self.assertTrue(other_path.resolve().is_relative_to(self.root))
        article = Article.objects.create(title='引用图片的文章', content='正文', coll_id='article-example', author=self.owner)
        ArticleAsset.objects.create(article=article, asset=asset, role='material')
        self.assertTrue(self.outside.resolve().is_relative_to(self.root))
        response = self.client.delete('/api/article/image/group/photo-group/delete')
        self.assertEqual(response.data['code'], 200)
        image.refresh_from_db()
        self.assertFalse(image.is_valid)
        self.assertTrue(ArticleAsset.objects.filter(article=article, asset_id=asset.pk).exists())
        self.assert_preserved(asset, path, b'photo-1')

    @patch('article.image_views.remove_image_index')
    def test_photo_deletion_preserves_resource_used_in_markdown(self, _remove_index):
        asset, image, path = self.asset_and_image(3)
        Article.objects.create(title='正文引用照片', content=f'![照片]({image.image_url})',
                               coll_id='article-example', author=self.owner)
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assert_preserved(asset, path, b'photo-3')

    @patch('article.image_views.remove_image_index')
    def test_photo_deletion_preserves_legacy_download_links_in_markdown(self, _remove_index):
        asset, image, path = self.asset_and_image(7)
        article = Article.objects.create(title='旧下载链接', content=f'[附件](/api/resource/download/{asset.pk})',
                                         coll_id='article-example', author=self.owner)
        self.assertFalse(ArticleAsset.objects.filter(article=article, asset=asset).exists())
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assert_preserved(asset, path, b'photo-7')

    @patch('article.image_views.remove_image_index')
    def test_photo_deletion_preserves_other_image_using_download_url(self, _remove_index):
        asset, image, path = self.asset_and_image(8)
        other = Image.objects.create(image_id='shared-download', title='下载链接照片',
            image_url=f'/api/resource/download/{asset.pk}', coll_id=self.collection.pk, author=self.owner)
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assertTrue(Image.objects.filter(pk=other.pk, is_valid=True).exists())
        self.assert_preserved(asset, path, b'photo-8')

    @patch('article.image_views.remove_image_index')
    def test_photo_deletion_preserves_absolute_resource_url_with_query(self, _remove_index):
        asset, image, path = self.asset_and_image(9)
        other = Image.objects.create(image_id='shared-absolute', title='完整链接照片',
            image_url=f'https://example.test/api/resource/view/{asset.pk}?size=large',
            coll_id=self.collection.pk, author=self.owner)
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assertTrue(Image.objects.filter(pk=other.pk, is_valid=True).exists())
        self.assert_preserved(asset, path, b'photo-9')

    @patch('article.image_views.remove_image_index')
    def test_another_resource_id_with_same_prefix_does_not_keep_unshared_photo(self, _remove_index):
        asset, image, path = self.asset_and_image(10)
        Image.objects.create(image_id='other-prefix', title='相似编号',
            image_url=f'https://example.test/api/resource/view/{asset.pk}-other?size=large',
            coll_id=self.collection.pk, author=self.owner)
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assertFalse(Asset.objects.filter(pk=asset.pk).exists())
        self.assertFalse(path.exists())
        self.assertEqual(self.outside.read_bytes(), b'outside')

    @patch('article.image_views.remove_image_index')
    def test_group_edit_preserves_media_used_by_agent(self, _remove_index):
        asset, image, path = self.asset_and_image(5, group='photo-edit-group')
        _, retained, _ = self.asset_and_image(6, group='photo-edit-group')
        Agent.objects.create(name='使用原照片的居民', avatar=image.image_url)
        response = self.client.put('/api/article/image/group/photo-edit-group', {
            'photos': [{'imageId': retained.pk, 'groupIndex': 0}],
        }, format='json')
        self.assertEqual(response.data['code'], 200)
        image.refresh_from_db()
        retained.refresh_from_db()
        self.assertFalse(image.is_valid)
        self.assertTrue(retained.is_valid)
        self.assert_preserved(asset, path, b'photo-5')

    @patch('article.image_views.remove_image_index')
    def test_unshared_photo_is_cleaned_and_repeat_cannot_remove_another_file(self, _remove_index):
        asset, image, path = self.asset_and_image(4)
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertEqual(response.data['code'], 200)
        self.assertFalse(Asset.objects.filter(pk=asset.pk).exists())
        self.assertFalse(path.exists())
        response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertNotEqual(response.data['code'], 200)
        self.assertEqual(self.outside.read_bytes(), b'outside')

    @patch('article.image_views.remove_image_index')
    def test_single_photo_database_failure_rolls_back_media_and_index(self, remove_index):
        asset, image, path = self.asset_and_image(11)
        before = list(SyncEntityState.objects.filter(model_label__in=['article.image', 'assets.asset', 'anthology.anthology'])
                      .order_by('model_label', 'object_pk').values())
        with patch('system_settings.sync_state.record_bulk_change', side_effect=RuntimeError('isolated count failure')):
            response = self.client.delete(f'/api/article/image/delete/{image.pk}')
        self.assertNotEqual(response.data['code'], 200)
        image.refresh_from_db()
        self.assertTrue(image.is_valid)
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 3)
        self.assert_preserved(asset, path, b'photo-11')
        self.assertEqual(list(SyncEntityState.objects.filter(model_label__in=['article.image', 'assets.asset', 'anthology.anthology'])
                              .order_by('model_label', 'object_pk').values()), before)
        remove_index.assert_not_called()

    @patch('article.image_views.remove_image_index')
    def test_single_photo_cleanup_waits_for_outer_transaction(self, remove_index):
        asset, image, path = self.asset_and_image(12)
        with self.assertRaisesRegex(RuntimeError, 'rollback'):
            with transaction.atomic():
                response = self.client.delete(f'/api/article/image/delete/{image.pk}')
                self.assertEqual(response.data['code'], 200)
                self.assertTrue(path.exists())
                remove_index.assert_not_called()
                raise RuntimeError('rollback')
        image.refresh_from_db()
        self.assertTrue(image.is_valid)
        self.assert_preserved(asset, path, b'photo-12')
        remove_index.assert_not_called()

        with transaction.atomic():
            response = self.client.delete(f'/api/article/image/delete/{image.pk}')
            self.assertEqual(response.data['code'], 200)
            self.assertTrue(path.exists())
            remove_index.assert_not_called()
        self.assertFalse(path.exists())
        self.assertFalse(Asset.objects.filter(pk=asset.pk).exists())
        remove_index.assert_called_once()
        self.assertEqual(self.outside.read_bytes(), b'outside')

    @patch('article.image_views.remove_image_index')
    def test_group_cleanup_failure_rolls_back_group_and_media(self, remove_index):
        asset, image, path = self.asset_and_image(13, group='atomic-group')
        other_asset, other_image, other_path = self.asset_and_image(14, group='atomic-group')
        before = list(SyncEntityState.objects.filter(model_label__in=['article.image', 'assets.asset', 'anthology.anthology'])
                      .order_by('model_label', 'object_pk').values())
        with patch('article.image_views.cleanup_group_image_assets', side_effect=RuntimeError('isolated cleanup failure')):
            response = self.client.delete('/api/article/image/group/atomic-group/delete')
        self.assertNotEqual(response.data['code'], 200)
        image.refresh_from_db()
        other_image.refresh_from_db()
        self.collection.refresh_from_db()
        self.assertTrue(image.is_valid)
        self.assertTrue(other_image.is_valid)
        self.assertEqual(self.collection.count, 3)
        self.assert_preserved(asset, path, b'photo-13')
        self.assert_preserved(other_asset, other_path, b'photo-14')
        self.assertEqual(list(SyncEntityState.objects.filter(model_label__in=['article.image', 'assets.asset', 'anthology.anthology'])
                              .order_by('model_label', 'object_pk').values()), before)
        remove_index.assert_not_called()

    @patch('article.image_views.remove_image_index')
    def test_group_edit_cleanup_failure_rolls_back_group_and_media(self, remove_index):
        asset, image, path = self.asset_and_image(15, group='atomic-edit')
        _, retained, _ = self.asset_and_image(16, group='atomic-edit')
        with patch('article.image_views.cleanup_group_image_assets', side_effect=RuntimeError('isolated cleanup failure')):
            response = self.client.put('/api/article/image/group/atomic-edit', {
                'photos': [{'imageId': retained.pk, 'groupIndex': 0}],
            }, format='json')
        self.assertNotEqual(response.data['code'], 200)
        image.refresh_from_db()
        retained.refresh_from_db()
        self.collection.refresh_from_db()
        self.assertTrue(image.is_valid)
        self.assertEqual(retained.photo_group_id, 'atomic-edit')
        self.assertEqual(self.collection.count, 3)
        self.assert_preserved(asset, path, b'photo-15')
        remove_index.assert_not_called()

    @patch('article.image_views.remove_image_index')
    def test_group_cleanup_waits_for_outer_transaction(self, remove_index):
        asset, image, path = self.asset_and_image(17, group='outer-group')
        other_asset, other_image, other_path = self.asset_and_image(18, group='outer-group')
        with self.assertRaisesRegex(RuntimeError, 'rollback'):
            with transaction.atomic():
                response = self.client.delete('/api/article/image/group/outer-group/delete')
                self.assertEqual(response.data['code'], 200)
                self.assertTrue(path.exists())
                self.assertTrue(other_path.exists())
                remove_index.assert_not_called()
                raise RuntimeError('rollback')
        image.refresh_from_db()
        other_image.refresh_from_db()
        self.assertTrue(image.is_valid)
        self.assertTrue(other_image.is_valid)
        self.assert_preserved(asset, path, b'photo-17')
        self.assert_preserved(other_asset, other_path, b'photo-18')
        remove_index.assert_not_called()

        with transaction.atomic():
            response = self.client.delete('/api/article/image/group/outer-group/delete')
            self.assertEqual(response.data['code'], 200)
            self.assertTrue(path.exists())
            self.assertTrue(other_path.exists())
            remove_index.assert_not_called()
        self.assertFalse(path.exists())
        self.assertFalse(other_path.exists())
        self.assertEqual(remove_index.call_count, 2)
        self.assertEqual(self.outside.read_bytes(), b'outside')

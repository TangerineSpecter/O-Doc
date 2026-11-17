import json
import shutil
import subprocess
import tempfile
import uuid
from datetime import timedelta
from pathlib import Path
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import serializers
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from anthology.models import Anthology
from article.models import Article
from article.video_notes.frames import choose_frames
from article.video_notes.jobs import clean_expired, process, publish
from article.video_notes.models import VideoNoteJob
from article.video_notes.sources import normalize, share_url
from article.video_notes.storage import UploadNeeded, VideoError, job_directory, remove_job_directory, runtime_root
from article.video_notes.transcript import platform_segments
from article.video_notes.writing import render, write_note
from assets.models import Asset
from utils.sync_manager import SyncManager
from system_settings.tests import MemoryStorageClient


URL = 'https://www.bilibili.com/video/BV12P411t7PQ/?p=8'


class VideoMaterialTests(SimpleTestCase):
    def test_runtime_root_rejects_unsafe_paths_before_creating_anything(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            with override_settings(BASE_DIR=base / 'project', MEDIA_ROOT=base / 'media'), \
                 patch('article.video_notes.storage.Path.home', return_value=base / 'user'), \
                 patch.object(Path, 'mkdir') as mkdir:
                unsafe = ['', '  ', '.', 'relative/video_notes', str(base), str(base / 'project'),
                          str(base / 'user'), str(base / 'media'), str(base / 'media' / 'video_notes')]
                for path in unsafe:
                    with self.subTest(path=path), patch.dict('os.environ', ODOC_VIDEO_ROOT=path), self.assertRaises(VideoError):
                        runtime_root()
                mkdir.assert_not_called()
            with override_settings(BASE_DIR=base / 'project', MEDIA_ROOT=base / 'media'), \
                 patch.dict('os.environ', ODOC_VIDEO_ROOT=str(base / 'video_notes')):
                self.assertEqual(runtime_root(), base / 'video_notes')

    def test_canonical_part_and_platform_scope(self):
        self.assertEqual(share_url('分享 ' + URL + '&t=60 复制'), URL)
        self.assertEqual(share_url(r'4.82 复制打开抖音，看看【第一财经的作品】# 媒体原创 '
                                   r'DeepSeek正式对网页端、App... https\://v.douyin.com/Nynl27w0Ze0/ '
                                   'i@c.AG :5pm EUY:/ 07/05'), 'https://v.douyin.com/Nynl27w0Ze0/')
        self.assertTrue(normalize(URL.split('?')[0]).endswith('?p=1'))
        for url in ('https://www.bilibili.com.example/video/BV12P411t7PQ', 'https://v.douyin.com@localhost/example',
                    'https://www.douyin.com/user/123', 'https://b23.tv:8000/test'):
            with self.assertRaises(VideoError):
                normalize(url)

    def test_timestamps_and_no_danmaku(self):
        srt = '1\n00:03:01,280 --> 00:03:03,980\n点击参数设置'
        rows = platform_segments({'subtitles': {'danmaku': [{'ext': 'srt', 'data': srt}],
                                               'zh-CN': [{'ext': 'srt', 'data': srt}]}}, URL)
        self.assertEqual(rows, [[181.28, 183.98, '点击参数设置']])
        with patch('article.video_notes.writing.completion', return_value={
            'overview': '速读', 'sections': [{'segment': 0, 'heading': '步骤', 'body': '设置参数'}]}):
            overview, notes = write_note(rows, lambda stage: None)
        self.assertIn('[03:01](' + URL + '&t=181)', render(URL, overview, notes, rows, {}))

    def test_long_transcript_keeps_last_segment_when_synthesis_omits_it(self):
        chunks = [[5, 7, '前' * 6000], [602, 607, '后' * 6000]]
        replies = [
            {'sections': [{'segment': 0, 'heading': '准备', 'body': '选择输入'}]},
            {'sections': [{'segment': 1, 'heading': '结果', 'body': '末段检查总计'}]},
            {'overview': '整理结果', 'groups': [{'heading': '准备', 'ids': [0]}]},
        ]
        with patch('article.video_notes.writing.completion', side_effect=replies):
            overview, notes = write_note(chunks, lambda stage: None)
        content = render(URL, overview, notes, chunks, {})
        self.assertIn('末段检查总计', content)
        self.assertIn('&t=602', content)

    @skipUnless(shutil.which('ffmpeg'), 'requires FFmpeg')
    def test_static_slide_without_scene_change_can_be_selected_only_once(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            video = work / 'static.mp4'
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                            'smptebars=size=480x320:rate=2', '-t', '3', '-c:v', 'mpeg4', str(video)], check=True)
            notes = [{'heading': '图示', 'body': '观察色带', 'segment': 0, 'visual': ''}] * 2
            with patch('article.video_notes.frames.AIService.get_default_image_client_config',
                       return_value={'model_id': 1}), patch('article.video_notes.frames.AIService.chat_completion_messages',
                                                           return_value='{"frame":1}') as vision:
                selected, warning = choose_frames(video, work, notes, [[0, 2, '介绍图示']], 3)
            self.assertEqual(warning, '')
            self.assertEqual(list(selected), [0])
            self.assertTrue(selected[0].is_file())
            vision.assert_called_once()

    def test_unbound_model_time_rejected(self):
        with patch('article.video_notes.writing.completion', return_value={
            'overview': '速读', 'sections': [{'heading': '内容', 'segment': 600, 'body': '正文'}]}), self.assertRaises(VideoError):
            write_note([[0, 1, '你好']], lambda s: None)


class VideoJobTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='video-' + uuid.uuid4().hex[:12])
        self.owner = f'user_{self.user.pk}'
        self.client.force_authenticate(user=self.user)
        self.collection = Anthology.objects.create(title='视频测试', user_id=self.owner, type='article')
        self.data = {'collId': self.collection.pk, 'requestId': uuid.uuid4().hex, 'shareText': URL}
        self.url = '/api/article/video-notes/jobs'
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.uploads = self.root / 'local'
        self.uploads.mkdir()
        self.enterContext(override_settings(MEDIA_ROOT=self.root / 'media'))
        self.enterContext(patch.dict('os.environ', ODOC_VIDEO_ROOT=str(self.uploads)))

    def create(self):
        response = self.client.post(self.url, self.data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return VideoNoteJob.objects.get(pk=response.data['data']['id'])

    def test_submit_retry_resume_and_permissions(self):
        job = self.create()
        self.assertEqual(self.create().pk, job.pk)
        with patch('article.video_notes.jobs.generate', side_effect=UploadNeeded('请上传视频')):
            process(job, self.uploads)
        self.assertEqual(self.client.get(self.url, {'collId': self.collection.pk}).json()['data'][0]['state'], 'awaiting_upload')
        upload = f'{self.url}/{job.pk}/upload'
        self.assertEqual(self.client.post(upload, {'file': SimpleUploadedFile('video.mp4', b'fixture')}).status_code, 200)
        self.assertEqual((self.uploads / str(job.pk) / 'upload').read_bytes(), b'fixture')
        self.assertEqual(self.client.post(f'{self.url}/{job.pk}/retry').status_code, 409)
        self.client.force_authenticate(user=User.objects.create_user(username='other-' + uuid.uuid4().hex[:10]))
        self.assertEqual(self.client.get(self.url, {'collId': self.collection.pk}).status_code, 404)
        self.assertEqual(self.client.post(upload, {}).status_code, 404)

    def test_download_cleanup_across_failure_and_retry(self):
        job = self.create()
        directory = self.uploads / str(job.pk)

        def fail_after_download(job, attempt, progress):
            (attempt / 'picture').write_bytes(b'download')
            (attempt / 'audio.wav').write_bytes(b'decoded audio')
            (attempt.parent / 'transcript.json').write_text('[]')
            raise VideoError('模型暂不可用')

        with patch('article.video_notes.jobs.generate', side_effect=fail_after_download):
            process(job, self.uploads)
        self.assertEqual([p.name for p in directory.iterdir()], ['transcript.json'])
        self.assertEqual(self.client.post(f'{self.url}/{job.pk}/retry').status_code, 200)

        def finish(job, attempt, progress):
            (attempt / 'picture').write_bytes(b'download')
            screenshot = attempt / 'frame.jpg'
            screenshot.write_bytes(b'finished screenshot')
            return ('成稿', URL, '摘要', [{'segment': 0, 'heading': '主题', 'body': '正文'}],
                    [[0, 5, '语音']], {0: screenshot}, '')

        with patch('article.video_notes.jobs.generate', side_effect=finish):
            process(job, self.uploads)
        job.refresh_from_db()
        self.assertEqual(job.state, 'completed')
        self.assertFalse(directory.exists())
        asset = Asset.objects.get(linked_article_id=job.article_id)
        self.assertEqual((self.root / 'media' / asset.file_path).read_bytes(), b'finished screenshot')

    def test_expired_upload_cleanup_preserves_source_file_and_task(self):
        job = self.create()
        directory = self.uploads / str(job.pk)
        directory.mkdir()
        original = self.root / 'original.mp4'
        original.write_bytes(b'user video')
        shutil.copyfile(original, directory / 'upload')
        VideoNoteJob.objects.filter(pk=job.pk).update(state='failed')
        clean_expired(self.uploads)
        self.assertTrue((directory / 'upload').is_file())
        VideoNoteJob.objects.filter(pk=job.pk).update(updated_at=timezone.now() - timedelta(hours=25))
        clean_expired(self.uploads)
        self.assertFalse(directory.exists())
        self.assertTrue(original.is_file())
        self.assertTrue(VideoNoteJob.objects.filter(pk=job.pk).exists())

    def test_cleanup_preserves_unowned_directories_and_rejects_job_symlinks(self):
        job = self.create()
        VideoNoteJob.objects.filter(pk=job.pk).update(state='completed')
        outside = self.root / 'outside'
        outside.mkdir()
        sentinel = outside / 'original.mp4'
        sentinel.write_bytes(b'user video outside runtime')
        self.assertTrue(outside.resolve().is_relative_to(self.root.resolve()))
        self.assertFalse(outside.resolve().is_relative_to(self.uploads.resolve()))
        unknown = self.uploads / str(uuid.uuid4())
        unknown.mkdir()
        (unknown / 'unrelated.txt').write_bytes(b'unrelated file')
        linked = self.uploads / str(job.pk)
        linked.symlink_to(outside, target_is_directory=True)
        for _ in range(2):
            clean_expired(self.uploads)
            self.assertEqual((unknown / 'unrelated.txt').read_bytes(), b'unrelated file')
            self.assertEqual(sentinel.read_bytes(), b'user video outside runtime')
            self.assertTrue(linked.is_symlink())
        for operation in [lambda: job_directory(self.uploads, job.pk, create=True),
                          lambda: remove_job_directory(self.uploads, job.pk)]:
            with self.assertRaises(VideoError):
                operation()
        self.assertEqual(sentinel.read_bytes(), b'user video outside runtime')

    def test_cleanup_rejects_unvalidated_root_before_deleting_files(self):
        with patch('article.video_notes.storage.shutil.rmtree') as remove, self.assertRaises(VideoError):
            clean_expired(Path('/'))
        remove.assert_not_called()

    def test_atomic_publish_and_sync_round_trip(self):
        job = self.create()
        job.state = 'running'
        job.save()
        frame = self.root / 'frame.jpg'
        frame.write_bytes(b'jpeg-fixture')
        rows = [[61, 65, '选择字段']]
        result = ('教程', URL, '先选字段', [{'heading': '配置', 'body': '选择字段', 'segment': 0}], rows, {0: frame}, '')
        with patch.object(VideoNoteJob, 'save', side_effect=RuntimeError('interrupted')), self.assertRaises(RuntimeError):
            publish(job, result)
        self.assertFalse(list((self.root / 'media').rglob('*.jpg')))
        self.assertFalse(Article.objects.filter(coll_id=self.collection.pk).exists())
        publish(job, result)
        publish(job, result)
        job.refresh_from_db()
        article = Article.objects.get(coll_id=self.collection.pk)
        asset = Asset.objects.get(linked_article=article)
        self.assertEqual(job.article_id, article.pk)
        self.assertIn(asset.id, article.content)
        self.assertEqual(article.creation_source, 'video_note')
        for path in ['list', 'tree-list']:
            response = self.client.get('/api/article/' + path, {'collId': self.collection.pk}).json()
            self.assertEqual(response['data'][0]['creationSource'], 'video_note')
        storage = MemoryStorageClient()
        sync = SyncManager(storage, '/video-test')
        self.assertNotIn(VideoNoteJob, sync.models.iter_target_models())
        self.assertEqual(sync.models.drop_local_only_settings([{'model': 'article.videonotejob'}]), [])
        snapshot = json.loads(serializers.serialize('json', [article, asset]))
        with patch.object(sync.media, 'collect_media_relative_paths', return_value=([asset.file_path], [])), \
             patch.object(sync.media, 'released_book_rel_paths', return_value=[]):
            manifest = sync.media.build_v2_media_manifest()
        sync.media.upload_v2_blobs(manifest)
        with override_settings(MEDIA_ROOT=self.root / 'restored'):
            sync.media.restore_v2_media(manifest)
            self.assertEqual((self.root / 'restored' / asset.file_path).read_bytes(), frame.read_bytes())
        restored = list(serializers.deserialize('json', json.dumps(snapshot)))[0].object
        self.assertEqual((restored.creation_source, restored.content, restored.source_url),
                         ('video_note', article.content, URL))

    def test_manual_source_readonly_and_file_import(self):
        article_data = {'title': '手记', 'content': '我写的', 'collId': self.collection.pk, 'creationSource': 'video_note'}
        response = self.client.post('/api/article/create', article_data, format='json').json()
        self.assertEqual(response['data']['creationSource'], 'manual')
        saved = self.client.put('/api/article/update/' + response['data']['articleId'],
                                {'creationSource': 'imported', 'content': '修改后'}, format='json').json()
        self.assertEqual(saved['data']['creationSource'], 'manual')
        file = SimpleUploadedFile('readme.md', b'# Imported\nBody')
        imported = self.client.post('/api/article/import-file/', {'collId': self.collection.pk, 'file': file}).json()
        self.assertEqual(imported['data']['creationSource'], 'imported')

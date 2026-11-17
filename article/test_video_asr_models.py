import hashlib
import json
import tempfile
import threading
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from article.video_notes import asr_models as models
from system_settings.video_asr_views import VideoASRModelView


class VideoModelTests(SimpleTestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve() / 'video'
        self.enterContext(override_settings(MEDIA_ROOT=Path(temp.name) / 'media'))
        self.enterContext(patch.dict('os.environ', ODOC_VIDEO_ROOT=str(self.root), ODOC_VIDEO_ASR_MODEL='small'))
        self.enterContext(patch('faster_whisper.utils.download_model', side_effect=ValueError('no legacy cache')))
        self.files = {'config.json': b'{}', 'model.bin': b'weights', 'tokenizer.json': b'{}', 'vocabulary.txt': b'hello'}
        self.manifest = {name: (len(data), hashlib.sha256(data).hexdigest()) for name, data in self.files.items()}

    def request(self, user, method='get'):
        request = getattr(APIRequestFactory(), method)('/api/settings/video-asr-model/')
        if user:
            force_authenticate(request, user=user)
        return VideoASRModelView.as_view()(request)

    def test_read_and_download_permissions(self):
        self.assertIn(self.request(None).status_code, (401, 403))
        user = SimpleNamespace(is_authenticated=True, is_superuser=False)
        self.assertEqual(self.request(user).status_code, 200)
        self.assertEqual(self.request(user, 'post').status_code, 403)

    def test_concurrent_start_and_crash_status(self):
        entered, release = threading.Event(), threading.Event()
        def downloading(root):
            entered.set()
            release.wait(5)
        with patch.object(models, '_download', side_effect=downloading) as worker:
            user = SimpleNamespace(is_authenticated=True, is_superuser=True)
            self.assertEqual(self.request(user, 'post').status_code, 200)
            self.assertTrue(entered.wait(2))
            self.assertEqual(models.prepare_model(background=True)['state'], 'downloading')
            worker.assert_called_once()
            release.set()
            for thread in threading.enumerate():
                if thread.name == 'video-asr-download':
                    thread.join(3)
        self.assertEqual(models.model_status()['state'], 'failed')

    def test_modelscope_hash_check_retry_and_local_resolution(self):
        responses = {}
        def response_for(url, **kwargs):
            data = responses[url.rsplit('/', 1)[1]]
            response = SimpleNamespace(raise_for_status=lambda: None, iter_content=lambda n: iter([data]))
            class Context:
                def __enter__(self): return response
                def __exit__(self, *args): return False
            return Context()
        with patch.object(models, 'FILES', self.manifest), \
             patch('requests.Session.get', side_effect=response_for), \
             patch.object(models.subprocess, 'run', return_value=SimpleNamespace(returncode=0)):
            responses.update(self.files)
            responses['model.bin'] = b'broken!'
            self.assertEqual(models.prepare_model()['state'], 'failed')
            self.assertIsNone(models.resolved_model())
            responses.update(self.files)
            self.assertEqual(models.prepare_model()['state'], 'ready')
            self.assertEqual(models.resolved_model(), str(self.root / 'models/modelscope-small'))
            self.assertFalse(list(self.root.rglob('*.part')))
            self.assertEqual(models.prepare_model()['state'], 'ready')
            (Path(models.resolved_model()) / 'model.bin').unlink()
            self.assertEqual(models.model_status()['state'], 'missing')

    def test_model_load_failure_never_marks_ready(self):
        root = models.model_root()
        target = root / 'modelscope-small'
        target.mkdir()
        for name, data in self.files.items():
            (target / name).write_bytes(data)
        with patch.object(models, 'FILES', self.manifest), \
             patch.object(models.subprocess, 'run', return_value=SimpleNamespace(returncode=2)):
            self.assertEqual(models.prepare_model()['state'], 'failed')
            self.assertFalse((target / '.ready').exists())

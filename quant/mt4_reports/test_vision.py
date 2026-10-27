from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

from django.test import override_settings
from rest_framework.exceptions import ValidationError

from .vision import recognize


class VisionTests(TestCase):
    def test_recognition_is_a_bounded_unverified_transcription(self):
        gif = bytes.fromhex('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b')
        with TemporaryDirectory() as root, override_settings(MEDIA_ROOT=root):
            Path(root, 'report.gif').write_bytes(gif)
            asset = SimpleNamespace(file_type='image', file_path='report.gif')
            config = {'api_key': 'test', 'base_url': 'https://example.invalid', 'model_name': 'fixture-model'}
            response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"metrics":[{"name":"总净盈利","value":"338.26"}]}'))])
            with patch('quant.mt4_reports.vision.AIService.get_default_image_client_config', return_value=config), \
                 patch('quant.mt4_reports.vision.OpenAI'), \
                 patch('quant.mt4_reports.vision.create_completion', return_value=response):
                result = recognize(asset)
            self.assertEqual(result['metrics'], [{'name': '总净盈利', 'value': '338.26'}])
            self.assertEqual(result['model_name'], 'fixture-model')

    def test_non_image_is_rejected(self):
        with self.assertRaises(ValidationError):
            recognize(SimpleNamespace(file_type='code'))

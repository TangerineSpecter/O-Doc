import tempfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase, override_settings
from PIL import Image

from assets.models import Asset
from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError
from system_settings.models import AIModel, AIProvider
from .image_references import load_reference_images


class ImageReferenceTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.directory.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        output = BytesIO()
        Image.new('RGB', (12, 20), 'orange').save(output, 'PNG')
        Path(self.directory.name, 'reference.png').write_bytes(output.getvalue())
        self.asset = Asset.objects.create(id='reference-test', name='reference.png',
            original_name='reference.png', file_type='image', file_size=len(output.getvalue()),
            file_path='reference.png', file_extension='.png', mime_type='image/jpeg',
            uploader='admin', file_hash='ref-test-hash')

    def test_reads_real_format_instead_of_trusting_mime_metadata(self):
        references = load_reference_images([self.asset.pk], user_id='admin')
        self.assertTrue(references[0].startswith('data:image/png;base64,'))

    def test_rejects_foreign_private_resource(self):
        self.asset.uploader = 'another-user'
        self.asset.save()
        with self.assertRaisesMessage(ValueError, '无权'):
            load_reference_images([self.asset.pk], user_id='admin')

    def test_rejects_missing_non_image_duplicate_and_url(self):
        for refs in (['missing'], [self.asset.pk, self.asset.pk], ['http://localhost/private'], ['a'] * 5):
            with self.subTest(refs=refs), self.assertRaises(ValueError):
                load_reference_images(refs, user_id='admin')
        self.asset.file_type = 'document'
        self.asset.save()
        with self.assertRaises(ValueError):
            load_reference_images([self.asset.pk], user_id='admin')

    def test_rejects_path_escape_and_invalid_image(self):
        self.asset.file_path = '../outside.png'
        self.asset.save()
        with self.assertRaisesMessage(ValueError, '文件不可用'):
            load_reference_images([self.asset.pk], user_id='admin')
        self.asset.file_path = 'reference.png'
        self.asset.save()
        Path(self.directory.name, 'reference.png').write_bytes(b'not-an-image')
        with self.assertRaises(GrsaiImageError):
            load_reference_images([self.asset.pk], user_id='admin')


class GrsaiReferenceContractTests(TestCase):
    def test_reference_payload_and_legacy_text_generation(self):
        provider = AIProvider.objects.create(name='Grsai', type='Grsai', base_url='https://grsai.example/v1', api_key='test-key')
        model = AIModel.objects.create(provider=provider, name='nano-banana-2', type='image_generation')
        with patch.object(GrsaiImageClient, '_request', return_value={'id': 'provider-task', 'status': 'running'}) as request:
            client = GrsaiImageClient(model)
            client.generate('角色', reference_images=['data:image/png;base64,test'], asynchronous=True)
            payload = request.call_args.kwargs['payload']
            self.assertEqual(payload['images'], ['data:image/png;base64,test'])
            self.assertEqual(payload['replyType'], 'async')
            client.generate('文章配图')
            self.assertEqual(request.call_args.kwargs['payload']['images'], [])
            self.assertEqual(request.call_args.kwargs['payload']['replyType'], 'json')

    def test_violation_is_terminal(self):
        with self.assertRaises(GrsaiImageError) as raised:
            GrsaiImageClient._parse_result({'id': 'provider-task', 'status': 'violation'})
        self.assertEqual(raised.exception.status_code, 422)

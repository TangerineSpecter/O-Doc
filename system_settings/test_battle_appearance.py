import hashlib
import tempfile
from io import BytesIO
from pathlib import Path

from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from PIL import Image

from assets.models import Asset
from article.models import Article
from system_settings.battle_appearance import validate_and_save_appearance
from system_settings.models import Agent
from user.models import UserProfile
from utils.resource_assets import is_asset_used_by_agent, is_asset_used_by_visible_author


class BattleAppearancePersistenceTests(TestCase):
    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings = override_settings(MEDIA_ROOT=self.media.name)
        self.settings.enable()
        self.addCleanup(self.settings.disable)
        self.agent = Agent.objects.create(name='Pixel Resident')

    def asset(self, asset_id, filename, image, owner='owner-a'):
        relative = Path('image') / filename
        path = Path(self.media.name) / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, format='PNG')
        content = path.read_bytes()
        return Asset.objects.create(
            id=asset_id, name=filename, original_name=filename, file_type='image',
            file_size=len(content), file_path=str(relative), file_extension='.png',
            mime_type='image/png', uploader=owner, source_type='agent_art',
            file_hash=hashlib.sha256(content).hexdigest(),
        )

    def valid_assets(self):
        source = self.asset('source-id', 'source.png', Image.new('RGB', (20, 20), '#ff00ff'))
        cutout_image = Image.new('RGBA', (20, 20), (0, 0, 0, 0))
        cutout_image.putpixel((10, 10), (255, 30, 50, 255))
        cutout = self.asset('cutout-id', 'cutout.png', cutout_image)
        head_image = Image.new('RGBA', (374, 310), (0, 0, 0, 0))
        head_image.putpixel((187, 160), (255, 30, 50, 255))
        head = self.asset('head-asset', 'head.png', head_image)
        return source, cutout, head

    def payload(self, source, cutout, head):
        return {'version': 1, 'source_asset_id': source.pk, 'cutout_asset_id': cutout.pk,
                'head_asset_id': head.pk, 'transform': {'x': 0, 'y': 0, 'scale': 1,
                    'crop': {'x': 0, 'y': 0, 'width': 20, 'height': 20}}}

    def test_saves_only_a_valid_owner_scoped_transparent_head(self):
        source, cutout, head = self.valid_assets()
        result = validate_and_save_appearance(self.agent, 'owner-a', self.payload(source, cutout, head))
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.battle_appearance['head_asset_id'], 'head-asset')
        self.assertEqual(result['head_image_url'], '/api/resource/view/head-asset')
        for asset in (source, cutout, head):
            self.assertTrue(is_asset_used_by_agent(asset.pk))
            self.assertFalse(is_asset_used_by_visible_author(asset.pk, Article.objects.none(), []))

    def test_rejects_assets_from_another_account_without_changing_existing_value(self):
        source, cutout, head = self.valid_assets()
        head.uploader = 'owner-b'
        head.save(update_fields=['uploader'])
        with self.assertRaisesMessage(ValueError, '不属于当前账号'):
            validate_and_save_appearance(self.agent, 'owner-a', self.payload(source, cutout, head))
        self.agent.refresh_from_db()
        self.assertIsNone(self.agent.battle_appearance)

    def test_rejects_wrong_output_size(self):
        source, cutout, head = self.valid_assets()
        wrong = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        wrong.putpixel((60, 60), (255, 30, 50, 255))
        head_path = Path(self.media.name) / head.file_path
        wrong.save(head_path, format='PNG')
        with self.assertRaisesMessage(ValueError, '374×310'):
            validate_and_save_appearance(self.agent, 'owner-a', self.payload(source, cutout, head))
        self.agent.refresh_from_db()
        self.assertIsNone(self.agent.battle_appearance)

    def test_reads_saved_appearance_when_source_and_cutout_share_an_asset(self):
        _, cutout, head = self.valid_assets()
        validate_and_save_appearance(self.agent, 'owner-a', self.payload(cutout, cutout, head))
        client = APIClient()
        user = User.objects.create_superuser('owner-a', password='test')
        UserProfile.objects.update_or_create(user=user, defaults={'userid': 'owner-a'})
        client.force_authenticate(user)
        response = client.get(f'/api/settings/agents/{self.agent.pk}/battle-appearance/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['source_asset_id'], cutout.pk)
        self.assertEqual(response.data['data']['cutout_asset_id'], cutout.pk)
        self.assertEqual(response.data['data']['head_asset_id'], head.pk)

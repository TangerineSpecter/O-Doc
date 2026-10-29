from unittest.mock import patch
from datetime import timedelta
import copy
from pathlib import Path

from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from django.contrib.auth.models import User
from django.conf import settings
from rest_framework.test import APIClient

from assets.models import Asset
from prompts.models import ImageGenerationTask
from utils.resource_assets import is_asset_used_by_agent
from . import test_tournaments as tournament_fixtures
from .tournament_art_prompt import build_prompt, moments
from .tournament_models import TournamentIllustration
from .tournament_sync import database_data, validate_source


class TournamentArtPromptTests(SimpleTestCase):
    def test_scene_uses_selected_actual_event_and_historical_profession(self):
        report = {'participants': [{'actor_id': 'a', 'name': '菲伦', 'profession': '法师', 'equipment': []},
                                   {'actor_id': 'b', 'name': '银月', 'profession': '游侠', 'equipment': []}],
                  'rounds': [{'number': 1, 'events': [{'kind': 'damage', 'actor': 'a', 'target': 'b', 'action': '魔力弹', 'damage': 417}]},
                             {'number': 2, 'events': [{'kind': 'damage', 'actor': 'a', 'target': 'b', 'action': '普通攻击', 'damage': 74, 'critical': True}]}]}
        self.assertEqual(len(moments(report)), 2)
        prompt = build_prompt(report, '1:0', [])
        self.assertIn('普通攻击', prompt)
        self.assertNotIn('魔力弹', prompt)
        self.assertIn('法师', prompt)
        with self.assertRaises(ValueError):
            build_prompt(report, '99:0', [])


class TournamentArtAPITests(TestCase):
    setUp = tournament_fixtures.TournamentTests.setUp
    actors = tournament_fixtures.TournamentTests.actors
    event = tournament_fixtures.TournamentTests.event
    finish = tournament_fixtures.TournamentTests.finish
    def test_upload_scoped_to_owner_and_snapshot_checks_asset(self):
        event = self.finish(self.event(2))
        client = APIClient(); client.force_authenticate(self.user)
        url = f'/api/settings/agent-world/tournaments/{event.pk}/illustration/'
        asset = Asset.objects.create(id='art-fixture', name='art.png', original_name='art.png', file_type='image',
            file_size=1, file_path='art.png', file_extension='.png', mime_type='image/png',
            uploader=self.owner, file_hash='fixture')
        response = client.put(url, {'assetId': asset.pk}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(TournamentIllustration.objects.get(pk=event.pk).asset_id, asset.pk)
        self.assertTrue(is_asset_used_by_agent(asset.pk))
        self.assertEqual(client.get(url).data['data']['asset_id'], asset.pk)
        validate_source(database_data(), check_digest=False)
        asset.is_valid = False; asset.save()
        with self.assertRaises(Exception):
            validate_source(database_data(), check_digest=False)

    def test_other_account_and_unknown_submission(self):
        event = self.finish(self.event(2))
        url = f'/api/settings/agent-world/tournaments/{event.pk}/illustration/'
        client = APIClient()
        client.force_authenticate(User.objects.create_user('other-owner'))
        self.assertEqual(client.get(url).status_code, 404)
        client.force_authenticate(self.user)
        self.assertEqual(client.put(url, [], format='json').status_code, 400)
        self.assertEqual(client.post(url, {'modelId': []}, format='json').status_code, 400)
        row = TournamentIllustration.objects.create(tournament=event, owner_id=self.owner, request_id='missing-request')
        self.assertEqual(client.delete(url).status_code, 409)
        TournamentIllustration.objects.filter(pk=row.pk).update(updated_at=timezone.now() - timedelta(minutes=4))
        self.assertEqual(client.delete(url).status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.request_id, '')

    def test_snapshot_restores_artwork_and_detects_missing_asset(self):
        from system_settings.tests import MemoryStorageClient
        from utils.sync_manager import SyncError, SyncManager
        from .life_config import config_for
        event = self.finish(self.event(2))
        config_for(self.owner)
        media = Path(settings.MEDIA_ROOT).resolve()
        media.mkdir(parents=True, exist_ok=True)
        (media / 'art.png').write_bytes(b'test image')
        asset = Asset.objects.create(id='sync-art', name='art.png', original_name='art.png', file_type='image',
            file_size=10, file_path='art.png', file_extension='.png', mime_type='image/png',
            uploader=self.owner, file_hash='fixture')
        reference = Asset.objects.create(id='sync-ref', name='ref.png', original_name='ref.png', file_type='image',
            file_size=10, file_path='art.png', file_extension='.png', mime_type='image/png',
            uploader=self.owner, file_hash='fixture-ref')
        ImageGenerationTask.objects.create(user_id=self.owner, agent_key='', request_id='art-request', input_hash='hash',
            model_id='fixture', provider_type='Grsai', status='succeeded', asset_id=asset.pk,
            request_data={'scene': 'tournament_illustration', 'reference_image_ids': [reference.pk]})
        TournamentIllustration.objects.create(tournament=event, owner_id=self.owner, asset_id=asset.pk, request_id='art-request')
        manager = SyncManager(MemoryStorageClient(), '/backup')
        data = manager.build_snapshot_data()
        meta = manager.build_snapshot_meta(data_list=data)
        damaged = [row for row in data if not (row['model'] == 'assets.asset' and row['pk'] == asset.pk)]
        with self.assertRaises(SyncError):
            validate_source(damaged, meta)
        missing_reference = [row for row in data if not (row['model'] == 'assets.asset' and row['pk'] == reference.pk)]
        with self.assertRaises(SyncError):
            validate_source(missing_reference, meta)
        TournamentIllustration.objects.filter(pk=event.pk).delete()
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(data), meta, full_overwrite=True)
            self.assertEqual(TournamentIllustration.objects.get(pk=event.pk).asset_id, asset.pk)
            self.assertTrue(ImageGenerationTask.objects.filter(request_id='art-request').exists())

    def test_generation_uses_each_fighter_and_the_recorded_moment(self):
        event = self.finish(self.event(2))
        client = APIClient(); client.force_authenticate(self.user)
        url = f'/api/settings/agent-world/tournaments/{event.pk}/illustration/'
        def options(agent, model_id, scene, owner):
            return {'configured': True, 'model_id': 'image', 'supports_reference_images': True,
                    'max_reference_images': 4, 'agent_reference_images': {'avatar': str(agent.pk)} if agent else {}}
        with patch('system_settings.agent_world.tournament_art_views.image_generation_options', side_effect=options), \
                patch('system_settings.agent_world.tournament_art_views.generate_image', return_value={'status': 'generating'}) as generate:
            response = client.post(url, {'modelId': 'image'}, format='json')
        self.assertEqual(response.status_code, 200)
        arguments = generate.call_args.args[0]
        self.assertEqual(len(arguments['reference_image_ids']), 2)
        self.assertIn(event.rounds.get(phase='final').matches.get(kind='main').report['participants'][0]['profession'], arguments['prompt'])

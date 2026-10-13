import hashlib
import tempfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from PIL import Image

from assets.models import Asset
from article.models import Article
from system_settings.battle_appearance import BattleAppearanceSerializer, validate_and_save_appearance
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

    def test_empty_extra_requirements_still_generates_from_agent_avatar(self):
        client = APIClient()
        user = User.objects.create_superuser('avatar-source-owner', password='test')
        UserProfile.objects.update_or_create(user=user, defaults={'userid': 'owner-a'})
        client.force_authenticate(user)
        with patch('system_mcp.image_generation.image_generation_options', return_value={
            'configured': True,
            'supports_reference_images': True,
            'agent_reference_images': {'avatar': 'agent-avatar'},
        }), patch('system_mcp.image_generation_tasks.generate_image', return_value={
            'status': 'generating', 'task_id': 'battle-head-task',
        }) as generate:
            response = client.post(
                f'/api/settings/agents/{self.agent.pk}/battle-appearance-generation/',
                {'prompt': '', 'requestId': 'empty-extra-prompt'}, format='json',
            )
        self.assertEqual(response.status_code, 200, response.data)
        request_data = generate.call_args.args[0]
        self.assertEqual(request_data['reference_image_ids'], ['agent-avatar'])
        self.assertIn('attached Agent avatar/reference image', request_data['prompt'])
        self.assertNotIn('Optional additional requirements:', request_data['prompt'])


    def test_version_two_keeps_extended_hair_canvas_and_neck_registration(self):
        source, cutout, head = self.valid_assets()
        image = Image.new('RGBA', (374, 528), (0, 0, 0, 0))
        image.putpixel((187, 420), (255, 30, 50, 255))
        image.save(Path(self.media.name) / head.file_path, format='PNG')
        payload = self.payload(source, cutout, head)
        payload['version'] = 2
        payload['transform'].update(neck_anchor={'x': 10, 'y': 12}, hair_layer='behind')
        saved = validate_and_save_appearance(self.agent, 'owner-a', payload)
        self.assertEqual(saved['version'], 2)
        self.assertEqual(saved['transform']['neck_anchor'], {'x': 10, 'y': 12})
        self.assertEqual(saved['transform']['hair_layer'], 'behind')
        payload['transform']['neck_anchor']['y'] = 20
        with self.assertRaisesMessage(ValueError, '颈部连接点超出原图'):
            validate_and_save_appearance(self.agent, 'owner-a', payload)

    def test_body_reference_is_sent_second_with_a_separate_style_role(self):
        client = APIClient()
        user = User.objects.create_superuser('dual-ref-owner', password='test')
        UserProfile.objects.update_or_create(user=user, defaults={'userid': 'owner-a'})
        client.force_authenticate(user)
        with patch('system_mcp.image_generation.image_generation_options', return_value={
            'configured': True, 'supports_reference_images': True,
            'agent_reference_images': {'avatar': 'agent-avatar'},
        }), patch('system_mcp.image_generation_tasks.generate_image', return_value={'status': 'generating'}) as generate:
            response = client.post(f'/api/settings/agents/{self.agent.pk}/battle-appearance-generation/',
                                   {'prompt': '', 'bodyReferenceImageId': 'job-body'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        data = generate.call_args.args[0]
        self.assertEqual(data['reference_image_ids'], ['agent-avatar', 'job-body'])
        self.assertNotIn('body_reference_image_id', data)
        self.assertIn('FIRST attached Agent avatar', data['prompt'])
        self.assertIn('LAST attached image is the actual headless battle body', data['prompt'])

    def test_body_reference_gets_deletion_protection_without_anonymous_read_access(self):
        from prompts.models import ImageGenerationTask
        from utils.resource_assets import get_agent_resource_usage
        body = self.asset('body-style', 'body.png', Image.new('RGBA', (374, 218), (50, 80, 30, 255)))
        ImageGenerationTask.objects.create(user_id='owner-a', agent_key=self.agent.pk, request_id='dual-ref',
                                          input_hash='hash', model_id='model', provider_type='Grsai',
                                          request_data={'scene': 'battle_head', 'reference_image_ids': ['avatar', body.pk]})
        self.assertTrue(is_asset_used_by_agent(body.pk))
        self.assertIn(body.pk, get_agent_resource_usage([body.pk]))
        self.assertFalse(is_asset_used_by_visible_author(body.pk, Article.objects.none(), []))


class BattleHeadTaskLifecycleTests(TestCase):
    def setUp(self):
        self.agent = Agent.objects.create(name='Lifecycle Resident')
        self.client = APIClient()
        user = User.objects.create_superuser('lifecycle-owner', password='test')
        UserProfile.objects.update_or_create(user=user, defaults={'userid': 'owner-a'})
        self.client.force_authenticate(user)
        self.url = f'/api/settings/agents/{self.agent.pk}/battle-appearance-generation/'

    def task(self, request_id='first', owner='owner-a', scene='battle_head'):
        from prompts.models import ImageGenerationTask
        return ImageGenerationTask.objects.create(
            user_id=owner, agent_key=str(self.agent.pk), request_id=request_id,
            input_hash='hash', request_data={'scene': scene}, model_id='model',
            provider_type='Grsai', status='generating', provider_task_id='remote-task',
        )

    def test_cancellation_stops_older_duplicates_and_allows_new_submission(self):
        older = self.task('older')
        selected = self.task('selected')
        unrelated = self.task('travel', scene='travel')
        response = self.client.delete(self.url + f'?taskId={selected.pk}')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['status'], 'cancelled')
        older.refresh_from_db()
        unrelated.refresh_from_db()
        self.assertEqual(older.status, 'cancelled')
        self.assertEqual(unrelated.status, 'generating')
        with patch('system_mcp.image_generation.image_generation_options', return_value={'configured': True}), \
                patch('system_mcp.image_generation_tasks.generate_image', return_value={'status': 'generating'}) as generate:
            self.client.post(self.url, {'prompt': 'retry', 'requestId': 'second'}, format='json')
        generate.assert_called_once()

    def test_cancel_rejects_other_owner_and_other_scene(self):
        for task in (self.task('private', owner='someone-else'), self.task('travel', scene='travel')):
            response = self.client.delete(self.url + f'?taskId={task.pk}')
            self.assertEqual(response.status_code, 404)
            task.refresh_from_db()
            self.assertEqual(task.status, 'generating')

    def test_late_provider_result_cannot_resurrect_cancelled_task(self):
        from system_mcp.image_generation_tasks import _accept_result, _write
        from system_mcp.image_task_lifecycle import cancel_battle_head_task
        from system_settings.grsai_images import GrsaiImageResult
        task = self.task()
        cancel_battle_head_task(task.pk, 'owner-a', str(self.agent.pk))
        _accept_result(task, GrsaiImageResult('remote-task', 'succeeded', ('https://example.com/image.png',)))
        _write(task, status='succeeded', asset_id='late-asset')
        task.refresh_from_db()
        self.assertEqual(task.status, 'cancelled')
        self.assertEqual(task.asset_id, '')
        self.assertEqual(task.image_url, '')

    def test_expired_task_stops_without_querying_provider_and_reports_original_age(self):
        from datetime import timedelta
        from django.utils import timezone
        from prompts.models import ImageGenerationTask
        task = self.task()
        ImageGenerationTask.objects.filter(pk=task.pk).update(created_at=timezone.now() - timedelta(minutes=16))
        with patch('system_mcp.image_generation_tasks.GrsaiImageClient') as provider:
            response = self.client.get(self.url + f'?taskId={task.pk}')
        provider.assert_not_called()
        data = response.data['data']
        self.assertEqual(data['status'], 'timed_out')
        self.assertGreaterEqual(data['elapsed_seconds'], 960)
        self.assertEqual(data['wait_limit_seconds'], 900)
        self.assertIn('created_at', data)

    def test_cancel_does_not_overwrite_a_completion_that_won_the_race(self):
        from prompts.models import ImageGenerationTask
        from system_mcp.image_task_lifecycle import write_image_task
        task = self.task()
        ImageGenerationTask.objects.filter(pk=task.pk).update(status='succeeded', asset_id='completed')
        write_image_task(task, status='cancelled')
        task.refresh_from_db()
        self.assertEqual(task.status, 'succeeded')
        self.assertEqual(task.asset_id, 'completed')

    def test_camel_case_task_query_reaches_provider_instead_of_returning_a_list(self):
        from system_settings.grsai_images import GrsaiImageResult
        task = self.task()
        with patch('system_mcp.image_generation_tasks._model'), \
                patch('system_mcp.image_generation_tasks.GrsaiImageClient') as provider:
            provider.return_value.get_result.return_value = GrsaiImageResult('remote-task', 'pending')
            response = self.client.get(self.url + f'?taskId={task.pk}')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsInstance(response.data['data'], dict)
        self.assertEqual(response.data['data']['task_id'], task.pk)
        provider.return_value.get_result.assert_called_once_with('remote-task')

    def test_manual_timeout_recovery_queries_original_task_without_regeneration(self):
        from system_mcp.image_task_lifecycle import write_image_task
        from system_settings.grsai_images import GrsaiImageResult
        task = self.task()
        write_image_task(task, status='timed_out')
        def saved(task, client):
            write_image_task(task, status='succeeded', asset_id='recovered-asset')
        with patch('system_mcp.image_generation_tasks._model'), \
                patch('system_settings.grsai_images.GrsaiImageClient') as provider, \
                patch('system_mcp.image_generation_tasks._download', side_effect=saved) as download, \
                patch('system_mcp.image_generation_tasks.generate_image') as generate, \
                patch('system_mcp.image_generation_tasks.Asset.objects.filter') as assets:
            assets.return_value.exists.return_value = True
            provider.return_value.get_result.return_value = GrsaiImageResult('remote-task', 'succeeded', ('https://example.com/image.png',))
            response = self.client.post(f'/api/settings/agents/{self.agent.pk}/battle-appearance-generation-recover/', {'taskId': task.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['status'], 'succeeded')
        provider.return_value.get_result.assert_called_once_with('remote-task')
        download.assert_called_once()
        generate.assert_not_called()

    def test_cancelled_task_is_not_recovered_or_regenerated(self):
        from system_mcp.image_task_lifecycle import write_image_task, recover_battle_head_task
        task = self.task()
        write_image_task(task, status='cancelled')
        with patch('system_settings.grsai_images.GrsaiImageClient') as provider:
            recovered = recover_battle_head_task(task.pk, 'owner-a', str(self.agent.pk))
        provider.assert_not_called()
        self.assertEqual(recovered.status, 'cancelled')

    def test_discarded_accidental_result_is_not_selected_on_reopen(self):
        first = self.task('intended')
        accidental = self.task('accidental')
        accidental.status = 'discarded'
        accidental.save(update_fields=['status'])
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([item['task_id'] for item in response.data['data']], [first.pk])


class BattleAppearanceScaleValidationTests(TestCase):
    def test_fitted_large_image_scale_is_accepted_and_invalid_range_rejected(self):
        for scale, expected in ((338/3900, True), (.01, True), (4, True), (.009, False), (4.01, False)):
            payload = {'version':3, 'source_asset_id':'source', 'cutout_asset_id':'cutout', 'character_asset_id':'character',
                'transform':{'x':0,'y':0,'scale':scale,'crop':{'x':0,'y':0,'width':3900,'height':1950}},
                'overlays':{key:{'x':0,'y':0,'scale':1,'rotation':0} for key in ('left_hand','right_hand','weapon')}}
            with self.subTest(scale=scale):
                self.assertEqual(BattleAppearanceSerializer(data=payload).is_valid(), expected)

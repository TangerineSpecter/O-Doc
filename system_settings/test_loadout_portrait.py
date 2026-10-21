import json
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import serializers
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from assets.models import Asset
from prompts.generation import _validate_image_content
from prompts.models import ImageGenerationTask
from system_settings.models import Agent, SyncEntityState
from system_settings.loadout_portrait import build_portrait_request, prepare_portrait, SCENE
from system_mcp.image_task_lifecycle import cancel_battle_head_task
from user.models import UserProfile
from utils.resource_assets import get_agent_resource_usage, is_asset_used_by_agent, is_asset_used_by_visible_author
from article.models import Article


class LoadoutPortraitTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='portrait-owner')
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': 'portrait-owner'})
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.agent = Agent.objects.create(name='阿尼亚', role_profile={'age': '6', 'appearance': '粉发绿眼', 'personality': '活泼'})
        self.base = f'/api/settings/agents/{self.agent.pk}/loadout-portrait'
        self.asset = Asset.objects.create(id='portrait-asset', name='portrait.png', file_type='image',
            file_size=20, file_path='image/portrait.png', uploader='portrait-owner', source_type='agent_art')
        self.task = ImageGenerationTask.objects.create(user_id='portrait-owner', agent_key=self.agent.pk,
            request_id='portrait-request', input_hash='digest', request_data={'scene': SCENE},
            status='succeeded', asset_id=self.asset.pk, model_id='image-model', provider_type='Grsai')

    def test_apply_is_explicit_and_scoped_to_current_agent_owner_and_scene(self):
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.loadout_portrait, '')
        for changes in ({'agent_key': 'someone-else'}, {'user_id': 'another-owner'}, {'request_data': {'scene': 'battle_head'}}, {'status': 'generating'}):
            original = {key: getattr(self.task, key) for key in changes}
            for key, value in changes.items(): setattr(self.task, key, value)
            self.task.save()
            self.assertEqual(self.client.put(self.base + '/', {'taskId': self.task.pk}, format='json').status_code, 400)
            for key, value in original.items(): setattr(self.task, key, value)
            self.task.save()
        response = self.client.put(self.base + '/', {'taskId': self.task.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.loadout_portrait, '/api/resource/view/portrait-asset')
        self.assertTrue(is_asset_used_by_agent(self.asset.pk))
        self.assertIn(self.asset.pk, get_agent_resource_usage([self.asset.pk]))
        self.assertFalse(is_asset_used_by_visible_author(self.asset.pk, Article.objects.none(), []))
        exported = serializers.serialize('json', [self.agent])
        self.assertIn('loadout_portrait', exported)
        self.assertIn(self.agent.loadout_portrait, exported)
        self.assertEqual(self.client.delete(self.base + '/').status_code, 200)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.loadout_portrait, '')
        self.assertTrue(Asset.objects.filter(pk=self.asset.pk, is_valid=True).exists())

    def test_sync_snapshot_and_revision_cover_portrait_and_restore(self):
        from utils.sync_manager import SyncManager
        previous_revision = SyncEntityState.objects.get(model_label='system_settings.agent', object_pk=self.agent.pk).revision_at
        self.client.put(self.base + '/', {'taskId': self.task.pk, 'scale': 1.2}, format='json')
        self.agent.refresh_from_db()
        revision = SyncEntityState.objects.get(model_label='system_settings.agent', object_pk=self.agent.pk)
        self.assertFalse(revision.is_deleted)
        self.assertGreater(revision.revision_at, previous_revision)
        manager = SyncManager()
        snapshot = manager.build_snapshot_data()
        fields = next(row['fields'] for row in snapshot if row['model'] == 'system_settings.agent' and row['pk'] == self.agent.pk)
        self.assertEqual(fields['loadout_portrait'], self.agent.loadout_portrait)
        self.assertEqual(fields['loadout_portrait_scale'], 1.2)
        self.assertTrue(any(row['model'] == 'assets.asset' and row['pk'] == self.asset.pk for row in snapshot))
        Agent.objects.filter(pk=self.agent.pk).update(loadout_portrait='', loadout_portrait_scale=1)
        manager.apply_snapshot_data(json.loads(json.dumps(snapshot)))
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.loadout_portrait, '/api/resource/view/portrait-asset')
        self.assertEqual(self.agent.loadout_portrait_scale, 1.2)

    def test_anonymous_cannot_read_generate_or_apply(self):
        self.client.force_authenticate(None)
        for method, path in [('get', '/'), ('put', '/'), ('post', '-generation/'), ('get', '-options/')]:
            self.assertIn(getattr(self.client, method)(self.base + path).status_code, (401, 403))

    def test_missing_saved_asset_can_be_replaced_or_reset(self):
        self.agent.loadout_portrait = '/api/resource/view/missing-asset'; self.agent.save()
        response = self.client.get(self.base + '/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['asset_id'], '')
        self.assertEqual(self.client.put(self.base + '/', {'taskId': self.task.pk}, format='json').status_code, 200)
        self.assertEqual(self.client.delete(self.base + '/').status_code, 200)

    def test_generation_task_query_cannot_cross_scenes(self):
        self.task.request_data = {'scene': 'battle_head'}; self.task.save()
        response = self.client.get(self.base + '-generation/', {'taskId': self.task.pk})
        self.assertEqual(response.status_code, 404)

    def test_cancellation_is_isolated_from_pixel_battle_generation(self):
        self.task.status = 'generating'; self.task.save()
        other = ImageGenerationTask.objects.create(user_id='portrait-owner', agent_key=self.agent.pk,
            request_id='other-request', input_hash='other', request_data={'scene': 'battle_head'},
            status='generating', model_id='image-model', provider_type='Grsai')
        cancel_battle_head_task(self.task.pk, 'portrait-owner', self.agent.pk, SCENE)
        self.task.refresh_from_db(); other.refresh_from_db()
        self.assertEqual(self.task.status, 'cancelled')
        self.assertEqual(other.status, 'generating')

    def test_prompt_uses_references_and_identity_without_client_reference_injection(self):
        result = build_portrait_request(self.agent, {'prompt': '小冒险者', 'reference_image_ids': ['foreign-asset']}, {
            'supports_reference_images': True, 'max_reference_images': 3,
            'agent_reference_images': {'avatar': 'avatar-id', 'full_body': 'body-id'},
        })
        self.assertEqual(result['reference_image_ids'], ['avatar-id', 'body-id'])
        for expected in ('粉发绿眼', 'job.novice', '小冒险者'):
            self.assertIn(expected, result['prompt'])
        with self.assertRaises(ValueError):
            build_portrait_request(self.agent, {}, {'supports_reference_images': False})
        with self.assertRaises(ValueError):
            build_portrait_request(self.agent, {}, {'supports_reference_images': True})

    def test_portrait_only_uses_visual_fields_and_ignores_all_other_role_inputs(self):
        self.agent.role_profile = {
            'age': '年龄标记_6岁', 'identity': '身份背景标记_某学校学生',
            'appearance': '粉发绿眼，黑金发饰', 'personality': '性格标记_活泼',
            'mbti': 'ENFP', 'preferences': '喜好标记_花生',
            'expression': '相处方式标记_喜欢撒娇',
        }
        self.agent.prompt = '通用提示标记_年龄性格人格喜好和相处方式的旧设定'
        options = {'supports_reference_images': True, 'max_reference_images': 3,
                   'agent_reference_images': {'avatar': 'avatar-id'}}
        request = build_portrait_request(self.agent, {'prompt': '穿绿色披风'}, options)
        self.assertIn(self.agent.role_profile['appearance'], request['prompt'])
        self.assertIn('穿绿色披风', request['prompt'])
        for field, value in self.agent.role_profile.items():
            if field != 'appearance':
                self.assertNotIn(value, request['prompt'])
        self.assertNotIn(self.agent.prompt, request['prompt'])
        for phrase in ('apparent age', 'Age and personality', 'child', 'adult'):
            self.assertNotIn(phrase, request['prompt'])
        # Missing visual settings must never fall back to the general role prompt.
        self.agent.role_profile.pop('appearance')
        without_appearance = build_portrait_request(self.agent, {}, options)
        self.assertEqual(without_appearance['reference_image_ids'], ['avatar-id'])
        self.assertNotIn(self.agent.prompt, without_appearance['prompt'])
        self.assertNotIn('年龄标记', without_appearance['prompt'])

    def test_uploaded_reference_overrides_avatar_and_agent_appearance(self):
        self.agent.role_profile['appearance'] = '旧外貌设定'
        result = build_portrait_request(self.agent, {'reference_image_id': self.asset.pk}, {
            'supports_reference_images': True, 'max_reference_images': 4,
            'agent_reference_images': {'avatar': 'old-avatar', 'full_body': 'old-body'},
        }, owner_id='portrait-owner')
        self.assertEqual(result['reference_image_ids'], [self.asset.pk])
        self.assertNotIn('旧外貌设定', result['prompt'])
        self.assertNotIn('reference_image_id', result)
        self.assertIn('naturally open eyes', result['prompt'])
        self.assertIn('closed-mouth smile', result['prompt'])
        self.assertIn('open-mouth laughter', result['prompt'])

    def test_uploaded_reference_works_without_avatar_and_rejects_foreign_assets(self):
        options = {'supports_reference_images': True, 'max_reference_images': 4}
        result = build_portrait_request(self.agent, {'reference_image_id': self.asset.pk}, options, owner_id='portrait-owner')
        self.assertEqual(result['reference_image_ids'], [self.asset.pk])
        for override in ('missing', self.asset.pk, ['not-an-id']):
            with self.assertRaises(ValueError):
                build_portrait_request(self.agent, {'reference_image_id': override}, options, owner_id='another-owner')
        self.asset.file_type = 'document'; self.asset.save()
        with self.assertRaises(ValueError):
            build_portrait_request(self.agent, {'reference_image_id': self.asset.pk}, options, owner_id='portrait-owner')

    def test_scale_can_be_saved_without_generating_or_replacing_image(self):
        self.client.put(self.base + '/', {'taskId': self.task.pk}, format='json')
        with patch('system_mcp.image_generation_tasks.generate_image') as generate:
            response = self.client.put(self.base + '/', {'scale': 1.25}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['scale'], 1.25)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.loadout_portrait_scale, 1.25)
        self.assertEqual(self.agent.loadout_portrait, '/api/resource/view/portrait-asset')
        generate.assert_not_called()
        for value in (0.1, 2, True, 'NaN', 'Infinity', 'invalid'):
            response = self.client.put(self.base + '/', {'scale': value}, format='json')
            self.assertEqual(response.status_code, 400, (value, response.data))
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.loadout_portrait_scale, 1.25)
        self.client.delete(self.base + '/')
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.loadout_portrait_scale, 1)
        self.assertEqual(self.client.put(self.base + '/', {'scale': 1.2}, format='json').status_code, 400)

    def test_apply_image_and_scale_together_and_return_scale_on_get(self):
        response = self.client.put(self.base + '/', {'taskId': self.task.pk, 'scale': 0.8}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.get(self.base + '/')
        self.assertEqual(response.data['data']['scale'], 0.8)
        self.assertEqual(response.data['data']['asset_id'], self.asset.pk)

    def test_generation_does_not_overwrite_current_portrait(self):
        self.agent.loadout_portrait = '/api/resource/view/portrait-asset'; self.agent.save()
        options = {'configured': True, 'supports_reference_images': True, 'max_reference_images': 3,
                   'agent_reference_images': {'avatar': 'avatar-id'}}
        with patch('system_mcp.image_generation.image_generation_options', return_value=options), patch('system_mcp.image_generation_tasks.generate_image', return_value={'status': 'failed', 'task_id': 'failed-task'}) as generate:
            response = self.client.post(self.base + '-generation/', {'prompt': '保留发饰', 'requestId': 'once'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(generate.call_args.kwargs['scene'], SCENE)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.loadout_portrait, '/api/resource/view/portrait-asset')

    def test_prompt_requests_transparency_only_when_the_model_supports_it(self):
        options = {'supports_reference_images': True, 'max_reference_images': 3,
                   'agent_reference_images': {'avatar': 'avatar-id'}}
        native = build_portrait_request(self.agent, {}, {**options, 'supports_transparent_background': True})
        self.assertIn('transparent (alpha 0)', native['prompt'])
        self.assertNotIn('#FF00FF', native['prompt'])
        keyed = build_portrait_request(self.agent, {}, options)
        self.assertIn('#FF00FF', keyed['prompt'])
        self.assertNotIn('transparent (alpha 0)', keyed['prompt'])

    def test_native_transparency_skips_chroma_and_normalizes_canvas(self):
        image = Image.new('RGBA', (100, 150), (0, 0, 0, 0))
        for y in range(20, 140):
            for x in range(30, 70): image.putpixel((x, y), (245, 150, 180, 255))
        # A magenta accent inside the character must survive without color keying.
        for y in range(55, 65):
            for x in range(45, 55): image.putpixel((x, y), (255, 0, 255, 255))
        buffer = BytesIO(); image.save(buffer, format='PNG')
        result = prepare_portrait(_validate_image_content(buffer.getvalue()), transparent=True)
        with Image.open(BytesIO(result.content)) as rendered:
            self.assertEqual(rendered.size, (768, 1024))
            self.assertEqual(rendered.getpixel((0, 0))[3], 0)
            self.assertEqual(rendered.getchannel('A').getbbox()[3], 980)
            self.assertIn((255, 0, 255, 255), rendered.getdata())
        opaque = BytesIO(); Image.new('RGB', (10, 10), 'white').save(opaque, format='PNG')
        with self.assertRaisesMessage(ValueError, '透明背景'):
            prepare_portrait(_validate_image_content(opaque.getvalue()), transparent=True)

    def test_existing_transparent_canvas_preserves_magenta_details_in_fallback_mode(self):
        image = Image.new('RGBA', (100, 150), (0, 0, 0, 0))
        for y in range(20, 140):
            for x in range(30, 70): image.putpixel((x, y), (245, 150, 180, 255))
        for y in range(55, 65):
            for x in range(45, 55): image.putpixel((x, y), (255, 0, 255, 255))
        buffer = BytesIO(); image.save(buffer, format='PNG')
        result = prepare_portrait(_validate_image_content(buffer.getvalue()))
        with Image.open(BytesIO(result.content)) as rendered:
            self.assertEqual(rendered.getpixel((0, 0))[3], 0)
            self.assertIn((255, 0, 255, 255), rendered.getdata())

    def test_download_recovery_uses_persisted_native_background_option(self):
        from system_mcp import image_generation_tasks
        image_buffer = BytesIO()
        native = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
        native.putpixel((4, 4), (255, 0, 255, 255))
        native.save(image_buffer, format='PNG')
        image = _validate_image_content(image_buffer.getvalue())
        self.task.status = 'download_pending'
        self.task.image_url = 'https://images.example/native.png'
        self.task.request_data = {'scene': SCENE, 'provider_options': {'background': 'transparent'}}
        self.task.save()

        with patch.object(image_generation_tasks, '_download_generated_images', return_value=[image]), \
                patch('system_settings.loadout_portrait.prepare_portrait', wraps=prepare_portrait) as prepare, \
                patch.object(image_generation_tasks, 'save_article_illustration', return_value={'id': self.asset.pk}):
            image_generation_tasks._download(self.task, None)

        prepare.assert_called_once_with(image, transparent=True)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, 'succeeded')

    def test_chroma_removal_preserves_pink_character_and_normalizes_canvas(self):
        image = Image.new('RGB', (100, 150), '#FF00FF')
        for y in range(20, 140):
            for x in range(30, 70): image.putpixel((x, y), (245, 150, 180))
        buffer = BytesIO(); image.save(buffer, format='PNG')
        result = prepare_portrait(_validate_image_content(buffer.getvalue()))
        with Image.open(BytesIO(result.content)) as rendered:
            self.assertEqual(rendered.size, (768, 1024))
            self.assertEqual(rendered.mode, 'RGBA')
            self.assertEqual(rendered.getpixel((0, 0))[3], 0)
            self.assertGreater(rendered.getpixel((384, 700))[3], 0)
            self.assertEqual(rendered.getchannel('A').getbbox()[3], 980)
        buffer = BytesIO(); Image.new('RGB', (10, 10), 'white').save(buffer, format='PNG')
        with self.assertRaisesMessage(ValueError, '纯色背景'):
            prepare_portrait(_validate_image_content(buffer.getvalue()))

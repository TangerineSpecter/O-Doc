from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from .models import WorldCategory, WorldProfession, WorldProfessionCategory


class ProfessionManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('profession-editor', password='test')
        self.client.force_authenticate(self.user)

    def test_partial_toggles_preserve_settings_and_edit_preserves_toggle(self):
        category = WorldCategory.objects.create(name='科技', description='分类说明')
        profession = WorldProfession.objects.create(name='科技博主', description='职业说明', farm_yield_percentage='20')
        WorldProfessionCategory.objects.create(profession=profession, category=category, percentage='10')
        for path, row in [('categories', category), ('professions', profession)]:
            response = self.client.post(f'/api/settings/agent-world/{path}/', {'id': row.pk, 'enabled': False}, format='json')
            self.assertEqual(response.status_code, 200)
            row.refresh_from_db()
            self.assertFalse(row.enabled)
            self.assertEqual(row.description, '分类说明' if path == 'categories' else '职业说明')
            response = self.client.post(f'/api/settings/agent-world/{path}/', {'id': row.pk, 'description': '更新说明'}, format='json')
            self.assertEqual(response.status_code, 200)
            row.refresh_from_db()
            self.assertFalse(row.enabled)
        profession.refresh_from_db()
        self.assertEqual(profession.farm_yield_percentage, 20)
        self.assertEqual(profession.bonuses.get().percentage, 10)

    @patch('system_settings.agent_world.profession_description.AIService.chat_completion', return_value='研究科技趋势，分享技术观察与实践心得。')
    def test_generation_returns_draft_without_saving(self, complete):
        count = WorldProfession.objects.count()
        response = self.client.post('/api/settings/agent-world/professions/generate-description/',
            {'name': '科技博主', 'categories': ['科技'], 'farmYieldPercentage': '0'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('研究科技', response.data['data']['description'])
        self.assertEqual(WorldProfession.objects.count(), count)
        self.assertTrue(complete.call_args.kwargs['bounded'])
        self.assertTrue(complete.call_args.kwargs['use_simple_model'])

    @patch('system_settings.agent_world.profession_description.AIService.chat_completion', side_effect=ValueError('sensitive configuration'))
    def test_generation_failure_is_safe(self, complete):
        response = self.client.post('/api/settings/agent-world/professions/generate-description/', {'name':'农民'}, format='json')
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('sensitive configuration', str(response.data))

    @patch('system_settings.agent_world.profession_description.AIService.chat_completion')
    def test_generation_validation_and_login(self, complete):
        path = '/api/settings/agent-world/professions/generate-description/'
        self.assertEqual(self.client.post(path, {'name':''}, format='json').status_code, 400)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(path, {'name':'农民'}, format='json').status_code, (401,403))
        complete.assert_not_called()

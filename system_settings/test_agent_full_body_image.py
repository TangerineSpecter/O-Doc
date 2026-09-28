import json

from django.contrib.auth.models import AnonymousUser, User
from django.test import RequestFactory, TestCase

from assets.models import Asset
from assets.views import can_read_asset
from utils.resource_assets import get_agent_resource_usage, get_resource_view_url, is_asset_used_by_agent
from utils.sync_manager import SyncManager
from .models import Agent
from .serializers import AgentSerializer


class AgentFullBodyImageTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', 'admin@example.com', 'test-password')
        self.request = RequestFactory().post('/api/settings/agents/')
        self.request.user = self.user
        self.asset = Asset.objects.create(
            id='agent-full-body-test', name='character.png', original_name='character.png',
            file_type='image', file_size=10, file_path='image/character.png',
            file_extension='.png', mime_type='image/png', uploader='admin', file_hash='character-hash')
        self.url = get_resource_view_url(self.asset.pk)

    def test_create_edit_clear_and_old_request_default(self):
        serializer = AgentSerializer(data={'name': '角色', 'full_body_image': self.url}, context={'request': self.request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        agent = serializer.save()
        self.assertEqual(AgentSerializer(agent).data['full_body_image'], self.url)
        edit = AgentSerializer(agent, data={'name': '新名字'}, partial=True, context={'request': self.request})
        self.assertTrue(edit.is_valid(), edit.errors)
        edit.save()
        agent.refresh_from_db()
        self.assertEqual(agent.full_body_image, self.url)
        clear = AgentSerializer(agent, data={'full_body_image': ''}, partial=True, context={'request': self.request})
        self.assertTrue(clear.is_valid(), clear.errors)
        clear.save()
        self.assertEqual(agent.full_body_image, '')
        old = AgentSerializer(data={'name': '旧客户端'}, context={'request': self.request})
        self.assertTrue(old.is_valid(), old.errors)
        self.assertEqual(old.save().full_body_image, '')

    def test_rejects_missing_foreign_non_image_and_external_references(self):
        for value in ('https://example.com/character.png', '/api/resource/view/missing'):
            serializer = AgentSerializer(data={'name': '角色', 'full_body_image': value}, context={'request': self.request})
            self.assertFalse(serializer.is_valid())
        for changes in ({'uploader': 'someone-else'}, {'file_type': 'document'}, {'is_valid': False}):
            with self.subTest(changes=changes):
                Asset.objects.filter(pk=self.asset.pk).update(**changes)
                serializer = AgentSerializer(data={'name': '角色', 'full_body_image': self.url}, context={'request': self.request})
                self.assertFalse(serializer.is_valid())
                Asset.objects.filter(pk=self.asset.pk).update(uploader='admin', file_type='image', is_valid=True)

    def test_reference_protects_asset_without_granting_public_access(self):
        agent = Agent.objects.create(name='角色', full_body_image=self.url)
        self.assertTrue(is_asset_used_by_agent(self.asset.pk))
        self.assertEqual(get_agent_resource_usage([self.asset.pk])[self.asset.pk]['id'], agent.pk)
        public = RequestFactory().get(self.url)
        public.user = AnonymousUser()
        self.assertFalse(can_read_asset(public, self.asset))
        owner = RequestFactory().get(self.url)
        owner.user = self.user
        self.assertTrue(can_read_asset(owner, self.asset))
        agent.full_body_image = ''
        agent.save()
        self.assertFalse(is_asset_used_by_agent(self.asset.pk))

    def test_snapshot_exports_and_restores_image_reference_and_asset(self):
        agent = Agent.objects.create(name='角色', full_body_image=self.url)
        manager = SyncManager()
        snapshot = manager.build_snapshot_data()
        fields = next(row['fields'] for row in snapshot if row['model'] == 'system_settings.agent' and row['pk'] == agent.pk)
        self.assertEqual(fields['full_body_image'], self.url)
        self.assertTrue(any(row['model'] == 'assets.asset' and row['pk'] == self.asset.pk for row in snapshot))
        Agent.objects.filter(pk=agent.pk).update(full_body_image='')
        manager.apply_snapshot_data(json.loads(json.dumps(snapshot)))
        agent.refresh_from_db()
        self.assertEqual(agent.full_body_image, self.url)

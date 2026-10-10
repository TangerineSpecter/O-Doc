"""Regression coverage for exploration task settings and account boundaries."""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from system_settings.models import Agent, AgentTask, AIModel, AIProvider
from utils.drf_utils import get_current_user_identifier
from ..builtin_tasks import EXPLORATION_NAME
from ..life_config import DEFAULTS
from ..life_models import LifeConfig
from .schedule import ensure_task


class ExplorationTaskApiTests(TestCase):
    url = '/api/settings/agent-tasks/'

    def setUp(self):
        temporary = TemporaryDirectory(prefix='combat-task-tests-')
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        override = override_settings(MEDIA_ROOT=root / 'media', ODOC_WORLD_LOCK_PATH=str(root / 'world.lock'))
        override.enable()
        self.addCleanup(override.disable)
        self.users = [User.objects.create_user(name) for name in ('explorer-a', 'explorer-b')]
        self.owners = [get_current_user_identifier(SimpleNamespace(user=user)) for user in self.users]
        provider = AIProvider.objects.create(name='fixture', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='fixture', type='chat', provider=provider)
        self.agents = [Agent.objects.create(name=name, model=model) for name in ('探险者甲', '探险者乙')]
        for owner, agent in zip(self.owners, self.agents):
            LifeConfig.objects.create(pk=owner, settings={**DEFAULTS, 'agent_ids':[agent.pk]}, migrated=True)
        self.client = APIClient()
        self.client.force_authenticate(self.users[0])

    def payload(self, index=0):
        return {'taskKind':'exploration', 'name':'客户端名称', 'agent':self.agents[index].pk,
                'agents':[self.agents[index].pk], 'explorationConfig':{'ownerId':'forged-owner'}}

    def test_create_is_owner_scoped_disabled_and_idempotent(self):
        response = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(response.status_code, 200)
        identity = response.json()['data']['id']
        task = AgentTask.objects.get(pk=identity)
        self.assertEqual(task.name, EXPLORATION_NAME)
        self.assertEqual(task.exploration_config, {'owner_id':self.owners[0]})
        self.assertFalse(task.enabled)
        self.assertEqual(task.execution_mode, 'serial')
        repeated = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json()['data']['id'], identity)
        self.client.force_authenticate(self.users[1])
        other = self.client.post(self.url, self.payload(1), format='json')
        self.assertEqual(other.status_code, 200)
        self.assertNotEqual(other.json()['data']['id'], identity)
        self.assertEqual(AgentTask.objects.filter(task_kind='exploration').count(), 2)
        task.refresh_from_db()
        self.assertEqual(task.exploration_config, {'owner_id':self.owners[0]})

    def test_edit_automatically_created_task_and_toggle_enabled(self):
        task = ensure_task(self.owners[0])
        url = f'{self.url}{task.pk}/'
        for enabled in (False, True, True):
            response = self.client.patch(url, {'enabled':enabled, 'name':'自定义名称',
                                               'explorationConfig':{'ownerId':self.owners[1]},
                                               'intervalMinutes':45}, format='json')
            self.assertEqual(response.status_code, 200)
            data = response.json()['data']
            self.assertEqual(data['name'], EXPLORATION_NAME)
            self.assertEqual(data['explorationConfig']['ownerId'], self.owners[0])
            self.assertEqual(data['enabled'], enabled)
            task.refresh_from_db()
            self.assertEqual(task.interval_minutes, 45)

    def test_other_account_cannot_list_read_modify_delete_or_run_task(self):
        tasks = [ensure_task(owner) for owner in self.owners]
        ownerless = AgentTask.objects.create(name='缺少归属', task_kind='exploration', agent=self.agents[0])
        for index, user in enumerate(self.users):
            self.client.force_authenticate(user)
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, 200)
            identities = {row['id'] for row in response.json()['data']}
            self.assertIn(tasks[index].pk, identities)
            self.assertNotIn(tasks[1-index].pk, identities)
            self.assertNotIn(ownerless.pk, identities)
            self.assertEqual(self.client.get(f'{self.url}{tasks[index].pk}/').status_code, 200)
            foreign = f'{self.url}{tasks[1-index].pk}/'
            self.assertEqual(self.client.get(foreign).status_code, 404)
            self.assertEqual(self.client.patch(foreign, {'enabled':False}, format='json').status_code, 404)
            self.assertEqual(self.client.put(foreign, self.payload(index), format='json').status_code, 404)
            self.assertEqual(self.client.delete(foreign).status_code, 404)
            self.assertEqual(self.client.post(f'{foreign}run_now/', {'actorId':self.agents[1-index].pk}, format='json').status_code, 404)
        for task in tasks:
            task.refresh_from_db()
            self.assertTrue(task.enabled)

    def test_builtin_delete_is_rejected_and_custom_delete_still_works(self):
        task = ensure_task(self.owners[0])
        for _ in range(2):
            response = self.client.delete(f'{self.url}{task.pk}/')
            self.assertEqual(response.status_code, 400)
            self.assertIn('内置系统任务不能删除', response.json()['msg'])
            self.assertTrue(AgentTask.objects.filter(pk=task.pk).exists())
        custom = AgentTask.objects.create(name='自定义任务', agent=self.agents[0])
        self.assertEqual(self.client.delete(f'{self.url}{custom.pk}/').status_code, 200)
        self.assertFalse(AgentTask.objects.filter(pk=custom.pk).exists())

"""钓鱼和大乐透能力任务沿用账号隔离及内置任务删除保护。"""
from types import SimpleNamespace

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from system_settings.models import Agent, AgentTask, AIModel, AIProvider
from utils.drf_utils import get_current_user_identifier


class CapabilityTaskPermissionTests(TestCase):
    def setUp(self):
        provider = AIProvider.objects.create(name='权限测试', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='权限测试', type='chat', provider=provider)
        agent = Agent.objects.create(name='权限测试居民', model=model)
        self.users = [User.objects.create_user(name) for name in ('capability-owner', 'capability-other')]
        self.tasks = {}
        for user in self.users:
            owner = get_current_user_identifier(SimpleNamespace(user=user))
            self.tasks[user.pk] = [
                AgentTask.objects.create(name=kind, agent=agent, task_kind=kind,
                    **{kind + '_config': {'owner_id': owner}})
                for kind in ('fishing', 'lottery')
            ]
        self.client = APIClient()

    def test_list_and_detail_only_expose_the_current_owners_tasks(self):
        for user in self.users:
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                response = self.client.get('/api/settings/agent-tasks/')
                self.assertEqual(response.status_code, 200)
                self.assertEqual({row['id'] for row in response.data['data']},
                                 {task.pk for task in self.tasks[user.pk]})
                for owner, tasks in self.tasks.items():
                    for task in tasks:
                        detail = self.client.get(f'/api/settings/agent-tasks/{task.pk}/')
                        self.assertEqual(detail.status_code, 200 if owner == user.pk else 404)

    def test_other_account_cannot_update_or_delete_capability_tasks(self):
        self.client.force_authenticate(self.users[1])
        for task in self.tasks[self.users[0].pk]:
            with self.subTest(kind=task.task_kind):
                path = f'/api/settings/agent-tasks/{task.pk}/'
                self.assertEqual(self.client.patch(path, {'name': '越权修改'}, format='json').status_code, 404)
                self.assertEqual(self.client.delete(path).status_code, 404)
                task.refresh_from_db()
                self.assertEqual(task.name, task.task_kind)

    def test_owner_cannot_delete_builtin_capability_tasks(self):
        self.client.force_authenticate(self.users[0])
        for task in self.tasks[self.users[0].pk]:
            with self.subTest(kind=task.task_kind):
                response = self.client.delete(f'/api/settings/agent-tasks/{task.pk}/')
                self.assertEqual(response.status_code, 400)
                self.assertTrue(AgentTask.objects.filter(pk=task.pk).exists())

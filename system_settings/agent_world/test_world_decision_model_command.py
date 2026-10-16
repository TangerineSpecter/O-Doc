"""Safe, deterministic checks for the live world decision comparison command."""
from datetime import datetime
from io import StringIO
from unittest.mock import Mock, patch

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.test.utils import CaptureQueriesContext

from system_settings.models import Agent, AgentTask, AIProvider, AIModel
from system_settings.agent_world.life_models import LifeProfile, LifeConfig
from system_settings.agent_world.farm_models import AgentFarm, FarmCatalog
from system_settings.agent_world.market_models import MarketBatch, MarketConfig
from system_settings.agent_world.life_proposal_context import readonly_proposal_context
from system_settings.agent_world.life_plan_proposal import propose
from system_settings.management.commands.test_world_decision_models import TEST_SLOT_ID, comparison_context


class WorldDecisionModelComparisonTests(SimpleTestCase):
    def test_comparison_limits_each_model_to_a_shared_free_slot(self):
        source = {
            'activities': [
                {'kind': 'post_interaction', 'task_id': 'social'},
                {'kind': 'travel', 'task_id': 'travel'},
                {'kind': 'post_publish', 'task_id': 'publish'},
            ],
            'slots': [{'id': 'real-life-slot'}],
        }
        scheduled_at = datetime(2026, 10, 13, 15, 0)

        result = comparison_context(source, scheduled_at)

        self.assertEqual(
            [activity['kind'] for activity in result['activities']],
            ['post_interaction', 'post_publish'],
        )
        self.assertEqual(result['slots'], [{
            'id': TEST_SLOT_ID,
            'time': scheduled_at.isoformat(),
            'current_activity': 'unplanned',
            'spent': '0.00',
        }])
        self.assertEqual(source['slots'], [{'id': 'real-life-slot'}])

    def test_life_proposal_validates_the_live_model_choice_without_applying_it(self):
        context = comparison_context({
            'activities': [{'kind': 'post_interaction', 'task_id': 'social'}],
        }, datetime(2026, 10, 13, 15, 0))
        ask = Mock(return_value={
            'plans': [{
                'id': TEST_SLOT_ID,
                'activity': 'post_interaction',
                'reason': '看看居民动态并参与交流。',
            }],
        })

        result = propose(object(), context, ask)

        self.assertEqual(ask.call_count, 1)
        self.assertEqual(result['plans'][0]['activity'], 'post_interaction')
        self.assertEqual(result['plans'][0]['budget'], '0.00')


class ReadonlyComparisonContextTests(TestCase):
    def setUp(self):
        self.agent = Agent.objects.create(name='只读居民', prompt='热爱交流')
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='test-owner', preferences='聊天', direction='结识朋友')
        LifeConfig.objects.create(pk='test-owner')
        AgentTask.objects.create(name='帖子互动', agent=self.agent, task_kind='post_interaction', enabled=True,
                                 world_state={'owner_id': 'test-owner'})

    def test_projection_never_initializes_missing_market_or_catalog_with_or_without_farm(self):
        for has_farm in (False, True):
            if has_farm:
                AgentFarm.objects.create(pk=self.agent.pk, owner_id='test-owner', state={'plots': []})
            with CaptureQueriesContext(connection) as queries:
                context = readonly_proposal_context('test-owner', self.agent)
            self.assertEqual(context['actor_id'], self.agent.pk)
            self.assertEqual(context['preferences'], '聊天')
            self.assertFalse(any(query['sql'].lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')) for query in queries))
            self.assertEqual((MarketBatch.objects.count(), MarketConfig.objects.count(), FarmCatalog.objects.count()), (0,0,0))

    def test_command_uses_readonly_projection_and_real_proposal_validation_with_fake_provider(self):
        provider = AIProvider.objects.create(name='fake', type='custom', base_url='https://example.invalid', api_key='test-only')
        model = AIModel.objects.create(name='fake-chat', provider=provider, type='chat')
        with patch('system_settings.agent_world.life_planner.ask', return_value={'plans':[
                {'id':TEST_SLOT_ID,'activity':'post_interaction','reason':'看看居民动态'}]}) as ask:
            with CaptureQueriesContext(connection) as queries:
                call_command('test_world_decision_models', agent_id=self.agent.pk, models=model.pk, stdout=StringIO())
        self.assertEqual(ask.call_count,1)
        self.assertNotIn('role', ask.call_args.args[2])
        self.assertEqual(ask.call_args.args[0].prompt, self.agent.prompt)
        self.assertFalse(any(query['sql'].lstrip().upper().startswith(('INSERT','UPDATE','DELETE')) for query in queries))
        self.assertEqual((MarketBatch.objects.count(), MarketConfig.objects.count(), FarmCatalog.objects.count()), (0,0,0))

"""悬赏看板的服务层回归测试。"""
import random
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article
from system_settings.models import (Agent, AgentRunRecord, SyncEntityState, WorldAction,
                                    WorldLedger)

from . import bounty_service
from .bounty_models import Bounty
from .bounty_service import accept, create, deliver, release_expired, review, weighted_order
from .life_models import LifeGoal, LifeProfile
from .models import WorldCategory


class BountyServiceTests(TestCase):
    def setUp(self):
        self.owner = 'owner-bounty'
        self.collection = Anthology.objects.create(coll_id='coll-bounty', title='悬赏文集', type='agent',
                                                   user_id=self.owner)
        self.category = WorldCategory.objects.create(name='感情', enabled=True, workflow_kind='general')
        self.agents = []
        for index, money in enumerate(['0', '100', '10000']):
            agent = Agent.objects.create(name=f'居民{index}', money=Decimal(money))
            LifeProfile.objects.create(pk=agent.pk, owner_id=self.owner)
            self.agents.append(agent)
        search = patch.object(bounty_service, 'default_search_server', return_value='')
        search.start()
        self.addCleanup(search.stop)

    def create_bounty(self, **values):
        return create(self.owner, {
            'title': '调研 last meeting theory', 'objective': '调研理论并发布一篇感情分类帖子',
            'requirements': '正文包含调研结论和感想', 'collectionId': self.collection.pk,
            'categoryId': self.category.pk, 'reward': '50', **values,
        })

    def post_bounty(self, bounty, action):
        user, _ = User.objects.get_or_create(username='bounty-reviewer')
        client = APIClient()
        client.force_authenticate(user)
        with patch('system_settings.agent_world.bounty_views.owner_of', return_value=self.owner):
            return client.post(f'/api/settings/agent-world/bounties/{bounty.pk}/',
                               {'action': action}, format='json')

    def test_first_execution_reaches_delivery_with_fake_model_and_search(self):
        from .bounty_runner import _execute
        from .execution import stamina
        bounty = self.create_bounty()
        agent = self.agents[0]
        accept(bounty, agent)
        bounty.refresh_from_db()
        source = {'url': 'https://example.invalid/research', 'title': '调研资料', 'summary': '测试素材'}
        replies = iter([
            {'category_id': self.category.pk, 'mode': 'topic', 'query': 'last meeting theory',
             'reason': '研究用户指定主题'},
            {'sufficient': True, 'primary_source': True, 'verification_query': '', 'reason': '资料足够'},
            {'title': '关于最后一次相遇的调研', 'summary': '调研结果', 'content': '## 调研结论\n测试资料说明。\n## 我的感想\n值得珍惜每次相遇。',
             'source_urls': [source['url']], 'main_source_url': source['url'],
             'evidence_sufficient': True, 'reason': '引用真实检索资料'},
        ])

        def complete(agent, prompt, validate, **kwargs):
            return validate(next(replies))

        with patch('system_settings.agent_world.bounty_workflow.search_servers', return_value=[]), \
                patch('system_settings.agent_world.publish_workflow.search', return_value=[source]) as search, \
                patch('system_settings.agent_world.memory.recall.memory_context', return_value=''), \
                patch('system_settings.decision.routing.complete_json', side_effect=complete) as model:
            _execute(bounty, agent)
        bounty.refresh_from_db()
        self.assertEqual(bounty.status, 'delivered', bounty.last_error)
        self.assertEqual(bounty.article.coll_id, self.collection.pk)
        self.assertEqual(bounty.article.agent_post_author_id, agent.pk)
        self.assertEqual(bounty.deliveries.count(), 1)
        self.assertEqual(model.call_count, 3)
        search.assert_called_once()
        action = WorldAction.objects.get(result__bounty_id=bounty.pk)
        self.assertEqual(action.record.status, 'success')
        self.assertEqual(action.energy_cost, Decimal('20'))
        self.assertAlmostEqual(float(stamina(agent)), 80, places=1)

    def test_workflow_initializes_empty_and_partial_snapshots_and_preserves_progress(self):
        from .bounty_workflow import BountyTaskAdapter, BountyWorkflow
        bounty = self.create_bounty()
        with patch('system_settings.agent_world.bounty_workflow.search_servers', return_value=[]):
            adapter = BountyTaskAdapter(bounty)
        for snapshot in (None, {'phase': 'select'}):
            flow = BountyWorkflow(adapter, self.agents[0], snapshot)
            self.assertEqual(flow.state['config'], adapter.publish_config)
            self.assertEqual(flow.state['materials'], [])
            self.assertEqual(flow.state['search_count'], 0)
        saved = {'phase': 'verify', 'search_count': 1, 'materials': [{'url': 'https://example.invalid'}],
                 'config': {**adapter.publish_config, 'search_server_id': 'saved-server'}}
        flow = BountyWorkflow(adapter, self.agents[0], saved)
        self.assertEqual(flow.state['phase'], 'verify')
        self.assertEqual(flow.state['materials'], saved['materials'])
        self.assertEqual(flow.state['config'], saved['config'])
        self.assertEqual(flow.state['search_count'], 1)

    def test_exhausted_bounties_do_not_starve_later_invites(self):
        from .bounty_runner import process_invites
        now = timezone.now()
        for _ in range(10):
            old = self.create_bounty()
            Bounty.objects.filter(pk=old.pk).update(invite_at=now - timedelta(hours=1))
            old.invites.update(status='declined')
        later = self.create_bounty()
        Bounty.objects.filter(pk=later.pk).update(invite_at=now)
        later.invites.update(scheduled_at=now)
        with patch('system_settings.agent_world.bounty_runner.ask_accept',
                   return_value=(False, {'reason': '暂不领取'})) as ask:
            process_invites(now)
        ask.assert_called_once()
        self.assertEqual(ask.call_args.args[1].pk, later.pk)
        self.assertEqual(later.invites.filter(status='declined').count(), 1)
        self.assertEqual(later.invites.filter(status='pending').count(), 2)

    def test_timeout_reinvites_only_original_candidates_still_available(self):
        first, second, _ = self.agents
        bounty = self.create_bounty(agentIds=[first.pk, second.pk])
        accept(bounty, first)
        second.archived_at = timezone.now()
        second.save(update_fields=['archived_at'])
        Bounty.objects.filter(pk=bounty.pk).update(expire_at=timezone.now() - timedelta(seconds=1))
        release_expired()
        bounty.refresh_from_db()
        self.assertEqual(bounty.status, 'open')
        self.assertEqual(list(bounty.invites.filter(status='pending').values_list('agent_id', flat=True)), [first.pk])

    def test_manual_reinvite_preserves_original_candidates(self):
        agent = self.agents[0]
        bounty = self.create_bounty(agentIds=[agent.pk])
        bounty.invites.update(status='declined')
        response = self.post_bounty(bounty, 'reinvite')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(bounty.invites.filter(status='pending').values_list('agent_id', flat=True)), [agent.pk])

    def test_run_now_recreates_exhausted_invites_and_keeps_existing_pending_order(self):
        from .bounty_runner import process_invites
        agent = self.agents[0]
        bounty = self.create_bounty(agentIds=[agent.pk])
        bounty.invites.update(status='declined')
        self.assertEqual(self.post_bounty(bounty, 'run-now').status_code, 200)
        pending = bounty.invites.get(status='pending')
        self.assertLessEqual(pending.scheduled_at, timezone.now())
        self.assertEqual(pending.agent_id, agent.pk)
        self.assertEqual(self.post_bounty(bounty, 'run-now').status_code, 200)
        self.assertEqual(bounty.invites.get(status='pending').pk, pending.pk)
        with patch('system_settings.agent_world.bounty_runner.ask_accept',
                   return_value=(True, {'reason': '愿意领取'})) as ask:
            process_invites()
        ask.assert_called_once()
        bounty.refresh_from_db()
        self.assertEqual(bounty.status, 'claimed')

    def test_reinvite_with_no_original_candidates_returns_validation_error(self):
        bounty = self.create_bounty(agentIds=[self.agents[0].pk])
        self.agents[0].delete()
        for action in ('reinvite', 'run-now'):
            bounty.invites.update(status='declined')
            self.assertEqual(self.post_bounty(bounty, action).status_code, 400)
        self.assertFalse(bounty.invites.filter(status='pending').exists())

    def test_weighted_order_favours_poorest(self):
        random.seed(7)
        firsts = {agent.pk: 0 for agent in self.agents}
        for _ in range(120):
            firsts[weighted_order(self.agents)[0].pk] += 1
        poorest, middle, richest = self.agents
        self.assertGreater(firsts[poorest.pk], firsts[richest.pk])
        self.assertGreater(firsts[middle.pk], firsts[richest.pk])

    def test_create_schedules_invites_ten_minutes_later(self):
        bounty = self.create_bounty()
        self.assertEqual(bounty.status, 'open')
        self.assertEqual(bounty.invites.count(), 3)
        self.assertGreater(bounty.invite_at, bounty.created_at)
        self.assertEqual([row.sort for row in bounty.invites.order_by('sort')], [0, 1, 2])

    def test_accept_is_exclusive_and_creates_goal(self):
        bounty = self.create_bounty()
        first, second = self.agents[0], self.agents[1]
        self.assertTrue(accept(bounty, first, {'reason': '有空'}))
        self.assertFalse(accept(bounty, second, {}))
        bounty.refresh_from_db()
        self.assertEqual(bounty.status, 'claimed')
        self.assertEqual(bounty.agent_id, first.pk)
        self.assertEqual(bounty.invites.filter(status='pending').count(), 0)
        goal = LifeGoal.objects.get(pk=f'goal_{bounty.pk}')
        self.assertEqual(goal.status, 'active')
        self.assertEqual(goal.condition['kind'], 'bounty')

    def test_workflow_adapter_fixes_collection_and_topic(self):
        from .bounty_workflow import BountyTaskAdapter
        bounty = self.create_bounty()
        adapter = BountyTaskAdapter(bounty)
        self.assertEqual(adapter.publish_config['collection_id'], self.collection.pk)
        self.assertEqual(adapter.publish_config['rules'][0]['category_id'], self.category.pk)
        self.assertEqual(adapter.publish_config['rules'][0]['modes'], ['topic'])
        self.assertIn('调研理论', adapter.prompt)
        self.assertEqual(adapter.task_kind, 'bounty')

    def test_detail_payload_lists_invites_and_deliveries(self):
        bounty = self.create_bounty()
        accept(bounty, self.agents[0])
        detail = bounty_service.bounty_data(Bounty.objects.get(pk=bounty.pk), detail=True)
        self.assertEqual(detail['status'], 'claimed')
        self.assertEqual(detail['collectionTitle'], '悬赏文集')
        self.assertEqual(detail['categoryName'], '感情')
        self.assertEqual(len(detail['invites']), 3)
        self.assertEqual(detail['deliveries'], [])

    def test_cancelled_bounty_can_be_deleted_and_other_states_rejected(self):
        from .bounty_models import BountyInvite

        bounty = self.create_bounty()
        self.assertEqual(self.post_bounty(bounty, 'delete').status_code, 400)
        self.assertTrue(Bounty.objects.filter(pk=bounty.pk).exists())
        self.assertEqual(self.post_bounty(bounty, 'cancel').status_code, 200)
        self.assertEqual(self.post_bounty(bounty, 'delete').status_code, 200)
        self.assertFalse(Bounty.objects.filter(pk=bounty.pk).exists())
        self.assertFalse(BountyInvite.objects.filter(bounty_id=bounty.pk).exists())
        # 硬删除必须留下永久删除墓碑，否则三方合并会把记录复活。
        tombstone = SyncEntityState.objects.get(model_label='system_settings.bounty', object_pk=bounty.pk)
        self.assertTrue(tombstone.is_deleted)
        self.assertTrue(tombstone.content_hash.startswith('!'))

    def test_reopen_clears_previous_rejection_before_new_claim(self):
        bounty = self.create_bounty()
        first, second = self.agents[0], self.agents[1]
        accept(bounty, first)
        bounty.refresh_from_db()
        deliver(bounty.pk, first, self.article(first))
        review(self.owner, bounty.pk, False, '引用不足')
        bounty.refresh_from_db()
        self.assertEqual(bounty.reject_reason, '引用不足')
        Bounty.objects.filter(pk=bounty.pk).update(expire_at=timezone.now() - timedelta(seconds=1))
        release_expired()
        bounty.refresh_from_db()
        self.assertEqual(bounty.status, 'open')
        self.assertEqual(bounty.reject_reason, '')
        self.assertIsNone(bounty.article)
        self.assertTrue(accept(bounty, second))
        bounty.refresh_from_db()
        self.assertEqual(bounty.agent_id, second.pk)

    def test_delivery_resets_failure_streak(self):
        bounty = self.create_bounty()
        agent = self.agents[0]
        accept(bounty, agent)
        Bounty.objects.filter(pk=bounty.pk).update(failures=2)
        bounty.refresh_from_db()
        deliver(bounty.pk, agent, self.article(agent))
        bounty.refresh_from_db()
        self.assertEqual(bounty.failures, 0)

    def test_repair_effects_skips_bounty_delivery(self):
        from .action_runner import repair_effects
        bounty = self.create_bounty()
        agent = self.agents[0]
        article = self.article(agent)
        record = AgentRunRecord.objects.create(task_name='悬赏：回归', agent=agent, status='success')
        action = WorldAction.objects.create(pk='bounty-action', agent=agent, actor_id=agent.pk,
                                            record=record, status='success', effects_done=False,
                                            snapshot={'bounty': True, 'phase': 'delivered'},
                                            result={'reason': '已交付', 'post_id': article.pk,
                                                    'bounty_id': bounty.pk})
        repair_effects(action)
        action.refresh_from_db()
        self.assertTrue(action.effects_done)
        record.refresh_from_db()
        self.assertEqual(record.summary, '')

    def article(self, agent, title='调研结论'):
        return Article.objects.create(title=title, content='正文', coll_id=self.collection.pk,
                                      author=self.owner, agent_post_author_id=agent.pk,
                                      agent_post_category=self.category.name,
                                      agent_post_category_ref=self.category)

    def test_reject_returns_to_work_and_accept_pays_once(self):
        bounty = self.create_bounty()
        agent = self.agents[0]
        accept(bounty, agent)
        bounty.refresh_from_db()
        deliver(bounty.pk, agent, self.article(agent))
        review(self.owner, bounty.pk, False, '论证不够')
        bounty.refresh_from_db()
        self.assertEqual(bounty.status, 'claimed')
        self.assertEqual(bounty.attempt, 1)
        self.assertEqual(bounty.reject_reason, '论证不够')
        goal = LifeGoal.objects.get(pk=f'goal_{bounty.pk}')
        self.assertIn('论证不够', goal.progress)

        deliver(bounty.pk, agent, self.article(agent, '第二版'))
        review(self.owner, bounty.pk, True, '通过')
        bounty.refresh_from_db()
        self.assertEqual(bounty.status, 'accepted')
        self.assertEqual(WorldLedger.objects.filter(pk=f'bounty:{bounty.pk}:{agent.pk}').count(), 1)
        agent.refresh_from_db()
        self.assertEqual(agent.money, Decimal('50.00'))
        self.assertEqual(LifeGoal.objects.get(pk=f'goal_{bounty.pk}').status, 'completed')
        with self.assertRaises(ValueError):
            review(self.owner, bounty.pk, True, '重复点击')
        self.assertEqual(Bounty.objects.get(pk=bounty.pk).status, 'accepted')

"""Staged publishing projections; no database, providers or search services."""
import copy
import json
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from .publish_image_prompt import build_prompt
from .publish_workflow import Workflow, SkipPublication, rule_for_context


class StopAfterProjection(RuntimeError):
    pass


class PublishingSelectionTests(SimpleTestCase):
    def setUp(self):
        self.categories = {
            f'category-{index}': SimpleNamespace(pk=f'category-{index}', name=f'分类{index}',
                description=f'完整分类说明{index}：' + '说明' * 1000)
            for index in range(100)
        }
        self.rules = [{
            'category_id': key, 'modes': ['news', 'topic'], 'region': '全球', 'news_days': 3,
            'topics': f'完整关注要求{index}：' + '关' * 1900,
            'excluded_topics': f'完整排除要求{index}：' + '排' * 1900,
            'image_prompt': f'完整画面要求{index}：' + '图' * 1900,
            'image_enabled': True, 'image_model_id': 'image-model', 'image_subject': 'scene',
        } for index, key in enumerate(self.categories)]
        self.task = SimpleNamespace(pk='publish-task', prompt='完整任务要求',
            publish_config={'owner_id': 'owner', 'rules': self.rules})
        self.agent = SimpleNamespace(pk='actor', name='居民', prompt='', profession=None)
        self.enterContext(patch('system_settings.agent_world.publish_workflow.writing_context',
                                return_value={'recent_posts': []}))
        self.enterContext(patch('system_settings.agent_world.publish_workflow.categories_for',
                                return_value=list(self.categories.values())))
        self.enterContext(patch('system_settings.agent_availability.require_active_agent', return_value=self.agent))
        self.choose = self.enterContext(patch('system_settings.decision.routing.choose_scene', return_value='category-37'))
        bounty_posts = self.enterContext(patch('system_settings.agent_world.bounty_workflow.own_posts'))
        bounty_posts.return_value.filter.return_value.order_by.return_value.values.return_value = []

    def topic_projection(self, flow):
        captured = {}
        def stop(instruction, context, validate):
            captured.update(context)
            raise StopAfterProjection()
        with patch.object(flow, 'ask', side_effect=stop):
            with self.assertRaises(StopAfterProjection):
                flow.run()
        return captured

    def test_hundred_categories_only_send_minimal_direction_candidates(self):
        original = copy.deepcopy(self.task.publish_config)
        saved = []
        flow = Workflow(self.task, self.agent, save=lambda value: saved.append(copy.deepcopy(value)))
        context = self.topic_projection(flow)
        self.choose.assert_called_once()
        self.assertEqual(self.choose.call_args.args[2], 'publish_category')
        choices = self.choose.call_args.args[4]
        self.assertEqual(len(choices), 100)
        for row in choices.values():
            self.assertEqual(set(row), {'id', 'name', 'modes', 'region', 'news_days'})
        projected = json.dumps(self.choose.call_args.args[3:5], ensure_ascii=False)
        for marker in ('完整关注要求', '完整排除要求', '完整画面要求', '完整分类说明', 'image_'):
            self.assertNotIn(marker, projected)
        self.assertEqual(set(context) - {'category'}, {'recent_posts', 'profession', 'extra', 'now'})
        self.assertEqual(context['category']['id'], 'category-37')
        rule = context['category']['rule']
        self.assertEqual(rule['topics'], self.rules[37]['topics'])
        self.assertEqual(rule['excluded_topics'], self.rules[37]['excluded_topics'])
        self.assertEqual(context['category']['description'], self.categories['category-37'].description)
        self.assertNotIn('完整关注要求36', json.dumps(context, ensure_ascii=False))
        self.assertFalse(any(key.startswith('image_') for key in rule))
        self.assertTrue(any(row.get('category_selection', {}).get('category_id') == 'category-37' for row in saved))
        self.assertEqual(self.task.publish_config, original)

    def test_topic_failure_restore_keeps_confirmed_category(self):
        first = Workflow(self.task, self.agent)
        self.topic_projection(first)
        restored = Workflow(self.task, self.agent, copy.deepcopy(first.state))
        self.choose.reset_mock()
        context = self.topic_projection(restored)
        self.choose.assert_not_called()
        self.assertEqual(context['category']['id'], 'category-37')

    def test_fixed_manual_category_does_not_ask_a_category_question(self):
        flow = Workflow(self.task, self.agent)
        flow.state['manual_category_id'] = 'category-21'
        context = self.topic_projection(flow)
        self.choose.assert_not_called()
        self.assertEqual(context['category']['id'], 'category-21')

    def test_single_legal_category_is_selected_by_code(self):
        self.task.publish_config['rules'] = [self.rules[4]]
        flow = Workflow(self.task, self.agent)
        context = self.topic_projection(flow)
        self.choose.assert_not_called()
        self.assertEqual(context['category']['id'], 'category-4')

    def test_connection_failure_never_falls_back_to_text_category_selection(self):
        from system_settings.decision.jev import DecisionUnavailable
        self.choose.return_value = None
        flow = Workflow(self.task, self.agent)
        with patch.object(flow, 'ask') as text:
            with self.assertRaisesMessage(DecisionUnavailable, '不调用普通文本模型替代'):
                flow.run()
        text.assert_not_called()
        self.assertEqual(flow.state['phase'], 'category')
        self.assertNotIn('category_selection', flow.state)

    def test_confirmed_category_cannot_change_during_topic_generation(self):
        flow = Workflow(self.task, self.agent)
        def change(instruction, context, validate):
            return validate({'category_id': 'category-12', 'mode': 'topic', 'query': '关键词', 'reason': '理由'})
        with patch.object(flow, 'ask', side_effect=change):
            with self.assertRaisesMessage(ValueError, '分类或内容方式越界'):
                flow.run()
        self.assertEqual(flow.state['category_selection']['category_id'], 'category-37')

    def test_removed_confirmed_category_is_not_redrawn(self):
        flow = Workflow(self.task, self.agent)
        flow.state['category_selection'] = {'category_id': 'removed'}
        with self.assertRaisesMessage(SkipPublication, '已确认发帖分类已失效'):
            flow.run()
        self.choose.assert_not_called()

    def test_legacy_selection_resumes_without_new_category_or_topic_question(self):
        flow = Workflow(self.task, self.agent)
        flow.state['selection'] = {'category_id': 'category-11', 'mode': 'topic', 'query': '关键词', 'reason': '理由'}
        with patch.object(flow, 'ask') as ask, patch('system_settings.agent_world.publish_workflow.search', side_effect=StopAfterProjection):
            with self.assertRaises(StopAfterProjection):
                flow.run()
        self.choose.assert_not_called(); ask.assert_not_called()
        self.assertEqual(flow.state['category_selection']['category_id'], 'category-11')

    def test_image_requirements_only_remain_available_to_image_stage(self):
        rule = copy.deepcopy(self.rules[37])
        for mode in (None, 'news', 'topic'):
            context = rule_for_context(rule, mode)
            self.assertFalse(any(key.startswith('image_') for key in context))
            self.assertEqual(context['topics'], rule['topics'])
            self.assertEqual(context['excluded_topics'], rule['excluded_topics'])
        prompt, _ = build_prompt(SimpleNamespace(title='标题', content='正文'), rule, {})
        self.assertIn(rule['image_prompt'], prompt)
        self.assertEqual(rule, self.rules[37])

    def test_bounty_fixed_category_uses_original_query_and_resumes_it(self):
        from .bounty_workflow import BountyTaskAdapter, BountyWorkflow
        bounty = SimpleNamespace(pk='bounty', title='研究', objective='完整调研目标', requirements='完整交付要求',
            reject_reason='', owner_id='owner', collection_id='collection', category_id='category-9')
        with patch('system_settings.agent_world.bounty_workflow.search_servers', return_value=[]):
            adapter = BountyTaskAdapter(bounty)
        selection = {'category_id': bounty.category_id, 'mode': 'topic', 'query': '研究 关键词', 'reason': '理由'}
        flow = BountyWorkflow(adapter, self.agent)
        def select(instruction, context, validate):
            self.assertEqual(context['requirements'], '完整交付要求')
            return validate(selection)
        with patch('system_settings.agent_world.publish_workflow.search', side_effect=StopAfterProjection), \
             patch.object(flow, 'ask', side_effect=select) as first:
            with self.assertRaises(StopAfterProjection):
                flow.run()
        first.assert_called_once(); self.choose.assert_not_called()
        restored = BountyWorkflow(adapter, self.agent, copy.deepcopy(flow.state))
        # A durable search checkpoint without materials ends rather than replaying.
        with patch.object(restored, 'ask') as second:
            with self.assertRaisesMessage(SkipPublication, '中断的搜索缺少可靠素材'):
                restored.run()
        second.assert_not_called(); self.choose.assert_not_called()
        self.assertEqual(restored.state['selection'], {**selection, 'expression_direction': ''})

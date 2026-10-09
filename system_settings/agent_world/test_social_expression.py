"""社交背景与历史表达隔离，不调用真实模型。"""
from copy import deepcopy
import json
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase
from .social_context import social_life_context
from .social_prompt import AUTO_COMMENT_MAX_LENGTH


class SocialLifeContextTests(SimpleTestCase):
    def test_facts_keep_dates_and_status_without_planning_or_old_drafts(self):
        life = {
            'role': '活泼，想到什么就说什么',
            'inventory': [{'name': '萝卜', 'quantity': 2}],
            'today': [{'status': 'failed', 'result': {'reason': '没有买到种子'}}],
            'recent_experiences': [{'created_at': '2026-10-04T08:00:00Z',
                                    'status': 'success', 'summary': '读了一条帖子'}],
            'upcoming': [{'intent': '明天去旅行'}],
            'activities': [{'kind': 'farm', 'preference': '每次详细总结'}],
            'farm_prices': {'land': [100]}, 'rules': '预算规则',
            'recent_social': [{'id': 'old', 'created_at': '2026-10-04T09:00:00Z',
                               'result': {'action': 'publish', 'content': '旧正文' * 100,
                                          'reason': '逐项汇报生活', 'image_prompt': '旧配图'}}],
        }
        before = deepcopy(life)
        result = social_life_context(life)
        self.assertEqual(life, before)
        for key in ('role', 'inventory', 'today', 'recent_experiences'):
            self.assertEqual(result[key], life[key])
        for key in ('upcoming', 'activities', 'farm_prices', 'rules'):
            self.assertNotIn(key, result)
        history = result['recent_social'][0]
        self.assertEqual(history, {'id': 'old', 'created_at': '2026-10-04T09:00:00Z',
                                  'action': 'publish', 'content_excerpt': ('旧正文' * 100)[:240]})

    def test_rest_and_empty_history_do_not_invent_shareable_content(self):
        self.assertEqual(social_life_context({}), {'recent_social': []})
        result = social_life_context({'recent_social': [
            {'id': 'rest', 'created_at': '2026-10-09T08:00:00Z',
             'result': {'action': 'rest', 'reason': '没有什么想说的'}}]})
        self.assertEqual(result['recent_social'][0]['content_excerpt'], '')
        self.assertEqual(result['recent_social'][0]['action'], 'rest')


class AutoCommentLengthTests(SimpleTestCase):
    def setUp(self):
        self.agent = SimpleNamespace(pk='actor', name='角色', model_id='model',
                                     prompt='活泼直率。ENFP倾向：好奇，容易兴奋。')
        self.post = SimpleNamespace(content='南瓜燕麦粥', title='早餐')
        self.task = SimpleNamespace(prompt='')

    def evaluate(self, outputs):
        from .action_runner import evaluate
        with patch('system_settings.agent_world.social_discussion.post_owner', return_value='owner'), \
                patch('system_settings.agent_world.social_discussion.post_author', return_value='author'), \
                patch('system_settings.agent_world.social_relations.context_for', return_value={}), \
                patch('system_settings.agent_world.action_runner.stamina', return_value=100), \
                patch('system_settings.agent_world.action_runner.AIService.chat_completion_messages',
                      side_effect=[json.dumps(value, ensure_ascii=False) for value in outputs]) as complete:
            result = evaluate(self.task, self.agent, self.post)
            messages = complete.call_args.args[0]
            self.assertIn(self.agent.prompt, messages[0]['content'])
            return result, complete.call_count

    def feedback(self, content):
        return {'action': 'interact', 'comment': content, 'stance': 'approve', 'rating': 8}

    def test_long_first_comment_is_rewritten_before_it_can_be_committed(self):
        result, calls = self.evaluate([
            self.feedback('长' * (AUTO_COMMENT_MAX_LENGTH + 1)),
            self.feedback('南瓜直接放进去煮就行吗？'),
        ])
        self.assertEqual(calls, 2)
        self.assertEqual(result['comment'], '南瓜直接放进去煮就行吗？')
        self.assertEqual(result['rating'], 8)

    def test_repeated_essay_is_rejected_instead_of_truncated(self):
        with self.assertRaises(ValueError):
            self.evaluate([self.feedback('长' * (AUTO_COMMENT_MAX_LENGTH + 1))] * 2)

    def test_short_comment_and_rest_are_both_valid(self):
        result, calls = self.evaluate([self.feedback('想吃！')])
        self.assertEqual(result['comment'], '想吃！')
        self.assertEqual(calls, 1)
        result, calls = self.evaluate([{'action': 'rest', 'reason': '没什么想补充的'}])
        self.assertEqual(result['action'], 'rest')
        self.assertEqual(calls, 1)

    def social_decision(self, action, content):
        from .social_runner import decide
        context = {'allowed': [action], 'image_choices': ['none']}
        with patch('system_settings.agent_world.life_planner.ask', return_value={
                'action': action, 'reason': '回应', 'content': content}):
            return decide(self.agent, context)

    def test_reply_and_moment_comment_share_the_short_limit(self):
        for action in ('reply', 'read'):
            with self.subTest(action=action):
                self.assertEqual(self.social_decision(action, '嗯，先吃饭。')['content'], '嗯，先吃饭。')
                with self.assertRaises(ValueError):
                    self.social_decision(action, '长' * (AUTO_COMMENT_MAX_LENGTH + 1))

    def test_publishing_keeps_its_own_length_limit(self):
        content = '正文' * 400
        self.assertEqual(self.social_decision('publish', content)['content'], content)

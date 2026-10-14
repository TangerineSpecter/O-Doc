"""社交背景与历史表达隔离，不调用真实模型。"""
from copy import deepcopy
import json
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase
from .social_context import social_life_context
from .social_prompt import AUTO_COMMENT_MAX_LENGTH, AUTO_REPLY_MAX_LENGTH


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
            'farm_prices': {'land': [100]}, 'farm_queue_rules': {'rule': '按半小时检查种植队列'},
            'rules': '预算规则',
            'recent_social': [{'id': 'old', 'created_at': '2026-10-04T09:00:00Z',
                               'result': {'action': 'publish', 'content': '旧正文' * 100,
                                          'reason': '逐项汇报生活', 'image_prompt': '旧配图'}}],
        }
        before = deepcopy(life)
        result = social_life_context(life)
        self.assertEqual(life, before)
        for key in ('role', 'inventory', 'today', 'recent_experiences'):
            self.assertEqual(result[key], life[key])
        for key in ('upcoming', 'activities', 'farm_prices', 'farm_queue_rules', 'rules'):
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
        for target, value in [('system_settings.decision.routing.candidates', ['model']), ('system_settings.agent_world.social_model.owner_for', 'owner')]:
            mocked = patch(target, return_value=value); mocked.start(); self.addCleanup(mocked.stop)
        active = patch('system_settings.agent_availability.require_active_agent', new=lambda agent: agent)
        active.start(); self.addCleanup(active.stop)
        config = patch('system_settings.decision.routing.AIService.get_client_config_for_model', return_value={})
        config.start(); self.addCleanup(config.stop)
        memory = patch('system_settings.agent_world.memory.recall.memory_context', return_value='')
        memory.start()
        self.addCleanup(memory.stop)
        self.agent = SimpleNamespace(pk='actor', name='角色', model_id='model',
                                     prompt='活泼直率。ENFP倾向：好奇，容易兴奋。')
        self.post = SimpleNamespace(content='南瓜燕麦粥', title='早餐')
        self.task = SimpleNamespace(pk='task', name='评论任务', task_kind='custom', model_id=None, prompt='')

    def evaluate(self, outputs):
        from .action_runner import evaluate
        with patch('system_settings.agent_world.social_discussion.post_owner', return_value='owner'), \
                patch('system_settings.agent_world.social_discussion.post_author', return_value='author'), \
                patch('system_settings.agent_world.social_relations.context_for', return_value={}), \
                patch('system_settings.agent_world.action_runner.stamina', return_value=100), \
                patch('system_settings.decision.routing.complete',
                      side_effect=[json.dumps(value, ensure_ascii=False) for value in outputs]) as complete:
            result = evaluate(self.task, self.agent, self.post)
            prompt = complete.call_args.args[1]
            self.assertIn(self.agent.prompt, prompt)
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

    def test_first_comment_request_keeps_scoring_out_of_daily_comment_voice(self):
        from .action_runner import evaluate
        with patch('system_settings.agent_world.social_discussion.post_owner', return_value='owner'), \
                patch('system_settings.agent_world.social_discussion.post_author', return_value='author'), \
                patch('system_settings.agent_world.social_relations.context_for', return_value={}), \
                patch('system_settings.agent_world.action_runner.stamina', return_value=100), \
                patch('system_settings.decision.routing.complete',
                      return_value=json.dumps(self.feedback('这预测的范围也太宽了。'), ensure_ascii=False)) as complete:
            result = evaluate(self.task, self.agent, self.post)
        prompt = complete.call_args.args[1]
        self.assertIn(self.agent.prompt, prompt)
        for rule in ('像平时上网一样', '通常一两句', '不是文章评审', '判断过程不需要写进评论',
                     '不模仿其中的句式、篇幅和结尾'):
            self.assertIn(rule, prompt)
        self.assertEqual(result['comment'], '这预测的范围也太宽了。')
        self.assertEqual(result['rating'], 8)

    def test_moment_comments_and_replies_receive_the_same_daily_comment_rules(self):
        from .social_runner import decide
        for action in ('read', 'reply'):
            value = {'action': action, 'reason': '接话', 'content': '这预测的范围也太宽了。'}
            if action == 'read': value['moment_id'] = 'm'
            context = {'allowed': [action], 'image_choices': ['none'], 'moments': [{'id': 'm', 'content': '原动态'}] if action == 'read' else [], 'inbox': {'discussion': {'content': '消息'}} if action == 'reply' else None}
            with self.subTest(action=action), patch('system_settings.decision.routing.complete', return_value=json.dumps(value, ensure_ascii=False)) as completion:
                decide(self.agent, context, owner='owner')
                prompt = completion.call_args.args[1]
                self.assertIn('像平时上网一样', prompt)
                self.assertIn('通常一两句', prompt)
                self.assertIn('不是文章评审', prompt)

    def test_content_judgments_preserve_low_mixed_and_high_ratings(self):
        cases = [
            ('disapprove', 1, '这个结论没有依据，我不认同。'),
            ('neutral', 5, '配色挺好，味道说得太少了。'),
            ('approve', 10, '这搭配我喜欢，做法也说清楚了。'),
        ]
        for stance, rating, content in cases:
            with self.subTest(stance=stance, rating=rating):
                feedback = {'action': 'interact', 'comment': content,
                            'stance': stance, 'rating': rating}
                result, calls = self.evaluate([feedback])
                self.assertEqual(result, feedback)
                self.assertEqual(calls, 1)

    def test_invalid_ratings_are_rewritten_without_clamping_to_high_scores(self):
        for rating in (0, 11, True, 7.5):
            with self.subTest(rating=rating):
                invalid = {**self.feedback('没看出这个结论的依据。'), 'rating': rating}
                corrected = {**invalid, 'stance': 'disapprove', 'rating': 3}
                result, calls = self.evaluate([invalid, corrected])
                self.assertEqual(result, corrected)
                self.assertEqual(calls, 2)

    def social_decision(self, action, content):
        from .social_runner import decide
        value = {'action': action, 'reason': '回应', 'content': content}
        if action == 'read': value['moment_id'] = 'm'
        context = {'allowed': [action], 'image_choices': ['none'], 'moments': [{'id':'m','content':'动态'}] if action == 'read' else [], 'inbox': {'discussion': {'content':'消息'}} if action == 'reply' else None}
        with patch('system_settings.decision.routing.complete', return_value=json.dumps(value, ensure_ascii=False)):
            return decide(self.agent, context, owner='owner')

    def test_reply_and_moment_comment_reject_essays(self):
        for action in ('reply', 'read'):
            with self.subTest(action=action):
                self.assertEqual(self.social_decision(action, '嗯，先吃饭。')['content'], '嗯，先吃饭。')
                with self.assertRaises(ValueError): self.social_decision(action, '长' * (AUTO_COMMENT_MAX_LENGTH + 1))

    def test_reply_is_rewritten_for_length_or_paragraphs_without_changing_context(self):
        from .social_runner import decide
        context = {'allowed': ['reply', 'ignore', 'rest', 'publish'], 'image_choices':['none'],
            'inbox': {'discussion': {'source':'种子明天给你。','content':'原帖背景','entries':[]}}}
        before = deepcopy(context)
        for content in ('长' * (AUTO_REPLY_MAX_LENGTH + 1), '谢谢。\n明天见。'):
            with self.subTest(content=content), patch('system_settings.agent_world.social_model.choose_scene', return_value='reply'), patch('system_settings.decision.routing.complete', side_effect=[json.dumps({'action':'reply','reason':'接话','content':content},ensure_ascii=False), json.dumps({'action':'reply','reason':'接话','content':'好，我明天来拿。'},ensure_ascii=False)]) as completion:
                result = decide(self.agent, context, owner='owner')
                self.assertEqual(result['content'],'好，我明天来拿。')
                self.assertEqual(completion.call_count,2)
                self.assertIn('种子明天给你。', completion.call_args.args[1])
                self.assertEqual(context,before)

    def test_reply_rewrite_cannot_change_selected_action(self):
        from .social_runner import decide
        context = {'allowed':['reply','ignore','rest','publish'],'image_choices':['none'], 'inbox':{'discussion':{'content':'消息'}}}
        for action in ('ignore','rest','publish'):
            with self.subTest(action=action), patch('system_settings.agent_world.social_model.choose_scene',return_value='reply'), patch('system_settings.decision.routing.complete', side_effect=[json.dumps({'action':'reply','reason':'接话','content':'长'*121}), json.dumps({'action':action,'reason':'结束','content':'短动态'})]):
                with self.assertRaises(ValueError): decide(self.agent,context,owner='owner')

    def test_reply_limit_does_not_shorten_first_comments(self):
        content='评' * AUTO_COMMENT_MAX_LENGTH
        self.assertEqual(self.social_decision('read',content)['content'],content)
        self.assertEqual(self.evaluate([self.feedback(content)])[0]['comment'],content)
        self.assertEqual(self.social_decision('reply','答'*AUTO_REPLY_MAX_LENGTH)['content'],'答'*AUTO_REPLY_MAX_LENGTH)

    def test_publishing_keeps_its_own_length_limit(self):
        content='正文' * 400
        self.assertEqual(self.social_decision('publish',content)['content'],content)

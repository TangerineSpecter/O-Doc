"""社交背景与历史表达隔离，不调用真实模型。"""
from copy import deepcopy
from django.test import SimpleTestCase
from .social_context import social_life_context


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

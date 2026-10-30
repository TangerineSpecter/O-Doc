"""关系判断只依据对方发言，不把礼貌和自己回复重复换算为好感。"""
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase
from .social_appraisal import validate_appraisal
from .social_model import validate_result
from .social_relation_replay import project_pair


class SocialAppraisalTests(SimpleTestCase):
    def test_non_neutral_requires_other_persons_actual_words(self):
        for category in ('agreement', 'disagreement', 'help', 'insult'):
            with self.subTest(category=category):
                with self.assertRaises(ValueError):
                    validate_appraisal({'category': category, 'reason': '有感受'}, '对方的原文')
                with self.assertRaises(ValueError):
                    validate_appraisal({'category': category, 'reason': '有感受', 'quote': '我自己的回复'}, '对方的原文')
                result = validate_appraisal({'category': category, 'reason': '影响了我对你的看法', 'quote': '原文'}, '对方的原文')
                self.assertIn('原文', result['reason'])
                self.assertNotIn('quote', result)
        self.assertEqual(validate_appraisal({'category': 'neutral', 'reason': '普通接话'}, '')['category'], 'neutral')

    def test_reply_drops_self_awarded_help_and_grounds_received_feeling(self):
        result = validate_result({'action': 'reply', 'reason': '接话', 'content': '我有保留。',
                                  'received_appraisal': {'category': 'disagreement', 'reason': '被轻率否定', 'quote': '你根本不懂'},
                                  'sent_appraisal': {'category': 'help', 'reason': '我耐心解释'}},
                                 {'inbox': {'discussion': {'source': '你根本不懂这些。'}}}, {'action': 'reply'})
        self.assertNotIn('sent_appraisal', result)
        self.assertEqual(result['received_appraisal']['category'], 'disagreement')

    def test_read_cannot_use_another_moment_or_own_comment_as_evidence(self):
        value = {'action': 'read', 'reason': '阅读', 'moment_id': 'm', 'content': '我的评论',
                 'sent_appraisal': {'category': 'agreement', 'reason': '欣赏作者', 'quote': '我的评论'}}
        with self.assertRaises(ValueError):
            validate_result(value, {'moments': [{'id': 'm', 'content': '对方动态'}]}, {'action': 'read', 'moment_id': 'm'})

    def test_replay_uses_frozen_old_and_new_effects_even_if_current_rules_change(self):
        old = SimpleNamespace(before={'affinity': 0, 'familiarity': 0}, after={'affinity': 3, 'familiarity': 2},
                              category='agreement', source_key='old', reason='旧认同', rule_version=1)
        new = SimpleNamespace(before={'affinity': 3}, after={'rule_effect': {'affinity': -2, 'familiarity': 2}},
                              category='disagreement', source_key='new', reason='实际不满', rule_version=2)
        with patch('system_settings.agent_world.social_relations.RULES', {'agreement': (99, 99, '开心')}):
            state = project_pair([old, new], set())
        self.assertEqual(state['affinity'], 1)
        self.assertEqual(state['familiarity'], 4)

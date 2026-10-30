"""独立评分输入与失败边界，不调用真实供应商。"""
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase
from .post_rating import require_rating_owner, score_post, validate_assessment


class PostRatingTests(SimpleTestCase):
    def setUp(self):
        self.agent = SimpleNamespace(pk='a', name='直率角色', prompt='看重事实依据', model_id='m')
        self.post = SimpleNamespace(title='照片', content='连拍捕捉动作。')
        self.feedback = {'comment': '可以试试。', 'stance': 'neutral', 'appraisal': {'reason': '关系很好'},
                         'assessment': {'strengths': [{'quote': '连拍', 'judgment': '方法具体'}],
                                        'concerns': [], 'preference': '喜欢摄影', 'overall': '有一定价值'}}

    def test_score_receives_full_content_role_and_evidence_without_relationship_or_old_score(self):
        with patch('system_settings.agent_world.post_rating.choose_scene', return_value='6') as choose:
            result = score_post('owner', self.agent, None, self.post, self.feedback)
        self.assertEqual(result, 6)
        args, kwargs = choose.call_args
        state = args[3]
        self.assertEqual(state['post']['content'], self.post.content)
        self.assertIn('看重事实依据', state['role'])
        self.assertEqual(state['assessment'], self.feedback['assessment'])
        self.assertNotIn('appraisal', state)
        self.assertNotIn('stance', state)
        self.assertTrue(kwargs['max_probability'])
        self.assertFalse(kwargs['include_role'])
        self.assertEqual(set(args[4]), {str(i) for i in range(1, 11)})

    def test_unavailable_or_invalid_score_stops_instead_of_defaulting(self):
        for value in (None, '11', '8.5'):
            with self.subTest(value=value), patch('system_settings.agent_world.post_rating.choose_scene', return_value=value):
                with self.assertRaisesMessage(ValueError, '均未提交'):
                    score_post('owner', self.agent, None, self.post, self.feedback)

    def test_disabled_scene_is_reported_before_generation(self):
        with patch('system_settings.agent_world.post_rating.owner_for', return_value='owner'), \
                patch('system_settings.agent_world.post_rating.jev_enabled', return_value=False):
            with self.assertRaisesMessage(ValueError, '启用结构化决策模型'):
                require_rating_owner(self.agent, None)

    def test_evidence_requires_real_quotes_but_does_not_force_pros_or_cons(self):
        self.assertEqual(validate_assessment(self.feedback['assessment'], self.post.content), self.feedback['assessment'])
        self.feedback['assessment']['strengths'] = []
        validate_assessment(self.feedback['assessment'], self.post.content)
        self.feedback['assessment']['concerns'] = [{'quote': '虚构', 'judgment': '错误'}]
        with self.assertRaisesMessage(ValueError, '真实存在'):
            validate_assessment(self.feedback['assessment'], self.post.content)

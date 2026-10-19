import json
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import Mock, patch
from django.test import TestCase, SimpleTestCase
from system_settings.models import Agent, AIModel, AIProvider
from .life_models import LifeProfile, LifeConfig
from .social_model import decide_social
from .life_activity_decision import select_activities
from .travel_decision import selection_for


class SocialStageTests(TestCase):
    def setUp(self):
        provider = AIProvider.objects.create(name='fixture', type='openai', base_url='https://invalid.local')
        model = AIModel.objects.create(provider=provider, name='fake', type='chat')
        self.agent = Agent.objects.create(name='角色', model=model, prompt='公共要求',
            role_profile={'personality':'认真','appearance':'紫发','expression':'轻声提醒'})
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='owner')
        LifeConfig.objects.create(pk='owner', settings={'jev_enabled':True})
        self.enterContext(patch('system_settings.agent_world.memory.recall.memory_context', return_value=''))

    @patch('system_settings.decision.routing.complete')
    @patch('system_settings.agent_world.social_model.choose_scene', return_value='ignore')
    def test_ignore_does_not_generate_or_record_personal_feelings(self, choose, completion):
        value = decide_social(self.agent, {'allowed':['ignore','reply'], 'inbox':{'sender_id':'x','discussion':{'content':'消息'}}, 'image_choices':['none']})
        self.assertEqual(value['action'], 'ignore')
        self.assertIn('系统选择说明', value['reason'])
        completion.assert_not_called()

    @patch('system_settings.decision.routing.complete')
    @patch('system_settings.agent_world.social_model.choose_scene', return_value='reply')
    def test_reply_loads_only_reply_contract_and_keeps_identity(self, choose, completion):
        appraisal={'category':'neutral','reason':'这次交流没有改变关系'}
        completion.return_value=json.dumps({'action':'reply','content':'先喝口热水吧。','reason':'回应',
            'received_appraisal':appraisal,'sent_appraisal':appraisal}, ensure_ascii=False)
        source={'allowed':['reply','publish'],'inbox':{'sender_id':'x','discussion':{'content':'今天累了'}},'image_choices':['none','generate'], 'existing_images':[{'id':'unused'}]}
        before=deepcopy(source)
        result=decide_social(self.agent, source)
        self.assertEqual(source,before)
        prompt=completion.call_args.args[1]
        for word in ('角色','认真','轻声提醒','今天累了'):
            self.assertIn(word,prompt)
        self.assertNotIn('紫发',prompt)
        self.assertNotIn('unused',prompt)
        self.assertEqual(prompt.count('公共要求'),1)
        self.assertEqual(result['image_choice'],'none')

    @patch('system_settings.decision.routing.complete', return_value='{"action":"publish","reason":"x","content":"非法切换"}')
    @patch('system_settings.agent_world.social_model.choose_scene', return_value='reply')
    def test_expression_cannot_change_selected_action(self, choose, completion):
        with self.assertRaises(ValueError):
            decide_social(self.agent, {'allowed':['reply','publish'],'inbox':{'discussion':{'content':'消息'}},'image_choices':['none']})
        self.assertEqual(completion.call_count,2)

    @patch('system_settings.agent_world.life_activity_decision.choose_scene')
    def test_farm_once_per_day_and_goals_preserved(self, choose):
        choose.side_effect=['farm','rest']
        context={'slots':[{'id':'a','time':'2026-10-14T10:00:00+08:00'},{'id':'b','time':'2026-10-14T12:00:00+08:00'}], 'activities':[{'kind':'farm'}], 'goals':[{'id':'g'}], 'recent_experiences':[{'id':'e'}]}
        ask=Mock(return_value={'goal_updates':[{'id':'g','status':'completed','evidence_record_id':'e'}]})
        result=select_activities(self.agent,context,ask)
        self.assertNotIn('farm',choose.call_args_list[1].args[4])
        self.assertEqual(result['goal_updates'][0]['evidence_record_id'],'e')
        ask.assert_called_once()

    @patch('system_settings.agent_world.life_activity_decision.time.monotonic')
    @patch('system_settings.agent_world.life_activity_decision.choose_scene')
    def test_each_slot_keeps_a_fresh_decision_minute(self, choose, monotonic):
        clock = {'now': 1000.0}
        monotonic.side_effect = lambda: clock['now']

        def select(*args, **kwargs):
            self.assertGreater(kwargs['deadline'], clock['now'])
            self.assertLessEqual(kwargs['deadline'] - clock['now'], 60)
            clock['now'] += 200
            return 'cooking'

        choose.side_effect = select
        context = {
            'slots': [
                {'id': 'a', 'time': '2026-10-14T10:00:00+08:00'},
                {'id': 'b', 'time': '2026-10-14T18:00:00+08:00'},
            ],
            'activities': [{'kind': 'cooking'}, {'kind': 'farm'}],
            '_request_deadline': 1000.0,
        }
        result = select_activities(self.agent, context, Mock())
        self.assertEqual([row['activity'] for row in result['plans']], ['cooking', 'cooking'])
        self.assertEqual(choose.call_count, 2)

    @patch('system_settings.decision.routing.complete_json', return_value={})
    def test_journal_photo_scene_field_does_not_load_image_persona(self, completion):
        from .travel_ai import ask
        journey = SimpleNamespace(pk='trip', phase='journal', snapshot={}, agent=self.agent, task=None)
        ask(journey, '写日记，返回content和photo_scene字段', {}, lambda value: value)
        prompt = completion.call_args.args[1]
        self.assertIn('轻声提醒', prompt)
        self.assertNotIn('紫发', prompt)


class TravelCheckpointTests(SimpleTestCase):
    @patch('system_settings.agent_world.travel_decision.choose_scene', return_value='city')
    def test_save_selection_and_resume_without_rechoosing(self, choose):
        journey=SimpleNamespace(phase='choose',agent=object(),task=SimpleNamespace(travel_config={'owner_id':'owner'}))
        node=SimpleNamespace(input={},save=Mock())
        context={'funds':{'available':'200'},'candidates':[{'id':'city','price':'100'},{'id':'expensive','price':'300'}]}
        result=selection_for(journey,node,context)
        self.assertEqual(result['value'],'city')
        node.save.assert_called_once()
        self.assertNotIn('expensive',choose.call_args.args[4])
        self.assertEqual(selection_for(journey,node,context),result)
        choose.assert_called_once()
        with self.assertRaises(ValueError):
            selection_for(journey,node,{'funds':{'available':'50'},'candidates':context['candidates']})

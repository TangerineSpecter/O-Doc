"""分阶段规划使用模拟模型；验证数据隔离和已选活动的稳定性。"""
from copy import deepcopy
from unittest.mock import Mock
from django.test import SimpleTestCase

from .life_plan_proposal import propose


class StagedPlanningTests(SimpleTestCase):
    def context(self):
        return {'role': '安静、喜欢旅行', 'profession': '旅游博主', 'balance': '9000',
                'stamina': '80', 'investment': {'positions': ['内部投资明细']},
                'farm': {'plots': []}, 'planting': {'crop_comparisons': []},
                'farm_queue_rules': {'rule': '内部种植合同'},
                'travel_costs': {'minimum': '2100', 'typical': '5500'},
                'rules': '阅读不产生支出',
                'activities': [{'kind': kind, 'task_id': kind, 'preference': '',
                                'allows_spending': kind in ('travel', 'investment', 'farm')}
                               for kind in ('travel', 'investment', 'farm', 'post_interaction')],
                'slots': [{'id': 'one', 'time': '2026-10-10T12:00:00+08:00',
                           'current_activity': 'unplanned', 'spent': '0'},
                          {'id': 'two', 'time': '2026-10-10T18:00:00+08:00',
                           'current_activity': 'unplanned', 'spent': '0'}],
                'upcoming': [{'id': 'later', 'activity': 'investment', 'budget': '1000'}]}

    def choices(self, first='post_interaction', second='rest'):
        return {'plans': [{'id': 'one', 'activity': first, 'reason': '想做这件事'},
                          {'id': 'two', 'activity': second, 'reason': '自己的安排'}]}

    def test_free_choices_need_no_budget_request_and_drop_unrequested_fields(self):
        context = self.context()
        before = deepcopy(context)
        choices = self.choices()
        choices['plans'][0].update(budget='8888', needs_market=True, farm_plan={'entries': []})
        ask = Mock(return_value=choices)
        result = propose(object(), context, ask)
        self.assertEqual(ask.call_count, 1)
        self.assertEqual(result['plans'][0]['budget'], '0')
        self.assertFalse(result['plans'][0]['needs_market'])
        self.assertNotIn('farm_plan', result['plans'][0])
        initial = ask.call_args.args[2]
        for key in ('balance', 'travel_costs', 'investment', 'farm', 'rules', 'farm_queue_rules'):
            self.assertNotIn(key, initial)
        self.assertNotIn('allows_spending', initial['activities'][0])
        self.assertEqual(initial['role'], context['role'])
        self.assertEqual(context, before)

    def test_budget_request_is_limited_to_selected_paid_slots(self):
        context = self.context()
        context['upcoming'].append({'id': 'one', 'activity': 'travel', 'budget': '2000'})
        ask = Mock(side_effect=[self.choices('travel'),
                               {'budgets': [{'id': 'one', 'budget': '3000'}],
                                'budget_allocations': [{'id': 'later', 'budget': '500'}],
                                'budget_reason': '调整其他预留'}])
        result = propose(object(), context, ask)
        funds = ask.call_args.args[2]
        self.assertEqual(funds['balance'], '9000')
        self.assertEqual([row['id'] for row in funds['upcoming']], ['later'])
        self.assertEqual([row['id'] for row in funds['slots']], ['one'])
        self.assertIn('travel_costs', funds)
        self.assertEqual(result['plans'][0]['activity'], 'travel')
        self.assertEqual(result['plans'][0]['budget'], '3000')
        self.assertEqual(result['plans'][1]['budget'], '0')
        self.assertEqual(result['budget_allocations'], [{'id': 'later', 'budget': '500'}])

    def test_budget_response_cannot_switch_activity_or_target_free_slot(self):
        for response in ({'budgets': [{'id': 'one', 'budget': '0', 'activity': 'rest'}]},
                         {'budgets': [{'id': 'two', 'budget': '100'}]},
                         {'budgets': []}, {'budgets': [{'id': 'one', 'budget': '-1'}]}):
            with self.subTest(response=response), self.assertRaises(ValueError):
                propose(object(), self.context(), Mock(side_effect=[self.choices('travel'), response]))

    def test_farm_details_are_requested_only_after_farm_is_selected(self):
        specification = {'entries': [], 'procurement_limit': '100'}
        ask = Mock(side_effect=[self.choices('farm'),
                               {'plans': [{'id': 'one', 'farm_plan': specification}]}])
        result = propose(object(), self.context(), ask)
        self.assertEqual(ask.call_count, 2)
        self.assertNotIn('farm', ask.call_args_list[0].args[2])
        self.assertIn('farm', ask.call_args_list[1].args[2])
        self.assertIn('planting', ask.call_args_list[1].args[2])
        self.assertEqual(result['plans'][0]['budget'], '0')
        self.assertEqual(result['plans'][0]['farm_plan'], specification)

    def test_invalid_choice_stops_before_budget_or_domain_requests(self):
        for choice in (self.choices('not-open'), {'plans': []}, self.choices('farm', 'farm')):
            ask = Mock(return_value=choice)
            with self.subTest(choice=choice), self.assertRaises(ValueError):
                propose(object(), self.context(), ask)
            self.assertEqual(ask.call_count, 1)

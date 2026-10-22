from decimal import Decimal
from unittest.mock import Mock
from django.test import SimpleTestCase
from .life_travel_tiers import budget_options, select_budget


class TravelBudgetQuestionsTests(SimpleTestCase):
    def test_default_prices_stay_one_fine_question_and_cash_tail_remains(self):
        choices = budget_options(Decimal(5750), Decimal(10000))
        self.assertEqual(len(choices), 8)
        self.assertEqual(choices['cap_6500']['budget'], '6500')
        self.assertEqual(budget_options(Decimal(1200), Decimal(1200))['cap_1200']['budget'], '1200')

    def test_extreme_price_questions_are_bounded_without_flat_enumeration(self):
        seen = []
        def choose(choices):
            self.assertLessEqual(len(choices), 13)
            seen.append(choices)
            return list(choices)[-1]
        selected, ceiling = select_budget(Decimal('999999999999.99'), Decimal('999999999999.99'), Decimal(500), choose)
        self.assertGreater(len(seen), 2)
        self.assertLess(len(seen), 25)
        self.assertEqual(Decimal(selected), Decimal('999999999999.99'))
        self.assertEqual(ceiling, Decimal(selected))
        for choices in seen[:-1]:
            self.assertLessEqual(len(choices), 5)

    def test_failure_after_range_never_restores_full_available_cash(self):
        questions = []
        def choose(choices):
            questions.append(choices)
            return next(key for key in choices if key.startswith('range_')) if len(questions) == 1 else None
        selected, ceiling = select_budget(Decimal(1000000), Decimal(2000000), Decimal(500), choose)
        self.assertIsNone(selected)
        first_range = next(value for key, value in questions[0].items() if key.startswith('range_'))
        self.assertEqual(ceiling, Decimal(first_range['maximum']))
        self.assertLess(ceiling, Decimal(1000000))

    def test_skip_at_fine_level_and_unaffordable_prefix(self):
        calls = []
        def choose(choices):
            calls.append(choices)
            return next(key for key in choices if key.startswith('range_')) if len(calls) == 1 else 'skip'
        self.assertEqual(select_budget(Decimal(100000), Decimal(100000), Decimal(1200), choose)[0], 'skip')
        for choices in calls:
            self.assertTrue(all(Decimal(row.get('budget', row.get('minimum', '0'))) >= 1200
                                for key, row in choices.items() if key != 'skip'))
        choose = Mock()
        self.assertEqual(select_budget(Decimal(1000), Decimal(0), Decimal(500), choose), (None, 0))
        choose.assert_not_called()

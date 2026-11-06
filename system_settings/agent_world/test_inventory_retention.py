"""Behavior regressions for finite inventory protection and portable daily policy decisions."""
from copy import deepcopy
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from .inventory_policy import validate, quantity_choices
from .inventory_protection import allocate_protection
from .life_time import local_time


def strategy(target=20, purpose='alchemy', order='high'):
    return {'version': 1, 'targets': {purpose: target}, 'retain_order': order,
            'reviewed_date': local_time(timezone.now()).date().isoformat()}


def stock(sku='combat.material.mist_forest.1', quantity=100, stars=1, key='a'):
    return {'id': key, 'sku': sku, 'quantity': quantity, 'free': quantity, 'stars': stars, 'created_at': key}


class ProtectionRulesTests(SimpleTestCase):
    def test_same_purpose_max_and_forge_sum(self):
        sku = stock()['sku']
        result = allocate_protection([stock()], [
            {'sku': sku, 'purpose': 'alchemy', 'quantity': 12},
            {'sku': sku, 'purpose': 'forge', 'quantity': 30, 'priority': 1}], {sku: {'alchemy': 20}})[sku]
        self.assertEqual((result['protected'], result['disposable']), (50, 50))
        self.assertEqual(result['uses']['alchemy']['required'], 20)

    def test_shortage_and_fixed_lots_override_star_preference(self):
        sku = 'crop.radish'
        result = allocate_protection([stock(sku, 10, 1, 'low'), stock(sku, 10, 5, 'high')],
            [{'sku': sku, 'purpose': 'cooking', 'quantity': 8, 'inventory_id': 'low'}],
            {sku: {'cooking': 12}}, 'high')[sku]
        self.assertEqual(result['free_rows'], {'low': 2, 'high': 6})
        result = allocate_protection([stock(sku, 2)], [{'sku': sku, 'purpose': 'cooking', 'quantity': 12}], {})[sku]
        self.assertEqual((result['missing'], result['disposable']), (10, 0))

    def test_target_small_then_growing_stock(self):
        sku = stock()['sku']
        for amount, free in ((2, 0), (595, 575)):
            result = allocate_protection([stock(quantity=amount)], [], {sku: {'alchemy': 20}})[sku]
            self.assertEqual(result['disposable'], free)

    def test_invalid_strategy_and_inventory_independent_candidates(self):
        for invalid in (True, -1, 1000001):
            with self.assertRaises(ValueError):
                validate(strategy(invalid), sell_ratio=100, list_ratio=0)
        with self.assertRaises(ValueError):
            validate(strategy(), sell_ratio=0, list_ratio=0)
        self.assertEqual(set(quantity_choices('combat.material.x', 2)), {'0', '2', '6', '10', '20'})

    def test_sync_rejects_future_version_and_invalid_cache(self):
        from .market_strategy_sync import validate_source, validate_version
        from utils.sync_manager import SyncError
        with self.assertRaises(SyncError):
            validate_version({'market_strategy_schema_version': 2})
        with self.assertRaises(SyncError):
            validate_source([{'model': 'system_settings.marketplan', 'pk': 'p', 'fields': {
                'context': {'inventory_policy_reviews': {'dish.x': {'answers': []}}}}}])


class RetentionIntegrationTests(TestCase):
    def setUp(self):
        from system_settings.models import Agent
        from .combat.profiles import ensure
        self.agent = Agent.objects.create(name='库存验证', money=10000)
        self.profile = ensure('retention-test', self.agent)
        self.sku = 'combat.material.mist_forest.1'

    def policy(self, **kwargs):
        from .market_plan_models import MarketDisposition, disposition_id
        values = {'owner_id': 'retention-test', 'actor_id': self.agent.pk, 'sku': self.sku,
                  'strategy': strategy(), 'sell_ratio': 100, 'list_ratio': 0}
        values.update(kwargs)
        return MarketDisposition.objects.create(pk=disposition_id('retention-test', self.agent.pk, self.sku), **values)

    def test_legacy_policy_retained_and_new_surplus_has_no_rounding_tail(self):
        from .market_disposition import surplus_plan
        from .inventory_stock import add_stock
        add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 21, '孢子', 'combat_material', '14', 'stock')
        p = self.policy(strategy={}, sell_ratio=0, list_ratio=0)
        self.assertIsNone(surplus_plan('retention-test', self.agent.pk, self.sku))
        p.strategy, p.sell_ratio, p.list_ratio = strategy(), 25, 75
        p.save()
        result = surplus_plan('retention-test', self.agent.pk, self.sku)
        self.assertEqual((result['surplus'], result['sell'], result['list']), (1, 0, 1))

    def test_daily_review_persists_answers_and_reuses_strategy(self):
        from .market_disposition import enqueue
        from .inventory_stock import add_stock
        from .market_disposition_worker import run
        from .market_plan_models import MarketDisposition, MarketPlan
        add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 2, '孢子', 'combat_material', '14', 'first')
        enqueue('retention-test', self.agent.pk, self.sku, 2)
        def choose(_owner, _agent, _scene, _state, choices, **_kwargs):
            return '20' if '20' in choices else 'sell' if 'sell' in choices else next(iter(choices))
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene', side_effect=choose) as ask:
            run(owner='retention-test')
            self.assertGreater(ask.call_count, 0)
            policy = MarketDisposition.objects.get(actor_id=self.agent.pk, sku=self.sku)
            self.assertEqual(policy.strategy['targets'], {'alchemy': 20})
            self.assertEqual(policy.sell_ratio, 100)
            self.assertIn(self.sku, MarketPlan.objects.get(actor_id=self.agent.pk).context['inventory_policy_reviews'])
            enqueue('retention-test', self.agent.pk, self.sku, 593)
            ask.reset_mock()
            run(owner='retention-test')
            ask.assert_not_called()

    def test_material_quantity_limits(self):
        from .combat.market import transact
        from .inventory_stock import add_stock, stock_quantity
        for amount in (99, 100, 595):
            add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, amount, '孢子', 'combat_material', '14', str(amount))
            result = transact('retention-test', self.agent, 'sell' + str(amount), {
                'kind': 'sell_combat_material', 'material_id': self.sku[7:], 'quantity': amount}, lambda *args: None, timezone.now())
            self.assertEqual(result['quantity'], amount)
        for amount in (0, -1, True, 1):
            with self.assertRaises(ValueError):
                transact('retention-test', self.agent, 'bad', {'kind': 'sell_combat_material',
                    'material_id': self.sku[7:], 'quantity': amount}, lambda *args: None, timezone.now())
        self.assertEqual(stock_quantity(self.agent.pk, 'retention-test', self.sku), 0)

    def test_large_auto_sale_is_atomic_protected_and_idempotent(self):
        from datetime import timedelta
        from system_settings.models import SystemSetting
        from .market_models import MarketSession, MarketTransaction
        from .market_service import trade
        from .inventory_stock import add_stock, stock_quantity
        from .inventory_policy import RetentionChanged
        SystemSetting.objects.update_or_create(key='system_mcp_config', defaults={'value': {'enabled': True}})
        session = MarketSession.objects.create(pk='retention-sale', owner_id='retention-test', actor_id=self.agent.pk,
            actor_name=self.agent.name, expires_at=timezone.now() + timedelta(minutes=5))
        add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 615, '孢子', 'combat_material', '14', 'big')
        policy = self.policy()
        operation = {'kind': 'sell_combat_material', 'material_id': self.sku[7:], 'quantity': 595}
        with patch('system_settings.agent_world.market_service.check_session'):
            first = trade(session, self.agent, 'sale595', operation, retention_sku=self.sku, retention_revision=policy.revision)
            replay = trade(session, self.agent, 'sale595', operation, retention_sku=self.sku, retention_revision=policy.revision)
            self.assertEqual(first, replay)
            with self.assertRaises(RetentionChanged):
                trade(session, self.agent, 'oversell', {**operation, 'quantity': 1}, retention_sku=self.sku, retention_revision=policy.revision)
        self.assertEqual(stock_quantity(self.agent.pk, 'retention-test', self.sku), 20)
        self.assertEqual(MarketTransaction.objects.filter(pk='sale595').count(), 1)
        from .combat.models import CombatFact
        self.assertEqual(CombatFact.objects.filter(actor_id=self.agent.pk, kind='trade').count(), 1)

    def test_running_plan_protects_exact_stock_and_tops_up_target(self):
        from system_settings.models import WorldAction
        from .inventory_stock import add_stock
        from .inventory_protection import projection
        row = add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 100, '孢子', 'combat_material', '14', 'frozen')
        action = WorldAction.objects.create(pk='running-alchemy', actor_id=self.agent.pk,
            snapshot={'owner_id': 'retention-test', 'alchemy': True, 'plan': [{'recipe_id': 'regen',
                'rule': {'materials': [{'inventory_id': row.pk, 'sku': self.sku, 'quantity': 12}]}}]})
        result = projection('retention-test', self.agent.pk, self.sku, strategy())
        self.assertEqual((result['protected'], result['disposable']), (20, 80))
        self.assertEqual(result['uses']['alchemy']['committed'], 12)
        action.status = 'success'
        action.save()
        result = projection('retention-test', self.agent.pk, self.sku, strategy())
        self.assertEqual(result['uses']['alchemy']['committed'], 0)

    def test_stale_revision_prevents_sale(self):
        from datetime import timedelta
        from system_settings.models import SystemSetting
        from .market_models import MarketSession
        from .market_service import trade
        from .inventory_stock import add_stock, stock_quantity
        from .inventory_policy import RetentionChanged
        SystemSetting.objects.update_or_create(key='system_mcp_config', defaults={'value': {'enabled': True}})
        session = MarketSession.objects.create(pk='changed-policy', owner_id='retention-test', actor_id=self.agent.pk,
            expires_at=timezone.now() + timedelta(minutes=5))
        add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 100, '孢子', 'combat_material', '14', 's')
        policy = self.policy()
        policy.revision += 1
        policy.save()
        with patch('system_settings.agent_world.market_service.check_session'), self.assertRaises(RetentionChanged):
            trade(session, self.agent, 'stale', {'kind': 'sell_combat_material', 'material_id': self.sku[7:], 'quantity': 1},
                  retention_sku=self.sku, retention_revision=policy.revision - 1)
        self.assertEqual(stock_quantity(self.agent.pk, 'retention-test', self.sku), 100)

    def test_policy_reconcile_rejects_invalid_and_accepts_legacy_empty_field_hash(self):
        from .market_models import MarketConfig, MarketIntegrity
        from .market_sync import fingerprints, reconcile_market
        from utils.sync_manager import SyncError
        MarketConfig.objects.create(pk='retention-test', seed='test')
        policy = self.policy()
        MarketIntegrity.objects.update_or_create(pk='retention-test', defaults={'hashes': fingerprints('retention-test')})
        reconcile_market()
        from .market_sync import CORE_ASSET_MODELS
        MarketIntegrity.objects.filter(pk='retention-test').update(
            hashes=fingerprints('retention-test', legacy=True, models=CORE_ASSET_MODELS))
        with self.assertRaises(SyncError):
            reconcile_market()
        MarketIntegrity.objects.filter(pk='retention-test').update(hashes=fingerprints('retention-test'))
        policy.strategy = {}
        policy.save()
        MarketIntegrity.objects.filter(pk='retention-test').update(hashes=fingerprints('retention-test', legacy_strategy=True))
        reconcile_market()
        self.assertEqual(MarketIntegrity.objects.get(pk='retention-test').hashes, fingerprints('retention-test'))
        policy.strategy = strategy(-1)
        policy.save()
        with self.assertRaises(SyncError):
            reconcile_market()

    def test_exported_source_hash_tampering_is_rejected_before_import(self):
        import json
        from django.core import serializers
        from utils.sync_datetime import SyncJSONEncoder
        from .market_models import MarketConfig, MarketIntegrity
        from .market_plan_models import MarketDisposition
        from .market_sync import ASSET_MODELS, fingerprints
        from .market_strategy_sync import validate_source, metadata
        from utils.sync_manager import SyncError
        MarketConfig.objects.create(pk='retention-test', seed='test')
        self.policy()
        MarketIntegrity.objects.update_or_create(pk='retention-test', defaults={'hashes': fingerprints('retention-test')})
        data = []
        for model in (*ASSET_MODELS, MarketIntegrity):
            data.extend(json.loads(serializers.serialize('json', model.objects.all(), cls=SyncJSONEncoder)))
        validate_source(data, metadata(data))
        corrupted = deepcopy(data)
        row = next(r for r in corrupted if r['model'] == 'system_settings.marketdisposition')
        row['fields']['strategy']['targets']['alchemy'] = 1
        with self.assertRaisesRegex(SyncError, '检查点'):
            validate_source(corrupted, metadata(corrupted))

    def test_daily_failure_keeps_prior_strategy_and_sync_cache(self):
        from datetime import timedelta
        from .market_disposition import enqueue
        from .market_disposition_worker import run
        from .market_plan_models import MarketDisposition, MarketPlan
        from .inventory_stock import add_stock
        policy = self.policy(strategy={**strategy(), 'reviewed_date': (local_time(timezone.now()).date() - timedelta(days=1)).isoformat()})
        add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 100, '孢子', 'combat_material', '14', 'x')
        enqueue('retention-test', self.agent.pk, self.sku, 0)
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene', return_value=None):
            run(owner='retention-test')
        policy.refresh_from_db()
        self.assertEqual(policy.strategy['targets'], {'alchemy': 20})
        self.assertEqual(MarketPlan.objects.get(actor_id=self.agent.pk).context['inventory_policy_reviews'][self.sku]['status'], 'review')
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene', return_value='keep'):
            run(owner='retention-test')
        policy.refresh_from_db()
        self.assertEqual(policy.strategy['reviewed_date'], local_time(timezone.now()).date().isoformat())

    def test_api_projection_includes_unreviewed_inventory_without_writing_policy(self):
        from .inventory_stock import add_stock
        from .market_policy_queries import policies_payload
        from .market_plan_models import MarketDisposition
        add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 595, '孢子', 'combat_material', '14', 'before-review')
        result = policies_payload('retention-test', self.agent.pk)
        self.assertEqual((result[0]['protection']['total'], result[0]['protection']['disposable']), (595, 0))
        self.assertFalse(MarketDisposition.objects.exists())

    def test_automation_api_exposes_camel_case_and_owner_scoping(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .market_plan_models import MarketPlan
        from .market_views import MarketAutomationView
        from .inventory_stock import add_stock
        add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 595, '孢子', 'combat_material', '14', 'api')
        self.policy()
        MarketPlan.objects.create(pk='api-plan', owner_id='retention-test', actor_id=self.agent.pk,
                                  plan_date=local_time(timezone.now()).date())
        request = APIRequestFactory().get('/api/settings/agent-world/market/automation/')
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True))
        with patch('system_settings.agent_world.market_views.get_current_user_identifier', return_value='retention-test'):
            response = MarketAutomationView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        row = response.data['data']['plans'][0]['dispositions'][0]
        self.assertEqual(row['strategy']['targets'], {'alchemy': 20})
        self.assertEqual(row['protection']['disposable'], 575)
        response.render()
        self.assertIn(b'retainOrder', response.content)
        with patch('system_settings.agent_world.market_views.get_current_user_identifier', return_value='other-owner'):
            response = MarketAutomationView.as_view()(request)
        self.assertEqual(response.data['data']['plans'], [])
        anonymous = APIRequestFactory().get('/api/settings/agent-world/market/automation/')
        self.assertIn(MarketAutomationView.as_view()(anonymous).status_code, (401, 403))

    def test_auto_worker_requires_local_permission_and_participating_actor(self):
        from .market_disposition import enqueue
        from .market_disposition_worker import run
        from .inventory_stock import add_stock
        from .market_plan_models import MarketDisposition
        add_stock(self.agent.pk, 'retention-test', self.agent.name, self.sku, 595, '孢子', 'combat_material', '14', 'permission')
        enqueue('retention-test', self.agent.pk, self.sku, 0)
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene') as choose:
            result = run(automatic=True)
            choose.assert_not_called()
        self.assertEqual(result['processed'], 0)
        self.assertFalse(MarketDisposition.objects.exists())
        from system_settings.models import WorldActionRuntime
        from .life_models import LifeConfig
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        config = LifeConfig.objects.create(pk='retention-test', migrated=True,
            settings={'market_automation_v2': True, 'agent_ids': [self.agent.pk]}, paused_agents=[self.agent.pk])
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene') as choose:
            run(automatic=True)
            choose.assert_not_called()
        config.paused_agents = []
        config.save()
        with patch('system_settings.agent_world.market_disposition_worker.choose_scene', return_value=None) as choose:
            run(automatic=True)
            self.assertGreater(choose.call_count, 0)


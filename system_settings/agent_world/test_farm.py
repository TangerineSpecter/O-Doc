import copy
import json
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase, SimpleTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from system_settings.models import Agent, AIProvider, AIModel, AgentTask, AgentExecutionLease, WorldActionRuntime, WorldAction
from system_settings.serializers import AgentTaskSerializer
from .farm_catalog import DEFAULT_RULES, validate_rules
from .farm_clock import advance_state, wet_intervals, production_result, DAY
from .farm_models import AgentFarm, FarmOperation, FarmCatalog
from .farm_service import ensure_farms, advance_farm, commit_operation, stock
from .farm_runner import run_farm_opportunity, tick_farms, candidates
from .farm_sync import reconcile_farms
from .models import WorldLedger
from .execution import stamina
from .income import recompute_balances


class FarmClockTests(SimpleTestCase):
    def test_building_catalog_requires_increasing_capacities(self):
        from rest_framework.exceptions import ValidationError
        for capacities in ([2, 1, 1], [2, 2, 6], [6, 4, 2]):
            with self.subTest(capacities=capacities):
                rules = copy.deepcopy(DEFAULT_RULES)
                rules['buildings']['coop']['capacities'] = capacities
                with self.assertRaises(ValidationError):
                    validate_rules(rules)

    def test_crop_effective_time_and_rain_tail(self):
        with patch('system_settings.agent_world.farm_clock.weather', return_value='sun'):
            self.assertEqual(wet_intervals('seed', 100, 100+2*DAY, 100+DAY), [(100, 100+DAY)])
        with patch('system_settings.agent_world.farm_clock.weather', side_effect=lambda seed, at: 'rain' if at == -28800 else 'sun'):
            intervals = wet_intervals('s', -7200, DAY, 0)
            self.assertEqual(intervals, [(-7200, 79200)])

    def test_production_probabilities_exclusive(self):
        results = [production_result(10, i/1000) for i in range(1000)]
        self.assertEqual(sum(r == {'quality': 'normal', 'quantity': 2} for r in results), 500)
        self.assertEqual(sum(r == {'quality': 'normal', 'quantity': 1} for r in results), 400)
        self.assertEqual(sum(r == {'quality': 'gold', 'quantity': 1} for r in results), 100)
        self.assertEqual(production_result(1, .049)['quantity'], 2)
        self.assertEqual(production_result(1, .05)['quantity'], 1)
        self.assertEqual(production_result(9, .95)['quality'], 'normal')


def legacy_operation_fixture(test, kind, key, at, params):
    """Load historical pre-market settlements to exercise production, FIFO and recovery.

    New farm writes are checked separately; purchases/sales below are archived
    fixtures, not permission to use the removed farm APIs.
    """
    import hashlib
    from django.db import transaction
    from django.db.models import Sum
    from .farm_service import perform
    from .income import ensure_opening
    with transaction.atomic():
        operation = {'kind': kind, **params}
        previous = FarmOperation.objects.filter(pk=key+':0').first()
        if previous:
            return previous
        if not test.task.enabled:
            raise ValueError('农场任务已停止')
        if stamina(test.agent, at) < 2:
            raise ValueError('体力不足')
        farm = AgentFarm.objects.get(pk=test.agent.pk)
        ensure_opening(test.agent)
        amount, result = perform(farm, operation, catalog_for_fixture(farm), at.timestamp(), key+':0')
        balance = WorldLedger.objects.filter(agent_id=test.agent.pk).aggregate(total=Sum('amount'))['total'] or Decimal(0)
        if balance+amount < 0:
            raise ValueError('余额不足')
        if amount:
            WorldLedger.objects.create(pk='farm:'+key+':0',agent_id=test.agent.pk,agent_name=test.agent.name,
                kind='farm',amount=amount,created_at=at,snapshot={'farm_id':farm.pk,'operation_id':key+':0'})
        test.agent.money = balance+amount;test.agent.save(update_fields=['money'])
        result.update(amount=str(amount),energy_cost=2)
        row = FarmOperation.objects.create(pk=key+':0',farm=farm,opportunity_id=key,operation=operation,result=result,created_at=at)
        WorldAction.objects.create(pk=hashlib.sha256(('farm-energy:'+key+':0').encode()).hexdigest(),
            actor_id=test.agent.pk,status='success',consumed_at=at,energy_cost=2,effects_done=True,
            snapshot={'farm_energy':True},result={'operation_id':row.pk})
        farm.state['operation_keys']=[*farm.state.get('operation_keys',[]),row.pk]
        farm.revision+=1;farm.updated_at=at;farm.save()
        return row


def catalog_for_fixture(farm):
    return FarmCatalog.objects.get(pk=farm.owner_id).rules


class FarmTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', 'farm@example.invalid', 'farm-test')
        self.client = APIClient(); self.client.force_authenticate(self.user)
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='园丁', model=model, money=10000)
        self.task = AgentTask.objects.create(id='builtin-farm', name='农场经营', task_kind='farm', agent=self.agent,
            agent_ids=[self.agent.pk], farm_config={'owner_id': 'admin'}, enabled=True)
        ensure_farms(self.task)
        self.now = timezone.now()
        AgentExecutionLease.objects.create(agent=self.agent, token='a', until=self.now+timedelta(days=30))
        WorldActionRuntime.objects.create(pk='world', token='w', until=self.now+timedelta(days=30))
        self.counter = 0

    def op(self, kind, *, at=None, key=None, **params):
        self.counter += 1
        if kind in ('buy_supply', 'buy_animal', 'sell'):
            return legacy_operation_fixture(self, kind, key or f'op{self.counter}', at or self.now, params)
        return commit_operation(self.agent.pk, key or f'op{self.counter}', 0, {'kind':kind, **params}, '按自己的偏好经营', self.task, 'a', 'w', now=at or self.now)

    def state(self):
        return AgentFarm.objects.get(pk=self.agent.pk).state

    def test_plant_water_harvest_sell_and_idempotency(self):
        for i, crop in enumerate(('radish', 'potato', 'corn')):
            self.op('buy_supply', sku='seed.'+crop, quantity=1)
            self.op('plant', crop=crop, targets=[str(i)])
            self.op('water', targets=[str(i)])
            duration = DEFAULT_RULES['crops'][crop]['growth_seconds']
            advance_farm(self.agent.pk, self.now+timedelta(seconds=duration))
            self.op('harvest', at=self.now+timedelta(seconds=duration), targets=[str(i)])
            quantity = DEFAULT_RULES['crops'][crop]['yield']
            row = self.op('sell', sku='crop.'+crop, quantity=quantity, key='sell-'+crop)
            before = WorldLedger.objects.count()
            repeated = self.op('sell', sku='crop.'+crop, quantity=quantity, key='sell-'+crop)
            self.assertEqual(row.pk, repeated.pk)
            self.assertEqual(WorldLedger.objects.count(), before)
            self.assertIsNone(stock(AgentFarm.objects.get(pk=self.agent.pk), 'crop.'+crop))
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, Decimal(10049))
        self.assertEqual(FarmOperation.objects.count(), 15)

    def test_dry_pause_and_restart(self):
        self.op('buy_supply', sku='seed.radish', quantity=1)
        self.op('plant', crop='radish', targets=['0'])
        with patch('system_settings.agent_world.farm_clock.weather', return_value='sun'):
            advance_farm(self.agent.pk, self.now+timedelta(hours=5))
            self.assertEqual(self.state()['plots'][0]['crop']['grown'], 0)
            self.op('water', at=self.now+timedelta(hours=5), targets=['0'])
            advance_farm(self.agent.pk, self.now+timedelta(hours=6))
            self.assertEqual(self.state()['plots'][0]['crop']['grown'], 3600)

    def test_failed_purchase_rolls_back_stock_money_energy(self):
        self.agent.money=0;self.agent.save(update_fields=['money'])
        WorldLedger.objects.filter(pk=f'opening:{self.agent.pk}').update(amount=0)
        with self.assertRaisesRegex(ValueError, '余额不足'):
            self.op('buy_supply', sku='feed', quantity=4)
        self.assertEqual(WorldLedger.objects.count(), 1)
        self.assertEqual(WorldLedger.objects.first().amount, 0)
        self.assertFalse(WorldAction.objects.exists())
        self.assertFalse(FarmOperation.objects.exists())
        self.assertIsNone(stock(AgentFarm.objects.get(pk=self.agent.pk), 'feed'))

    def test_land_building_capacity_and_price_snapshot(self):
        for _ in range(3):self.op('expand')
        self.assertEqual(len(self.state()['plots']), 16)
        with self.assertRaises(ValueError):self.op('expand')
        self.op('build', building='coop')
        for _ in range(2):self.op('buy_animal', animal='chicken')
        with self.assertRaises(ValueError):self.op('buy_animal', animal='chicken')
        self.op('upgrade', building='coop');self.op('upgrade', building='coop')
        self.assertEqual(self.state()['buildings']['coop'], {'level':3,'capacity':6})
        with self.assertRaises(ValueError):self.op('upgrade', building='coop')

    def test_cow_sheep_two_days_feed_gap_and_one_pending_cycle(self):
        self.op('build', building='barn')
        for kind in ('cow','sheep'):self.op('buy_animal', animal=kind)
        self.op('buy_supply', sku='feed', quantity=8)
        ids=[a['id'] for a in self.state()['animals']]
        self.op('feed', targets=ids)
        advance_farm(self.agent.pk, self.now+timedelta(days=2))
        for a in self.state()['animals']:
            self.assertEqual(a['cycle']['grown'], DAY);self.assertNotIn('result',a['cycle'])
        self.op('feed', at=self.now+timedelta(days=2),targets=ids)
        advance_farm(self.agent.pk,self.now+timedelta(days=3))
        results=copy.deepcopy(self.state()['animals'])
        advance_farm(self.agent.pk,self.now+timedelta(days=10))
        self.assertEqual(self.state()['animals'], results)
        self.op('collect',at=self.now+timedelta(days=10),targets=ids)
        self.assertEqual(self.state()['animals'][0]['cycle']['number'],2)
        with self.assertRaises(ValueError):self.op('collect',at=self.now+timedelta(days=10),targets=ids)

    def test_ten_daily_feeds_max_hearts_and_duplicate_same_day(self):
        self.now=self.now.replace(hour=10,minute=0,second=0,microsecond=0)
        self.op('build',building='coop');self.op('buy_animal',animal='chicken')
        self.op('buy_supply',sku='feed',quantity=20)
        target=[self.state()['animals'][0]['id']]
        for day in range(10):
            at=self.now+timedelta(days=day)
            self.op('feed',at=at,targets=target)
            self.op('feed',at=at+timedelta(hours=1),targets=target)
            self.assertEqual(self.state()['animals'][0]['half_hearts'],day+1)
        self.assertEqual(self.state()['animals'][0]['half_hearts'],10)

    def test_disabled_busy_and_insufficient_stamina(self):
        self.task.enabled=False;self.task.save(update_fields=['enabled'])
        with self.assertRaisesRegex(ValueError,'停止'):self.op('buy_supply',sku='feed',quantity=1)
        self.task.enabled=True;self.task.save(update_fields=['enabled'])
        WorldAction.objects.create(id='spent',actor_id=self.agent.pk,status='success',energy_cost=100,consumed_at=self.now)
        with self.assertRaisesRegex(ValueError,'体力不足'):self.op('buy_supply',sku='feed',quantity=1)
        self.assertFalse(FarmOperation.objects.exists())

    def test_read_api_permissions_and_no_mutating_actions(self):
        url=f'/api/settings/agent-world/farms/{self.agent.pk}/'
        before=AgentFarm.objects.get(pk=self.agent.pk).revision
        response = self.client.get(url)
        self.assertEqual(response.status_code,200)
        self.assertIsInstance(response.data['data']['state']['plots'][0]['wet'], bool)
        self.assertEqual(AgentFarm.objects.get(pk=self.agent.pk).revision,before)
        self.assertEqual(self.client.post(url,{'kind':'expand'},format='json').status_code,405)
        self.assertEqual(self.client.patch(url,{'appearance':{'style':3,'palette':2}},format='json').status_code,200)
        outsider=User.objects.create_user('outsider');self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(url).status_code,404)
        self.assertEqual(self.client.patch(url,{'appearance':{'style':0,'palette':0}},format='json').status_code,404)
        response=self.client.post('/api/settings/agent-tasks/', {'name':'farm','task_kind':'farm','agent':self.agent.pk,'agents':[self.agent.pk]},format='json')
        self.assertEqual(response.status_code,403)

    def test_autonomous_plan_partial_failure_does_not_recall_model(self):
        AgentExecutionLease.objects.all().delete()
        with patch('system_settings.agent_world.farm_runner.decide',return_value={'choices':['0','1'],'reason':'买饲料'}), patch('system_settings.agent_world.farm_runner.commit_operation',side_effect=[None,ValueError('资金变化')]) as commit:
            run_farm_opportunity(self.task,key='run',locked='w')
            run_farm_opportunity(self.task,key='run',locked='w')
            self.assertEqual(commit.call_count,2)
        self.assertEqual(WorldAction.objects.get(pk='run').status,'failed')

    def test_sync_snapshot_reconciles_inventory_ledger_energy(self):
        from utils.sync_manager import SyncManager
        self.op('buy_supply',sku='feed',quantity=4)
        farm=AgentFarm.objects.get(pk=self.agent.pk)
        data=SyncManager().build_snapshot_data()
        models={item['model'] for item in data}
        self.assertTrue({'system_settings.agentfarm','system_settings.farmcatalog','system_settings.farmoperation'} <= models)
        self.assertNotIn('system_settings.agentexecutionlease',models)
        item=stock(farm,'feed');item.quantity=999;item.save()
        WorldLedger.objects.filter(kind='farm').delete();WorldAction.objects.filter(snapshot__farm_energy=True).delete()
        reconcile_farms();recompute_balances()
        # 农场恢复不能覆盖共用背包；库存由通用同步快照恢复。
        self.assertEqual(stock(farm,'feed').quantity,999)
        self.agent.refresh_from_db();self.assertEqual(self.agent.money,9980)
        self.assertEqual(WorldAction.objects.filter(snapshot__farm_energy=True).count(),1)
        before=stamina(self.agent)
        SyncManager().apply_snapshot_data(data)
        self.assertEqual(stock(farm,'feed').quantity,4)
        self.assertAlmostEqual(stamina(self.agent),before,places=3)

    def test_common_backpack_seeds_from_other_sources_can_be_planted(self):
        from .travel_models import AgentInventoryItem
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        for index, quantity in enumerate((1, 2)):
            AgentInventoryItem.objects.create(id=f'market-seed-{index}', actor_id=self.agent.pk,
                owner_id='admin', kind='seed', name='萝卜种子', quantity=quantity,
                source={'sku': 'seed.radish', 'market_order': str(index)})
        AgentInventoryItem.objects.create(id='other-account-seeds', actor_id=self.agent.pk,
            owner_id='other', kind='seed', name='萝卜种子', quantity=20, source={'sku': 'seed.radish'})
        options = candidates(farm, self.agent.money)
        self.assertIn({'kind': 'plant', 'crop': 'radish', 'targets': ['0', '1', '2']}, [o['operation'] for o in options])
        self.op('plant', crop='radish', targets=['0', '1', '2'])
        self.assertFalse(AgentInventoryItem.objects.filter(pk__startswith='market-seed-').exists())
        self.assertEqual(AgentInventoryItem.objects.get(pk='other-account-seeds').quantity, 20)
        self.assertNotIn('inventory_snapshot', self.state())

    def test_new_supplies_stack_into_existing_common_backpack(self):
        from .travel_models import AgentInventoryItem
        row = AgentInventoryItem.objects.create(id='market-feed', actor_id=self.agent.pk,
            owner_id='admin', kind='supply', name='饲料', quantity=2, source={'sku': 'feed', 'market_order': 'order-1'})
        self.op('buy_supply', sku='feed', quantity=4)
        row.refresh_from_db()
        self.assertEqual(row.quantity, 6)
        self.assertEqual(row.source['market_order'], 'order-1')
        self.assertEqual(AgentInventoryItem.objects.filter(actor_id=self.agent.pk, source__sku='feed').count(), 1)

    def test_common_inventory_is_not_overwritten_by_legacy_farm_snapshot(self):
        from .travel_models import AgentInventoryItem
        from utils.sync_manager import SyncManager
        self.op('buy_supply', sku='feed', quantity=4)
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        item = stock(farm, 'feed')
        farm.state['inventory_snapshot'] = [{'id': item.pk, 'quantity': 1}]
        farm.save(update_fields=['state'])
        item.quantity = 12
        item.save(update_fields=['quantity'])
        AgentInventoryItem.objects.create(id='market-souvenir', actor_id=self.agent.pk, owner_id='admin',
            name='市场纪念品', quantity=3, source={'market_order': 'order-2'})
        snapshot = SyncManager().build_snapshot_data()
        reconcile_farms()
        self.assertEqual(stock(farm, 'feed').quantity, 12)
        self.assertTrue(AgentInventoryItem.objects.filter(pk='market-souvenir').exists())
        SyncManager().apply_snapshot_data(snapshot)
        self.assertEqual(stock(farm, 'feed').quantity, 12)
        self.assertEqual(AgentInventoryItem.objects.get(pk='market-souvenir').quantity, 3)
        self.assertNotIn('inventory_snapshot', self.state())

    def test_shared_product_rows_sell_in_fifo_order(self):
        from .travel_models import AgentInventoryItem
        for index, (quantity, value) in enumerate(((1, 18), (2, 20))):
            AgentInventoryItem.objects.create(id=f'market-product-{index}', actor_id=self.agent.pk,
                owner_id='admin', kind='crop', name='萝卜', quantity=quantity, value=value,
                source={'sku': 'crop.radish'})
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        from .farm_service import add_stock
        add_stock(farm, 'crop.radish', 1, '萝卜', 'farm_crop', 30, 'new-harvest')
        self.assertNotIn('sell', [o['operation']['kind'] for o in candidates(farm, self.agent.money)])
        result = self.op('sell', sku='crop.radish', quantity=2)
        self.assertEqual(result.result['amount'], '38.00')
        self.assertFalse(AgentInventoryItem.objects.filter(pk='market-product-0').exists())
        remaining = AgentInventoryItem.objects.get(pk='market-product-1')
        self.assertEqual(remaining.quantity, 2)
        self.assertEqual(remaining.source['lots'], [{'quantity': 1, 'price': '20.00'}, {'quantity': 1, 'price': '30'}])

    def test_catalog_snapshot_keeps_started_crop_rule(self):
        self.op('buy_supply',sku='seed.radish',quantity=1)
        self.op('plant',crop='radish',targets=['0'])
        catalog=FarmCatalog.objects.get(pk='admin');catalog.rules['crops']['radish']['growth_seconds']=5;catalog.save()
        self.assertEqual(self.state()['plots'][0]['crop']['rules']['growth_seconds'],3600)
        invalid=copy.deepcopy(DEFAULT_RULES);invalid['feed_price']=-1
        with self.assertRaises(Exception):validate_rules(invalid)

    def test_actual_partial_commit_and_interrupted_recovery(self):
        AgentExecutionLease.objects.all().delete()
        self.agent.money=800;self.agent.save(update_fields=['money'])
        WorldLedger.objects.filter(pk=f'opening:{self.agent.pk}').update(amount=800)
        with patch('system_settings.agent_world.farm_runner.decide', return_value={'choices':['0','1'], 'reason':'建造两座建筑'}):
            # 两个候选都能在初始状态支付，但第二笔重新检查余额并失败。
            with patch('system_settings.agent_world.farm_runner.candidates', return_value=[
                {'id':'0','operation':{'kind':'build','building':'coop'}},
                {'id':'1','operation':{'kind':'build','building':'barn'}}]):
                run_farm_opportunity(self.task,key='partial',locked='w')
        self.assertEqual(FarmOperation.objects.filter(opportunity_id='partial').count(),1)
        self.assertIn('coop', self.state()['buildings'])
        self.assertNotIn('barn', self.state()['buildings'])
        self.agent.refresh_from_db();self.assertEqual(self.agent.money,500)
        self.assertEqual(WorldAction.objects.get(pk='partial').status,'failed')
        WorldAction.objects.filter(pk='partial').update(status='claimed',updated_at=self.now-timedelta(hours=1))
        with patch('system_settings.agent_world.farm_runner.decide') as decision:
            tick_farms(None,'w',False)
            decision.assert_not_called()
        self.assertEqual(FarmOperation.objects.filter(opportunity_id='partial').count(),1)
        self.assertEqual(WorldAction.objects.get(pk='partial').status,'failed')

    def test_gold_collect_triple_price_and_repeat(self):
        self.op('build',building='coop');self.op('buy_animal',animal='chicken')
        self.op('buy_supply',sku='feed',quantity=1);target=[self.state()['animals'][0]['id']]
        self.op('feed',targets=target)
        farm=AgentFarm.objects.get(pk=self.agent.pk)
        farm.state['animals'][0]['half_hearts']=10;farm.save(update_fields=['state'])
        with patch('system_settings.agent_world.farm_clock.production_result',return_value={'quality':'gold','quantity':1}):
            advance_farm(self.agent.pk,self.now+timedelta(days=1))
        self.op('collect',at=self.now+timedelta(days=1),targets=target,key='gold-collect')
        item=stock(farm,'product.chicken.gold');self.assertEqual(item.quantity,1);self.assertEqual(item.value,90)
        self.op('collect',at=self.now+timedelta(days=1),targets=target,key='gold-collect')
        self.assertEqual(stock(farm,'product.chicken.gold').quantity,1)
        result=self.op('sell',at=self.now+timedelta(days=1),sku='product.chicken.gold',quantity=1)
        self.assertEqual(Decimal(result.result['amount']),Decimal('90'))

    def test_price_lots_survive_config_change(self):
        from .farm_service import add_stock
        farm=AgentFarm.objects.get(pk=self.agent.pk)
        add_stock(farm,'crop.radish',2,'萝卜','farm_crop',18,'a')
        add_stock(farm,'crop.radish',1,'萝卜','farm_crop',50,'b')
        result=self.op('sell',sku='crop.radish',quantity=3)
        self.assertEqual(Decimal(result.result['amount']),Decimal('86'))

    def test_default_disabled_task_and_enable_creates_one_farm(self):
        self.task.delete();AgentFarm.objects.all().delete()
        payload={'name':'farm','task_kind':'farm','agent':self.agent.pk,'agents':[self.agent.pk]}
        response=self.client.post('/api/settings/agent-tasks/',payload,format='json')
        self.assertEqual(response.status_code,200)
        self.assertFalse(AgentFarm.objects.exists())
        task=AgentTask.objects.get(task_kind='farm');self.assertFalse(task.enabled);self.assertEqual(task.interval_minutes,30)
        response=self.client.patch(f'/api/settings/agent-tasks/{task.pk}/',{'enabled':True},format='json')
        self.assertEqual(response.status_code,200);self.assertEqual(AgentFarm.objects.count(),1)
        self.assertEqual(len(AgentFarm.objects.first().state['plots']),4)
        self.client.post('/api/settings/agent-tasks/',{**payload,'enabled':True},format='json')
        self.assertEqual(AgentFarm.objects.count(),1);self.assertEqual(AgentTask.objects.filter(task_kind='farm').count(),1)

    def test_invalid_model_format_only_one_correction(self):
        from .farm_runner import decide
        farm=AgentFarm.objects.get(pk=self.agent.pk)
        with patch('system_settings.agent_world.farm_runner.AIService.chat_completion_messages', autospec=True, return_value='{"choices":["invalid"],"reason":"x"}') as call:
            with self.assertRaises(ValueError):decide(self.task,self.agent,farm,candidates(farm,self.agent.money))
            self.assertEqual(call.call_count,2)
            self.assertTrue(all(args.kwargs == {'model_id': self.agent.model_id} for args in call.call_args_list))

    def test_decision_uses_real_ai_adapter_and_agent_model(self):
        from .farm_runner import decide
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        # 只替换网络客户端，保留真实 AIService 参数、模型选择及字符串返回契约。
        with patch('utils.ai_service.OpenAI') as sdk:
            sdk.return_value.chat.completions.create.return_value = SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content='```json\n{"choices":["0"],"reason":"买饲料"}\n```'))])
            result = decide(self.task, self.agent, farm, candidates(farm, self.agent.money))
            self.assertEqual(result, {'choices': ['0'], 'reason': '买饲料'})
            self.assertEqual(sdk.return_value.chat.completions.create.call_count, 1)
            self.assertEqual(sdk.return_value.chat.completions.create.call_args.kwargs['model'], self.agent.model.name)
            self.assertEqual(sdk.call_args.kwargs['base_url'], 'https://example.invalid/v1')

    def test_model_format_correction_can_return_valid_plan(self):
        from .farm_runner import decide
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        with patch('system_settings.agent_world.farm_runner.AIService.chat_completion_messages', autospec=True,
                   side_effect=['不是JSON', '{"choices":["0"],"reason":"购买饲料"}']) as call:
            result = decide(self.task, self.agent, farm, candidates(farm, self.agent.money))
            self.assertEqual(result, {'choices': ['0'], 'reason': '购买饲料'})
            self.assertEqual(call.call_count, 2)

    def test_decision_context_does_not_grow_with_audit_history(self):
        from .farm_runner import decide
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        options = candidates(farm, self.agent.money)
        with patch('system_settings.agent_world.farm_runner.AIService.chat_completion_messages', autospec=True,
                   return_value='{"choices":[],"reason":"休息"}') as call:
            decide(self.task, self.agent, farm, options)
            before = call.call_args.args[0][1]['content']
            farm.state['operation_keys'] = [f'{i:064x}:0' for i in range(10000)]
            farm.state['inventory_snapshot'] = [{'source': {'lots': ['历史批次'] * 10000}}]
            farm.state['last_operation'] = {'reason': '历史经营理由'}
            decide(self.task, self.agent, farm, options)
            after = call.call_args.args[0][1]['content']
            context = json.loads(after.split('\n补充经营偏好：')[0])
            self.assertEqual(context['farm'], {key: farm.state[key] for key in ('plots', 'buildings', 'animals')})
            self.assertLessEqual(abs(len(after) - len(before)), 100)
            self.assertEqual(len(farm.state['operation_keys']), 10000)

    def test_upgrade_after_catalog_change_preserves_capacity_and_resources(self):
        self.op('build', building='coop')
        self.op('upgrade', building='coop')
        for _ in range(4):
            self.op('buy_animal', animal='chicken')
        catalog = FarmCatalog.objects.get(pk='admin')
        catalog.rules['buildings']['coop']['capacities'] = [1, 2, 3]
        validate_rules(catalog.rules)
        catalog.save()
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        before = copy.deepcopy(farm.state)
        self.agent.refresh_from_db()
        money = self.agent.money
        facts = (WorldLedger.objects.count(), WorldAction.objects.count(), FarmOperation.objects.count())
        self.assertFalse(any(o['operation'] == {'kind': 'upgrade', 'building': 'coop'} for o in candidates(farm, money)))
        with self.assertRaisesRegex(ValueError, '容量'):
            self.op('upgrade', building='coop', key='capacity-retry')
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, money)
        self.assertEqual(self.state(), before)
        self.assertEqual((WorldLedger.objects.count(), WorldAction.objects.count(), FarmOperation.objects.count()), facts)
        catalog.rules['buildings']['coop']['capacities'] = [2, 4, 6]
        catalog.save()
        self.op('upgrade', building='coop', key='capacity-retry')
        self.assertEqual(self.state()['buildings']['coop'], {'level': 3, 'capacity': 6})

    def test_incomplete_restore_rejects_and_rolls_back(self):
        from utils.sync_manager import SyncManager, SyncError
        self.op('buy_supply',sku='feed',quantity=4)
        manager=SyncManager();data=manager.build_snapshot_data()
        data=[r for r in data if r['model']!='system_settings.farmoperation']
        with self.assertRaises(SyncError):manager.apply_snapshot_data(data)
        self.assertEqual(FarmOperation.objects.count(),1)
        self.assertEqual(stock(AgentFarm.objects.get(pk=self.agent.pk),'feed').quantity,4)


from django.test import TransactionTestCase
from django.db import close_old_connections
from concurrent.futures import ThreadPoolExecutor


class FarmConcurrencyTests(TransactionTestCase):
    def test_duplicate_concurrent_operation_commits_once(self):
        FarmTests.setUp(self)
        def write():
            close_old_connections()
            try:
                return commit_operation(self.agent.pk,'concurrent',0,{'kind':'build','building':'coop'},'建造鸡舍',self.task,'a','w').pk
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(lambda _:write(),range(2)))
        self.assertEqual(results,['concurrent:0','concurrent:0'])
        self.assertEqual(FarmOperation.objects.count(),1)
        self.assertEqual(WorldLedger.objects.filter(kind='farm').count(),1)
        self.assertEqual(WorldAction.objects.filter(snapshot__farm_energy=True).count(),1)

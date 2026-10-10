"""隔离数据库与媒体：真实业务事务，模拟模型、时间和市场，不启动调度。"""
import copy
from datetime import datetime, timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from system_settings.models import Agent, AgentTask, AIProvider, AIModel, AgentExecutionLease, WorldActionRuntime
from .farm_clock import SHANGHAI
from .farm_models import AgentFarm, FarmOperation
from .farm_service import ensure_farms
from .farm_automation import tend_farm, tick_automation, validate_plan
from .farm_queue_plan import current, overview
from .inventory_stock import add_stock, stock_quantity
from .life_models import LifeConfig, LifeItem
from .life_config import DEFAULTS, ensure_profiles
from .life_planner import apply_plan
from .life_scope import life_scope
from .farm_sync import reconcile_farms

NOW = datetime(2026, 10, 10, 8, tzinfo=SHANGHAI)


@override_settings(USE_TZ=True)
class FarmQueueTests(TestCase):
    def setUp(self):
        provider = AIProvider.objects.create(name='fake', base_url='https://example.invalid')
        model = AIModel.objects.create(name='fake', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='园丁', model=model, money=1000, created_at=NOW-timedelta(days=1))
        self.task = AgentTask.objects.create(name='农场', task_kind='farm', agent=self.agent,
            agent_ids=[self.agent.pk], enabled=True, farm_config={'owner_id':'owner'})
        self.config = LifeConfig.objects.create(pk='owner', migrated=True, settings={**DEFAULTS, 'agent_ids':[self.agent.pk]})
        ensure_profiles('owner', [self.agent.pk]); ensure_farms(self.task)
        self.item = LifeItem.objects.create(pk='start', owner_id='owner', actor_id=self.agent.pk,
            original_at=NOW+timedelta(minutes=25), scheduled_at=NOW+timedelta(minutes=25), activity='unplanned', status='pending')
        WorldActionRuntime.objects.create(pk='world', enabled=True, token='world', until=NOW+timedelta(days=10))
        AgentExecutionLease.objects.create(agent=self.agent, token='agent', until=NOW+timedelta(days=10))
        self.ai = patch('system_settings.agent_world.life_planner.ask', side_effect=AssertionError('队列不得请求模型')).start()
        self.decide = patch('system_settings.agent_world.farm_runner.decide', side_effect=AssertionError('队列不得请求农场模型')).start()
        self.addCleanup(patch.stopall)

    def stock(self, sku='seed.potato', count=10):
        return add_stock(self.agent.pk, 'owner', self.agent.name, sku, count, sku, 'fertilizer' if sku.startswith('fertilizer.') else 'seed', 10, 'fixture-'+sku)

    def plan(self, entries=None, item=None, limit='200'):
        item = item or self.item
        specification = {'entries':entries if entries is not None else [{'sku':'seed.potato','quantity':10}], 'procurement_limit':limit}
        with patch('django.utils.timezone.now', return_value=NOW):
            apply_plan('owner', self.agent, [item], {'plans':[{'id':item.pk,'activity':'farm','budget':'0','reason':'当天顺序种植', 'farm_plan':specification}]})
        item.refresh_from_db()
        return current(self.farm(), item.scheduled_at)

    def farm(self):
        return AgentFarm.objects.get(pk=self.agent.pk)

    def activate(self, at=None):
        from .farm_queue_runner import run_queue_opportunity
        AgentExecutionLease.objects.update(token='', until=None)
        at = at or self.item.scheduled_at
        self.item.status='running';self.item.save()
        with patch('django.utils.timezone.now', return_value=at), life_scope(self.item, {}):
            result=run_queue_opportunity(self.task, key=self.item.pk, locked='world')
        self.item.status='completed';self.item.record_id=result.pk;self.item.save()
        AgentExecutionLease.objects.update(token='agent', until=NOW+timedelta(days=10))
        return result

    def tend(self, at):
        with patch('django.utils.timezone.now', return_value=at):
            tend_farm(self.agent.pk,'world','agent',self.task,at)

    def test_four_four_two_without_model_and_duplicate_poll(self):
        self.stock(); self.plan(); self.activate()
        start=self.item.scheduled_at
        self.tend(start+timedelta(hours=2)); self.tend(start+timedelta(hours=2))
        self.tend(start+timedelta(hours=4)); self.tend(start+timedelta(hours=6))
        plants=list(FarmOperation.objects.filter(operation__kind='plant').order_by('created_at'))
        self.assertEqual([len(p.operation['targets']) for p in plants], [4,4,2])
        self.assertEqual(stock_quantity(self.agent.pk,'owner','seed.potato'),0)
        self.assertEqual(FarmOperation.objects.filter(operation__kind='harvest').count(),3)
        self.ai.assert_not_called();self.decide.assert_not_called()
        validate_plan(self.farm());reconcile_farms();reconcile_farms()
        self.assertEqual(FarmOperation.objects.count(),6)

    def test_no_seed_intent_exists_and_shortage_skips(self):
        self.stock('seed.radish', 2)
        self.plan([{'sku':'seed.potato','quantity':10},{'sku':'seed.radish','quantity':2}]);self.activate()
        self.assertEqual(FarmOperation.objects.get(operation__kind='plant').operation['crop'],'radish')
        need=overview(self.farm(),self.item.scheduled_at)
        self.assertEqual(need['entries'][0]['missing_seeds'],10)
        events=copy.deepcopy(current(self.farm(),self.item.scheduled_at)['events'])
        self.tend(self.item.scheduled_at+timedelta(minutes=30))
        self.assertEqual(current(self.farm(),self.item.scheduled_at)['events'],events)

    def test_fertilizer_required_and_transaction_rollback(self):
        self.stock();self.stock('fertilizer.quality',4)
        self.plan([{'sku':'seed.potato','quantity':4,'fertilizer_mode':'required','fertilizer':'quality'}])
        original=__import__('system_settings.agent_world.farm_service',fromlist=['commit_operation']).commit_operation
        def fail(*args,**kwargs):
            if args[3]['kind']=='fertilize':raise ValueError('模拟事务失败')
            return original(*args,**kwargs)
        with patch('system_settings.agent_world.farm_service.commit_operation',side_effect=fail):
            with self.assertRaisesRegex(ValueError,'模拟事务失败'):self.activate()
        self.assertEqual(FarmOperation.objects.count(),0)
        self.assertEqual(stock_quantity(self.agent.pk,'owner','seed.potato'),10)
        self.assertTrue(all(not p['crop'] for p in self.farm().state['plots']))
        AgentExecutionLease.objects.update(token='agent', until=NOW+timedelta(days=10))
        self.tend(self.item.scheduled_at+timedelta(minutes=30))
        self.assertEqual(FarmOperation.objects.count(),2)
        self.assertEqual(stock_quantity(self.agent.pk,'owner','fertilizer.quality'),0)
        validate_plan(self.farm())

    def test_required_missing_waits_optional_can_plant(self):
        self.stock()
        self.plan([{'sku':'seed.potato','quantity':2,'fertilizer_mode':'required','fertilizer':'quality'},
                   {'sku':'seed.potato','quantity':2,'fertilizer_mode':'optional','fertilizer':'yield'}]);self.activate()
        self.assertEqual(len(FarmOperation.objects.get().operation['targets']),2)
        plan=current(self.farm(),self.item.scheduled_at)
        self.assertEqual(list(plan['progress'].values()),[0,2])

    def test_cutoff_next_day_refresh_and_prior_harvest_before_start(self):
        self.config.settings['active_end']='10:00';self.config.save()
        self.stock();self.plan();self.activate()
        self.tend(NOW.replace(hour=10,minute=30))
        old=current(self.farm(),NOW);self.assertEqual(old['status'],'expired')
        self.assertEqual(sum(old['progress'].values()),4)
        tomorrow=NOW+timedelta(days=1)
        item=LifeItem.objects.create(pk='tomorrow',owner_id='owner',actor_id=self.agent.pk,
            activity='unplanned',status='pending',original_at=tomorrow.replace(hour=9),scheduled_at=tomorrow.replace(hour=9))
        self.plan([{'sku':'seed.potato','quantity':6}],item=item)
        self.tend(tomorrow)
        self.assertEqual(FarmOperation.objects.filter(operation__kind='plant').count(),1)
        harvest=FarmOperation.objects.get(operation__kind='harvest')
        self.assertEqual(harvest.result['source_plans'][0]['day'],'2026-10-10')
        self.assertEqual(current(self.farm(),tomorrow)['status'],'pending')

    def test_offline_resume_does_not_replay_batches(self):
        self.stock();self.plan();self.activate()
        self.tend(self.item.scheduled_at+timedelta(hours=8))
        self.assertEqual(FarmOperation.objects.filter(operation__kind='plant').count(),2)
        self.assertEqual(FarmOperation.objects.filter(operation__kind='harvest').count(),1)

    def test_schedule_revision_preserves_progress_and_updates_start(self):
        self.stock();self.plan()
        from .life_schedule import revise
        revise(self.item,'顺延到下午',scheduled_at=NOW.replace(hour=14))
        self.assertEqual(current(self.farm(),NOW)['starts_at'],NOW.replace(hour=14).timestamp())
        self.activate(NOW.replace(hour=14))
        from .farm_queue_plan import install
        install(self.item, self.task, {'entries':[{'sku':'seed.radish','quantity':99}]}, '普通日程修订')
        plan=current(self.farm(),NOW)
        self.assertEqual(plan['entries'][0]['sku'],'seed.potato');self.assertEqual(sum(plan['progress'].values()),4)

    def test_sync_rejects_fake_progress(self):
        self.stock();self.plan();self.activate()
        farm=self.farm();plan=current(farm,NOW);plan['progress'][plan['entries'][0]['id']]+=1;farm.save()
        from utils.sync_manager import SyncError
        with self.assertRaises(SyncError):validate_plan(farm)

    def test_paused_world_travel_and_execution_lock(self):
        self.stock();self.plan();self.activate()
        self.config.paused_agents=[self.agent.pk];self.config.save()
        at=self.item.scheduled_at+timedelta(hours=2)
        with patch('django.utils.timezone.now',return_value=at):tick_automation('world')
        self.assertEqual(FarmOperation.objects.count(),1)
        self.config.paused_agents=[];self.config.save()
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        self.tend(at);self.assertEqual(FarmOperation.objects.count(),1)
        WorldActionRuntime.objects.filter(pk='world').update(enabled=True)
        with patch('system_settings.agent_world.travel_candidates.travelling_ids',return_value={self.agent.pk}),patch('django.utils.timezone.now',return_value=at):tick_automation('world')
        self.assertEqual(FarmOperation.objects.count(),1)
        AgentExecutionLease.objects.update(token='other')
        with self.assertRaises(ValueError):self.tend(at)
        self.assertEqual(FarmOperation.objects.count(),1)

    def market(self, at):
        from system_settings.models import SystemSetting
        from .market_sessions import enter
        from .market_shop import current_batch
        SystemSetting.objects.update_or_create(key='system_mcp_config',defaults={'value':{'enabled':True}})
        task=AgentTask.objects.create(name='市场',task_kind='market',agent=self.agent,
            agent_ids=[self.agent.pk],enabled=True,market_config={'owner_id':'owner'})
        AgentExecutionLease.objects.update(token='',until=None)
        with patch('django.utils.timezone.now',return_value=at):
            shop=current_batch('owner',at)
            shop.slots=[{'id':'0','sku':'seed.potato','name':'土豆种子','kind':'seed','price':'20','initial_quantity':10,'remaining_quantity':10},
                        {'id':'1','sku':'seed.radish','name':'萝卜种子','kind':'seed','price':'10','initial_quantity':10,'remaining_quantity':10}]
            shop.save()
            session=enter('owner',self.agent,'market-session',task=task,mode='manual',now=at)
        return shop,session

    def buy(self, shop, session, at, count=4, slot='0', request='buy'):
        from .market_tools import call_market_tool
        with patch('django.utils.timezone.now',return_value=at):
            return call_market_tool('buy_market_shop',{'session_id':session.pk,'request_id':request,
                'batch_id':shop.pk,'slot_id':slot,'quantity':count},self.agent)

    def close_market(self, session):
        from .market_sessions import close_session
        close_session(session,'测试完成')
        AgentExecutionLease.objects.update(token='agent',until=NOW+timedelta(days=10))

    def test_market_before_start_purchases_wait_and_deduplicates(self):
        self.plan()
        shop,session=self.market(NOW)
        self.buy(shop,session,NOW);self.buy(shop,session,NOW)
        self.assertEqual(stock_quantity(self.agent.pk,'owner','seed.potato'),4)
        self.close_market(session);self.tend(NOW)
        self.assertEqual(FarmOperation.objects.count(),0)
        self.activate();self.assertEqual(FarmOperation.objects.count(),1)
        plan=current(self.farm(),NOW)
        self.assertEqual(plan['entries'][0]['quantity'],10)
        self.assertEqual(len(plan['purchases']),1)
        validate_plan(self.farm())

    def test_market_after_start_partial_purchase_continues_next_tick(self):
        self.plan();self.activate()
        at=NOW.replace(hour=9)
        shop,session=self.market(at);self.buy(shop,session,at,count=2)
        self.assertEqual(FarmOperation.objects.count(),0)
        self.close_market(session);self.tend(at+timedelta(minutes=30))
        self.assertEqual(len(FarmOperation.objects.get().operation['targets']),2)
        self.assertEqual(sum(current(self.farm(),NOW)['progress'].values()),2)

    def test_market_alternative_version_reason_and_request_dedup(self):
        from .market_tools import call_market_tool
        self.plan();self.activate()
        at=NOW.replace(hour=9)
        shop,session=self.market(at)
        plan=current(self.farm(),NOW)
        args={'session_id':session.pk,'request_id':'replace','plan_id':plan['id'],'revision':1,
              'reason':'土豆缺货，改种当前有货的萝卜','entries':[{'sku':'seed.radish','quantity':3}]}
        with patch('django.utils.timezone.now',return_value=at):
            result=call_market_tool('update_farm_queue',args,self.agent)
            replay=call_market_tool('update_farm_queue',args,self.agent)
            self.assertEqual(result,replay)
            with self.assertRaisesRegex(ValueError,'版本'):
                call_market_tool('update_farm_queue',{**args,'request_id':'stale'},self.agent)
        self.buy(shop,session,at,count=3,slot='1');self.close_market(session)
        self.tend(at+timedelta(minutes=30))
        self.assertEqual(FarmOperation.objects.get().operation['crop'],'radish')
        self.assertEqual(current(self.farm(),NOW)['revision'],2)
        validate_plan(self.farm());reconcile_farms();reconcile_farms()

    def test_market_no_stock_and_budget_exceeded_do_not_create_seeds(self):
        self.plan(limit='30');shop,session=self.market(NOW)
        with self.assertRaisesRegex(ValueError,'上限'):self.buy(shop,session,NOW,count=2)
        self.assertEqual(stock_quantity(self.agent.pk,'owner','seed.potato'),0)
        shop.slots[0]['remaining_quantity']=0;shop.save()
        with self.assertRaisesRegex(ValueError,'库存不足'):self.buy(shop,session,NOW,count=1,request='soldout')
        self.assertEqual(current(self.farm(),NOW)['purchases'],[])
        self.close_market(session);self.activate();self.assertEqual(FarmOperation.objects.count(),0)

    def test_market_cannot_change_planted_crop_or_another_resident(self):
        from .market_tools import call_market_tool
        self.stock();self.plan();self.activate();at=NOW.replace(hour=9)
        _,session=self.market(at);plan=current(self.farm(),NOW)
        args={'session_id':session.pk,'request_id':'bad','plan_id':plan['id'],'revision':1,'reason':'替代',
              'entries':[{'id':plan['entries'][0]['id'],'sku':'seed.radish','quantity':10}]}
        with patch('django.utils.timezone.now',return_value=at):
            with self.assertRaisesRegex(ValueError,'已播种'):call_market_tool('update_farm_queue',args,self.agent)
            with self.assertRaisesRegex(ValueError,'身份'):call_market_tool('update_farm_queue',{**args,'actor_id':'other'},self.agent)
        self.assertEqual(sum(current(self.farm(),NOW)['progress'].values()),4)

    def test_full_life_execution_activates_without_replanning(self):
        from .life_runner import execute_item
        self.stock();self.plan();at=self.item.scheduled_at
        AgentExecutionLease.objects.update(token='',until=None)
        WorldActionRuntime.objects.filter(pk='world').update(token='',until=None)
        with patch('django.utils.timezone.now',return_value=at):execute_item(self.item,None)
        self.item.refresh_from_db();self.assertEqual(self.item.status,'completed',self.item.result)
        self.assertEqual(FarmOperation.objects.count(),1)
        self.ai.assert_not_called();self.decide.assert_not_called()

    def test_mixed_growth_and_one_daily_card_for_actual_day(self):
        self.stock('seed.radish',2);self.stock('seed.corn',2)
        self.plan([{'sku':'seed.radish','quantity':2},{'sku':'seed.corn','quantity':2}]);self.activate()
        start=self.item.scheduled_at;self.tend(start+timedelta(hours=1))
        self.assertEqual(len(FarmOperation.objects.get(operation__kind='harvest').operation['targets']),2)
        from .daily_feed import day_events, FeedScope
        scope=FeedScope(actors={self.agent.pk},names={self.agent.pk:self.agent.name},visible_colls=())
        events=day_events(None,'owner',NOW.date(),scope=scope)[0]
        cards=[e for e in events if e['category']=='farm']
        self.assertEqual(len(cards),1)
        self.assertTrue(any(s['title']=='AI规划' for s in cards[0]['steps']))
        self.assertEqual(len([s for s in cards[0]['steps'] if '按队列自动执行' in s['title']]),3)
        self.tend(NOW+timedelta(days=1))
        cards=[e for e in day_events(None,'owner',(NOW+timedelta(days=1)).date(),scope=scope)[0] if e['category']=='farm']
        self.assertEqual(len(cards),1)
        self.assertTrue(any('来源计划 2026-10-10' in s['detail'] for s in cards[0]['steps']))

    def test_source_snapshot_validation_and_fake_source_rejection(self):
        import json
        from django.core import serializers
        from system_settings.models import WorldAction
        from .farm_models import FarmCatalog
        from .farm_queue_sync import validate_queue_source
        self.stock();self.plan();self.activate()
        data=json.loads(serializers.serialize('json',[self.farm(),*FarmCatalog.objects.all(),self.item,*WorldAction.objects.all(),*FarmOperation.objects.all()]))
        validate_queue_source(data)
        for _ in range(2):
            for restored in serializers.deserialize('json', json.dumps(data)):
                restored.save()
            reconcile_farms()
        self.assertEqual(FarmOperation.objects.count(), 1)
        self.assertEqual(stock_quantity(self.agent.pk, 'owner', 'seed.potato'), 6)
        farm=next(r for r in data if r['model']=='system_settings.agentfarm')
        plan=next(iter(farm['fields']['state']['planting_plans'].values()))
        plan['progress'][plan['entries'][0]['id']]+=1
        from utils.sync_manager import SyncError
        with self.assertRaises(SyncError):validate_queue_source(data)

    def test_cancel_pending_requires_reason_and_never_rebuilds(self):
        from .life_schedule import revise
        self.stock();self.plan();self.activate()
        revise(self.item,'放弃剩余目标',status='cancelled')
        self.tend(self.item.scheduled_at+timedelta(hours=2))
        self.assertEqual(FarmOperation.objects.filter(operation__kind='plant').count(),1)
        self.assertEqual(FarmOperation.objects.filter(operation__kind='harvest').count(),1)
        self.assertEqual(current(self.farm(),NOW)['status'],'cancelled')

    def test_short_activity_window_marks_unplanted_estimate(self):
        self.config.settings['active_end']='10:00';self.config.save()
        self.plan()
        estimate=current(self.farm(),NOW)['estimate']['entries'][0]
        self.assertEqual(estimate['sowable'],4);self.assertEqual(estimate['unplanted'],6)

    def test_two_residents_start_at_their_own_schedule(self):
        from .farm_queue_plan import install
        other=Agent.objects.create(name='另一个园丁',model=self.agent.model,money=1000,created_at=NOW-timedelta(days=1))
        self.config.settings['agent_ids'].append(other.pk);self.config.save();ensure_profiles('owner',[other.pk]);ensure_farms(self.task)
        item=LifeItem.objects.create(pk='other-start',owner_id='owner',actor_id=other.pk,
            activity='farm',task_id=self.task.pk,status='pending',original_at=NOW.replace(hour=14),scheduled_at=NOW.replace(hour=14))
        install(item,self.task,{'entries':[{'sku':'seed.potato','quantity':4}],'procurement_limit':'0'},'下午开工');item.save()
        add_stock(other.pk,'owner',other.name,'seed.potato',4,'土豆种子','seed',20,'other-stock')
        self.stock();self.plan();self.activate();self.tend(NOW.replace(hour=9))
        self.assertFalse(FarmOperation.objects.filter(farm_id=other.pk).exists())
        from .farm_queue_runner import run_queue_opportunity
        with patch('django.utils.timezone.now',return_value=item.scheduled_at),life_scope(item,{}):run_queue_opportunity(self.task,key=item.pk,locked='world')
        from .life_time import local_time
        self.assertEqual(local_time(FarmOperation.objects.get(farm_id=other.pk).created_at).hour,14)
        self.ai.assert_not_called();self.decide.assert_not_called()

    def test_low_stamina_retries_and_empty_poll_has_no_dynamic(self):
        self.stock();self.plan();self.activate();at=self.item.scheduled_at+timedelta(hours=2)
        with patch('system_settings.agent_world.execution.stamina',return_value=0):self.tend(at)
        self.assertEqual(FarmOperation.objects.count(),1)
        events=len(current(self.farm(),NOW)['events'])
        with patch('system_settings.agent_world.execution.stamina',return_value=0):self.tend(at+timedelta(minutes=30))
        self.assertEqual(len(current(self.farm(),NOW)['events']),events)
        self.tend(at+timedelta(hours=1))
        self.assertEqual(FarmOperation.objects.filter(operation__kind='plant').count(),2)

    def test_old_fixed_window_plan_is_not_executed(self):
        farm=self.farm();farm.state['automation']={'version':1,'status':'active','task_id':self.task.pk,'plots':[],'last_window':''};farm.save()
        self.tend(NOW.replace(hour=18));self.assertEqual(FarmOperation.objects.count(),0)

    def test_expanded_farm_batches_and_partial_optional_fertilizer(self):
        farm=self.farm()
        farm.state['plots'] += [{'id':str(i),'watered_until':0,'crop':None} for i in range(4,8)]
        farm.save();self.stock();self.stock('fertilizer.quality',2)
        self.plan([{'sku':'seed.potato','quantity':10,'fertilizer_mode':'optional','fertilizer':'quality'}]);self.activate()
        plants=list(FarmOperation.objects.filter(operation__kind='plant').order_by('created_at','id'))
        self.assertEqual(sum(len(p.operation['targets']) for p in plants),8)
        self.assertTrue(all(len(p.operation['targets'])<=4 for p in plants))
        self.assertEqual(FarmOperation.objects.filter(operation__kind='fertilize').count(),1)
        self.tend(self.item.scheduled_at+timedelta(hours=2))
        self.assertEqual(FarmOperation.objects.filter(operation__kind='harvest').count(),2)
        self.assertEqual(sum(current(self.farm(),NOW)['progress'].values()),10)
        validate_plan(self.farm())

    def test_cross_day_recovery_preserves_both_original_plan_sources(self):
        import json
        from django.core import serializers
        from .farm_models import FarmCatalog
        from .farm_queue_sync import validate_queue_source
        from .life_schedule import recover
        self.config.settings['active_end'] = '10:00'; self.config.save()
        yesterday = self.plan()
        original = copy.deepcopy(yesterday['versions'][0])
        # Reproduce a single-source snapshot from before this fix.
        self.item.context.pop('farm_plan_sources', None)
        self.item.save()
        after_cutoff = NOW.replace(hour=10, minute=1)
        with patch('django.utils.timezone.now', return_value=after_cutoff):
            recover(self.config, after_cutoff)
        self.item.refresh_from_db()
        from .life_time import local_time
        self.assertEqual(local_time(self.item.scheduled_at).date(), (NOW+timedelta(days=1)).date())
        with patch('django.utils.timezone.now', return_value=self.item.scheduled_at):
            apply_plan('owner', self.agent, [self.item], {'plans':[{'id':self.item.pk,
                'activity':'farm','budget':'0','reason':'次日按真实库存重新规划',
                'farm_plan':{'entries':[{'sku':'seed.radish','quantity':2}],'procurement_limit':'0'}}]})
        self.item.refresh_from_db()
        plans = self.farm().state['planting_plans']
        self.assertEqual(len(plans), 2)
        self.assertEqual(plans[yesterday['id']]['versions'][0], original)
        self.assertEqual(set(self.item.context['farm_plan_sources']), set(plans))
        self.assertEqual(self.item.context['farm_plan_sources'][yesterday['id']], original)
        validate_plan(self.farm())
        data = json.loads(serializers.serialize('json', [self.farm(), *FarmCatalog.objects.all(), self.item]))
        validate_queue_source(data)
        for _ in range(2):
            for restored in serializers.deserialize('json', json.dumps(data)):
                restored.save()
            reconcile_farms()
        self.assertEqual(FarmOperation.objects.count(), 0)
        self.assertEqual(sum(sum(p['progress'].values()) for p in self.farm().state['planting_plans'].values()), 0)

    def test_cancelled_queue_does_not_limit_ordinary_market_purchase(self):
        from .life_schedule import revise
        self.plan(limit='0')
        revise(self.item, '取消当天种植，保留市场正常备货', status='cancelled')
        shop, session = self.market(NOW)
        self.buy(shop, session, NOW, count=1)
        self.assertEqual(stock_quantity(self.agent.pk, 'owner', 'seed.potato'), 1)
        self.assertEqual(current(self.farm(), NOW)['purchases'], [])
        self.assertEqual(current(self.farm(), NOW)['status'], 'cancelled')
        self.assertEqual(FarmOperation.objects.count(), 0)
        self.close_market(session)
        validate_plan(self.farm())

    def test_legacy_single_source_is_readable_but_cannot_authorize_other_plan(self):
        from utils.sync_manager import SyncError
        self.plan()
        self.item.context.pop('farm_plan_sources')
        self.item.save()
        validate_plan(self.farm())
        self.item.context['farm_plan_source']['id'] = 'another-plan'
        self.item.save()
        with self.assertRaisesRegex(SyncError, '原始日程依据'):
            validate_plan(self.farm())

    def test_expired_queue_does_not_link_market_purchase(self):
        self.plan(limit='0')
        farm = self.farm()
        current(farm, NOW)['status'] = 'expired'
        farm.save()
        shop, session = self.market(NOW)
        self.buy(shop, session, NOW, count=1)
        self.assertEqual(stock_quantity(self.agent.pk, 'owner', 'seed.potato'), 1)
        self.assertEqual(current(self.farm(), NOW)['purchases'], [])
        self.close_market(session)
        validate_plan(self.farm())

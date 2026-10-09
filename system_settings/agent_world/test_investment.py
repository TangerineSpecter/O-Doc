"""隔离数据库验证投资资产与有界工具，不请求模型、搜索或行情服务。"""
import copy
import time
from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase, SimpleTestCase, TransactionTestCase
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentTask, AIProvider, AIModel, WorldAction, WorldActionRuntime, AgentExecutionLease
from .investment_models import InvestmentAccount, InvestmentDecision, InvestmentTrade, InvestmentCache, InvestmentNewsClaim, InvestmentIntegrity
from .investment_data import indicators, reference_day, next_trade_day, quote, stock_directory, history
from .investment_service import account_for, commit
from .investment_sync import reconcile_investments, checkpoint
from .investment_queries import overview, positions, page
from .investment_news import news
from .investment_tools import InvestmentTools, Finished
from .models import WorldLedger

NOW = datetime(2026,9,28,10)


class InvestmentMaintenanceTests(SimpleTestCase):
    def test_quote_failure_does_not_skip_market_maintenance(self):
        from . import worker
        with patch.object(worker, '_last_attempt', 0), patch.object(worker.time, 'monotonic', return_value=120), \
             patch.object(worker, 'recover_months') as months, \
             patch('system_settings.agent_world.market_sessions.cleanup') as cleanup, \
             patch('system_settings.agent_world.investment_worker.tick_values', side_effect=ValueError('calendar unavailable')), \
             patch('system_settings.agent_world.market_models.MarketConfig.objects.values_list', return_value=['owner-a', 'owner-b']), \
             patch('system_settings.agent_world.market_shop.current_batch') as batch, \
             self.assertLogs(worker.logger, level='ERROR') as logs:
            worker.advance_world_months()
            months.assert_called_once()
            cleanup.assert_called_once_with(restart=True)
            self.assertEqual([call.args[0] for call in batch.call_args_list], ['owner-a', 'owner-b'])
            self.assertIn('继续市场维护', logs.output[0])
            self.assertFalse(worker._lock.locked())

    def test_unavailable_investment_table_does_not_skip_market(self):
        from django.db import OperationalError
        from . import worker
        with patch.object(worker, '_last_attempt', 120), patch.object(worker.time, 'monotonic', return_value=120), \
             patch('system_settings.agent_world.market_sessions.cleanup'), \
             patch('system_settings.agent_world.investment_worker.tick_values', side_effect=OperationalError('table unavailable')), \
             patch('system_settings.agent_world.market_models.MarketConfig.objects.values_list', return_value=['owner']), \
             patch('system_settings.agent_world.market_shop.current_batch') as batch, \
             self.assertLogs(worker.logger, level='DEBUG'):
            worker.advance_world_months()
            batch.assert_called_once_with('owner')
            self.assertFalse(worker._lock.locked())


class IndicatorTests(SimpleTestCase):
    def test_constant_prices(self):
        out=indicators([{'close':'10'}]*200)
        self.assertEqual(out['rsi14'],50)
        self.assertEqual(out['macd']['histogram'],0)
        self.assertEqual(out['ma'],{'5':10,'20':10,'60':10})

    def test_up_down_rsi_and_moving_average(self):
        up=indicators([{'close':str(i)} for i in range(1,201)])
        down=indicators([{'close':str(i)} for i in range(200,0,-1)])
        self.assertEqual(up['rsi14'],100);self.assertEqual(down['rsi14'],0)
        self.assertEqual(up['ma']['5'],198)
        self.assertGreater(up['macd']['dif'],0)

    def test_short_invalid_series(self):
        with self.assertRaises(ValueError):indicators([{'close':'10'}]*59)
        with self.assertRaises(ValueError):indicators([{'close':'nan'}]*200)

    @patch('system_settings.agent_world.investment_data.calendar', return_value=['2026-09-25','2026-09-28','2026-09-29','2026-09-30','2026-10-09'])
    def test_calendar_reference_and_holiday_unlock(self,cal):
        self.assertEqual(next_trade_day(date(2026,9,30)),'2026-10-09')
        with self.assertRaises(ValueError):reference_day(date(2027,1,1))

    def test_large_page(self):
        self.assertEqual(page(list(range(45)),2)['items'],list(range(20,40)))
        with self.assertRaises(ValueError):page([],0)


class InvestmentTests(TestCase):
    def setUp(self):
        self.clock=patch('django.utils.timezone.now',return_value=NOW);self.clock.start();self.addCleanup(self.clock.stop)
        self.user=User.objects.create_superuser('admin','stock@example.invalid','test')
        self.client=APIClient();self.client.force_authenticate(self.user)
        provider=AIProvider.objects.create(name='test',type='OpenAi',base_url='https://example.invalid')
        model=AIModel.objects.create(name='test',type='chat',provider=provider)
        self.agent=Agent.objects.create(name='小橘',model=model,money=10000,created_at=NOW-timedelta(days=3))
        self.task=AgentTask.objects.create(name='A 股投资',task_kind='investment',agent=self.agent,agent_ids=[self.agent.pk],enabled=True,investment_config={'owner_id':'admin'})
        WorldActionRuntime.objects.create(pk='world',enabled=True)
        AgentExecutionLease.objects.create(agent=self.agent,token='test',until=NOW+timedelta(hours=1))
        self.account=account_for('admin',self.agent)
        self.decision=self.make_decision('op1')

    def make_decision(self,key,ref=date(2026,9,25),day=date(2026,9,28)):
        return InvestmentDecision.objects.create(pk=key,owner_id='admin',actor_id=self.agent.pk,actor_name=self.agent.name,reference_date=ref,execution_date=day,task=self.task,created_at=NOW)

    def trade(self,key='t1',side='buy',quantity=1,price='10',code='000001',decision=None,available='2026-09-29'):
        d=decision or self.decision
        operation={'side':side,'code':code,'name':'平安银行','quantity':quantity,'reason':'观察行业','day':str(d.execution_date),'analysis':{}}
        q={'code':code,'name':'平安银行','price':price,'date':str(d.reference_date),'source':'BaoStock/未复权日线'}
        return commit(d,self.agent,key,operation,q,available if side=='buy' else '', 'test',True)

    def test_one_share_atomic_and_idempotent(self):
        result=self.trade()
        self.assertEqual(self.trade(),result)
        self.agent.refresh_from_db();self.account.refresh_from_db()
        self.assertEqual(self.agent.money,9990);self.assertEqual(self.account.positions['000001']['quantity'],1)
        self.assertEqual(InvestmentTrade.objects.count(),1)
        energy=WorldAction.objects.get(snapshot__investment_energy=True)
        self.assertEqual(energy.pk,'investment-energy:op1')
        self.assertEqual(energy.energy_cost,5)
        with self.assertRaisesRegex(ValueError,'不同参数'):self.trade(quantity=2)

    def test_life_schedule_decision_id_fits_energy_action(self):
        key='a'*64
        decision=self.make_decision(key)
        self.trade('life-buy',decision=decision)
        energy=WorldAction.objects.get(snapshot__investment_energy=True)
        self.assertLessEqual(len(energy.pk),64)
        self.assertNotEqual(energy.pk,'investment-energy:'+key)
        self.trade('life-buy-2',decision=decision)
        self.assertEqual(WorldAction.objects.filter(snapshot__investment_energy=True).count(),1)

    def test_weighted_cost_partial_full_sale(self):
        self.trade('a',quantity=10,price='10',available='2026-09-28')
        self.trade('b',quantity=5,price='12',available='2026-09-28')
        d=self.make_decision('op2')
        result=self.trade('c','sell',5,'12',decision=d)
        self.assertAlmostEqual(Decimal(result['realized_profit']),Decimal(20)/3,places=10)
        self.account.refresh_from_db()
        self.assertEqual(self.account.positions['000001']['quantity'],10)
        self.trade('d','sell',10,'11',decision=d)
        self.account.refresh_from_db();self.assertEqual(self.account.positions,{})
        self.agent.refresh_from_db();self.assertEqual(self.agent.money,10010)

    def test_failure_no_assets_changed(self):
        for qty in (0,-1,1.5,True,1000000001):
            with self.assertRaises(ValueError):self.trade(quantity=qty)
        with self.assertRaisesRegex(ValueError,'余额'):self.trade(quantity=1001)
        self.assertEqual(InvestmentTrade.objects.count(),0)
        self.assertEqual(WorldLedger.objects.filter(kind='investment').count(),0)

    def test_t_plus_one_and_old_shares_survive_topup(self):
        self.trade('old',quantity=3,available='2026-09-28')
        self.trade('today',quantity=5)
        d=self.make_decision('op2')
        with self.assertRaisesRegex(ValueError,'可卖股数'):self.trade('no','sell',4,decision=d)
        self.trade('yes','sell',3,decision=d)
        self.account.refresh_from_db();self.assertEqual(self.account.positions['000001']['quantity'],5)

    def test_same_opposite_side_forbidden(self):
        self.trade(available='2026-09-28')
        with self.assertRaisesRegex(ValueError,'反向'):self.trade('s','sell')

    def test_stop_auto_but_manual_allowed(self):
        self.task.enabled=False;self.task.save()
        op={'side':'buy','code':'000001','name':'平安银行','quantity':1,'reason':'test','day':'2026-09-28','analysis':{}}
        q={'code':'000001','name':'平安银行','price':'10','date':'2026-09-25','source':'BaoStock'}
        with self.assertRaisesRegex(ValueError,'停用'):commit(self.decision,self.agent,'x',op,q,'2026-09-29','test',False)
        self.trade()

    def test_cross_account_and_unbind(self):
        self.task.agent_ids=['unbound'];self.task.save()
        with self.assertRaisesRegex(ValueError,'解绑'):self.trade()
        user=User.objects.create_user('other','o@example.invalid','test');self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/settings/agent-world/investment/overview/',{'actor_id':self.agent.pk}).status_code,404)

    def test_daily_news_once_failed_no_retry(self):
        with patch('system_settings.agent_world.publish_search.search',side_effect=ValueError('failed')) as search:
            first=news('admin',{},time.monotonic()+20);second=news('admin',{},time.monotonic()+20)
        self.assertEqual(first['status'],'failed');self.assertEqual(second['status'],'failed')
        self.assertEqual(search.call_count,1);self.assertEqual(InvestmentNewsClaim.objects.count(),1)

    def test_success_news_cache_is_local_and_shared(self):
        with patch('system_settings.agent_world.publish_search.search',return_value=[{'title':'市场','summary':'body','url':'https://example.com','published_at':None}]) as search:
            first=news('admin',{},time.monotonic()+20);self.assertEqual(first,news('admin',{},time.monotonic()+20))
        self.assertEqual(search.call_count,1)
        InvestmentCache.objects.filter(pk__startswith='investment-news:').delete()
        self.assertEqual(news('admin',{},time.monotonic()+20)['items'],[])

    def test_on_demand_indicators_limit(self):
        executor=InvestmentTools(self.decision,self.agent,'test',True,time.monotonic()+100)
        with patch('system_settings.agent_world.investment_tools.analyze',return_value={'indicators':{}}) as analyze:
            for code in ('000001','000002','000003'):executor.execute('analyze_stock',{'code':code})
            out=executor.execute('analyze_stock',{'code':'000004'})
        self.assertIn('error',out);self.assertEqual(analyze.call_count,3)

    def test_tool_limit(self):
        ex=InvestmentTools(self.decision,self.agent,'test',True,time.monotonic()+100)
        ex.call_count=20
        with self.assertRaises(Finished):ex.execute('account',{})

    def test_portfolio_query_does_not_fetch_providers(self):
        self.trade(quantity=2)
        with patch('system_settings.agent_world.investment_data.provider',side_effect=AssertionError('must not call')):
            response=self.client.get('/api/settings/agent-world/investment/overview/',{'actor_id':self.agent.pk})
        self.assertEqual(response.status_code,200)
        self.assertEqual(overview('admin',self.agent.pk)['positions']['items'][0]['available_quantity'],0)

    def test_sync_replays_cost_ledger_energy_and_interrupts(self):
        self.trade(quantity=10,available='2026-09-28')
        self.trade('b',quantity=5,price='12',available='2026-09-28')
        self.trade('s','sell',5,price='12',decision=self.make_decision('op2'))
        before=copy.deepcopy(InvestmentAccount.objects.get(pk=self.agent.pk).positions)
        WorldLedger.objects.filter(kind='investment').delete()
        WorldAction.objects.filter(snapshot__investment_energy=True).delete()
        reconcile_investments()
        self.assertEqual(InvestmentAccount.objects.get(pk=self.agent.pk).positions,before)
        self.assertEqual(WorldLedger.objects.filter(kind='investment').count(),3)
        self.assertEqual(WorldAction.objects.filter(snapshot__investment_energy=True).count(),2)
        self.decision.refresh_from_db();self.assertEqual(self.decision.status,'interrupted')

    def test_sync_rejects_deleted_all_trades(self):
        self.trade()
        InvestmentTrade.objects.all().delete()
        from utils.sync_manager import SyncError
        with self.assertRaises(SyncError):reconcile_investments()

    def test_deleted_agent_keeps_assets_and_history(self):
        self.trade()
        key=self.agent.pk;self.agent.delete()
        self.assertTrue(InvestmentAccount.objects.filter(pk=key).exists())
        self.assertEqual(InvestmentTrade.objects.count(),1)
        self.assertEqual(overview('admin',key)['actor_name'],'小橘')

    def test_weekend_runner_skips_without_provider(self):
        from .investment_runner import run_investment_opportunity
        with patch('system_settings.agent_world.investment_runner.local_day',return_value=date(2026,10,3)),patch('system_settings.agent_world.investment_runner.reference_day',side_effect=AssertionError):
            record=run_investment_opportunity(self.task,manual=True)
        self.assertIn('周末',record.summary)

    def test_bao_filters_stock_types_and_status(self):
        with patch('system_settings.agent_world.investment_data.reference_day',return_value=date(2026,9,25)),patch('system_settings.agent_world.investment_data.provider',return_value=[
            {'code':'sz.000001','code_name':'平安银行','type':'1','status':'1'},
            {'code':'sh.000001','code_name':'上证指数','type':'2','status':'1'},
            {'code':'sh.900901','code_name':'沪B','type':'1','status':'1'},
            {'code':'sz.200001','code_name':'深B','type':'1','status':'1'},
            {'code':'sz.000002','code_name':'退市','type':'1','status':'0'}]):
            self.assertEqual(len(stock_directory()),1)

    def test_missing_reference_day_rejects_quote(self):
        with patch('system_settings.agent_world.investment_data.history',return_value=[{'date':'2026-09-24','close':'10','volume':'1'}]):
            with self.assertRaisesRegex(ValueError,'参考日'):quote('000001',date(2026,9,25))

    def test_task_api_creates_builtin_once_and_owner_is_server_side(self):
        from utils.drf_utils import get_current_user_identifier
        payload={'agent':self.agent.pk,'name':'ignored','task_kind':'investment','agents':[self.agent.pk],'trigger':'定时任务','schedule_mode':'fixed','investment_config':{'owner_id':'forged'}}
        response=self.client.post('/api/settings/agent-tasks/',payload,format='json')
        self.assertEqual(response.status_code,200,response.data)
        again=self.client.post('/api/settings/agent-tasks/',payload,format='json')
        self.assertEqual(again.status_code,200,again.data)
        self.assertEqual(AgentTask.objects.filter(task_kind='investment',investment_config__owner_id='admin').count(),1)

    def test_news_service_save_reopen_preserve_and_clear(self):
        from system_settings.models import MCPServer
        server = MCPServer.objects.create(name='新闻搜索', transport='streamableHttp', enabled=True,
            tools=[{'name': 'tavily_search', 'enabled': True}])
        url = f'/api/settings/agent-tasks/{self.task.pk}/'
        response = self.client.put(url, {'name': self.task.name, 'agent': self.agent.pk, 'agents': [self.agent.pk],
            'taskKind': 'investment', 'investmentConfig': {'searchServerId': server.pk}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.task.refresh_from_db()
        self.assertEqual(self.task.investment_config, {'owner_id': 'admin', 'search_server_id': server.pk})
        # 检查真正渲染给前端的驼峰字段，确保保存后重新打开能回显。
        self.assertEqual(self.client.get(url).json()['data']['investmentConfig']['searchServerId'], server.pk)
        response = self.client.patch(url, {'notifyEnabled': False}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.client.get(url).json()['data']['investmentConfig']['searchServerId'], server.pk)
        response = self.client.patch(url, {'investmentConfig': {'searchServerId': ''}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.task.refresh_from_db()
        self.assertEqual(self.task.investment_config['search_server_id'], '')
        self.assertEqual(self.client.get(url).json()['data']['investmentConfig']['searchServerId'], '')

    def test_model_runner_trade_then_finish(self):
        from .investment_runner import run_investment_opportunity
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='',until=None)
        def model(messages,tools,execute,**kwargs):
            result=execute('buy_stock',{'code':'000001','quantity':1,'reason':'银行行业机会'})
            self.assertNotIn('error',result)
            execute('finish',{'reason':'买入1股后观察'})
        q={'code':'000001','name':'平安银行','price':'10','date':'2026-09-28','source':'BaoStock'}
        with patch('system_settings.agent_world.investment_runner.reference_day',return_value=date(2026,9,28)),patch('system_settings.agent_world.investment_service.quote',return_value=q),patch('system_settings.agent_world.investment_service.next_trade_day',return_value='2026-09-29'),patch('system_settings.agent_world.investment_runner.AIService.chat_completion_messages_with_tools',side_effect=model):
            record=run_investment_opportunity(self.task,manual=True)
        self.assertEqual(record.status,'success',record.summary)
        self.assertEqual(InvestmentTrade.objects.count(),1)
        self.assertEqual(InvestmentTrade.objects.get().result['price_date'],'2026-09-28')

    def test_restore_during_reference_query_revokes_preparation(self):
        from utils.sync_manager import SyncManager
        from .investment_runner import run_investment_opportunity
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='',until=None)

        def restore(day):
            manager=SyncManager()
            snapshot=manager.build_snapshot_data()
            self.assertFalse(InvestmentDecision.objects.filter(pk='preparing').exists())
            manager.apply_snapshot_data(snapshot)
            return date(2026,9,25)

        with patch('system_settings.agent_world.investment_runner.reference_day',side_effect=restore), patch('system_settings.agent_world.investment_runner.AIService.chat_completion_messages_with_tools') as model:
            record=run_investment_opportunity(self.task,key='preparing',manual=True)
        model.assert_not_called()
        self.assertEqual(record.status,'failed')
        self.assertIn('授权已失效',record.summary)
        self.assertFalse(InvestmentDecision.objects.filter(pk='preparing').exists())
        self.assertFalse(InvestmentTrade.objects.exists())
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money,10000)
        self.assertFalse(InvestmentCache.objects.filter(pk__startswith='investment-execution:').exists())

    def test_restore_revokes_only_matching_investment_credentials(self):
        from .investment_execution import PREFIX
        other=Agent.objects.create(name='其他任务居民',model=self.agent.model)
        AgentExecutionLease.objects.create(agent=other,token='other',until=NOW+timedelta(minutes=10))
        InvestmentCache.objects.create(pk=PREFIX+'active',payload={'actor_id':self.agent.pk,'token':'test'},expires_at=NOW+timedelta(minutes=10))
        # An expired registration must not revoke a newer unrelated lease.
        InvestmentCache.objects.create(pk=PREFIX+'old',payload={'actor_id':other.pk,'token':'previous'},expires_at=NOW)
        reconcile_investments()
        self.assertEqual(AgentExecutionLease.objects.get(agent=self.agent).token,'')
        self.assertEqual(AgentExecutionLease.objects.get(agent=other).token,'other')

    def test_restore_before_lease_closes_claimed_opportunity(self):
        from utils.sync_manager import SyncManager
        from .investment_execution import investment_lease
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='',until=None)
        WorldAction.objects.create(pk='claimed-investment',task=self.task,agent=self.agent,actor_id=self.agent.pk,snapshot={'investment':True})
        manager=SyncManager()
        manager.apply_snapshot_data(manager.build_snapshot_data())
        with self.assertRaisesRegex(ValueError,'机会已结束'):
            with investment_lease(self.agent,'claimed-investment'):
                self.fail('restored opportunity cannot acquire a new lease')
        self.assertEqual(AgentExecutionLease.objects.get(agent=self.agent).token,'')

    def test_valuation_uses_newest_known_close(self):
        self.trade()
        InvestmentCache.objects.create(pk='investment-value:000001',payload={'price':'8','date':'2026-09-24'},expires_at=NOW+timedelta(days=30))
        self.account.refresh_from_db()
        row=positions(self.account)[0]
        self.assertEqual((row['close_price'],row['price_date'],Decimal(row['unrealized_profit'])),('10','2026-09-25',Decimal(0)))
        InvestmentCache.objects.filter(pk='investment-value:000001').update(payload={'price':'11','date':'2026-09-28'})
        row=positions(self.account)[0]
        self.assertEqual((row['close_price'],row['price_date'],Decimal(row['unrealized_profit'])),('11','2026-09-28',Decimal(1)))
        self.assertEqual(Decimal(row['market_value']),Decimal(row['close_price'])*row['quantity'])

    def test_reference_day_excludes_intraday_and_uses_published_evening_close(self):
        bars=[{'date':'2026-09-25','close':'3000','tradestatus':'1'},
              {'date':'2026-09-28','close':'3010','tradestatus':'1'}]
        with patch('system_settings.agent_world.investment_data.calendar',return_value=['2026-09-25','2026-09-28']), \
             patch('system_settings.agent_world.investment_data.provider',return_value=bars) as provider:
            self.assertEqual(reference_day(date(2026,9,28)),date(2026,9,25))
            self.assertEqual(provider.call_args.kwargs['end_date'],'2026-09-25')
            with patch('django.utils.timezone.now',return_value=NOW.replace(hour=20)):
                self.assertEqual(reference_day(date(2026,9,28)),date(2026,9,28))
                self.assertEqual(reference_day(date(2026,9,28)),date(2026,9,28))
            self.assertEqual(provider.call_count,2)

    def test_delayed_publication_retries_instead_of_caching_yesterday_all_evening(self):
        evening=NOW.replace(hour=17,minute=30)
        old=[{'date':'2026-09-25','close':'3000','tradestatus':'1'}]
        new=old+[{'date':'2026-09-28','close':'3010','tradestatus':'1'}]
        with patch('system_settings.agent_world.investment_data.calendar',return_value=['2026-09-25','2026-09-28']), \
             patch('system_settings.agent_world.investment_data.provider',side_effect=[old,new]) as provider:
            with patch('django.utils.timezone.now',return_value=evening):
                self.assertEqual(reference_day(date(2026,9,28)),date(2026,9,25))
            with patch('django.utils.timezone.now',return_value=evening+timedelta(minutes=2)):
                self.assertEqual(reference_day(date(2026,9,28)),date(2026,9,28))
            self.assertEqual(provider.call_count,2)

    def test_reference_holiday_uses_published_day_and_network_failure_is_not_fallback(self):
        with patch('system_settings.agent_world.investment_data.calendar',return_value=['2026-09-25','2026-09-28','2026-09-30','2026-10-09']), \
             patch('system_settings.agent_world.investment_data.provider',return_value=[{'date':'2026-09-30','close':'3000','tradestatus':'1'}]):
            self.assertEqual(reference_day(date(2026,10,5)),date(2026,9,30))
        with patch('system_settings.agent_world.investment_data.calendar',return_value=['2026-09-25','2026-09-28']), \
             patch('system_settings.agent_world.investment_data.provider',side_effect=ValueError('network unavailable')):
            with self.assertRaisesRegex(ValueError,'network unavailable'):
                reference_day(date(2026,9,28))

    def test_same_date_close_purchase_has_zero_profit_and_keeps_t_plus_one(self):
        decision=self.make_decision('same-close',ref=date(2026,9,28))
        self.trade(quantity=1400,price='6.95',code='600011',decision=decision)
        self.account.refresh_from_db()
        InvestmentCache.objects.create(pk='investment-value:600011',payload={'price':'6.95','date':'2026-09-28'},expires_at=NOW+timedelta(days=30))
        row=positions(self.account)[0]
        self.assertEqual(Decimal(row['cost']),Decimal('9730'))
        self.assertEqual(Decimal(row['market_value']),Decimal('9730'))
        self.assertEqual(Decimal(row['unrealized_profit']),0)
        self.assertEqual(row['available_quantity'],0)
        self.agent.refresh_from_db();self.assertEqual(self.agent.money,Decimal('270'))

    def test_old_incomplete_history_cache_is_refreshed_and_not_cached_again(self):
        key='investment-bao-history:v1:000001:2026-09-28:raw'
        InvestmentCache.objects.create(pk=key,payload={'rows':[{'date':'2026-09-25','close':'10','volume':'100','trade_status':'1'}]},expires_at=NOW+timedelta(hours=6))
        with patch('system_settings.agent_world.investment_data.stock',return_value={'provider_code':'sz.000001'}), \
             patch('system_settings.agent_world.investment_data.provider',return_value=[{'date':'2026-09-28','close':'11','volume':'100','tradestatus':'1'}]):
            self.assertEqual(history('000001',date(2026,9,28))[-1]['close'],'11')
        InvestmentCache.objects.filter(pk=key).delete()
        with patch('system_settings.agent_world.investment_data.stock',return_value={'provider_code':'sz.000001'}), \
             patch('system_settings.agent_world.investment_data.provider',return_value=[{'date':'2026-09-25','close':'10','volume':'100','tradestatus':'1'}]):
            with self.assertRaisesRegex(ValueError,'参考日'):
                history('000001',date(2026,9,28))
        self.assertFalse(InvestmentCache.objects.filter(pk=key).exists())

    def test_detail_deadline_and_failure_preserve_position(self):
        from .investment_data import QUERY_DEADLINE
        self.trade()
        def slow_calendar(day):
            self.assertGreater(QUERY_DEADLINE.get(),time.monotonic()+110)
            raise ValueError('BaoStock 行情查询超时')
        with patch('system_settings.agent_world.investment_data.reference_day',side_effect=slow_calendar):
            response=self.client.get('/api/settings/agent-world/investment/detail/',{'actor_id':self.agent.pk,'code':'000001'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['data']['position']['quantity'],1)
        self.assertIn('analysis_error',response.data['data'])
        self.assertIsNone(QUERY_DEADLINE.get())

    def test_expired_opportunity_cannot_trade(self):
        self.decision.created_at=NOW-timedelta(minutes=5)
        self.decision.save(update_fields=['created_at'])
        with self.assertRaisesRegex(ValueError,'5分钟'):self.trade()
        self.assertFalse(InvestmentTrade.objects.exists())

    def test_news_quota_missing_from_restore_rejected(self):
        from utils.sync_manager import SyncError
        with patch('system_settings.agent_world.publish_search.search',side_effect=ValueError('unavailable')):
            news('admin',{},time.monotonic()+20)
        reconcile_investments()
        InvestmentNewsClaim.objects.all().delete()
        with self.assertRaises(SyncError):reconcile_investments()

    def test_full_snapshot_roundtrip_excludes_cache_and_preserves_assets(self):
        from utils.sync_manager import SyncManager
        self.trade()
        with patch('system_settings.agent_world.publish_search.search',return_value=[]):
            news('admin',{},time.monotonic()+20)
        manager=SyncManager()
        snapshot=manager.build_snapshot_data()
        labels={row['model'] for row in snapshot}
        self.assertIn('system_settings.investmentnewsclaim',labels)
        self.assertNotIn('system_settings.investmentcache',labels)
        manager.apply_snapshot_data(snapshot)
        manager.apply_snapshot_data(manager.build_snapshot_data())
        self.agent.refresh_from_db();self.account.refresh_from_db();self.decision.refresh_from_db()
        self.assertEqual(self.agent.money,9990)
        self.assertEqual(self.account.positions['000001']['quantity'],1)
        self.assertEqual(self.decision.status,'interrupted')
        self.assertEqual(InvestmentTrade.objects.count(),1)
        self.assertEqual(WorldAction.objects.filter(snapshot__investment_energy=True).count(),1)

    def test_incomplete_snapshot_rolls_back_all_changes(self):
        from utils.sync_manager import SyncManager, SyncError
        from .investment_execution import PREFIX
        self.trade()
        InvestmentCache.objects.create(pk=PREFIX+'active',payload={'actor_id':self.agent.pk,'token':'test'},expires_at=NOW+timedelta(minutes=10))
        manager=SyncManager()
        snapshot=[r for r in manager.build_snapshot_data() if r['model']!='system_settings.investmenttrade']
        with self.assertRaises(SyncError):manager.apply_snapshot_data(snapshot)
        self.agent.refresh_from_db();self.account.refresh_from_db();self.decision.refresh_from_db()
        self.assertEqual(self.agent.money,9990)
        self.assertEqual(self.account.positions['000001']['quantity'],1)
        self.assertEqual(self.decision.status,'running')
        self.assertEqual(InvestmentTrade.objects.count(),1)
        self.assertEqual(AgentExecutionLease.objects.get(agent=self.agent).token,'test')
        self.assertTrue(InvestmentCache.objects.filter(pk=PREFIX+'active').exists())

    def test_provider_timeout_and_history_cache(self):
        import subprocess
        from .investment_data import provider
        with patch('subprocess.run',side_effect=subprocess.TimeoutExpired('bao',30)):
            with self.assertRaisesRegex(ValueError,'超时'):provider('query_stock_basic')
        with patch('system_settings.agent_world.investment_data.stock',return_value={'provider_code':'sz.000001'}),patch('system_settings.agent_world.investment_data.provider',return_value=[{'date':'2026-09-25','close':'10','volume':'100','tradestatus':'1'}]) as p:
            first=history('000001',date(2026,9,25))
            self.assertEqual(first,history('000001',date(2026,9,25)))
            p.assert_called_once()

    def test_valuation_failure_retains_previous_then_retries(self):
        from .investment_worker import tick_values
        self.trade()
        InvestmentCache.objects.create(pk='investment-value:000001',payload={'price':'9','date':'2026-09-25'},expires_at=NOW+timedelta(days=30))
        evening=NOW.replace(hour=17)
        with patch('django.utils.timezone.now',return_value=evening),patch('system_settings.agent_world.investment_worker.reference_day',return_value=date(2026,9,28)),patch('system_settings.agent_world.investment_worker.history',side_effect=ValueError('not ready')) as h:
            tick_values();tick_values();h.assert_called_once()
        self.assertEqual(InvestmentCache.objects.get(pk='investment-value:000001').payload['price'],'9')
        with patch('django.utils.timezone.now',return_value=evening+timedelta(minutes=2)),patch('system_settings.agent_world.investment_worker.reference_day',return_value=date(2026,9,28)),patch('system_settings.agent_world.investment_worker.history',return_value=[{'date':'2026-09-28','close':'12'}]):
            tick_values()
        self.assertEqual(InvestmentCache.objects.get(pk='investment-value:000001').payload['price'],'12')

    def test_valuation_catches_up_to_published_close_on_weekend_morning(self):
        from .investment_worker import tick_values
        self.trade()
        saturday=datetime(2026,10,3,10)
        with patch('django.utils.timezone.now',return_value=saturday), \
             patch('system_settings.agent_world.investment_worker.reference_day',return_value=date(2026,9,30)), \
             patch('system_settings.agent_world.investment_worker.history',return_value=[{'date':'2026-09-30','close':'12'}]) as history_call:
            tick_values()
        history_call.assert_called_once_with('000001',date(2026,9,30))
        self.assertEqual(InvestmentCache.objects.get(pk='investment-value:000001').payload,{'price':'12','date':'2026-09-30'})


class InvestmentConcurrencyTests(TransactionTestCase):
    setUp = InvestmentTests.setUp
    make_decision = InvestmentTests.make_decision
    trade = InvestmentTests.trade

    def test_competing_orders_cannot_overspend(self):
        from concurrent.futures import ThreadPoolExecutor
        from django.db import close_old_connections
        def buy(key):
            close_old_connections()
            try:
                return self.trade(key,quantity=600)
            except ValueError as exc:
                return {'error':str(exc)}
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes=list(pool.map(buy,['race1','race2']))
        self.assertEqual(sum('error' in r for r in outcomes),1,outcomes)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money,4000)
        self.assertEqual(InvestmentTrade.objects.count(),1)

    def test_news_claim_concurrent_once(self):
        from concurrent.futures import ThreadPoolExecutor
        from django.db import close_old_connections
        def read_news(_):
            close_old_connections()
            try:return news('admin',{},time.monotonic()+20)
            finally:close_old_connections()
        with patch('system_settings.agent_world.publish_search.search',return_value=[]) as search:
            with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(read_news,range(2)))
        search.assert_called_once()
        self.assertEqual(InvestmentNewsClaim.objects.count(),1)
        reconcile_investments()

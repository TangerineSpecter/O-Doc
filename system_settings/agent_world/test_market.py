"""Market tests run exclusively under book_analysis.test_settings and never call providers."""
import copy
import uuid
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase, SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentTask, AIModel, AIProvider, AgentExecutionLease, WorldAction, WorldActionRuntime, SystemSetting
from .farm_service import ensure_farms, commit_operation
from .farm_models import AgentFarm
from .farm_catalog import DEFAULT_RULES, catalog_for
from .farm_runner import candidates
from .inventory_stock import add_stock, stock_quantity
from .travel_models import AgentInventoryItem
from .market_models import MarketBatch, MarketConfig, MarketListing, MarketSession, MarketTransaction, MarketRuntime, MarketIntegrity
from .market_shop import current_batch, price_weights
from .market_sessions import enter, close_session, cleanup
from .market_tools import call_market_tool, request_key
from .market_service import trade
from .market_sync import reconcile_market
from .market_runner import run_market_opportunity
from .execution import stamina
from .models import WorldLedger


class WeightTests(SimpleTestCase):
    def test_inverse_square_root_weights(self):
        self.assertEqual(price_weights([{'price':'100'},{'price':'400'}]), [.1,.05])


class MarketTests(TestCase):
    def test_task_model_override_records_actual_model_without_agent_default(self):
        close_session(self.sa, 'done')
        close_session(self.sb, 'done')
        override = AIModel.objects.create(provider=self.a.model.provider, name='market-task-model', type='chat')
        original = self.a.model
        self.task.model = override
        self.task.save()
        def choose(task, *, cost, qualifies):
            self.assertTrue(qualifies(self.a))
            return self.a
        for default in (original, None):
            with self.subTest(default=default):
                self.a.model = default
                self.a.save()
                with patch('system_settings.agent_world.market_runner.select_agent', side_effect=choose), \
                     patch('system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools', return_value='本次不交易') as model:
                    record = run_market_opportunity(self.task, key=f'override-{bool(default)}', manual=True)
                self.assertEqual(record.status, 'success', record.summary)
                self.assertEqual(model.call_args.kwargs['model_id'], override.pk)
                self.assertEqual(record.agent_runs[0]['modelName'], override.name)

    def setUp(self):
        self.user = User.objects.create_superuser('admin','market@example.invalid','market-test')
        self.client = APIClient(); self.client.force_authenticate(self.user)
        provider = AIProvider.objects.create(name='test',type='OpenAi',base_url='https://example.invalid')
        model = AIModel.objects.create(name='test',type='chat',provider=provider)
        self.a = Agent.objects.create(name='A',model=model,money=10000)
        self.b = Agent.objects.create(name='B',model=model,money=10000)
        self.task = AgentTask.objects.create(id='builtin-market',name='市场交易',task_kind='market',agent=self.a,
            agent_ids=[self.a.pk,self.b.pk],enabled=True,market_config={'owner_id':'admin'})
        self.farm_task = AgentTask.objects.create(id='builtin-farm',name='农场经营',task_kind='farm',agent=self.a,
            agent_ids=[self.a.pk,self.b.pk],enabled=True,farm_config={'owner_id':'admin'})
        ensure_farms(self.farm_task)
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True,'apiKey':'test-key'})
        WorldActionRuntime.objects.create(pk='world',enabled=True)
        self.now = timezone.now()
        self.shop = current_batch('admin',self.now)
        self.shop.slots=[{'id':'0','sku':'seed.radish','name':'萝卜种子','kind':'seed','price':'10','initial_quantity':2,'remaining_quantity':2},
            {'id':'1','sku':'animal.chicken','name':'鸡','kind':'animal','price':'150','rules':DEFAULT_RULES['animals']['chicken'],'initial_quantity':1,'remaining_quantity':1}]
        self.shop.save()
        self.sa = enter('admin',self.a,'session-a',task=self.task,mode='manual',now=self.now)
        self.sb = enter('admin',self.b,'session-b',task=self.task,mode='manual',now=self.now)

    def operation(self, actor, session, key, kind, **arguments):
        return trade(session,actor,key,{'kind':kind,**arguments},now=self.now)

    def add(self, actor, sku='crop.radish', count=3, value=18):
        return add_stock(actor.pk,'admin',actor.name,sku,count,'萝卜' if sku.startswith('crop.') else '金色鸡蛋','farm_crop',value)

    def life_item(self, budget=0):
        from .life_models import LifeItem
        return LifeItem.objects.create(id=uuid.uuid4().hex, owner_id='admin', actor_id=self.a.pk,
            original_at=self.now, scheduled_at=self.now, activity='market_prepare',
            task_id=self.task.pk, status='running', budget=budget, context={'manual': True})

    def test_zero_budget_precheck_then_adjust_and_buy_with_live_feedback(self):
        from .life_scope import life_scope
        from .life_budget import budget_tool
        from .market_spending import MarketPurchaseBlocked
        item = self.life_item()
        args = {'request_id': 'budget-feed', 'batch_id': self.shop.pk, 'slot_id': 'feed', 'quantity': 2}
        with life_scope(item, {}):
            with self.assertRaises(MarketPurchaseBlocked) as caught:
                call_market_tool('buy_market_shop', args, self.a)
            self.assertEqual(caught.exception.result['spending']['spendable'], '0')
            self.sa.refresh_from_db()
            self.assertEqual(self.sa.call_count, 0)
            self.assertFalse(MarketTransaction.objects.exists())
            self.assertEqual(stock_quantity(self.a.pk, 'admin', 'feed'), 0)
            budget_tool({'allocations': [{'id': item.pk, 'budget': '20'}], 'reason': '购买农场饲料'})
            result = call_market_tool('buy_market_shop', args, self.a)
            self.assertEqual(Decimal(result['spending']['spendable']), 10)
            self.assertEqual(Decimal(result['spending']['spent']), 10)
            # 上下文查询重新读取预算，不沿用 life_scope 的初始快照。
            budget_tool({'allocations': [{'id': item.pk, 'budget': '30'}], 'reason': '补充饲料预算'})
            context = call_market_tool('get_market_context', {}, self.a)
            self.assertEqual(Decimal(context['spending']['spendable']), 20)
        self.a.refresh_from_db()
        self.assertEqual(self.a.money, 9990)

    def test_precheck_preserves_other_commitments_and_allows_smaller_purchase(self):
        from .life_scope import life_scope
        from .market_spending import MarketPurchaseBlocked
        item = self.life_item(100)
        self.life_item(9950)
        args = {'request_id': 'too-much', 'batch_id': self.shop.pk, 'slot_id': 'feed', 'quantity': 11}
        with life_scope(item, {}):
            with self.assertRaises(MarketPurchaseBlocked) as caught:
                call_market_tool('buy_market_shop', args, self.a)
            self.assertEqual(Decimal(caught.exception.result['spending']['spendable']), 50)
            result = call_market_tool('buy_market_shop', {**args, 'quantity': 10}, self.a)
            self.assertEqual(Decimal(result['spending']['spendable']), 0)
        item.refresh_from_db()
        self.assertEqual(item.spent, 50)

    def test_slot_precheck_allows_existing_slot_and_feed(self):
        from .market_spending import MarketPurchaseBlocked
        for slot in ('2', '3'):
            self.shop.slots.append({**self.shop.slots[0], 'id': slot})
        self.shop.save()
        base = {'batch_id': self.shop.pk, 'quantity': 1}
        for slot in ('0', '2'):
            call_market_tool('buy_market_shop', {**base, 'request_id': 'slot-'+slot, 'slot_id': slot}, self.a)
        with self.assertRaises(MarketPurchaseBlocked) as caught:
            call_market_tool('buy_market_shop', {**base, 'request_id': 'slot-3', 'slot_id': '3'}, self.a)
        self.assertEqual(caught.exception.result['code'], 'market_slot_limit')
        for slot in ('0', 'feed'):
            result = call_market_tool('buy_market_shop', {**base, 'request_id': 'again-'+slot, 'slot_id': slot}, self.a)
            self.assertEqual(result['spending']['slots_remaining'], 0)
        self.sa.refresh_from_db()
        self.assertEqual(self.sa.call_count, 4)

    def test_runner_stops_repeated_unaffordable_batch_without_market_call_spam(self):
        from .life_scope import life_scope
        close_session(self.sa, 'done')
        close_session(self.sb, 'done')
        item = self.life_item()
        def fake(messages, tools, execute, **kwargs):
            execute('enter_market', {'request_id': 'enter'})
            args = {'request_id': 'blocked-1', 'batch_id': self.shop.pk, 'slot_id': 'feed', 'quantity': 2}
            self.assertEqual(execute('buy_market_shop', args)['code'], 'life_budget_exceeded')
            execute('buy_market_shop', {**args, 'request_id': 'blocked-2'})
            self.fail('重复拦截须终止同一批剩余调用')
        with life_scope(item, {}), patch('system_settings.agent_world.market_runner.select_agent', return_value=self.a), patch(
                'system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools', side_effect=fake):
            record = run_market_opportunity(self.task, key='budget-repeat', manual=True)
        session = MarketSession.objects.get(record=record)
        self.assertEqual(session.status, 'closed')
        self.assertEqual(session.call_count, 0)
        self.assertIn('采购条件未变化', session.reason)
        self.assertFalse(MarketTransaction.objects.exists())

    def test_runner_adjusts_budget_after_precheck_and_continues_purchase(self):
        from .life_scope import life_scope
        close_session(self.sa, 'done')
        close_session(self.sb, 'done')
        item = self.life_item()
        def fake(messages, tools, execute, **kwargs):
            execute('enter_market', {'request_id': 'enter'})
            args = {'request_id': 'recover', 'batch_id': self.shop.pk, 'slot_id': 'feed', 'quantity': 2}
            self.assertEqual(execute('buy_market_shop', args)['code'], 'life_budget_exceeded')
            adjustment = execute('adjust_life_budget', {
                'allocations': [{'id': item.pk, 'budget': '20'}], 'reason': '购置饲料'})
            self.assertEqual(Decimal(adjustment['spending']['spendable']), 20)
            self.assertEqual(execute('buy_market_shop', args)['quantity'], 2)
            execute('leave_market', {'reason': '采购完成'})
        with life_scope(item, {}), patch('system_settings.agent_world.market_runner.select_agent', return_value=self.a), patch(
                'system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools', side_effect=fake):
            record = run_market_opportunity(self.task, key='budget-recover', manual=True)
        session = MarketSession.objects.get(record=record)
        self.assertEqual(session.call_count, 2)
        self.assertEqual(session.reason, '采购完成')
        item.refresh_from_db()
        self.assertEqual(item.spent, 10)
        self.assertEqual(stock_quantity(self.a.pk, 'admin', 'feed'), 2)

    def test_sessions_derive_budget_revisions_without_changing_persisted_calls(self):
        from .life_budget import adjust_budget
        from .market_queries import sessions
        from system_settings.models import AgentRunRecord
        record = AgentRunRecord.objects.create(task=self.task, task_name=self.task.name, agent=self.a)
        self.sa.record = record
        self.sa.save()
        item = self.life_item()
        item.record_id = record.pk
        item.save()
        adjust_budget('admin', self.a.pk, [{'id': item.pk, 'budget': '300'}], '补种预算')
        row = next(r for r in sessions('admin', {})['items'] if r['id'] == self.sa.pk)
        self.assertEqual(row['calls'][0]['name'], 'adjust_life_budget')
        self.assertEqual(row['calls'][0]['result']['budget_after'], '300')
        self.sa.refresh_from_db()
        self.assertEqual(self.sa.calls, [])
        self.assertEqual(self.sa.call_count, 0)

    def test_supply_budget_history_survives_final_activity_record(self):
        from .life_budget import adjust_budget
        from .life_schedule import stable_id
        from .market_queries import sessions
        from system_settings.models import AgentRunRecord
        item = self.life_item()
        item.activity = 'farm'
        item.context = {**item.context, 'execution_key': 'retry-execution'}
        item.save()
        market_record = AgentRunRecord.objects.create(task=self.task, agent=self.a)
        final_record = AgentRunRecord.objects.create(task=self.farm_task, agent=self.a)
        WorldAction.objects.create(pk=stable_id('retry-execution', 'supplies'), task=self.task,
            actor_id=self.a.pk, record=market_record, snapshot={'market': True})
        WorldAction.objects.create(pk='retry-execution', task=self.farm_task, actor_id=self.a.pk, record=final_record)
        self.sa.record = market_record
        self.sa.save()
        adjust_budget('admin', self.a.pk, [{'id': item.pk, 'budget': '300'}], '采购前补预算')
        # 正在执行的安排可能在进入市场前就已完成最后一次预算更新。
        from .life_models import LifeItem
        LifeItem.objects.filter(pk=item.pk).update(status='running', updated_at=self.sa.created_at-timedelta(seconds=1))
        active = next(r for r in sessions('admin', {})['items'] if r['id'] == self.sa.pk)
        self.assertEqual(active['calls'][0]['result']['reason'], '采购前补预算')
        self.sa.ended_at = timezone.now()
        self.sa.save()
        # 完成农场后 record_id 已指向农场；再准备重试时当前执行身份也可能变化。
        item.record_id = final_record.pk
        item.context = {**item.context, 'execution_key': 'next-retry'}
        item.save()
        adjust_budget('admin', self.a.pk, [{'id': item.pk, 'budget': '400'}], '离开市场后调整')
        row = next(r for r in sessions('admin', {})['items'] if r['id'] == self.sa.pk)
        self.assertEqual([call['result']['reason'] for call in row['calls']], ['采购前补预算'])
        self.assertEqual(row['call_count'], 0)
        self.sa.refresh_from_db()
        self.assertEqual(self.sa.calls, [])

    def test_supply_history_uses_persisted_debit_identity_after_retry(self):
        from .life_scope import life_scope
        from .life_budget import adjust_budget
        from .market_queries import sessions
        item = self.life_item()
        with life_scope(item, {}):
            adjust_budget('admin', self.a.pk, [{'id': item.pk, 'budget': '300'}], '购买饲料预算')
            self.operation(self.a, self.sa, 'old-supply-purchase', 'buy_shop',
                batch_id=self.shop.pk, slot_id='feed', quantity=2)
        item.refresh_from_db()
        item.record_id = ''
        item.context = {**item.context, 'execution_key': 'later-execution'}
        item.save()
        row = next(r for r in sessions('admin', {})['items'] if r['id'] == self.sa.pk)
        adjustments = [call for call in row['calls'] if call['name'] == 'adjust_life_budget']
        self.assertEqual(len(adjustments), 1)
        self.assertEqual(adjustments[0]['result']['reason'], '购买饲料预算')
        self.assertEqual(sessions('other-owner', {})['items'], [])

    def test_shared_stock_and_idempotency(self):
        args={'batch_id':self.shop.pk,'slot_id':'0','quantity':1}
        first=self.operation(self.a,self.sa,'buy-a','buy_shop',**args)
        self.assertEqual(first,self.operation(self.a,self.sa,'buy-a','buy_shop',**args))
        self.assertEqual(current_batch('admin',self.now).slots[0]['remaining_quantity'],1)
        self.operation(self.b,self.sb,'buy-b','buy_shop',**args)
        with self.assertRaisesRegex(ValueError,'库存不足'): self.operation(self.a,self.sa,'buy-c','buy_shop',**args)
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),1)
        self.a.refresh_from_db(); self.assertEqual(self.a.money,9990)
        self.assertEqual(MarketTransaction.objects.count(),2)
        with self.assertRaisesRegex(ValueError,'不同参数'):
            self.operation(self.a,self.sa,'buy-a','buy_shop',**{**args,'quantity':2})

    def test_batch_stable_refresh_config_and_prices(self):
        config=MarketConfig.objects.get(pk='admin');config.slot_count=13;config.save()
        rules=catalog_for('admin');rules.rules['feed_price']=9;rules.rules['crops']['radish']['seed_price']=20;rules.save()
        self.assertEqual(current_batch('admin',self.now).slots,self.shop.slots)
        self.assertEqual(current_batch('admin',self.now).feed_price,5)
        next_batch=current_batch('admin',self.shop.expires_at)
        self.assertEqual(len(next_batch.slots),13)
        self.assertEqual(next_batch.feed_price,9)
        self.assertTrue(all(1 <= r['initial_quantity'] <= 3 if r['kind']=='seed' else r['initial_quantity']==1 for r in next_batch.slots))
        self.assertEqual(next_batch.pk,current_batch('admin',self.shop.expires_at+timedelta(minutes=20)).pk)

    def test_expired_shop_quote_no_money_changed(self):
        # Keep the session alive at the next boundary to isolate the quote check.
        future=self.shop.expires_at
        self.sa.expires_at=future+timedelta(minutes=5);self.sa.save()
        AgentExecutionLease.objects.filter(agent=self.a).update(until=future+timedelta(minutes=5))
        with self.assertRaisesRegex(ValueError,'报价已过期'):
            trade(self.sa,self.a,'stale',{'kind':'buy_shop','batch_id':self.shop.pk,'slot_id':'0','quantity':1},now=future)
        self.a.refresh_from_db();self.assertEqual(self.a.money,10000)

    def test_feed_unlimited_and_stack(self):
        for key in ('feed-a','feed-b'):
            self.operation(self.a,self.sa,key,'buy_shop',batch_id=self.shop.pk,slot_id='feed',quantity=4)
        self.assertEqual(stock_quantity(self.a.pk,'admin','feed'),8)
        self.assertEqual(AgentInventoryItem.objects.filter(actor_id=self.a.pk,source__sku='feed').count(),1)

    def test_animal_capacity_failure_is_atomic_and_purchase_works(self):
        args={'batch_id':self.shop.pk,'slot_id':'1','quantity':1}
        with self.assertRaisesRegex(ValueError,'建筑'):self.operation(self.a,self.sa,'animal-fail','buy_shop',**args)
        self.a.refresh_from_db();self.assertEqual(self.a.money,10000)
        self.assertEqual(current_batch('admin',self.now).slots[1]['remaining_quantity'],1)
        farm=AgentFarm.objects.get(pk=self.a.pk);farm.state['buildings']['coop']={'level':1,'capacity':2};farm.save()
        self.operation(self.a,self.sa,'animal-ok','buy_shop',**args)
        farm.refresh_from_db();self.assertEqual(len(farm.state['animals']),1)
        self.assertEqual(farm.state['animals'][0]['half_hearts'],0)
        self.assertEqual(farm.state['market_purchase_keys'],['animal-ok'])

    def test_insufficient_money_no_stock_or_ledger(self):
        self.a.money=0;self.a.save()
        WorldLedger.objects.filter(pk='opening:'+self.a.pk).update(amount=0)
        with self.assertRaisesRegex(ValueError,'余额不足'):
            self.operation(self.a,self.sa,'poor','buy_shop',batch_id=self.shop.pk,slot_id='0',quantity=1)
        self.assertFalse(MarketTransaction.objects.exists())
        self.assertFalse(AgentInventoryItem.objects.filter(actor_id=self.a.pk).exists())

    def test_escrow_partial_purchase_reprice_and_withdraw(self):
        item=self.add(self.a)
        self.operation(self.a,self.sa,'list','list',item_id=item.pk,quantity=3,unit_price='25.50')
        self.assertEqual(stock_quantity(self.a.pk,'admin','crop.radish'),0)
        self.operation(self.b,self.sb,'purchase','buy_listing',listing_id='list',version=1,quantity=1)
        self.a.refresh_from_db();self.b.refresh_from_db()
        self.assertEqual(self.a.money,Decimal('10025.50'));self.assertEqual(self.b.money,Decimal('9974.50'))
        self.assertEqual(stock_quantity(self.b.pk,'admin','crop.radish'),1)
        listing=MarketListing.objects.get(pk='list');created=listing.created_at
        self.operation(self.a,self.sa,'reprice','reprice',listing_id='list',version=2,unit_price='30')
        listing.refresh_from_db();self.assertEqual(listing.created_at,created);self.assertEqual(len(listing.history),1)
        with self.assertRaisesRegex(ValueError,'已变化'):
            self.operation(self.b,self.sb,'stale-price','buy_listing',listing_id='list',version=2,quantity=1)
        self.operation(self.a,self.sa,'withdraw','withdraw',listing_id='list',version=3)
        self.assertEqual(stock_quantity(self.a.pk,'admin','crop.radish'),2)
        listing.refresh_from_db();self.assertEqual(listing.remaining_quantity,0);self.assertEqual(listing.status,'withdrawn')

    def test_fifo_lots_and_gold_resale_values_preserved(self):
        item=self.add(self.a,'product.chicken.gold',2,90)
        self.add(self.a,'product.chicken.gold',1,120)
        self.operation(self.a,self.sa,'gold','list',item_id=item.pk,quantity=3,unit_price='10')
        self.operation(self.b,self.sb,'goldbuy','buy_listing',listing_id='gold',version=1,quantity=3)
        bought=AgentInventoryItem.objects.get(actor_id=self.b.pk,source__sku='product.chicken.gold')
        self.assertEqual(bought.rarity,'rare')
        result=self.operation(self.b,self.sb,'goldsell','sell',item_id=bought.pk,quantity=3)
        self.assertEqual(Decimal(result['total']),300)
        self.b.refresh_from_db();self.assertEqual(self.b.money,10270)

    def test_souvenir_origin_and_icon_survive_transfer(self):
        item=AgentInventoryItem.objects.create(pk='souvenir',owner_id='admin',actor_id=self.a.pk,actor_name='A',origin_actor_id=self.a.pk,
            origin_actor_name='A',name='旅行纪念品',kind='souvenir',quantity=1,value=100,rarity='epic',source={'city':'首尔'},icon_asset_id='icon')
        self.operation(self.a,self.sa,'souvenir-list','list',item_id=item.pk,quantity=1,unit_price='42')
        self.operation(self.b,self.sb,'souvenir-buy','buy_listing',listing_id='souvenir-list',version=1,quantity=1)
        bought=AgentInventoryItem.objects.get(actor_id=self.b.pk)
        self.assertEqual(bought.origin_actor_id,self.a.pk);self.assertEqual(bought.icon_asset_id,'icon');self.assertEqual(bought.source['city'],'首尔')
        with self.assertRaisesRegex(ValueError,'仅回收'): self.operation(self.b,self.sb,'no-recycle','sell',item_id=bought.pk,quantity=1)

    def test_ownership_self_purchase_and_invalid_price(self):
        item=self.add(self.a)
        with self.assertRaises(ValueError):self.operation(self.a,self.sa,'badprice','list',item_id=item.pk,quantity=1,unit_price='NaN')
        self.assertEqual(stock_quantity(self.a.pk,'admin','crop.radish'),3)
        self.operation(self.a,self.sa,'own','list',item_id=item.pk,quantity=1,unit_price='1')
        with self.assertRaisesRegex(ValueError,'自己的商品'):self.operation(self.a,self.sa,'self','buy_listing',listing_id='own',version=1,quantity=1)
        with self.assertRaisesRegex(ValueError,'自己的挂牌'):self.operation(self.b,self.sb,'other','withdraw',listing_id='own',version=1)

    def test_new_harvest_does_not_overwrite_traded_origin(self):
        item=self.add(self.a,count=1)
        self.operation(self.a,self.sa,'origin-list','list',item_id=item.pk,quantity=1,unit_price='20')
        self.operation(self.b,self.sb,'origin-buy','buy_listing',listing_id='origin-list',version=1,quantity=1)
        received=AgentInventoryItem.objects.get(actor_id=self.b.pk)
        produced=self.add(self.b,count=2,value=30)
        received.refresh_from_db()
        self.assertNotEqual(produced.pk,received.pk)
        self.assertEqual(received.quantity,1)
        self.assertEqual(received.origin_actor_id,self.a.pk)
        self.assertEqual(produced.origin_actor_id,self.b.pk)

    def test_enter_once_and_leave_no_refund(self):
        self.assertEqual(enter('admin',self.a,'session-a',task=self.task,mode='manual').pk,self.sa.pk)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True,actor_id=self.a.pk).count(),1)
        self.assertAlmostEqual(stamina(self.a),Decimal(95),places=2)
        close_session(self.sa,'主动离开')
        self.assertFalse(MarketRuntime.objects.filter(pk=self.sa.pk).exists())
        with self.assertRaises(ValueError):self.operation(self.a,self.sa,'afterleave','buy_shop',batch_id=self.shop.pk,slot_id='feed',quantity=1)
        self.assertAlmostEqual(stamina(self.a),Decimal(95),places=2)

    def test_twentieth_call_executes_and_closes(self):
        for index in range(19):call_market_tool('get_market_shop',{'session_id':self.sa.pk},self.a)
        result=call_market_tool('buy_market_shop',{'request_id':'last','session_id':self.sa.pk,'batch_id':self.shop.pk,'slot_id':'feed','quantity':1},self.a)
        self.assertEqual(result['quantity'],1)
        self.sa.refresh_from_db();self.assertEqual(self.sa.call_count,20);self.assertEqual(self.sa.status,'closed')
        self.assertEqual(call_market_tool('buy_market_shop',{'request_id':'last','session_id':self.sa.pk,'batch_id':self.shop.pk,'slot_id':'feed','quantity':1},self.a),result)
        with self.assertRaises(ValueError):call_market_tool('buy_market_shop',{'request_id':'next','session_id':self.sa.pk,'batch_id':self.shop.pk,'slot_id':'feed','quantity':1},self.a)

    def test_disabled_task_or_automatic_switch_ends_session(self):
        close_session(self.sa,'done')
        automatic=enter('admin',self.a,'disabled-auto',task=self.task,mode='automatic')
        self.task.enabled=False;self.task.save()
        cleanup();automatic.refresh_from_db();self.assertEqual(automatic.status,'closed')
        self.sb.refresh_from_db();self.assertEqual(self.sb.status,'active')
        self.task.enabled=True;self.task.save()
        close_session(self.sb,'done')
        automatic=enter('admin',self.b,'auto',task=self.task,mode='automatic')
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        cleanup();automatic.refresh_from_db();self.assertEqual(automatic.status,'closed')

    def test_api_stop_ends_sessions_immediately_and_preserves_manual(self):
        close_session(self.sa,'done')
        automatic=enter('admin',self.a,'task-api-auto',task=self.task,mode='automatic')
        response=self.client.patch(f'/api/settings/agent-tasks/{self.task.pk}/',{'enabled':False},format='json')
        self.assertEqual(response.status_code,200)
        automatic.refresh_from_db();self.sb.refresh_from_db()
        self.assertEqual(automatic.status,'closed');self.assertEqual(self.sb.status,'active')
        close_session(self.sb,'done')
        self.task.refresh_from_db();self.task.enabled=True;self.task.save()
        automatic=enter('admin',self.a,'api-auto',task=self.task,mode='automatic')
        manual=enter('admin',self.b,'api-manual',task=self.task,mode='manual')
        response=self.client.post('/api/settings/agent-tasks/world_runner/',{'enabled':False},format='json')
        self.assertEqual(response.status_code,200)
        automatic.refresh_from_db();manual.refresh_from_db()
        self.assertEqual(automatic.status,'closed');self.assertEqual(manual.status,'active')
        response=self.client.patch(f'/api/settings/agent-tasks/{self.task.pk}/',{'agents':[self.a.pk]},format='json')
        self.assertEqual(response.status_code,200)
        manual.refresh_from_db();self.assertEqual(manual.status,'closed')

    def test_expiry_and_missing_local_credentials(self):
        cleanup(now=self.now+timedelta(minutes=5))
        self.sa.refresh_from_db();self.assertEqual(self.sa.status,'closed')
        other=enter('admin',self.a,'new',task=self.task,mode='manual')
        MarketRuntime.objects.filter(pk=other.pk).delete()
        cleanup();other.refresh_from_db();self.assertEqual(other.status,'closed')

    def test_farm_purchase_sale_removed_but_market_seed_can_plant(self):
        self.operation(self.a,self.sa,'seed','buy_shop',batch_id=self.shop.pk,slot_id='0',quantity=1)
        close_session(self.sa,'leave')
        AgentExecutionLease.objects.filter(agent=self.a).update(token='a',until=self.now+timedelta(minutes=10))
        WorldActionRuntime.objects.filter(pk='world').update(token='w',until=self.now+timedelta(minutes=10))
        for kind in ('buy_supply','buy_animal','sell'):
            with self.assertRaisesRegex(ValueError,'迁移'):
                commit_operation(self.a.pk,'farm-'+kind,0,{'kind':kind},'test',self.farm_task,'a','w')
        farm=AgentFarm.objects.get(pk=self.a.pk)
        self.assertNotIn('buy_supply',{c['operation']['kind'] for c in candidates(farm,10000)})
        commit_operation(self.a.pk,'plant',0,{'kind':'plant','crop':'radish','targets':['0']},'种植',self.farm_task,'a','w')
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),0)

    def test_mcp_scope_context_required_and_account_api(self):
        from system_mcp.views import get_system_mcp_tools_for_scope
        self.assertNotIn('buy_market_shop',{t['name'] for t in get_system_mcp_tools_for_scope('system')})
        self.assertIn('buy_market_shop',{t['name'] for t in get_system_mcp_tools_for_scope('market')})
        with self.assertRaisesRegex(ValueError,'上下文'):call_market_tool('get_market_shop',{},None)
        with self.assertRaises(ValueError):call_market_tool('get_market_shop',{'agent_id':self.b.pk},self.a)
        outsider=User.objects.create_user('outsider');self.client.force_authenticate(outsider)
        response=self.client.get('/api/settings/agent-world/market/sessions/')
        self.assertEqual(response.status_code,200);self.assertEqual(response.data['data']['total'],0)
        self.assertEqual(self.client.post('/api/settings/agent-world/market/shop/',{},format='json').status_code,405)

    def test_config_api_and_task_create_account_scope(self):
        response=self.client.patch('/api/settings/agent-world/market/config/',{'slotCount':12},format='json')
        self.assertEqual(response.status_code,200);self.assertEqual(MarketConfig.objects.get(pk='admin').slot_count,12)
        self.assertEqual(self.client.patch('/api/settings/agent-world/market/config/',{'slotCount':0},format='json').status_code,400)
        response=self.client.patch(f'/api/settings/agent-tasks/{self.task.pk}/',{'prompt':'优先购买萝卜种子'},format='json')
        self.assertEqual(response.status_code,200)

    def test_snapshot_complete_and_incomplete_restore(self):
        from utils.sync_manager import SyncManager, SyncError
        self.operation(self.a,self.sa,'syncbuy','buy_shop',batch_id=self.shop.pk,slot_id='0',quantity=1)
        data=SyncManager().build_snapshot_data()
        labels={r['model'] for r in data}
        self.assertIn('system_settings.markettransaction',labels);self.assertNotIn('system_settings.marketruntime',labels)
        original=stock_quantity(self.a.pk,'admin','seed.radish')
        incomplete=[r for r in data if r['model']!='system_settings.markettransaction']
        with self.assertRaises(SyncError):SyncManager().apply_snapshot_data(incomplete)
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),original)
        close_session(self.sa,'left')
        SyncManager().apply_snapshot_data(data)
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),1)
        cleanup();self.sa.refresh_from_db();self.assertEqual(self.sa.status,'closed')
        self.assertEqual(WorldLedger.objects.filter(kind='market').count(),1)

    def test_snapshot_conflicting_inventory_rejected(self):
        from utils.sync_manager import SyncManager, SyncError
        self.operation(self.a,self.sa,'checkpoint-buy','buy_shop',batch_id=self.shop.pk,slot_id='0',quantity=1)
        data=SyncManager().build_snapshot_data()
        broken=copy.deepcopy(data)
        for row in broken:
            if row['model']=='system_settings.agentinventoryitem':row['fields']['quantity']=99
        with self.assertRaises(SyncError):SyncManager().apply_snapshot_data(broken)
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),1)

    def test_snapshot_missing_all_market_facts_rejected_without_changes(self):
        from utils.sync_manager import SyncManager, SyncError
        self.operation(self.a,self.sa,'missing-facts','buy_shop',batch_id=self.shop.pk,slot_id='0',quantity=1)
        manager=SyncManager()
        absent={'system_settings.marketbatch','system_settings.marketlisting',
                'system_settings.marketsession','system_settings.markettransaction'}
        broken=[row for row in manager.build_snapshot_data() if row['model'] not in absent]
        with self.assertRaises(SyncError):manager.apply_snapshot_data(broken)
        self.a.refresh_from_db();self.assertEqual(self.a.money,9990)
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),1)
        self.assertEqual(MarketTransaction.objects.count(),1)
        self.sa.refresh_from_db();self.assertEqual(self.sa.status,'active')
        self.assertTrue(MarketRuntime.objects.filter(pk=self.sa.pk).exists())

    def test_restore_revokes_old_and_orphan_market_credentials(self):
        from utils.sync_manager import SyncManager
        args={'request_id':'restore-buy','session_id':self.sa.pk,'batch_id':self.shop.pk,'slot_id':'0','quantity':1}
        committed=call_market_tool('buy_market_shop',args,self.a)
        unrelated=Agent.objects.create(name='其他任务居民')
        AgentExecutionLease.objects.create(agent=unrelated,token='other-task',until=self.now+timedelta(minutes=10))
        orphan=Agent.objects.create(name='孤立市场居民')
        AgentExecutionLease.objects.create(agent=orphan,token='orphan-market',until=self.now+timedelta(minutes=10))
        MarketRuntime.objects.create(pk='missing-session',agent_token='orphan-market',process_id=0)
        manager=SyncManager();manager.apply_snapshot_data(manager.build_snapshot_data())
        self.assertFalse(MarketSession.objects.filter(status='active').exists())
        self.assertFalse(MarketRuntime.objects.exists())
        self.assertFalse(AgentExecutionLease.objects.filter(agent_id__in=[self.a.pk,self.b.pk,orphan.pk]).exclude(token='').exists())
        self.assertEqual(AgentExecutionLease.objects.get(agent=unrelated).token,'other-task')
        self.assertEqual(call_market_tool('buy_market_shop',args,self.a),committed)
        with self.assertRaisesRegex(ValueError,'快照恢复'):
            call_market_tool('buy_market_shop',{**args,'request_id':'new-after-restore'},self.a)
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),1)
        self.a.refresh_from_db();self.assertEqual(self.a.money,9990)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(),2)
        manager.apply_snapshot_data(manager.build_snapshot_data())

    def test_failed_retry_consumes_calls_and_records_error(self):
        args={'request_id':'failed-retry','session_id':self.sa.pk,'batch_id':self.shop.pk,'slot_id':'0','quantity':3}
        for _ in range(20):
            with self.assertRaisesRegex(ValueError,'库存不足'):
                call_market_tool('buy_market_shop',args,self.a)
        self.sa.refresh_from_db()
        self.assertEqual(self.sa.call_count,20)
        self.assertEqual(self.sa.status,'closed')
        self.assertIn('库存不足',self.sa.calls[-1]['result']['error'])
        self.assertFalse(MarketTransaction.objects.exists())

    def test_escrow_protects_icon_without_inventory_reference(self):
        from utils.resource_assets import is_asset_used_by_inventory, get_agent_resource_usage
        item=AgentInventoryItem.objects.create(pk='icon-item',owner_id='admin',actor_id=self.a.pk,
            actor_name='A',name='纪念品',kind='souvenir',quantity=1,icon_asset_id='protected')
        self.operation(self.a,self.sa,'icon-list','list',item_id=item.pk,quantity=1,unit_price='20')
        self.assertFalse(AgentInventoryItem.objects.filter(pk=item.pk).exists())
        self.assertTrue(is_asset_used_by_inventory('protected'))
        self.assertEqual(get_agent_resource_usage(['protected'])['protected']['id'],self.a.pk)

    def test_separate_accounts_create_separate_builtin_tasks(self):
        other=User.objects.create_user('other-market')
        self.client.force_authenticate(other)
        other_agent=Agent.objects.create(name='Other',model=self.a.model)
        payload={'name':'市场交易','taskKind':'market','agent':other_agent.pk,'agents':[other_agent.pk],
                 'trigger':'定时任务','enabled':False,'intervalMinutes':60,'scheduleMode':'fixed'}
        response=self.client.post('/api/settings/agent-tasks/',payload,format='json')
        self.assertEqual(response.status_code,200,response.data)
        from utils.drf_utils import get_current_user_identifier
        owner=get_current_user_identifier(SimpleNamespace(user=other))
        task=AgentTask.objects.get(task_kind='market',market_config__owner_id=owner)
        denied=self.client.patch(f'/api/settings/agent-tasks/{task.pk}/',{'agents':[self.a.pk]},format='json')
        self.assertEqual(denied.status_code,400)
        self.assertNotEqual(task.pk,self.task.pk)
        self.assertFalse(task.enabled)
        response=self.client.get('/api/settings/agent-tasks/')
        self.assertNotIn(self.task.pk,[row['id'] for row in response.data['data']])
        self.assertEqual(self.client.patch(f'/api/settings/agent-tasks/{self.task.pk}/',{'enabled':False},format='json').status_code,404)

    def test_trip_blocks_market_without_energy_charge(self):
        close_session(self.sa,'done')
        before=WorldAction.objects.filter(snapshot__market_energy=True).count()
        with patch('system_settings.agent_world.travel_candidates.travelling_ids',return_value={self.a.pk}):
            with self.assertRaisesRegex(ValueError,'旅行'):
                enter('admin',self.a,'travelling',task=self.task,mode='manual')
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(),before)

    def test_reconcile_removes_orphan_money_and_energy(self):
        WorldLedger.objects.create(pk='market:orphan',agent_id=self.a.pk,kind='market',amount=500)
        WorldAction.objects.create(pk='orphan-energy',actor_id=self.a.pk,status='success',energy_cost=5,
            consumed_at=self.now,snapshot={'market_energy':True})
        reconcile_market()
        self.assertFalse(WorldLedger.objects.filter(pk='market:orphan').exists())
        self.assertFalse(WorldAction.objects.filter(pk='orphan-energy').exists())
        self.a.refresh_from_db();self.assertEqual(self.a.money,10000)

    def test_unknown_arguments_cannot_override_operation(self):
        with self.assertRaisesRegex(ValueError,'未知参数'):
            call_market_tool('buy_market_shop',{'request_id':'override','kind':'withdraw','listing_id':'other'},self.a)
        self.assertFalse(MarketTransaction.objects.exists())

    def test_repeated_restore_after_legacy_normalization(self):
        from utils.sync_manager import SyncManager
        self.operation(self.a,self.sa,'legacy-market','buy_shop',batch_id=self.shop.pk,slot_id='0',quantity=1)
        farm=AgentFarm.objects.get(pk=self.a.pk)
        farm.state['inventory_snapshot']=[];farm.save()
        manager=SyncManager()
        manager.apply_snapshot_data(manager.build_snapshot_data())
        manager.apply_snapshot_data(manager.build_snapshot_data())
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),1)

    def test_task_real_tool_loop_and_leave(self):
        close_session(self.sa,'done');close_session(self.sb,'done')
        # Existing session events deliberately suppress the fairness cooldown; advance only the selector clock.
        with patch('system_settings.agent_world.market_runner.select_agent',return_value=self.a):
            def fake(messages,tools,execute,**kwargs):
                session=execute('enter_market',{'request_id':'model'})
                shop=execute('get_market_shop',{})
                result=execute('buy_market_shop',{'request_id':'loop-buy','batch_id':shop['id'],'slot_id':'feed','quantity':2})
                self.assertEqual(result['quantity'],2)
                execute('leave_market',{'reason':'已买好饲料'})
                self.fail('leave must terminate the tool loop')
            with patch.object(__import__('utils.ai_service',fromlist=['AIService']).AIService,'chat_completion_messages_with_tools',side_effect=fake) as model:
                record=run_market_opportunity(self.task,key='loop',manual=True)
                self.assertEqual(record.status,'success');self.assertEqual(model.call_count,1)
                run_market_opportunity(self.task,key='loop',manual=True);self.assertEqual(model.call_count,1)
        self.assertEqual(stock_quantity(self.a.pk,'admin','feed'),2)
        self.assertFalse(MarketSession.objects.filter(record=record,status='active').exists())

    def test_manual_disabled_task_can_trade_with_local_automatic_off(self):
        close_session(self.sa,'done');close_session(self.sb,'done')
        self.task.enabled=False;self.task.save()
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        before=WorldAction.objects.filter(snapshot__market_energy=True).count()
        def fake(messages,tools,execute,**kwargs):
            entered=execute('enter_market',{'request_id':'manual-disabled'})
            self.assertEqual(entered['status'],'active')
            bought=execute('buy_market_shop',{'request_id':'disabled-buy','batch_id':self.shop.pk,'slot_id':'feed','quantity':2})
            self.assertEqual(bought['quantity'],2)
            execute('leave_market',{'reason':'手动采购完成'})
        with patch('system_settings.agent_world.market_runner.select_agent',return_value=self.a), \
             patch('system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools',side_effect=fake) as model:
            record=run_market_opportunity(self.task,key='manual-disabled',manual=True)
            self.assertEqual(record.status,'success');self.assertEqual(model.call_count,1)
            self.assertIsNone(run_market_opportunity(self.task,key='disabled-auto',manual=False))
            self.assertEqual(model.call_count,1)
        self.assertEqual(stock_quantity(self.a.pk,'admin','feed'),2)
        self.a.refresh_from_db();self.assertEqual(self.a.money,9990)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(),before+1)
        self.assertFalse(MarketSession.objects.filter(record=record,status='active').exists())

    def test_real_ai_adapter_with_mock_network_client(self):
        import json
        from unittest.mock import MagicMock
        from utils.ai_service import AIService
        close_session(self.sa,'done');close_session(self.sb,'done')
        calls=[('enter_market',{'request_id':'adapter-enter'}),('get_market_shop',{}),
               ('buy_market_shop',{'request_id':'adapter-buy','batch_id':self.shop.pk,'slot_id':'feed','quantity':2}),
               ('leave_market',{'reason':'买完了'})]
        responses=[]
        for index,(name,args) in enumerate(calls):
            tool=SimpleNamespace(id=str(index),function=SimpleNamespace(name=name,arguments=json.dumps(args)))
            tool.model_dump=lambda index=index,name=name,args=args:{'id':str(index),'type':'function','function':{'name':name,'arguments':json.dumps(args)}}
            responses.append(SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=None,tool_calls=[tool]))]))
        client=MagicMock();client.chat.completions.create.side_effect=responses
        events=[]
        with patch('system_settings.agent_world.market_runner.select_agent',return_value=self.a), \
             patch.object(AIService,'get_client_config_for_model',return_value={'api_key':'mock','base_url':'https://example.invalid','model_name':'mock-model'}), \
             patch('utils.ai_service.OpenAI',return_value=client) as factory, \
             override_settings(SYSTEM_LOG_ENABLED=True), \
             patch('system_logs.capture.start',return_value=SimpleNamespace(put_nowait=events.append)):
            record=run_market_opportunity(self.task,key='real-adapter',manual=True)
        self.assertEqual(record.status,'success')
        self.assertEqual(client.chat.completions.create.call_count,4)
        self.assertEqual(factory.call_args.kwargs['max_retries'],0)
        self.assertTrue(all(0<c.kwargs['timeout']<=120 for c in client.chat.completions.create.call_args_list))
        self.assertEqual(stock_quantity(self.a.pk,'admin','feed'),2)
        self.assertFalse(any(event.get('error_type')=='MarketFinished' or 'MarketFinished' in str(event.get('title','')) for event in events), events)

    def test_skip_never_charges_and_dead_process_closes(self):
        close_session(self.sa,'done');close_session(self.sb,'done')
        before=WorldAction.objects.filter(snapshot__market_energy=True).count()
        with patch('system_settings.agent_world.market_runner.select_agent',return_value=self.a), \
             patch('system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools',return_value='今天不用逛市场'):
            record=run_market_opportunity(self.task,key='skip',manual=True)
        self.assertEqual(record.status,'success')
        self.assertFalse(MarketSession.objects.filter(record=record).exists())
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(),before)
        active=enter('admin',self.a,'dead-process',task=self.task,mode='manual')
        with patch('system_settings.agent_world.market_sessions.os.kill',side_effect=ProcessLookupError):
            cleanup(restart=True)
        active.refresh_from_db();self.assertEqual(active.status,'closed')
        self.assertIn('中断',active.reason)

    def test_model_failure_after_purchase_keeps_trade(self):
        close_session(self.sa,'done');close_session(self.sb,'done')
        with patch('system_settings.agent_world.market_runner.select_agent',return_value=self.a):
            def fake(messages,tools,execute,**kwargs):
                execute('enter_market',{'request_id':'model'})
                execute('buy_market_shop',{'request_id':'before-error','batch_id':self.shop.pk,'slot_id':'feed','quantity':1})
                raise RuntimeError('provider failed')
            with patch('system_settings.agent_world.market_runner.AIService.chat_completion_messages_with_tools',side_effect=fake):
                record=run_market_opportunity(self.task,key='failure',manual=True)
                self.assertEqual(record.status,'failed')
        self.assertEqual(stock_quantity(self.a.pk,'admin','feed'),1)
        self.assertFalse(MarketSession.objects.filter(status='active').exists())


from django.test import TransactionTestCase
from django.db import close_old_connections
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier


class MarketConcurrencyTests(TransactionTestCase):
    def setUp(self):
        MarketTests.setUp(self)

    def test_last_unit_has_only_one_buyer(self):
        self.shop.slots[0]['remaining_quantity']=1;self.shop.save()
        barrier=Barrier(2)
        def buy(pair):
            close_old_connections()
            actor,session=pair
            try:
                barrier.wait()
                return trade(session,actor,'race:'+actor.pk,{'kind':'buy_shop','batch_id':self.shop.pk,'slot_id':'0','quantity':1})
            except ValueError as exc:
                return {'error':str(exc)}
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(buy,[(self.a,self.sa),(self.b,self.sb)]))
        self.assertEqual(sum('error' not in r for r in results),1)
        self.assertEqual(MarketTransaction.objects.count(),1)
        self.assertEqual(sum(Agent.objects.values_list('money',flat=True)),19990)
        self.assertEqual(current_batch('admin').slots[0]['remaining_quantity'],0)

    def test_concurrent_duplicate_commits_once(self):
        def buy(_):
            close_old_connections()
            try:
                return call_market_tool('buy_market_shop',{'request_id':'duplicate','session_id':self.sa.pk,
                    'batch_id':self.shop.pk,'slot_id':'0','quantity':1},self.a)
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(buy,range(2)))
        self.assertEqual(results[0],results[1])
        self.assertEqual(MarketTransaction.objects.count(),1)
        self.sa.refresh_from_db();self.assertEqual(self.sa.call_count,1)
        self.assertEqual(stock_quantity(self.a.pk,'admin','seed.radish'),1)

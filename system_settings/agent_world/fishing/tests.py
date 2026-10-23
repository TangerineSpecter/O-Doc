"""隔离测试库、临时媒体与 fake 决策；不得访问真实供应商。"""
import copy
import random
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentTask, AIProvider, AIModel, WorldAction, WorldActionRuntime, AgentExecutionLease
from ..life_models import LifeConfig, LifeProfile, LifeItem
from ..life_config import DEFAULTS
from ..life_time import SHANGHAI, local_time
from ..market_models import MarketSession, MarketRuntime
from ..market_service import trade
from ..market_shop import current_batch
from ..inventory_stock import stock_quantity
from .catalog import builtin
from .rules import capture_probability, level_for, skill_progress, active, bait_facts, duel_result
from .models import FishingTrip, FishingProfile, FishingEvent, FishingRuntime
from .service import configure, request, finish, retry
from .decisions import prepare_step
from .runner import cast, duel, defer
from .sync import checkpoint_all, database_data, validate_source, validate_conflicts, refresh_merged
from utils.sync_manager import SyncError

NOW = datetime(2026,10,22,10,tzinfo=SHANGHAI)


class FishingRulesTests(SimpleTestCase):
    def test_attribute_growth_projection_and_level_cap(self):
        self.assertEqual(skill_progress(150), {
            'level': 2, 'experience': 150, 'level_experience': 50,
            'next_level_experience': 225, 'progress': .4,
        })
        self.assertEqual(skill_progress(225)['progress'], 0)
        capped = skill_progress(10000000)
        self.assertEqual(capped['level'], 50)
        self.assertEqual(capped['progress'], 1)
        self.assertIsNone(capped['next_level_experience'])
        self.assertEqual(skill_progress(150, maximum=2)['progress'], 1)

    def test_probability_curve_and_future_rod(self):
        self.assertAlmostEqual(capture_probability(10,10), .65)
        for level in range(1,51):
            self.assertGreater(capture_probability(level+1,20), capture_probability(level,20))
            self.assertGreater(capture_probability(level,20,.2), capture_probability(level,20))
            self.assertGreater(capture_probability(level,20), capture_probability(level,21))
            self.assertTrue(.05 <= capture_probability(level,20) <= .95)

    def test_growth_and_night_window(self):
        self.assertEqual(level_for(99), (1,99,100))
        self.assertEqual(level_for(225), (3,0,150))
        self.assertEqual(level_for(10000000)[0],50)
        fish = builtin()['fish']['catfish']
        self.assertTrue(active(fish,NOW.replace(hour=23)))
        self.assertTrue(active(fish,NOW.replace(hour=2)))
        self.assertFalse(active(fish,NOW.replace(hour=5)))

    def test_bait_candidates_and_three_way_duel(self):
        rows = bait_facts(builtin(), {'worm': 12,'minnow':3}, 'pond',NOW,30)
        self.assertIn('worm',rows); self.assertIn('minnow',rows)
        self.assertEqual(rows['minnow']['fish'][0]['id'], 'snakehead')
        counts = {'win':0,'loss':0,'draw':0}
        for a in ('rock','scissors','paper'):
            for b in ('rock','scissors','paper'): counts[duel_result(a,b)] += 1
        self.assertEqual(counts, {'win':3,'loss':3,'draw':3})


@override_settings(USE_TZ=True)
class FishingTests(TestCase):
    def setUp(self):
        self.enterContext(patch('django.utils.timezone.now',return_value=NOW))
        self.enterContext(patch('system_settings.decision.routing.complete',side_effect=AssertionError('不得请求文本模型')))
        self.enterContext(patch('system_settings.agent_world.fishing.decisions.enabled',return_value=True))
        provider = AIProvider.objects.create(name='test',type='OpenAi',base_url='https://example.invalid')
        model = AIModel.objects.create(name='test',type='chat',provider=provider)
        self.agent = Agent.objects.create(name='钓鱼居民',model=model,money=1000)
        LifeConfig.objects.create(pk='admin',migrated=True,settings={**DEFAULTS,'agent_ids':[self.agent.pk],'jev_enabled':True})
        LifeProfile.objects.create(pk=self.agent.pk,owner_id='admin')
        WorldActionRuntime.objects.create(pk='world',enabled=True)
        configure('admin',True)
        self.task = AgentTask.objects.get(task_kind='fishing')
        self.session = MarketSession.objects.create(pk='market-session',owner_id='admin',actor_id=self.agent.pk,
            actor_name=self.agent.name,mode='mcp',expires_at=NOW+timedelta(hours=1))
        AgentExecutionLease.objects.create(agent=self.agent, token='market-test', until=NOW+timedelta(hours=1))
        MarketRuntime.objects.create(pk=self.session.pk,agent_token='market-test',process_id=1)
        self.buy('worm',12)
        self.user = User.objects.create_superuser('admin','test@example.invalid','test')
        self.client = APIClient();self.client.force_authenticate(self.user)

    def buy(self,bait,quantity,number=0):
        from .catalog import BAITS
        quote = {'id':'bait.'+bait,'sku':'bait.'+bait,'kind':'bait','name':BAITS[bait]['name'],'price':BAITS[bait]['price'],'version':1}
        batch = current_batch('admin')
        batch.supplies = [q for q in batch.supplies if q['kind'] != 'bait']+[quote]
        batch.save()
        with patch('system_settings.agent_world.market_service.check_mcp'):
            return trade(self.session,self.agent,f'purchase-{bait}-{number}',{'kind':'buy_shop','batch_id':batch.pk,'slot_id':quote['id'],'quantity':quantity})

    def trip(self,key='plan'):
        self.session.status='closed';self.session.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='',until=None)
        item = LifeItem.objects.create(pk=key,owner_id='admin',actor_id=self.agent.pk,task_id=self.task.pk,
            activity='fishing',original_at=NOW,scheduled_at=NOW,context={'planned_on':NOW.date().isoformat()})
        return request(item)

    def prepared(self,key='plan',bait=''):
        trip = self.trip(key)
        def select(owner,agent,scene,state,choices,**kwargs):
            if scene == 'fishing_bait' and bait and bait in choices: return bait
            return '30' if scene == 'fishing_duration' else 'stop' if 'stop' in choices else next(iter(choices))
        with patch('system_settings.agent_world.fishing.decisions.choose_scene',side_effect=select):
            for _ in range(5): prepare_step(trip.pk)
        trip.refresh_from_db();self.assertEqual(trip.status,'active')
        return trip

    def cast_at(self,trip,minutes=5,kind='empty',success=True):
        fake = random.Random(1)
        outcome = {'kind':kind}
        if kind in ('fish','king'):outcome['fish_id'] = 'crucian' if kind=='fish' else 'golden_carp'
        with patch('system_settings.agent_world.fishing.runner.encounter',return_value=outcome), \
             patch('system_settings.agent_world.fishing.runner.capture_probability',return_value=capture_probability(1,1)):
            if kind=='fish':
                from unittest.mock import Mock
                fake = Mock(); fake.random.return_value=0 if success else .99;fake.uniform.return_value=.3
            cast(trip.pk,now=local_time(trip.departed_at)+timedelta(minutes=minutes),rng=fake)
        trip.refresh_from_db()
        if kind == 'king':
            self.enterContext(patch('django.utils.timezone.now', return_value=local_time(trip.departed_at)+timedelta(minutes=minutes)))

    def king_trip(self):
        point=NOW.replace(hour=17)
        self.enterContext(patch('django.utils.timezone.now',return_value=point))
        self.session.expires_at=point+timedelta(hours=1);self.session.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(until=point+timedelta(hours=1))
        self.buy('minnow',12,10)
        return self.prepared(bait='minnow')

    def test_prepare_three_rounds_and_stop_no_quantity_question(self):
        self.buy('dough',6,1);self.buy('corn',7,2)
        trip = self.trip()
        seen=[]
        def select(owner,agent,scene,state,choices,**kwargs):
            seen.append((scene,state,choices))
            if scene=='fishing_duration':return '30'
            return next(iter(choices))
        with patch('system_settings.agent_world.fishing.decisions.choose_scene',side_effect=select):
            for _ in range(6):prepare_step(trip.pk)
        trip.refresh_from_db()
        self.assertEqual(trip.state['plan']['baits'],['worm','dough','corn'])
        rounds=[r for r in seen if r[0]=='fishing_bait']
        self.assertEqual(len(rounds),3);self.assertNotIn('stop',rounds[0][2]);self.assertIn('stop',rounds[1][2])
        self.assertNotIn('worm',rounds[1][2]);self.assertNotIn('quantity', [r[0] for r in seen])
        self.assertEqual(stock_quantity(self.agent.pk,'admin','bait.worm'),0)

    def test_shorter_duration_preserves_confirmed_baits_and_sync_facts(self):
        for offset, (bait, quantity) in enumerate((('dough', 6), ('corn', 7), ('minnow', 4))):
            with patch('django.utils.timezone.now', return_value=NOW - timedelta(hours=3 - offset)):
                self.buy(bait, quantity, offset + 1)
        config = LifeConfig.objects.get(pk='admin')
        config.settings = {**config.settings, 'active_end': '12:00'}
        config.save()
        for index, baits in enumerate((['worm', 'dough', 'corn'], ['worm'])):
            with self.subTest(baits=baits):
                trip = self.trip(f'shrink-{index}')
                def select(owner, agent, scene, state, choices, **kwargs):
                    if scene == 'fishing_duration': return '120'
                    if scene == 'fishing_bait':
                        return next((bait for bait in baits if bait in choices), 'stop')
                    return 'pond'
                with patch('system_settings.agent_world.fishing.decisions.choose_scene', side_effect=select):
                    for _ in range(5 if len(baits) == 3 else 4): prepare_step(trip.pk)
                trip.refresh_from_db()
                self.assertTrue(trip.state['plan']['complete'])
                self.assertEqual(trip.state['plan']['baits'], baits)
                checkpoint_all(); validate_source(database_data())

                with patch('django.utils.timezone.now', return_value=NOW + timedelta(minutes=70)), \
                     patch('system_settings.agent_world.fishing.decisions.choose_scene', return_value='30') as choice:
                    prepare_step(trip.pk)
                    trip.refresh_from_db()
                    self.assertEqual(trip.state['plan'], {'spot': 'pond', 'minutes': 30, 'baits': baits, 'complete': True})
                    self.assertEqual(choice.call_count, 1)
                    self.assertEqual(choice.call_args.args[2], 'fishing_duration')
                    self.assertEqual(set(choice.call_args.args[4]), {'30'})
                    self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'bait.worm'), 12)
                    checkpoint_all(); validate_source(database_data())
                    self.assert_shortening_facts_reject_invalid_changes(trip)
                    prepare_step(trip.pk)
                trip.refresh_from_db()
                self.assertEqual(trip.status, 'active')
                self.assertEqual(trip.state['plan']['baits'], baits)
                self.assertEqual(stock_quantity(self.agent.pk, 'admin', 'bait.minnow'), 4)
                self.assertEqual(FishingEvent.objects.filter(trip=trip, kind='choice', data__key='bait').count(),
                                 3 if len(baits) == 3 else 2)
                checkpoint_all(); validate_source(database_data())
                finish(trip.pk, '缩时回归结束')

    def assert_shortening_facts_reject_invalid_changes(self, trip):
        source = database_data()
        for key, value in (('value', '60'), ('value', '120'), ('value', '180'),
                           ('previous_minutes', 60), ('legal_minutes', [30, 120])):
            with self.subTest(field=key, invalid=value):
                data = copy.deepcopy(source)
                event = next(row for row in data if row['model'] == 'system_settings.fishingevent'
                             and row['fields']['trip'] == trip.pk
                             and row['fields']['data'].get('previous_minutes') == 120)
                event['fields']['data'][key] = value
                with self.assertRaises(SyncError): validate_source(data, check_digest=False)

    def test_empty_consumption_repeat_guard_and_return_idempotent(self):
        trip=self.prepared();self.cast_at(trip)
        self.assertEqual(trip.state['casts'],1)
        cast(trip.pk,now=NOW+timedelta(minutes=5))
        trip.refresh_from_db();self.assertEqual(trip.state['casts'],1)
        finish(trip.pk,'返回');finish(trip.pk,'返回')
        self.assertEqual(stock_quantity(self.agent.pk,'admin','bait.worm'),11)
        self.assertEqual(WorldAction.objects.filter(pk__startswith='fishing-energy:').count(),1)
        checkpoint_all();validate_source(database_data())

    def test_catch_growth_and_stock_roundtrip(self):
        trip=self.prepared();self.cast_at(trip,kind='fish')
        self.assertEqual(stock_quantity(self.agent.pk,'admin','fish.crucian'),1)
        self.assertEqual(FishingProfile.objects.get(pk=self.agent.pk).experience,12)
        finish(trip.pk,'完成');checkpoint_all();validate_source(database_data())

    def test_escaped_fish_gives_practice_only(self):
        trip=self.prepared();self.cast_at(trip,kind='fish',success=False)
        self.assertEqual(FishingProfile.objects.get(pk=self.agent.pk).experience,2)
        self.assertEqual(stock_quantity(self.agent.pk,'admin','fish.crucian'),0)
        checkpoint_all()

    def test_junk_no_stock_or_experience(self):
        trip=self.prepared();self.cast_at(trip,kind='junk')
        self.assertEqual(FishingProfile.objects.get(pk=self.agent.pk).experience,0)
        self.assertEqual(sum(p['quantity'] for p in trip.state['carried']),11)
        finish(trip.pk,'返回');checkpoint_all()

    def test_deadline_no_offline_catchup(self):
        trip=self.prepared();cast(trip.pk,now=NOW+timedelta(hours=2))
        trip.refresh_from_db();self.assertIsNotNone(trip.ended_at)
        self.assertEqual(trip.state['casts'],0);self.assertEqual(stock_quantity(self.agent.pk,'admin','bait.worm'),12)

    def test_duel_draw_three_wins_and_no_extra_bait(self):
        trip=self.king_trip();self.cast_at(trip,kind='king')
        from unittest.mock import Mock
        rng=Mock();rng.choice.side_effect=['rock','scissors','scissors','scissors'];rng.uniform.return_value=6
        with patch('system_settings.agent_world.fishing.decisions.choose_scene',return_value='rock'):
            for _ in range(4):duel(trip.pk,rng=rng)
        trip.refresh_from_db();self.assertEqual(trip.status,'active')
        self.assertEqual(stock_quantity(self.agent.pk,'admin','fish.golden_carp'),1)
        self.assertEqual(FishingProfile.objects.get(pk=self.agent.pk).experience,(10+12*2)*5)
        self.assertEqual(sum(p['quantity'] for p in trip.state['carried']),11)
        finish(trip.pk,'返回');checkpoint_all()

    def test_duel_three_losses_no_rewards(self):
        trip=self.king_trip();self.cast_at(trip,kind='king')
        from unittest.mock import Mock
        rng=Mock();rng.choice.return_value='paper'
        with patch('system_settings.agent_world.fishing.decisions.choose_scene',return_value='rock'):
            for _ in range(3):duel(trip.pk,rng=rng)
        self.assertEqual(FishingProfile.objects.get(pk=self.agent.pk).experience,0)
        finish(trip.pk,'返回');checkpoint_all()

    def test_decision_failures_pause_and_retry_without_losses(self):
        trip=self.king_trip();self.cast_at(trip,kind='king')
        for _ in range(3):defer(trip.pk,'模拟连接失败')
        trip.refresh_from_db();self.assertEqual(trip.status,'paused');self.assertEqual(trip.state['duel']['losses'],0)
        retry(trip.pk);trip.refresh_from_db();self.assertEqual(trip.status,'duel')
        finish(trip.pk,'技术中断');checkpoint_all()

    def test_cancel_preparation_no_consumption(self):
        trip=self.trip();finish(trip.pk,'取消',cancelled=True)
        self.assertEqual(stock_quantity(self.agent.pk,'admin','bait.worm'),12)
        checkpoint_all()

    def test_cancel_during_model_does_not_restore_choices(self):
        trip=self.trip()
        def select(*args,**kwargs):
            finish(trip.pk,'用户取消',cancelled=True);return 'pond'
        with patch('system_settings.agent_world.fishing.decisions.choose_scene',side_effect=select):prepare_step(trip.pk)
        trip.refresh_from_db();self.assertEqual(trip.state['plan'],{'baits':[]})
        checkpoint_all()

    def test_snapshot_missing_energy_or_carried_or_experience_rejected(self):
        trip=self.prepared();self.cast_at(trip)
        checkpoint_all();data=database_data();validate_source(data)
        broken=[r for r in data if not (r['model']=='system_settings.worldaction' and r['pk'].startswith('fishing-energy:'))]
        with self.assertRaises(SyncError):validate_source(broken,check_digest=False)
        broken=copy.deepcopy(data)
        row=next(r for r in broken if r['model']=='system_settings.fishingtrip');row['fields']['state']['carried'][0]['quantity']+=1
        with self.assertRaises(SyncError):validate_source(broken,check_digest=False)
        broken=copy.deepcopy(data)
        row=next(r for r in broken if r['model']=='system_settings.fishingprofile');row['fields']['experience']=100
        with self.assertRaises(SyncError):validate_source(broken,check_digest=False)

    def test_snapshot_immutable_conflicts_and_newer_version(self):
        trip=self.prepared();checkpoint_all();data=database_data();other=copy.deepcopy(data)
        row=next(r for r in other if r['model']=='system_settings.fishingevent');row['fields']['data']={'key':'spot','value':'river'}
        with self.assertRaises(SyncError):validate_conflicts(data,other)
        with self.assertRaises(SyncError):validate_source(data,{'fishing_schema_version':2})
        refresh_merged(data,{})

    def test_overview_permissions_owner_isolation_and_pagination(self):
        trip=self.prepared()
        self.assertEqual(self.client.get('/api/settings/agent-world/fishing/').status_code,200)
        self.assertEqual(self.client.get('/api/settings/agent-world/fishing/?page=0').status_code,400)
        self.client.force_authenticate(User.objects.create_user('other'))
        self.assertEqual(self.client.get(f'/api/settings/agent-world/fishing/trips/{trip.pk}/').status_code,404)
        self.assertEqual(self.client.post(f'/api/settings/agent-world/fishing/trips/{trip.pk}/recall/').status_code,404)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/settings/agent-world/fishing/').status_code,(401,403))

    def test_occupancy_and_disabled_cleanup(self):
        from ..life_occupancy import occupied
        trip=self.prepared()
        other=LifeItem.objects.create(pk='other',owner_id='admin',actor_id=self.agent.pk,original_at=NOW,scheduled_at=NOW)
        self.assertTrue(occupied(other))
        configure('admin',False)
        trip.refresh_from_db();self.assertIsNotNone(trip.ended_at)
        self.assertEqual(stock_quantity(self.agent.pk,'admin','bait.worm'),12)
        checkpoint_all()

    def test_no_decision_text_fallback(self):
        trip=self.trip()
        with patch('system_settings.agent_world.fishing.decisions.choose_scene',return_value=None):
            from .decisions import DecisionUnavailable
            with self.assertRaises(DecisionUnavailable):prepare_step(trip.pk)
        trip.refresh_from_db();self.assertEqual(trip.state['plan'],{'baits':[]})

    def test_bait_purchase_caps_owned_stock_and_keeps_stable_hourly_quote(self):
        self.buy('worm',87,1)
        self.assertEqual(stock_quantity(self.agent.pk,'admin','bait.worm'),99)
        with self.assertRaisesRegex(ValueError, '最多持有99份'):
            self.buy('worm',1,2)
        one=current_batch('admin');two=current_batch('admin')
        self.assertEqual(one.supplies,two.supplies)
        self.assertEqual(sum(q['kind']=='bait' for q in one.supplies),1)
        self.agent.refresh_from_db();self.assertEqual(self.agent.money,901)
        checkpoint_all()

    def test_full_snapshot_restore_revokes_authority_and_preserves_stock(self):
        from tempfile import TemporaryDirectory
        from utils.sync_manager import SyncManager
        trip=self.prepared();self.cast_at(trip,kind='fish')
        with TemporaryDirectory(prefix='fishing-sync-') as folder, override_settings(MEDIA_ROOT=folder):
            manager=SyncManager();data=manager.build_snapshot_data();meta=manager.build_snapshot_meta(data_list=data)
            self.assertEqual(meta['fishing_schema_version'],1)
            validate_source(data,meta)
            manager.apply_snapshot_data(data,meta)
            self.assertFalse(FishingRuntime.objects.get(pk=trip.pk).authorized)
            self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)
            self.assertEqual(stock_quantity(self.agent.pk,'admin','fish.crucian'),1)
            self.assertEqual(FishingTrip.objects.get(pk=trip.pk).state['casts'],1)

    def test_new_day_excludes_fishing_but_legacy_plan_still_executes(self):
        from ..life_planner import plan_items
        from ..life_runner import execute_item
        item=LifeItem.objects.create(pk='daily',owner_id='admin',actor_id=self.agent.pk,
            original_at=NOW,scheduled_at=NOW)
        config=LifeConfig.objects.get(pk='admin')
        self.session.status='closed';self.session.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='',until=None)
        with patch('system_settings.agent_world.life_planner.ask') as ask:
            plan_items(config,self.agent,[item])
            ask.assert_not_called()
        item.refresh_from_db()
        self.assertEqual(item.activity, 'rest')
        item.activity, item.status, item.task_id = 'fishing', 'pending', self.task.pk
        item.context = {'planned_on': NOW.date().isoformat()}
        item.save()
        self.session.status='closed';self.session.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='',until=None)
        item.refresh_from_db();execute_item(item,None)
        item.refresh_from_db();self.assertEqual(item.status,'running')
        self.assertEqual(FishingTrip.objects.get(life_item_id=item.pk).status,'preparing')

    def test_feed_is_one_trip_and_no_per_cast_spam(self):
        from ..daily_feed import day_events, latest_event_day
        trip=self.prepared();self.cast_at(trip);finish(trip.pk,'回来')
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory
        req=APIRequestFactory().get('/');req.user=self.user
        _,events,_,_,_=day_events(Request(req),'admin',NOW.date())
        self.assertEqual(len([e for e in events if e['category']=='fishing']),1)
        self.assertEqual(latest_event_day(Request(req),'admin',NOW+timedelta(days=1),category='fishing'),NOW.date())

    def test_feed_batches_catch_queries_and_preserves_trip_summaries(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory
        from ..daily_feed import day_events
        req = APIRequestFactory().get('/')
        req.user = self.user
        trip_ids = []
        for count in (1, 2):
            trip = self.prepared(key=f'feed-batch-{count}')
            trip_ids.append(trip.pk)
            self.cast_at(trip, kind='fish' if count == 1 else 'empty')
            finish(trip.pk, '返回')
            with CaptureQueriesContext(connection) as queries:
                _, events, _, _, _ = day_events(Request(req), 'admin', NOW.date())
            catches = [q for q in queries if 'from "system_settings_fishingevent"' in q['sql'].lower()]
            self.assertEqual(len(catches), 1)
            fishing = {event['target']['id']: event for event in events if event['category'] == 'fishing'}
            self.assertEqual(len(fishing), count)
            self.assertIn('鲫鱼', fishing[trip_ids[0]]['detail'])
            if count == 2:
                self.assertIn('尚无收获', fishing[trip.pk]['detail'])

    def test_empty_or_archived_participants_do_not_abort_account_planning(self):
        from ..life_runner import _plan_cycle
        from ..life_schedule import ensure_cycle
        from .service import task_for
        config = LifeConfig.objects.get(pk='admin')
        for archived in (False, True):
            with self.subTest(archived=archived):
                config.settings['agent_ids'] = [self.agent.pk] if archived else []
                config.save()
                if archived:
                    self.agent.archived_at = NOW
                    self.agent.save(update_fields=['archived_at'])
                self.assertIsNone(task_for('admin'))
                with patch('system_settings.agent_world.life_runner.ensure_cycle', wraps=ensure_cycle) as ensure:
                    _plan_cycle(config, None, NOW)
                ensure.assert_called_once()

    def test_capability_refresh_preserves_owner_validation_failures(self):
        from ..life_runner import _plan_cycle
        from ..lottery_service import configure as configure_lottery
        configure_lottery('admin', True)
        LifeProfile.objects.filter(pk=self.agent.pk).update(owner_id='other-owner')
        with self.assertRaisesRegex(ValueError, '其他账号'):
            _plan_cycle(LifeConfig.objects.get(pk='admin'), None, NOW)
        self.assertEqual(LifeProfile.objects.get(pk=self.agent.pk).owner_id, 'other-owner')

    def test_disabled_config_and_missing_bait_are_filtered(self):
        from .service import eligibility
        self.assertEqual(eligibility('admin',self.agent,NOW),'')
        trip=self.prepared()
        self.assertIn('没有鱼饵',eligibility('admin',self.agent,NOW))
        configure('admin',False)
        self.assertIn('尚未启用',eligibility('admin',self.agent,NOW))

    def test_retry_active_trip_cannot_bypass_cast_interval(self):
        trip=self.prepared()
        original=trip.next_tick_at
        with self.assertRaises(ValueError):retry(trip.pk)
        trip.refresh_from_db();self.assertEqual(trip.next_tick_at,original)

    def test_restored_retry_preserves_first_and_subsequent_cast_intervals(self):
        from django.db import transaction
        for prior_casts in (0, 1):
            with self.subTest(prior_casts=prior_casts), transaction.atomic():
                trip = self.prepared(key=f'restored-{prior_casts}')
                if prior_casts:
                    self.cast_at(trip)
                original = local_time(trip.next_tick_at)
                FishingRuntime.objects.filter(pk=trip.pk).update(authorized=False, token='', until=None)
                resumed_at = original - timedelta(minutes=4)
                with patch('django.utils.timezone.now', return_value=resumed_at):
                    response = self.client.post(f'/api/settings/agent-world/fishing/trips/{trip.pk}/retry/')
                    self.assertEqual(response.status_code, 200)
                    cast(trip.pk, now=resumed_at)
                trip.refresh_from_db()
                self.assertEqual(local_time(trip.next_tick_at), original)
                self.assertEqual(trip.state['casts'], prior_casts)
                self.cast_at(trip, minutes=5 * (prior_casts + 1))
                trip.refresh_from_db()
                self.assertEqual(trip.state['casts'], prior_casts + 1)
                with patch('django.utils.timezone.now', return_value=original):
                    finish(trip.pk, '验证恢复后正常返程')
                checkpoint_all()
                validate_source(database_data())

    def test_restored_overdue_trip_casts_once_without_catching_up(self):
        trip = self.prepared()
        self.cast_at(trip)
        FishingRuntime.objects.filter(pk=trip.pk).update(authorized=False, token='', until=None)
        resumed_at = NOW + timedelta(minutes=16)
        with patch('django.utils.timezone.now', return_value=resumed_at), \
             patch('system_settings.agent_world.fishing.runner.encounter', return_value={'kind': 'empty'}):
            retry(trip.pk)
            cast(trip.pk)
            cast(trip.pk)
        trip.refresh_from_db()
        self.assertEqual(trip.state['casts'], 2)
        self.assertEqual(local_time(trip.next_tick_at), resumed_at + timedelta(minutes=5))
        checkpoint_all()

    def test_fish_sale_preserves_discovery_and_sync_balances(self):
        from ..inventory_stock import stock_rows
        from .queries import discovery
        trip=self.prepared();self.cast_at(trip,kind='fish');finish(trip.pk,'返回')
        self.session.status='active';self.session.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='market-test',until=NOW+timedelta(hours=1))
        item=stock_rows(self.agent.pk,'admin','fish.crucian').get()
        with patch('system_settings.agent_world.market_service.check_mcp'):
            trade(self.session,self.agent,'sell-fish',{'kind':'sell','item_id':item.pk,'quantity':1})
        self.assertEqual(stock_quantity(self.agent.pk,'admin','fish.crucian'),0)
        self.assertEqual(discovery('admin',self.agent.pk)['crucian']['count'],1)
        checkpoint_all();validate_source(database_data())

    def test_fish_escrow_and_withdrawal_conserve_assets(self):
        from ..inventory_stock import stock_rows
        from ..market_models import MarketListing
        trip=self.prepared();self.cast_at(trip,kind='fish');finish(trip.pk,'返回')
        self.session.status='active';self.session.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='market-test',until=NOW+timedelta(hours=1))
        item=stock_rows(self.agent.pk,'admin','fish.crucian').get()
        with patch('system_settings.agent_world.market_service.check_mcp'):
            trade(self.session,self.agent,'list-fish',{'kind':'list','item_id':item.pk,'quantity':1,'unit_price':'3'})
            checkpoint_all()
            listing=MarketListing.objects.get(pk='list-fish')
            trade(self.session,self.agent,'withdraw-fish',{'kind':'withdraw','listing_id':listing.pk,'version':listing.version})
        checkpoint_all();self.assertEqual(stock_quantity(self.agent.pk,'admin','fish.crucian'),1)

    def test_missing_bait_purchase_ledger_rejected_even_without_digest(self):
        trip=self.prepared();finish(trip.pk,'返回');checkpoint_all()
        data=[r for r in database_data() if not (r['model']=='system_settings.worldledger' and r['fields']['snapshot'].get('market_transaction_id')=='purchase-worm-0')]
        with self.assertRaises(SyncError):validate_source(data,check_digest=False)

    def test_market_needs_and_hourly_goal_buy_support_bait(self):
        from .market import needs
        from ..market_batch import _goal_buy
        from ..market_plan_models import MarketPlan, MarketGoal
        from ..market_shop import shop_payload
        shop=shop_payload('admin')
        with patch('system_settings.agent_world.fishing.market.inventory',return_value={}):
            rows=needs('admin',self.agent,shop['supplies'])
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['sku'],'bait.worm')
        plan=MarketPlan.objects.create(pk='bait-plan',owner_id='admin',actor_id=self.agent.pk,plan_date=NOW.date(),budget=200)
        goal=MarketGoal.objects.create(pk='bait-goal',owner_id='admin',actor_id=self.agent.pk,plan=plan,
            kind='shop',sku='bait.worm',quantity=150,max_unit_price=1)
        operation=_goal_buy('admin',self.agent.pk,plan,goal,NOW,agent=self.agent)
        self.assertEqual(operation['quantity'],87)
        self.assertEqual(operation['slot_id'],'bait.worm')

    def test_fish_trade_between_residents_keeps_both_balances(self):
        from ..inventory_stock import stock_rows
        from ..market_models import MarketListing
        trip=self.prepared();self.cast_at(trip,kind='fish');finish(trip.pk,'返回')
        self.session.status='active';self.session.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='market-test',until=NOW+timedelta(hours=1))
        fish=stock_rows(self.agent.pk,'admin','fish.crucian').get()
        with patch('system_settings.agent_world.market_service.check_mcp'):
            trade(self.session,self.agent,'listed-transfer',{'kind':'list','item_id':fish.pk,'quantity':1,'unit_price':'3'})
        buyer=Agent.objects.create(name='买鱼居民',model=self.agent.model,money=20)
        LifeProfile.objects.create(pk=buyer.pk,owner_id='admin')
        AgentExecutionLease.objects.create(agent=buyer,token='buyer-test',until=NOW+timedelta(hours=1))
        session=MarketSession.objects.create(pk='buyer-session',owner_id='admin',actor_id=buyer.pk,actor_name=buyer.name,mode='mcp',expires_at=NOW+timedelta(hours=1))
        MarketRuntime.objects.create(pk=session.pk,agent_token='buyer-test',process_id=1)
        listing=MarketListing.objects.get(pk='listed-transfer')
        with patch('system_settings.agent_world.market_service.check_mcp'):
            trade(session,buyer,'bought-transfer',{'kind':'buy_listing','listing_id':listing.pk,'version':listing.version,'quantity':1})
        self.assertEqual(stock_quantity(buyer.pk,'admin','fish.crucian'),1)
        self.assertEqual(stock_quantity(self.agent.pk,'admin','fish.crucian'),0)
        checkpoint_all();validate_source(database_data())


    def test_old_provider_response_cannot_commit_after_lease_change(self):
        from .decisions import StaleDecision
        trip=self.trip()
        def answer(*args, **kwargs):
            FishingRuntime.objects.filter(pk=trip.pk).update(token='another-device-lease')
            return 'pond'
        with patch('system_settings.agent_world.fishing.decisions.choose_scene',side_effect=answer):
            with self.assertRaises(StaleDecision):prepare_step(trip.pk)
        trip.refresh_from_db();self.assertEqual(trip.state['plan'], {'baits':[]})



    def test_life_cancel_returns_carried_bait_immediately(self):
        trip=self.prepared()
        response=self.client.post(f'/api/settings/agent-world/life/schedule/{trip.life_item_id}/',
            {'action':'cancel','reason':'提前结束钓鱼'},format='json')
        self.assertEqual(response.status_code,200)
        trip.refresh_from_db();self.assertEqual(trip.status,'cancelled')
        self.assertEqual(stock_quantity(self.agent.pk,'admin','bait.worm'),12)
        checkpoint_all()



@override_settings(USE_TZ=False)
class NaiveFishingTests(TestCase):
    def test_default_naive_storage_prepare_cast_and_return(self):
        from ..inventory_stock import add_stock
        with patch('django.utils.timezone.now',return_value=NOW.replace(tzinfo=None)), \
             patch('system_settings.agent_world.fishing.decisions.enabled',return_value=True):
            provider=AIProvider.objects.create(name='naive',type='OpenAi',base_url='https://example.invalid')
            model=AIModel.objects.create(name='naive',type='chat',provider=provider)
            agent=Agent.objects.create(name='无时区居民',model=model)
            LifeConfig.objects.create(pk='naive',migrated=True,settings={**DEFAULTS,'agent_ids':[agent.pk],'jev_enabled':True})
            LifeProfile.objects.create(pk=agent.pk,owner_id='naive')
            WorldActionRuntime.objects.create(pk='world',enabled=True)
            configure('naive',True)
            task=AgentTask.objects.get(task_kind='fishing')
            add_stock(agent.pk,'naive',agent.name,'bait.worm',12,'蚯蚓','fishing_bait',1)
            item=LifeItem.objects.create(pk='naive-trip',owner_id='naive',actor_id=agent.pk,task_id=task.pk,
                activity='fishing',original_at=NOW,scheduled_at=NOW)
            trip=request(item)
            with patch('system_settings.agent_world.fishing.decisions.choose_scene',side_effect=lambda o,a,s,st,c,**kw:'30' if s=='fishing_duration' else 'stop' if 'stop' in c else next(iter(c))):
                for _ in range(5):prepare_step(trip.pk)
            with patch('system_settings.agent_world.fishing.runner.encounter',return_value={'kind':'empty'}):
                cast(trip.pk,now=NOW+timedelta(minutes=5))
            finish(trip.pk,'返回')
            trip.refresh_from_db();self.assertIsNone(trip.departed_at.tzinfo)
            self.assertIsNone(trip.ended_at.tzinfo)
            self.assertEqual(stock_quantity(agent.pk,'naive','bait.worm'),11)

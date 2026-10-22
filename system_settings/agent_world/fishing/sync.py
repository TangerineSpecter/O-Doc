"""钓鱼快照：不可变事实、成长、携带物资及市场收支一起验证。"""
import copy
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from django.core import serializers
from utils.sync_datetime import normalize_datetime_fraction
from .models import FishingCatalog, FishingConfig, FishingProfile, FishingTrip, FishingEvent, FishingIntegrity
from .rules import capture_probability, experience_for, duel_result, candidates

PREFIX = 'system_settings.'
BUSINESS = {PREFIX + s for s in ('fishingcatalog','fishingconfig','fishingprofile','fishingtrip','fishingevent')}
INTEGRITY = PREFIX + 'fishingintegrity'


def fail(message):
    from utils.sync_manager import SyncError
    raise SyncError('钓鱼：' + message)


def normalize(value):
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, str) and len(value) > 10 and value[4:5] == '-' and 'T' in value:
        return normalize_datetime_fraction(value)
    return value


def metadata(data=None):
    owners = list(FishingConfig.objects.values_list('pk', flat=True)) if data is None else [str(r['pk']) for r in data if r['model'] == PREFIX+'fishingconfig']
    return {'fishing_schema_version': 1, 'fishing_owners': sorted(owners)}


def selected(data, owner):
    trip_ids = {str(r['pk']) for r in data if r['model'] == PREFIX+'fishingtrip' and r['fields']['owner_id'] == owner}
    config = next((r['fields'] for r in data if r['model'] == PREFIX+'fishingconfig' and str(r['pk']) == owner), {})
    trades = {str(r['pk']) for r in data if r['model'] == PREFIX+'markettransaction' and r['fields']['owner_id'] == owner and r['fields']['result'].get('fishing_sku')}
    result = []
    for row in data:
        label, key, f = row['model'], str(row['pk']), row['fields']
        belongs = False
        if label == PREFIX+'fishingconfig': belongs = key == owner
        elif label == PREFIX+'fishingcatalog': belongs = key == str(config.get('catalog'))
        elif label in (PREFIX+'fishingprofile', PREFIX+'fishingtrip'): belongs = f['owner_id'] == owner
        elif label == PREFIX+'fishingevent': belongs = str(f['trip']) in trip_ids
        elif label == PREFIX+'lifeitem': belongs = f['owner_id'] == owner and f['activity'] == 'fishing'
        elif label == PREFIX+'agentinventoryitem': belongs = f['owner_id'] == owner and f['source'].get('sku', '').startswith(('bait.','fish.'))
        elif label == PREFIX+'marketlisting': belongs = f['owner_id'] == owner and f['item'].get('source', {}).get('sku', '').startswith('fish.')
        elif label == PREFIX+'markettransaction': belongs = key in trades
        elif label == PREFIX+'worldaction': belongs = f['result'].get('fishing_trip_id') in trip_ids
        elif label == PREFIX+'worldledger': belongs = f['snapshot'].get('market_transaction_id') in trades
        if belongs:
            result.append(normalize(copy.deepcopy(row)))
    return sorted(result, key=lambda r: (r['model'], str(r['pk'])))


def digest(data, owner):
    return hashlib.sha256(json.dumps(selected(data, owner), sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def validate_source(data, meta=None, *, check_digest=True):
    try:
        _validate(data, meta, check_digest)
    except (ValueError, TypeError, KeyError, ArithmeticError, IndexError) as exc:
        fail('快照格式或数值不合法：' + str(exc))


def _validate(data, meta, check_digest):
    version = (meta or {}).get('fishing_schema_version', 0)
    if type(version) is not int or not 0 <= version <= 1:
        fail('快照版本过新，请升级所有设备')
    tables = defaultdict(dict)
    for row in data:
        label, key = row['model'], str(row['pk'])
        if label in BUSINESS | {INTEGRITY} and key in tables[label]:
            fail('重复业务身份')
        tables[label][key] = row['fields']
    def table(name): return tables[PREFIX+name]
    configs, trips, events = table('fishingconfig'), table('fishingtrip'), table('fishingevent')
    profiles = table('fishingprofile')
    if meta and 'fishing_owners' in meta and set(configs) != set(meta['fishing_owners']):
        fail('缺少账号配置')
    for owner, config in configs.items():
        if type(config['enabled']) is not bool or str(config['catalog']) not in table('fishingcatalog'):
            fail('配置或目录关联无效')
    for f in profiles.values():
        if f['owner_id'] not in configs:
            fail('成长缺少账号配置')
    grouped = defaultdict(list)
    for key, event in events.items():
        if str(event['trip']) not in trips:
            fail('逐竿事实缺少出钓')
        grouped[str(event['trip'])].append((key, event))
    xp, balances = Counter(), Counter()
    live_actors = set()
    for key, trip in trips.items():
        owner, actor = trip['owner_id'], trip['actor_id']
        config = configs.get(owner)
        profile = profiles.get(actor)
        if not config or not profile or profile['owner_id'] != owner:
            fail('出钓归属或成长档案缺失')
        life = table('lifeitem').get(trip['life_item_id'])
        if not life or life['actor_id'] != actor or life['owner_id'] != owner or life['activity'] != 'fishing':
            fail('出钓缺少对应居民日程')
        if not trip['ended_at']:
            if actor in live_actors:
                fail('同一居民存在多个未结束出钓')
            live_actors.add(actor)
        rules = trip['rules']
        catalog = table('fishingcatalog').get(rules['version'])
        if not catalog or catalog['rules'] != rules:
            fail('出钓目录快照不完整')
        ordered = sorted(grouped[key], key=lambda pair: pair[1]['sequence'])
        if [e['sequence'] for _, e in ordered] != list(range(1, trip['revision'] + 1)):
            fail('事实序列缺失或重复')
        carried, plan, duel = [], {'baits': []}, None
        casts, departed, returned = 0, False, False
        previous_cast_at = None
        for event_id, event in ordered:
            if returned:
                fail('返程后出现新增事实')
            kind, value = event['kind'], event['data']
            xp[(owner, actor)] += value.get('experience', 0)
            if kind not in ('cast','duel_end') and value.get('experience',0): fail('非收获步骤不能增加经验')
            if kind == 'choice':
                if departed: fail('出发后改动准备方案')
                choice = value['value']
                if value['key'] == 'spot':
                    if choice not in rules['spots'] or 'spot' in plan: fail('钓点选择无效')
                    plan['spot'] = choice
                elif value['key'] == 'minutes':
                    if int(choice) not in rules['durations'] or 'minutes' in plan: fail('出钓时长无效')
                    plan['minutes'] = int(choice)
                elif value['key'] == 'bait':
                    if plan.get('complete'): fail('鱼饵选择已经结束')
                    if choice == 'stop':
                        if not plan['baits']: fail('第一轮不能不带鱼饵')
                        plan['complete'] = True
                    else:
                        if choice not in rules['baits'] or choice in plan['baits'] or len(plan['baits']) >= 3: fail('鱼饵选择无效')
                        plan['baits'].append(choice)
                        if len(plan['baits']) == 3: plan['complete'] = True
                else: fail('未知选择步骤')
            elif kind == 'depart':
                if departed or not plan.get('complete') or value['plan'] != plan or not trip['departed_at'] or not trip['deadline']:
                    fail('出发事实与准备不一致')
                departed = True
                carried = copy.deepcopy(value['carried'])
                if not carried or any(p['source']['sku'] not in ['bait.'+b for b in plan['baits']] or type(p['quantity']) is not int or p['quantity'] <= 0 for p in carried):
                    fail('携带物资无效')
            elif kind == 'cast':
                if not departed or duel: fail('不允许此时抛竿')
                from ..life_time import local_time
                cast_at = local_time(datetime.fromisoformat(value['at']))
                first = local_time(datetime.fromisoformat(trip['departed_at']))
                deadline = local_time(datetime.fromisoformat(trip['deadline']))
                if cast_at < (previous_cast_at or first) + timedelta(seconds=rules['interval_seconds']) or cast_at > deadline + timedelta(seconds=5):
                    fail('抛竿时间不符合间隔或出钓截止')
                previous_cast_at = cast_at
                offered = candidates(rules, plan['spot'], value['bait'], cast_at)
                if not offered: fail('当前时间与鱼饵没有适用鱼种')
                casts += 1
                if value['cast'] != casts or value['energy'] != rules['energy_cost'] or value['rod'] != rules['rod'] or value['version'] != rules['version']:
                    fail('抛竿规则或序号不一致')
                bait = value['bait']
                payload_index = next((i for i,p in enumerate(carried) if p['quantity'] > 0 and p['source']['sku'] == 'bait.'+bait), None)
                if payload_index is None: fail('重复或超量消耗鱼饵')
                from ..market_inventory import split_escrow
                _, carried[payload_index] = split_escrow(carried[payload_index], 1)
                balances[(owner,actor,'bait.'+bait)] -= 1
                action = table('worldaction').get('fishing-energy:'+event_id)
                if not action or action['actor_id'] != actor or action['status'] != 'success' or Decimal(str(action['energy_cost'])) != rules['energy_cost'] or action['result'].get('fishing_event_id') != event_id:
                    fail('抛竿缺少对应体力事实')
                outcome = value['outcome']
                if bool(value.get('catch')) != (outcome['kind'] == 'fish'): fail('捕获结果缺失或无合法遭遇')
                if outcome['kind'] in ('fish','escaped','king'):
                    fish = rules['fish'][outcome['fish_id']]
                    if outcome['fish_id'] not in offered: fail('鱼种不符合时间或鱼饵条件')
                    if fish['spot'] != plan['spot']: fail('捕获鱼种不属于钓点')
                    if outcome['kind'] == 'king':
                        if not fish['king']: fail('鱼王类型无效')
                        duel = {'fish_id': outcome['fish_id'], 'wins': 0, 'losses': 0, 'round': 0}
                    else:
                        if fish['king'] or abs(value['probability']-capture_probability(value['level'], fish['level'], rules['rod']['bonus'])) > 1e-10:
                            fail('捕获率与当时等级不一致')
                        if outcome['kind'] == 'escaped' and value['experience'] != 2: fail('脱钩经验无效')
                elif outcome['kind'] not in ('empty','junk'): fail('未知抛竿结果')
                if outcome['kind'] in ('empty','junk','king') and value.get('experience',0): fail('空竿、垃圾或遇见鱼王不能获得经验')
            elif kind == 'duel_round':
                if not duel: fail('鱼王对局缺少遭遇')
                result = duel_result(value['player'], value['king'])
                duel['wins'] += result == 'win'
                duel['losses'] += result == 'loss'
                duel['round'] += 1
                if value['result'] != result or any(value[k] != v for k,v in duel.items()): fail('鱼王胜负不一致')
                if max(duel['wins'],duel['losses']) > 3: fail('鱼王已结束仍在出拳')
            elif kind == 'duel_end':
                if not duel or max(duel['wins'],duel['losses']) != 3: fail('鱼王未决出胜负')
                if value['result'] != ('caught' if duel['wins']==3 else 'escaped'): fail('鱼王结算不一致')
                if duel['wins']==3 and not value.get('catch'): fail('三胜缺少鱼王捕获')
                if duel['losses']==3 and (value.get('catch') or value.get('experience')): fail('鱼王逃脱不能发奖')
                duel = None
            elif kind == 'return':
                if value['remaining'] != carried: fail('返还物资与消耗不一致')
                carried, returned = [], True
            else:
                fail('未知钓鱼事实类型')
            if catch := value.get('catch'):
                if kind not in ('cast','duel_end'): fail('无效捕获事实')
                if kind == 'cast' and (value['outcome']['kind'] != 'fish' or value['outcome']['fish_id'] != catch['fish_id']): fail('捕获与遭遇鱼种不一致')
                if kind == 'duel_end' and (value['result'] != 'caught' or value['fish_id'] != catch['fish_id']): fail('鱼王捕获结果不一致')
                fish = rules['fish'][catch['fish_id']]
                if (catch['name'] != fish['name'] or catch['king'] != fish['king'] or
                    value['experience'] != experience_for(fish) or catch['experience'] != value['experience'] or
                    not fish['weight_range'][0] <= catch['weight'] <= fish['weight_range'][1] or
                    Decimal(catch['value']) != Decimal(fish['value'])):
                    fail('捕获重量、经验或价值不合法')
                balances[(owner,actor,'fish.'+catch['fish_id'])] += 1
        state = trip['state']
        if state['casts'] != casts or state['carried'] != carried or state['plan'] != plan or bool(trip['ended_at']) != returned:
            fail('出钓状态与事实不一致')
        if not returned and state.get('duel') != duel: fail('鱼王检查点与逐局事实不一致')
        for p in carried:
            balances[(owner,actor,p['source']['sku'])] -= p['quantity']
    for key, profile in profiles.items():
        if type(profile['experience']) is not int or profile['experience'] != xp[(profile['owner_id'],key)]: fail('成长经验缺少事实依据')
    # Net stock from purchases/catches and cross-resident trades, including escrow ownership.
    for trade_id, trade in table('markettransaction').items():
        result, operation = trade['result'], trade['operation']
        sku = result.get('fishing_sku','')
        if not sku.startswith(('bait.','fish.')): continue
        owner, actor, kind = trade['owner_id'], trade['actor_id'], operation['kind']
        if owner not in configs: fail('钓鱼交易缺少账号配置')
        n = result.get('quantity',0)
        if type(n) is not int or n < 0: fail('交易数量无效')
        if kind in ('buy_shop','buy_listing','sell'):
            amount = Decimal(str(result['total']))
            if amount <= 0: fail('钓鱼交易金额无效')
            expected = {actor: -amount if kind in ('buy_shop','buy_listing') else amount}
            if kind == 'buy_listing': expected[result['seller_id']] = amount
            for who, delta in expected.items():
                entry = table('worldledger').get(f'market:{trade_id}:{who}')
                if not entry or entry['agent_id'] != who or Decimal(entry['amount']) != delta: fail('钓鱼交易缺少对应资金流水')
        if kind == 'buy_shop':
            if not sku.startswith('bait.'): fail('商店不能出售鱼类')
            batch = table('marketbatch').get(operation['batch_id'])
            if not batch or not any(q['id'] == operation['slot_id'] and q['sku'] == sku for q in batch['supplies']): fail('鱼饵缺少当时报价')
            balances[(owner,actor,sku)] += n
        elif kind == 'sell': balances[(owner,actor,sku)] -= n
        elif kind == 'buy_listing':
            balances[(owner,actor,sku)] += n
            balances[(owner,result['seller_id'],sku)] -= n
    actual = Counter()
    for item in table('agentinventoryitem').values():
        sku = item['source'].get('sku','')
        if sku.startswith(('bait.','fish.')): actual[(item['owner_id'],item['actor_id'],sku)] += item['quantity']
    for listing in table('marketlisting').values():
        sku = listing['item'].get('source',{}).get('sku','')
        if sku.startswith('fish.'):
            actual[(listing['owner_id'],listing['seller_id'],sku)] += listing['remaining_quantity']
    if any(actual[k] != balances[k] for k in set(actual)|set(balances)):
        fail('鱼饵或鱼类的购买、携带、消耗、捕获与交易库存不一致')
    if check_digest:
        checks = table('fishingintegrity')
        if set(checks) != set(configs): fail('缺少完整性检查点')
        for owner in configs:
            if checks[owner]['digest'] != digest(data,owner): fail('目录、成长、物资或执行事实残缺')


def database_data():
    from ..life_models import LifeItem
    from ..market_models import MarketBatch, MarketListing, MarketTransaction
    from ..travel_models import AgentInventoryItem
    from ..models import WorldLedger
    from system_settings.models import WorldAction
    result = []
    for model in (FishingCatalog,FishingConfig,FishingProfile,FishingTrip,FishingEvent,FishingIntegrity,
                  LifeItem,MarketBatch,MarketListing,MarketTransaction,AgentInventoryItem,WorldAction,WorldLedger):
        result.extend(json.loads(serializers.serialize('json', model.objects.all())))
    return result


def checkpoint_all():
    data = database_data()
    validate_source(data, check_digest=False)
    for owner in FishingConfig.objects.values_list('pk',flat=True):
        FishingIntegrity.objects.update_or_create(pk=owner,defaults={'digest':digest(data,owner)})


def reconcile():
    validate_source(database_data())
    from .models import FishingRuntime
    FishingRuntime.objects.update(authorized=False,token='',until=None)


def validate_conflicts(local,remote):
    immutable = {PREFIX+'fishingevent', PREFIX+'fishingcatalog'}
    left = {(r['model'],str(r['pk'])):normalize(r['fields']) for r in local if r['model'] in immutable}
    for row in remote:
        key = (row['model'],str(row['pk']))
        if key in left and left[key] != normalize(row['fields']): fail('两端同一钓鱼事实或目录内容不同')


def refresh_merged(data,revisions):
    validate_source(data,check_digest=False)
    from system_settings.sync_state import canonical_hash
    for row in data:
        if row['model'] == INTEGRITY:
            row['fields']['digest'] = digest(data,str(row['pk']))
            key = row['model']+':'+str(row['pk'])
            if key in revisions: revisions[key] = {**revisions[key],'hash':canonical_hash(row['fields'])}
    validate_source(data)

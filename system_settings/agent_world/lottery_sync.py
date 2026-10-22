"""彩票快照语义校验：任何路径都不能放宽票款及奖金一致性。"""
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from django.core import serializers
from utils.sync_datetime import normalize_datetime_fraction
from .lottery_models import LotteryConfig, LotteryRound, LotteryTicket, LotteryIntegrity
from .lottery_rules import RULES, PRICE, numbers, settlement
from .life_time import local_time

PREFIX = 'system_settings.'
LABELS = {PREFIX + name for name in ('lotteryconfig', 'lotteryround', 'lotteryticket')}
INTEGRITY = PREFIX + 'lotteryintegrity'


def fail(message):
    from utils.sync_manager import SyncError
    raise SyncError('大乐透：' + message)


def metadata(data=None):
    if data is None:
        owners = set(LotteryConfig.objects.values_list('pk', flat=True))
    else:
        owners = {str(row['pk']) for row in data if row['model'] == PREFIX + 'lotteryconfig'}
    return {'lottery_schema_version': 1, 'lottery_owners': sorted(owners)}


def date(value):
    return local_time(datetime.fromisoformat(value))


def selected(data, owner):
    rows = []
    for source in data:
        label, fields = source['model'], source.get('fields', {})
        belongs = ((str(source['pk']) == owner if label == PREFIX + 'lotteryconfig' else fields.get('owner_id') == owner)
                   if label in LABELS else label == PREFIX + 'worldledger' and fields.get('kind') == 'lottery'
                   and fields.get('snapshot', {}).get('owner_id') == owner)
        if belongs:
            item = json.loads(json.dumps(source))
            for key, value in item['fields'].items():
                if key.endswith('_at') and isinstance(value, str):
                    item['fields'][key] = normalize_datetime_fraction(value)
            rows.append(item)
    return sorted(rows, key=lambda row: (row['model'], str(row['pk'])))


def digest(data, owner):
    return hashlib.sha256(json.dumps(selected(data, owner), sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def validate_source(data, meta=None, *, check_digest=True):
    try:
        _validate(data, meta, check_digest=check_digest)
    except (ValueError, TypeError, KeyError, ArithmeticError) as exc:
        fail('快照号码、金额或关联格式无效：' + str(exc))


def _validate(data, meta, *, check_digest):
    version = (meta or {}).get('lottery_schema_version', 0)
    if type(version) is not int or not 0 <= version <= 1:
        fail('快照版本过新，请升级所有设备')
    configs, rounds, tickets, checks, ledger, lives = {}, {}, {}, {}, {}, {}
    seen = set()
    for row in data:
        label, key, fields = row['model'], str(row['pk']), row.get('fields', {})
        if label in LABELS or label == INTEGRITY:
            if (label, key) in seen:
                fail('存在重复业务身份')
            seen.add((label, key))
        mapping = {PREFIX + 'lotteryconfig': configs, PREFIX + 'lotteryround': rounds,
                   PREFIX + 'lotteryticket': tickets, INTEGRITY: checks,
                   PREFIX + 'worldledger': ledger, PREFIX + 'lifeitem': lives}.get(label)
        if mapping is not None:
            mapping[key] = fields
    if meta and 'lottery_owners' in meta and set(meta['lottery_owners']) != set(configs):
        fail('快照缺少账号配置')
    if check_digest and set(configs) != set(checks):
        fail('快照缺少完整性记录')
    for owner, config in configs.items():
        if type(config['enabled']) is not bool:
            fail('配置开关无效')
        first = date(config['first_draw_at'])
        if first.hour != 20 or first.minute or first.second or first.microsecond:
            fail('开奖起点无效')
        if check_digest and checks[owner]['digest'] != digest(data, owner):
            fail('配置、期次、彩票或账本残缺')
    by_round, by_purchase, counts = defaultdict(list), defaultdict(list), Counter()
    for key, ticket in tickets.items():
        row_id, actor = str(ticket['round']), ticket['actor_id']
        row = rounds.get(row_id)
        if row is None or row['owner_id'] != ticket['owner_id']:
            fail('彩票缺少所属期次或账号不一致')
        if ticket['numbers'] != numbers(ticket['numbers']):
            fail('彩票号码未规范保存')
        at = date(ticket['created_at'])
        if not date(row['opens_at']) <= at < date(row['closes_at']):
            fail('彩票购买时间不在售票期')
        life = lives.get(ticket['life_item_id'])
        plan = (life or {}).get('context', {}).get('lottery_plan', {})
        if not life or life['owner_id'] != ticket['owner_id'] or life['actor_id'] != actor or plan.get('round_id') != row_id:
            fail('彩票缺少对应生活安排')
        if ticket['purchase_key'] != f'lottery:buy:{ticket["life_item_id"]}' or key != f'{ticket["purchase_key"]}:{ticket["ordinal"]}':
            fail('彩票购买身份不一致')
        counts[(row_id, actor)] += 1
        if counts[(row_id, actor)] > 10:
            fail('同一居民本期购买超过十张')
        by_round[row_id].append(ticket)
        by_purchase[ticket['purchase_key']].append((key, ticket))
    expected_ledger = set()
    for key, rows in by_purchase.items():
        first = rows[0][1]
        entry = ledger.get(key)
        plan = lives[first['life_item_id']]['context']['lottery_plan']
        if (not entry or entry['kind'] != 'lottery' or entry['agent_id'] != first['actor_id']
                or Decimal(entry['amount']) != -PRICE * len(rows) or plan['quantity'] != len(rows)
                or Decimal(lives[first['life_item_id']]['spent']) != PRICE * len(rows)
                or lives[first['life_item_id']]['status'] != 'completed'
                or entry['snapshot'].get('owner_id') != first['owner_id']
                or entry['snapshot'].get('round_id') != str(first['round'])
                or set(entry['snapshot'].get('ticket_ids', [])) != {r[0] for r in rows}
                or {r[1]['ordinal'] for r in rows} != set(range(len(rows)))
                or any(r[1]['actor_id'] != first['actor_id'] or r[1]['round'] != first['round'] for r in rows)):
            fail('购票扣款账本不完整或张数不匹配')
        expected_ledger.add(key)
    for owner in configs:
        chain = sorted(((key, r) for key, r in rounds.items() if r['owner_id'] == owner), key=lambda pair: pair[1]['sequence'])
        if not chain:
            fail('缺少首期期次')
        carry = Decimal(0)
        for index, (key, row) in enumerate(chain, 1):
            if type(row['sequence']) is not int or row['sequence'] != index or key != f'lottery:{owner}:{index}' or row['rules'] != RULES:
                fail('期次链或规则不一致')
            draw_at = date(configs[owner]['first_draw_at']) + timedelta(days=3 * (index - 1))
            if date(row['draws_at']) != draw_at or date(row['closes_at']) != draw_at - timedelta(minutes=5):
                fail('期次时间不一致')
            expected_open = date(configs[owner]['created_at']) if index == 1 else draw_at - timedelta(days=3)
            if date(row['opens_at']) != expected_open:
                fail('开售时间不一致')
            if row['status'] == 'settled':
                if row['settled_at'] is None or date(row['settled_at']) < draw_at:
                    fail('开奖时间无效')
                result = row['result']
                expected = settlement(by_round[key], result['winning_numbers'], carry)
                if result != expected:
                    fail('中奖奖金或奖池结转不一致')
                carry = Decimal(expected['carry_out'])
                for award in expected['awards']:
                    award_key = f'lottery:award:{key}:{award["actor_id"]}:{award["tier"]}'
                    entry = ledger.get(award_key)
                    if (not entry or entry['kind'] != 'lottery' or entry['agent_id'] != award['actor_id']
                            or Decimal(entry['amount']) != Decimal(award['amount'])
                            or entry['snapshot'].get('round_id') != key
                            or entry['snapshot'].get('owner_id') != owner
                            or any(entry['snapshot'].get(k) != v for k, v in award.items())):
                        fail('派奖账本缺失或与开奖不一致')
                    expected_ledger.add(award_key)
            elif row['status'] != 'open' or index != len(chain) or row['result'] or row['settled_at']:
                fail('期次状态或顺序无效')
        if chain[-1][1]['status'] != 'open':
            fail('缺少下一期')
    if any(row['owner_id'] not in configs for row in rounds.values()):
        fail('期次缺少账号配置')
    if any(key not in expected_ledger for key, row in ledger.items() if row['kind'] == 'lottery'):
        fail('存在无购票或派奖事实的账本')
    # 计划额度属于恢复后的同一资金承诺，不能把两端十张预留合并成二十张。
    ticket_life_ids = {t["life_item_id"] for t in tickets.values()}
    for life_id, life in lives.items():
        plan = life.get('context', {}).get('lottery_plan')
        if not plan:
            continue
        from .lottery_service import validate_plan
        validate_plan(plan)
        row = rounds.get(plan['round_id'])
        if not row or row['owner_id'] != life['owner_id'] or life['activity'] != 'lottery':
            fail('购票计划期次或活动无效')
        if Decimal(life['budget']) != PRICE * plan['quantity']:
            fail('购票预留金额与张数不一致')
        spent = Decimal(life['spent'])
        if spent not in (Decimal(0), PRICE * plan['quantity']):
            fail('购票安排发生部分扣款')
        if life['status'] == 'completed' and life_id not in ticket_life_ids:
            fail('已完成购票安排缺少彩票')
        picks = life.get('context', {}).get('lottery_numbers', [])
        if not isinstance(picks, list) or len(picks) > plan['quantity']:
            fail('选号检查点张数无效')
        for index, partial in enumerate(picks):
            if (not isinstance(partial, list) or not 1 <= len(partial) <= 3
                    or any(type(n) is not int or not 1 <= n <= 10 for n in partial)
                    or len(set(partial)) != len(partial) or (index < len(picks) - 1 and len(partial) != 3)):
                fail('逐位选号检查点无效')

        if life['status'] in ('pending', 'deferred', 'running', 'paused'):
            counts[(plan['round_id'], life['actor_id'])] += plan['quantity']
            if counts[(plan['round_id'], life['actor_id'])] > 10:
                fail('合并后购票与计划预留超过十张')


def database_data():
    from .life_models import LifeItem
    from .models import WorldLedger
    result = []
    for model in (LotteryConfig, LotteryRound, LotteryTicket, LotteryIntegrity, WorldLedger, LifeItem):
        rows = model.objects.all()
        if model is WorldLedger:
            rows = rows.filter(kind='lottery')
        result.extend(json.loads(serializers.serialize('json', rows)))
    return result


def checkpoint_all():
    data = database_data()
    validate_source(data, check_digest=False)
    for owner in LotteryConfig.objects.values_list('pk', flat=True):
        LotteryIntegrity.objects.update_or_create(pk=owner, defaults={'digest': digest(data, owner)})


def reconcile():
    validate_source(database_data())


def validate_conflicts(local, remote):
    left = {(r['model'], str(r['pk'])): r['fields'] for r in local if r['model'] in LABELS}
    for row in remote:
        previous = left.get((row['model'], str(row['pk'])))
        if previous is None:
            continue
        fields = row['fields']
        if row['model'] == PREFIX + 'lotteryticket':
            unchanged = all(previous.get(k) == v for k, v in fields.items() if k != 'created_at')
            if not unchanged or date(previous['created_at']) != date(fields['created_at']):
                fail('两端同一张彩票内容不同，请先核对设备数据')
        if row['model'] == PREFIX + 'lotteryround' and previous['status'] == fields['status'] == 'settled' and previous['result'] != fields['result']:
            fail('两端同一期存在不同开奖结果，请先核对设备数据')
        if row['model'] == PREFIX + 'lotteryconfig' and date(previous['first_draw_at']) != date(fields['first_draw_at']):
            fail('两端首次开奖起点不同，请先核对设备数据')


def refresh_merged(data, revisions):
    validate_source(data, check_digest=False)
    from system_settings.sync_state import canonical_hash
    for row in data:
        if row['model'] == INTEGRITY:
            row['fields']['digest'] = digest(data, str(row['pk']))
            key = row['model'] + ':' + str(row['pk'])
            if key in revisions:
                revisions[key] = {**revisions[key], 'hash': canonical_hash(row['fields'])}
    validate_source(data)

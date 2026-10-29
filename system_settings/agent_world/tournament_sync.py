"""Tournament aggregates are immutable after settlement; never reconstruct awards."""
import json
from collections import defaultdict
from decimal import Decimal
from datetime import date, datetime, timedelta
from django.core import serializers
from utils.sync_datetime import normalize_datetime_fraction
from system_settings.sync_state import canonical_hash
from .tournament_models import Tournament, TournamentRound, TournamentMatch, TournamentReward, TournamentIntegrity, TournamentIllustration
from .tournament_rules import key, draw, POTION_POOL, SLOTS, at_two
from .life_time import local_time

PREFIX = 'system_settings.'
EVENT, ROUND, MATCH, REWARD, INTEGRITY = [PREFIX + name for name in (
    'tournament', 'tournamentround', 'tournamentmatch', 'tournamentreward', 'tournamentintegrity')]
LABELS = {EVENT, ROUND, MATCH, REWARD}
ILLUSTRATION = PREFIX + 'tournamentillustration'
MODELS = (Tournament, TournamentRound, TournamentMatch, TournamentReward, TournamentIntegrity, TournamentIllustration)


def fail(message: str):
    from utils.sync_manager import SyncError
    raise SyncError('武道大会：' + message)


def metadata(data=None):
    ids = list(Tournament.objects.order_by('pk').values_list('pk', flat=True)) if data is None else sorted(
        str(row['pk']) for row in data if row['model'] == EVENT)
    return {'tournament_schema_version': 2, 'tournament_ids': ids}


def selected(data: list[dict], identity: str) -> list[dict]:
    rounds = {str(row['pk']) for row in data if row['model'] == ROUND and str(row['fields']['tournament']) == identity}
    result = []
    for row in data:
        fields, label = row['fields'], row['model']
        if ((label == EVENT and str(row['pk']) == identity)
                or (label in (ROUND, REWARD) and str(fields['tournament']) == identity)
                or (label == MATCH and str(fields['round']) in rounds)):
            value = json.loads(json.dumps(row))
            for name, item in value['fields'].items():
                if name.endswith('_at') and isinstance(item, str):
                    value['fields'][name] = normalize_datetime_fraction(item)
            result.append(value)
    return sorted(result, key=lambda row: (row['model'], str(row['pk'])))


def digest(data, identity):
    return canonical_hash(selected(data, identity))


def validate_equipment_fact(rows: dict, fact: dict):
    payload = fact['payload']
    reward = rows.get((REWARD, payload.get('reward_id')))
    result = (reward or {}).get('result', {})
    equipment = payload.get('equipment_after', {}).get(payload.get('equipment_id'), {})
    if (not reward or reward['status'] != 'granted' or reward['place'] not in (1, 2)
            or reward['owner_id'] != fact['owner_id'] or reward['actor_id'] != fact['actor_id']
            or str(reward['tournament']) != payload.get('tournament_id')
            or result.get('equipment_id') != payload.get('equipment_id')
            or equipment.get('snapshot') != result.get('item') or equipment.get('rules') != result.get('rules')
            or fact['id'] != 'tournament:' + payload.get('reward_id', '')):
        fail('装备来源与已发奖事实不一致')


def validate_source(data: list[dict], meta=None, *, check_digest=True):
    try:
        _validate(data, meta, check_digest)
    except (ValueError, KeyError, TypeError, IndexError, ArithmeticError) as exc:
        fail('快照格式或引用无效：' + str(exc))


def _validate(data, meta, check_digest):
    version = (meta or {}).get('tournament_schema_version', 0)
    if type(version) is not int or not 0 <= version <= 2:
        fail('快照版本过新，请升级所有设备')
    groups = {label: {} for label in (*LABELS, INTEGRITY)}
    rows = {(r['model'], str(r['pk'])): {'id': str(r['pk']), **r['fields']} for r in data}
    for row in data:
        if row['model'] in groups:
            group, identity = groups[row['model']], str(row['pk'])
            if identity in group:
                fail('重复业务身份')
            group[identity] = row['fields']
    events, rounds, matches, rewards, checks = (groups[label] for label in (EVENT, ROUND, MATCH, REWARD, INTEGRITY))
    seen_art = set()
    for row in data:
        if row['model'] != ILLUSTRATION:
            continue
        art = row['fields']
        identity = str(row['pk'])
        if identity in seen_art or (meta and version < 2):
            fail('决战配图重复或快照版本不支持')
        seen_art.add(identity)
        event = events.get(identity)
        if not event or event['owner_id'] != art['owner_id'] or event['status'] != 'completed':
            fail('决战配图赛事或账号无效')
        if art.get('asset_id'):
            asset = rows.get(('assets.asset', art['asset_id']))
            if not asset or asset.get('uploader') != art['owner_id'] or not asset.get('is_valid') or asset.get('file_type') != 'image':
                fail('决战配图资源缺失或账号不一致')
        if art.get('request_id'):
            matching = [r for r in data if r['model'] == 'prompts.imagegenerationtask'
                        and r['fields'].get('user_id') == art['owner_id']
                        and r['fields'].get('agent_key') == ''
                        and r['fields'].get('request_id') == art['request_id']]
            if matching and matching[0]['fields'].get('request_data', {}).get('scene') != 'tournament_illustration':
                fail('决战配图生图任务类型无效')
            if matching:
                task = matching[0]['fields']
                for reference in task.get('request_data', {}).get('reference_image_ids', []):
                    asset = rows.get(('assets.asset', reference))
                    if not asset or asset.get('uploader') != art['owner_id'] or not asset.get('is_valid'):
                        fail('决战配图参考图缺失或账号不一致')
    if meta and 'tournament_ids' in meta and meta['tournament_ids'] != sorted(events):
        fail('赛事清单缺失')
    if check_digest and set(events) != set(checks):
        fail('缺少赛事完整性记录')
    by_round, by_event, awards = defaultdict(list), defaultdict(list), defaultdict(list)
    for identity, match in matches.items():
        row = rounds.get(str(match['round']))
        if not row or match['owner_id'] != row['owner_id'] or match['status'] not in ('pending', 'done'):
            fail('比赛缺少轮次或账号不一致')
        if identity != key(match['round'], match['number']) or match['kind'] not in ('main', 'bronze'):
            fail('比赛身份无效')
        if match['left_id'] == match['right_id'] or match['result'].get('winner_id', '') not in ('', match['left_id'], match['right_id']):
            fail('胜者不是本场选手')
        if match['status'] == 'done':
            if not match['played_at'] or not match['result'] or local_time(datetime.fromisoformat(match['played_at'])) < local_time(datetime.fromisoformat(row['scheduled_at'])):
                fail('比赛结果或执行时间缺失')
            report = match['report']
            if report and (any(report.get(name) != match['result'].get(name) for name in ('winner_id', 'loser_id', 'reason'))
                           or [p['actor_id'] for p in report['participants']] != [match['left_id'], match['right_id']]
                           or not 1 <= len(report['rounds']) <= 250):
                fail('战报与比赛结果不一致')
            if not report and match['result']['reason'] not in ('bye', 'withdrawal'):
                fail('已完成比赛缺少战报')
        elif match['result'] or match['report'] or match['played_at']:
            fail('未完成比赛包含结算结果')
        by_round[str(match['round'])].append((identity, match))
    for identity, row in rounds.items():
        event = events.get(str(row['tournament']))
        if (not event or event['owner_id'] != row['owner_id'] or identity != key(row['tournament'], 'round', row['number'])
                or row['phase'] not in ('preliminary', 'main', 'final') or row['status'] not in ('pending', 'done')):
            fail('轮次身份或归属无效')
        if row['status'] == 'done' and (not row['completed_at'] or any(m['status'] != 'done' for _, m in by_round[identity])):
            fail('轮次尚未全部完成')
        by_event[str(row['tournament'])].append((identity, row))
    for identity, reward in rewards.items():
        event = events.get(str(reward['tournament']))
        if (not event or event['owner_id'] != reward['owner_id'] or event['status'] != 'completed'
                or reward['place'] not in (1, 2, 3) or identity != key(reward['tournament'], 'reward', reward['place'])
                or event['result'].get('podium', {}).get(str(reward['place'])) != reward['actor_id']
                or reward['status'] not in ('pending', 'rolled', 'granted', 'forfeited')):
            fail('奖励名次或归属无效')
        awards[str(reward['tournament'])].append(reward)
        _validate_reward(identity, reward, rows)
    for identity, event in events.items():
        week = date.fromisoformat(event['week'])
        roster = [r['id'] for r in event['roster']]
        if (week.weekday() != 6 or identity != key('tournament', event['owner_id'], week)
                or len(roster) != len(set(roster)) or event['rules_version'] != 1
                or event['status'] not in ('active', 'completed', 'skipped') or not event['seed']):
            fail('赛事身份、名单或规则无效')
        if check_digest and checks[identity]['digest'] != digest(data, identity):
            fail('名单、对阵、战报或奖励残缺')
        if event['status'] == 'skipped':
            if len(roster) >= 2 or by_event[identity] or awards[identity] or not event['ended_at']:
                fail('未开赛赛事存在比赛或奖励')
            continue
        if len(roster) < 2:
            fail('参赛人数不足')
        possible_podium = _validate_bracket(event, by_event[identity], by_round)
        podium = event['result'].get('podium', {})
        if event['status'] == 'completed':
            if (not event['ended_at'] or len(set(podium.values())) != len(podium)
                    or any(place not in ('1', '2', '3') or actor not in roster for place, actor in podium.items())
                    or any(possible_podium.get(place) != actor for place, actor in podium.items())
                    or {str(a['place']): a['actor_id'] for a in awards[identity]} != podium):
                fail('最终名次与奖励缺失或重复')
        elif event['ended_at'] or podium or awards[identity]:
            fail('未结束赛事提前发奖')


def _validate_bracket(event, event_rounds, by_round):
    entrants, byes, last, bronze, podium = [r['id'] for r in event['roster']], defaultdict(int), None, [], {}
    for number, (identity, row) in enumerate(sorted(event_rounds, key=lambda pair: pair[1]['number']), 1):
        if row['number'] != number or row['entrants'] != entrants:
            fail('晋级名单或轮次链不一致')
        expected_phase = 'preliminary' if len(entrants) > 64 else 'final' if len(entrants) <= 2 else 'main'
        if row['phase'] != expected_phase:
            fail('比赛阶段与人数不一致')
        due = at_two(date.fromisoformat(event['week'])) + timedelta(days=0 if expected_phase == 'preliminary' else 1)
        if last:
            due = local_time(datetime.fromisoformat(last['scheduled_at'])) + timedelta(days=0 if last['phase'] == row['phase'] == 'preliminary' else 1)
        if local_time(datetime.fromisoformat(row['scheduled_at'])) != due:
            fail('比赛计划时间不一致')
        main = sorted((m for _, m in by_round[identity] if m['kind'] == 'main'), key=lambda m: m['number'])
        all_matches = sorted((m for _, m in by_round[identity]), key=lambda m: m['number'])
        if [m['number'] for m in all_matches] != list(range(1, len(all_matches) + 1)):
            fail('比赛序号存在缺口')
        third_matches = [m for m in all_matches if m['kind'] == 'bronze']
        expected_third = [tuple(bronze)] if row['phase'] == 'final' and len(bronze) == 2 else []
        if [(m['left_id'], m['right_id']) for m in third_matches] != expected_third:
            fail('季军对阵与半决赛败者不一致')
        if [(m['left_id'], m['right_id']) for m in main] != draw(entrants, byes, key(event['seed'], number)):
            fail('抽签或轮空与原始事实不一致')
        for match in main:
            if match['result'].get('reason') == 'bye':
                byes[match['left_id']] += 1
        entrants = [m['result']['winner_id'] for m in main if m['result'].get('winner_id')]
        if row['status'] == 'done':
            if row['phase'] == 'main' and len(row['entrants']) in (3, 4):
                bronze = [m['result']['loser_id'] for m in main if m['result'].get('loser_id')]
            if row['phase'] == 'final':
                podium = {'1': main[0]['result'].get('winner_id', ''), '2': main[0]['result'].get('loser_id', '')}
                podium['3'] = third_matches[0]['result'].get('winner_id', '') if third_matches else bronze[0] if len(bronze) == 1 else ''
            elif len(entrants) <= 1:
                podium = {'1': entrants[0]} if entrants else {}
        if last and last['status'] != 'done':
            fail('前一轮未结束就开始下一轮')
        last = row
    if not last or (event['status'] == 'completed' and last['status'] != 'done'):
        fail('赛事缺少完整轮次')
    if event['status'] == 'active' and last['status'] != 'pending':
        fail('进行中赛事缺少下一轮')
    if event['status'] == 'completed' and last['phase'] != 'final' and len(entrants) > 1:
        fail('未决出最终胜者就结束赛事')
    if event['result'].get('bronze_candidates', []) != bronze:
        fail('季军候选与半决赛结果不一致')
    return {place: actor for place, actor in podium.items() if actor}


def _validate_reward(identity, reward, rows):
    result, plan = reward['result'], reward['plan']
    if reward['status'] in ('rolled', 'granted') and (not plan or not result):
        fail('奖品缺少固定结果')
    if reward['status'] == 'pending' and result:
        fail('未生成奖品包含结果')
    if reward['place'] == 3 and plan:
        potions = plan['potions']
        if len(potions) != 3 or any(p['recipe_id'] not in POTION_POOL or p['stars'] != 1 or p['quantity'] != 1
                or not Decimal(p['price']).is_finite() or Decimal(p['price']) < 0 for p in potions):
            fail('季军药水池、星级或数量无效')
        if result and result.get('potions') != potions:
            fail('药水结果与生成记录不一致')
    elif plan:
        if (not 1 <= plan['actor_level'] <= 99 or not max(1, plan['actor_level'] - 5) <= plan['level'] <= min(99, plan['actor_level'] + 5)
                or plan['quality'] != ('gold' if reward['place'] == 1 else 'blue')
                or not plan['slots'] or any(slot not in SLOTS for slot in plan['slots'])):
            fail('奖励装备等级、品质或候选部位无效')
        if result and (result['slot'] not in plan['slots'] or result['item']['level'] != plan['level']
                       or result['item']['quality'] != plan['quality'] or result['equipment_id'] != key(identity, 'equipment')):
            fail('装备结果与选择不一致')
        if result:
            from .combat.equipment_snapshot import validate, slot_matches
            validate(result['item'], result['rules'])
            if (not slot_matches(result['item'], result['rules'], result['slot'])
                    or result['catalog_id'] != plan['catalog_id']
                    or result['item']['template_id'] not in plan['templates'][result['slot']]
                    or result['source'] not in ('decision_model', 'single_candidate', 'code_fallback')):
                fail('装备类型或部位来源不一致')
    if reward['status'] == 'granted':
        if not reward['granted_at']:
            fail('已发奖记录缺少时间')
        if reward['place'] in (1, 2):
            fact = rows.get((PREFIX + 'combatfact', 'tournament:' + identity))
            if not fact:
                fail('已发装备缺少战斗事实')
            validate_equipment_fact(rows, fact)
    elif reward['granted_at']:
        fail('未发奖记录含发放时间')


def database_data():
    from .combat.models import CombatFact
    from assets.models import Asset
    from prompts.models import ImageGenerationTask
    art = list(TournamentIllustration.objects.all())
    task_requests = {item.request_id for item in art if item.request_id}
    tasks = list(ImageGenerationTask.objects.filter(agent_key='', request_id__in=task_requests))
    asset_ids = {item.asset_id for item in art if item.asset_id}
    for task in tasks:
        asset_ids.update(task.request_data.get('reference_image_ids', []))
    objects = [obj for model in (*MODELS[:-1], CombatFact) for obj in model.objects.all()]
    objects.extend(art)
    objects.extend(tasks)
    objects.extend(Asset.objects.filter(pk__in=asset_ids))
    return json.loads(serializers.serialize('json', objects))


def checkpoint_all():
    data = database_data()
    validate_source(data, check_digest=False)
    for identity in Tournament.objects.values_list('pk', flat=True):
        TournamentIntegrity.objects.update_or_create(pk=identity, defaults={'digest': digest(data, identity)})


def reconcile():
    validate_source(database_data())


def validate_conflicts(local, remote):
    left = {(r['model'], str(r['pk'])): r['fields'] for r in local if r['model'] in LABELS}
    for row in remote:
        old, value, label = left.get((row['model'], str(row['pk']))), row['fields'], row['model']
        if old is None:
            continue
        if label == EVENT and any(old[name] != value[name] for name in ('owner_id', 'week', 'roster', 'seed', 'rules_version')):
            fail('同一周赛事在两端独立创建，请选择整份设备快照')
        if label == ROUND and any(old[name] != value[name] for name in ('tournament', 'entrants', 'scheduled_at', 'phase', 'number')):
            fail('同一轮次在两端存在不同对阵，请选择整份设备快照')
        if label == MATCH and (any(old[name] != value[name] for name in ('round', 'left_id', 'right_id', 'kind', 'number'))
                or (old['status'] == value['status'] == 'done' and (old['result'] != value['result'] or old['report'] != value['report']))):
            fail('同一比赛在两端存在不同结果，请选择整份设备快照')
        if label == REWARD and (any(old[name] != value[name] for name in ('tournament', 'place', 'actor_id'))
                or any(old[name] and value[name] and old[name] != value[name] for name in ('plan', 'result'))):
            fail('同一名次在两端存在不同奖品，请选择整份设备快照')


def refresh_merged(data, revisions):
    validate_source(data, check_digest=False)
    for row in data:
        if row['model'] == INTEGRITY:
            row['fields']['digest'] = digest(data, str(row['pk']))
            identity = INTEGRITY + ':' + str(row['pk'])
            if identity in revisions:
                revisions[identity] = {**revisions[identity], 'hash': canonical_hash(row['fields'])}
    validate_source(data)


def revoke():
    from .tournament_models import TournamentRuntime
    TournamentRuntime.objects.update(token='', until=None)

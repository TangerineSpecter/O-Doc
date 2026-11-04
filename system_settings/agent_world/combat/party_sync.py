"""Validate a complete shared session and its linked personal receipts; never merge reward branches."""
from collections import defaultdict

from .store import digest
from .party_integrity import canonical, aggregate_frame, wave_digest

PREFIX = 'system_settings.'
PARTY, MEMBER, WAVE, EVENT = [PREFIX+n for n in ('adventureparty','adventuremember','adventurewave','adventureevent')]


def validate_source(data, meta=None, *, archives=None):
    from utils.sync_manager import SyncError
    if archives is None:
        from .retention_sync import archive_index
        archives = archive_index(data, meta)
    rows = {(r['model'], str(r['pk'])): {'id':str(r['pk']), **r['fields']} for r in data}
    parties = {key:row for (model,key),row in rows.items() if model==PARTY}
    members_by_party, waves_by_party, events_by_party = defaultdict(list), defaultdict(list), defaultdict(list)
    member_explorations = set()
    for (model, key), row in rows.items():
        if model in (MEMBER,WAVE,EVENT):
            party = parties.get(row['party_id'])
            if not party or party['owner_id']!=row['owner_id']:
                raise SyncError('组队事实缺少所属会话')
            if model == MEMBER:
                members_by_party[row['party_id']].append(row)
                member_explorations.add(row['exploration_id'])
            elif model == WAVE:
                waves_by_party[row['party_id']].append(row)
            else:
                events_by_party[row['party_id']].append(row)
    facts = [row for (model,_),row in rows.items() if model==PREFIX+'combatfact']
    for (model,key),row in rows.items():
        if model==PREFIX+'exploration' and row['snapshot'].get('party_id'):
            if row['snapshot']['party_id'] not in parties or key not in member_explorations:
                raise SyncError('个人探索缺少完整组队会话与成员记录')
    receipts_by_event_actor = defaultdict(list)
    for fact in facts:
        ref=fact['payload'].get('shared_event_id')
        if ref and ((EVENT,ref) not in rows or rows[(EVENT,ref)]['owner_id']!=fact['owner_id']):
            raise SyncError('个人结算引用的共同战斗事实缺失')
        if ref:
            receipts_by_event_actor[(ref, fact['actor_id'])].append(fact)
    for identity, party in parties.items():
        from .bard_state import validate_unit
        try:
            for unit in [*party['state'].get('players',{}).values(), *party['state'].get('enemies',{}).values()]:
                validate_unit(unit)
        except (ValueError,TypeError,KeyError) as exc:
            raise SyncError('组队音律状态无效') from exc
        version = party.get('frame_version', 1)
        if version == 2 and meta is not None and meta.get('combat_schema_version', 0) < 14:
            raise SyncError('波次内容指纹需要战斗同步14')
        members = sorted(members_by_party[identity], key=lambda r:r['id'])
        waves = sorted(waves_by_party[identity], key=lambda r:r['number'])
        active = [r for r in members if r['active']]
        if len(active)>4 or set(party['state']['players'])!={r['actor_id'] for r in active}:
            raise SyncError('组队成员与战斗状态不一致')
        if [r['number'] for r in waves]!=list(range(1,party['state'].get('wave',0)+1)):
            raise SyncError('组队波次记录不完整')
        from .party_rules import CADENCE, MULTIPLIER, COUNTS
        for wave in waves:
            fingerprint = wave.get('content_digest', '')
            if (version == 2 or fingerprint) and (not fingerprint or fingerprint != wave_digest(wave)):
                raise SyncError('组队波次内容与固化指纹不一致')
            snapshot=wave['snapshot'];count=snapshot['count'];monsters=snapshot['monsters']
            if count not in CADENCE or len(snapshot['members'])!=count or len(set(snapshot['members']))!=count or snapshot['round_seconds']!=CADENCE[count] or snapshot['multiplier']!=MULTIPLIER[count]:
                raise SyncError('组队波次人数与冻结规则不一致')
            if not COUNTS[count][0]<=len(monsters)<=COUNTS[count][1] or sum(e['rank']!='normal' for e in monsters.values())>1:
                raise SyncError('组队遭遇数量或精英首领上限无效')
        for member in members:
            run = rows.get((PREFIX+'exploration',member['exploration_id']))
            if not run or run['actor_id']!=member['actor_id'] or run['owner_id']!=party['owner_id'] or run['snapshot'].get('party_id')!=identity:
                raise SyncError('组队成员缺少个人探索来源')
        frame = aggregate_frame(party, members, waves)
        if digest(canonical(frame))!=party['frame']:
            raise SyncError('组队快照包含独立合并的成员、波次或战斗状态')
        stream = sorted(events_by_party[identity], key=lambda r:r['sequence'])
        archived = archives['parties'].get(identity)
        if archived:
            from .retention_segments import verify_shared
            try:
                verify_shared(stream, party, ranges=archived['archive']['shared_ranges'])
            except ValueError as exc:
                raise SyncError('共同归档事实链缺失或发生分叉') from exc
            continue
        previous = ''
        for index, event in enumerate(stream,1):
            content = {k:event[k] for k in ('party_id','owner_id','sequence','kind','payload','previous_hash')}
            if event['sequence']!=index or event['previous_hash']!=previous or digest(content)!=event['digest']:
                raise SyncError('组队事实链缺失或分叉，请选择完整设备快照')
            previous = event['digest']
            if event['kind']=='round':
                personal=event['payload'].get('personal',{})
                source=rows.get((WAVE,f'{identity}:{event["payload"]["wave"]}'))
                if not source or not set(personal)<=set(source['snapshot']['members']):
                    raise SyncError('共同战斗包含本波之外的奖励参与者')
                expected={reward['id']:(actor,reward) for actor,actions in personal.items() for action in actions for reward in action.get('rewards',[])}
                rolled={}
                for action in event['payload'].get('events',[]):
                    for result in action.get('rolls',[]):
                        reward_id=result['reward_id'];winner=result['winner_id'];pending=set(personal)
                        if reward_id in rolled or expected.get(reward_id)!=(winner,result['reward']):
                            raise SyncError('roll结果与个人唯一奖励归属不一致')
                        for scores in result['rounds']:
                            if set(scores)!=pending or any(type(n) is not int or not 1<=n<=100 for n in scores.values()):
                                raise SyncError('roll参与名单或点数无效')
                            high=max(scores.values());pending={actor for actor,n in scores.items() if n==high}
                        if result['rounds'] and pending!={winner}:
                            raise SyncError('roll胜出者与平点重投结果不一致')
                        rolled[reward_id]=result
                if set(rolled)!=set(expected):
                    raise SyncError('共同奖励缺少完整分配记录')
                for actor, events in event['payload'].get('personal',{}).items():
                    receipts = receipts_by_event_actor[(event['id'], actor)]
                    if len(receipts)!=1 or receipts[0]['payload'].get('events')!=events:
                        raise SyncError('组队奖励缺少唯一的个人结算事实')
        if len(stream)!=party['head'] or previous!=party['digest']:
            raise SyncError('组队事实链终点不一致')
    return True


def complete_legacy_fields(data: list[dict]) -> None:
    """Old snapshots must not inherit a newer local digest/version during restore."""
    for row in data:
        if row['model'] == PARTY:
            row['fields'].setdefault('frame_version', 1)
        elif row['model'] == WAVE:
            row['fields'].setdefault('content_digest', '')


def validate_conflicts(local, remote):
    from utils.sync_manager import SyncError
    a = {(r['model'],str(r['pk'])):r['fields'] for r in local if r['model']==EVENT}
    for row in remote:
        key = (row['model'],str(row['pk']))
        if key in a and row['fields']['digest']!=a[key]['digest']:
            raise SyncError('同场组队冒险在两台设备独立推进，请选择完整设备快照，不能逐行拼接奖励')

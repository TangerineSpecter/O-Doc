"""Validate appointment aggregates before source merge and after restore."""
from datetime import datetime, date
from .reservation_matching import DURATIONS


def validate_snapshot(data):
    from utils.sync_manager import SyncError
    def rows(name):
        return {str(r['pk']): r['fields'] for r in data if r['model'] == 'system_settings.'+name}
    days, reservations, items, runs = (rows(n) for n in ('adventureplanningday', 'adventurereservation', 'lifeitem', 'exploration'))
    used = set()
    try:
        for day in days.values():
            if day['snapshot'].get('version') != 1 or day['status'] not in ('planning', 'coordinated'):
                raise ValueError('预约规划版本或状态无效')
            date.fromisoformat(str(day['day']))
            if len(day['snapshot']['participants']) != len(set(day['snapshot']['participants'])):
                raise ValueError('预约规划居民重复')
            for actor, intent in day['snapshot'].get('intents', {}).items():
                if actor not in day['snapshot']['participants'] or intent.get('actor_id') != actor or type(intent.get('participate')) is not bool:
                    raise ValueError('预约意向归属无效')
                if intent['participate'] and (intent.get('duration_seconds') not in DURATIONS or not intent.get('dungeon_id')):
                    raise ValueError('预约意向地点或时长无效')
        for key, row in reservations.items():
            day = days.get(str(row['planning_day']))
            spec = row['snapshot']
            members = spec['members']
            prepare, start, end = (datetime.fromisoformat(str(row[k])) for k in ('prepare_at', 'starts_at', 'ends_at'))
            if not day or day['owner_id'] != row['owner_id'] or spec.get('version') != 1 or not spec.get('origin'):
                raise ValueError('预约缺少规划依据')
            if row['status'] not in ('reserved', 'preparing', 'active', 'completed', 'cancelled') or not 2 <= len(members) <= 4 or row['revision'] < 1:
                raise ValueError('预约状态或队伍人数无效')
            from ..life_time import local_time
            if local_time(start).date().isoformat() != str(day['day']) or local_time(end).date() != local_time(start).date():
                # Ending exactly at the following midnight is allowed by the daily window.
                if local_time(end).time().isoformat() != '00:00:00' or (end-start).total_seconds() > 7200 or local_time(start).date().isoformat() != str(day['day']):
                    raise ValueError('预约必须在目标日期活动窗口内')
            if (start-prepare).total_seconds() != 600 or (end-start).total_seconds() not in DURATIONS:
                raise ValueError('预约时间无效')
            for actor, member in members.items():
                item = items.get(member['item_id'])
                if not item or item['owner_id'] != row['owner_id'] or item['actor_id'] != actor or item['activity'] != 'exploration' or item.get('cycle'):
                    raise ValueError('预约成员安排缺失或归属不符')
                if item['context'].get('adventure_reservation_id') != key or item['context'].get('reservation_revision') != row['revision']:
                    raise ValueError('预约与成员安排分叉，须选择完整设备快照')
                if member['dungeon_id'] != row['dungeon_id'] or (row['status'] != 'cancelled' and day['snapshot']['intents'].get(actor, {}).get('dungeon_id') != row['dungeon_id']):
                    raise ValueError('预约地点不符合居民意向')
                marker = (row['owner_id'], actor, str(day['day']))
                if row['status'] != 'cancelled':
                    if marker in used:
                        raise ValueError('居民同日不能有多个组队预约')
                    used.add(marker)
                run = runs.get(member['run_id'])
                if run and (run['actor_id'] != actor or run['owner_id'] != row['owner_id'] or run.get('life_item_id') != member['item_id'] or run['snapshot'].get('reservation_id') != key):
                    raise ValueError('预约实际探索关联不一致')
                if member['status'] not in ('reserved', 'preparing', 'active', 'completed', 'cancelled', 'failed'):
                    raise ValueError('预约成员状态无效')
                if member['status'] in ('active', 'completed') and (not run or not spec.get('party_id') or run['snapshot'].get('party_id') != spec['party_id']):
                    raise ValueError('预约缺少同一队伍的实际探索')
        for key, item in items.items():
            reservation = item.get('context', {}).get('adventure_reservation_id')
            if reservation and (reservation not in reservations or reservations[reservation]['snapshot']['members'].get(item['actor_id'], {}).get('item_id') != key):
                raise ValueError('孤立预约成员安排')
    except (KeyError, TypeError, ValueError) as exc:
        raise SyncError('组队探索预约快照不完整：'+str(exc)) from exc

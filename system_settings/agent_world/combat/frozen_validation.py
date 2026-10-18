"""Structural and provenance checks on sealed outcomes, without replaying obsolete rules."""
from math import isfinite


def validate_progression(value) -> None:
    from utils.sync_manager import SyncError
    if (not isinstance(value, dict) or type(value.get('level')) is not int or not 1 <= value['level'] <= 99 or
            type(value.get('experience')) is not int or value['experience'] < 0 or not isinstance(value.get('job'), str) or
            not isinstance(value.get('stats'), dict) or set(value['stats']) != {'strength','dexterity','intelligence','vitality','spirit','luck'} or
            any(type(number) not in (int, float) or not isfinite(number) or number < 0 for number in value['stats'].values()) or
            not isinstance(value.get('skills'), dict) or any(not isinstance(key, str) or type(rank) is not int or rank < 1
                                                          for key, rank in value['skills'].items())):
        raise SyncError('固化成长结果结构无效')


def validate_consumption(rows: dict, row: dict, actor: str) -> None:
    from utils.sync_manager import SyncError
    for consumption in row['payload'].get('consumption', []):
        action = rows.get(('system_settings.worldaction', consumption['action_id']))
        if (not action or action['actor_id'] != actor or action['status'] != 'success' or
                float(action['energy_cost']) != consumption['amount'] or action['result'].get('exploration_id') != row['exploration_id']):
            raise SyncError('战斗体力消费来源缺失')

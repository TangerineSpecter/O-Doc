"""Validate pending/historical recipe intentions without replaying any operation."""
from .cooking_schedule_plan import validate_plan


def plan_ids(data: list[dict]) -> list[str]:
    return sorted(str(row['pk']) for row in data if row['model'] == 'system_settings.lifeitem'
                  and (row['fields'].get('context') or {}).get('cooking_plan') is not None)


def validate_source(data: list[dict], version: int, manifest) -> None:
    from utils.sync_manager import SyncError
    identities = plan_ids(data)
    if identities and version < 3:
        raise SyncError('美食日程计划需要新版同步版本')
    if version >= 3 and (not isinstance(manifest, list) or sorted(manifest) != identities):
        raise SyncError('美食日程计划清单缺失或不一致')
    profiles = {str(row['pk']): row['fields'].get('owner_id') for row in data
                if row['model'] == 'system_settings.lifeprofile'}
    for row in data:
        if row['model'] != 'system_settings.lifeitem' or str(row['pk']) not in identities:
            continue
        fields = row['fields']
        try:
            if fields.get('activity') != 'cooking' or profiles.get(fields.get('actor_id')) != fields.get('owner_id'):
                raise ValueError('计划所属居民或活动不一致')
            validate_plan(fields['context']['cooking_plan'])
        except (KeyError, TypeError, ValueError) as exc:
            raise SyncError('美食日程计划缺失或不一致') from exc

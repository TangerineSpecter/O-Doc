"""Apply legacy decision defaults only after source integrity has been verified."""
from system_settings.agent_world.life_models import LifeConfig


def policy_defaults(data: list[dict], *, full_overwrite: bool) -> dict[str, dict]:
    legacy = {}
    for row in data:
        if row.get('model') == 'system_settings.agenttask':
            market = row.get('fields', {}).get('market_config') or {}
            owner = market.get('owner_id')
            if owner:
                legacy[owner] = legacy.get(owner, False) or market.get('decision_enabled') is True
    result = {owner: {'jev_enabled': enabled, 'jev_excluded_scenes': []} for owner, enabled in legacy.items()}
    for row in data:
        if row.get('model') != 'system_settings.lifeconfig':
            continue
        identity = str(row['pk'])
        prior = LifeConfig.objects.filter(pk=identity).values_list('settings', flat=True).first() or {}
        settings = row['fields'].get('settings') or {}
        defaults = {'jev_enabled': legacy.get(identity, False), 'jev_excluded_scenes': []}
        if not full_overwrite:
            defaults.update({key: prior[key] for key in defaults if key in prior})
        result[identity] = {key: settings.get(key, value) for key, value in defaults.items()}
    return result


def normalize_policy(defaults: dict[str, dict]) -> None:
    from .routing import SCENES
    from utils.sync_manager import SyncError
    from system_settings.agent_world.life_config import DEFAULTS
    changed = False
    for owner, policy in defaults.items():
        config, created = LifeConfig.objects.get_or_create(pk=owner, defaults={'settings': dict(DEFAULTS)})
        value = dict(config.settings or {})
        for key, default in policy.items():
            if created or key not in value:
                value[key] = default
        excluded = value['jev_excluded_scenes']
        if type(value['jev_enabled']) is not bool or not isinstance(excluded, list) or any(not isinstance(key, str) or key not in SCENES for key in excluded) or len(set(excluded)) != len(excluded):
            raise SyncError('JEV 配置无效，拒绝恢复')
        if created or value != config.settings:
            config.settings = value
            config.save(update_fields=['settings'])
            changed = True
    if changed:
        from system_settings.agent_world.life_sync import checkpoint_all
        checkpoint_all()

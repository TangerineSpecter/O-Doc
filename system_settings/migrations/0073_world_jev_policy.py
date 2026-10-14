from django.db import migrations


def migrate_policy(apps, schema_editor):
    Task = apps.get_model('system_settings', 'AgentTask')
    Config = apps.get_model('system_settings', 'LifeConfig')
    owners = {}
    for task in Task.objects.filter(task_kind='market').iterator():
        value = task.market_config or {}
        owner = value.get('owner_id')
        if owner:
            owners[owner] = owners.get(owner, False) or value.get('decision_enabled') is True
    for config in Config.objects.all():
        owners.setdefault(config.pk, False)
    for owner, enabled in owners.items():
        config, _ = Config.objects.get_or_create(pk=owner, defaults={'settings': {
            'agent_ids': [], 'mode': 'fixed', 'period': 'daily', 'count': 12,
            'interval_minutes': 60, 'active_start': '00:00', 'active_end': '24:00',
            'min_gap_minutes': 15, 'min_remaining_minutes': 240, 'decision_model_id': ''}})
        value = dict(config.settings or {})
        if 'jev_enabled' not in value:
            value.update(jev_enabled=enabled, jev_excluded_scenes=[])
            config.settings = value
            config.save(update_fields=['settings'])


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0072_agent_role_profile')]
    operations = [migrations.RunPython(migrate_policy, migrations.RunPython.noop)]

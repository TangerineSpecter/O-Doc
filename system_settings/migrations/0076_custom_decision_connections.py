"""把已配置的历史 JEV 收成普通决策连接，并去掉未配置时的默认占位。

只在账号已经保存 JEV 密钥时写入连接档案，地址和模型与原先内置值相同，连接 ID 仍是 jev。
没有密钥的世界如果只是默认指向 jev，则从顺序里移除，避免继续展示一个没人添加的连接。
"""
from django.db import migrations

LEGACY_JEV_PROFILE = {
    'id': 'jev',
    'name': 'JEV',
    'protocol': 'systemone',
    'base_url': 'https://api.typesafe.ai/v1',
    'model_id': 'jev-latest',
}


def migrate_legacy_jev(apps, schema_editor):
    Setting = apps.get_model('system_settings', 'SystemSetting')
    LifeConfig = apps.get_model('system_settings', 'LifeConfig')
    db = schema_editor.connection.alias
    credentials = Setting.objects.using(db).filter(pk='system_decision_credentials').first()
    secrets = credentials.value if credentials and isinstance(credentials.value, dict) else {}
    keyed = set()
    if isinstance(secrets, dict):
        for owner, owner_values in secrets.items():
            if isinstance(owner_values, dict) and isinstance(owner_values.get('jev'), str) and owner_values.get('jev'):
                keyed.add(owner)
    if keyed:
        connections = Setting.objects.using(db).filter(pk='system_decision_connections').first()
        if connections is None:
            connections = Setting(pk='system_decision_connections', value={}, description='')
        value = dict(connections.value or {})
        changed = False
        for owner in keyed:
            profiles = value.get(owner)
            if not isinstance(profiles, list):
                profiles = []
            if any(isinstance(item, dict) and item.get('id') == 'jev' for item in profiles):
                continue
            value[owner] = [*profiles, dict(LEGACY_JEV_PROFILE)]
            changed = True
        if changed:
            connections.value = value
            connections.save()
    for config in LifeConfig.objects.using(db).all():
        if config.pk in keyed:
            continue
        settings = dict(config.settings or {})
        primary = settings.get('decision_connection_id')
        raw = settings.get('decision_connection_ids')
        listed = primary == 'jev' or (isinstance(raw, list) and 'jev' in raw)
        if not listed:
            continue
        remaining = [item for item in raw if item != 'jev'] if isinstance(raw, list) else []
        if primary == 'jev':
            settings['decision_connection_id'] = remaining[0] if remaining else ''
        if isinstance(raw, list):
            settings['decision_connection_ids'] = remaining
        config.settings = settings
        config.save(update_fields=['settings'])


class Migration(migrations.Migration):
    dependencies = [
        ('system_settings', '0075_backfill_farm_catalog_builtins'),
    ]
    operations = [migrations.RunPython(migrate_legacy_jev, migrations.RunPython.noop)]

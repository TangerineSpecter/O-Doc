from django.db import migrations, models


def normalize_names(apps, schema_editor):
    Agent = apps.get_model('system_settings', 'Agent')
    names, invalid = {}, []
    rows = list(Agent.objects.using(schema_editor.connection.alias).values_list('pk', 'name'))
    for identity, raw in rows:
        name = raw.strip()
        names.setdefault(name, []).append(identity)
    for name, identities in names.items():
        if not name or len(identities) > 1:
            invalid.append(f'{name!r}: {", ".join(identities)}')
    if invalid:
        raise RuntimeError('Agent 名称为空或重复，请先处理以下居民：' + '; '.join(invalid))
    for identity, raw in rows:
        if raw != raw.strip():
            Agent.objects.using(schema_editor.connection.alias).filter(pk=identity).update(name=raw.strip())


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0066_simplify_historical_travel_text')]
    operations = [
        migrations.AddField(model_name='agent', name='archived_at',
                            field=models.DateTimeField(null=True, blank=True, db_index=True)),
        migrations.RunPython(normalize_names, migrations.RunPython.noop),
        migrations.AddConstraint(model_name='agent',
                                constraint=models.UniqueConstraint(fields=['name'], name='agent_name_unique')),
    ]

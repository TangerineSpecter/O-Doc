from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0097_tournament_illustration')]

    operations = [
        migrations.CreateModel(name='CombatPartyCoverage', fields=[
            ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
            ('owner_id', models.CharField(db_index=True, max_length=40)),
            ('version', models.PositiveSmallIntegerField(default=1)),
            ('source', models.JSONField(default=dict)),
            ('days', models.JSONField(default=list)),
        ]),
        migrations.CreateModel(name='CombatPartyDay', fields=[
            ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
            ('party_id', models.CharField(db_index=True, max_length=64)),
            ('owner_id', models.CharField(max_length=40)),
            ('day', models.DateField()),
            ('first_sequence', models.PositiveBigIntegerField()),
            ('last_sequence', models.PositiveBigIntegerField()),
            ('groups', models.JSONField(default=list)),
        ], options={
            'indexes': [models.Index(fields=['owner_id', 'day'], name='combat_day_owner_date')],
            'constraints': [models.UniqueConstraint(fields=('party_id', 'day'), name='combat_party_day_unique')],
        }),
    ]

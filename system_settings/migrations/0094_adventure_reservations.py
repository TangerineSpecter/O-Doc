from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0093_adventure_wave_digests')]
    operations = [
        migrations.CreateModel(name='AdventurePlanningDay', fields=[
            ('id', models.CharField(primary_key=True, max_length=64, serialize=False)),
            ('owner_id', models.CharField(max_length=40, db_index=True)),
            ('day', models.DateField()), ('status', models.CharField(max_length=16, default='planning')),
            ('snapshot', models.JSONField(default=dict)), ('updated_at', models.DateTimeField(auto_now=True)),
        ], options={'constraints': [models.UniqueConstraint(fields=('owner_id', 'day'), name='adventure_owner_day')]}),
        migrations.CreateModel(name='AdventureReservation', fields=[
            ('id', models.CharField(primary_key=True, max_length=64, serialize=False)),
            ('owner_id', models.CharField(max_length=40, db_index=True)),
            ('planning_day', models.ForeignKey(to='system_settings.adventureplanningday', on_delete=django.db.models.deletion.PROTECT)),
            ('dungeon_id', models.CharField(max_length=80)), ('prepare_at', models.DateTimeField(db_index=True)),
            ('starts_at', models.DateTimeField()), ('ends_at', models.DateTimeField()),
            ('status', models.CharField(max_length=16, default='reserved')),
            ('revision', models.PositiveIntegerField(default=1)),
            ('snapshot', models.JSONField(default=dict)), ('updated_at', models.DateTimeField(auto_now=True)),
        ]),
    ]

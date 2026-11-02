from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0098_combat_party_daily')]

    operations = [
        migrations.CreateModel(name='FishingTripCoverage', fields=[
            ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
            ('owner_id', models.CharField(db_index=True, max_length=40)),
            ('actor_id', models.CharField(db_index=True, max_length=40)),
            ('version', models.PositiveSmallIntegerField(default=1)),
            ('source', models.JSONField(default=dict)),
            ('days', models.JSONField(default=list)),
        ]),
        migrations.CreateModel(name='FishingTripDay', fields=[
            ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
            ('trip_id', models.CharField(db_index=True, max_length=64)),
            ('owner_id', models.CharField(max_length=40)),
            ('actor_id', models.CharField(max_length=40)),
            ('day', models.DateField()),
            ('first_sequence', models.PositiveBigIntegerField()),
            ('last_sequence', models.PositiveBigIntegerField()),
            ('counters', models.JSONField(default=dict)),
        ], options={
            'indexes': [models.Index(fields=['owner_id', 'actor_id', 'day'], name='fishing_day_owner_actor')],
            'constraints': [models.UniqueConstraint(fields=('trip_id', 'day'), name='fishing_trip_day_unique')],
        }),
    ]

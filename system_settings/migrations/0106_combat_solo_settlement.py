from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0105_merge_model_effort_and_combat_settlement')]

    operations = [
        migrations.CreateModel(name='CombatSoloSettlement', fields=[
            ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
            ('owner_id', models.CharField(db_index=True, max_length=40)),
            ('version', models.PositiveSmallIntegerField(default=1)),
            ('content', models.JSONField(default=dict)),
            ('digest', models.CharField(max_length=64)),
        ]),
    ]

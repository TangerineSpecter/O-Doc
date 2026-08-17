from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0019_agentrunrecord_output')]

    operations = [
        migrations.CreateModel(
            name='SyncEntityState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('model_label', models.CharField(max_length=120)),
                ('object_pk', models.CharField(max_length=120)),
                ('content_hash', models.CharField(blank=True, default='', max_length=64)),
                ('revision_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('origin_device', models.CharField(blank=True, default='', max_length=80)),
                ('is_deleted', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'sys_sync_entity_state'},
        ),
        migrations.AddConstraint(
            model_name='syncentitystate',
            constraint=models.UniqueConstraint(fields=('model_label', 'object_pk'), name='sync_entity_state_unique'),
        ),
        migrations.AddIndex(
            model_name='syncentitystate',
            index=models.Index(fields=['model_label', 'is_deleted'], name='sys_sync_en_model_l_0e6021_idx'),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0102_combat_shared_event_index')]

    operations = [
        migrations.AddField(
            model_name='aimodel',
            name='reasoning_effort',
            field=models.CharField(
                choices=[('default', '默认'), ('none', '关闭'), ('low', '低'), ('medium', '中'),
                         ('high', '高'), ('xhigh', '极高'), ('max', '最高')],
                default='default', max_length=16,
            ),
        ),
    ]

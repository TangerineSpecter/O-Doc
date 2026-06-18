from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0018_agenttask_multi_agent_runs'),
    ]

    operations = [
        migrations.AddField(
            model_name='agentrunrecord',
            name='output',
            field=models.TextField(blank=True, db_comment='Agent 生成的完整输出内容', default='', verbose_name='输出内容'),
        ),
    ]

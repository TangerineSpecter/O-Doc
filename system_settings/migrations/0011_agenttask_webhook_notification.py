from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0010_skill_agent_skills'),
    ]

    operations = [
        migrations.AddField(
            model_name='agenttask',
            name='notify_enabled',
            field=models.BooleanField(db_comment='任务完成后是否发送 Webhook 通知', default=False, verbose_name='是否通知'),
        ),
        migrations.AddField(
            model_name='agenttask',
            name='notify_platform',
            field=models.CharField(choices=[('feishu', '飞书机器人')], db_comment='Webhook 通知平台', default='feishu', max_length=20, verbose_name='通知平台'),
        ),
        migrations.AddField(
            model_name='agenttask',
            name='notify_webhook_url',
            field=models.CharField(blank=True, db_comment='Webhook 地址', default='', max_length=500, verbose_name='通知 Webhook'),
        ),
        migrations.AddField(
            model_name='agentrunrecord',
            name='steps',
            field=models.JSONField(blank=True, db_comment='执行步骤', default=list, verbose_name='执行步骤'),
        ),
    ]

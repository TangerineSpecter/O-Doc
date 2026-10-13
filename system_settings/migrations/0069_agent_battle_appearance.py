from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0068_agent_execution_resumed_at')]

    operations = [
        migrations.AddField(
            model_name='agent',
            name='battle_appearance',
            field=models.JSONField(blank=True, db_comment='Agent 战斗头部素材与编辑参数，图片资源通过 Asset 同步', default=None, null=True, verbose_name='战斗形象'),
        ),
    ]

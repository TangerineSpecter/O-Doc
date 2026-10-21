from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0084_agent_loadout_portrait_scale')]

    operations = [
        migrations.AddField(
            model_name='agent', name='loadout_portrait_offset_x',
            field=models.FloatField(default=0.0, verbose_name='冒险立绘水平偏移',
                db_comment='装备页立绘水平位置，随 Agent 配置同步'),
        ),
        migrations.AddField(
            model_name='agent', name='loadout_portrait_offset_y',
            field=models.FloatField(default=0.0, verbose_name='冒险立绘垂直偏移',
                db_comment='装备页立绘垂直位置，随 Agent 配置同步'),
        ),
    ]

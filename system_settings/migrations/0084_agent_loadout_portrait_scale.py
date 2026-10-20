from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0083_agent_loadout_portrait')]
    operations = [migrations.AddField(
        model_name='agent', name='loadout_portrait_scale',
        field=models.FloatField(default=1.0, verbose_name='冒险立绘显示比例',
            db_comment='装备页立绘缩放，随 Agent 配置同步'),
    )]

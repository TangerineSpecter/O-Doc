from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0082_market_plan')]
    operations = [migrations.AddField(
        model_name='agent', name='loadout_portrait',
        field=models.CharField(max_length=255, blank=True, default='', verbose_name='冒险立绘',
            db_comment='装备页专属角色立绘资源地址，随 Agent 配置和 Asset 同步'),
    )]

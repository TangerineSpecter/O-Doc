from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0073_world_jev_policy'),
    ]

    operations = [
        migrations.AddField(
            model_name='agenttask',
            name='mcp_tool_scope',
            field=models.JSONField(
                blank=True,
                db_comment='自定义任务允许装载的 MCP 工具；空值兼容 Agent 绑定工具，空对象表示不开放 MCP',
                default=None,
                null=True,
                verbose_name='任务 MCP 工具范围',
            ),
        ),
    ]

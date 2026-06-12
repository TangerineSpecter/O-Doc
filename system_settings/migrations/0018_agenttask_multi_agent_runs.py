from django.db import migrations, models


def backfill_agent_ids(apps, schema_editor):
    AgentTask = apps.get_model('system_settings', 'AgentTask')
    for task in AgentTask.objects.all().iterator():
        if not task.agent_ids and task.agent_id:
            task.agent_ids = [task.agent_id]
            task.save(update_fields=['agent_ids'])


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0017_remove_agenttask_output_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='agenttask',
            name='agent_ids',
            field=models.JSONField(blank=True, db_comment='多 Agent 执行 ID 列表', default=list, verbose_name='执行 Agent 列表'),
        ),
        migrations.AddField(
            model_name='agenttask',
            name='execution_mode',
            field=models.CharField(choices=[('parallel', '并行执行'), ('serial', '串行执行')], db_comment='多 Agent 执行模式', default='parallel', max_length=20, verbose_name='执行模式'),
        ),
        migrations.AddField(
            model_name='agentrunrecord',
            name='agent_runs',
            field=models.JSONField(blank=True, db_comment='多 Agent 执行明细', default=list, verbose_name='Agent 执行明细'),
        ),
        migrations.RunPython(backfill_agent_ids, migrations.RunPython.noop),
    ]

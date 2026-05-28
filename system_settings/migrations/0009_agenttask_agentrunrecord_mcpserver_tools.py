import django.db.models.deletion
import django.utils.timezone
import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0008_mcpserver_headers_streamable_http'),
    ]

    operations = [
        migrations.AddField(
            model_name='mcpserver',
            name='tools',
            field=models.JSONField(blank=True, db_comment='MCP Tool 配置列表', default=list, verbose_name='Tool 配置'),
        ),
        migrations.CreateModel(
            name='AgentTask',
            fields=[
                ('id', models.CharField(db_comment='任务ID', default=utils.id_generator.generate_agent_task_id, max_length=40, primary_key=True, serialize=False, verbose_name='任务ID')),
                ('name', models.CharField(db_comment='任务名称', max_length=100, verbose_name='任务名称')),
                ('trigger', models.CharField(db_comment='触发方式', default='定时任务', max_length=40, verbose_name='触发方式')),
                ('schedule', models.CharField(blank=True, db_comment='执行周期展示', default='', max_length=80, verbose_name='执行周期展示')),
                ('schedule_type', models.CharField(choices=[('daily', '每天'), ('weekly', '每周'), ('monthly', '每月'), ('interval', '间隔')], db_comment='执行周期类型', default='daily', max_length=20, verbose_name='执行周期类型')),
                ('schedule_time', models.CharField(blank=True, db_comment='执行时间 HH:mm', default='09:00', max_length=10, verbose_name='执行时间')),
                ('schedule_weekday', models.CharField(blank=True, db_comment='执行星期 0-6', default='1', max_length=2, verbose_name='执行星期')),
                ('schedule_month_day', models.CharField(blank=True, db_comment='每月执行日期', default='1', max_length=2, verbose_name='执行日期')),
                ('interval_minutes', models.PositiveIntegerField(db_comment='间隔执行分钟数', default=60, verbose_name='间隔分钟')),
                ('output', models.CharField(choices=[('collection', '指定文集'), ('memos', 'Memos')], db_comment='输出位置', default='collection', max_length=20, verbose_name='输出位置')),
                ('target_collection_id', models.CharField(blank=True, db_comment='目标文集ID', default='', max_length=40, verbose_name='目标文集ID')),
                ('target_collection_title', models.CharField(blank=True, db_comment='目标文集名称', default='', max_length=100, verbose_name='目标文集名称')),
                ('enabled', models.BooleanField(db_comment='是否启用', default=True, verbose_name='是否启用')),
                ('prompt', models.TextField(blank=True, db_comment='任务提示词', default='', verbose_name='任务提示词')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
                ('agent', models.ForeignKey(db_comment='执行 Agent ID', on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='system_settings.agent', verbose_name='执行 Agent')),
            ],
            options={
                'verbose_name': 'Agent 任务',
                'verbose_name_plural': 'Agent 任务',
                'db_table': 'sys_agent_task',
                'db_table_comment': 'Agent 任务配置表',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.CreateModel(
            name='AgentRunRecord',
            fields=[
                ('id', models.CharField(db_comment='执行记录ID', default=utils.id_generator.generate_agent_run_id, max_length=40, primary_key=True, serialize=False, verbose_name='执行记录ID')),
                ('task_name', models.CharField(db_comment='任务名称快照', max_length=100, verbose_name='任务名称')),
                ('agent_name', models.CharField(blank=True, db_comment='Agent 名称快照', default='', max_length=50, verbose_name='Agent 名称')),
                ('trigger', models.CharField(db_comment='触发方式', default='定时任务', max_length=40, verbose_name='触发方式')),
                ('status', models.CharField(choices=[('success', '成功'), ('failed', '失败'), ('running', '执行中')], db_comment='执行状态', default='running', max_length=20, verbose_name='状态')),
                ('duration', models.CharField(blank=True, db_comment='耗时展示', default='', max_length=40, verbose_name='耗时')),
                ('summary', models.CharField(blank=True, db_comment='执行摘要', default='', max_length=255, verbose_name='摘要')),
                ('started_at', models.DateTimeField(db_comment='开始时间', default=django.utils.timezone.now, verbose_name='开始时间')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
                ('agent', models.ForeignKey(blank=True, db_comment='执行 Agent ID', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='run_records', to='system_settings.agent', verbose_name='执行 Agent')),
                ('task', models.ForeignKey(blank=True, db_comment='任务ID', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='run_records', to='system_settings.agenttask', verbose_name='任务')),
            ],
            options={
                'verbose_name': 'Agent 执行记录',
                'verbose_name_plural': 'Agent 执行记录',
                'db_table': 'sys_agent_run_record',
                'db_table_comment': 'Agent 任务执行记录表',
                'ordering': ['-started_at', '-created_at'],
            },
        ),
    ]

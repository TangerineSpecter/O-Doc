import django.db.models.deletion
import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0014_agentimsession'),
    ]

    operations = [
        migrations.AddField(
            model_name='agentimmessage',
            name='conversation_id',
            field=models.CharField(blank=True, db_comment='Agent IM 对话线程 ID', default='', max_length=40, verbose_name='对话线程 ID'),
        ),
        migrations.AddField(
            model_name='agentimsession',
            name='conversation_id',
            field=models.CharField(db_comment='当前 Agent IM 对话线程 ID', default=utils.id_generator.generate_agent_conversation_id, max_length=40, verbose_name='当前对话线程 ID'),
        ),
        migrations.CreateModel(
            name='AgentLongTermMemory',
            fields=[
                ('id', models.CharField(db_comment='长期记忆 ID', default=utils.id_generator.generate_agent_long_term_memory_id, max_length=40, primary_key=True, serialize=False, verbose_name='长期记忆 ID')),
                ('scope', models.CharField(db_comment='记忆范围', default='user', max_length=20, verbose_name='记忆范围')),
                ('chat_id', models.CharField(blank=True, db_comment='平台会话 ID', default='', max_length=120, verbose_name='会话 ID')),
                ('sender_id', models.CharField(blank=True, db_comment='平台发送者 ID', default='', max_length=120, verbose_name='发送者 ID')),
                ('memory_type', models.CharField(choices=[('preference', '偏好'), ('fact', '事实'), ('project', '项目'), ('instruction', '指令'), ('other', '其他')], db_comment='记忆类型', default='other', max_length=20, verbose_name='记忆类型')),
                ('title', models.CharField(blank=True, db_comment='记忆标题', default='', max_length=120, verbose_name='标题')),
                ('content', models.TextField(db_comment='记忆内容', verbose_name='内容')),
                ('confidence', models.FloatField(db_comment='记忆置信度', default=0.8, verbose_name='置信度')),
                ('source_count', models.PositiveIntegerField(db_comment='来源次数', default=1, verbose_name='来源次数')),
                ('status', models.CharField(choices=[('active', '有效'), ('archived', '已归档')], db_comment='状态', default='active', max_length=20, verbose_name='状态')),
                ('last_recalled_at', models.DateTimeField(blank=True, db_comment='最后召回时间', null=True, verbose_name='最后召回时间')),
                ('metadata', models.JSONField(blank=True, db_comment='元数据', default=dict, verbose_name='元数据')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
                ('agent', models.ForeignKey(db_comment='Agent ID', on_delete=django.db.models.deletion.CASCADE, related_name='long_term_memories', to='system_settings.agent', verbose_name='Agent')),
            ],
            options={
                'verbose_name': 'Agent 长期记忆',
                'verbose_name_plural': 'Agent 长期记忆',
                'db_table': 'sys_agent_long_term_memory',
                'db_table_comment': 'Agent 长期记忆表',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.CreateModel(
            name='AgentShortTermMemory',
            fields=[
                ('id', models.CharField(db_comment='短期记忆 ID', default=utils.id_generator.generate_agent_short_term_memory_id, max_length=40, primary_key=True, serialize=False, verbose_name='短期记忆 ID')),
                ('chat_id', models.CharField(blank=True, db_comment='平台会话 ID', default='', max_length=120, verbose_name='会话 ID')),
                ('sender_id', models.CharField(blank=True, db_comment='平台发送者 ID', default='', max_length=120, verbose_name='发送者 ID')),
                ('conversation_id', models.CharField(blank=True, db_comment='Agent IM 对话线程 ID', default='', max_length=40, verbose_name='对话线程 ID')),
                ('content', models.TextField(db_comment='短期记忆内容', verbose_name='内容')),
                ('expires_at', models.DateTimeField(db_comment='过期时间', verbose_name='过期时间')),
                ('recall_count', models.PositiveIntegerField(db_comment='召回次数', default=0, verbose_name='召回次数')),
                ('best_score', models.FloatField(db_comment='最佳召回分数', default=0, verbose_name='最佳召回分数')),
                ('query_sources', models.JSONField(blank=True, db_comment='查询来源列表', default=list, verbose_name='查询来源')),
                ('last_recalled_at', models.DateTimeField(blank=True, db_comment='最后召回时间', null=True, verbose_name='最后召回时间')),
                ('promoted_at', models.DateTimeField(blank=True, db_comment='晋升为长期记忆时间', null=True, verbose_name='晋升时间')),
                ('metadata', models.JSONField(blank=True, db_comment='元数据', default=dict, verbose_name='元数据')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
                ('agent', models.ForeignKey(db_comment='Agent ID', on_delete=django.db.models.deletion.CASCADE, related_name='short_term_memories', to='system_settings.agent', verbose_name='Agent')),
                ('source_message', models.ForeignKey(blank=True, db_comment='来源 IM 消息 ID', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='short_term_memories', to='system_settings.agentimmessage', verbose_name='来源消息')),
            ],
            options={
                'verbose_name': 'Agent 短期记忆',
                'verbose_name_plural': 'Agent 短期记忆',
                'db_table': 'sys_agent_short_term_memory',
                'db_table_comment': 'Agent 短期记忆表',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='agentlongtermmemory',
            index=models.Index(fields=['agent', 'sender_id', 'status'], name='idx_agent_ltm_user_status'),
        ),
        migrations.AddIndex(
            model_name='agentlongtermmemory',
            index=models.Index(fields=['agent', 'chat_id', 'status'], name='idx_agent_ltm_chat_status'),
        ),
        migrations.AddIndex(
            model_name='agentshorttermmemory',
            index=models.Index(fields=['agent', 'sender_id', 'expires_at'], name='idx_agent_stm_user_expire'),
        ),
        migrations.AddIndex(
            model_name='agentshorttermmemory',
            index=models.Index(fields=['agent', 'chat_id', 'expires_at'], name='idx_agent_stm_chat_expire'),
        ),
        migrations.AddIndex(
            model_name='agentshorttermmemory',
            index=models.Index(fields=['promoted_at', 'expires_at'], name='idx_agent_stm_promote_exp'),
        ),
    ]

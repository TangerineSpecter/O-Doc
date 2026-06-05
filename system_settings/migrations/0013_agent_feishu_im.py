import django.db.models.deletion
import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0012_mcpserver_available_in_chat'),
    ]

    operations = [
        migrations.AddField(
            model_name='agent',
            name='feishu_app_id',
            field=models.CharField(blank=True, db_comment='飞书开放平台应用 App ID', default='', max_length=80, verbose_name='飞书 App ID'),
        ),
        migrations.AddField(
            model_name='agent',
            name='feishu_app_secret',
            field=models.CharField(blank=True, db_comment='飞书开放平台应用 App Secret', default='', max_length=255, verbose_name='飞书 App Secret'),
        ),
        migrations.AddField(
            model_name='agent',
            name='feishu_encrypt_key',
            field=models.CharField(blank=True, db_comment='飞书事件订阅 Encrypt Key', default='', max_length=255, verbose_name='飞书 Encrypt Key'),
        ),
        migrations.AddField(
            model_name='agent',
            name='feishu_im_enabled',
            field=models.BooleanField(db_comment='是否启用飞书 IM 消息通道', default=False, verbose_name='启用飞书 IM'),
        ),
        migrations.AddField(
            model_name='agent',
            name='feishu_verification_token',
            field=models.CharField(blank=True, db_comment='飞书事件订阅 Verification Token', default='', max_length=255, verbose_name='飞书 Verification Token'),
        ),
        migrations.CreateModel(
            name='AgentIMMessage',
            fields=[
                ('id', models.CharField(db_comment='IM 消息记录 ID', default=utils.id_generator.generate_agent_im_message_id, max_length=40, primary_key=True, serialize=False, verbose_name='IM 消息记录 ID')),
                ('platform', models.CharField(db_comment='IM 平台', default='feishu', max_length=20, verbose_name='平台')),
                ('event_id', models.CharField(blank=True, db_comment='平台事件 ID', default='', max_length=100, verbose_name='事件 ID')),
                ('message_id', models.CharField(db_comment='平台消息 ID', max_length=120, verbose_name='消息 ID')),
                ('chat_id', models.CharField(blank=True, db_comment='平台会话 ID', default='', max_length=120, verbose_name='会话 ID')),
                ('sender_id', models.CharField(blank=True, db_comment='平台发送者 ID', default='', max_length=120, verbose_name='发送者 ID')),
                ('message_type', models.CharField(blank=True, db_comment='平台消息类型', default='', max_length=40, verbose_name='消息类型')),
                ('content', models.TextField(blank=True, db_comment='用户消息内容', default='', verbose_name='消息内容')),
                ('response', models.TextField(blank=True, db_comment='Agent 回复内容', default='', verbose_name='Agent 回复')),
                ('status', models.CharField(db_comment='处理状态', default='received', max_length=20, verbose_name='处理状态')),
                ('error', models.TextField(blank=True, db_comment='处理失败错误信息', default='', verbose_name='错误信息')),
                ('raw_event', models.JSONField(blank=True, db_comment='原始事件体', default=dict, verbose_name='原始事件')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
                ('agent', models.ForeignKey(db_comment='Agent ID', on_delete=django.db.models.deletion.CASCADE, related_name='im_messages', to='system_settings.agent', verbose_name='Agent')),
            ],
            options={
                'verbose_name': 'Agent IM 消息',
                'verbose_name_plural': 'Agent IM 消息',
                'db_table': 'sys_agent_im_message',
                'db_table_comment': 'Agent IM 消息处理记录表',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='agentimmessage',
            constraint=models.UniqueConstraint(fields=('platform', 'message_id'), name='uniq_agent_im_platform_message'),
        ),
    ]

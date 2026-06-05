import django.db.models.deletion
import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0013_agent_feishu_im'),
    ]

    operations = [
        migrations.CreateModel(
            name='AgentIMSession',
            fields=[
                ('id', models.CharField(db_comment='IM 会话 ID', default=utils.id_generator.generate_agent_im_session_id, max_length=40, primary_key=True, serialize=False, verbose_name='IM 会话 ID')),
                ('platform', models.CharField(db_comment='IM 平台', default='feishu', max_length=20, verbose_name='平台')),
                ('chat_id', models.CharField(db_comment='平台会话 ID', max_length=120, verbose_name='会话 ID')),
                ('sender_id', models.CharField(blank=True, db_comment='平台发送者 ID', default='', max_length=120, verbose_name='发送者 ID')),
                ('summary', models.TextField(blank=True, db_comment='早期历史压缩摘要', default='', verbose_name='会话摘要')),
                ('summary_until', models.DateTimeField(blank=True, db_comment='已压缩摘要覆盖到的消息创建时间', null=True, verbose_name='摘要截止时间')),
                ('summary_token_estimate', models.IntegerField(db_comment='摘要 Token 粗略估算', default=0, verbose_name='摘要 Token 估算')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
                ('agent', models.ForeignKey(db_comment='Agent ID', on_delete=django.db.models.deletion.CASCADE, related_name='im_sessions', to='system_settings.agent', verbose_name='Agent')),
            ],
            options={
                'verbose_name': 'Agent IM 会话',
                'verbose_name_plural': 'Agent IM 会话',
                'db_table': 'sys_agent_im_session',
                'db_table_comment': 'Agent IM 会话摘要表',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='agentimsession',
            constraint=models.UniqueConstraint(fields=('agent', 'platform', 'chat_id'), name='uniq_agent_im_session_chat'),
        ),
    ]

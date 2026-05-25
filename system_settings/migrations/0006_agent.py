import utils.id_generator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0005_add_image_model_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='Agent',
            fields=[
                (
                    'id',
                    models.CharField(
                        db_comment='Agent ID',
                        default=utils.id_generator.generate_agent_id,
                        max_length=40,
                        primary_key=True,
                        serialize=False,
                        verbose_name='Agent ID',
                    ),
                ),
                ('name', models.CharField(db_comment='Agent 名称', max_length=50, verbose_name='Agent 名称')),
                (
                    'avatar',
                    models.CharField(
                        blank=True,
                        db_comment='头像，可存储 URL、Emoji 或静态资源路径',
                        default='',
                        max_length=255,
                        verbose_name='头像',
                    ),
                ),
                ('prompt', models.TextField(blank=True, db_comment='提示词', default='', verbose_name='提示词')),
                (
                    'mcp_servers',
                    models.JSONField(
                        blank=True,
                        db_comment='MCP 服务配置列表',
                        default=list,
                        verbose_name='MCP 配置',
                    ),
                ),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
                (
                    'model',
                    models.ForeignKey(
                        blank=True,
                        db_comment='使用模型ID',
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='agents',
                        to='system_settings.aimodel',
                        verbose_name='使用模型',
                    ),
                ),
            ],
            options={
                'verbose_name': 'Agent',
                'verbose_name_plural': 'Agent',
                'db_table': 'sys_agent',
                'db_table_comment': 'Agent 配置表',
                'ordering': ['-updated_at'],
            },
        ),
    ]

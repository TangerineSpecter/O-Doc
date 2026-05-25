import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0006_agent'),
    ]

    operations = [
        migrations.CreateModel(
            name='MCPServer',
            fields=[
                (
                    'id',
                    models.CharField(
                        db_comment='MCP 服务ID',
                        default=utils.id_generator.generate_mcp_server_id,
                        max_length=40,
                        primary_key=True,
                        serialize=False,
                        verbose_name='MCP 服务ID',
                    ),
                ),
                ('name', models.CharField(db_comment='MCP 名称', max_length=80, unique=True, verbose_name='MCP 名称')),
                (
                    'transport',
                    models.CharField(
                        choices=[('stdio', 'STDIO'), ('sse', 'SSE'), ('http', 'HTTP')],
                        db_comment='传输方式',
                        default='stdio',
                        max_length=20,
                        verbose_name='传输方式',
                    ),
                ),
                ('command', models.CharField(blank=True, db_comment='启动命令', default='', max_length=255, verbose_name='启动命令')),
                ('args', models.JSONField(blank=True, db_comment='命令参数', default=list, verbose_name='命令参数')),
                ('url', models.CharField(blank=True, db_comment='服务 URL', default='', max_length=255, verbose_name='服务 URL')),
                ('env', models.JSONField(blank=True, db_comment='环境变量', default=dict, verbose_name='环境变量')),
                (
                    'source',
                    models.CharField(
                        choices=[('system', '系统扫描'), ('external', '外部接入')],
                        db_comment='来源',
                        default='external',
                        max_length=20,
                        verbose_name='来源',
                    ),
                ),
                ('enabled', models.BooleanField(db_comment='是否启用', default=True, verbose_name='是否启用')),
                ('description', models.CharField(blank=True, db_comment='描述', default='', max_length=200, verbose_name='描述')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
            ],
            options={
                'verbose_name': 'MCP 服务',
                'verbose_name_plural': 'MCP 服务',
                'db_table': 'sys_mcp_server',
                'db_table_comment': 'MCP 服务配置表',
                'ordering': ['source', 'name'],
            },
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0007_mcpserver'),
    ]

    operations = [
        migrations.AddField(
            model_name='mcpserver',
            name='headers',
            field=models.JSONField(blank=True, db_comment='请求头', default=dict, verbose_name='请求头'),
        ),
        migrations.AlterField(
            model_name='mcpserver',
            name='transport',
            field=models.CharField(
                choices=[
                    ('stdio', 'STDIO'),
                    ('sse', 'SSE'),
                    ('streamableHttp', 'Streamable HTTP'),
                ],
                db_comment='传输方式',
                default='stdio',
                max_length=20,
                verbose_name='传输方式',
            ),
        ),
    ]

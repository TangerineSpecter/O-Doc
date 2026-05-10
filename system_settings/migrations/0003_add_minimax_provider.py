from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0002_alter_aimodel_table_comment_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aiprovider',
            name='type',
            field=models.CharField(
                choices=[
                    ('OpenAi', 'OpenAI'),
                    ('Google AI', 'Google AI'),
                    ('Xiaomi', '小米 (Xiaomi)'),
                    ('Qwen', '通义千问 (Qwen)'),
                    ('Doubao', '豆包 (Doubao)'),
                    ('DeepSeek', 'DeepSeek'),
                    ('Ollama', 'Ollama'),
                    ('SiliconFlow', 'SiliconFlow (硅基流动)'),
                    ('MiniMax', 'MiniMax'),
                    ('custom', '自定义 (Custom)'),
                ],
                db_comment='提供商类型',
                max_length=20,
                verbose_name='提供商类型',
            ),
        ),
    ]

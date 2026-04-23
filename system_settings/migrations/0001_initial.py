import django.db.models.deletion
import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='AIProvider',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_provider_id, max_length=40, primary_key=True, serialize=False, verbose_name='提供商ID')),
                ('name', models.CharField(max_length=50, verbose_name='提供商名称')),
                ('type', models.CharField(choices=[('OpenAi', 'OpenAI'), ('Google AI', 'Google AI'), ('Xiaomi', '小米 (Xiaomi)'), ('Qwen', '通义千问 (Qwen)'), ('Doubao', '豆包 (Doubao)'), ('DeepSeek', 'DeepSeek'), ('Ollama', 'Ollama'), ('SiliconFlow', 'SiliconFlow (硅基流动)'), ('custom', '自定义 (Custom)')], max_length=20, verbose_name='提供商类型')),
                ('base_url', models.CharField(max_length=255, verbose_name='API Base URL')),
                ('api_key', models.CharField(blank=True, default='', max_length=255, verbose_name='API Key')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': 'AI提供商',
                'verbose_name_plural': 'AI提供商',
                'db_table': 'sys_ai_provider',
            },
        ),
        migrations.CreateModel(
            name='SystemSetting',
            fields=[
                ('key', models.CharField(max_length=50, primary_key=True, serialize=False)),
                ('value', models.JSONField(default=dict)),
                ('description', models.CharField(blank=True, max_length=200)),
            ],
            options={
                'db_table': 'sys_setting',
            },
        ),
        migrations.CreateModel(
            name='AIModel',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_model_id, max_length=40, primary_key=True, serialize=False, verbose_name='模型ID')),
                ('name', models.CharField(max_length=100, verbose_name='模型实际名称 (Model ID)')),
                ('display_name', models.CharField(blank=True, max_length=100, null=True, verbose_name='显示名称')),
                ('type', models.CharField(choices=[('chat', '对话 (Chat)'), ('embedding', '向量化 (Embedding)'), ('rerank', '重排序 (Rerank)')], max_length=20, verbose_name='模型类型')),
                ('provider', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='models', to='system_settings.aiprovider', verbose_name='所属提供商')),
            ],
            options={
                'verbose_name': 'AI模型',
                'verbose_name_plural': 'AI模型',
                'db_table': 'sys_ai_model',
            },
        ),
    ]

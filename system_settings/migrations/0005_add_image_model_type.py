from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0004_geolocation'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aimodel',
            name='type',
            field=models.CharField(
                choices=[
                    ('chat', '对话 (Chat)'),
                    ('image', '图像识别 (Image Recognition)'),
                    ('embedding', '向量化 (Embedding)'),
                    ('rerank', '重排序 (Rerank)'),
                ],
                db_comment='模型类型',
                max_length=20,
                verbose_name='模型类型',
            ),
        ),
    ]

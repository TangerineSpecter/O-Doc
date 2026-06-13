from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('anthology', '0005_anthology_hide_cover_content'),
    ]

    operations = [
        migrations.AlterField(
            model_name='anthology',
            name='type',
            field=models.CharField(
                choices=[
                    ('article', '文章文集'),
                    ('image', '图片文集'),
                    ('agent', 'Agent 文集'),
                ],
                db_comment='文集类型',
                default='article',
                max_length=10,
                verbose_name='文集类型',
            ),
        ),
    ]

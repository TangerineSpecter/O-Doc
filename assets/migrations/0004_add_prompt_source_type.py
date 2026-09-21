from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('assets', '0003_add_image_source_type')]

    operations = [
        migrations.AlterField(
            model_name='asset',
            name='source_type',
            field=models.CharField(
                choices=[
                    ('attachment', '附件'), ('content', '内容'), ('image', '图片文集'),
                    ('prompt', '提示词效果'), ('other', '其他'),
                ],
                db_comment='资源来源类型', default='other', max_length=20, verbose_name='资源来源类型',
            ),
        ),
    ]

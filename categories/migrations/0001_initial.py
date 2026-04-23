import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Category',
            fields=[
                ('category_id', models.CharField(default=utils.id_generator.generate_category_id, editable=False, max_length=36, primary_key=True, serialize=False, verbose_name='分类专属ID')),
                ('name', models.CharField(max_length=50, unique=True, verbose_name='分类名称')),
                ('description', models.CharField(blank=True, default='', max_length=200, verbose_name='分类描述')),
                ('userid', models.CharField(default='admin', max_length=50, verbose_name='创建者ID')),
                ('theme_id', models.CharField(default='blue', max_length=20, verbose_name='颜色主题ID')),
                ('icon_key', models.CharField(default='Folder', max_length=50, verbose_name='图标Key')),
                ('is_valid', models.BooleanField(default=True, verbose_name='是否有效')),
                ('sort', models.IntegerField(default=0, verbose_name='排序值，值越小越靠前')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '分类',
                'verbose_name_plural': '分类管理',
                'db_table': 'categories',
                'ordering': ['sort', '-created_at'],
            },
        ),
    ]

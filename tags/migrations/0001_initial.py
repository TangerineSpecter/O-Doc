import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Tag',
            fields=[
                ('tag_id', models.CharField(default=utils.id_generator.generate_tag_id, editable=False, max_length=36, primary_key=True, serialize=False, verbose_name='标签专属ID')),
                ('name', models.CharField(max_length=30, verbose_name='标签名称')),
                ('theme_id', models.CharField(default='blue', max_length=36, verbose_name='主题ID')),
                ('user_id', models.CharField(default='admin', max_length=50, verbose_name='创建者ID')),
                ('is_valid', models.BooleanField(default=True, verbose_name='是否有效')),
                ('sort', models.IntegerField(default=0, verbose_name='排序值，值越小越靠前')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '标签',
                'verbose_name_plural': '标签管理',
                'db_table': 'tags',
                'ordering': ['sort', '-created_at'],
                'unique_together': {('user_id', 'name')},
            },
        ),
    ]

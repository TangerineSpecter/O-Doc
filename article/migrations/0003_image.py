# Generated migration for the Image model

from django.db import migrations, models
import utils.id_generator


class Migration(migrations.Migration):

    dependencies = [
        ('article', '0002_alter_article_table_comment_alter_article_article_id_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Image',
            fields=[
                ('image_id', models.CharField(db_comment='图片唯一标识', default=utils.id_generator.generate_image_id, editable=False, help_text='图片唯一标识', max_length=32, primary_key=True, serialize=False, unique=True)),
                ('title', models.CharField(db_comment='图片标题', help_text='图片标题', max_length=255)),
                ('description', models.TextField(blank=True, db_comment='图片描述', default='', help_text='图片描述')),
                ('image_url', models.CharField(db_comment='图片URL', help_text='图片URL', max_length=500)),
                ('coll_id', models.CharField(db_comment='所属文集ID', help_text='所属文集ID，与anthologies表的coll_id对应', max_length=32)),
                ('shooting_time', models.DateTimeField(blank=True, db_comment='拍摄时间', help_text='拍摄时间', null=True)),
                ('location', models.CharField(blank=True, db_comment='拍摄地点', default='', help_text='拍摄地点', max_length=255)),
                ('tags', models.CharField(blank=True, db_comment='标签', default='', help_text='标签，多个标签用逗号分隔', max_length=500)),
                ('author', models.CharField(db_comment='图片作者', default='admin', help_text='图片作者', max_length=50)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', help_text='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', help_text='更新时间')),
                ('is_valid', models.BooleanField(db_comment='是否有效', default=True, help_text='是否有效')),
            ],
            options={
                'verbose_name': '图片',
                'verbose_name_plural': '图片管理',
                'db_table': 'images',
                'db_table_comment': '图片表',
                'ordering': ['-created_at'],
            },
        ),
    ]

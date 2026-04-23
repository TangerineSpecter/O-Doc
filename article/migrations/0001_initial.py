import django.db.models.deletion
import django.utils.timezone
import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('categories', '0001_initial'),
        ('tags', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Article',
            fields=[
                ('article_id', models.CharField(default=utils.id_generator.generate_article_id, editable=False, help_text='文章唯一标识', max_length=32, primary_key=True, serialize=False, unique=True)),
                ('title', models.CharField(help_text='文章标题', max_length=255)),
                ('content', models.TextField(help_text='文章内容（Markdown格式）')),
                ('coll_id', models.CharField(help_text='所属文集ID，与anthologies表的coll_id对应', max_length=32)),
                ('author', models.CharField(default='admin', help_text='文章作者', max_length=50)),
                ('source_url', models.URLField(blank=True, help_text='文章来源网址', max_length=500, null=True)),
                ('is_polishing', models.BooleanField(default=False, help_text='是否正在进行AI润色')),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, help_text='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='更新时间')),
                ('is_valid', models.BooleanField(default=True, help_text='是否有效')),
                ('permission', models.CharField(choices=[('public', '公开'), ('private', '私有')], default='public', help_text='文章权限', max_length=20)),
                ('read_count', models.PositiveIntegerField(default=0, help_text='阅读次数')),
                ('word_count', models.PositiveIntegerField(default=0, help_text='文章字数')),
                ('read_time', models.PositiveIntegerField(default=0, help_text='预计阅读时长(分钟)')),
                ('total_read_seconds', models.PositiveIntegerField(default=0, help_text='累计阅读时长(秒)')),
                ('sort', models.IntegerField(default=0, help_text='文章排序值，值越小越靠前')),
                ('is_rag_synced', models.BooleanField(default=False, help_text='是否已同步到RAG知识库')),
                ('last_rag_synced_at', models.DateTimeField(blank=True, help_text='上次同步到RAG的时间', null=True)),
                ('category', models.ForeignKey(blank=True, help_text='文章所属分类', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='articles', to='categories.category', verbose_name='所属分类')),
                ('parent', models.ForeignKey(blank=True, help_text='父级文章ID，用于构建文档树形结构', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='children', to='article.article', verbose_name='父级文章')),
                ('tags', models.ManyToManyField(blank=True, help_text='文章关联的标签', related_name='articles', to='tags.tag', verbose_name='文章标签')),
            ],
            options={
                'verbose_name': '文章',
                'verbose_name_plural': '文章管理',
                'db_table': 'article',
                'ordering': ['sort', '-updated_at'],
                'unique_together': {('author', 'coll_id', 'title')},
            },
        ),
    ]

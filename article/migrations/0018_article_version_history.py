import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models

import utils.id_generator


class Migration(migrations.Migration):
    dependencies = [
        ('article', '0017_image_visual_index_coll_id'),
    ]

    operations = [
        migrations.CreateModel(
            name='ArticleVersion',
            fields=[
                ('version_id', models.CharField(
                    db_comment='跨设备稳定的文章版本 ID',
                    default=utils.id_generator.generate_article_version_id,
                    editable=False,
                    max_length=32,
                    primary_key=True,
                    serialize=False,
                    verbose_name='版本 ID',
                )),
                ('title', models.CharField(max_length=255, verbose_name='文章标题')),
                ('content', models.TextField(verbose_name='Markdown 正文')),
                ('coll_id', models.CharField(max_length=32, verbose_name='文集 ID')),
                ('category_id', models.CharField(blank=True, default='', max_length=36, verbose_name='分类 ID')),
                ('tag_ids', models.JSONField(blank=True, default=list, verbose_name='标签 ID 列表')),
                ('post_summary', models.CharField(blank=True, default='', max_length=300, verbose_name='文章摘要')),
                ('word_count', models.PositiveIntegerField(default=0, verbose_name='文章字数')),
                ('operator_id', models.CharField(blank=True, default='', max_length=80, verbose_name='操作者')),
                ('source', models.CharField(
                    choices=[('save', '保存'), ('polish', '润色'), ('restore', '恢复'), ('import', '导入')],
                    default='save',
                    max_length=20,
                    verbose_name='版本来源',
                )),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False, verbose_name='版本时间')),
                ('article', models.ForeignKey(
                    db_column='article_id',
                    db_comment='所属文章 ID',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='versions',
                    to='article.article',
                    to_field='article_id',
                    verbose_name='所属文章',
                )),
            ],
            options={
                'verbose_name': '文章历史版本',
                'verbose_name_plural': '文章历史版本',
                'db_table': 'article_versions',
                'ordering': ['-created_at', '-version_id'],
            },
        ),
        migrations.AddIndex(
            model_name='articleversion',
            index=models.Index(fields=['article', '-created_at'], name='art_ver_art_cr_idx'),
        ),
    ]

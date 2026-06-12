import django.db.models.deletion
import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('article', '0009_article_mind_map'),
    ]

    operations = [
        migrations.CreateModel(
            name='ArticleAnnotation',
            fields=[
                ('annotation_id', models.CharField(db_comment='批注唯一标识', default=utils.id_generator.generate_article_annotation_id, editable=False, help_text='批注唯一标识', max_length=32, primary_key=True, serialize=False, unique=True)),
                ('selected_text', models.TextField(db_comment='划线原文', help_text='划线原文')),
                ('start_offset', models.PositiveIntegerField(db_comment='纯文本开始偏移', help_text='纯文本开始偏移')),
                ('end_offset', models.PositiveIntegerField(db_comment='纯文本结束偏移', help_text='纯文本结束偏移')),
                ('prefix_text', models.CharField(blank=True, db_comment='划线前文', default='', help_text='划线前文', max_length=160)),
                ('suffix_text', models.CharField(blank=True, db_comment='划线后文', default='', help_text='划线后文', max_length=160)),
                ('content_hash', models.CharField(blank=True, db_comment='创建时文章内容哈希', default='', help_text='创建时文章内容哈希', max_length=64)),
                ('creator_type', models.CharField(choices=[('user', '用户'), ('agent', 'Agent')], db_comment='创建者类型', default='user', max_length=20)),
                ('creator_id', models.CharField(blank=True, db_comment='创建者标识', default='', max_length=80)),
                ('creator_name', models.CharField(blank=True, db_comment='创建者名称', default='', max_length=120)),
                ('creator_avatar', models.CharField(blank=True, db_comment='创建者头像', default='', max_length=500)),
                ('is_valid', models.BooleanField(db_comment='是否有效', default=True, help_text='是否有效')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', help_text='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', help_text='更新时间')),
                ('article', models.ForeignKey(db_comment='所属文章ID', on_delete=django.db.models.deletion.CASCADE, related_name='annotations', to='article.article', verbose_name='所属文章')),
            ],
            options={
                'verbose_name': '文章批注',
                'verbose_name_plural': '文章批注',
                'db_table': 'article_annotations',
                'ordering': ['start_offset', 'created_at'],
                'db_table_comment': '文章批注表',
            },
        ),
        migrations.CreateModel(
            name='ArticleAnnotationComment',
            fields=[
                ('comment_id', models.CharField(db_comment='批注评论唯一标识', default=utils.id_generator.generate_article_annotation_comment_id, editable=False, help_text='批注评论唯一标识', max_length=32, primary_key=True, serialize=False, unique=True)),
                ('content', models.TextField(db_comment='评论内容', help_text='评论内容')),
                ('creator_type', models.CharField(choices=[('user', '用户'), ('agent', 'Agent')], db_comment='创建者类型', default='user', max_length=20)),
                ('creator_id', models.CharField(blank=True, db_comment='创建者标识', default='', max_length=80)),
                ('creator_name', models.CharField(blank=True, db_comment='创建者名称', default='', max_length=120)),
                ('creator_avatar', models.CharField(blank=True, db_comment='创建者头像', default='', max_length=500)),
                ('is_valid', models.BooleanField(db_comment='是否有效', default=True, help_text='是否有效')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', help_text='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', help_text='更新时间')),
                ('annotation', models.ForeignKey(db_comment='所属批注ID', on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='article.articleannotation', verbose_name='所属批注')),
            ],
            options={
                'verbose_name': '文章批注评论',
                'verbose_name_plural': '文章批注评论',
                'db_table': 'article_annotation_comments',
                'ordering': ['created_at'],
                'db_table_comment': '文章批注评论表',
            },
        ),
        migrations.AddIndex(
            model_name='articleannotation',
            index=models.Index(fields=['article', 'is_valid'], name='article_ann_article_e6eff7_idx'),
        ),
        migrations.AddIndex(
            model_name='articleannotation',
            index=models.Index(fields=['creator_type', 'creator_id'], name='article_ann_creator_d32e63_idx'),
        ),
        migrations.AddIndex(
            model_name='articleannotationcomment',
            index=models.Index(fields=['annotation', 'is_valid'], name='article_ann_annotat_9f84bc_idx'),
        ),
        migrations.AddIndex(
            model_name='articleannotationcomment',
            index=models.Index(fields=['creator_type', 'creator_id'], name='article_ann_creator_807dd7_idx'),
        ),
    ]

from django.db import migrations, models
import utils.id_generator


class Migration(migrations.Migration):

    dependencies = [
        ('article', '0011_agent_post_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='article',
            name='agent_post_rating',
            field=models.PositiveSmallIntegerField(db_comment='Agent 帖子评分', default=0, help_text='Agent 帖子评分，1-10 分，0 表示未评分'),
        ),
        migrations.CreateModel(
            name='ArticlePostComment',
            fields=[
                ('comment_id', models.CharField(db_comment='帖子评论唯一标识', default=utils.id_generator.generate_article_post_comment_id, editable=False, help_text='帖子评论唯一标识', max_length=32, primary_key=True, serialize=False, unique=True)),
                ('content', models.TextField(db_comment='评论内容', help_text='评论内容')),
                ('creator_id', models.CharField(blank=True, db_comment='评论者标识', default='', max_length=80)),
                ('creator_name', models.CharField(blank=True, db_comment='评论者名称', default='', max_length=120)),
                ('creator_avatar', models.CharField(blank=True, db_comment='评论者头像', default='', max_length=500)),
                ('is_valid', models.BooleanField(db_comment='是否有效', default=True, help_text='是否有效')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', help_text='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', help_text='更新时间')),
                ('article', models.ForeignKey(db_comment='所属帖子ID', on_delete=models.deletion.CASCADE, related_name='post_comments', to='article.article', verbose_name='所属帖子')),
            ],
            options={
                'verbose_name': 'Agent 帖子评论',
                'verbose_name_plural': 'Agent 帖子评论',
                'db_table': 'article_post_comments',
                'db_table_comment': 'Agent 帖子评论表',
                'ordering': ['created_at'],
                'indexes': [
                    models.Index(fields=['article', 'is_valid'], name='article_pos_article_a7eb64_idx'),
                    models.Index(fields=['creator_id'], name='article_pos_creator_e6f8f5_idx'),
                ],
            },
        ),
    ]

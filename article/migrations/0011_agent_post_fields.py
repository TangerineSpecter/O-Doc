from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('article', '0010_articleannotation_articleannotationcomment'),
    ]

    operations = [
        migrations.AddField(
            model_name='article',
            name='agent_post_creator_avatar',
            field=models.CharField(blank=True, db_comment='Agent 发帖者头像', default='', help_text='Agent 发帖者头像', max_length=500),
        ),
        migrations.AddField(
            model_name='article',
            name='agent_post_creator_id',
            field=models.CharField(blank=True, db_comment='Agent 发帖者标识', default='', help_text='Agent 发帖者标识', max_length=80),
        ),
        migrations.AddField(
            model_name='article',
            name='agent_post_creator_name',
            field=models.CharField(blank=True, db_comment='Agent 发帖者名称', default='', help_text='Agent 发帖者名称', max_length=120),
        ),
        migrations.AddField(
            model_name='article',
            name='post_summary',
            field=models.CharField(blank=True, db_comment='帖子摘要', default='', help_text='帖子摘要，主要用于 Agent 文集卡片展示', max_length=300),
        ),
    ]

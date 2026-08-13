from django.db import migrations, models


class Migration(migrations.Migration):
    # This migration was added after the existing 0013 chain.  Keeping it on
    # that leaf avoids creating a parallel migration branch for fresh installs.
    dependencies = [('article', '0013_article_agent_post_category_articlepostrating')]

    operations = [
        migrations.AddField(
            model_name='image', name='photo_group_id',
            field=models.CharField(blank=True, db_comment='多照片拍摄组标识', db_index=True, default='', help_text='多照片拍摄组标识', max_length=32),
        ),
        migrations.AddField(
            model_name='image', name='group_index',
            field=models.PositiveIntegerField(db_comment='拍摄组内展示顺序', default=0, help_text='拍摄组内展示顺序'),
        ),
    ]

from django.db import migrations, models
from django.db.models import Q


def retire_book_reviews(apps, schema_editor):
    DailyReviewItem = apps.get_model('knowledge_maintenance', 'DailyReviewItem')
    DailyReviewItem.objects.filter(
        Q(slot_type='reading_book') | Q(source_type='book')
    ).update(status='replaced')


class Migration(migrations.Migration):
    dependencies = [
        ('knowledge_maintenance', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(retire_book_reviews, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='dailyreviewitem',
            name='slot_type',
            field=models.CharField(
                choices=[
                    ('old_article', '旧文章'),
                    ('old_memo', '旧闪念'),
                    ('recent_content', '近期内容'),
                    ('comment_review', '评论回顾'),
                ],
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name='dailyreviewitem',
            name='source_type',
            field=models.CharField(
                choices=[('article', '文章'), ('memo', '闪念'), ('comment', '评论')],
                max_length=20,
            ),
        ),
    ]

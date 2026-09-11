# Generated manually for the knowledge maintenance feature.
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []

    operations = [
        migrations.CreateModel(
            name='DailyReviewItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('user_id', models.CharField(db_index=True, max_length=50)),
                ('review_date', models.DateField(db_index=True)),
                ('slot_type', models.CharField(choices=[('old_article', '旧文章'), ('old_memo', '旧闪念'), ('recent_content', '近期内容'), ('reading_book', '在读图书')], max_length=30)),
                ('source_type', models.CharField(choices=[('article', '文章'), ('memo', '闪念'), ('book', '图书')], max_length=20)),
                ('source_id', models.CharField(max_length=40)),
                ('status', models.CharField(choices=[('pending', '待处理'), ('completed', '已完成'), ('skipped', '已跳过'), ('replaced', '已替换')], default='pending', max_length=20)),
                ('batch_no', models.PositiveIntegerField(default=1)),
                ('sort_order', models.PositiveSmallIntegerField(default=0)),
                ('reason_code', models.CharField(max_length=40)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'knowledge_daily_review_items',
                'ordering': ['review_date', 'sort_order', 'created_at'],
            },
        ),
        migrations.CreateModel(
            name='HealthIssueIgnore',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('user_id', models.CharField(db_index=True, max_length=50)),
                ('rule_code', models.CharField(max_length=40)),
                ('source_type', models.CharField(max_length=20)),
                ('source_id', models.CharField(max_length=40)),
                ('source_fingerprint', models.CharField(max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'db_table': 'knowledge_health_issue_ignores'},
        ),
        migrations.AddIndex(model_name='dailyreviewitem', index=models.Index(fields=['user_id', 'review_date', 'status'], name='knowledge_r_user_da_2d3378_idx')),
        migrations.AddIndex(model_name='dailyreviewitem', index=models.Index(fields=['source_type', 'source_id'], name='knowledge_r_source__fbd1c7_idx')),
        migrations.AddConstraint(model_name='dailyreviewitem', constraint=models.UniqueConstraint(fields=('user_id', 'review_date', 'batch_no', 'sort_order'), name='uniq_daily_review_batch_position')),
        migrations.AddIndex(model_name='healthissueignore', index=models.Index(fields=['user_id', 'rule_code'], name='knowledge_h_user_id_232428_idx')),
        migrations.AddConstraint(model_name='healthissueignore', constraint=models.UniqueConstraint(fields=('user_id', 'rule_code', 'source_type', 'source_id'), name='uniq_health_issue_ignore')),
    ]


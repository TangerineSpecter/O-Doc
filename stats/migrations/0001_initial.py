import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('article', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ReadStat',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_identifier', models.CharField(db_index=True, help_text='登录用户ID或游客IP', max_length=64, verbose_name='用户标识')),
                ('duration', models.PositiveIntegerField(default=0, help_text='该次访问的停留时长', verbose_name='阅读时长(秒)')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='记录时间')),
                ('article', models.ForeignKey(help_text='关联的文章', on_delete=django.db.models.deletion.CASCADE, related_name='read_stats', to='article.article', verbose_name='文章')),
            ],
            options={
                'verbose_name': '阅读统计',
                'verbose_name_plural': '阅读统计',
                'db_table': 'stats_read_record',
                'ordering': ['-created_at'],
            },
        ),
    ]

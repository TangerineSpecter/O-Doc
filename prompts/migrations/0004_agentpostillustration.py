from django.db import migrations, models

import prompts.models


class Migration(migrations.Migration):

    dependencies = [
        ('prompts', '0003_pendingarticleillustration_model_id_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='AgentPostIllustration',
            fields=[
                ('id', models.CharField(default=prompts.models.generate_agent_post_illustration_id, editable=False, max_length=32, primary_key=True, serialize=False)),
                ('user_id', models.CharField(db_index=True, max_length=50)),
                ('article_id', models.CharField(db_index=True, max_length=32)),
                ('prompt', models.TextField(blank=True, default='')),
                ('aspect_ratio', models.CharField(blank=True, default='16:9', max_length=20)),
                ('image_size', models.CharField(default='1K', max_length=8)),
                ('status', models.CharField(db_index=True, default='queued', max_length=20)),
                ('model_id', models.CharField(blank=True, default='', max_length=40)),
                ('provider_type', models.CharField(blank=True, default='', max_length=20)),
                ('provider_task_id', models.CharField(blank=True, default='', max_length=128)),
                ('image_url', models.URLField(blank=True, default='', max_length=2048)),
                ('asset_id', models.CharField(blank=True, default='', max_length=32)),
                ('error_message', models.CharField(blank=True, default='', max_length=200)),
                ('generate_attempts', models.PositiveSmallIntegerField(default=0)),
                ('download_attempts', models.PositiveSmallIntegerField(default=0)),
                ('next_attempt_at', models.DateTimeField(blank=True, null=True)),
                ('generating_started_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'agent_post_illustrations',
                'ordering': ['created_at'],
            },
        ),
    ]

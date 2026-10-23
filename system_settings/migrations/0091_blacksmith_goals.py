from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0090_blacksmith')]

    operations = [migrations.CreateModel(
        name='BlacksmithGoal',
        fields=[
            ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
            ('owner_id', models.CharField(db_index=True, max_length=40)),
            ('actor_id', models.CharField(db_index=True, max_length=40)),
            ('recipe_id', models.CharField(max_length=40)),
            ('template_id', models.CharField(max_length=80)),
            ('status', models.CharField(default='active', max_length=16)),
            ('operation_id', models.CharField(blank=True, default='', max_length=140)),
            ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ],
        options={'ordering': ['created_at', 'id'], 'indexes': [models.Index(fields=['owner_id', 'actor_id', 'status'], name='blacksmith_goal_actor')]},
    )]

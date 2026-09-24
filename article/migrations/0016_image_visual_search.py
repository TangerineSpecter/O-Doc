import article.models
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('article', '0015_article_enforce_note_privacy')]

    operations = [
        migrations.AddField(model_name='image', name='ai_visual_description', field=models.TextField(blank=True, default='')),
        migrations.AddField(model_name='image', name='visual_description_override', field=models.TextField(blank=True, default='')),
        migrations.AddField(model_name='image', name='ai_visual_source_hash', field=models.CharField(blank=True, default='', max_length=64)),
        migrations.AddField(model_name='image', name='visual_override_source_hash', field=models.CharField(blank=True, default='', max_length=64)),
        migrations.AddField(model_name='image', name='ai_visual_prompt_version', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name='image', name='ai_visual_model', field=models.CharField(blank=True, default='', max_length=255)),
        migrations.CreateModel(name='ImageVisualIndex', fields=[
            ('image', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, serialize=False, to='article.image')),
            ('enabled', models.BooleanField(default=True)),
            ('collection_name', models.CharField(blank=True, default='', max_length=64)),
            ('model_key', models.CharField(blank=True, default='', max_length=64)),
            ('text_hash', models.CharField(blank=True, default='', max_length=64)),
            ('image_hash', models.CharField(blank=True, default='', max_length=64)),
            ('error', models.CharField(blank=True, default='', max_length=500)),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ]),
        migrations.CreateModel(name='ImageIndexJob', fields=[
            ('id', models.CharField(default=article.models.generate_image_index_job_id, max_length=32, primary_key=True, serialize=False)),
            ('coll_id', models.CharField(max_length=32)),
            ('owner', models.CharField(max_length=50)),
            ('image_ids', models.JSONField(default=list)),
            ('completed_ids', models.JSONField(default=list)),
            ('failures', models.JSONField(default=dict)),
            ('mode', models.CharField(default='reuse', max_length=20)),
            ('state', models.CharField(default='queued', max_length=20)),
            ('cancel_requested', models.BooleanField(default=False)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ]),
        migrations.CreateModel(name='ImageIndexLease', fields=[
            ('id', models.CharField(default='image-index', max_length=32, primary_key=True, serialize=False)),
            ('owner', models.CharField(blank=True, default='', max_length=64)),
            ('job_id', models.CharField(blank=True, default='', max_length=32)),
            ('expires_at', models.DateTimeField(null=True)),
        ]),
    ]

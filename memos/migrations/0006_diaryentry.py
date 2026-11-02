import django.utils.timezone
import memos.diary_models
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('memos', '0005_memocaptureauthorization')]
    operations = [migrations.CreateModel(
        name='DiaryEntry',
        fields=[
            ('diary_id', models.CharField(default=memos.diary_models.diary_id, editable=False, max_length=32, primary_key=True, serialize=False)),
            ('user_id', models.CharField(db_index=True, max_length=50)),
            ('title', models.CharField(max_length=150)),
            ('content', models.TextField()),
            ('entry_date', models.DateField(default=django.utils.timezone.localdate)),
            ('cover_url', models.URLField(blank=True, default='', max_length=1000)),
            ('is_valid', models.BooleanField(default=True)),
            ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ], options={'db_table': 'diary_entries', 'ordering': ['-entry_date', '-created_at']},
    )]

from django.db import migrations, models
import django.db.models.deletion
import utils.id_generator


class Migration(migrations.Migration):
    dependencies = [('assets', '0003_add_image_source_type'), ('anthology', '0006_agent_anthology_type')]

    operations = [
        migrations.AlterField(
            model_name='anthology', name='type',
            field=models.CharField(choices=[('article', '文章文集'), ('image', '图片文集'), ('agent', 'Agent 文集'), ('book', '图书文集')], default='article', max_length=10, verbose_name='文集类型', db_comment='文集类型'),
        ),
        migrations.CreateModel(
            name='Book',
            fields=[
                ('book_id', models.CharField(default=utils.id_generator.generate_book_id, max_length=40, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)), ('author', models.CharField(blank=True, default='', max_length=255)),
                ('book_format', models.CharField(choices=[('pdf', 'PDF'), ('txt', 'TXT'), ('epub', 'EPUB'), ('mobi', 'MOBI')], max_length=10)),
                ('local_state', models.CharField(choices=[('local', '本地可用'), ('cloud_only', '仅云端'), ('restoring', '恢复中')], default='local', max_length=20)),
                ('remote_available', models.BooleanField(default=False)), ('remote_hash', models.CharField(blank=True, default='', max_length=64)),
                ('metadata', models.JSONField(blank=True, default=dict)), ('is_valid', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
                ('anthology', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='books', to='anthology.anthology')),
                ('asset', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='book_files', to='assets.asset')),
                ('cover_asset', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='book_covers', to='assets.asset')),
            ], options={'db_table': 'books', 'ordering': ['-updated_at']},
        ),
        migrations.AddIndex(model_name='book', index=models.Index(fields=['anthology', 'is_valid'], name='books_antholo_5e8e5a_idx')),
        migrations.AddIndex(model_name='book', index=models.Index(fields=['local_state'], name='books_local_s_9e1b7f_idx')),
        migrations.CreateModel(
            name='BookReadingProgress',
            fields=[('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('user_id', models.CharField(max_length=50)), ('location', models.TextField(blank=True, default='')), ('progress', models.FloatField(default=0)), ('last_read_at', models.DateTimeField(auto_now=True)), ('book', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reading_progresses', to='anthology.book'))],
            options={'db_table': 'book_reading_progresses', 'unique_together': {('book', 'user_id')}},
        ),
    ]

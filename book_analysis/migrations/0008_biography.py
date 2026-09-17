from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('book_analysis', '0007_remove_analysisrun_node_id_and_more')]

    operations = [
        migrations.AddField(model_name='bookanalysis', name='subject_name', field=models.CharField(blank=True, max_length=255)),
        migrations.AddField(model_name='revision', name='subject_name', field=models.CharField(blank=True, max_length=255)),
        migrations.CreateModel(
            name='BiographyQuote',
            fields=[
                ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('speaker', models.CharField(max_length=255)),
                ('text', models.TextField()),
                ('evidence', models.JSONField(default=dict)),
                ('attribution_evidence', models.JSONField(default=dict)),
                ('event_id', models.CharField(blank=True, max_length=64)),
                ('ordinal', models.PositiveBigIntegerField(default=0)),
                ('chapter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='book_analysis.chapter')),
                ('revision', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='book_analysis.revision')),
            ],
            options={'indexes': [models.Index(fields=['revision', 'ordinal'], name='book_analys_revisio_403ca5_idx')]},
        ),
    ]

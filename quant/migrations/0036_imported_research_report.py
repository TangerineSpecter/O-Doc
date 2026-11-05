import django.db.models.deletion
import quant.models
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('quant', '0035_research_document')]
    operations = [migrations.CreateModel(
        name='ImportedResearchReport',
        fields=[
            ('id', models.CharField(default=quant.models.stable_id, max_length=40, primary_key=True, serialize=False)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('updated_at', models.DateTimeField(auto_now=True)),
            ('package', models.JSONField(default=dict)),
            ('entry', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='imported_research_report', to='quant.entry')),
        ],
    )]

from django.db import migrations,models
import django.db.models.deletion
import quant.models


class Migration(migrations.Migration):
    dependencies=[('quant','0024_validation_studies')]
    operations=[migrations.CreateModel(name='SelectionDiagnostic',fields=[
        ('id',models.CharField(default=quant.models.stable_id,max_length=40,primary_key=True,serialize=False)),
        ('created_at',models.DateTimeField(auto_now_add=True)),
        ('updated_at',models.DateTimeField(auto_now=True)),
        ('data',models.JSONField(default=dict)),('content_hash',models.CharField(max_length=64)),
        ('result',models.OneToOneField(on_delete=django.db.models.deletion.CASCADE,related_name='selection_diagnostic',to='quant.experimentresult')),
    ])]

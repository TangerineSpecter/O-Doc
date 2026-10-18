from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0076_custom_decision_connections')]
    operations = [migrations.AddField(model_name='equipmentinstance', name='rules', field=models.JSONField(default=dict))]

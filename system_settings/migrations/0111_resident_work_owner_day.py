from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0110_scope_resident_analytics')]
    operations = [
        migrations.AddIndex(
            model_name='residentanalyticswork',
            index=models.Index(fields=['owner_id', 'day'], name='resident_work_owner_day'),
        ),
    ]

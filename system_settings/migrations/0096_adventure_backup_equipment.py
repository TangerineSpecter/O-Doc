from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0095_combat_archive')]

    operations = [migrations.AddField(
        model_name='equipmentinstance', name='retained_for_adventure',
        field=models.BooleanField(default=False),
    )]

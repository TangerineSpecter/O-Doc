from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0042_reduce_travel_prices'), ('assets', '0005_item_icon_source')]
    operations = [migrations.AddField(
        model_name='agentinventoryitem', name='icon_asset_id',
        field=models.CharField(max_length=32, null=True, blank=True, default=None),
    )]

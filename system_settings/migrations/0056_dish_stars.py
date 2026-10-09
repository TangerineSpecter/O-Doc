from django.db import migrations


def initialize_stars(apps, schema_editor):
    for item in apps.get_model('system_settings', 'AgentInventoryItem').objects.all().iterator():
        if item.source.get('sku', '').startswith('dish.') and 'stars' not in item.source:
            item.source = {**item.source, 'stars': 1}
            item.save(update_fields=['source'])
    for listing in apps.get_model('system_settings', 'MarketListing').objects.filter(status='active').iterator():
        source = listing.item.get('source') or {}
        if source.get('sku', '').startswith('dish.') and 'stars' not in source:
            listing.item = {**listing.item, 'source': {**source, 'stars': 1}}
            listing.save(update_fields=['item'])
    from system_settings.agent_world.market_sync import refresh_restored_checkpoints
    from system_settings.agent_world.cooking_sync import checkpoint_all
    refresh_restored_checkpoints()
    checkpoint_all()


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0055_crop_quality_supplies')]
    operations = [migrations.RunPython(initialize_stars, migrations.RunPython.noop)]

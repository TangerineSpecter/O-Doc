from django.db import migrations


def correct_name(apps, schema_editor):
    City = apps.get_model('system_settings', 'TravelDestination')
    Journey = apps.get_model('system_settings', 'TravelJourney')
    alias = schema_editor.connection.alias
    City.objects.using(alias).filter(pk='5884051', city='安大略', original_name='Alliston').update(city='Alliston')
    for row in Journey.objects.using(alias).filter(destination_id='5884051').iterator():
        if row.snapshot.get('selected', {}).get('city') == '安大略':
            row.snapshot = {**row.snapshot, 'destination_scope': 'region',
                'destination_note': '历史城市名误用了安大略省名；游记按省级资料生成，具体城市未确认。后续候选已修正为Alliston。'}
            row.save(using=alias, update_fields=['snapshot'])


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0039_inventory_attributes')]
    operations = [migrations.RunPython(correct_name, migrations.RunPython.noop)]

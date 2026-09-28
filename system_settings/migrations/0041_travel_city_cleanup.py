import json
from pathlib import Path
from django.db import migrations
from django.utils import timezone


def clean_destinations(apps, schema_editor):
    Destination = apps.get_model('system_settings', 'TravelDestination')
    Journey = apps.get_model('system_settings', 'TravelJourney')
    alias = schema_editor.connection.alias
    data = json.loads((Path(__file__).parent / 'data' / '0041_travel_city_cleanup.json').read_text())
    now = timezone.now()
    for key, item in data['name_corrections'].items():
        # 用户已改成其他名称的记录不被种子纠错覆盖，价格和原禁用状态保留。
        Destination.objects.using(alias).filter(pk=key, city=item['old_city'], original_name=item['old_original_name']).update(
            city=item['city'], original_name=item['original_name'], updated_at=now)
    Destination.objects.using(alias).filter(pk__in=data['disabled_ids'], enabled=True).update(enabled=False, updated_at=now)
    affected = set(data['disabled_ids']) | set(data['name_corrections'])
    for journey in Journey.objects.using(alias).filter(destination_id__in=affected).iterator():
        selected = journey.snapshot.get('selected', {})
        correction = data['name_corrections'].get(journey.destination_id)
        if correction and selected.get('city') != correction['old_city']:
            correction = None
        notes = []
        if correction:
            notes.append(f"历史目的地名“{correction['old_city']}”含行政区歧义，目录已修正为“{correction['city']}”；原行程与游记未改写。")
        if journey.destination_id in data['disabled_ids']:
            notes.append('该地点属于片区、历史地点、聚落集合或城市范围未确认，已停止作为新旅行候选；原经历保留。')
        if notes:
            state = dict(journey.snapshot)
            state['destination_scope'] = state.get('destination_scope', 'unconfirmed')
            state['destination_note'] = ' '.join(filter(None, [state.get('destination_note', ''), *notes]))
            journey.snapshot = state
            journey.save(using=alias, update_fields=['snapshot', 'updated_at'])


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0040_correct_alliston_name')]
    operations = [migrations.RunPython(clean_destinations, migrations.RunPython.noop)]

"""Read-only shared projection. Actors and monsters are identified by IDs, never names."""
from .party_models import AdventureParty, AdventureMember, AdventureEvent, AdventureWave
from ..life_time import local_time


def snapshot(run):
    identity = run.snapshot.get('party_id')
    if not identity:
        return None
    party = AdventureParty.objects.get(pk=identity, owner_id=run.owner_id)
    # A departed member's historical view never follows later waves.
    if run.snapshot.get('party_final'):
        return run.snapshot['party_final']
    from .store import current
    catalog = current(party.catalog_id)
    players = []
    from .models import Exploration
    from system_settings.models import Agent
    from assets.models import Asset
    from utils.resource_assets import get_resource_view_url
    members = {row.actor_id: row for row in AdventureMember.objects.filter(party_id=party.pk, active=True)}
    runs = Exploration.objects.in_bulk([row.exploration_id for row in members.values()])
    agents = Agent.objects.in_bulk(list(party.state['players']))
    appearances = {key: (agent.battle_appearance or {}) for key, agent in agents.items()}
    asset_ids = {appearance.get(field) for appearance in appearances.values()
                 for field in ('character_asset_id', 'head_asset_id') if appearance.get(field)}
    valid_assets = set(Asset.objects.filter(pk__in=asset_ids, uploader=run.owner_id,
        is_valid=True, file_type='image').values_list('pk', flat=True)) if asset_ids else set()
    for player in party.state['players'].values():
        member = members.get(player['id'])
        if not member or member.exploration_id not in runs:
            raise ValueError('队伍成员缺少对应探索记录，请检查组队数据完整性')
        personal = runs[member.exploration_id]
        appearance = appearances.get(player['id'], {})
        visual = {'dungeon_id':party.dungeon_id,'job_id':player['job_id'],
                  'monster_id':'','encounter_id':f'{party.pk}:{party.state.get("wave",0)}',
                  'weapon_id':next((item.get('template_id','none') for item in personal.snapshot.get('equipment',[]) if item.get('slot')=='weapon'),'none'),
                  'appearance_overlays':appearance.get('overlays',{})}
        character = appearance.get('character_asset_id') if appearance.get('version')==3 else None
        head = appearance.get('head_asset_id') if not character else None
        for key,identity in [('character_image_url',character),('head_image_url',head)]:
            if identity in valid_assets:
                visual[key]=get_resource_view_url(identity)
        visual['head_behind_body'] = appearance.get('transform',{}).get('hair_layer')=='behind'
        players.append({'visual':visual,**{k:v for k,v in player.items() if k not in ('passives','potions','elixirs','food')},
            'job_name': catalog.row('professions', player['job_id'])['name']})
    events = list(AdventureEvent.objects.filter(party_id=party.pk).order_by('-sequence')[:40])
    kills = {kill['monster_id'] for result in AdventureWave.objects.filter(party_id=party.pk).values_list('result',flat=True)
             for kill in result.get('kills',[])}
    return {'id': party.pk, 'version': party.revision, 'leader_id': party.leader_id, 'status': party.status,
        'team_kills':len(kills),
        'dungeon_id': party.dungeon_id, 'players': players, 'enemies': list(party.state.get('enemies', {}).values()),
        'wave': party.state.get('wave',0), 'round': party.state.get('round',0), 'phase': party.state.get('phase',''),
        'round_seconds': party.state.get('round_seconds',15), 'action_order': party.state.get('action_order',[]),
        'ends_at': local_time(party.ends_at).isoformat(),
        'events': [{'id': e.pk, 'sequence':e.sequence, 'kind':e.kind, 'payload':e.payload} for e in reversed(events)]}

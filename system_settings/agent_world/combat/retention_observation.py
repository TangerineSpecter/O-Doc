"""Project archived personal outcomes for the exploration detail view."""
from utils.sync_policy import SyncError
from .analytics_models import CombatPartySettlement, CombatSoloSettlement
from .retention_projection import validate_archive
from .store import digest


def archived_kills(run):
    party = (run.snapshot or {}).get('party_id')
    model = CombatPartySettlement if party else CombatSoloSettlement
    marker = model.objects.filter(pk=party or run.pk, owner_id=run.owner_id, content__has_key='archive').first()
    if not marker:
        return False, []
    content = marker.content
    if marker.version != 1 or marker.digest != digest(content):
        raise ValueError('已归档战斗的结算指纹不一致')
    try:
        archive = validate_archive(content)
    except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError) as exc:
        raise ValueError('已归档战斗的结算无法核对') from exc
    rows = []
    if party:
        if content['party_id'] != party or content['owner_id'] != run.owner_id:
            raise ValueError('已归档战斗的账号或会话不一致')
        for kill in content['kills']:
            for person in kill['participants']:
                if person['exploration_id'] == run.pk and person['actor_id'] == run.actor_id:
                    rows.append({'id': kill['unit_id'], 'monster': kill['monster'],
                                 'experience': person['experience'], 'rewards': person['rewards'],
                                 'occurred_at': archive['exact_event_times'][kill['shared_event_id']]})
    else:
        if (content['run']['exploration_id'] != run.pk or content['run']['actor_id'] != run.actor_id
                or content['owner_id'] != run.owner_id):
            raise ValueError('旧单人战斗的账号或探索不一致')
        rows = [{'id': kill['encounter_id'], 'monster': kill['monster'], 'experience': kill['experience'],
                 'rewards': kill['rewards'], 'occurred_at': kill['occurred_at']} for kill in content['kills']]
    return True, rows

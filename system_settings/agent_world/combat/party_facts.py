"""A session hash chain binds shared results to all personal award receipts."""
from .party_models import AdventureParty, AdventureMember, AdventureWave, AdventureEvent
from .store import digest
from .party_integrity import aggregate_frame, canonical


def frame(party):
    fields = ('id', 'number', 'content_digest') if party.frame_version == 2 else ()
    return aggregate_frame(
        {key: getattr(party, key) for key in ('state', 'status', 'leader_id', 'ends_at', 'catalog_id', 'dungeon_id', 'frame_version')},
        list(AdventureMember.objects.filter(party_id=party.pk).order_by('pk').values()),
        list(AdventureWave.objects.filter(party_id=party.pk).order_by('number').values(*fields)),
    )


def serial(value):
    return canonical(value)


def append(party, kind, payload):
    if party.frame_version == 1:
        # Legacy sessions gain digests once, on their next business transition.
        for wave in AdventureWave.objects.filter(party_id=party.pk, content_digest=''):
            wave.save()
        party.frame_version = 2
    sequence = party.head + 1
    content = {'party_id': party.pk, 'owner_id': party.owner_id, 'sequence': sequence, 'kind': kind,
               'payload': payload, 'previous_hash': party.digest}
    event = AdventureEvent.objects.create(pk=f'{party.pk}:{sequence}', **content, digest=digest(content))
    party.head, party.digest = sequence, event.digest
    party.revision += 1
    party.frame = digest(serial(frame(party)))
    party.save()
    return event

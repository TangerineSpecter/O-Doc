"""Versioned party projections shared by runtime and full snapshot validation."""
from datetime import datetime
from django.utils.dateparse import parse_datetime
from .store import digest
from ..life_time import local_time

WAVE_FIELDS = ('id', 'party_id', 'owner_id', 'number', 'snapshot', 'result', 'created_at', 'ended_at')


def canonical(value, key=''):
    if isinstance(value, datetime):
        return local_time(value).isoformat(timespec='milliseconds')
    if isinstance(value, str) and key.endswith('_at'):
        parsed = parse_datetime(value)
        return local_time(parsed).isoformat(timespec='milliseconds') if parsed else value
    if isinstance(value, dict):
        return {k: canonical(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [canonical(v) for v in value]
    return value


def wave_digest(row: dict) -> str:
    return digest(canonical({key: row[key] for key in WAVE_FIELDS}))


def aggregate_frame(party: dict, members: list[dict], waves: list[dict]) -> dict:
    version = party.get('frame_version', 1)
    if type(version) is not int or version not in (1, 2):
        raise ValueError('未知组队快照摘要版本')
    if version == 1:
        wave_frames = [{key: row[key] for key in WAVE_FIELDS} for row in waves]
    else:
        wave_frames = [{key: row[key] for key in ('id', 'number', 'content_digest')} for row in waves]
    frame = {key: party[key] for key in ('state', 'status', 'leader_id', 'ends_at', 'catalog_id', 'dungeon_id')}
    frame.update(members=members, waves=wave_frames)
    if version == 2:
        frame['frame_version'] = version
    return frame

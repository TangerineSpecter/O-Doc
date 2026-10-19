"""Advance one leased scene through topic, intent, expression and received impressions."""
import random

from django.db import transaction

from .farm_gate import farm_gate
from .life_schedule import stable_id
from .life_time import local_time
from .social_models import SocialTheatreEvent
from .social_theatre_decision import prepare_topic, decide_turn, review_relations
from .social_theatre_prompt import turn_prompt, validate_turn
from system_settings.decision.routing import MODEL_ERRORS, InvalidModelOutput

SCENE_ERRORS = MODEL_ERRORS + (InvalidModelOutput,)


def _model_call(call, check):
    """一次临时模型故障只重试当前只读请求，不重放已保存的发言。"""
    for attempt in range(2):
        check()
        try:
            return call()
        except MODEL_ERRORS:
            check()
            if attempt:
                raise


def _snapshot(event_id, **changes):
    with farm_gate(), transaction.atomic():
        row = SocialTheatreEvent.objects.select_for_update().get(pk=event_id)
        if row.status != 'running':
            raise ValueError('小剧场状态已变化')
        if ('stage' in changes and (changes['stage'] != row.snapshot.get('stage')
                or changes.get('active_speaker_id') != row.snapshot.get('active_speaker_id'))):
            changes['stage_started_at'] = local_time().isoformat()
        row.snapshot = {**row.snapshot, **changes}
        row.save(update_fields=['snapshot', 'updated_at'])


def _topic(event, residents, candidates, *, owner, check):
    rejections = []
    for index, source in enumerate(candidates):
        check()
        _snapshot(event.pk, stage='topic', candidate_index=index + 1, candidate_count=len(candidates))
        try:
            topic = _model_call(lambda: prepare_topic(residents[0], source, owner=owner, check=check), check)
        except SCENE_ERRORS as exc:
            rejections.append({'title': source['title'], 'reason': '模型暂未完成议题提炼',
                               'error': str(exc)[:1000]})
            if index == len(candidates) - 1:
                raise
            continue
        if not topic['is_event']:
            rejections.append({'title': source['title'], 'reason': topic['reason']})
            continue
        with farm_gate(), transaction.atomic():
            row = SocialTheatreEvent.objects.select_for_update().get(pk=event.pk)
            if row.status != 'running':
                raise ValueError('小剧场状态已变化')
            row.source = source
            row.snapshot = {**row.snapshot, 'topic': topic, 'news_rejections': rejections,
                            'stage': 'conversation', 'relation_reviews': []}
            row.save(update_fields=['source', 'snapshot', 'updated_at'])
        return source, topic
    with farm_gate(), transaction.atomic():
        row = SocialTheatreEvent.objects.select_for_update().get(pk=event.pk)
        if row.status != 'running':
            raise ValueError('小剧场状态已变化')
        row.status = 'skipped'
        row.source = {}
        row.error = '搜索片段未提供可讨论的具体事件事实，已跳过；' + (
            rejections[-1]['reason'] if rejections else '候选是目录、汇总或过期内容')
        row.snapshot = {**row.snapshot, 'news_rejections': rejections, 'stage': 'skipped'}
        row.save(update_fields=['status', 'source', 'error', 'snapshot', 'updated_at'])
    return None, None


def execute_scene(event, residents, profiles, rounds, candidates, *, owner, check, speak, persist):
    saved = event.snapshot or {}
    transcript = [{**turn, 'id': turn.get('id') or stable_id(
        event.pk, turn['speaker_id'], 'turn', turn['round'])} for turn in (event.transcript or [])]
    if transcript != event.transcript:
        with farm_gate(), transaction.atomic():
            row = SocialTheatreEvent.objects.select_for_update().get(pk=event.pk)
            if row.status != 'running':
                raise ValueError('小剧场状态已变化')
            row.transcript = transcript
            row.save(update_fields=['transcript', 'updated_at'])
    decisions = list(saved.get('decisions', []))
    reviews = list(saved.get('relation_reviews', []))
    errors = []
    _snapshot(event.pk, stage='topic', scene_started_at=saved.get('scene_started_at') or local_time().isoformat(),
              decisions=decisions, relation_reviews=reviews, turn_errors=[])
    topic = saved.get('topic')
    source = event.source
    if not topic or not topic.get('is_event'):
        source, topic = _topic(event, residents, candidates, owner=owner, check=check)
    if not source:
        return False
    for round_number in range(1, rounds + 1):
        order = random.sample(residents, len(residents))
        round_failed = False
        for agent in order:
            turn_id = stable_id(event.pk, agent.pk, 'turn', round_number)
            if any(turn.get('id') == turn_id for turn in transcript):
                continue
            check()
            try:
                _snapshot(event.pk, stage='decision', active_speaker_id=str(agent.pk),
                          active_speaker_name=agent.name)
                decision = next((row for row in decisions if str(row['speaker_id']) == str(agent.pk)
                                 and row['round'] == round_number), None)
                if decision is None:
                    decision = _model_call(lambda: decide_turn(
                        agent, topic=topic, participants=profiles, transcript=transcript,
                        owner=owner, check=check), check)
                    decisions.append({'speaker_id': agent.pk, 'round': round_number, **decision})
                    _snapshot(event.pk, decisions=decisions)
                if decision['action'] == 'stop':
                    continue
                _snapshot(event.pk, stage='expression', active_speaker_id=str(agent.pk),
                          active_speaker_name=agent.name)
                prompt = turn_prompt(speaker_id=agent.pk, round_number=round_number, round_count=rounds,
                                     participants=profiles, source=source, transcript=transcript,
                                     topic=topic, decision=decision)
                value = _model_call(lambda: speak(
                    agent, prompt, lambda output: validate_turn(
                        output, speaker_id=agent.pk, participants=profiles), owner=owner, check=check), check)
            except SCENE_ERRORS as exc:
                round_failed = True
                errors.append({'speaker_id': str(agent.pk), 'round': round_number, 'error': str(exc)[:1000]})
                _snapshot(event.pk, turn_errors=errors)
                continue
            turn = {'id': turn_id, 'round': round_number, 'speaker_id': agent.pk, 'name': agent.name,
                    'avatar': agent.avatar, 'content': value['content'], 'reply_to': decision['reply_to'],
                    'decision': decision, 'created_at': local_time().isoformat()}
            persist(event.pk, turn)
            transcript.append(turn)
        if not round_failed and not any(turn['round'] == round_number for turn in transcript):
            break
    if errors:
        raise ValueError('部分居民的模型暂未完成回应，已保存其他发言，可继续本场讨论')
    _snapshot(event.pk, stage='relations')
    if transcript:
        for agent in residents:
            if any(str(review['actor_id']) == str(agent.pk) for review in reviews):
                continue
            check()
            _snapshot(event.pk, stage='relations', active_speaker_id=str(agent.pk),
                      active_speaker_name=agent.name)
            reviews.append(_model_call(lambda: review_relations(
                agent, topic=topic, participants=profiles, transcript=transcript, owner=owner, check=check), check))
            _snapshot(event.pk, relation_reviews=reviews)
    _snapshot(event.pk, stage='settlement', active_speaker_id='', active_speaker_name='')
    return True

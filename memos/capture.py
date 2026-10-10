"""Atomic, synced receipts make retries incapable of duplicating a memo."""
from difflib import SequenceMatcher
from django.db import transaction
from learning.locking import domain_lock
from .models import Memo, MemoCapture
from .vector_sync import schedule_memo_vector_sync


def commit_capture(key: str, owner: str, agent, arguments: dict):
    with domain_lock(), transaction.atomic():
        existing = MemoCapture.objects.filter(pk=key).first()
        if existing:
            return Memo.objects.filter(pk=existing.memo_id).first() if existing.memo_id else None
        content = str(arguments.get('content') or '').strip()
        if not content or len(content) > 300:
            raise ValueError('随手记正文必须为 1～300 字')
        tag = str(arguments.get('tag') or '').strip()
        if len(tag) > 120:
            raise ValueError('标签不能超过 120 字')
        recent = Memo.objects.filter(user_id=owner, creator_id=str(agent.pk), creator_type='agent').order_by('-created_at')[:30]
        if any(SequenceMatcher(None, content, m.content).ratio() >= .85 for m in recent):
            MemoCapture.objects.create(id=key, owner_id=owner, agent_id=str(agent.pk), reason='与近期闪念重复，已跳过')
            return None
        memo = Memo.objects.create(user_id=owner, creator_type='agent', creator_id=str(agent.pk), creator_name=agent.name[:150], content=content, tag=tag, is_pinned=False)
        MemoCapture.objects.create(id=key, owner_id=owner, agent_id=str(agent.pk), memo_id=str(memo.pk))
        transaction.on_commit(lambda: schedule_memo_vector_sync(str(memo.pk)))
        return memo


def skip_capture(key: str, owner: str, agent, reason: str):
    with domain_lock(), transaction.atomic():
        return MemoCapture.objects.get_or_create(pk=key, defaults={'owner_id': owner, 'agent_id': str(agent.pk), 'reason': reason[:300]})[0]

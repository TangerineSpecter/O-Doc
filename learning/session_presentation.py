"""Public lesson state contains teaching, never assessment secrets."""
from .models import LearningTurn, Request


def session_data(session):
    if not session:
        return None
    loaded = getattr(session, 'loaded_turns', None)
    turns = [{k: getattr(t, k) for k in ('id', 'kind', 'position', 'content', 'result', 'status')} for t in loaded] if loaded is not None else list(LearningTurn.objects.filter(session=session).order_by('created_at', 'id').values('id', 'kind', 'position', 'content', 'result', 'status'))
    return {'id': session.id, 'phase': session.phase, 'revision': session.revision, 'draft_text': session.draft_text,
            'attempt_id': session.attempt_id, 'feedback': session.feedback, 'turns': turns,
            'pending': session.phase not in ('completed', 'ended') and Request.objects.filter(kind='lesson_turn', target_id__in=[t['id'] for t in turns], status__in=['pending', 'running']).exists()}

"""Validate lesson associations and teaching facts before any database writes."""
from utils.sync_manager import SyncError
from .lessons import PHASES, validate_teaching, validate_turn


def validate_lessons(rows, version):
    exercises = rows.get('learning.exercise', {})
    attempts = rows.get('learning.attempt', {})
    sessions = rows.get('learning.learningsession', {})
    points = rows.get('learning.knowledgepoint', {})
    for cid, course in rows.get('learning.course', {}).items():
        if course.get('learning_mode', 'classic') not in ('classic', 'scenario') or (version >= 4 and 'learning_mode' not in course):
            raise SyncError('学习模式缺失或无效')
    for eid, ex in exercises.items():
        if ex.get('format', 'classic') not in ('classic', 'scenario'):
            raise SyncError('学习内容格式无效')
        if version >= 4 and any(k not in ex for k in ('format', 'teaching')):
            raise SyncError('学习快照缺少教学字段')
        cards = {c['id']: c for c in ex.get('snapshot', {}).get('learning_items', [])}
        for q in ex.get('questions', []):
            ids = q.get('learning_item_ids', [])
            saved = q.get('learning_item_versions', [])
            if not isinstance(ids, list) or any(not isinstance(i, str) or i not in cards or str(cards[i]['knowledge_id']) != str(q.get('knowledge_id')) for i in ids):
                raise SyncError('正式题缺少收藏来源快照')
            if saved != [{'item_id': i, 'revision': cards[i].get('revision', 0)} for i in ids]:
                raise SyncError('正式题收藏版本与生成快照不一致')
            if ex.get('format') == 'scenario' and q.get('weights') != [60, 25, 15]:
                raise SyncError('场景题评分权重无效')
        if ex.get('format') == 'scenario' and ex.get('status') not in ('generating', 'failed', 'ended'):
            try:
                teaching = validate_teaching(ex.get('teaching'), str(ex['course']))
            except Exception as exc:
                raise SyncError('场景教学快照无效') from exc
            for item in teaching['expressions']:
                point = points.get(item['knowledge_id'])
                if not point or str(point['course']) != str(ex['course']):
                    raise SyncError('教学表达缺少知识点事实')
    for sid, session in sessions.items():
        ex = exercises.get(str(session.get('exercise')))
        if not ex or ex.get('format') != 'scenario' or session.get('phase') not in PHASES or type(session.get('revision')) is not int or session['revision'] < 0:
            raise SyncError('学习会话缺少场景练习或版本无效')
        if not isinstance(session.get('draft_text'), str) or len(session['draft_text']) > 3000:
            raise SyncError('学习草稿无效')
        keys = session.get('advance_keys')
        if not isinstance(keys, list) or len(keys) > 4 or any(not isinstance(k, str) or not 8 <= len(k) <= 120 for k in keys) or len(set(keys)) != len(keys):
            raise SyncError('学习阶段确认记录无效')
        if session.get('attempt'):
            attempt = attempts.get(str(session['attempt']))
            if not attempt or str(attempt['exercise']) != str(session['exercise']):
                raise SyncError('学习会话引用了其他练习作答')
        elif session['phase'] in ('verification', 'completed'):
            raise SyncError('学习验证缺少正式作答')
    for turn in rows.get('learning.learningturn', {}).values():
        if str(turn.get('session')) not in sessions or turn.get('kind') not in ('understanding', 'substitution', 'conversation', 'help') or turn.get('status') not in ('pending', 'running', 'completed', 'failed', 'cancelled'):
            raise SyncError('学习交互缺少会话或类型无效')
        if not isinstance(turn.get('content'), str) or not turn['content'].strip() or len(turn['content']) > 3000 or type(turn.get('position')) is not int or not 0 <= turn['position'] <= 2:
            raise SyncError('学习交互内容无效')
        if turn['status'] == 'completed' and turn['kind'] != 'understanding':
            try:
                validate_turn(turn.get('result', {}))
            except Exception as exc:
                raise SyncError('学习交互缺少老师反馈') from exc
    for revision in rows.get('learning.answerrevision', {}).values():
        attempt = attempts.get(str(revision.get('attempt')))
        if not attempt or revision.get('question_id') not in attempt.get('answers', {}) or revision.get('original_answer') != attempt['answers'][revision['question_id']]:
            raise SyncError('订正缺少原始作答事实')
        if revision.get('status') not in ('pending', 'running', 'completed', 'failed') or not isinstance(revision.get('content'), str) or not revision['content'].strip() or len(revision['content']) > 3000:
            raise SyncError('订正内容或状态无效')
        if revision['status'] == 'completed' and not revision.get('feedback'):
            raise SyncError('订正缺少反馈')
    for item in rows.get('learning.learningitem', {}).values():
        point = points.get(str(item.get('knowledge')))
        source = exercises.get(str(item.get('source_exercise'))) if item.get('source_exercise') else None
        if not point or str(point['course']) != str(item.get('course')) or (item.get('source_exercise') and (not source or str(source['course']) != str(item['course']))):
            raise SyncError('词与表达引用了其他课程或缺少来源')
        from .items import item_fields
        if type(item.get('revision')) is not int or item['revision'] < 0:
            raise SyncError('词与表达版本无效')
        try:
            item_fields(item)
        except Exception as exc:
            raise SyncError('词与表达内容无效') from exc
    from .grading import validate_quality
    for grade in rows.get('learning.grade', {}).values():
        attempt = attempts[str(grade['attempt'])]
        ex = exercises[str(attempt['exercise'])]
        if ex.get('format') != 'scenario':
            continue
        questions = {q['id']: q for q in ex['questions']}
        items = [i for i in grade['result']['items'] if not i.get('skipped') and questions[i['question_id']]['type'] in ('short', 'translation')]
        try:
            validate_quality({'items': items}, [questions[i['question_id']] for i in items])
        except Exception as exc:
            raise SyncError('场景评分分项与总分不一致') from exc


def normalize_legacy(data):
    """Called only after source hashes validate; do not mutate downloaded records."""
    result = []
    for row in data:
        fields = row.get('fields', {})
        if row.get('model') == 'learning.course' and 'learning_mode' not in fields:
            row = {**row, 'fields': {**fields, 'learning_mode': 'classic'}}
        result.append(row)
    return result

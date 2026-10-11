"""Teaching and revision model contexts never mutate official grades."""
from .models import LearningTurn, AnswerRevision
from .generation import text
from .lessons import validate_turn


def lesson_turn(req, ask):
    turn = LearningTurn.objects.select_related('session__exercise').get(pk=req.target_id)
    session = turn.session
    # Deliberately exclude the independent test questions, answers and rubric.
    context = {'teaching': session.exercise.teaching, 'phase': session.phase, 'position': turn.position,
               'input': turn.content, 'help_requested': turn.kind == 'help',
               'history': list(LearningTurn.objects.filter(session=session, status='completed').order_by('created_at', 'id').values('kind', 'content', 'result'))[-12:]}
    instruction = ('进行英语场景教学。变化组句阶段检查当前替换任务，反馈后鼓励继续。交流阶段扮演teaching.role，'
                   '用简短英文回应并自然追问，不替学生回答；无法理解时请求澄清。请求帮助时给中文提示和句子框架。'
                   '交流中不要逐项纠错，第三个用户回合后自然确认需求或结束交流，不再发起第四轮追问。'
                   '最后一个交流回合集中给最多两个重要修改建议；其他回合corrections为空。'
                   '返回reply(英文角色回应或中文教学提示)、feedback(简短中文反馈)、corrections(字符串数组，最多2项)。'
                   '不评分、不判断掌握、不提供独立验证的答案。')
    result = validate_turn(ask(req.snapshot, instruction, context))
    if turn.kind == 'conversation' and turn.position < 2:
        result['corrections'] = []
    return result


def revise(req, ask):
    revision = AnswerRevision.objects.select_related('attempt__exercise').get(pk=req.target_id)
    question = next(q for q in revision.attempt.exercise.questions if q['id'] == revision.question_id)
    return text(ask(req.snapshot, '点评学生的答后订正，先说明意思和任务是否表达清楚，再指出最多两个关键问题，给一个可用的表达。'
                    '不修改原成绩，不把订正当独立掌握。返回{"feedback":"简短中文反馈"}。',
                    {'question': question, 'original_answer': revision.original_answer, 'revision': revision.content}).get('feedback'), 3000)

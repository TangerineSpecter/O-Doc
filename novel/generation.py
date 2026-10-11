"""Bounded prompts and strict output validation; never silently adopt a result."""
import json
from rest_framework.exceptions import ValidationError
from .models import Chapter, Message, Revision, Review
from .memory import fingerprint
from .retrieval import context
from .prompts import SYSTEM, REVIEW, BLUEPRINT
from .validation import json_result, review_result

KINDS = ('chat', 'blueprint', 'style', 'generate', 'rewrite', 'continue', 'polish', 'scene', 'story', 'review', 'check')


def prepare(run):
    project, chapter = run.project, run.chapter
    if chapter and Chapter.objects.filter(project=project, position__lt=chapter.position, is_valid=True, needs_review=True).exists():
        raise ValidationError('前文故事状态待复核，请先检查并重新采用受影响章节')
    if chapter and Chapter.objects.filter(project=project, is_valid=True, position=chapter.position).exclude(pk=chapter.pk).exists():
        raise ValidationError('同步后存在重复章节顺序，请先调整目录顺序')
    material, mode = context(project, chapter)
    messages = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': '本书资料：\n' + material}]
    if run.kind in ('chat', 'blueprint'):
        history = Message.objects.filter(project=project).order_by('-created_at')[:16]
        messages += [{'role': m.role, 'content': m.content[:5000]} for m in reversed(list(history))]
    rev = Revision.objects.filter(pk=run.base_revision_id, chapter=chapter).first() if chapter else None
    content = rev.content if rev else ''
    if run.kind == 'review':
        if not rev or not content.strip():
            raise ValidationError('请先保存本章正文')
        prompt = REVIEW + '\n当前正文：\n' + content
    elif run.kind == 'blueprint':
        prompt = BLUEPRINT + '\n作者意向：' + project.direction + '\n本轮要求：' + run.input.get('instruction', '')
    elif run.kind == 'chat':
        prompt = '协助作者讨论方向和问题，建议保持候选状态，每次最多问三个关键问题。\n' + run.input.get('instruction', '')
    elif run.kind == 'style':
        prompt = '按作者方向写三种不同文风的短场景样本，每个约300字，标注区别。暂不形成正文事实。\n' + run.input.get('instruction', '')
    elif run.kind == 'check':
        prompt = '对全书已采用摘要、状态和线索作编辑检查，列出未回收伏笔、时间线和人物冲突，说明依据和建议。不要擅自修改事实。'
    else:
        if not chapter:
            raise ValidationError('请先选择章节')
        prompt = f'本章标题：{chapter.title}\n章节细纲：{chapter.outline}\n故事时间：{chapter.story_time or "未知"}\n视角：{chapter.pov or "遵循全书"}\n'
        instruction = run.input.get('instruction', '')
        if run.kind == 'rewrite':
            start, end = run.input.get('start'), run.input.get('end')
            if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(content):
                raise ValidationError('选区已失效，请重新选择')
            prompt += f'选区前文：{content[max(0, start-2500):start]}\n仅改写以下选区：{content[start:end]}\n选区后文：{content[end:end+2500]}\n只输出替换选区的文本。'
        elif run.kind == 'continue':
            prompt += '已有正文：\n' + content[-10000:] + '\n只输出续写段落，不重复已有正文。'
        elif run.kind in ('polish', 'scene', 'story'):
            prompt += '现稿：\n' + content + '\n' + {'polish': '轻度润色，只改善表达，不改变故事事实。', 'scene': '场景精修，增强具体行动、对白和因果，不改变故事事实。', 'story': '按作者要求重写剧情，输出新章正文。'}[run.kind]
        else:
            prompt += '根据本章细纲生成完整章节正文，只输出正文，不要解释。'
        prompt += '\n作者要求：' + instruction
    messages.append({'role': 'user', 'content': prompt})
    if sum(len(m['content']) for m in messages) > 140000:
        raise ValidationError('本章内容过长，请分场景或使用选区改写')
    return messages, mode


def finish(run, output, mode):
    result = {'text': output, 'retrieval_mode': mode}
    if run.kind == 'review':
        rev = Revision.objects.get(pk=run.base_revision_id, chapter=run.chapter)
        data = review_result(json_result(output), rev)
        review = Review.objects.create(revision=rev, context_hash=run.context_hash, **data)
        result = {'review_id': review.pk, 'retrieval_mode': mode}
    elif run.kind == 'blueprint':
        proposal = json_result(output)
        if not isinstance(proposal.get('title_candidates'), list) or len(proposal['title_candidates']) > 10:
            raise ValidationError('书名候选格式不正确')
        from .validation import text
        for title in proposal['title_candidates']:
            if not text(title, 100).strip():
                raise ValidationError('书名候选不能为空')
        if not isinstance(proposal.get('setup'), dict) or not isinstance(proposal.get('blueprint'), str):
            raise ValidationError('蓝图资料不完整')
        from .serializers import EntitySerializer, OutlineSerializer, ThreadSerializer
        for key, serializer_type in [('entities', EntitySerializer), ('outlines', OutlineSerializer), ('threads', ThreadSerializer)]:
            items = proposal.get(key, [])
            if not isinstance(items, list) or len(items) > 100:
                raise ValidationError('蓝图候选数量无效')
            clean = []
            for item in items:
                serializer = serializer_type(data=item, context={'project': run.project})
                serializer.is_valid(raise_exception=True)
                clean.append(dict(serializer.validated_data))
            proposal[key] = clean
        text(proposal.get('reply', ''), 10000)
        text(proposal.get('style', ''), 20000)
        text(proposal['blueprint'], 30000)
        # Adoption revalidates associations and commits candidates atomically.
        result['proposal'] = proposal
        Message.objects.create(project=run.project, role='assistant', content=str(proposal.get('reply', '')))
    elif run.kind in ('chat', 'style'):
        Message.objects.create(project=run.project, role='assistant', content=output)
    return result

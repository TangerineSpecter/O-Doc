import hashlib
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import Chapter, Entity, Fact, Review, Revision, Rule, Thread
from .memory import fingerprint, invalidate_later
from .validation import text


class StaleDraft(ValidationError):
    status_code = 409


def revision_for(chapter, rid):
    return Revision.objects.filter(chapter=chapter, pk=rid).first() if rid else None


def prune(chapter):
    protected = {chapter.draft_id, chapter.adopted_id, chapter.published_id}
    protected.update(Fact.objects.filter(chapter=chapter).values_list('revision_id', flat=True))
    protected.update(Review.objects.filter(revision__chapter=chapter).values_list('revision_id', flat=True))
    protected.update(Rule.objects.filter(project=chapter.project).exclude(source_revision_id='').values_list('source_revision_id', flat=True))
    history = chapter.revisions.exclude(pk__in=protected).order_by('-created_at', '-id')
    keep = list(history.values_list('pk', flat=True)[:5])
    history.exclude(pk__in=keep).delete()


def enforce_revision_retention():
    for chapter in Chapter.objects.all().iterator():
        prune(chapter)


def save_revision(chapter, content, base_id, source='save'):
    content = text(content)
    if chapter.draft_id != (base_id or ''):
        raise StaleDraft('正文已变化，请刷新后比较两个版本')
    previous = revision_for(chapter, chapter.draft_id)
    if source != 'restore' and previous and previous.content == content and previous.title == chapter.title and previous.volume == chapter.volume:
        return previous
    refs = set(chapter.entity_ids)
    for entity in Entity.objects.filter(project=chapter.project):
        if any(name and name in content for name in [entity.name, *entity.aliases]):
            refs.add(entity.pk)
    rev = Revision.objects.create(chapter=chapter, title=chapter.title, volume=chapter.volume,
        content=content, content_hash=hashlib.sha256(content.encode()).hexdigest(), entity_ids=sorted(refs), source=source)
    chapter.draft_id = rev.pk
    chapter.save()
    prune(chapter)
    return rev


def literal_issues(project, content, chapter=None):
    def applies(rule):
        if rule.scope_chapter_ids and (not chapter or chapter.pk not in rule.scope_chapter_ids):
            return False
        if rule.scope_entity_ids:
            relevant = set(chapter.entity_ids) if chapter else set()
            for entity in Entity.objects.filter(project=project, pk__in=rule.scope_entity_ids):
                if any(name and name in content for name in [entity.name, *entity.aliases]):
                    relevant.add(entity.pk)
            if not relevant.intersection(rule.scope_entity_ids):
                return False
        return rule.scope in ('全书', '') or bool(rule.scope_chapter_ids or rule.scope_entity_ids)
    return [{'id': f'rule-{r.pk}', 'description': r.instruction, 'quote': r.example,
             'blocking': True, 'kind': 'literal'}
            for r in Rule.objects.filter(project=project, enabled=True, kind='literal', strength='forbid', exception='')
            if r.example and r.example in content and applies(r)]


@transaction.atomic
def adopt(chapter, review_id, confirmations, dismissals):
    chapter = Chapter.objects.select_for_update().get(pk=chapter.pk)
    if Chapter.objects.filter(project=chapter.project, is_valid=True, position=chapter.position).exclude(pk=chapter.pk).exists():
        raise ValidationError('请先解决重复的章节目录顺序')
    review = Review.objects.select_related('revision').filter(pk=review_id, revision__chapter=chapter, revision_id=chapter.draft_id).first()
    if not review:
        raise StaleDraft('请先检查当前草稿')
    if review.context_hash != fingerprint(chapter.project, chapter.position):
        raise StaleDraft('前文或设定已变化，请重新检查')
    if literal_issues(chapter.project, review.revision.content, chapter):
        raise ValidationError('当前稿仍包含本书明确禁用的词句，请修改或设置例外')
    if not isinstance(dismissals, dict) or any(not isinstance(v, str) or not v.strip() for v in dismissals.values()):
        raise ValidationError('驳回检查问题时请填写理由')
    for issue in review.issues:
        if issue.get('blocking') and issue['id'] not in dismissals:
            raise ValidationError('请处理或说明驳回关键冲突的理由')
    critical = {c['id'] for c in review.changes if c.get('critical')}
    if not isinstance(confirmations, list) or not critical <= set(confirmations):
        raise ValidationError('请确认关键状态变化')
    previous_facts = list(Fact.objects.filter(chapter=chapter, revision=review.revision).values_list('data', flat=True))
    proposed_facts = []
    # Entity proposals become facts only after explicit review, never while drafting.
    for change in review.changes:
        if change['kind'] == 'entity':
            definition = change['definition']
            definition = {k: v for k, v in definition.items() if k in ('kind', 'name', 'biography', 'importance')}
            entity, _ = Entity.objects.get_or_create(project=chapter.project, name=definition.pop('name'), kind=definition.pop('kind', 'person'), defaults=definition)
            change = dict(change, entity_id=entity.pk)
        proposed_facts.append(change)
    facts_changed = previous_facts != proposed_facts
    if facts_changed:
        # Rechecking one immutable manuscript replaces its canonical extraction.
        # Earlier checks remain in Review for audit and evidence retention.
        Fact.objects.filter(chapter=chapter, revision=review.revision).delete()
        for change in proposed_facts:
            Fact.objects.create(project=chapter.project, chapter=chapter, revision=review.revision, data=change)
    old = chapter.adopted_id
    chapter.adopted_id = review.revision_id
    chapter.needs_review = False
    chapter.save()
    review.confirmed_ids = list(confirmations)
    review.dismissed = dismissals
    review.context_hash = fingerprint(chapter.project, chapter.position)
    review.save()
    if old != chapter.adopted_id or facts_changed:
        invalidate_later(chapter)
    return chapter


@transaction.atomic
def publish(chapter, revision_id, audience='public'):
    chapter = Chapter.objects.select_for_update().get(pk=chapter.pk)
    if not revision_id or revision_id != chapter.adopted_id or chapter.needs_review:
        raise ValidationError('只能发布已采用且已复核的版本')
    if not revision_for(chapter, revision_id):
        raise ValidationError('发布版本不存在')
    if audience not in ('public', 'private'):
        raise ValidationError('发布范围无效')
    chapter.published_id = revision_id
    chapter.published_at = timezone.now()
    chapter.save()
    anthology = chapter.project.anthology
    anthology.permission = audience
    anthology.save(update_fields=['permission', 'updated_at'])
    return chapter


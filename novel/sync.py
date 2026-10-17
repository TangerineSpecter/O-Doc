"""Complete business snapshots, with device execution explicitly excluded."""
import hashlib
import json
from django.core import serializers
from utils.sync_datetime import SyncJSONEncoder
from system_settings.sync_state import canonical_hash


def manifest(data):
    return {label: sorted(str(r['pk']) for r in data if r.get('model') == label)
            for label in sorted({r['model'] for r in data if r.get('model', '').startswith('novel.')})}


def metadata(data=None):
    if data is None:
        from django.apps import apps
        data = []
        for model in apps.get_app_config('novel').get_models():
            if model._meta.model_name != 'job':
                data += json.loads(serializers.serialize('json', model.objects.all(), cls=SyncJSONEncoder))
    return {'novel_schema_version': 1, 'novel_manifest': manifest(data),
            'novel_record_hashes': {f"{r['model']}:{r['pk']}": canonical_hash(r['fields']) for r in data if r.get('model', '').startswith('novel.')}}


def validate(data, meta=None):
    from utils.sync_manager import SyncError
    meta = meta or {}
    if meta.get('novel_schema_version', 0) > 1:
        raise SyncError('小说快照版本高于本机，请升级所有设备')
    actual = metadata(data)
    for field in ('novel_manifest', 'novel_record_hashes'):
        if field in meta and meta[field] != actual[field]:
            raise SyncError('小说快照记录或校验不完整，拒绝恢复')
    rows = {}
    for row in data:
        if row.get('model', '').startswith('novel.'):
            if row['model'] == 'novel.job':
                raise SyncError('小说快照包含本机执行授权')
            rows.setdefault(row['model'], {})[str(row['pk'])] = row['fields']
    anths = {str(r['pk']): r['fields'] for r in data if r.get('model') == 'anthology.anthology'}
    projects, chapters, revisions = (rows.get('novel.' + name, {}) for name in ('project', 'chapter', 'revision'))
    entities, threads = (rows.get('novel.' + name, {}) for name in ('entity', 'thread'))
    def fail():
        raise SyncError('小说归属、版本或原文证据引用不完整，拒绝恢复')
    for cid, anth in anths.items():
        if anth.get('type') == 'novel' and cid not in projects:
            fail()
    for pid, project in projects.items():
        if pid not in anths or anths[pid].get('type') != 'novel' or str(project.get('anthology', pid)) != pid:
            fail()
    def entity_refs(fields, pid):
        refs = fields.get('entity_ids', [])
        if not isinstance(refs, list) or any(str(entities.get(str(eid), {}).get('project')) != pid for eid in refs):
            fail()
    for label, entries in rows.items():
        for rid, fields in entries.items():
            pid = str(fields.get('project', ''))
            if 'project' in fields and pid not in projects:
                fail()
            if label in ('novel.chapter', 'novel.thread', 'novel.outline'):
                entity_refs(fields, pid)
            if label == 'novel.relation':
                entity_refs({'entity_ids': [fields.get('source_id'), fields.get('target_id')]}, pid)
            if label == 'novel.chapter':
                for pointer in ('draft_id', 'adopted_id', 'published_id'):
                    target = fields.get(pointer)
                    if target and str(revisions.get(str(target), {}).get('chapter')) != rid:
                        fail()
                if fields.get('published_id') and not fields.get('published_at'):
                    fail()
            if label == 'novel.revision':
                chapter = chapters.get(str(fields.get('chapter')))
                if not chapter or hashlib.sha256(fields.get('content', '').encode()).hexdigest() != fields.get('content_hash'):
                    fail()
                entity_refs(fields, str(chapter['project']))
            if label in ('novel.review', 'novel.fact'):
                revision = revisions.get(str(fields.get('revision')))
                chapter = chapters.get(str(revision.get('chapter'))) if revision else None
                if not chapter:
                    fail()
                if label == 'novel.fact' and (str(chapter['project']) != pid or str(revision['chapter']) != str(fields.get('chapter'))):
                    fail()
                changes = [fields.get('data', {})] if label == 'novel.fact' else fields.get('changes', [])
                for change in changes:
                    quote = change.get('quote')
                    if not quote or quote not in revision['content']:
                        fail()
                    for key in ('entity_id', 'target_id', 'holder_id'):
                        eid = change.get(key)
                        if eid and str(entities.get(str(eid), {}).get('project')) != str(chapter['project']):
                            fail()
                    tid = change.get('thread_id')
                    if tid and str(threads.get(str(tid), {}).get('project')) != str(chapter['project']):
                        fail()
            if label in ('novel.rule', 'novel.run'):
                if label == 'novel.rule':
                    entity_refs({'entity_ids': fields.get('scope_entity_ids', [])}, pid)
                    if any(str(chapters.get(str(cid), {}).get('project')) != pid for cid in fields.get('scope_chapter_ids', [])):
                        fail()
                pointer = fields.get('source_revision_id') or fields.get('base_revision_id')
                # Runs retain input/result history even when an unused draft is pruned.
                if label == 'novel.rule' and pointer:
                    chapter = chapters.get(str(revisions.get(str(pointer), {}).get('chapter')))
                    if not chapter or str(chapter['project']) != pid:
                        fail()
                if label == 'novel.run' and fields.get('chapter') and str(chapters.get(str(fields['chapter']), {}).get('project')) != pid:
                    fail()


def reset_execution():
    from .models import Job, Run, Chapter, Review
    from .memory import fingerprint
    Job.objects.all().delete()
    for run in Run.objects.filter(status__in=['pending', 'running']):
        run.status = 'interrupted'
        run.error = '数据已恢复，请手动重试；不会自动调用模型'
        run.save()
    # A merged chapter pointer may invalidate a later review. SQL eligibility is
    # immediate; stale vectors never bypass adopted/version/time filters.
    for chapter in Chapter.objects.select_related('project').exclude(adopted_id=''):
        review = Review.objects.filter(revision_id=chapter.adopted_id).order_by('-created_at').first()
        if not review or review.context_hash != fingerprint(chapter.project, chapter.position):
            chapter.needs_review = True
            chapter.save()
    # Concurrent devices can insert chapters at the same position. Keep both
    # manuscripts, but require the author to resolve their narrative order.
    from django.db.models import Count
    collisions = Chapter.objects.filter(is_valid=True).values('project_id', 'position').annotate(total=Count('pk')).filter(total__gt=1)
    for collision in collisions:
        for chapter in Chapter.objects.filter(project_id=collision['project_id'], position=collision['position'], is_valid=True):
            chapter.needs_review = True
            chapter.save()

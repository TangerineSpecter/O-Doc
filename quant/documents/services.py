"""Explicit section adoption; a finished model call never replaces accepted work."""
from copy import deepcopy
from uuid import uuid4
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant.models import ResearchDocument, ResearchReport
from quant.services import Conflict
from .sections import FIELDS, pointer, payload
from .identity import document_id

HISTORY_LIMIT = 5


def initialize(entry, exclude_id=''):
    document = ResearchDocument.objects.filter(entry=entry).first()
    if document:
        return document
    reports = list(entry.reports.filter(schema_version__in=(2, 3)).exclude(pk=exclude_id).order_by('-created_at', '-id'))
    sections = {}
    if reports:
        # Preserve explicitly edited prose when migrating the old multi-report UI.
        reading = next((r for r in reports if r.current_revision_id), reports[0])
        sections = {key: pointer(reading if key == 'reading' else reports[0]) for key in FIELDS}
    document, _ = ResearchDocument.objects.get_or_create(entry=entry, defaults={'id': document_id(entry.pk), 'sections': sections,
        'history': [{'id': uuid4().hex, 'created_at': r.created_at.isoformat(), 'label': '原分析记录',
                     'sections': {key: pointer(r) for key in FIELDS}} for r in reports[1:HISTORY_LIMIT+1]]})
    return document


def differences(document, sections):
    result = []
    for key in FIELDS:
        if key not in sections:
            continue
        target = sections[key]
        report = ResearchReport.objects.get(pk=target['report_id'], entry=document.entry)
        current = document.sections.get(key)
        before = payload(ResearchReport.objects.get(pk=current['report_id']), key, current['revision_id']) if current else {}
        after = payload(report, key, target['revision_id'])
        comparable_before, comparable_after = before, after
        # Generated Markdown also contains review/plan sections. Compare the
        # structured reading fields unless either side is an edited document.
        if key == 'reading' and current and not current['revision_id'] and not target['revision_id']:
            comparable_before = {k: v for k, v in before.items() if k != 'markdown'}
            comparable_after = {k: v for k, v in after.items() if k != 'markdown'}
        result.append({'section': key, 'changed': comparable_before != comparable_after, 'before': before, 'after': after})
    return result


def remember(document, label):
    if document.sections:
        document.history = [{'id': uuid4().hex, 'created_at': timezone.now().isoformat(), 'label': label,
                             'sections': deepcopy(document.sections)}, *document.history][:HISTORY_LIMIT]


def save(document):
    document.revision += 1
    document.save(update_fields=['sections', 'pending', 'history', 'revision', 'updated_at'])
    document.entry.save(update_fields=['updated_at'])


@transaction.atomic
def offer(report):
    document = initialize(report.entry, exclude_id=report.pk)
    document = ResearchDocument.objects.select_for_update().get(pk=document.pk)
    target = {key: pointer(report) for key in FIELDS}
    if not document.sections:
        document.sections = target
        materialize(report, factors=True, plan=True)
    elif any(item['changed'] for item in differences(document, target)):
        # Only the latest unadopted result is actionable; displaced results go to history.
        for identity in document.pending:
            old = ResearchReport.objects.get(pk=identity)
            document.history = [{'id': uuid4().hex, 'created_at': old.created_at.isoformat(), 'label': '未采用的分析',
                'sections': {key: pointer(old) for key in FIELDS}}, *document.history][:HISTORY_LIMIT]
        document.pending = [report.pk]
    save(document)
    return document


def materialize(report, *, factors=False, plan=False):
    if factors or (plan and report.data.get('initial_proposal')):
        from quant.factors.services import publish_candidates
        from quant.repairs.services import publish as publish_repairs
        publish_candidates(report)
        publish_repairs(report)
        report.publication_mode = 'adopted' if plan or report.publication_mode == 'adopted' else 'factors'
        report.save(update_fields=['publication_mode', 'factor_bindings', 'updated_at'])
        from quant.graph.indexing import auto_index
        transaction.on_commit(lambda: auto_index(report.pk))
    if plan:
        report.publication_mode = 'adopted'
        report.save(update_fields=['publication_mode', 'updated_at'])
        from quant.experiments.proposals import publish
        publish(report.run)


@transaction.atomic
def change(entry, expected_revision, action, identity='', sections=()):
    document = initialize(entry)
    document = ResearchDocument.objects.select_for_update().get(pk=document.pk)
    if document.revision != expected_revision:
        raise Conflict('研究内容已在其他页面或设备更新，请刷新后再操作')
    if action in ('adopt', 'restore'):
        if not sections or len(set(sections)) != len(sections) or any(key not in FIELDS for key in sections):
            raise ValidationError('请选择需要采用或恢复的内容')
        if action == 'adopt':
            if identity not in document.pending:
                raise ValidationError('这次分析不在待采用列表中')
            report = ResearchReport.objects.get(pk=identity, entry=entry)
            target = {key: pointer(report) for key in sections}
        else:
            record = next((row for row in document.history if row['id'] == identity), None)
            if not record:
                raise ValidationError('更新记录不存在')
            target = {key: record['sections'][key] for key in sections}
        if 'plan' in target:
            plan = ResearchReport.objects.get(pk=target['plan']['report_id'])
            factor_pointer = target.get('factors', document.sections.get('factors'))
            factor_report = ResearchReport.objects.get(pk=factor_pointer['report_id'])
            if plan.data.get('initial_proposal') and payload(plan, 'factors') != payload(factor_report, 'factors'):
                raise ValidationError('此实验方案引用了不同的算法，请同时选择对应的因子算法')
        changed_keys = {row['section'] for row in differences(document, target) if row['changed']}
        target = {key: value for key, value in target.items() if key in changed_keys}
        if target:
            remember(document, '采用变更前' if action == 'adopt' else '恢复前')
            for key in ('factors', 'plan'):
                if key in target:
                    materialize(ResearchReport.objects.get(pk=target[key]['report_id']), **{key: True})
            document.sections.update(target)
        if action == 'adopt':
            # Unselected sections remain pending until explicitly adopted or discarded.
            all_target = {key: pointer(report) for key in FIELDS}
            if not any(row['changed'] for row in differences(document, all_target)):
                document.pending.remove(identity)
    elif action == 'discard':
        if identity not in document.pending:
            raise ValidationError('待采用结果不存在')
        document.pending.remove(identity)
    elif action == 'delete_history':
        if not any(row['id'] == identity for row in document.history):
            raise ValidationError('更新记录不存在')
        document.history = [row for row in document.history if row['id'] != identity]
    elif action == 'clear_history':
        document.history = []
    else:
        raise ValidationError('未知研究操作')
    save(document)
    if action in ('discard', 'delete_history', 'clear_history'):
        from .cleanup import prune
        prune(entry)
    return document


def edited(report, previous_revision_id):
    document = ResearchDocument.objects.filter(entry=report.entry).first()
    if document and document.sections.get('reading', {}).get('report_id') == report.pk:
        remember(document, '正文编辑前')
        document.sections['reading'] = pointer(report)
        save(document)

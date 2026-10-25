"""Authenticated owner HTTP boundary; domain changes share the snapshot lock."""
from contextlib import ExitStack
from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView, exception_handler
from system_settings.models import AIModel, SystemSetting
from utils.ai_service import AIService
from utils.response_utils import success_result
from .access import owned_collection, owned_entry
from .locking import collection_lock
from .models import AIRun, Attachment, Backtest, CodeVersion, Entry, Implementation, Job, SourceRevision
from .presentation import entry_detail, run_data
from .serializers import AttachmentSerializer, BacktestSerializer, CodeVersionSerializer, EntrySerializer, ImplementationSerializer, VerificationSerializer
from .services import adopt, attach, create_implementation, queue, read_script, save_version, touch
from . import worker


class QuantView(APIView):
    permission_classes = [IsAuthenticated]

    def dispatch(self, request, *args, **kwargs):
        self._request_transaction = False
        # Keep DRF's authentication, exception and response lifecycle intact;
        # initial() enters resources only after rejecting unauthorized callers.
        with ExitStack() as self._request_context:
            return super().dispatch(request, *args, **kwargs)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if kwargs.get('coll_id'):
            # Reject missing/foreign IDs without creating arbitrary lock files.
            # This precheck never supplies handler state: another request or a
            # snapshot may change ownership while this request waits for its lock.
            owned_collection(request, kwargs['coll_id'])
            self._request_context.enter_context(collection_lock(kwargs['coll_id']))
            self._request_context.enter_context(transaction.atomic())
            self._request_transaction = True
            self.collection = owned_collection(request, kwargs['coll_id'])
        if kwargs.get('entry_id'):
            self.entry = owned_entry(self.collection, kwargs['entry_id'])

    def handle_exception(self, exc):
        if self._request_transaction and connection.in_atomic_block:
            transaction.set_rollback(True)
        # The legacy handler assumes flat lists and crashes on nested batch
        # serializer errors. Preserve DRF's validation response for this domain.
        response = exception_handler(exc, self.get_exception_handler_context()) if isinstance(exc, serializers.ValidationError) else super().handle_exception(exc)
        # The legacy global serializer handler returns a business error with
        # HTTP 200. New quant endpoints must retain the actual HTTP failure.
        response.status_code = getattr(exc, 'status_code', response.status_code)
        if isinstance(response.data, dict):
            message = response.data.get('msg') or response.data.get('detail') or str(response.data)
        else:
            message = str(response.data)
        response.data = {'code': response.status_code, 'msg': str(message), 'data': None}
        return response


class EntryView(QuantView):
    def get(self, request, coll_id, entry_id=None):
        if entry_id:
            for run in self.entry.runs.filter(status__in=['pending', 'running']):
                worker.recover(run)
            return success_result(entry_detail(self.entry))
        entries = Entry.objects.filter(anthology=self.collection, is_valid=True)
        query = request.query_params.get('q', '').strip()[:200]
        if query:
            # JSON tags may differ by database backend; title/content matching is
            # SQL portable and tag matching is applied to the bounded domain list.
            candidates = list(entries)
            entries = [entry for entry in candidates if query.casefold() in entry.title.casefold()
                       or any(query.casefold() in str(tag).casefold() for tag in entry.tags)]
        else:
            entries = list(entries)
        kind, language = request.query_params.get('kind'), request.query_params.get('language')
        if kind:
            if kind not in Entry.KINDS:
                raise serializers.ValidationError('研究类型无效')
            entries = [entry for entry in entries if entry.kind == kind]
        if language:
            if language not in (*Implementation.LANGUAGES, 'tongdaxin', 'text'):
                raise serializers.ValidationError('代码语言无效')
            ids = set(Implementation.objects.filter(entry__anthology=self.collection, language=language).values_list('entry_id', flat=True))
            ids.update(SourceRevision.objects.filter(material__entry__anthology=self.collection,
                payload__language=language).values_list('material__entry_id', flat=True))
            entries = [entry for entry in entries if entry.pk in ids]
        return success_result(EntrySerializer(entries, many=True).data)

    def post(self, request, coll_id):
        serializer = EntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(anthology=self.collection)
        touch(entry)
        return success_result(EntrySerializer(entry).data)

    def patch(self, request, coll_id, entry_id):
        serializer = EntrySerializer(self.entry, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save()
        touch(entry)
        return success_result(EntrySerializer(entry).data)

    def delete(self, request, coll_id, entry_id):
        self.entry.is_valid = False
        self.entry.save(update_fields=['is_valid', 'updated_at'])
        # Historical attachments remain attached and continue to protect files.
        for run in self.entry.runs.filter(status__in=['pending', 'running']):
            Job.objects.filter(run=run).update(cancelled=True, stage='研究已删除', lease_until=None)
            run.status, run.error = 'cancelled', '研究已删除'
            run.save(update_fields=['status', 'error', 'updated_at'])
            transaction.on_commit(lambda identity=run.pk: worker.interrupt(identity))
        touch(self.entry)
        return success_result()


class ImplementationView(QuantView):
    def post(self, request, coll_id, entry_id):
        implementation = create_implementation(self.entry, request.data)
        return success_result(ImplementationSerializer(implementation).data)

    def patch(self, request, coll_id, entry_id, impl_id):
        class Rename(serializers.Serializer):
            name = serializers.CharField(max_length=255)
        serializer = Rename(data=request.data)
        serializer.is_valid(raise_exception=True)
        implementation = get_object_or_404(Implementation, pk=impl_id, entry=self.entry)
        implementation.name = serializer.validated_data['name']
        implementation.save(update_fields=['name', 'updated_at'])
        touch(self.entry)
        return success_result(ImplementationSerializer(implementation).data)


class VersionView(QuantView):
    def post(self, request, coll_id, entry_id, impl_id):
        implementation = get_object_or_404(Implementation, pk=impl_id, entry=self.entry)
        version = save_version(implementation, request.data)
        return success_result(CodeVersionSerializer(version).data)

    def patch(self, request, coll_id, entry_id, version_id):
        version = get_object_or_404(CodeVersion, pk=version_id, implementation__entry=self.entry)
        serializer = VerificationSerializer(version, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        touch(self.entry)
        return success_result(CodeVersionSerializer(version).data)


class BacktestView(QuantView):
    def get(self, request, coll_id, entry_id):
        return success_result(BacktestSerializer(self.entry.backtests.filter(is_valid=True), many=True).data)

    def post(self, request, coll_id, entry_id):
        serializer = BacktestSerializer(data=request.data, context={'entry': self.entry})
        serializer.is_valid(raise_exception=True)
        backtest = serializer.save(entry=self.entry)
        touch(self.entry)
        return success_result(BacktestSerializer(backtest).data)

    def patch(self, request, coll_id, entry_id, backtest_id):
        backtest = get_object_or_404(Backtest, pk=backtest_id, entry=self.entry, is_valid=True)
        serializer = BacktestSerializer(backtest, data=request.data, partial=True, context={'entry': self.entry})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        touch(self.entry)
        return success_result(BacktestSerializer(backtest).data)

    def delete(self, request, coll_id, entry_id, backtest_id):
        backtest = get_object_or_404(Backtest, pk=backtest_id, entry=self.entry, is_valid=True)
        backtest.is_valid = False
        backtest.save(update_fields=['is_valid', 'updated_at'])
        touch(self.entry)
        return success_result()


class AttachmentView(QuantView):
    def post(self, request, coll_id, entry_id):
        return success_result(AttachmentSerializer(attach(self.entry, request.data)).data)

    def delete(self, request, coll_id, entry_id, reference_id):
        get_object_or_404(Attachment, pk=reference_id, entry=self.entry).delete()
        touch(self.entry)
        return success_result()

    def get(self, request, coll_id, entry_id, reference_id):
        reference = get_object_or_404(Attachment.objects.select_related('asset'), pk=reference_id, entry=self.entry,
                                    asset__is_valid=True, asset__uploader=self.collection.user_id)
        return success_result(read_script(reference))


class ModelsView(QuantView):
    def get(self, request):
        rows = AIModel.objects.filter(type='chat').order_by('display_name', 'name')
        models = [{'id': row.pk, 'name': row.display_name or row.name} for row in rows]
        system = SystemSetting.objects.filter(pk='system_ai_config').values_list('value', flat=True).first() or {}
        default = AIService._get_config_value(system, 'defaultChatModelId', 'default_chat_model_id') or ''
        if default not in {model['id'] for model in models}:
            default = ''
        return success_result({'models': models, 'default_model_id': default})


class RunView(QuantView):
    def get(self, request, coll_id, entry_id, run_id=None):
        if run_id:
            run = worker.recover(get_object_or_404(AIRun, pk=run_id, entry=self.entry))
            return success_result(run_data(run))
        return success_result([run_data(worker.recover(run)) for run in self.entry.runs.all()])

    def post(self, request, coll_id, entry_id, run_id=None, action=None):
        if not run_id:
            return success_result(run_data(queue(self.entry, request.data)))
        run = worker.recover(get_object_or_404(AIRun.objects.select_related('source_version'), pk=run_id, entry=self.entry))
        if action == 'cancel':
            if run.status in ('pending', 'running'):
                Job.objects.filter(run=run).update(cancelled=True, stage='已取消', lease_until=None)
                run.status, run.error = 'cancelled', '任务已取消'
                run.save(update_fields=['status', 'error', 'updated_at'])
                transaction.on_commit(lambda: worker.interrupt(run.pk))
            return success_result(run_data(run))
        if action == 'adopt':
            data = adopt(run)
            if 'implementation' in data:
                data['implementation'] = ImplementationSerializer(data['implementation']).data
            return success_result(data)
        raise serializers.ValidationError('任务操作无效')

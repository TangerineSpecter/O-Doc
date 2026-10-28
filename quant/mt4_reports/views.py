"""Owner-only archive endpoints, coordinated with the snapshot lock."""
from contextlib import ExitStack
from io import BytesIO

from django.db import connection, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from PIL import Image
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView, exception_handler

from anthology.models import Anthology
from quant.locking import collection_lock
from quant.models import MT4Attachment, MT4Backtest, MT4Expert
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result
from .archive import MAX_ZIP_BYTES, read_zip
from .serializers import AttachmentNoteSerializer, AttachmentSerializer, ExpertSerializer, TestSerializer, TestSummarySerializer
from .services import asset_bytes, inspect_asset, owned_asset, validate_image
from .queries import with_summary


class ArchiveView(APIView):
    permission_classes = [IsAuthenticated]

    def dispatch(self, request, *args, **kwargs):
        self._atomic = False
        with ExitStack() as self._resources:
            return super().dispatch(request, *args, **kwargs)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        owner = get_current_user_identifier(request)
        coll_id = kwargs['coll_id']
        query = Anthology.objects.filter(pk=coll_id, user_id=owner, type='backtest', permission='private', is_valid=True)
        get_object_or_404(query)
        # 归档读取同样只需共享锁，允许同一文集的多个只读请求并行。
        writable = request.method not in ('GET', 'HEAD', 'OPTIONS')
        self._resources.enter_context(collection_lock(coll_id, exclusive=writable))
        self._resources.enter_context(transaction.atomic())
        self._atomic = True
        self.collection = get_object_or_404(query)
        if kwargs.get('expert_id'):
            self.expert = get_object_or_404(MT4Expert, pk=kwargs['expert_id'], anthology=self.collection, is_valid=True)
        if kwargs.get('test_id'):
            self.test = get_object_or_404(MT4Backtest, pk=kwargs['test_id'], expert=self.expert, is_valid=True)

    def handle_exception(self, exc):
        if self._atomic and connection.in_atomic_block:
            transaction.set_rollback(True)
        response = exception_handler(exc, self.get_exception_handler_context())
        if response is None:
            return super().handle_exception(exc)
        response.data = {'code': response.status_code, 'msg': str(response.data), 'data': None}
        return response


class ExpertView(ArchiveView):
    def get(self, request, coll_id, expert_id=None):
        if expert_id:
            return success_result({
                'expert': ExpertSerializer(self.expert).data,
                'backtests': TestSummarySerializer(with_summary(self.expert.backtests.filter(is_valid=True)), many=True).data,
                'attachments': AttachmentSerializer(self.expert.attachments.filter(backtest__isnull=True).select_related('asset'), many=True).data,
            })
        return success_result(ExpertSerializer(self.collection.mt4_experts.filter(is_valid=True), many=True).data)

    def post(self, request, coll_id):
        serializer = ExpertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expert = serializer.save(anthology=self.collection)
        return success_result(ExpertSerializer(expert).data)

    def patch(self, request, coll_id, expert_id):
        serializer = ExpertSerializer(self.expert, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return success_result(ExpertSerializer(serializer.save()).data)

    def delete(self, request, coll_id, expert_id):
        self.expert.is_valid = False
        self.expert.save(update_fields=['is_valid', 'updated_at'])
        return success_result()


class PreviewView(ArchiveView):
    def post(self, request, coll_id, expert_id):
        asset = owned_asset(self.collection.user_id, request.data.get('asset_id'))
        report, report_hash, has_chart = inspect_asset(asset)
        duplicates = list(self.expert.backtests.filter(report_hash=report_hash, is_valid=True).values('id', 'title'))
        return success_result({'report': report, 'report_hash': report_hash, 'has_chart': has_chart, 'duplicates': duplicates})


class TestView(ArchiveView):
    def get(self, request, coll_id, expert_id, test_id=None):
        if test_id:
            return success_result({'backtest': TestSerializer(self.test).data,
                'attachments': AttachmentSerializer(self.test.attachments.select_related('asset'), many=True).data})
        return success_result(TestSummarySerializer(with_summary(self.expert.backtests.filter(is_valid=True)), many=True).data)

    def post(self, request, coll_id, expert_id):
        serializer = TestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        asset_id = request.data.get('report_asset_id')
        image_id = request.data.get('image_asset_id')
        report_hash = ''
        asset = None
        if asset_id:
            asset = owned_asset(self.collection.user_id, asset_id)
            _, report_hash, _ = inspect_asset(asset)
            if not request.data.get('allow_duplicate') and self.expert.backtests.filter(report_hash=report_hash, is_valid=True).exists():
                raise serializers.ValidationError('该报告已导入，请确认是否继续创建')
        image = owned_asset(self.collection.user_id, image_id) if image_id else None
        if image:
            validate_image(image)
        test = serializer.save(expert=self.expert, report_hash=report_hash)
        if asset:
            MT4Attachment.objects.create(expert=self.expert, backtest=test, asset=asset, role='report')
        if image:
            MT4Attachment.objects.create(expert=self.expert, backtest=test, asset=image, role='chart' if asset else 'screenshot')
        return success_result(TestSerializer(test).data)

    def patch(self, request, coll_id, expert_id, test_id):
        serializer = TestSerializer(self.test, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return success_result(TestSerializer(serializer.save()).data)

    def delete(self, request, coll_id, expert_id, test_id):
        self.test.is_valid = False
        self.test.save(update_fields=['is_valid', 'updated_at'])
        return success_result()


class AttachmentView(ArchiveView):
    def post(self, request, coll_id, expert_id, test_id=None):
        asset = owned_asset(self.collection.user_id, request.data.get('asset_id'))
        role = request.data.get('role', 'attachment')
        if role not in ('attachment', 'chart', 'screenshot') or (role in ('chart', 'screenshot') and asset.file_type != 'image'):
            raise serializers.ValidationError('附件用途或图片格式无效')
        if role in ('chart', 'screenshot') and not test_id:
            raise serializers.ValidationError('回测图片需要关联回测记录')
        if role in ('chart', 'screenshot'):
            validate_image(asset)
        ref = MT4Attachment.objects.create(expert=self.expert, backtest=getattr(self, 'test', None), asset=asset, role=role)
        return success_result(AttachmentSerializer(ref).data)

    def patch(self, request, coll_id, expert_id, ref_id, test_id=None):
        ref = get_object_or_404(MT4Attachment.objects.select_related('asset'), pk=ref_id, expert=self.expert, backtest=getattr(self, 'test', None))
        serializer = AttachmentNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ref.note = serializer.validated_data['note']
        ref.save(update_fields=['note', 'updated_at'])
        return success_result(AttachmentSerializer(ref).data)

    def delete(self, request, coll_id, expert_id, ref_id, test_id=None):
        ref = get_object_or_404(MT4Attachment, pk=ref_id, expert=self.expert, backtest=getattr(self, 'test', None))
        ref.delete()
        return success_result()


class ZipChartView(ArchiveView):
    def get(self, request, coll_id, expert_id, test_id):
        ref = get_object_or_404(self.test.attachments.select_related('asset'), role='report', asset__file_extension='.zip')
        bundle = read_zip(asset_bytes(ref.asset, MAX_ZIP_BYTES))
        if not bundle.image:
            raise serializers.ValidationError('报告压缩包中没有曲线图')
        try:
            with Image.open(BytesIO(bundle.image)) as picture:
                picture.verify()
                image_format = picture.format
        except Exception as exc:
            raise serializers.ValidationError('曲线图片内容无效') from exc
        types = {'GIF': 'image/gif', 'PNG': 'image/png', 'JPEG': 'image/jpeg', 'WEBP': 'image/webp'}
        if image_format not in types:
            raise serializers.ValidationError('不支持此曲线图片格式')
        response = HttpResponse(bundle.image, content_type=types[image_format])
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'none'; sandbox;"
        response['Cache-Control'] = 'private, no-store'
        return response


class VisionView(APIView):
    """No archive lock is held during a potentially slow external model call."""
    permission_classes = [IsAuthenticated]

    def post(self, request, coll_id, expert_id):
        owner = get_current_user_identifier(request)
        collection = get_object_or_404(Anthology, pk=coll_id, user_id=owner, type='backtest', permission='private', is_valid=True)
        get_object_or_404(MT4Expert, pk=expert_id, anthology=collection, is_valid=True)
        asset = owned_asset(owner, request.data.get('asset_id'))
        from .vision import recognize
        try:
            result = recognize(asset)
        except serializers.ValidationError:
            raise
        except Exception as exc:
            raise serializers.ValidationError('识图失败，请检查系统识图模型或手工录入') from exc
        return success_result(result)

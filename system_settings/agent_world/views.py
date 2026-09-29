from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from article.access import can_access_anthology, can_manage_anthology
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .models import WorldCategory, WorldProfession, WorldLedger, WorldMonthSettlement, WorldIncomeEvent
from .serializers import CategorySerializer, ProfessionSerializer, IncomeConfigSerializer, LedgerSerializer, SettlementSerializer, IncomeEventSerializer
from .income import current_config
from .migration import preview, migrate
from .ranking import rank, SHANGHAI, month_cutoff


class CatalogView(APIView):
    permission_classes = [IsAuthenticated]
    model = WorldCategory
    serializer = CategorySerializer

    def get(self, request):
        return success_result(self.serializer(self.model.objects.all(), many=True).data)

    def post(self, request):
        row = self.model.objects.filter(pk=request.data.get('id')).first() if request.data.get('id') else None
        if request.data.get('id') and row is None:
            return valid_result('记录不存在', status=404)
        serializer = self.serializer(row, data=request.data, partial=row is not None)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_result(serializer.data)


class ProfessionView(CatalogView):
    model = WorldProfession
    serializer = ProfessionSerializer


class ProfessionDescriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .profession_description import DescriptionInput, generate_description
        serializer = DescriptionInput(data=request.data)
        if not serializer.is_valid():
            return valid_result('职业资料无效', serializer.errors, status=400)
        try:
            return success_result({'description': generate_description(serializer.validated_data)})
        except Exception:
            import logging
            logging.getLogger(__name__).exception('职业说明生成失败')
            return valid_result('职业说明生成失败，请检查默认文本模型配置后重试', status=502)


class IncomeConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = current_config()
        return success_result(IncomeConfigSerializer(config).data if config else {})

    def post(self, request):
        serializer = IncomeConfigSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_result(serializer.data)


class LedgerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = WorldLedger.objects.order_by('-created_at')
        agent_id = request.GET.get('agent_id') or request.GET.get('agentId')
        if agent_id:
            rows = rows.filter(agent_id=agent_id)
        direction = request.GET.get('direction')
        if direction == 'flow':
            rows = rows.exclude(kind='opening').exclude(amount=0)
        elif direction == 'income':
            rows = rows.filter(amount__gt=0).exclude(kind='opening')
        elif direction == 'expense':
            rows = rows.filter(amount__lt=0)
        return success_result(LedgerSerializer(rows[:200], many=True).data)


class SettlementsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(SettlementSerializer(WorldMonthSettlement.objects.order_by('-month', 'collection_id')[:200], many=True).data)


class MigrationView(APIView):
    permission_classes = [IsAuthenticated]

    def _check(self, request, collection_id):
        if not can_manage_anthology(request, collection_id, 'agent'):
            raise PermissionDenied('只有文集管理者可以迁移分类')

    def get(self, request, collection_id):
        self._check(request, collection_id)
        return success_result(preview(collection_id, request.GET.get('old_category', ''), request.GET.get('post_id', '')))

    def post(self, request, collection_id):
        self._check(request, collection_id)
        try:
            return success_result(migrate(collection_id, request.data.get('old_category', ''),
                request.data.get('category_id'), request.data.get('token', ''),
                get_current_user_identifier(request), request.data.get('post_id', '')))
        except ValueError as exc:
            return valid_result(str(exc), status=409)


class RankingView(APIView):
    def get(self, request, collection_id):
        if not can_access_anthology(request, collection_id, 'agent'):
            raise PermissionDenied()
        period = request.GET.get('period', 'total')
        if period not in {'total', 'year', 'month'}:
            return valid_result('榜单周期无效', status=400)
        now = timezone.now().astimezone(SHANGHAI)
        value = request.GET.get('value') or (str(now.year) if period == 'year' else now.strftime('%Y-%m'))
        frozen = None
        if period == 'month':
            try:
                month_cutoff(value)
            except ValueError:
                return valid_result('月份无效', status=400)
            frozen = WorldMonthSettlement.objects.filter(collection_id=collection_id, month=value).first()
        rows = frozen.ranking if frozen else rank(collection_id, period, value)
        # Respect per-post access; collection visibility alone does not expose private posts.
        manager = request.user.is_authenticated and can_manage_anthology(request, collection_id, 'agent')
        if not manager:
            rows = [r for r in rows if r.get('permission') == 'public']
        visible_ids = {r['post_id'] for r in rows}
        awards = [a for a in frozen.awards if a['post_id'] in visible_ids] if frozen else []
        return success_result({'posts': rows[:5], 'frozen': bool(frozen), 'awards': awards})


class PendingIncomeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = WorldIncomeEvent.objects.filter(status='unresolved_author').order_by('-created_at')[:200]
        return success_result(IncomeEventSerializer(rows, many=True).data)

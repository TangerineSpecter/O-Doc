"""手动场次终态反馈；按执行前后状态比较，不重复通知历史失败。"""
from system_logs.capture import sanitize
from django.db.models import Q
from utils.notification_service import NotificationService

from .social_models import SocialTheatreEvent

ACTIVE_STATUSES = ('scheduled', 'searching', 'running')


def pending_manual_ids(owner: str) -> list[str]:
    return list(SocialTheatreEvent.objects.filter(
        owner_id=owner, snapshot__manual=True, status__in=ACTIVE_STATUSES
    ).values_list('pk', flat=True))


def notify_manual_results(owner: str, pending_ids: list[str]) -> None:
    # 调用方持有账号执行租约。只通知本轮从非终态转成终态的手动场次；
    # 用户主动继续后再次中断属于新的尝试，无需新增同步字段或通知标记。
    for row in SocialTheatreEvent.objects.filter(owner_id=owner, pk__in=pending_ids).filter(
            Q(status__in=('failed', 'skipped', 'expired')) | Q(status='completed', transcript=[])):
        topic = str((row.snapshot or {}).get('manual_topic') or row.source.get('title') or '随机新闻')
        reason = sanitize(row.error or ('参与居民本次均未继续发言，未形成讨论。' if row.status == 'completed'
                                        else '本场未形成讨论，请查看场次记录。'), 700)
        result = {'failed': '暂时中断', 'skipped': '未能发起讨论', 'expired': '已过期，未继续执行',
                  'completed': '已结束，未产生发言'}[row.status]
        NotificationService.send(
            owner, '手动小剧场未完成', f'议题：{topic[:200]}\n结果：{result}\n原因：{reason}',
            level='info' if row.status == 'completed' else 'warning', link='/agent-world',
        )

from django.db.models import Count
from django.db.models.functions import TruncDate

from article.models import Article, Image
from memos.models import Memo
from prompts.models import PromptTemplate
from whiteboard.models import Whiteboard


def daily_creation(year, whiteboard_owner):
    sources = {
        'articles': Article.objects.all(),
        'images': Image.objects.all(),
        'memos': Memo.objects.all(),
        'prompts': PromptTemplate.objects.all(),
        'whiteboards': Whiteboard.objects.filter(user_id=whiteboard_owner) if whiteboard_owner else Whiteboard.objects.none(),
    }
    days = {}
    for field, rows in sources.items():
        daily = (rows.filter(is_valid=True, created_at__year=year).order_by()
                 .annotate(day=TruncDate('created_at')).values('day').annotate(count=Count('pk')))
        for row in daily:
            day = row['day'].isoformat()
            if day not in days:
                days[day] = dict.fromkeys(sources, 0) | {'date': day, 'total': 0}
            days[day][field] = row['count']
            days[day]['total'] += row['count']
    return [days[day] for day in sorted(days)]

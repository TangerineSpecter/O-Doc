"""Find the backfill boundary once per day; queue older days in bounded batches."""
from datetime import timedelta
from django.db.models import Min
from article.models import Article, ArticlePostComment, ArticlePostRating, ArticleAnnotation, ArticleAnnotationComment
from system_settings.models import AgentActivity, AgentRunRecord
from ..life_time import local_time
from ..models import WorldLedger
from ..farm_models import FarmOperation
from ..cooking_models import CookingOperation
from ..market_models import MarketTransaction
from ..investment_models import InvestmentTrade
from ..social_models import Moment, MomentComment, MomentLike
from ..combat.models import Exploration, CombatFact, CombatEncounter
from ..fishing.models import FishingEvent, FishingTrip
from ..travel_models import TravelJourney
from ..lottery_models import LotteryTicket
from .archive import enqueue
from .models import ResidentAnalyticsWork


def history_start(today):
    # Global conservative lower bound also covers public works and unassigned
    # residents. Actual statistics are always projected per account.
    earliest = today
    sources = [(model, 'created_at') for model in (FarmOperation, CookingOperation, MarketTransaction,
        InvestmentTrade, WorldLedger, Moment, MomentComment, ArticlePostComment, ArticlePostRating,
        ArticleAnnotation, ArticleAnnotationComment, Exploration, CombatFact, FishingEvent, LotteryTicket)]
    sources.extend([(MomentLike, 'updated_at'), (AgentActivity, 'occurred_at'), (AgentRunRecord, 'started_at'),
                    (CombatEncounter, 'ended_at'), (FishingTrip, 'departed_at'), (TravelJourney, 'departed_at'),
                    (Article, 'created_at')])
    for model, field in sources:
        at = model.objects.aggregate(first=Min(field))['first']
        if at:
            earliest = min(earliest, local_time(at).date())
    return earliest


def enqueue_history(owner, earliest, today):
    last = today - timedelta(days=30)
    if last < earliest:
        return
    covered = (ResidentAnalyticsWork.objects.filter(owner_id=owner, day__range=(earliest, last))
               .values_list('day', flat=True).distinct())
    if covered.count() == (last - earliest).days + 1:
        return

    # Custom report ranges can leave gaps anywhere. Read covered days in order
    # and stop as soon as this worker tick has its 15 most recent missing days.
    missing = []
    day = last
    one_day = timedelta(days=1)
    for known in covered.order_by('-day').iterator(chunk_size=128):
        while day > known and len(missing) < 15:
            missing.append(day)
            day -= one_day
        if len(missing) == 15:
            break
        day = known - one_day
    while day >= earliest and len(missing) < 15:
        missing.append(day)
        day -= one_day
    if missing:
        enqueue(owner, missing)

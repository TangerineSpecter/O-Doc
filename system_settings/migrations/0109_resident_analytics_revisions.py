"""Invalidate local day proofs in the source transaction, including bulk SQL writes."""
from django.db import migrations

# Each pair is (affected interval, relevant UPDATE columns). Empty bounds mean
# shared ownership, visibility or a cross-day dependency with no reliable end.
# PostgreSQL stores Django DateTimeFields as timestamptz even with USE_TZ=False.
SOURCES = {
    'Agent': ('', 'name avatar archived_at profession_id'),
    'WorldProfession': ('', 'name'),
    'AgentTask': ('', 'agent_id agent_ids task_kind world_state publish_config farm_config market_config travel_config investment_config'),
    'LifeProfile': ('', 'owner_id'), 'AgentFarm': ('', 'owner_id actor_name'),
    'CookingSkill': ('', 'owner_id actor_name'), 'InvestmentAccount': ('', 'owner_id'),
    'CombatProfile': ('', 'owner_id'), 'FishingProfile': ('', 'owner_id'),
    'FishingTripCoverage': ('', ''), 'CombatPartyCoverage': ('', ''),
    'CombatPartySettlement': ('', ''), 'CombatSoloSettlement': ('', ''),
    'CombatIntegrity': ('', 'archive_sequence'),
    'FarmCatalog': ('', 'rules'), 'CombatCatalog': ('', 'tables'),
    'AgentRunRecord': ('started_at', 'started_at task_id agent_id agent_runs agent_name status'),
    'FarmOperation': ('created_at', ''), 'CookingOperation': ('created_at', ''),
    'MarketTransaction': ('created_at', ''), 'InvestmentTrade': ('created_at', ''),
    'WorldLedger': ('created_at', ''), 'LotteryTicket': ('created_at', ''),
    'LotteryRound': ('opens_at draws_at', 'result status opens_at draws_at'),
    'TravelJourney': ('departed_at returned_at', 'owner_id actor_id status destination_id departed_at returned_at'),
    'FishingTrip': ('created_at ended_at', 'owner_id actor_id status departed_at ended_at revision'),
    'FishingEvent': ('created_at', ''), 'FishingTripDay': ('day', ''),
    'AgentActivity': ('occurred_at', ''),
    'Moment': ('created_at', 'actor_id owner_id identity is_valid created_at'),
    'MomentComment': ('created_at', ''), 'MomentLike': ('updated_at', ''),
    'MarketSession': ('created_at', 'actor_id owner_id'),
    'MarketListing': ('created_at updated_at', 'item'),
    'Exploration': ('created_at ended_at', 'owner_id actor_id status ended_at elapsed_seconds result snapshot'),
    'AdventureParty': ('created_at ends_at', 'status owner_id ends_at'),
    'AdventureMember': ('joined_at ends_at', 'party_id owner_id actor_id active left_at ends_at'),
    'AdventureEvent': ('created_at', ''), 'CombatFact': ('created_at', ''),
    'CombatEncounter': ('started_at ended_at', ''),
    'CombatPartyDay': ('day', ''),
    'article.Article': ('created_at', 'coll_id is_valid agent_post_author_id agent_post_creator_name agent_post_creator_avatar created_at'),
    'article.ArticlePostComment': ('created_at', ''), 'article.ArticlePostRating': ('created_at', ''),
    'article.ArticleAnnotation': ('created_at', ''), 'article.ArticleAnnotationComment': ('created_at', ''),
    'anthology.Anthology': ('', 'is_valid permission user_id type'),
}
# Changes of these parent records can revoke access to children on other days.
PARENTS = {'article.Article', 'article.ArticleAnnotation', 'Moment', 'MarketTransaction', 'InvestmentTrade', 'MarketListing'}
# Children can be recorded after the original departure day.
RUN_CHILDREN = {'CombatFact', 'CombatEncounter', 'AdventureMember'}
PARTY_CHILDREN = {'AdventureEvent', 'AdventureMember', 'CombatPartyDay'}

def table(apps, label):
    return apps.get_model(*(label.split('.') if '.' in label else ('system_settings', label)))._meta.db_table


def statements(apps, name, dates, watched, *, owner_condition=None, replace=False):
    source = table(apps, name)
    work = table(apps, 'ResidentAnalyticsWork')
    fn = 'odoc_stats_' + name.split('.')[-1].lower()
    bounds = [f'({side}.{field} AT TIME ZONE \'Asia/Shanghai\')::date'
              if field != 'day' else f'{side}.day' for field in dates.split() for side in ('OLD', 'NEW')]
    # Ownership moves and retractions also invalidate the resident selector.
    global_change = 'FALSE'
    if name in PARENTS:
        global_change = "TG_OP <> 'INSERT'"
    if name in {'TravelJourney', 'AgentActivity', 'FishingTrip', 'MarketSession', 'Exploration', 'LotteryTicket',
                'MomentComment', 'MomentLike', 'CookingOperation', 'CombatFact'}:
        global_change += " OR TG_OP = 'DELETE'" if name != 'CombatFact' else " OR (TG_OP = 'DELETE' AND OLD.kind <> 'round')"
    for field in ('owner_id', 'actor_id'):
        model = apps.get_model(*(name.split('.') if '.' in name else ('system_settings', name)))
        if field in {f.attname for f in model._meta.fields}:
            global_change += f" OR (TG_OP = 'UPDATE' AND OLD.{field} IS DISTINCT FROM NEW.{field})"
    related = {'CombatPartySettlement': ('AdventureParty', 'ends_at'),
               'CombatPartyCoverage': ('AdventureParty', 'ends_at'),
               'CombatSoloSettlement': ('Exploration', 'ended_at'),
               'FishingTripCoverage': ('FishingTrip', 'ended_at')}.get(name)
    if related:
        parent, end = related
        for field in ('created_at', end):
            bounds.append(f"(SELECT MIN(({field} AT TIME ZONE 'Asia/Shanghai')::date) FROM "
                          + table(apps, parent) + ' WHERE id IN (OLD.id, NEW.id))')
    if name in RUN_CHILDREN:
        bounds.append("(SELECT MIN((created_at AT TIME ZONE 'Asia/Shanghai')::date) FROM "
                      + table(apps, 'Exploration') + ' WHERE id IN (OLD.exploration_id, NEW.exploration_id))')
    if name in PARTY_CHILDREN:
        bounds.append("(SELECT MIN((created_at AT TIME ZONE 'Asia/Shanghai')::date) FROM "
                      + table(apps, 'AdventureParty') + ' WHERE id IN (OLD.party_id, NEW.party_id))')
    if name == 'Exploration':
        bounds.append("(SELECT MIN((created_at AT TIME ZONE 'Asia/Shanghai')::date) FROM "
                      + table(apps, 'AdventureParty') + " WHERE id IN (OLD.snapshot->>'party_id', NEW.snapshot->>'party_id'))")
    lo = 'LEAST(' + ','.join(bounds) + ')' if bounds else 'NULL'
    hi = 'GREATEST(' + ','.join(bounds) + ')' if bounds else 'NULL'
    watched_fields = watched.split()
    if name == 'AgentTask':
        # Task runtime updates frequently. Only assignment, type and owner
        # affect the resident directory and classification of custom work.
        watched_fields = [f if f in ('agent_id', 'agent_ids', 'task_kind') else f + "->>'owner_id'"
                          for f in watched_fields]
    unchanged = ' AND '.join(f'(OLD.{f}) IS NOT DISTINCT FROM (NEW.{f})' for f in watched_fields)
    if name == 'CombatIntegrity':
        unchanged = '(OLD.archive_sequence > 0) = (NEW.archive_sequence > 0)'
        if owner_condition:
            unchanged += ' AND OLD.owner_id IS NOT DISTINCT FROM NEW.owner_id'
    skip = f"IF TG_OP = 'UPDATE' AND {unchanged} THEN RETURN NULL; END IF;" if unchanged else ''
    if name == 'Exploration':
        # Cohorts are attributed to their real depart fact, even if an old
        # import used a different creation date.
        depart = table(apps, 'CombatFact')
        dep = f"(SELECT MIN((created_at AT TIME ZONE 'Asia/Shanghai')::date) FROM {depart} WHERE exploration_id IN (OLD.id, NEW.id) AND kind='depart')"
        lo, hi = f'LEAST({lo}, {dep})', f'GREATEST({hi}, {dep})'
    if name == 'LotteryRound':
        tickets = table(apps, 'LotteryTicket')
        cohort = f"FROM {tickets} WHERE round_id IN (OLD.id, NEW.id)"
        lo = f"LEAST({lo}, (SELECT MIN((created_at AT TIME ZONE 'Asia/Shanghai')::date) {cohort}))"
        hi = f"GREATEST({hi}, (SELECT MAX((created_at AT TIME ZONE 'Asia/Shanghai')::date) {cohort}))"
    owner_clause = f"AND ({owner_condition})" if owner_condition else ""
    create = "CREATE OR REPLACE" if replace else "CREATE"
    return (f"""{create} FUNCTION {fn}() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE lo date; hi date; hard boolean;
        BEGIN
            {skip}
            lo := {lo}; hi := {hi};
            hard := lo IS NULL OR ({global_change}) OR TG_OP = 'DELETE'
                    OR (TG_OP = 'UPDATE' AND '{name}' IN ('MomentComment','MomentLike','AgentActivity',
                        'article.ArticlePostComment','article.ArticlePostRating','article.ArticleAnnotationComment'));
            UPDATE {work}
               SET dirty=TRUE, generation=txid_current(), error='',
                   scope_generation=CASE WHEN hard THEN txid_current() ELSE scope_generation END,
                   verified_digest=CASE WHEN hard THEN '' ELSE verified_digest END
             WHERE (lo IS NULL OR ({global_change}) OR day BETWEEN lo AND hi)
               {owner_clause}
               AND (generation <> txid_current() OR (hard AND scope_generation <> txid_current()));
            RETURN NULL;
        END $$""", f'CREATE TRIGGER odoc_analytics_revision AFTER INSERT OR UPDATE OR DELETE ON "{source}" '
                       f'FOR EACH ROW EXECUTE FUNCTION {fn}()')


def install(apps, editor):
    if editor.connection.vendor == 'postgresql':
        for name, (dates, watched) in SOURCES.items():
            for sql in statements(apps, name, dates, watched):
                editor.execute(sql)


def uninstall(apps, editor):
    if editor.connection.vendor == 'postgresql':
        for name in SOURCES:
            editor.execute(f'DROP TRIGGER odoc_analytics_revision ON "{table(apps, name)}"')
            editor.execute('DROP FUNCTION odoc_stats_' + name.split('.')[-1].lower() + '()')


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0108_resident_analytics_days'), ('article', '0027_list_query_indexes'),
                    ('anthology', '0011_alter_anthology_type')]
    operations = [migrations.RunPython(install, uninstall)]

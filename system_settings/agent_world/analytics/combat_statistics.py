"""Read-only departure-cohort combat statistics, scoped to the authenticated owner."""
from ..combat.models import CombatFact, Exploration, CombatProfile
from .combat_kills import load_combat_kills

OPEN = {'preparing', 'active', 'paused', 'settling'}

JOB_NAMES = {
    'job.novice': '新手', 'job.warrior': '战士', 'job.mage': '法师', 'job.ranger': '游侠', 'job.priest': '牧师',
    'job.swordsman': '剑士', 'job.guardian': '守卫', 'job.elementalist': '元素师', 'job.occultist': '秘术师',
    'job.archer': '弓手', 'job.assassin': '刺客', 'job.cleric': '祭司', 'job.naturalist': '自然使',
    'job.swordmaster': '剑圣', 'job.spellblade': '魔剑士', 'job.paladin': '圣骑士', 'job.berserker': '狂战士',
    'job.pyromancer': '炎术师', 'job.cryomancer': '冰术师', 'job.warlock': '咒术师', 'job.summoner': '召唤师',
    'job.sharpshooter': '神射手', 'job.hunter': '猎人', 'job.shadowdancer': '影舞者', 'job.trickster': '诡术师',
    'job.highpriest': '神官', 'job.inquisitor': '审判者', 'job.druid': '德鲁伊', 'job.warden': '守望者',
}


def count(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def aggregate_combat(residents, runs, kills):
    profiles = {p.pk: p for p in CombatProfile.objects.filter(pk__in=residents.keys())}
    rows = {}
    for actor, resident in residents.items():
        profile = profiles.get(actor)
        job_id = profile.progression.get('job', 'job.novice') if profile and profile.progression else None
        job_name = JOB_NAMES.get(job_id, job_id) if job_id else None
        rows[actor] = {
            **resident,
            'professionName': resident.get('professionName'),
            'job': job_id,
            'jobName': job_name,
            'explorations': 0, 'settled': 0, 'completed': 0,
            'ongoing': 0, 'fallen': 0, 'recalled': 0, 'exhausted': 0, 'otherEnded': 0,
            'kills': 0, 'bossKills': 0, 'experience': 0, 'elapsedSeconds': 0,
            'longestSeconds': 0, 'energy': 0, 'potions': 0, 'monsters': {}, 'destinations': set(),
        }
    seen = set()
    for run in runs:
        row = rows.get(run.actor_id)
        if row is None or run.pk in seen:
            continue
        if not row.get('jobName'):
            snap_job = (run.snapshot.get('progression') or {}).get('job')
            if snap_job:
                row['job'] = snap_job
                row['jobName'] = JOB_NAMES.get(snap_job, snap_job)
        seen.add(run.pk)
        row['explorations'] += 1
        if run.status in OPEN:
            row['ongoing'] += 1
        else:
            row['settled'] += 1
            row[run.status if run.status in ('completed', 'fallen', 'recalled', 'exhausted') else 'otherEnded'] += 1
        result = run.result or {}
        row['kills'] += count(result.get('kills'))
        row['experience'] += count(result.get('experience'))
        elapsed = count(run.elapsed_seconds)
        row['elapsedSeconds'] += elapsed
        row['longestSeconds'] = max(row['longestSeconds'], elapsed)
        row['energy'] += count(result.get('energy'))
        row['potions'] += sum(count(amount) for amount in (result.get('potions_used') or {}).values())
        row['potions'] += sum(count(amount) for amount in (result.get('elixirs_used') or {}).values())
        destination = (run.snapshot.get('plan') or {}).get('dungeon_id')
        if destination:
            row['destinations'].add(destination)
    seen_kills = set()
    for kill in kills:
        row = rows.get(kill.actor_id)
        key = (kill.actor_id, kill.exploration_id, kill.identity)
        if row is None or kill.exploration_id not in seen or key in seen_kills:
            continue
        seen_kills.add(key)
        monster = kill.monster
        key = monster.get('id') or 'unknown'
        detail = row['monsters'].setdefault(key, {'id': key, 'name': monster.get('name') or '未记录魔物', 'kills': 0, 'highestLevel': 0})
        detail['kills'] += 1
        detail['highestLevel'] = max(detail['highestLevel'], count(monster.get('level')))
        row['bossKills'] += monster.get('rank') == 'boss'
    for row in rows.values():
        row['successRate'] = round(100 * row['completed'] / row['settled'], 1) if row['settled'] else None
        row['averageSeconds'] = round(row['elapsedSeconds'] / row['explorations']) if row['explorations'] else 0
        row['killsPerHour'] = round(row['kills'] * 3600 / row['elapsedSeconds'], 1) if row['elapsedSeconds'] else None
        row['destinations'] = len(row['destinations'])
        row['monsters'] = sorted(row['monsters'].values(), key=lambda item: (-item['kills'], item['id']))
        row['unclassifiedKills'] = max(0, row['kills'] - sum(item['kills'] for item in row['monsters']))
    return sorted(rows.values(), key=lambda row: (-row['kills'], -row['bossKills'], -row['experience'], row['id']))


def load_combat_statistics(owner, start, end, residents):
    # Actual departures, not preparation requests or mutable timestamps, define the cohort.
    ids = CombatFact.objects.filter(owner_id=owner, actor_id__in=residents, kind='depart',
        created_at__gte=start, created_at__lt=end).values_list('exploration_id', flat=True).distinct()
    runs = list(Exploration.objects.filter(owner_id=owner, actor_id__in=residents, pk__in=ids))
    kills = load_combat_kills(owner, exploration_ids=[run.pk for run in runs], actor_ids=residents)
    return aggregate_combat(residents, runs, kills)

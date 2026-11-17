"""Constrain private-source triggers and rebuild earlier unverified article attribution."""
from importlib import import_module

from django.db import migrations, models
from django.utils import timezone

revisions = import_module('system_settings.migrations.0109_resident_analytics_revisions')

# Directory/profile and public article changes can affect other owners. These
# business facts are actually queried under an owner in the analytics path.
PRIVATE = {
    'CombatFact', 'CombatEncounter', 'Exploration', 'CombatIntegrity', 'AdventureParty',
    'AdventureMember', 'AdventureEvent', 'CombatPartyDay', 'CombatPartyCoverage',
    'CombatPartySettlement', 'CombatSoloSettlement', 'FishingTrip', 'FishingTripDay',
    'FishingTripCoverage', 'TravelJourney', 'MarketSession', 'CookingOperation',
    'MarketTransaction', 'InvestmentTrade', 'LotteryRound', 'LotteryTicket', 'Moment',
}
BY_PARENT = {'FishingEvent': ('FishingTrip', 'trip'), 'MomentLike': ('Moment', 'moment'),
             'MomentComment': ('Moment', 'moment'), 'FarmOperation': ('AgentFarm', 'farm')}


def configure(apps, editor, scoped):
    if editor.connection.vendor != 'postgresql':
        return
    for name in sorted(PRIVATE | BY_PARENT.keys() | {'AgentTask'}):
        dates, watched = revisions.SOURCES[name]
        condition = None
        if scoped and name == 'AgentTask':
            task = apps.get_model('system_settings', 'AgentTask')
            configs = [field.name for field in task._meta.fields if field.name.endswith('_config')]
            watched = ' '.join(['agent_id', 'agent_ids', 'task_kind', 'world_state', *configs])
        elif scoped and name in PRIVATE:
            condition = 'owner_id IN (OLD.owner_id, NEW.owner_id)'
            # A pure owner transfer must not be skipped by a partial UPDATE field list.
            if watched and name != 'CombatIntegrity':
                watched += ' owner_id'
        elif scoped:
            parent, fk = BY_PARENT[name]
            table = revisions.table(apps, parent)
            condition = f'owner_id IN (SELECT p.owner_id FROM {table} p WHERE p.id IN (OLD.{fk}_id, NEW.{fk}_id))'
        function, _ = revisions.statements(apps, name, dates, watched, owner_condition=condition, replace=True)
        editor.execute(function)
    # Reject old proofs including a day whose permission was changed prior to upgrade.
    work = apps.get_model('system_settings', 'ResidentAnalyticsWork')
    work.objects.using(editor.connection.alias).update(
        verified_digest='', dirty=True, error='', after=timezone.now(), scope_generation=models.F('scope_generation') + 1)


def install(apps, editor):
    configure(apps, editor, True)


def restore(apps, editor):
    configure(apps, editor, False)


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0109_resident_analytics_revisions')]
    operations = [
        migrations.AlterField('residentanalyticsday', 'version', models.PositiveSmallIntegerField(default=2)),
        migrations.RunPython(install, restore),
    ]

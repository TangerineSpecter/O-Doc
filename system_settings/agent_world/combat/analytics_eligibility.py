"""Only finished explorations contribute to combat outcome statistics."""

from django.db.models import Exists, OuterRef, Q
from django.db.models.fields.json import KeyTextTransform

from .explorations import TERMINAL
from .models import Exploration
from .party_models import AdventureMember, AdventureParty


def finished_explorations(query, owner):
    """Exclude open runs and wait until their whole party has finished.

    A terminal run without an end time, or a party reference without a
    matching completed party, cannot prove a finished activity.
    """
    finished_member_run = Exploration.objects.filter(
        pk=OuterRef('exploration_id'), actor_id=OuterRef('actor_id'), owner_id=owner,
        status__in=TERMINAL, ended_at__isnull=False)
    members = AdventureMember.objects.filter(party_id=OuterRef('pk'))
    incomplete_members = members.alias(_analytics_run_finished=Exists(finished_member_run)).filter(
        ~Q(owner_id=owner) | Q(active=True) | Q(left_at__isnull=True) | Q(_analytics_run_finished=False))
    completed_party = (AdventureParty.objects.filter(
        pk=OuterRef('_analytics_party_id'), owner_id=owner, status='completed')
        .alias(_analytics_has_members=Exists(members), _analytics_incomplete=Exists(incomplete_members))
        .filter(_analytics_has_members=True, _analytics_incomplete=False))
    own_member = AdventureMember.objects.filter(
        party_id=OuterRef('_analytics_party_id'), exploration_id=OuterRef('pk'),
        actor_id=OuterRef('actor_id'), owner_id=owner, active=False, left_at__isnull=False)
    return (query.filter(owner_id=owner, status__in=TERMINAL, ended_at__isnull=False)
            .alias(_analytics_party_id=KeyTextTransform('party_id', 'snapshot'),
                   _analytics_party_finished=Exists(completed_party), _analytics_own_member=Exists(own_member))
            .filter(~Q(snapshot__has_key='party_id') |
                    Q(_analytics_party_finished=True, _analytics_own_member=True)))

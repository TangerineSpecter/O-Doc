"""Weekly tournament facts sync; the runner's calendar and lease stay local."""
from django.db import models
from django.utils import timezone


class Tournament(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    week = models.DateField()
    roster = models.JSONField(default=list)
    rules_version = models.PositiveSmallIntegerField(default=1)
    seed = models.CharField(max_length=64)
    status = models.CharField(max_length=16, default='active')
    result = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['owner_id', 'week'], name='tournament_owner_week')]


class TournamentRound(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    tournament = models.ForeignKey(Tournament, on_delete=models.PROTECT, related_name='rounds')
    owner_id = models.CharField(max_length=40, db_index=True)
    number = models.PositiveIntegerField()
    phase = models.CharField(max_length=16)  # preliminary / main / final
    entrants = models.JSONField(default=list)
    scheduled_at = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=16, default='pending')
    completed_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['tournament', 'number'], name='tournament_round_number')]


class TournamentMatch(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    round = models.ForeignKey(TournamentRound, on_delete=models.PROTECT, related_name='matches')
    owner_id = models.CharField(max_length=40, db_index=True)
    number = models.PositiveIntegerField()
    kind = models.CharField(max_length=16, default='main')  # main / bronze
    left_id = models.CharField(max_length=40)
    right_id = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=16, default='pending')
    # Historical evidence only: never used to lock a future match's configuration.
    report = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    played_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['round', 'number'], name='tournament_match_number')]


class TournamentReward(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    tournament = models.ForeignKey(Tournament, on_delete=models.PROTECT, related_name='rewards')
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40)
    place = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=16, default='pending')
    # Persist inputs before asking a model; persist rolls before touching assets.
    plan = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    granted_at = models.DateTimeField(null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['tournament', 'place'], name='tournament_reward_place')]


class TournamentRuntime(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    first_sunday = models.DateField(null=True)
    token = models.CharField(max_length=64, blank=True)
    until = models.DateTimeField(null=True)


class TournamentIntegrity(models.Model):
    id = models.CharField(primary_key=True, max_length=64)  # tournament
    digest = models.CharField(max_length=64)


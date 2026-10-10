"""Synced creative facts are separate from device-local execution permission."""
import uuid
from django.db import models


def new_sprout_id():
    return uuid.uuid4().hex


class Sprout(models.Model):
    id = models.CharField(primary_key=True, max_length=32, default=new_sprout_id)
    owner_id = models.CharField(max_length=80)
    sources = models.JSONField(default=list)
    direction = models.CharField(max_length=500, blank=True, default='')
    model_id = models.CharField(max_length=40, blank=True, default='')
    result = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default='pending')
    article_id = models.CharField(max_length=40, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class SproutJob(models.Model):
    sprout = models.OneToOneField(Sprout, primary_key=True, on_delete=models.CASCADE)
    tools = models.JSONField(default=list)
    state = models.CharField(max_length=20, default='pending')
    stage = models.CharField(max_length=80, default='等待开始')
    error = models.CharField(max_length=200, blank=True, default='')
    token = models.CharField(max_length=32, blank=True, default='')
    expires_at = models.DateTimeField(null=True)
    cancelled = models.BooleanField(default=False)


class MemoCapture(models.Model):
    """An immutable opportunity receipt, including voluntary skips."""
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=80)
    agent_id = models.CharField(max_length=80)
    memo_id = models.CharField(max_length=32, blank=True, default='')
    reason = models.CharField(max_length=300, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)


class MemoCaptureAuthorization(models.Model):
    """An explicit device-local automatic execution switch."""
    task_id = models.CharField(primary_key=True, max_length=40)
    enabled = models.BooleanField(default=False)

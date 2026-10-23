"""Shared model selection and exported device-local field policy."""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from django.apps import apps
from django.db.models import Model
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS, LOCAL_ONLY_SYSTEM_SETTING_KEYS

class SnapshotModels:
    """Configured model selection and device-local export field policy."""

    def __init__(self, target_apps: Iterable[str]) -> None:
        self.target_apps = tuple(target_apps)

    def iter_target_models(self) -> Iterator[type[Model]]:
        yield Group
        yield get_user_model()
        for app_label in self.target_apps:
            app_config = apps.get_app_config(app_label)
            for model in app_config.get_models():
                if model._meta.label_lower in LOCAL_ONLY_MODEL_LABELS:
                    continue
                yield model


    def queryset_for_export(self, model):
        queryset = model.objects.all()
        if model._meta.label_lower == 'system_settings.combatcatalog':
            from system_settings.agent_world.combat.history import runtime_catalog_ids
            queryset = queryset.filter(pk__in=runtime_catalog_ids())
        if model._meta.label_lower == 'system_settings.systemsetting':
            queryset = queryset.exclude(key__in=LOCAL_ONLY_SYSTEM_SETTING_KEYS)
        return queryset


    def drop_local_only_settings(self, data_list):
        filtered = []
        for item in data_list:
            if (
                item.get('model') == 'system_settings.systemsetting'
                and str(item.get('pk')) in LOCAL_ONLY_SYSTEM_SETTING_KEYS
            ):
                continue
            filtered.append(item)
        return filtered


    @staticmethod
    def strip_device_local_user_fields(data_list):
        """不让每台设备独立维护的登录/展示资料进入跨设备快照。"""
        user_label = get_user_model()._meta.label_lower
        for item in data_list:
            fields = item.get('fields') or {}
            if item.get('model') == 'prompts.imagegenerationtask':
                fields.pop('lease_until', None)
            if item.get('model') == user_label:
                fields.pop('email', None)
            elif item.get('model') == 'user.userprofile':
                fields.pop('nickname', None)
        return data_list

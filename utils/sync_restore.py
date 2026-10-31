"""Database restore phase; transaction and post-commit effects remain together."""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Callable
from typing import Protocol
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import serializers
from django.core.management.color import no_style
from django.db import connection, transaction
from django.db.models import PROTECT, CASCADE
from utils.sync_datetime import SyncJSONEncoder
from system_settings.sync_state import LOCAL_ONLY_SYSTEM_SETTING_KEYS, is_tracking_suspended, suspend_tracking
from novel.chapters import enforce_revision_retention as enforce_novel_revision_retention
from system_settings.agent_world import travel_sync
from .sync_policy import SyncError, ensure_not_aborted
from .sync_models import SnapshotModels

class IntegrityGuard(Protocol):
    def __call__(self, label: str, fn: Callable, *, relax: bool): ...


class SnapshotRestorer:
    """Restore records transactionally; the orchestrator holds the domain guards."""

    def __init__(
        self, models: SnapshotModels, is_remote_version_older: Callable[[str], bool],
        integrity_guard: IntegrityGuard,
    ) -> None:
        self.models = models
        self.is_remote_version_older = is_remote_version_older
        self.integrity_guard = integrity_guard

    @staticmethod
    def _restore_device_local_user_fields(data_list):
        """恢复快照中刻意省略的本机用户资料，避免全量反序列化写成默认空值。"""
        User = get_user_model()
        local_emails = dict(User.objects.values_list('username', 'email'))

        from user.models import UserProfile
        local_nicknames = dict(UserProfile.objects.values_list('userid', 'nickname'))

        from prompts.models import ImageGenerationTask
        local_image_leases = dict(ImageGenerationTask.objects.values_list('pk', 'lease_until'))

        user_label = User._meta.label_lower
        for item in data_list:
            fields = item.get('fields') or {}
            if item.get('model') == 'prompts.imagegenerationtask':
                lease = local_image_leases.get(str(item.get('pk')))
                fields['lease_until'] = lease.isoformat() if lease else None
            if item.get('model') == user_label:
                username = fields.get('username')
                if username in local_emails:
                    fields['email'] = local_emails[username]
            elif item.get('model') == 'user.userprofile':
                userid = fields.get('userid')
                if userid in local_nicknames:
                    fields['nickname'] = local_nicknames[userid]
        return data_list


    def _fill_missing_snapshot_fields_from_local(self, data_list, model_map):
        """旧快照没有的字段保留本地值，避免新版本字段被写成模型默认值。"""
        items_by_model = defaultdict(list)
        for item in data_list:
            model = model_map.get(item.get('model'))
            fields = item.get('fields')
            pk = item.get('pk')
            if model is None or pk is None or not isinstance(fields, dict):
                continue
            items_by_model[model].append(item)

        for model, items in items_by_model.items():
            local_objects = model.objects.in_bulk([item.get('pk') for item in items])
            if not local_objects:
                continue
            serialized = {
                str(row['pk']): (row.get('fields') or {})
                for row in json.loads(serializers.serialize('json', list(local_objects.values()), cls=SyncJSONEncoder))
            }
            for item in items:
                local_fields = serialized.get(str(item.get('pk')))
                if not local_fields:
                    continue
                fields = item['fields']
                for field_name, value in local_fields.items():
                    if field_name not in fields:
                        fields[field_name] = value


    def _models_for_stale_cleanup(self):
        """先删引用方；CASCADE 父记录也需等其被 PROTECT 的后代引用解除。"""
        models = list(self.models.iter_target_models())
        model_set = set(models)
        blockers = {model: set() for model in models}

        for model in models:
            for field in model._meta.get_fields():
                if not (getattr(field, 'many_to_one', False) or getattr(field, 'one_to_one', False)):
                    continue
                remote = getattr(field, 'remote_field', None)
                if remote is None or getattr(remote, 'on_delete', None) not in (PROTECT, CASCADE):
                    continue
                target = field.related_model
                if target in model_set and target is not model:
                    blockers[target].add(model)

        remaining = set(models)
        preferred = list(reversed(models))
        ordered = []
        while remaining:
            ready = [
                model for model in preferred
                if model in remaining and not (blockers[model] & remaining)
            ]
            if not ready:
                ready = [model for model in preferred if model in remaining]
            chosen = ready[0]
            ordered.append(chosen)
            remaining.remove(chosen)
        return ordered


    @staticmethod
    def _reset_restored_sequences(models):
        """显式恢复自增主键后同步数据库序列，避免后续新记录撞主键。"""
        statements = connection.ops.sequence_reset_sql(no_style(), models)
        if not statements:
            return
        with connection.cursor() as cursor:
            for statement in statements:
                cursor.execute(statement)


    @staticmethod
    def _lock_restored_sequence_tables(models):
        """PostgreSQL 恢复期间阻止并发写入抢占待校正的自增序列。"""
        if connection.vendor != 'postgresql':
            return
        table_names = {
            model._meta.db_table
            for model in models
            if getattr(model._meta.pk, 'get_internal_type', lambda: '')()
            in {'AutoField', 'BigAutoField', 'SmallAutoField'}
        }
        if not table_names:
            return
        with connection.cursor() as cursor:
            for table_name in sorted(table_names):
                quoted_table = connection.ops.quote_name(table_name)
                cursor.execute(f'LOCK TABLE {quoted_table} IN SHARE ROW EXCLUSIVE MODE')


    def apply_snapshot_data(self, data_list, remote_meta=None, *, full_overwrite=False, should_abort=None, integrity='strict'):
        """把快照写回数据库。full_overwrite 用于整库覆盖。integrity=repair 时领域校验改为提示，写完后由调用方整理。"""
        from system_settings.agent_world.stamina_settings import validate_snapshot as validate_stamina
        validate_stamina(data_list)
        from system_settings.agent_world.combat.history_snapshot import normalize_source, compact_source
        if remote_meta is None or remote_meta.get('combat_schema_version', 0) < 8:
            data_list = compact_source(normalize_source(data_list))
        from system_settings.agent_world.combat.sync import validate_source as validate_combat
        validate_combat(data_list, remote_meta, allow_exploration_review_mismatch=integrity == 'repair')
        from system_settings.agent_world.food_sync import validate_import as validate_food_import
        validate_food_import(data_list, remote_meta)
        relax = integrity == 'repair'

        def guard(label, fn):
            return self.integrity_guard(label, fn, relax=relax)

        expanded = guard('旅行目录', lambda: travel_sync.expand(data_list, remote_meta))
        if expanded is not None:
            data_list = expanded
        from system_settings.agent_world.life_snapshot import normalize_source as normalize_life_source
        normalized = guard('生活摘要', lambda: normalize_life_source(data_list))
        if normalized is not None:
            data_list = normalized
        from system_settings.agent_world.memory.sync import validate_source as validate_memories
        guard('居民记忆', lambda: validate_memories(data_list, remote_meta))
        from article.image_search_service import delete_image_vectors
        from article.models import ImageVisualIndex

        from learning.sync import validate as validate_learning
        guard('学习', lambda: validate_learning(data_list, remote_meta))
        from novel.sync import validate as validate_novel
        guard('小说', lambda: validate_novel(data_list, remote_meta))
        # Quant source versions and attachment ownership cannot be repaired by inference.
        from quant.sync import validate as validate_quant
        validate_quant(data_list, remote_meta)
        from memos.sprout_sync import validate as validate_sprouts
        guard('闪念发芽', lambda: validate_sprouts(data_list, remote_meta))
        from system_settings.agent_world.farm_quality_sync import validate_source as validate_crops
        guard('农场', lambda: validate_crops(data_list, remote_meta))
        from system_settings.agent_world.cooking_quality_sync import validate_source as validate_dishes
        cooking_source_hashes = guard('烹饪', lambda: validate_dishes(data_list, remote_meta)) or {}
        guard('战斗', lambda: validate_combat(data_list, remote_meta))
        from system_settings.agent_world.lottery_sync import validate_source as validate_lottery
        validate_lottery(data_list, remote_meta)
        from system_settings.agent_world.tournament_sync import validate_source as validate_tournaments
        validate_tournaments(data_list, remote_meta)
        from system_settings.agent_world.fishing.sync import validate_source as validate_fishing
        validate_fishing(data_list, remote_meta)
        from system_settings.agent_world.alchemy_quality_sync import validate_source as validate_alchemy
        alchemy_source_hashes = guard('炼金', lambda: validate_alchemy(data_list, remote_meta)) or {}
        from system_settings.agent_world.blacksmith_sync import validate_source as validate_blacksmith
        validate_blacksmith(data_list, remote_meta)

        def check_owner_set(label, meta_key, model_label, message):
            expected = (remote_meta or {}).get(meta_key)
            if expected is None:
                return
            actual = {str(item.get('pk')) for item in data_list if item.get('model') == model_label}
            if set(expected) != actual:
                raise SyncError(message)

        guard('社交', lambda: check_owner_set(
            '社交', 'social_owners', 'system_settings.socialintegrity', '社交快照缺少完整性记录，拒绝恢复',
        ))
        guard('烹饪', lambda: check_owner_set(
            '烹饪', 'cooking_owners', 'system_settings.cookingintegrity', '烹饪快照缺少完整性记录，拒绝恢复',
        ))
        data_list = self.models.drop_local_only_settings(data_list)
        self.models.strip_device_local_user_fields(data_list)
        self._restore_device_local_user_fields(data_list)
        self._reuse_local_builtin_skill_ids(data_list)
        group_id_mapping = self._reuse_local_group_ids(data_list)
        user_id_mapping = self._reuse_local_user_ids(data_list, group_id_mapping)
        self._reuse_local_user_profile_ids(data_list, user_id_mapping)
        from quant.documents.identity import reuse_local_ids as reuse_document_ids
        reuse_document_ids(data_list)
        self._remap_notification_users(data_list, user_id_mapping)
        remote_pk_map = defaultdict(set)
        model_map = {}
        for model in self.models.iter_target_models():
            model_label = f"{model._meta.app_label}.{model._meta.model_name}"
            model_map[model_label] = model

        from learning.sync_lessons import normalize_legacy as normalize_learning
        data_list = normalize_learning(data_list)

        if not full_overwrite:
            from system_settings.agent_world.combat.party_sync import complete_legacy_fields
            complete_legacy_fields(data_list)
            from quant.sync import complete_legacy_fields as complete_quant_fields
            complete_quant_fields(data_list)
            self._fill_missing_snapshot_fields_from_local(data_list, model_map)

        # PromptTemplate points at PromptResultImage, while the result image in
        # turn points at a usage/template. The normal serializer order writes
        # templates before result images, so persist this optional relation only
        # after every prompt record has been restored.
        prompt_cover_links = []
        for item in data_list:
            if item.get('model') != 'prompts.prompttemplate':
                continue
            fields = item.get('fields') or {}
            cover_id = fields.pop('cover_result_image', None)
            if cover_id:
                prompt_cover_links.append((str(item.get('pk')), str(cover_id)))

        for item in data_list:
            model_label = item.get('model')
            pk = item.get('pk')
            if model_label in model_map:
                remote_pk_map[model_label].add(str(pk))

        skip_extra_delete = (not full_overwrite) and self.is_remote_version_older((remote_meta or {}).get('app_version'))
        from system_settings.agent_archive_sync import prepare_restore, release_changed_names, revoke_archived_execution
        from system_settings.decision.restore import policy_defaults
        restored_policy_defaults = policy_defaults(data_list, full_overwrite=full_overwrite)
        agent_rows = prepare_restore(data_list, full_overwrite=full_overwrite, retain_extra=skip_extra_delete)
        restored_models = [
            model_map[model_label]
            for model_label, primary_keys in remote_pk_map.items()
            if primary_keys
        ]
        invalid_image_ids = {
            str(item.get('pk')) for item in data_list
            if item.get('model') == 'article.image' and (item.get('fields') or {}).get('is_valid') is False
        }
        image_vectors_to_remove = dict(
            ImageVisualIndex.objects.filter(image_id__in=invalid_image_ids).exclude(collection_name='')
            .values_list('image_id', 'collection_name')
        ) if invalid_image_ids else {}

        with transaction.atomic(), suspend_tracking():
            ensure_not_aborted(should_abort)
            release_changed_names(agent_rows, retain_extra=skip_extra_delete)
            self._lock_restored_sequence_tables(restored_models)
            from system_settings.token_usage.sync import normalize_restored_usage
            from system_settings.token_usage.capture import active_keys
            active_usage_keys = active_keys()
            normalize_restored_usage(data_list)
            # 默认城市已在本机且值未变时，不做三万多次重复写入。
            unchanged_cities = set(travel_sync.pristine_ids()) if (remote_meta or {}).get(travel_sync.META_KEY) else set()
            _, city_defaults = travel_sync.catalog() if unchanged_cities else ('', {})
            write_data = [item for item in data_list if not (
                item.get('model') == travel_sync.LABEL and str(item.get('pk')) in unchanged_cities
                and travel_sync.pristine(item, city_defaults)
            )]
            # 活跃模型请求可能在快照读取后创建或更新，恢复不能回退它们。
            write_data = [item for item in write_data if not (
                item.get('model') == 'system_settings.agenttokenusage'
                and str(item.get('pk')) in active_usage_keys
            )]
            from system_settings.agent_world.combat.history import prepare_fact_restore
            prepare_fact_restore(write_data)
            for obj in serializers.deserialize('json', json.dumps(write_data)):
                obj.save()
            travel_sync.mark_initialized(remote_meta)

            if prompt_cover_links:
                from prompts.models import PromptTemplate
                for template_id, image_id in prompt_cover_links:
                    PromptTemplate.objects.filter(id=template_id).update(cover_result_image_id=image_id)

            ensure_not_aborted(should_abort)
            if not skip_extra_delete:
                for model in self._models_for_stale_cleanup():
                    model_label = f"{model._meta.app_label}.{model._meta.model_name}"
                    # 兼容旧快照：此前未导出 auth.User，不能在恢复时删除当前登录账号。
                    if model in (Group, get_user_model()) and model_label not in remote_pk_map:
                        continue
                    remote_pks = set(remote_pk_map.get(model_label, set()))
                    if model._meta.label_lower == 'system_settings.systemsetting':
                        remote_pks.update(LOCAL_ONLY_SYSTEM_SETTING_KEYS)
                    local_objects = model.objects.all()
                    if model_label == 'system_settings.agenttokenusage':
                        local_objects = local_objects.exclude(pk__in=active_usage_keys)

                    stale_pks = [
                        str(pk) for pk in local_objects.values_list(model._meta.pk.attname, flat=True)
                        if str(pk) not in remote_pks
                    ]
                    if stale_pks:
                        stale = local_objects.filter(**{f"{model._meta.pk.attname}__in": stale_pks})
                        if model._meta.label_lower == 'article.image':
                            image_vectors_to_remove.update(
                                ImageVisualIndex.objects.filter(image_id__in=stale_pks).exclude(collection_name='')
                                .values_list('image_id', 'collection_name')
                            )
                        if model._meta.label_lower == 'assets.asset':
                            # Remote HTML deletion must also reclaim this device's files.
                            # Keep invalid records until cleanup succeeds, preserving retries.
                            owned = list(stale.filter(metadata__html_import_owned=True))
                            for asset in owned:
                                asset.is_valid = False
                                asset.is_linked = False
                                asset.linked_article = None
                                asset.metadata = {**asset.metadata, 'html_cleanup_pending': True}
                                asset.save()
                            stale = stale.exclude(pk__in=[asset.pk for asset in owned])
                        stale.delete()

            from system_settings.agent_world.cooking_sync import reconcile_cooking
            guard('烹饪恢复', lambda: reconcile_cooking(source_hashes=cooking_source_hashes))
            from system_settings.agent_world.alchemy_sync import reconcile_alchemy
            guard('炼金恢复', lambda: reconcile_alchemy(source_hashes=alchemy_source_hashes))
            from system_settings.agent_world.blacksmith_sync import reconcile as reconcile_blacksmith
            reconcile_blacksmith()
            from memos.sprout_sync import reset_execution as reset_sprouts
            reset_sprouts()
            from learning.sync import reset_execution
            reset_execution()
            from novel.sync import reset_execution as reset_novel_execution
            reset_novel_execution()
            from quant.sync import reset_execution as reset_quant_execution
            reset_quant_execution(upgrade_legacy=(remote_meta or {}).get('quant_schema_version', 0) < 2)
            from system_settings.agent_world.market_sync import reconcile_market
            guard('市场', reconcile_market)
            from system_settings.agent_world.combat.sync import revoke as revoke_combat
            revoke_combat()
            from system_settings.agent_world.investment_sync import reconcile_investments
            guard('投资', reconcile_investments)
            from system_settings.agent_world.farm_sync import reconcile_farms
            guard('农场恢复', reconcile_farms)
            from system_settings.agent_world.farm_quality_sync import normalize_legacy_inventory
            normalize_legacy_inventory()
            from system_settings.agent_world.cooking_quality_sync import normalize_legacy_inventory as normalize_dishes
            normalize_dishes()
            from system_settings.agent_world.cooking_sync import checkpoint_all as checkpoint_cooking
            checkpoint_cooking()
            from system_settings.agent_world.alchemy_sync import checkpoint_all as checkpoint_alchemy
            checkpoint_alchemy()
            from system_settings.agent_world.blacksmith_sync import checkpoint_all as checkpoint_blacksmith
            checkpoint_blacksmith()
            from system_settings.agent_world.market_sync import end_restored_sessions, refresh_restored_checkpoints
            end_restored_sessions()
            refresh_restored_checkpoints()
            from system_settings.agent_world.settlement import reconcile_awards
            guard('结算', reconcile_awards)
            from system_settings.agent_world.lottery_sync import reconcile as reconcile_lottery
            reconcile_lottery()
            from system_settings.agent_world.tournament_sync import reconcile as reconcile_tournaments, revoke as revoke_tournaments
            revoke_tournaments()
            reconcile_tournaments()
            from system_settings.agent_world.fishing.sync import reconcile as reconcile_fishing
            reconcile_fishing()
            from system_settings.agent_world.life_sync import reconcile_life
            guard('生活恢复', reconcile_life)
            from system_settings.agent_world.social_sync import reconcile_social
            guard('社交恢复', reconcile_social)
            # Validate the original source first. Adding legacy policy defaults earlier
            # would change LifeConfig's fingerprint and reject valid old snapshots.
            from system_settings.decision.restore import normalize_policy
            normalize_policy(restored_policy_defaults)
            from system_settings.agent_world.publish_media import reset_photo_runtime
            reset_photo_runtime()
            from system_settings.models import AgentMemoryLease
            AgentMemoryLease.objects.all().update(token='', until=None)
            revoke_archived_execution()
            if not any(item.get('model', '').startswith('system_settings.social') for item in data_list):
                from system_settings.agent_world.social_migration import seed_legacy_relations
                seed_legacy_relations()
            self._reset_restored_sequences(restored_models)
            travel_sync.record_missing()

            if image_vectors_to_remove:
                ImageVisualIndex.objects.filter(image_id__in=image_vectors_to_remove).update(enabled=False, error='')
                # 外部 Chroma 写入必须晚于数据库提交；回滚时保留原索引。
                transaction.on_commit(lambda vectors=dict(image_vectors_to_remove): delete_image_vectors(vectors), robust=True)
            from article.html_note_resources import retry_html_cleanup
            transaction.on_commit(retry_html_cleanup)

        if not is_tracking_suspended():
            from article.version_service import enforce_article_version_retention
            enforce_article_version_retention()
            enforce_novel_revision_retention()

        return len(data_list)


    @staticmethod
    def _reuse_local_builtin_skill_ids(data_list):
        """将快照内置 Skill 映射到本地已有记录，避免启动初始化产生同名冲突。"""
        from system_settings.models import Skill

        skill_id_mapping = {}
        for item in data_list:
            if item.get('model') != 'system_settings.skill':
                continue

            fields = item.get('fields') or {}
            skill_key = fields.get('skill_key') or ''
            is_builtin = (
                fields.get('is_system')
                or fields.get('source') == 'built_in'
                or bool(skill_key)
            )
            if not is_builtin:
                continue

            existing = None
            if skill_key:
                existing = Skill.objects.filter(skill_key=skill_key).first()
            if not existing and fields.get('name'):
                # 兼容早期内置 Skill 尚未写入 skill_key 的数据。
                existing = Skill.objects.filter(name=fields['name']).first()

            remote_id = str(item.get('pk'))
            if existing and str(existing.pk) != remote_id:
                skill_id_mapping[remote_id] = str(existing.pk)
                item['pk'] = str(existing.pk)

        if not skill_id_mapping:
            return

        for item in data_list:
            if item.get('model') != 'system_settings.agent':
                continue

            fields = item.get('fields') or {}
            skills = fields.get('skills')
            if isinstance(skills, list):
                fields['skills'] = [skill_id_mapping.get(str(skill_id), skill_id) for skill_id in skills]


    @staticmethod
    def _reuse_local_group_ids(data_list):
        """按组名复用本地用户组，并返回远端到本地的主键映射。"""
        group_label = Group._meta.label_lower
        used_ids = set(Group.objects.values_list('pk', flat=True))
        next_id = max(used_ids, default=0) + 1
        group_id_mapping = {}

        for item in data_list:
            if item.get('model') != group_label:
                continue

            fields = item.get('fields') or {}
            group_name = fields.get('name')
            remote_id = item.get('pk')
            if remote_id is None or not group_name:
                continue

            local_group = Group.objects.filter(name=group_name).first()
            if local_group:
                local_id = local_group.pk
            elif remote_id in used_ids:
                local_id = next_id
                next_id += 1
            else:
                local_id = remote_id

            group_id_mapping[str(remote_id)] = local_id
            item['pk'] = local_id
            used_ids.add(local_id)

        return group_id_mapping


    @staticmethod
    def _reuse_local_user_ids(data_list, group_id_mapping):
        """按用户名复用本地用户，并保留当前初始化管理员的密码。"""
        User = get_user_model()
        user_label = User._meta.label_lower
        used_ids = set(User.objects.values_list('pk', flat=True))
        next_id = max(used_ids, default=0) + 1
        user_id_mapping = {}

        for item in data_list:
            if item.get('model') != user_label:
                continue

            fields = item.get('fields') or {}
            username = fields.get('username')
            remote_id = item.get('pk')
            if remote_id is None or not username:
                continue

            local_user = User.objects.filter(username=username).first()
            if local_user:
                local_id = local_user.pk
                if local_user.is_superuser:
                    fields['password'] = local_user.password
            elif remote_id in used_ids:
                local_id = next_id
                next_id += 1
            else:
                local_id = remote_id

            user_id_mapping[str(remote_id)] = local_id
            item['pk'] = local_id
            used_ids.add(local_id)

            groups = fields.get('groups')
            if isinstance(groups, list):
                fields['groups'] = [group_id_mapping.get(str(group_id), group_id) for group_id in groups]

        return user_id_mapping


    @staticmethod
    def _reuse_local_user_profile_ids(data_list, user_id_mapping):
        """按业务用户 ID 复用本地 Profile，避免跨环境使用自增用户 ID。"""
        from user.models import UserProfile

        for item in data_list:
            if item.get('model') != 'user.userprofile':
                continue

            fields = item.get('fields') or {}
            userid = fields.get('userid') or ''
            if not userid:
                continue

            local_profile = UserProfile.objects.filter(userid=userid).first()
            if local_profile:
                # UserProfile 对 auth.User 是一对一关系，主键和外键都必须复用本地记录。
                item['pk'] = local_profile.pk
                fields['user'] = local_profile.user_id
                continue

            remote_user_id = str(fields.get('user'))
            if remote_user_id in user_id_mapping:
                fields['user'] = user_id_mapping[remote_user_id]


    @staticmethod
    def _remap_notification_users(data_list, user_id_mapping):
        """通知的用户外键跟随跨设备用户名映射，不能直接使用远端自增 ID。"""
        for item in data_list:
            if item.get('model') != 'message.notification':
                continue
            fields = item.get('fields') or {}
            remote_user_id = str(fields.get('user'))
            if remote_user_id in user_id_mapping:
                fields['user'] = user_id_mapping[remote_user_id]

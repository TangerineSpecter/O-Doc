"""一次性修复旧库的农场目录与生活摘要，使手动上传的来源校验通过。

默认只预览（不写库、不写备份）；--apply 先备份再在同一事务内修复，最后按手动上传同样的校验函数复查，
未通过则整体回滚。无法映射的数据只报告，只有显式 --drop-unmappable 才会移除并逐条列出。
"""
import json
import os
import sqlite3
from pathlib import Path

from django.conf import settings
from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from system_settings.agent_world.farm_catalog import DEFAULT_RULES, normalized_rules
from system_settings.agent_world.farm_gate import farm_gate
from system_settings.agent_world.farm_models import AgentFarm, FarmCatalog
from system_settings.agent_world.life_config import DEFAULTS
from system_settings.agent_world.life_models import (
    LifeConfig, LifeCycle, LifeGoal, LifeIntegrity, LifeItem, LifeProfile,
)
from system_settings.agent_world.life_sync import fingerprints


def sku_kind(value) -> str | None:
    """与 farm_plan_inventory.seed_sku 相同的 SKU 解析，只取作物标识。"""
    if not isinstance(value, str):
        return None
    return value.split('.', 1)[1] if value.startswith(('seed.', 'crop.')) else value


def entry_lists(farm: AgentFarm, items: dict) -> list[tuple[str, list]]:
    """队列里所有保存了种植项目的位置：当前项目、各版本及生活安排里的原始依据。"""
    found = []
    for pid, plan in (farm.state.get('planting_plans') or {}).items():
        where = f"居民{farm.pk}的{plan.get('day', '未知日期')}计划"
        found.append((where, plan.get('entries') or []))
        found.extend((where, version.get('entries') or []) for version in plan.get('versions') or [])
        item = items.get(plan.get('item_id'))
        if item:
            sources = item.context.get('farm_plan_sources')
            for source in [*(sources.values() if isinstance(sources, dict) else []), item.context.get('farm_plan_source')]:
                if isinstance(source, dict) and source.get('id') == pid:
                    found.append((where, source.get('entries') or []))
    return found


def life_owners() -> set[str]:
    owners = set(LifeConfig.objects.values_list('pk', flat=True))
    for model in (LifeProfile, LifeGoal, LifeCycle, LifeItem):
        owners.update(model.objects.values_list('owner_id', flat=True))
    return owners


def analyze() -> dict:
    """只读检查；SKU 是否可解析分别按库中目录和补齐后的目录判断。"""
    catalogs = {c.pk: c for c in FarmCatalog.objects.all()}
    report = {'catalogs': [], 'missing_catalog_owners': [], 'queue': [], 'life': {}}
    for owner, catalog in catalogs.items():
        rules = catalog.rules
        if not isinstance(rules, dict):
            report['catalogs'].append({'owner': owner, 'invalid': True, 'crops': [], 'fertilizers': [], 'item_icons': False})
            continue
        report['catalogs'].append({
            'owner': owner, 'invalid': False,
            'crops': [k for k in DEFAULT_RULES['crops'] if k not in (rules.get('crops') or {})],
            'fertilizers': [k for k in DEFAULT_RULES['fertilizers'] if k not in (rules.get('fertilizers') or {})],
            'item_icons': 'item_icons' not in rules,
        })
    items = {i.pk: i for i in LifeItem.objects.all()}
    for farm in AgentFarm.objects.all():
        if not farm.state.get('planting_plans'):
            continue
        if farm.owner_id not in catalogs:
            report['missing_catalog_owners'].append(farm.owner_id)
        stored = set((catalogs[farm.owner_id].rules.get('crops') or {})) if farm.owner_id in catalogs and isinstance(catalogs[farm.owner_id].rules, dict) else set()
        for where, entries in entry_lists(farm, items):
            for entry in entries:
                kind = sku_kind(entry.get('sku') if isinstance(entry, dict) else None)
                if kind in stored:
                    continue
                report['queue'].append({'where': where, 'farm': farm.pk, 'entry': entry.get('id') if isinstance(entry, dict) else None,
                                        'sku': entry.get('sku') if isinstance(entry, dict) else entry,
                                        'fixable': kind in DEFAULT_RULES['crops']})
    owners = life_owners()
    digests = {d.pk: d for d in LifeIntegrity.objects.all()}
    report['life'] = {
        'missing_config': sorted(o for o in owners if not LifeConfig.objects.filter(pk=o).exists()),
        'missing_digest': sorted(o for o in owners if o not in digests),
        'stale_digest': sorted(set(digests) - owners),
        'mismatched_digest': {o: [k for k, v in fingerprints(o).items() if digests[o].hashes.get(k) != v]
                              for o in sorted(owners & set(digests)) if LifeConfig.objects.filter(pk=o).exists() and digests[o].hashes != fingerprints(o)},
    }
    return report


def render(report: dict, out) -> None:
    out.write('== 农场目录（FarmCatalog）==')
    for row in report['catalogs']:
        if row['invalid']:
            out.write(f"  账号{row['owner']}：目录不是有效对象，需人工检查（脚本不改动）")
        elif row['crops'] or row['fertilizers'] or row['item_icons']:
            out.write(f"  账号{row['owner']}：缺少作物 {row['crops'] or '无'}；缺少肥料 {row['fertilizers'] or '无'}；缺少 item_icons {'是' if row['item_icons'] else '否'}")
        else:
            out.write(f"  账号{row['owner']}：完整")
    if not report['catalogs']:
        out.write('  没有目录记录')
    out.write('== 种植队列引用（按库中目录判断）==')
    for row in report['queue']:
        out.write(f"  {row['where']} 项目{row['entry']} SKU={row['sku']!r}：{'补齐目录后可解析' if row['fixable'] else '无法映射（目录和内置作物中都没有）'}")
    for owner in report['missing_catalog_owners']:
        out.write(f'  账号{owner}有种植队列但没有目录记录（运行时会按默认值创建，--apply 同样创建）')
    if not report['queue'] and not report['missing_catalog_owners']:
        out.write('  无问题')
    life = report['life']
    out.write('== 生活账号 ==')
    out.write(f"  缺少 LifeConfig：{life['missing_config'] or '无'}")
    out.write(f"  缺少摘要：{life['missing_digest'] or '无'}")
    out.write(f"  无对应记录的遗留摘要：{life['stale_digest'] or '无'}")
    out.write(f"  摘要与记录不一致：{life['mismatched_digest'] or '无'}")


def pending(report: dict) -> bool:
    life = report['life']
    return bool(any(r['invalid'] or r['crops'] or r['fertilizers'] or r['item_icons'] for r in report['catalogs'])
                or report['queue'] or report['missing_catalog_owners']
                or life['missing_config'] or life['missing_digest'] or life['stale_digest'] or life['mismatched_digest'])


def backup_sqlite(stamp: str) -> Path | None:
    engine = connection.settings_dict
    if 'sqlite3' not in engine['ENGINE'] or not Path(str(engine['NAME'])).is_file():
        return None
    source = Path(str(engine['NAME']))
    target = source.with_name(f'{source.name}.bak-{stamp}')
    if target.exists():
        raise CommandError(f'数据库备份已存在，拒绝覆盖：{target}')
    with sqlite3.connect(source) as src, sqlite3.connect(target) as dst:
        src.backup(dst)
    return target


def write_rows_backup(path: Path, querysets: list) -> None:
    rows = [json.loads(serializers.serialize('json', qs)) for qs in querysets]
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump([row for part in rows for row in part], handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
    except OSError as exc:
        raise CommandError(f'备份失败，未写入数据库：{exc}') from exc


def drop_unmappable(report: dict, out) -> int:
    """只移除仍无法解析、未播种且没有对应操作的项目；各处副本同步删除并重排 priority。"""
    from system_settings.agent_world.farm_models import FarmOperation
    dropped = 0
    unknown = {(r['farm'], r['entry']) for r in report['queue'] if not r['fixable']}
    items = {i.pk: i for i in LifeItem.objects.all()}
    for farm in AgentFarm.objects.select_for_update().filter(pk__in={f for f, _ in unknown}):
        changed_items = {}
        for pid, plan in farm.state['planting_plans'].items():
            drop = {entry['id'] for entry in plan['entries'] if (farm.pk, entry['id']) in unknown}
            used = {op.result.get('planting_entry_id') for op in FarmOperation.objects.filter(farm=farm)}
            for entry_id in sorted(drop):
                if plan['progress'].get(entry_id) or entry_id in used:
                    raise CommandError(f'居民{farm.pk}的项目{entry_id}已有播种记录，不能删除；请人工处理')
            if not drop:
                continue
            holders = [plan, *plan['versions']]
            item = items.get(plan.get('item_id'))
            if item:
                sources = item.context.get('farm_plan_sources')
                holders += [s for s in [*(sources.values() if isinstance(sources, dict) else []), item.context.get('farm_plan_source')]
                            if isinstance(s, dict) and s.get('id') == pid]
                changed_items[item.pk] = item
            for holder in holders:
                holder['entries'] = [e for e in holder['entries'] if e['id'] not in drop]
                for index, entry in enumerate(holder['entries']):
                    entry['priority'] = index
            for entry_id in drop:
                plan['progress'].pop(entry_id, None)
                out.write(f"  已移除：居民{farm.pk} 计划{plan['day']} 项目{entry_id}")
                dropped += 1
        farm.save(update_fields=['state'])
        for item in changed_items.values():
            item.save(update_fields=['context'])
    return dropped


def repair() -> list[str]:
    """修复库内数据；返回逐条动作，供报告和测试使用。"""
    actions = []
    for catalog in FarmCatalog.objects.select_for_update().all():
        if not isinstance(catalog.rules, dict):
            continue
        fixed = normalized_rules(catalog.rules)
        if fixed != catalog.rules:
            actions.append(f'补齐目录 账号{catalog.pk}')
            catalog.rules = fixed
            catalog.save(update_fields=['rules', 'updated_at'])
    from system_settings.agent_world.farm_catalog import catalog_for
    for farm in AgentFarm.objects.all():
        if farm.state.get('planting_plans') and not FarmCatalog.objects.filter(pk=farm.owner_id).exists():
            catalog_for(farm.owner_id)
            actions.append(f'创建缺失目录 账号{farm.owner_id}')
    owners = life_owners()
    for owner in sorted(owners):
        if not LifeConfig.objects.filter(pk=owner).exists():
            LifeConfig.objects.create(pk=owner, settings=dict(DEFAULTS))
            actions.append(f'补建默认 LifeConfig 账号{owner}')
        hashes = fingerprints(owner)
        digest, created = LifeIntegrity.objects.get_or_create(pk=owner, defaults={'hashes': hashes})
        if created:
            actions.append(f'补建摘要 账号{owner}')
        elif digest.hashes != hashes:
            digest.hashes = hashes
            digest.save(update_fields=['hashes', 'updated_at'])
            actions.append(f'刷新摘要 账号{owner}')
    for owner in sorted(set(LifeIntegrity.objects.values_list('pk', flat=True)) - owners):
        LifeIntegrity.objects.filter(pk=owner).delete()
        actions.append(f'清理无对应记录的遗留摘要 账号{owner}')
    return actions


def upload_check() -> str | None:
    """复用手动上传的本机快照构建与来源校验；返回 None 表示通过，否则返回错误信息。"""
    from utils.sync_manager import SyncManager, SyncError
    from system_settings.agent_world.combat.sync import normalize_exploration_reviews
    try:
        manager = SyncManager()
        data = manager.build_snapshot_data(compact_travel=True, allow_exploration_review_mismatch=True)
        manager._validate_force_overwrite_source(normalize_exploration_reviews(data))
    except SyncError as exc:
        return str(exc)
    return None


class Command(BaseCommand):
    help = '预览/修复旧库中缺少内置作物的农场目录、种植队列引用及生活配置摘要；默认只预览，--apply 先备份再写入'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='执行修复；省略则只预览')
        parser.add_argument('--backup', help='行级 JSON 备份文件（不得已存在）；默认写入 SYSTEM_LOG_DIR/catalog-repair-backups/')
        parser.add_argument('--drop-unmappable', action='store_true', help='移除无法映射且尚未播种的队列项目，逐条列出；默认只报告')

    def handle(self, *args, **options):
        apply = options['apply']
        if options['drop_unmappable'] and not apply:
            raise CommandError('--drop-unmappable 必须与 --apply 同时使用')
        out = self.stdout
        with farm_gate():
            report = analyze()
            render(report, out)
            unmappable = [r for r in report['queue'] if not r['fixable']]
            if not apply:
                # 校验会刷新生活摘要，演练在事务内执行后回滚，保证不写库。
                with transaction.atomic():
                    error = upload_check()
                    transaction.set_rollback(True)
                out.write(f"预览：上传校验（按当前库、含运行时补齐）{'PASS' if error is None else 'FAIL：' + error}；未写库。"
                          + ('确认无误后加 --apply 把上述缺失项写回库。' if pending(report) else '库内数据已完整，无需修复。'))
                if unmappable:
                    out.write(f'注意：{len(unmappable)} 个队列项目无法映射，--apply 不会改动它们，上传仍会失败；可先人工核对，或明确加 --drop-unmappable。')
                return
            if not pending(report):
                with transaction.atomic():
                    error = upload_check()
                    transaction.set_rollback(True)
                if error is not None:
                    raise CommandError(f'库内数据已完整，但上传校验仍失败（需人工排查）：{error}')
                out.write(self.style.SUCCESS('无需改动，未写库；上传校验 PASS。'))
                return
            stamp = timezone.now().strftime('%Y%m%d-%H%M%S')
            copied = backup_sqlite(stamp)
            if copied:
                out.write(f'SQLite 备份：{copied}')
            else:
                out.write('提示：非 SQLite 数据库，请确认已执行 pg_dump；此处仅写入受影响记录的行级备份。')
            rows = [FarmCatalog.objects.all(), LifeConfig.objects.all(), LifeIntegrity.objects.all()]
            if options['drop_unmappable']:
                rows += [AgentFarm.objects.all(), LifeItem.objects.all()]
            path = Path(options['backup']).expanduser().resolve() if options['backup'] else \
                Path(settings.SYSTEM_LOG_DIR).expanduser().resolve() / 'catalog-repair-backups' / f'repair-{stamp}.json'
            write_rows_backup(path, rows)
            out.write(f'行级备份（可用 loaddata 恢复）：{path}')
            with transaction.atomic():
                actions = repair()
                if options['drop_unmappable']:
                    if drop_unmappable(analyze(), out):
                        actions.append('移除无法映射的队列项目')
                for line in actions or ['（无需改动）']:
                    out.write('  ' + line)
                error = upload_check()
                if error is not None:
                    hint = f'；其中无法映射的队列项目 {len(unmappable)} 个，需人工核对或加 --drop-unmappable' if unmappable else ''
                    raise CommandError(f'修复后上传校验仍失败，已整体回滚：{error}{hint}')
            out.write(self.style.SUCCESS('上传校验 PASS，修复已提交。'))
            render(analyze(), out)

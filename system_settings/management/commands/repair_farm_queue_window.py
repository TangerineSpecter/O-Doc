"""一次性把越界播种对齐到上传校验的开工窗口。默认只预览。"""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from system_settings.agent_world.farm_gate import farm_gate
from system_settings.agent_world.farm_models import AgentFarm, FarmOperation
from system_settings.agent_world.farm_queue_window_repair import apply_fixes, collect, recheck, render
from system_settings.management.commands.repair_agent_world_catalog import backup_sqlite, write_rows_backup
from system_settings.models import WorldAction


class Command(BaseCommand):
    help = '预览/修复「播种不在已激活计划的活动时段内」。默认只预览；--apply 先备份，只前移开工标记或收拢超过截止的播种时间，并保持原有 validate_queue'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='写入修复；省略则只预览')
        parser.add_argument('--agent', help='只处理该居民，例如 agent_yTiYFkvQZO')
        parser.add_argument('--day', help='只处理该计划日，格式 YYYY-MM-DD，例如 2026-10-13')
        parser.add_argument('--all', action='store_true', help='--apply 时处理所有越界计划；省略则 --apply 必须带 --agent')
        parser.add_argument('--backup', help='行级 JSON 备份路径（不得已存在）')

    def handle(self, *args, **options):
        agent, day, apply = options['agent'], options['day'], options['apply']
        if day and len(day) != 10:
            raise CommandError('--day 须为 YYYY-MM-DD')
        if apply and not agent and not options['all']:
            raise CommandError('为避免误改其他居民，--apply 必须指定 --agent，或在看完预览后加 --all')
        with farm_gate():
            if agent and not AgentFarm.objects.filter(pk=agent).exists():
                raise CommandError(f'没有居民 {agent}')
            found = collect(agent, day)
            if day and agent and not any(plan.get('day') == day for plan in (AgentFarm.objects.get(pk=agent).state.get('planting_plans') or {}).values()):
                raise CommandError(f'居民{agent}没有{day}的种植计划')
            render(found, self.stdout)
            if not apply:
                fixable = [item for item in found if item['ok']]
                blocked = [item for item in found if not item['ok']]
                if not found:
                    self.stdout.write('预览：无需修复，未写库。')
                else:
                    self.stdout.write(f'预览：{len(fixable)} 个计划可修复，{len(blocked)} 个不能安全修复；未写库。'
                                      '确认后加 --agent 与 --day（或 --all）以及 --apply。')
                    if blocked:
                        self.stdout.write('不能安全修复的计划在 --apply 时会整批拒绝，避免只改一半后上传仍失败。')
                return
            blocked = [item for item in found if not item['ok']]
            if blocked:
                raise CommandError('存在不能安全修复的计划，未写库：' + '；'.join(item['where'] + ' ' + item['reason'] for item in blocked))
            if not found:
                self.stdout.write(self.style.SUCCESS('无需改动，未写库。'))
                return
            stamp = timezone.now().strftime('%Y%m%d-%H%M%S-%f')
            copied = backup_sqlite(stamp)
            if copied:
                self.stdout.write(f'SQLite 备份：{copied}')
            else:
                self.stdout.write('提示：非 SQLite 数据库，请确认已执行 pg_dump；此处仅写入受影响记录的行级备份。')
            farm_ids = sorted({item['farm_id'] for item in found})
            path = Path(options['backup']).expanduser().resolve() if options['backup'] else \
                Path(settings.SYSTEM_LOG_DIR).expanduser().resolve() / 'queue-window-repair-backups' / f'window-{stamp}.json'
            write_rows_backup(path, [
                AgentFarm.objects.filter(pk__in=farm_ids),
                FarmOperation.objects.filter(farm_id__in=farm_ids),
                WorldAction.objects.filter(actor_id__in=farm_ids),
            ])
            self.stdout.write(f'行级备份（可用 loaddata 恢复）：{path}')
            with transaction.atomic():
                current = collect(agent, day, lock=True)
                if [item['plan_id'] for item in current] != [item['plan_id'] for item in found] or any(not item['ok'] for item in current):
                    raise CommandError('预览之后数据已变化，已回滚。请重新预览后再 --apply')
                try:
                    for line in apply_fixes(current):
                        self.stdout.write('  ' + line)
                except ValueError as exc:
                    raise CommandError(str(exc)) from exc
                error = recheck(farm_ids)
                if error:
                    raise CommandError(f'修复后队列校验仍失败，已整体回滚：{error}')
            self.stdout.write(self.style.SUCCESS('队列校验 PASS，修复已提交。'))

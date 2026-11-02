"""Inspect source volume and legacy boundaries without changing business data."""
import json

from django.core.management.base import BaseCommand

from system_settings.agent_world.combat.backfill_inventory import inventory


class Command(BaseCommand):
    help = '只读盘点本机战斗来源、旧归档边界及结束时间；不进行回填或清理。'

    def add_arguments(self, parser):
        parser.add_argument('--owner', default='', help='只盘点指定账号；默认盘点所有账号')

    def handle(self, *args, **options):
        self.stdout.write(json.dumps(inventory(options['owner'] or None), ensure_ascii=False, indent=2))

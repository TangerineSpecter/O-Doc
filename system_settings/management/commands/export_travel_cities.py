from pathlib import Path
from zipfile import BadZipFile
import csv

from django.core.management.base import BaseCommand, CommandError
from system_settings.agent_world.travel_csv import export_city_template


class Command(BaseCommand):
    help = '从本地 GeoNames 原始文件导出城市 CSV 模板；价格留空，不调用 AI，不写数据库'

    def add_arguments(self, parser):
        parser.add_argument('--data-dir', required=True, type=Path)
        parser.add_argument('--output', required=True, type=Path)

    def handle(self, *args, **options):
        output = options['output']
        if output.exists():
            raise CommandError('输出文件已存在，请使用其他路径，避免覆盖已填写价格的文件')
        try:
            stats = export_city_template(options['data_dir'], output)
        except (OSError, ValueError, BadZipFile, csv.Error) as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f'已导出 {stats["cities"]} 个城市，{stats["countries"]} 个国家/地区；'
            f'{stats["cities_with_chinese_name"]} 个城市有中文别名。文件：{output}'))

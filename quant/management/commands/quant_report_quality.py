"""Offline quality baseline tooling; never starts a model or platform worker."""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ObjectDoesNotExist

from quant.quality.corpus import inputs, suite
from quant.quality.evaluation import evaluate, read_json, records
from quant.quality.reviews import review_template


class Command(BaseCommand):
    help = "导出固定质量样例/已完成报告，生成逐项复核表，或评估离线回答；不调用模型"
    requires_system_checks = []

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument("--export-inputs", action="store_true")
        mode.add_argument("--export-run")
        mode.add_argument("--review-template", action="store_true")
        mode.add_argument("--evaluate", action="store_true")
        parser.add_argument("--responses")
        parser.add_argument("--reviews")
        parser.add_argument("--case")
        parser.add_argument("--repeat", type=int)
        parser.add_argument("--output")

    def handle(self, *args, **options):
        try:
            packet = read_json(options["responses"]) if options["responses"] else {"version": 1, "suite_hash": suite()["suite_hash"], "records": []}
            if options["export_inputs"]:
                result = inputs()
            elif options["export_run"]:
                if not options["case"] or type(options["repeat"]) is not int:
                    raise ValueError("导出运行需要 --case 和 --repeat")
                from quant.quality.exporting import export_run
                result = {**packet, "records": [*records(packet), export_run(options["export_run"], options["case"], options["repeat"])]}
                records(result)
            elif options["review_template"]:
                result = review_template(suite(), records(packet))
            else:
                result = evaluate(packet, read_json(options["reviews"]) if options["reviews"] else None)
            text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
            if options["output"]:
                # Explicit fresh files keep prior baselines/annotations intact.
                with Path(options["output"]).open("x", encoding="utf-8") as stream:
                    stream.write(text)
                self.stdout.write("已写入质量评测文件；没有触发模型、实验或同步。")
            else:
                self.stdout.write(text, ending="")
        except (OSError, ValueError, TypeError, KeyError, RecursionError, ObjectDoesNotExist) as exc:
            raise CommandError("质量评测未完成：输入、文件或记录不符合合同。") from exc

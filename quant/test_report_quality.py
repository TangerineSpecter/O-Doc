"""Baseline machinery tests use synthetic answers, never claim model quality."""
import copy
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase

from quant.quality.corpus import inputs, suite
from quant.quality.evaluation import evaluate, read_json, records
from quant.quality.metrics import default_equal
from quant.quality.reviews import review_template
from quant.research.analysis import DIMENSIONS
from quant.research.contracts import digest
from quant.test_research_analysis import result


def answer(case, repeat=1, score=3):
    value = result()
    value.update(kind=case["kind"] or "factor", parameters=[], factors=[])
    for param in case["parameters"]:
        value["parameters"].append(dict(name=param["name"], type="reference", default_value=param["default"],
            category=param["category"], meaning="仅机械评测样例", constraints="未证实范围", effect="待验证", suggestion="另做实验", evidence="固定样例"))
    for row in value["scores"]:
        row["score"] = score if case["source"]["code"] else None
    record = {"case_id": case["id"], "repeat": repeat, "run_id": f"synthetic-{case['id']}-{repeat}",
            "source_hash": case["source_hash"], "status": "completed", "origin": "synthetic", "fresh_model_calls": True,
            "context": {"model_key": "test-only", "configuration_hash": "synthetic", "evidence_context_hash": "empty", "workflow_version": 12},
            "analysis": value}
    if case["expected_outcome"] == "acquisition_blocked":
        record.update(status="failed", block_reason="source_acquisition_failed", fresh_model_calls=False)
        record.pop("analysis")
    return record


def packet(rows):
    return {"version": 1, "suite_hash": suite()["suite_hash"], "records": rows}


class ReportQualityTests(SimpleTestCase):
    def test_corpus_and_export_hide_reference_labels(self):
        reference = suite()
        self.assertEqual(len(reference["cases"]), 6)
        self.assertEqual(reference["label_status"], "draft_ai_authored_requires_expert_review")
        for case in reference["cases"]:
            self.assertEqual(digest(case["source"]), case["source_hash"])
            for row in case["facts"]:
                if row["source"]:
                    self.assertIn(row["source"]["quote"], case["source"][row["source"]["field"]])
        exported = inputs()
        self.assertEqual(exported["suite_hash"], reference["suite_hash"])
        self.assertEqual(set(exported["cases"][0]), {"id", "source", "source_hash"})

    def test_empty_failed_and_invalid_are_visible_not_zero_quality(self):
        value = evaluate(packet([]))
        self.assertEqual(sum(c["missing_required_repeats"] for c in value["coverage"]), 18)
        self.assertFalse(value["complete_same_context_baseline"])
        row = answer(suite()["cases"][0]); row["status"] = "failed"; row.pop("analysis")
        other = answer(suite()["cases"][1]); other["analysis"] = {}
        evaluated = evaluate(packet([row, other]))
        self.assertEqual([r["mechanical"]["failure"] for r in evaluated["records"]], ["failed", "production_contract_rejected"])
        self.assertTrue(all(g["fresh_completed"] == 0 for g in evaluated["score_stability"]))

    def test_parameter_defaults_categories_duplicates_and_extra_names(self):
        case = suite()["cases"][0]; row = answer(case)
        row["analysis"]["parameters"][0]["default_value"] = "14"
        row["analysis"]["parameters"][2]["category"] = "signal"
        row["analysis"]["parameters"].append({**row["analysis"]["parameters"][0], "name": "Invented"})
        result = evaluate(packet([row]))["records"][0]["mechanical"]["parameters"]
        self.assertEqual(result["recall"], 1)
        self.assertEqual(result["wrong_defaults"], ["RSIlength"])
        self.assertEqual(result["wrong_categories"], ["ShowBands"])
        self.assertEqual(result["unlabelled_names_require_review"], ["Invented"])
        self.assertAlmostEqual(result["reference_precision"], 6 / 7, places=6)
        row["analysis"]["parameters"].append(copy.deepcopy(row["analysis"]["parameters"][0]))
        result = evaluate(packet([row]))["records"][0]["mechanical"]["parameters"]
        self.assertEqual(result["duplicate_names"], ["RSIlength"])
        self.assertIn("RSIlength", result["missing_or_duplicate"])
        self.assertTrue(default_equal("2.00", "2")); self.assertTrue(default_equal("True", "true"))
        self.assertFalse(default_equal("NaN", "NaN"))

    def test_fresh_contexts_origins_and_unknown_scores_not_pooled(self):
        case = suite()["cases"][0]
        rows = [answer(case, i, i) for i in range(1, 4)]
        repeated = evaluate(packet(rows))["score_stability"][0]
        self.assertTrue(repeated["minimum_repeats_met"])
        self.assertEqual(repeated["dimensions"][DIMENSIONS[0]]["range"], 2)
        rows[2]["context"]["evidence_context_hash"] = "other-history"
        self.assertFalse(any(g["minimum_repeats_met"] for g in evaluate(packet(rows))["score_stability"]))
        rows[2] = answer(case, 3); rows[2]["origin"] = "provider_recorded"
        self.assertEqual(len(evaluate(packet(rows))["score_stability"]), 2)
        rows[2] = answer(case, 3); rows[2]["fresh_model_calls"] = False
        self.assertEqual(evaluate(packet(rows))["score_stability"][0]["fresh_completed"], 2)
        unknown = evaluate(packet([answer(suite()["cases"][1], i, None) for i in range(1, 4)]))
        self.assertTrue(unknown["records"][0]["mechanical"]["all_scores_unknown"])
        self.assertIsNone(unknown["score_stability"][0]["dimensions"]["total_score"]["population_stddev"])

    def test_url_without_body_is_acquisition_control_not_fabricated_report(self):
        case = suite()["cases"][-1]
        rows = [answer(case, i) for i in range(1, 4)]
        result = evaluate(packet(rows))
        self.assertEqual(result["coverage"][-1]["matched_acquisition_controls"], 3)
        self.assertEqual(result["score_stability"], [])
        self.assertEqual(result["records"][0]["human"]["status"], "not_required_acquisition_control")
        rows[0].update(status="completed", analysis=answer(suite()["cases"][0])["analysis"])
        bad = evaluate(packet(rows))
        self.assertEqual(bad["records"][0]["mechanical"]["failure"], "negative_control_not_blocked")

    def test_hash_and_duplicate_guards(self):
        row = answer(suite()["cases"][0])
        current = copy.deepcopy(row); current["context"]["workflow_version"] = 14
        self.assertFalse(evaluate(packet([current]))["records"][0]["mechanical"]["schema_valid"])
        current["analysis"]["source_findings_version"] = 1
        self.assertTrue(evaluate(packet([current]))["records"][0]["mechanical"]["schema_valid"])
        variants = [packet([row, row]), packet([{**row, "source_hash": "changed"}]),
                    packet([{**row, "repeat": True}]), {**packet([row]), "suite_hash": "old-labels"}]
        for value in variants:
            with self.subTest(value=value.get("suite_hash")), self.assertRaises(ValueError): records(value)
        with TemporaryDirectory() as folder:
            file = Path(folder) / "invalid.json"
            for raw in ('{"a": 1, "a": 2}', '{"x": NaN}'):
                file.write_text(raw)
                with self.assertRaises(ValueError): read_json(file)

    def test_human_fact_and_factor_review_binds_original_answer(self):
        reference = suite(); case = reference["cases"][0]; row = answer(case)
        # Synthetic report just gives the review machinery exact text to locate.
        row["analysis"]["source_facts"] = [f["requirement"] for f in case["facts"]]
        review = review_template(reference, [row])
        review.update(reviewer="synthetic test reviewer", corpus_approved=True, corpus_review_note="仅测试评审合同，不是真实专家验收")
        item = review["reviews"][0]
        for fact, expected in zip(item["facts"], case["facts"]):
            fact.update(verdict="supported", reason="测试定位", report_quotes=[expected["requirement"]],
                        source_quotes=[expected["source"]] if expected["source"] else [])
        item["unsupported_claims"].update(verdict="checked_none", reason="测试机械字段，不评价模型")
        item["parameter_review"].update(complete=True, reason="测试无额外项")
        item["factor_coverage"].update(complete=True, reason="样例测试，不是语义验收")
        result = evaluate(packet([row]), review)
        self.assertEqual(result["records"][0]["human"]["status"], "reviewed")
        self.assertFalse(result["human_review_complete"])
        self.assertEqual(result["acceptance"], "baseline_collection_only_no_release_thresholds")
        changed = copy.deepcopy(row); changed["analysis"]["summary"] += " changed"
        with self.assertRaises(ValueError): evaluate(packet([changed]), review)
        wrong = copy.deepcopy(review); wrong["reviews"][0]["facts"][0]["source_quotes"][0]["quote"] = "fabricated"
        with self.assertRaises(ValueError): evaluate(packet([row]), wrong)

    def test_18_mechanical_successes_are_not_semantic_or_real_model_acceptance(self):
        rows = [answer(c, i) for c in suite()["cases"] for i in range(1, 4)]
        result = evaluate(packet(rows))
        self.assertTrue(result["complete_same_context_baseline"])
        self.assertFalse(result["human_review_complete"])
        self.assertEqual(result["provider_recorded_attempts"], 0)
        self.assertEqual(result["label_status"], "draft_ai_authored_requires_expert_review")

    def test_command_exports_evaluates_and_preserves_existing_baselines(self):
        with TemporaryDirectory() as folder, patch("quant.worker.complete", side_effect=AssertionError("must not call model")):
            path = Path(folder) / "inputs.json"
            call_command("quant_report_quality", export_inputs=True, output=str(path), stdout=io.StringIO())
            self.assertEqual(read_json(path), inputs())
            with self.assertRaises(CommandError):
                call_command("quant_report_quality", export_inputs=True, output=str(path), stdout=io.StringIO())
            result = io.StringIO(); call_command("quant_report_quality", evaluate=True, stdout=result)
            self.assertEqual(json.loads(result.getvalue())["acceptance"], "baseline_collection_only_no_release_thresholds")


class QualityRunExportTests(TestCase):
    def test_product_acquisition_failure_exports_negative_control_without_model_call(self):
        from quant.test_research_analysis import AnalysisTests
        from quant.models import AIRun, ResearchReport
        from quant.quality.exporting import export_run
        from quant.research.web_source import SourceFetchError
        from quant.worker import execute
        AnalysisTests.setUp(self)
        case = suite()["cases"][-1]
        self.payload.update(case["source"])
        entry = AnalysisTests.collect(self)
        run = AIRun.objects.get(entry=entry)
        with patch("quant.research.acquisition.fetch_source", side_effect=SourceFetchError("质量测试：无法取得正文")), patch("quant.worker.complete", side_effect=AssertionError("must not call model")) as complete:
            execute(run.pk)
        complete.assert_not_called()
        self.assertFalse(ResearchReport.objects.filter(run=run).exists())
        exported = export_run(run.pk, case["id"], 1)
        self.assertEqual(exported["block_reason"], "source_acquisition_failed")
        checked = evaluate(packet([exported]))
        self.assertTrue(checked["records"][0]["mechanical"]["expected_block_matched"])

    def test_export_real_run_record_is_read_only_and_unrecorded_fake_has_no_freshness(self):
        from quant.test_research_analysis import AnalysisTests
        from quant.models import AIRun, SourceRevision, WorkflowStep, WorkflowOutcome
        from quant.quality.exporting import export_run
        AnalysisTests.setUp(self)
        case = suite()["cases"][0]
        self.payload.update(case["source"])
        entry = AnalysisTests.collect(self)
        run = AIRun.objects.get(entry=entry)
        run.status = "completed"; run.result = answer(case)["analysis"]; run.save()
        for i, stage in enumerate(("identify", "parameters", "research", "extract", "review", "plan")):
            data = {"model": {"configuration_hash": "test-config", "model_name": "test", "provider_type": "test"}}
            step = WorkflowStep.objects.create(run=run, ordinal=i, stage=stage, input=data, content_hash=digest(data))
            output = {"status": "completed", "reused_from": "", "usage": {"request_count": 0}}
            WorkflowOutcome.objects.create(step=step, data=output, content_hash=digest(output))
        before = (AIRun.objects.count(), SourceRevision.objects.count(), WorkflowOutcome.objects.count())
        exported = export_run(run.pk, case["id"], 1)
        self.assertEqual(exported["origin"], "unverified")
        self.assertFalse(exported["fresh_model_calls"])
        self.assertEqual((AIRun.objects.count(), SourceRevision.objects.count(), WorkflowOutcome.objects.count()), before)
        self.assertNotIn("api_key", json.dumps(exported))
        with self.assertRaises(ValueError): export_run(run.pk, "channel", 1)
        run.workflow_steps.all().delete()
        run.status = "failed"; run.save()
        failed = export_run(run.pk, case["id"], 2)
        self.assertEqual(failed["status"], "failed")
        self.assertFalse(failed["fresh_model_calls"])
        self.assertNotIn("analysis", failed)

"""Source-bound AI findings, independently visible beside static quality scores."""
from rest_framework import serializers
from quant.factors.contracts import Evidence
from .analysis import DIMENSIONS

VERSIONS = (14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42)
SEVERITIES = ("critical", "high", "medium", "low", "info")
LABELS = dict(zip(SEVERITIES, ("严重", "高", "中", "低", "提示")))
CATEGORIES = ("temporal_leakage", "repainting", "dependency", "implementation", "execution", "risk", "parameter", "unsupported_claim", "other")


class Finding(serializers.Serializer):
    title = serializers.CharField(max_length=300)
    severity = serializers.ChoiceField(choices=SEVERITIES)
    category = serializers.ChoiceField(choices=CATEGORIES)
    certainty = serializers.ChoiceField(choices=("source_fact", "hypothesis"))
    impact = serializers.CharField(max_length=3000)
    recommendation = serializers.CharField(max_length=3000)
    affected_dimensions = serializers.ListField(child=serializers.ChoiceField(choices=DIMENSIONS), min_length=1, max_length=5)
    evidence = Evidence(many=True, min_length=1, max_length=5)

    def validate_affected_dimensions(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("问题影响维度不得重复")
        return value


def validate(value):
    if type(value.get("source_findings_version")) is not int or value["source_findings_version"] != 1:
        raise serializers.ValidationError("源码问题清单版本无效")
    serializer = Finding(data=value.get("source_findings"), many=True, max_length=20)
    serializer.is_valid(raise_exception=True)
    note = value.get("source_findings_note")
    if not isinstance(note, str) or not note.strip() or len(note) > 3000:
        raise serializers.ValidationError("需要说明问题审查的范围与未检查项")
    rows = list(serializer.validated_data)
    keys = [(row["title"], row["category"], tuple((e["field"], e["quote"]) for e in row["evidence"])) for row in rows]
    if len(keys) != len(set(keys)):
        raise serializers.ValidationError("问题清单不得重复计数同一问题")
    return {"source_findings_version": 1, "source_findings": rows, "source_findings_note": note.strip()}


def validate_evidence(value, source):
    for row in value.get("source_findings", []):
        for evidence in row["evidence"]:
            if not evidence["quote"].strip() or evidence["quote"] not in source.get(evidence["field"], ""):
                raise serializers.ValidationError("问题依据必须逐字存在于对应来源快照")


def from_review(value, source):
    result = validate({**value, "source_findings_version": 1})
    validate_evidence(result, source)
    return result


def validate_admission(value, workflow_version):
    from quant.parameters.bindings import validate_admission as parameter_admission
    parameter_admission(value, workflow_version)
    from quant.source_changes.review import validate_admission as validate_change_admission
    validate_change_admission(value, workflow_version)
    if value and ("source_findings_version" in value) != (workflow_version in VERSIONS):
        raise serializers.ValidationError("源码问题清单须绑定支持的研究工作流，历史报告不得追加或删除清单版本")


def prompt():
    return '''
同时提供 source_findings_note（审查范围、未检查项；没有发现时也说明不等于不存在）、source_findings 数组（最多20项）。
每项：title, severity(critical/high/medium/low/info), category(temporal_leakage/repainting/dependency/implementation/execution/risk/parameter/unsupported_claim/other),
certainty(source_fact/hypothesis), impact, recommendation, affected_dimensions（五维研究评分维度，至少一项且不重复），
evidence:[{field:code/description/web_markdown,quote:对应来源中逐字存在的原文，不能用行号替代}]。
evidence 只允许引用材料 source 的 code、description、web_markdown 同名原始字段；source.description 为空就不能提供 description 引文。source_structure、portable_qualification、previous、库比对、历史记忆及工具说明都不是 source.description，不能将它们改标为原文。
本机解析覆盖、DSL 支持和验证状态属于研究流程的边界，写入 source_findings_note；它们本身不是源码问题，不为这些状态单独创建 source_findings。无法定位原文的问题保留为未检查事项，不伪造引文。
这份清单独立于分数，不通过平均分抵消严重问题。critical=直接破坏该对象研究/使用前提的严重问题（例如把未来收益作为时点可用交易信号），high=重大依赖、实现或执行风险；其余按影响说明。
source_fact 表示你认为原文明示的事实，不代表平台运行已经验证；对平台语义、重绘等未证实影响使用 hypothesis，写清还需什么证据。
检查未来数据/时点、重绘、缺失依赖、参数误用和作者未经验证的盈利主张。区分可分离的历史特征与含未来项的最终输出。
按对象类别判断：指标不因没有下单或止损而报错；EA 才额外核查仓位、成交与风控；本机 DSL 不支持某算子不等于原平台实现有缺陷。
不为凑数编造问题。不要输出 source_findings_version，系统会绑定版本。严重问题仍要有原文和影响解释；数值评分仍遵守原五维规则，不生成盈利或放行结论。
'''


def markdown(value):
    if value.get("source_findings_version") != 1:
        return []
    rows = value["source_findings"]
    parts = ["## 问题清单与严重度", value["source_findings_note"], "严重度独立于研究质量分；AI 静态判断不代表编译、运行或盈利验证。"]
    if not rows:
        return parts + ["本次 AI 未列出具体问题；这不证明源码没有缺陷。"]
    if any(row["severity"] in ("critical", "high") for row in rows):
        parts += ["存在严重或高影响问题，研究总分不能视为通过结论。"]
    for row in sorted(rows, key=lambda r: SEVERITIES.index(r["severity"])):
        parts += [f"### {LABELS[row['severity']]} · {row['title']}",
                  "AI 判断：" + ("认为原文明示" if row["certainty"] == "source_fact" else "影响尚待验证的假设"),
                  "影响：" + row["impact"], "建议：" + row["recommendation"],
                  "涉及研究维度：" + "、".join(row["affected_dimensions"])]
        parts += [f"原文依据（{e['field']}）：\n\n" + "\n".join("> " + line for line in e["quote"].splitlines()) for e in row["evidence"]]
    return parts

from rest_framework.exceptions import ValidationError
from quant.models import ResearchReport

POLICY={'version':1,'max_model_calls':3,'max_seconds':360,'per_call_seconds':120,
    'max_revisions':1,'reviewer_independent':False}
STAGES=('native_draft','native_audit','native_reaudit')
NAMES={'native_draft':'生成或读取原始解读','native_audit':'事实审查与一次修订','native_reaudit':'复核修订稿'}


def prepare(source,values:dict,existing=None) -> None:
    native=source.payload.get('feedback_version')==4
    version=existing.feedback_workflow_version if existing else 1 if native else 0
    if version:
        if not native:raise ValidationError('原始输出审查须绑定Python计算事实')
        values['feedback_workflow_version']=version
    identity=values.get('audit_report_id','')
    if identity:
        report=ResearchReport.objects.select_related('run').filter(pk=identity,entry=source.material.entry,source=source,
            run__kind='feedback_review',run__status='completed').first()
        if not version or not report or not report.data.get('native_review'):
            raise ValidationError('请选择当前Python验证反馈下已完成的原始AI报告')
        if not values.get('requirements'):values['requirements']=report.run.requirements

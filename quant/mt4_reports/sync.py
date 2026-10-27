"""Validate archive ownership and references before snapshot restoration."""
import re

from rest_framework.exceptions import ValidationError

from .serializers import ExpertSerializer, TestSerializer


def validate_mt4(rows, anthologies, assets, fail):
    experts = rows.get('quant.mt4expert', {})
    tests = rows.get('quant.mt4backtest', {})
    for expert in experts.values():
        collection = anthologies.get(str(expert.get('anthology')), {})
        if (collection.get('type') != 'backtest' or collection.get('permission') != 'private'
                or not collection.get('user_id') or not isinstance(expert.get('name'), str)
                or not expert['name'].strip() or not isinstance(expert.get('parameters'), list)
                or not isinstance(expert.get('parameter_sets'), list)):
            fail('回测 EA 的文集归属或参数无效，拒绝恢复')
        serializer = ExpertSerializer(data=expert)
        if not serializer.is_valid():
            fail('回测 EA 字段无效，拒绝恢复')
    for test in tests.values():
        if str(test.get('expert')) not in experts or not isinstance(test.get('data'), dict):
            fail('回测记录的 EA 归属或数据无效，拒绝恢复')
        if not isinstance(test.get('title'), str) or not test['title'].strip():
            fail('回测记录标题无效，拒绝恢复')
        report_hash = test.get('report_hash', '')
        if not isinstance(report_hash, str) or (report_hash and not re.fullmatch(r'[0-9a-f]{64}', report_hash)):
            fail('回测报告指纹无效，拒绝恢复')
        try:
            TestSerializer().validate_data(test['data'])
        except ValidationError:
            fail('回测记录内容格式无效，拒绝恢复')
    for attachment in rows.get('quant.mt4attachment', {}).values():
        expert_id = str(attachment.get('expert'))
        expert = experts.get(expert_id, {})
        collection = anthologies.get(str(expert.get('anthology')), {})
        asset = assets.get(str(attachment.get('asset')), {})
        test_id = attachment.get('backtest')
        if (not expert or not asset or not asset.get('is_valid', True)
                or asset.get('uploader') != collection.get('user_id')
                or (test_id and str(tests.get(str(test_id), {}).get('expert')) != expert_id)
                or attachment.get('role') not in ('attachment', 'report', 'chart', 'screenshot')
                or (attachment.get('role') in ('chart', 'screenshot') and (not test_id or asset.get('file_type') != 'image'))
                or (attachment.get('role') == 'report' and not test_id)):
            fail('回测附件缺失、用途或归属无效，拒绝恢复')

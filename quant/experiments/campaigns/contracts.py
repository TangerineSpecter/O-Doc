from rest_framework import serializers


class CampaignInput(serializers.Serializer):
    request_key = serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
    name = serializers.CharField(max_length=200)
    proposal_id = serializers.CharField(max_length=40)
    dataset_ids = serializers.ListField(child=serializers.CharField(max_length=40), min_length=1, max_length=5)
    max_rounds = serializers.IntegerField(min_value=1, max_value=5)
    max_attempts = serializers.IntegerField(min_value=1, max_value=160)
    compute_seconds = serializers.IntegerField(min_value=1, max_value=300)
    wall_seconds = serializers.IntegerField(min_value=30, max_value=1200)
    model_id = serializers.CharField(max_length=40, required=False, allow_blank=True, default='')


def validate_plan(plan):
    if not isinstance(plan, dict) or set(plan) != {'version', 'name', 'proposal_id', 'dataset_ids', 'max_rounds', 'max_attempts', 'compute_seconds', 'wall_seconds', 'model_id'} or type(plan['version']) is not int or plan['version'] != 1:
        raise serializers.ValidationError('连续研究方案结构无效')
    if any(type(plan[key]) is not int for key in ('max_rounds', 'max_attempts', 'compute_seconds', 'wall_seconds')):
        raise serializers.ValidationError('连续研究预算必须为整数')
    form = CampaignInput(data={**plan, 'request_key': 'snapshot_validation_01'})
    form.is_valid(raise_exception=True)
    values = dict(form.validated_data); values.pop('request_key')
    if values != {key: value for key, value in plan.items() if key != 'version'}:
        raise serializers.ValidationError('连续研究字段类型无效')
    if len(set(plan['dataset_ids'])) != len(plan['dataset_ids']) or len(plan['dataset_ids']) > plan['max_rounds']:
        raise serializers.ValidationError('每轮选择不同的行情记录，数量不能超过轮数预算')
    if not plan['model_id']:
        raise serializers.ValidationError('连续研究须固定分析模型')


def experiment_input(proposal, dataset_id, request_key):
    data = proposal.data
    return {'name': data['name'], 'request_key': request_key, 'proposal_id': proposal.pk, 'dataset_id': dataset_id,
        'config': data['config'], 'seeds': [{'candidate_id': seed['id'],
            'bindings': [{'name': key, 'column': value} for key, value in seed['bindings'].items()],
            'parameters': [{'name': key, 'value': value} for key, value in seed['parameters'].items()],
            'variants': [[{'name': key, 'value': value} for key, value in variant.items()] for variant in seed['variants']]}
            for seed in data['seeds']]}

"""通用生图领域流程。MCP 是系统管理员能力，Agent 身份仅用于任务隔离。"""

from rest_framework import serializers

from system_settings.grsai_images import GrsaiImageError, get_default_image_generation_model
from system_settings.image_generation_options import serialize_image_generation_options
from utils.resource_assets import extract_resource_id_from_view_url
from .image_references import MAX_REFERENCE_IMAGES, readable_reference_assets
from system_settings.models import AIModel

MCP_USER_ID = 'admin'


class GenerateImageInput(serializers.Serializer):
    prompt = serializers.CharField(max_length=8000, trim_whitespace=False)
    reference_image_ids = serializers.ListField(
        child=serializers.CharField(max_length=32), max_length=MAX_REFERENCE_IMAGES, required=False, default=list)
    aspect_ratio = serializers.CharField(max_length=20, required=False)
    image_size = serializers.ChoiceField(choices=['1K', '2K', '4K'], required=False)
    request_id = serializers.CharField(max_length=80, required=False)
    model_id = serializers.CharField(max_length=40, required=False)

    def validate_prompt(self, value):
        if not value.strip():
            raise serializers.ValidationError('生图提示词不能为空')
        return value

    def validate_reference_image_ids(self, value):
        if len(set(value)) != len(value):
            raise serializers.ValidationError('参考图资源 ID 不可重复')
        return value


def supports_references(model) -> bool:
    return model.provider.type == 'Grsai' and model.name.lower().startswith(('nano-banana', 'gpt-image-2'))


def resolve_image_model(model_id=None):
    if not model_id:
        return get_default_image_generation_model()
    model = AIModel.objects.select_related('provider').filter(pk=model_id, type='image_generation').first()
    if not model or model.provider.type not in ('Grsai', 'NewAPI'):
        raise GrsaiImageError('指定生图模型已失效或不支持，请重新选择', status_code=400)
    return model


def image_generation_options(agent=None, model_id=None) -> dict:
    try:
        model = resolve_image_model(model_id)
    except GrsaiImageError as exc:
        return {'configured': False, 'message': str(exc)}
    options = serialize_image_generation_options(model, scene='generic')
    options.update(configured=True, model_id=str(model.pk), supports_reference_images=supports_references(model),
                   max_reference_images=MAX_REFERENCE_IMAGES if supports_references(model) else 0)
    references = {}
    if agent is not None:
        for role, field in (('avatar', 'avatar'), ('full_body', 'full_body_image')):
            resource_id = extract_resource_id_from_view_url(getattr(agent, field, ''))
            if not resource_id:
                continue
            try:
                readable_reference_assets([resource_id], user_id=MCP_USER_ID)
            except ValueError:
                continue
            references[role] = resource_id
    options['agent_reference_images'] = references
    return options


def validate_generation_arguments(arguments: object) -> dict:
    if not isinstance(arguments, dict):
        raise ValueError('生图参数必须是对象')
    validator = GenerateImageInput(data=arguments)
    unknown = set(arguments) - set(validator.fields)
    if unknown:
        raise ValueError('未知生图参数：' + ', '.join(sorted(unknown)))
    if not validator.is_valid():
        raise ValueError(str(validator.errors))
    return dict(validator.validated_data)

"""Model-aware image-generation controls and request parameter validation."""

from dataclasses import dataclass

from .models import AIModel


GEMINI_3_IMAGE_RATIOS = (
    '1:1', '1:4', '4:1', '1:8', '8:1', '2:3', '3:2', '3:4', '4:3',
    '4:5', '5:4', '9:16', '16:9', '21:9',
)
GEMINI_PRO_IMAGE_RATIOS = (
    '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
)
GEMINI_CLASSIC_IMAGE_RATIOS = (
    '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
)
GPT_IMAGE_RATIOS = (
    'auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5',
    '21:9', '9:21', '1:2', '2:1',
)
GPT_IMAGE_DIMENSIONS = {
    '1:1': {'1K': '1024x1024', '2K': '2048x2048', '4K': '2880x2880'},
    '16:9': {'1K': '1280x720', '2K': '2048x1152', '4K': '3840x2160'},
    '9:16': {'1K': '720x1280', '2K': '1152x2048', '4K': '2160x3840'},
    '4:3': {'1K': '1152x864', '2K': '2304x1728', '4K': '3264x2448'},
    '3:4': {'1K': '864x1152', '2K': '1728x2304', '4K': '2448x3264'},
    '3:2': {'1K': '1536x1024', '2K': '2048x1360', '4K': '3504x2336'},
    '2:3': {'1K': '1024x1536', '2K': '1360x2048', '4K': '2336x3504'},
    '5:4': {'1K': '1120x896', '2K': '2240x1792', '4K': '3200x2560'},
    '4:5': {'1K': '896x1120', '2K': '1792x2240', '4K': '2560x3200'},
    '21:9': {'1K': '1456x624', '2K': '2912x1248', '4K': '3840x1648'},
    '9:21': {'1K': '624x1456', '2K': '1248x2912', '4K': '1648x3840'},
    '1:3': {'1K': '688x2048', '2K': '1280x3840'},
    '3:1': {'1K': '2048x688', '2K': '3840x1280'},
    '2:1': {'1K': '1536x768', '2K': '3072x1536', '4K': '3840x1920'},
    '1:2': {'1K': '768x1536', '2K': '1536x3072', '4K': '1920x3840'},
}

SCENE_DEFAULTS = {
    # Inline editorial artwork reads best as a landscape image in article bodies.
    'article_illustration': {'aspect_ratio': '16:9', 'image_size': '1K'},
    'agent_post_illustration': {'aspect_ratio': '16:9', 'image_size': '1K'},
}

AGENT_POST_IMAGE_SIZE = '1K'


@dataclass(frozen=True)
class ImageGenerationProfile:
    provider: str
    model_name: str
    mode: str
    aspect_ratios: tuple[str, ...] = ()
    image_sizes: tuple[str, ...] = ()
    custom_dimensions: bool = False
    quality: str = ''


def get_image_generation_profile(model: AIModel) -> ImageGenerationProfile:
    provider = model.provider.type
    name = model.name.strip().lower()

    if provider != 'Grsai':
        # New API gateways are configured by users and may expose different image
        # model contracts. The current adapter does not send size parameters.
        return ImageGenerationProfile(provider, model.name, 'automatic')

    if name.startswith('nano-banana'):
        if name in {'nano-banana-2-4k-cl', 'nano-banana-pro-4k-vip'}:
            sizes = ('4K',)
        elif name == 'nano-banana-2-2k-cl':
            sizes = ('2K',)
        elif name in {'nano-banana-2-cl', 'nano-banana-pro-cl', 'nano-banana'} or any(part in name for part in ('-lite', '-fast')) or name.endswith('-cl'):
            sizes = ('1K',)
        elif name == 'nano-banana-pro-vip':
            sizes = ('1K', '2K')
        else:
            sizes = ('1K', '2K', '4K')

        if 'pro' in name:
            ratios = GEMINI_PRO_IMAGE_RATIOS
        elif name in {'nano-banana', 'nano-banana-fast'} or '-lite' in name:
            ratios = GEMINI_CLASSIC_IMAGE_RATIOS
        else:
            ratios = GEMINI_3_IMAGE_RATIOS
        return ImageGenerationProfile(provider, model.name, 'image_size', ('auto', *ratios), sizes)

    if name.startswith('gpt-image-2'):
        if any(part in name for part in ('-vip', '-flare', '-sunburst')):
            quality = 'medium'
            return ImageGenerationProfile(
                provider, model.name, 'pixel_dimensions', tuple(GPT_IMAGE_DIMENSIONS),
                ('1K', '2K', '4K'), custom_dimensions=True, quality=quality,
            )
        return ImageGenerationProfile(provider, model.name, 'fixed', GPT_IMAGE_RATIOS, ('1K',), quality='auto')

    return ImageGenerationProfile(provider, model.name, 'automatic')


def serialize_image_generation_options(model: AIModel, *, scene: str) -> dict:
    profile = get_image_generation_profile(model)
    defaults = SCENE_DEFAULTS.get(scene, {'aspect_ratio': '1:1', 'image_size': '1K'})
    ratio_values = list(profile.aspect_ratios)
    size_values = list(profile.image_sizes)
    default_ratio = defaults['aspect_ratio'] if defaults['aspect_ratio'] in ratio_values else (ratio_values[0] if ratio_values else '')
    default_size = defaults['image_size'] if defaults['image_size'] in size_values else (size_values[0] if size_values else '')

    return {
        'provider': profile.provider,
        'model_name': profile.model_name,
        'mode': profile.mode,
        'aspect_ratio_options': [{'value': value, 'label': '自动' if value == 'auto' else value} for value in ratio_values],
        'image_size_options': [{'value': value, 'label': value} for value in size_values],
        'image_size_options_by_aspect_ratio': {
            ratio: [{'value': size, 'label': size} for size in sizes]
            for ratio, sizes in GPT_IMAGE_DIMENSIONS.items()
        } if profile.mode == 'pixel_dimensions' else {},
        'default_aspect_ratio': default_ratio,
        'default_image_size': default_size,
        'custom_dimensions': {
            'enabled': profile.custom_dimensions,
            'max_edge': 3840,
            'step': 16,
            'min_pixels': 655360,
            'max_pixels': 8294400,
            'max_aspect_ratio': 3,
        },
        'description': _profile_description(profile),
    }


def resolve_image_generation_request(model: AIModel, options: object, *, scene: str) -> dict:
    profile = get_image_generation_profile(model)
    if not isinstance(options, dict):
        raise ValueError('生图参数格式不正确')

    defaults = SCENE_DEFAULTS.get(scene, {'aspect_ratio': '1:1', 'image_size': '1K'})
    ratio_values = profile.aspect_ratios
    size_values = profile.image_sizes
    ratio = options.get('aspect_ratio', defaults['aspect_ratio'])
    image_size = options.get('image_size', defaults['image_size'])
    custom = options.get('custom_dimensions')

    if profile.mode == 'automatic':
        if options:
            raise ValueError('当前生图模型不开放画幅和分辨率设置')
        return {}

    if custom is not None:
        if not profile.custom_dimensions:
            raise ValueError('当前生图模型不支持自定义像素尺寸')
        width, height = _validate_custom_dimensions(custom)
        return {'aspectRatio': f'{width}x{height}', 'quality': profile.quality}

    if ratio not in ratio_values:
        raise ValueError('请选择当前模型支持的画面比例')
    if image_size not in size_values:
        raise ValueError('请选择当前模型支持的分辨率')

    if profile.mode == 'image_size':
        return {'aspectRatio': ratio, 'imageSize': image_size}
    if profile.mode == 'pixel_dimensions':
        dimensions = GPT_IMAGE_DIMENSIONS.get(ratio, {}).get(image_size)
        if not dimensions:
            raise ValueError('当前画面比例不支持所选分辨率')
        return {'aspectRatio': dimensions, 'quality': profile.quality}
    if profile.mode == 'fixed':
        return {'aspectRatio': ratio, 'quality': profile.quality}
    return {}


def resolve_agent_post_illustration_request(model: AIModel, aspect_ratio: str) -> tuple[dict, str, str]:
    """Resolve an agent illustration at 1K.

    Returns provider options, the ratio actually used, and a note when the
    requested ratio is replaced. Higher resolutions are never sent.
    """
    profile = get_image_generation_profile(model)
    requested = (aspect_ratio or '').strip() or '16:9'
    if profile.mode == 'automatic':
        return {}, requested, ''
    if profile.image_sizes and AGENT_POST_IMAGE_SIZE not in profile.image_sizes:
        raise ValueError('当前默认生图模型不支持 1K，Agent 不使用更高分辨率')

    ratios = profile.aspect_ratios
    applied = requested
    note = ''
    if ratios and requested not in ratios:
        applied = '16:9' if '16:9' in ratios else ratios[0]
        note = f'比例 {requested} 不受当前生图模型支持，已改用 {applied}'
    options = resolve_image_generation_request(
        model,
        {'aspect_ratio': applied, 'image_size': AGENT_POST_IMAGE_SIZE},
        scene='agent_post_illustration',
    )
    return options, applied, note


def _validate_custom_dimensions(value: object) -> tuple[int, int]:
    if not isinstance(value, dict):
        raise ValueError('自定义尺寸格式不正确')
    width = value.get('width')
    height = value.get('height')
    if any(isinstance(edge, bool) or not isinstance(edge, int) for edge in (width, height)):
        raise ValueError('宽和高必须是整数像素')
    if width < 16 or height < 16 or width > 3840 or height > 3840:
        raise ValueError('宽和高必须在 16 到 3840 像素之间')
    if width % 16 or height % 16:
        raise ValueError('宽和高必须是 16 的倍数')
    pixels = width * height
    if pixels < 655360 or pixels > 8294400:
        raise ValueError('图片总像素数必须在 655,360 到 8,294,400 之间')
    if max(width, height) / min(width, height) > 3:
        raise ValueError('长边与短边之比不能超过 3:1')
    return width, height


def _profile_description(profile: ImageGenerationProfile) -> str:
    if profile.mode == 'image_size':
        if len(profile.image_sizes) == 1:
            return f'当前模型固定为 {profile.image_sizes[0]}，画面比例可选。'
        return '画面比例和分辨率使用模型支持的固定选项。'
    if profile.mode == 'pixel_dimensions':
        return '可选比例与 1K/2K/4K 档位，也支持在服务约束内手动输入像素尺寸。'
    if profile.mode == 'fixed':
        return '当前模型分辨率固定为 1K；比例可按列表选择。'
    return '当前接口未开放画面比例和分辨率参数，由模型自动决定。'

"""照片观察与评价。识图只写事实，分数由 Agent 提交后在这里校验。"""
import hashlib

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from openai import OpenAI

from article.image_service import build_image_data_url
from article.models import Image, ImageReview
from utils.ai_service import AIAuthenticationError, AIService

SECTION_NAMES = ('画面内容', '构图', '光影', '色彩', '清晰范围', '表达线索')
SCORE_FIELDS = (
    ('theme', 'score_theme', '主题'),
    ('composition', 'score_composition', '构图'),
    ('idea', 'score_idea', '思想'),
    ('light', 'score_light', '光影'),
    ('color', 'score_color', '色彩'),
    ('focus', 'score_focus', '对焦'),
)
COMMENTARY_LIMIT = 2000
SEEN_AS = '长边不超过 1280 的 JPEG，原片未改。清晰范围只能判断明显发糊。'
OBSERVE_PROMPT = (
    '请只根据这张已经缩小的图片，用中文写下六段观察。图片长边不超过 1280，细微对焦看不出来。\n'
    '每一段单独起行，行首必须是这些标题之一，后面接中文冒号：\n'
    '画面内容：\n构图：\n光影：\n色彩：\n清晰范围：\n表达线索：\n\n'
    '画面内容写主体、陪体、动作和场景。'
    '构图写主体位置、大约占比、主要线条、前后层次、留白和被切掉的部分。'
    '光影写亮部、暗部、光从哪边来、影子硬或软、有没有大块纯白或纯黑。'
    '色彩写两三种主色、冷暖、饱和度高低、有没有一小块跳出来的颜色。'
    '清晰范围只写三种之一：整张明显发糊、看不出问题、无法判断；如果只有局部明显发糊，写清是哪一块。'
    '表达线索只写看得见的关系，例如人背对镜头、座位空着，不要写拍摄者想表达什么。\n'
    '看不清就写无法判断。不要打分，不要写好或不好，不要编造作品名、地点、人物身份和拍摄参数。'
)


def parse_observation(text):
    """把识图模型的分段正文收成固定六段。没有标题时，整段文字放进画面内容。"""
    cleaned = _strip_fence(text)
    sections = {name: [] for name in SECTION_NAMES}
    current = None
    matched_any = False
    for line in cleaned.splitlines():
        name, rest = _match_section(line.strip())
        if name:
            matched_any = True
            current = name
            if rest:
                sections[name].append(rest)
            continue
        if current:
            sections[current].append(line)
    if not matched_any and cleaned:
        return {name: cleaned if name == '画面内容' else '无法判断' for name in SECTION_NAMES}
    return {name: '\n'.join(part.strip() for part in lines if part.strip()).strip() or '无法判断' for name, lines in sections.items()}


def parse_score(value, label):
    """只接受 0 到 10、步进 0.5 的分数。"""
    if isinstance(value, bool) or value is None:
        raise ValueError(f'{label}必须是 0 到 10 之间、步进 0.5 的数')
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        raise ValueError(f'{label}必须是 0 到 10 之间、步进 0.5 的数')
    if number < 0 or number > 10 or (number * 2) != (number * 2).to_integral_value():
        raise ValueError(f'{label}必须是 0 到 10 之间、步进 0.5 的数')
    return number.quantize(Decimal('0.1'))


def overall_score(values):
    """六项或若干综合分取平均，再对齐到 0.5。"""
    if not values:
        raise ValueError('没有可计算的分数')
    mean = sum((Decimal(value) for value in values), Decimal('0')) / Decimal(len(values))
    snapped = (mean * 2).quantize(Decimal('1'), rounding=ROUND_HALF_UP) / 2
    return snapped.quantize(Decimal('0.1'))


def observe_photo(image_id):
    image = _load_image(image_id)
    image_data_url = build_image_data_url(image.image_url)
    if not image_data_url:
        raise ValueError('图片文件不存在或无法读取')
    description = _request_observation(image_data_url)
    return {
        'image_id': image.image_id,
        'seen_as': SEEN_AS,
        'author': _author_statement(image),
        'sections': parse_observation(description),
    }


def submit_photo_review(arguments, agent):
    agent_key = str(getattr(agent, 'id', '') or '').strip()
    if not agent_key:
        raise ValueError('需要由已绑定的 Agent 提交评价')
    image = _load_image(arguments.get('image_id'))
    commentary = str(arguments.get('commentary') or '').strip()
    if not commentary:
        raise ValueError('commentary 不能为空')
    if len(commentary) > COMMENTARY_LIMIT:
        raise ValueError(f'commentary 不能超过 {COMMENTARY_LIMIT} 字')

    scores = {}
    for argument_name, field_name, label in SCORE_FIELDS:
        scores[field_name] = parse_score(arguments.get(argument_name), label)
    overall = overall_score(scores.values())
    agent_name = str(getattr(agent, 'name', '') or '').strip() or 'Agent'
    defaults = {'agent_name': agent_name[:50], 'commentary': commentary, 'overall': overall, **scores}
    review, _created = ImageReview.objects.update_or_create(
        image=image,
        agent_key=agent_key,
        defaults=defaults,
        create_defaults={'review_id': photo_review_id(image.image_id, agent_key), **defaults},
    )
    return {'review': _review_payload(review), 'overall': score_number(review.overall)}


def photo_review_id(image_id, agent_key):
    """同一照片与 Agent 在所有设备上使用同一同步主键。"""
    key = f'{image_id}\0{agent_key}'.encode('utf-8')
    return 'irev_' + hashlib.sha256(key).hexdigest()[:27]


def review_summary(image):
    reviews = list(image.reviews.all().order_by('updated_at', 'review_id'))
    if not reviews:
        return {'overall': None, 'count': 0, 'reviews': []}
    return {
        'overall': score_number(overall_score([review.overall for review in reviews])),
        'count': len(reviews),
        'reviews': [_review_payload(review) for review in reviews],
    }


def score_number(value):
    return float(value)


def _load_image(image_id):
    image_id = str(image_id or '').strip()
    if not image_id:
        raise ValueError('image_id 不能为空')
    image = Image.objects.filter(image_id=image_id, is_valid=True).first()
    if image is None:
        raise ValueError('图片不存在')
    return image


def _author_statement(image):
    focal_length = str(image.focal_length or '').strip()
    return {
        'note': '以下标题、焦段和描述是创建人自己写的，不是从画面识别出来的。',
        'name': _author_name(image),
        'title': image.title or '',
        'focal_length': f'{focal_length}mm' if focal_length else '',
        'description': image.description or '',
    }


def _author_name(image):
    from user.models import UserProfile

    profile = UserProfile.objects.filter(userid=image.author).select_related('user').first()
    if profile is None and image.author == 'admin':
        profile = UserProfile.objects.filter(user__username='admin').select_related('user').first()
    if profile:
        return profile.nickname or profile.user.first_name or profile.user.username
    return image.author or ''


def _request_observation(image_data_url):
    try:
        config = AIService.get_default_image_client_config()
    except ValueError as exc:
        if str(exc) == 'No default image model configured':
            raise ValueError('请先在设置中选择默认图像识别模型') from exc
        raise
    try:
        client = OpenAI(api_key=config['api_key'], base_url=config['base_url'], timeout=55.0, max_retries=0)
        response = client.chat.completions.create(
            model=config['model_name'],
            messages=[{'role': 'user', 'content': [
                {'type': 'text', 'text': OBSERVE_PROMPT},
                {'type': 'image_url', 'image_url': {'url': image_data_url}},
            ]}],
            stream=False,
        )
        description = AIService.strip_thinking(response.choices[0].message.content or '').strip()
    except AIAuthenticationError as exc:
        raise ValueError(str(exc)) from exc
    if not description:
        raise ValueError('图像模型未返回观察')
    return description[:4000]


def _review_payload(review):
    return {
        'review_id': review.review_id,
        'agent_name': review.agent_name,
        'commentary': review.commentary,
        'overall': score_number(review.overall),
        'scores': {argument_name: score_number(getattr(review, field_name)) for argument_name, field_name, _label in SCORE_FIELDS},
        'updated_at': review.updated_at.strftime('%Y-%m-%d %H:%M:%S') if review.updated_at else '',
    }


def _strip_fence(text):
    cleaned = (text or '').strip()
    if not cleaned.startswith('```'):
        return cleaned
    lines = cleaned.splitlines()[1:]
    if lines and lines[-1].strip().startswith('```'):
        lines = lines[:-1]
    return '\n'.join(lines).strip()


def _match_section(line):
    for name in SECTION_NAMES:
        if line == name:
            return name, ''
        for separator in ('：', ':'):
            prefix = f'{name}{separator}'
            if line.startswith(prefix):
                return name, line[len(prefix):].strip()
    return None, ''

"""正文幂等发布，生图单独补偿；补图必须保留人工编辑。"""
import hashlib
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from article.models import Article
from article.annotation_service import get_agent_identity
from article.version_service import create_article_version
from anthology.models import Anthology
from system_settings.models import MCPServer
from system_mcp.image_generation import image_generation_options
from system_mcp.image_generation_tasks import generate_image, get_image_generation_result
from .models import WorldCategory
from .publishing import publish_post
from .travel_models import TravelJourney, TravelNode, TravelRuntime
from .travel_config import bound_skill
from .travel_ai import text
from .travel_notifications import notify


def content_hash(content):
    return hashlib.sha256(content.encode()).hexdigest()


@transaction.atomic
def publish_journal(journey):
    row = TravelJourney.objects.select_for_update().get(pk=journey.pk)
    if row.article_id:
        return
    config = row.snapshot['config']
    if not Anthology.objects.filter(pk=config['collection_id'], user_id=row.owner_id, is_valid=True, type='agent').exists():
        raise ValueError('输出文集失效或权限发生变化，日记草稿已保留')
    if not WorldCategory.objects.filter(pk=config['category_id'], enabled=True, workflow_kind='travel').exists():
        raise ValueError('旅行分类已失效，日记草稿已保留')
    draft = row.snapshot['draft']
    title = draft['title']
    if Article.objects.filter(author=row.owner_id, coll_id=config['collection_id'], title=title).exists():
        title = f'{title[:140]} · {row.created_at:%Y%m%d} · {row.pk[:12]}'
    article, _, _ = publish_post({'title': title, 'content': draft['content'],
        'coll_id': config['collection_id'], 'category_id': config['category_id'], 'skip_illustration': True},
        identity=get_agent_identity(row.agent, stable=True), agent=row.agent)
    from system_settings.agent_activity import record_post_publication
    record_post_publication(row.agent, article, summary=draft.get('reflection', '旅行日记'))
    row.article_id = article.pk
    row.snapshot = {**row.snapshot, 'published_content_hash': content_hash(article.content),
                    'photo': {'status': 'pending' if config.get('photo_enabled', True) else 'abandoned', 'attempt': 0,
                              'insertion_position': 'end'}}
    row.save(update_fields=['article_id', 'snapshot', 'updated_at'])


@transaction.atomic
def insert_photo(journey, image_url):
    row = TravelJourney.objects.select_for_update().get(pk=journey.pk)
    state = dict(row.snapshot)
    photo = dict(state['photo'])
    if photo.get('status') == 'inserted':
        return
    article = Article.objects.select_for_update().filter(pk=row.article_id, is_valid=True,
        agent_post_author_id=row.actor_id, coll_id=state['config']['collection_id']).first()
    photo['image_url'] = image_url
    old_markdown = '\n\n![旅行场景照](' + (photo.get('previous_image_url') or '') + ')'
    matches = article is not None and content_hash(article.content) == state['published_content_hash']
    if article is not None and photo.get('previous_image_url') and article.content.endswith(old_markdown):
        matches = matches or content_hash(article.content[:-len(old_markdown)]) == state['published_content_hash']
    if not matches:
        photo['status'], photo['error'] = 'manual', '原帖已删除或正文有人工修改，请手动插入图片'
    else:
        create_article_version(article, source='travel_photo', operator_id=row.owner_id)
        if photo.get('previous_image_url') and article.content.endswith(old_markdown):
            article.content = article.content[:-len(old_markdown)]
        article.content += '\n\n![旅行场景照](' + image_url + ')'
        article.is_rag_synced = False
        article.save(update_fields=['content', 'is_rag_synced', 'updated_at'])
        photo['status'] = 'inserted'
        state['published_content_hash'] = content_hash(article.content)
    state['photo'] = photo
    row.snapshot = state
    row.save(update_fields=['snapshot', 'updated_at'])
    journey.snapshot = state
    if photo['status'] == 'manual':
        notify(journey, 'photo-edit-conflict', photo['error'])


def recover_photo(journey):
    state = dict(journey.snapshot)
    photo = dict(state.get('photo', {}))
    if not journey.article_id or photo.get('status') not in ['pending', 'generating']:
        return
    runtime, _ = TravelRuntime.objects.get_or_create(pk=f'{journey.pk}:photo')
    if runtime.next_at > timezone.now():
        return
    if runtime.photo_started_at and timezone.now()-runtime.photo_started_at > timedelta(minutes=30):
        _photo_failure(journey, photo, '生图等待超过30分钟，请人工恢复查询')
        return
    try:
        # 服务商提交后的响应丢失时，仍可从原幂等键找到任务，避免再次创建。
        if not photo.get('task_id') and photo.get('request'):
            from prompts.models import ImageGenerationTask
            from system_mcp.image_generation import MCP_USER_ID
            saved = ImageGenerationTask.objects.filter(request_id=photo['request']['request_id'],
                user_id=MCP_USER_ID, agent_key=journey.actor_id).first()
            if saved:
                photo['task_id'] = saved.pk
        if photo.get('task_id'):
            result = get_image_generation_result({'task_id': photo['task_id']}, agent=journey.agent)
        else:
            from .travel_steps import decide
            skill = bound_skill(journey.agent, 'odoc_travel_scene_photo')
            bound_tools = MCPServer.objects.filter(pk__in=journey.agent.mcp_servers or [], enabled=True)
            if not skill or not any(any(t.get('name') == 'generate_image' and t.get('enabled', True) for t in (server.tools or [])) for server in bound_tools):
                raise ValueError('未绑定旅行场景照 Skill 或可用生图 MCP，日记已先发布')
            model_id = photo.get('request', {}).get('model_id') or state.get('config', {}).get('image_model_id')
            options = image_generation_options(journey.agent, model_id=model_id, scene='travel_photo')
            if not options.get('configured'):
                raise ValueError(options.get('message') or '生图模型未配置')
            refs = list(dict.fromkeys(options.get('agent_reference_images', {}).values()))
            if refs and not options.get('supports_reference_images'):
                raise ValueError('当前模型不支持角色参考图，请人工处理')
            node, _ = TravelNode.objects.get_or_create(pk=f'{journey.pk}:photo-{photo.get("attempt", 0)}', defaults={'journey': journey, 'kind': 'photo'})
            def validate(v):
                return {'prompt': text(v, 'prompt', 8000)}
            prompt = decide(journey, node, '只生成生图提示词，返回 {"prompt":"..."}。按参考图顺序说明用途。角色默认采用旅行场景照的统一画风：Q版大头短身（约2–3头身）、圆润简化的四肢和五官、粗而清晰的深褐近黑手绘描边、干净色块、轻柔明暗和少量纸感纹理；避免修长成人比例、细线稿和写实人物。头像固定角色身份、发型和五官特征；全身图补充服装配饰。只有任务明确指定另一种画风时才覆盖默认画风。提示词整理模型未看到参考图片时不要猜测具体外形，直接要求生图模型按头像还原。默认横向16:9，使用能同时表现角色动作和地点环境的中景或环境人像，背景细致、有层次并让地标可辨认。只表现已发生片段，输出单张完整画面。表情按角色性格和经历决定，不要求温柔、活泼或总是开心。角色卡只摘外观，不发送完整人格。',
                {'scene': state['draft']['photo_scene'], 'journey': state, 'reference_images': options.get('agent_reference_images', {}), 'appearance': {'avatar': journey.agent.avatar, 'full_body': journey.agent.full_body_image}}, validate, skill.prompt)
            if not photo.get('request'):
                sizes = [s['value'] for s in options.get('image_size_options', [])]
                requested_size = state.get('config', {}).get('image_size', '1K')
                if sizes and requested_size not in sizes:
                    raise ValueError(f'当前模型不支持配置的{requested_size}分辨率，请人工处理')
                avatar = options.get('agent_reference_images', {}).get('avatar')
                style = ('\n旅行场景照统一画风：除任务明确指定其他画风外，角色均保持约2–3头身的Q版大头短身比例、'
                    '圆润简化的五官和四肢、粗而清晰的深褐近黑手绘描边、干净色块、轻柔明暗及少量纸感纹理；'
                    '避免修长成人比例、细线稿和写实人物。使用横向16:9构图，角色动作、地点地标和旅行环境都清楚可见；'
                    '背景可以更细致、有层次，但不改变角色画法。表情按性格与实际经历决定，不默认开心。')
                if avatar in refs:
                    style += (f'\n角色参考约束：参考图 {refs.index(avatar)+1} 是头像，用于还原该角色身份、发型和五官；'
                        '按默认Q版比例和粗描边重画角色。其他参考图补充服装、配饰，不要复制设定图排版。')
                else:
                    style += '\n没有可用头像参考图时，不要声称已参考头像，也不要臆造角色具体外形。'
                photo['request'] = {'prompt': prompt['prompt'] + style, 'reference_image_ids': refs,
                    'request_id': f'travel:{journey.pk}:{photo.get("attempt", 0)}'}
                if options.get('model_id'):
                    photo['request']['model_id'] = options['model_id']
                if options.get('default_aspect_ratio'):
                    photo['request']['aspect_ratio'] = state.get('config', {}).get('image_aspect_ratio') or options['default_aspect_ratio']
                if sizes:
                    photo['request']['image_size'] = requested_size
            # 提交前保存参数与幂等键，崩溃后不变更生成意图。
            state['photo'] = photo
            journey.snapshot = state
            journey.save(update_fields=['snapshot', 'updated_at'])
            result = generate_image(photo['request'], agent=journey.agent)
        photo['task_id'] = result.get('task_id', photo.get('task_id'))
        photo['status'] = 'generating'
        state['photo'] = photo
        journey.snapshot = state
        journey.save(update_fields=['snapshot', 'updated_at'])
        if result['status'] == 'succeeded':
            insert_photo(journey, result['image_url'])
        elif result['status'] in ['failed', 'submission_unknown']:
            _photo_failure(journey, photo, result.get('message') or result['status'])
        runtime.photo_started_at = runtime.photo_started_at or timezone.now()
        runtime.next_at = timezone.now()+timedelta(minutes=1)
        runtime.save()
    except Exception as exc:
        # 只保留任务和通知；不自动变更 request_id 重新付费。
        _photo_failure(journey, photo, str(exc))


def _photo_failure(journey, photo, error):
    photo.update(status='manual', error=str(error)[:1000])
    journey.snapshot = {**journey.snapshot, 'photo': photo}
    journey.save(update_fields=['snapshot', 'updated_at'])
    notify(journey, f'photo-{photo.get("attempt", 0)}', error)

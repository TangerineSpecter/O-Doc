"""图片文集的可控识图、索引和检索能力；HTTP 与将来的 MCP 共用此模块。"""

import base64
import hashlib
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.db.models import Q
from PIL import Image as PILImage, ImageOps, UnidentifiedImageError

from article.models import Image, ImageVisualIndex
from assets.models import Asset
from utils.ai_service import AIService
from utils.rag_client import RagClient, RagSyncError
from utils.resource_assets import extract_resource_id_from_view_url


PROMPT_VERSION = 1
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_STORED_IMAGE_BYTES = 50 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
SUPPORTED_FORMATS = {'JPEG', 'PNG', 'WEBP', 'GIF'}


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def image_source_hash(image):
    asset_id = extract_resource_id_from_view_url(image.image_url)
    asset = Asset.objects.filter(pk=asset_id, is_valid=True, file_type='image').first() if asset_id else None
    return asset.file_hash if asset and asset.file_hash else digest(image.image_url)


def image_source_hashes(images):
    """为文集状态/检索批量取得资源哈希，避免按图片数重复查表。"""
    image_list = list(images)
    asset_ids = {asset_id for image in image_list if (asset_id := extract_resource_id_from_view_url(image.image_url))}
    hashes = dict(Asset.objects.filter(pk__in=asset_ids, is_valid=True, file_type='image').values_list('pk', 'file_hash'))
    return {
        image.pk: hashes.get(extract_resource_id_from_view_url(image.image_url)) or digest(image.image_url)
        for image in image_list
    }


def image_data_url(image_bytes, *, max_bytes=MAX_IMAGE_BYTES):
    if not image_bytes or len(image_bytes) > max_bytes:
        raise ValueError(f'图片不能为空且不能超过 {max_bytes // (1024 * 1024)} MB')
    try:
        with PILImage.open(BytesIO(image_bytes)) as source:
            if source.format not in SUPPORTED_FORMATS or source.width * source.height > MAX_IMAGE_PIXELS:
                raise ValueError('仅支持 JPEG、PNG、WebP、GIF 且像素不得超过 4000 万')
            source.seek(0)
            frame = ImageOps.exif_transpose(source).convert('RGB')
            frame.thumbnail((1280, 1280), PILImage.Resampling.LANCZOS)
            output = BytesIO()
            frame.save(output, format='JPEG', quality=82, optimize=True)
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError('无法读取图片内容') from exc
    return 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode('ascii')


def stored_image_data_url(image):
    asset_id = extract_resource_id_from_view_url(image.image_url)
    asset = Asset.objects.filter(pk=asset_id, is_valid=True, file_type='image').first() if asset_id else None
    if not asset or not asset.file_path:
        raise ValueError('图片资源不存在，无法识图')
    root = Path(settings.MEDIA_ROOT).resolve()
    path = (root / asset.file_path).resolve()
    if not path.is_relative_to(root) or not path.is_file() or path.stat().st_size > MAX_STORED_IMAGE_BYTES:
        raise ValueError('图片文件不存在或超过 50 MB')
    return image_data_url(path.read_bytes(), max_bytes=MAX_STORED_IMAGE_BYTES)


def model_identity(model):
    return digest(f'{model.pk}:{model.provider_id}:{model.name}')


def collection_name(model):
    return 'odoc_images_' + model_identity(model)[:32]


def effective_visual_text(image, source_hash=None):
    source_hash = source_hash or image_source_hash(image)
    if image.visual_description_override and image.visual_override_source_hash == source_hash:
        return image.visual_description_override.strip()
    if image.ai_visual_source_hash == source_hash and image.ai_visual_prompt_version == PROMPT_VERSION:
        return image.ai_visual_description.strip()
    return ''


def index_text(image, source_hash=None):
    return '\n'.join(part for part in (effective_visual_text(image, source_hash), image.description.strip()) if part)


def image_index_status(image, record=None, model=None, *, source_hash=None):
    source_hash = source_hash or image_source_hash(image)
    if image.ai_visual_description and (image.ai_visual_source_hash != source_hash or image.ai_visual_prompt_version != PROMPT_VERSION):
        return 'needs_recognition'
    if record and record.enabled and record.error:
        return 'failed'
    if not effective_visual_text(image, source_hash):
        return 'unrecognized'
    if record is None or not record.enabled:
        return 'recognized'
    if not model or record.model_key != model_identity(model) or record.collection_name != collection_name(model):
        return 'needs_index'
    if record.coll_id != image.coll_id or record.image_hash != source_hash or record.text_hash != digest(index_text(image, source_hash)):
        return 'needs_index'
    return 'indexed'


def recognize_image(image):
    source_hash = image_source_hash(image)
    description, model_name = AIService.image_visual_fingerprint(stored_image_data_url(image))
    # 用户在模型请求期间替换了图片时，不能将旧画面的描述写入新图片。
    image.refresh_from_db()
    if not image.is_valid or image_source_hash(image) != source_hash:
        raise ValueError('图片在识图过程中发生变化，请重新识图')
    image.ai_visual_description = description
    image.ai_visual_source_hash = source_hash
    image.ai_visual_prompt_version = PROMPT_VERSION
    image.ai_visual_model = model_name
    image.save(update_fields=['ai_visual_description', 'ai_visual_source_hash', 'ai_visual_prompt_version', 'ai_visual_model', 'updated_at'])
    return image


def index_image(image, *, mode='reuse'):
    """只在显式任务中首次识图。已启用索引的编辑可通过 index_only 重建。"""
    source_hash = image_source_hash(image)
    if mode == 'refresh' or (mode == 'reuse' and not effective_visual_text(image, source_hash)):
        image = recognize_image(image)
        source_hash = image_source_hash(image)
    if not effective_visual_text(image, source_hash):
        raise ValueError('没有可用的识图描述，请先识图')
    model = RagClient.get_embedding_model()
    if not model:
        raise RagSyncError('未配置默认向量模型')
    text = index_text(image, source_hash)
    vector = RagClient.create_embeddings([text], strict=True)
    if len(vector) != 1:
        raise RagSyncError('向量模型未返回有效结果')
    image.refresh_from_db()
    if not image.is_valid or image_source_hash(image) != source_hash or index_text(image, source_hash) != text:
        raise ValueError('图片或描述在建索引期间发生变化，请重试')
    name = collection_name(model)
    record = ImageVisualIndex.objects.filter(image=image).first()
    RagClient.get_collection(name).upsert(
        ids=[image.image_id], embeddings=vector, documents=[text],
        metadatas=[{'image_id': image.image_id, 'coll_id': image.coll_id}],
    )
    if record and record.collection_name and record.collection_name != name:
        RagClient.get_collection(record.collection_name).delete(ids=[image.image_id])
    ImageVisualIndex.objects.update_or_create(image=image, defaults={
        'enabled': True, 'coll_id': image.coll_id, 'collection_name': name, 'model_key': model_identity(model),
        'text_hash': digest(text), 'image_hash': source_hash, 'error': '',
    })


def remove_image_index(image):
    record = ImageVisualIndex.objects.filter(image=image).first()
    if not record:
        return
    if record.collection_name:
        RagClient.get_collection(record.collection_name).delete(ids=[image.image_id])
    record.enabled = False
    record.error = ''
    record.save(update_fields=['enabled', 'error', 'updated_at'])


def visible_images(request, coll_id=None):
    from article.access import get_visible_anthology_queryset

    coll_ids = list(get_visible_anthology_queryset(request).filter(type='image').values_list('coll_id', flat=True))
    if coll_id:
        coll_ids = [coll_id] if coll_id in coll_ids else []
    return Image.objects.filter(is_valid=True, coll_id__in=coll_ids), coll_ids


def query_vectors(vector, coll_ids, *, limit):
    model = RagClient.get_embedding_model()
    if not model or not coll_ids:
        return [], 0
    collection = RagClient.get_collection(collection_name(model))
    count = collection.count()
    if not count:
        return [], 0
    where = {'coll_id': coll_ids[0]} if len(coll_ids) == 1 else {'coll_id': {'$in': coll_ids}}
    result = collection.query(query_embeddings=[vector], where=where, n_results=min(count, limit), include=['distances'])
    return list(zip(result['ids'][0], result['distances'][0])), count


def rank_results(request, vector_matches, keyword='', coll_id=None, page=1, page_size=30):
    queryset, _ = visible_images(request, coll_id)
    model = RagClient.get_embedding_model()
    candidates = {}
    keyword = keyword.strip()
    if keyword:
        matches = queryset.filter(
            Q(title__icontains=keyword) | Q(tags__icontains=keyword) |
            Q(description__icontains=keyword) | Q(country__icontains=keyword) |
            Q(city__icontains=keyword) | Q(place_name__icontains=keyword)
        ).order_by('-updated_at')[:2000]
        for image in matches:
            tags = image.get_tags_list()
            if any(tag.casefold() == keyword.casefold() for tag in tags):
                score, reason = 10.0, '人工标签命中'
            elif keyword.casefold() in image.title.casefold():
                score, reason = 8.0, '标题命中'
            elif any(keyword.casefold() in tag.casefold() for tag in tags):
                score, reason = 7.0, '人工标签命中'
            else:
                score, reason = 5.0, '描述或地点命中'
            candidates[image.image_id] = (image, score, reason)
    ids = [image_id for image_id, _ in vector_matches]
    records = ImageVisualIndex.objects.in_bulk(ids, field_name='image_id') if ids else {}
    images = queryset.filter(image_id__in=ids).in_bulk(field_name='image_id') if ids else {}
    source_hashes = image_source_hashes(images.values())
    for image_id, distance in vector_matches:
        image, record = images.get(image_id), records.get(image_id)
        if not image or image_index_status(image, record, model, source_hash=source_hashes[image_id]) != 'indexed':
            continue
        score = 2.0 / (1.0 + max(0.0, float(distance)))
        previous = candidates.get(image_id)
        if previous:
            candidates[image_id] = (image, previous[1] + score, previous[2])
        else:
            candidates[image_id] = (image, score, '视觉描述相关')
    grouped = {}
    for image, score, reason in candidates.values():
        key = (image.coll_id, image.photo_group_id or image.image_id)
        if key not in grouped or score > grouped[key][1]:
            grouped[key] = (image, score, reason)
    ordered = sorted(grouped.values(), key=lambda item: (item[1], item[0].updated_at), reverse=True)
    offset = (page - 1) * page_size
    return ordered[offset:offset + page_size], len(ordered) > offset + page_size


def search_images(request, query, *, coll_id=None, page=1, page_size=30):
    _, coll_ids = visible_images(request, coll_id)
    vector_matches, vector_count = [], 0
    model = RagClient.get_embedding_model()
    vector_limit = max(100, page * page_size * 5)
    if model and coll_ids:
        vector = RagClient.create_embeddings([query], strict=True)
        vector_matches, vector_count = query_vectors(vector[0], coll_ids, limit=vector_limit)
    results, has_more = rank_results(request, vector_matches, query, coll_id, page, page_size)
    return results, has_more or (len(vector_matches) == vector_limit and vector_count > vector_limit and bool(results))


def search_by_vector(request, vector, *, coll_id=None, exclude_id='', limit=8):
    _, coll_ids = visible_images(request, coll_id)
    matches, _ = query_vectors(vector, coll_ids, limit=max(limit * 5, 40))
    matches = [(image_id, distance) for image_id, distance in matches if image_id != exclude_id]
    return rank_results(request, matches, coll_id=coll_id, page_size=limit)[0]


def similar_images(request, image, limit=8):
    model = RagClient.get_embedding_model()
    record = ImageVisualIndex.objects.filter(image=image).first()
    if image_index_status(image, record, model) != 'indexed':
        raise ValueError('这张图片尚未建立可用索引')
    stored = RagClient.get_collection(record.collection_name).get(ids=[image.image_id], include=['embeddings'])
    if len(stored['ids']) != 1:
        raise ValueError('本机索引缺失，请重新建立索引')
    return search_by_vector(request, stored['embeddings'][0], coll_id=image.coll_id, exclude_id=image.image_id, limit=limit)


def search_by_uploaded_image(request, image_bytes, *, coll_id=None, limit=30):
    visual_text, _ = AIService.image_visual_fingerprint(image_data_url(image_bytes))
    vector = RagClient.create_embeddings([visual_text], strict=True)
    return search_by_vector(request, vector[0], coll_id=coll_id, limit=limit)

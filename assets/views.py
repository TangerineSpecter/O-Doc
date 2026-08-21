import json
import logging
import mimetypes
import os

from django.conf import settings
from django.core.paginator import Paginator
from django.db.models import Q, Sum
from django.http import HttpResponse
from rest_framework.views import APIView

from article.models import Article
from anthology.models import Anthology
from utils.error_codes import ErrorCode
from utils.drf_utils import get_current_user_identifier
from utils.resource_assets import (
    delete_asset_record_and_file,
    extract_resource_ids_from_content,
    get_agent_resource_usage,
    get_article_resource_usage,
    get_image_resource_usage,
    is_asset_used_by_agent,
    is_asset_used_by_article,
    is_asset_used_by_image,
)
from utils.response_utils import success_result, error_result
from .models import Asset
from .serializers import AssetSerializer


logger = logging.getLogger(__name__)


def get_visible_anthology_ids(request):
    queryset = Anthology.objects.filter(is_valid=True)
    if request.user and request.user.is_authenticated:
        current_user_id = get_current_user_identifier(request)
        queryset = queryset.filter(Q(permission='public') | Q(user_id=current_user_id))
    else:
        queryset = queryset.filter(permission='public')
    return queryset.values_list('coll_id', flat=True)


def can_read_asset(request, asset):
    if request.user and request.user.is_authenticated and asset.uploader == get_current_user_identifier(request):
        return True

    visible_coll_ids = get_visible_anthology_ids(request)
    if asset.linked_article and asset.linked_article.is_valid and asset.linked_article.coll_id in visible_coll_ids:
        return True

    asset_id = str(asset.id)
    for article in Article.objects.filter(
            is_valid=True,
            coll_id__in=visible_coll_ids,
            content__contains='/api/resource/',
    ).only('content'):
        if asset_id in extract_resource_ids_from_content(article.content):
            return True

    if is_asset_used_by_image(asset.id):
        from article.models import Image

        return Image.objects.filter(
            is_valid=True,
            coll_id__in=visible_coll_ids,
            image_url=f'/api/resource/view/{asset.id}'
        ).exists()

    if is_asset_used_by_agent(asset.id):
        return True

    return False


class ResourceListView(APIView):
    """资源列表视图"""

    def get(self, request):
        """获取资源列表"""
        try:
            # 获取查询参数
            file_type = request.GET.get('type')
            search_query = request.GET.get('search_query')
            linked = request.GET.get('linked')
            source_type = request.GET.get('source_type')
            page = int(request.GET.get('page', 1))
            page_size = int(request.GET.get('page_size', 20))
            current_user_id = get_current_user_identifier(request)

            queryset = Asset.objects.filter(is_valid=True, uploader=current_user_id)
            article_usage = get_article_resource_usage()
            article_linked_resource_ids = set(article_usage.keys())
            image_usage = get_image_resource_usage()
            image_linked_resource_ids = set(image_usage.keys())
            agent_usage = get_agent_resource_usage()
            agent_linked_resource_ids = set(agent_usage.keys())
            content_linked_resource_ids = article_linked_resource_ids | image_linked_resource_ids | agent_linked_resource_ids

            # 筛选条件
            if file_type:
                queryset = queryset.filter(file_type=file_type)

            if search_query:
                queryset = queryset.filter(
                    Q(name__icontains=search_query) |
                    Q(original_name__icontains=search_query)
                )

            if linked:
                is_linked = linked.lower() == 'true'
                if is_linked:
                    queryset = queryset.filter(Q(is_linked=True) | Q(id__in=content_linked_resource_ids))
                else:
                    queryset = queryset.filter(is_linked=False).exclude(id__in=content_linked_resource_ids)

            if source_type:
                queryset = queryset.filter(source_type=source_type)

            # 分页
            paginator = Paginator(queryset, page_size)
            page_obj = paginator.get_page(page)

            # 序列化数据
            serializer = AssetSerializer(page_obj, many=True)
            page_resource_ids = {asset['id'] for asset in serializer.data}
            page_article_usage = get_article_resource_usage(page_resource_ids)
            page_image_usage = get_image_resource_usage(page_resource_ids)
            page_agent_usage = get_agent_resource_usage(page_resource_ids)
            resources = []
            for asset in serializer.data:
                source_article = asset['sourceArticle'] or page_article_usage.get(asset['id'])
                source_image = page_image_usage.get(asset['id'])
                source_agent = page_agent_usage.get(asset['id'])
                resource_data = {
                    'id': asset['id'],
                    'name': asset['name'],
                    'type': asset['file_type'],
                    'size': asset['file_size'],
                    'date': asset['upload_time'],
                    'linked': asset['is_linked'] or bool(source_article) or bool(source_image) or bool(source_agent),
                    'sourceArticle': source_article,
                    'sourceImage': source_image,
                    'sourceAgent': source_agent,
                    'sourceType': asset['source_type']
                }
                resources.append(resource_data)

            # 计算总文件大小
            total_size = queryset.aggregate(total=Sum('file_size'))['total'] or 0

            # 格式化总文件大小
            def format_size(size):
                """格式化文件大小"""
                for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                    if size < 1024.0:
                        return {'size': round(size, 1), 'unit': unit}
                    size /= 1024.0
                return {'size': round(size, 1), 'unit': 'PB'}

            formatted_total_size = format_size(total_size)

            # 按类型计算空间大小
            type_sizes = queryset.values('file_type').annotate(size=Sum('file_size'))
            formatted_type_sizes = {item['file_type']: format_size(item['size']) for item in type_sizes}

            return success_result({
                'list': resources,
                'total': paginator.count,
                'page': page,
                'pageSize': page_size,
                'hasMore': page_obj.has_next(),
                'totalSize': total_size,  # 总文件大小（字节）
                'formattedTotalSize': formatted_total_size,  # 格式化的总文件大小
                'typeSizes': formatted_type_sizes  # 按类型统计的空间大小
            })

        except Exception:
            logger.exception('Failed to list resources: page=%s', request.query_params.get('page'))
            return error_result(ErrorCode.SYSTEM_ERROR)


class ResourceCreateView(APIView):
    """创建资源视图"""

    def post(self, request):
        """创建新资源"""
        try:
            # 使用序列化器验证和保存数据
            data = request.data
            if isinstance(data, str):
                data = json.loads(data)

            data['uploader'] = get_current_user_identifier(request)

            serializer = AssetSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            asset = serializer.save()

            return success_result({
                'id': asset.id,
                'name': asset.name,
                'type': asset.file_type,
                'size': asset.file_size,
                'date': asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                'linked': asset.is_linked,
                'sourceArticle': None,
                'sourceType': asset.source_type
            })

        except Exception:
            logger.exception('Failed to create resource metadata')
            return error_result(ErrorCode.SYSTEM_ERROR)


class ResourceUpdateView(APIView):
    """更新资源视图"""

    def put(self, request, resource_id):
        """更新资源信息"""
        try:
            try:
                current_user_id = get_current_user_identifier(request)
                asset = Asset.objects.get(id=resource_id, is_valid=True, uploader=current_user_id)
            except Asset.DoesNotExist:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            # 使用序列化器验证和更新数据
            data = request.data
            if isinstance(data, str):
                data = json.loads(data)

            # 处理关联文章
            if 'linked_article_id' in data:
                if data['linked_article_id']:
                    try:
                        article = Article.objects.get(
                            article_id=data['linked_article_id'],
                            author=current_user_id,
                            is_valid=True
                        )
                        data['linked_article'] = article.article_id
                        data['is_linked'] = True
                    except Article.DoesNotExist:
                        return error_result(ErrorCode.ARTICLE_NOT_EXIST)
                else:
                    data['linked_article'] = None
                    data['is_linked'] = False

            serializer = AssetSerializer(asset, data=data, partial=True)
            serializer.is_valid(raise_exception=True)
            updated_asset = serializer.save()

            return success_result({
                'id': updated_asset.id,
                'name': updated_asset.name,
                'type': updated_asset.file_type,
                'size': updated_asset.file_size,
                'date': updated_asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                'linked': updated_asset.is_linked,
                'sourceArticle': updated_asset.get_source_info(),
                'sourceType': updated_asset.source_type
            })

        except Exception:
            logger.exception('Failed to update resource: resource_id=%s', resource_id)
            return error_result(ErrorCode.SYSTEM_ERROR)


class ResourceDeleteView(APIView):
    """删除资源视图"""

    def delete(self, request, resource_id):
        """删除资源（硬删除 + 物理文件删除）"""
        try:
            current_user_id = get_current_user_identifier(request)
            try:
                asset = Asset.objects.get(id=resource_id, is_valid=True, uploader=current_user_id)
            except Asset.DoesNotExist:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            # 检查是否已关联文章
            if asset.is_linked:
                return error_result(ErrorCode.RESOURCE_IS_LINKED)

            if is_asset_used_by_image(asset.id):
                return error_result(ErrorCode.RESOURCE_IS_LINKED)

            if is_asset_used_by_article(asset.id):
                return error_result(ErrorCode.RESOURCE_IS_LINKED)

            if is_asset_used_by_agent(asset.id):
                return error_result(ErrorCode.RESOURCE_IS_LINKED)

            # 执行删除 (硬删除)
            delete_asset_record_and_file(asset)

            return success_result()

        except Exception:
            logger.exception('Failed to delete resource: resource_id=%s', resource_id)
            return error_result(ErrorCode.SYSTEM_ERROR)


class ResourceDownloadView(APIView):
    """下载资源视图"""

    def get(self, request, resource_id):
        """下载资源文件"""
        try:
            try:
                asset = Asset.objects.get(id=resource_id, is_valid=True)
            except Asset.DoesNotExist:
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            if not can_read_asset(request, asset):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            # 检查文件是否存在并读取文件
            abs_file_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
            if not os.path.exists(abs_file_path):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            with open(abs_file_path, 'rb') as f:
                file_content = f.read()

            # 设置响应
            response = HttpResponse(file_content, content_type=asset.mime_type or 'application/octet-stream')
            # 根据文件类型设置不同的Content-Disposition
            if asset.file_type == 'image':
                response['Content-Disposition'] = f'inline; filename="{asset.original_name}"'
                # IDs are immutable; allow a short private cache.
                response['Cache-Control'] = 'private, max-age=3600'
            else:
                response['Content-Disposition'] = f'attachment; filename="{asset.original_name}"'
            response['Content-Length'] = asset.file_size

            return response

        except Exception:
            logger.exception('Failed to download resource: resource_id=%s', resource_id)
            return error_result(ErrorCode.SYSTEM_ERROR)


class ResourceUploadView(APIView):
    """资源上传视图"""

    def post(self, request):
        """上传资源文件"""
        try:
            if 'file' not in request.FILES:
                return error_result(ErrorCode.UPLOAD_RESOURCE_NOT_FOUND)

            uploaded_file = request.FILES['file']

            # 文件大小限制 (50MB)
            max_size = 50 * 1024 * 1024
            if uploaded_file.size > max_size:
                return error_result(ErrorCode.UPLOAD_RESOURCE_MORE_THAN_MAX_SIZE)

            # 生成唯一文件名
            import uuid
            import hashlib

            # 计算文件哈希
            file_hash = hashlib.md5()
            for chunk in uploaded_file.chunks():
                file_hash.update(chunk)
            file_hash_hex = file_hash.hexdigest()

            # 检查是否已存在相同文件
            current_user_id = get_current_user_identifier(request)
            linked_article_id = request.data.get('linked_article_id')
            if linked_article_id and not Article.objects.filter(
                article_id=linked_article_id,
                author=current_user_id,
                is_valid=True,
            ).exists():
                return error_result(ErrorCode.ARTICLE_NOT_EXIST)

            existing_asset = Asset.objects.filter(
                file_hash=file_hash_hex,
                uploader=current_user_id,
                is_valid=True
            ).first()
            if existing_asset:
                try:
                    # 获取关联文章信息（处理可能的异常）
                    source_article = None
                    if existing_asset.linked_article:
                        source_article = existing_asset.get_source_info()

                    return success_result({
                        'id': existing_asset.id,
                        'name': existing_asset.name,
                        'type': existing_asset.file_type,
                        'size': existing_asset.file_size,
                        'date': existing_asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                        'linked': existing_asset.is_linked,
                        'sourceType': existing_asset.source_type,
                        'sourceArticle': source_article,
                        'duplicate': True  # 标记为重复文件
                    })
                except Exception:
                    # 记录异常并返回新上传的文件
                    logger.exception('Failed to process duplicate asset: asset_id=%s', existing_asset.id)
                    # 继续执行上传逻辑，不使用重复文件

            # 确定文件类型
            file_extension = os.path.splitext(uploaded_file.name)[1].lower()
            mime_type = mimetypes.guess_type(uploaded_file.name)[0] or 'application/octet-stream'

            # 根据扩展名确定文件类型
            if file_extension in ['.pdf', '.doc', '.docx', '.txt', '.md', '.xls', '.xlsx', '.csv', '.ppt', '.pptx']:
                file_type = 'document'
            elif file_extension in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg']:
                file_type = 'image'
            elif file_extension in ['.mp3', '.wav', '.flac', '.aac']:
                file_type = 'audio'
            elif file_extension in ['.mp4', '.avi', '.mov', '.wmv', '.flv']:
                file_type = 'video'
            elif file_extension in ['.zip', '.rar', '.7z', '.tar', '.gz']:
                file_type = 'archive'
            elif file_extension in ['.py', '.js', '.html', '.css', '.java', '.cpp']:
                file_type = 'code'
            else:
                file_type = 'other'

            # 创建存储目录
            upload_dir = os.path.join(settings.MEDIA_ROOT, file_type)
            os.makedirs(upload_dir, exist_ok=True)

            # 生成文件名
            file_id = str(uuid.uuid4()).replace('-', '')[:16]
            file_name = f"{file_id}{file_extension}"
            abs_file_path = os.path.join(upload_dir, file_name)
            # 存储相对路径（相对于MEDIA_ROOT）
            rel_file_path = os.path.join(file_type, file_name)

            # 保存文件
            with open(abs_file_path, 'wb+') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)

            # 获取请求参数
            source_type = request.data.get('source_type', 'other')
            # 验证source_type是否合法
            valid_source_types = [choice[0] for choice in Asset.SOURCE_TYPE_CHOICES]
            if source_type not in valid_source_types:
                source_type = 'other'

            # 创建资源数据
            asset_data = {
                'id': file_id,
                'name': uploaded_file.name,
                'original_name': uploaded_file.name,
                'file_type': file_type,
                'file_size': uploaded_file.size,
                'file_path': rel_file_path,  # 存储相对路径
                'file_extension': file_extension,
                'mime_type': mime_type,
                'file_hash': file_hash_hex,
                'uploader': current_user_id,
                'source_type': source_type
            }

            # 处理关联文章
            if linked_article_id:
                asset_data['linked_article'] = linked_article_id
                asset_data['is_linked'] = True

            # 使用序列化器创建资源记录
            serializer = AssetSerializer(data=asset_data)
            serializer.is_valid(raise_exception=True)
            asset = serializer.save()

            return success_result({
                'id': asset.id,
                'name': asset.name,
                'type': asset.file_type,
                'size': asset.formatted_size,
                'date': asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                'linked': asset.is_linked,
                'sourceType': asset.source_type,
                'sourceArticle': asset.get_source_info(),
                'duplicate': False
            })

        except Exception:
            logger.exception('Failed to upload resource: filename=%s', request.FILES.get('file').name if request.FILES.get('file') else '')
            return error_result(ErrorCode.SYSTEM_ERROR)

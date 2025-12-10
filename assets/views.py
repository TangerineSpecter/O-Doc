from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.views import View
from django.core.paginator import Paginator
from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from utils.decorators import login_required_ajax
from utils.response import success_response, error_response
from utils.constants import ErrorCode
from .models import Asset
import json
import mimetypes
import os
from django.conf import settings


@method_decorator(login_required_ajax, name='dispatch')
class ResourceListView(View):
    """资源列表视图"""
    
    def get(self, request):
        """获取资源列表"""
        try:
            # 获取查询参数
            file_type = request.GET.get('type')
            search_query = request.GET.get('searchQuery')
            linked = request.GET.get('linked')
            page = int(request.GET.get('page', 1))
            page_size = int(request.GET.get('pageSize', 20))
            
            # 基础查询集
            queryset = Asset.objects.filter(is_valid=True)
            
            # 筛选条件
            if file_type:
                queryset = queryset.filter(file_type=file_type)
            
            if search_query:
                queryset = queryset.filter(
                    Q(name__icontains=search_query) | 
                    Q(original_name__icontains=search_query)
                )
            
            if linked is not None:
                is_linked = linked.lower() == 'true'
                queryset = queryset.filter(is_linked=is_linked)
            
            # 分页
            paginator = Paginator(queryset, page_size)
            page_obj = paginator.get_page(page)
            
            # 序列化数据
            resources = []
            for asset in page_obj:
                resource_data = {
                    'id': asset.id,
                    'name': asset.name,
                    'type': asset.file_type,
                    'size': asset.formatted_size,
                    'date': asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                    'linked': asset.is_linked,
                    'sourceArticle': asset.get_source_info()
                }
                resources.append(resource_data)
            
            return success_response({
                'list': resources,
                'total': paginator.count,
                'page': page,
                'pageSize': page_size,
                'hasMore': page_obj.has_next()
            })
            
        except Exception as e:
            return error_response(str(e), ErrorCode.PARAMETER_ERROR)


@method_decorator(login_required_ajax, name='dispatch')
class ResourceCreateView(View):
    """创建资源视图"""
    
    def post(self, request):
        """创建新资源"""
        try:
            data = json.loads(request.body)
            
            # 必填字段验证
            required_fields = ['name', 'file_type', 'file_size', 'file_path']
            for field in required_fields:
                if field not in data:
                    return error_response(f'缺少必填字段: {field}', ErrorCode.PARAMETER_ERROR)
            
            # 创建资源
            asset = Asset.objects.create(
                id=data.get('id'),  # 如果提供了ID就使用，否则自动生成
                name=data['name'],
                original_name=data.get('original_name', data['name']),
                file_type=data['file_type'],
                file_size=data['file_size'],
                file_path=data['file_path'],
                file_extension=data.get('file_extension', ''),
                mime_type=data.get('mime_type', ''),
                file_hash=data.get('file_hash', ''),
                metadata=data.get('metadata', {}),
                uploader=request.user if request.user.is_authenticated else None
            )
            
            return success_response({
                'id': asset.id,
                'name': asset.name,
                'type': asset.file_type,
                'size': asset.formatted_size,
                'date': asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                'linked': asset.is_linked,
                'sourceArticle': None
            })
            
        except Exception as e:
            return error_response(str(e), ErrorCode.PARAMETER_ERROR)


@method_decorator(login_required_ajax, name='dispatch')
class ResourceUpdateView(View):
    """更新资源视图"""
    
    def put(self, request, resource_id):
        """更新资源信息"""
        try:
            data = json.loads(request.body)
            
            # 查找资源
            try:
                asset = Asset.objects.get(id=resource_id, is_valid=True)
            except Asset.DoesNotExist:
                return error_response('资源不存在', ErrorCode.NOT_FOUND)
            
            # 更新字段
            update_fields = []
            
            if 'name' in data:
                asset.name = data['name']
                update_fields.append('name')
            
            if 'linked_article_id' in data:
                if data['linked_article_id']:
                    try:
                        article = Article.objects.get(id=data['linked_article_id'])
                        asset.linked_article = article
                        asset.is_linked = True
                    except Article.DoesNotExist:
                        return error_response('关联的文章不存在', ErrorCode.NOT_FOUND)
                else:
                    asset.linked_article = None
                    asset.is_linked = False
                
                update_fields.extend(['linked_article', 'is_linked'])
            
            if update_fields:
                asset.save(update_fields=update_fields)
            
            return success_response({
                'id': asset.id,
                'name': asset.name,
                'type': asset.file_type,
                'size': asset.formatted_size,
                'date': asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                'linked': asset.is_linked,
                'sourceArticle': asset.get_source_info()
            })
            
        except Exception as e:
            return error_response(str(e), ErrorCode.PARAMETER_ERROR)


@method_decorator(login_required_ajax, name='dispatch')
class ResourceDeleteView(View):
    """删除资源视图"""
    
    def delete(self, request, resource_id):
        """删除资源（软删除）"""
        try:
            try:
                asset = Asset.objects.get(id=resource_id, is_valid=True)
            except Asset.DoesNotExist:
                return error_response('资源不存在', ErrorCode.NOT_FOUND)
            
            # 执行软删除
            asset.soft_delete()
            
            return success_response({'message': '删除成功'})
            
        except Exception as e:
            return error_response(str(e), ErrorCode.PARAMETER_ERROR)


@method_decorator(login_required_ajax, name='dispatch')
class ResourceDownloadView(View):
    """下载资源视图"""
    
    def get(self, request, resource_id):
        """下载资源文件"""
        try:
            try:
                asset = Asset.objects.get(id=resource_id, is_valid=True)
            except Asset.DoesNotExist:
                return error_response('资源不存在', ErrorCode.NOT_FOUND)
            
            # 检查文件是否存在
            if not os.path.exists(asset.file_path):
                return error_response('文件不存在', ErrorCode.NOT_FOUND)
            
            # 读取文件
            with open(asset.file_path, 'rb') as f:
                file_content = f.read()
            
            # 设置响应
            response = HttpResponse(file_content, content_type=asset.mime_type or 'application/octet-stream')
            response['Content-Disposition'] = f'attachment; filename="{asset.original_name}"'
            response['Content-Length'] = asset.file_size
            
            return response
            
        except Exception as e:
            return error_response(str(e), ErrorCode.PARAMETER_ERROR)


@method_decorator(login_required_ajax, name='dispatch')
class ResourceUploadView(View):
    """资源上传视图"""
    
    def post(self, request):
        """上传资源文件"""
        try:
            if 'file' not in request.FILES:
                return error_response('未找到上传的文件', ErrorCode.PARAMETER_ERROR)
            
            uploaded_file = request.FILES['file']
            
            # 文件大小限制 (50MB)
            max_size = 50 * 1024 * 1024
            if uploaded_file.size > max_size:
                return error_response('文件大小超过50MB限制', ErrorCode.PARAMETER_ERROR)
            
            # 生成唯一文件名
            import uuid
            import hashlib
            
            # 计算文件哈希
            file_hash = hashlib.md5()
            for chunk in uploaded_file.chunks():
                file_hash.update(chunk)
            file_hash_hex = file_hash.hexdigest()
            
            # 检查是否已存在相同文件
            existing_asset = Asset.get_by_hash(file_hash_hex)
            if existing_asset:
                return success_response({
                    'id': existing_asset.id,
                    'name': existing_asset.name,
                    'type': existing_asset.file_type,
                    'size': existing_asset.formatted_size,
                    'date': existing_asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                    'linked': existing_asset.is_linked,
                    'sourceArticle': existing_asset.get_source_info(),
                    'duplicate': True  # 标记为重复文件
                })
            
            # 确定文件类型
            file_extension = os.path.splitext(uploaded_file.name)[1].lower()
            mime_type = mimetypes.guess_type(uploaded_file.name)[0] or 'application/octet-stream'
            
            # 根据扩展名确定文件类型
            if file_extension in ['.pdf', '.doc', '.docx', '.txt', '.md']:
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
            upload_dir = os.path.join(settings.MEDIA_ROOT, 'assets', file_type)
            os.makedirs(upload_dir, exist_ok=True)
            
            # 生成文件名
            file_id = str(uuid.uuid4()).replace('-', '')[:16]
            file_name = f"{file_id}{file_extension}"
            file_path = os.path.join(upload_dir, file_name)
            
            # 保存文件
            with open(file_path, 'wb+') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            
            # 创建资源记录
            asset = Asset.objects.create(
                id=file_id,
                name=uploaded_file.name,
                original_name=uploaded_file.name,
                file_type=file_type,
                file_size=uploaded_file.size,
                file_path=file_path,
                file_extension=file_extension,
                mime_type=mime_type,
                file_hash=file_hash_hex,
                uploader=request.user if request.user.is_authenticated else None
            )
            
            return success_response({
                'id': asset.id,
                'name': asset.name,
                'type': asset.file_type,
                'size': asset.formatted_size,
                'date': asset.upload_time.strftime('%Y-%m-%d %H:%M:%S'),
                'linked': asset.is_linked,
                'sourceArticle': None,
                'duplicate': False
            })
            
        except Exception as e:
            return error_response(str(e), ErrorCode.PARAMETER_ERROR)

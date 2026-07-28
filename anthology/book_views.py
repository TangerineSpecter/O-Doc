import hashlib
import mimetypes
import os
import tempfile
import uuid

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.views import APIView

from assets.models import Asset
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, error_result
from utils.error_codes import ErrorCode
from .models import Anthology, Book, BookReadingProgress
from .views import get_visible_anthology_queryset, get_owned_anthology_queryset

ALLOWED_EXTENSIONS = {'.pdf': 'pdf', '.txt': 'txt', '.epub': 'epub', '.mobi': 'mobi'}
MAX_BOOK_SIZE = 500 * 1024 * 1024


def _book_for_read(request, book_id):
    return Book.objects.select_related('asset', 'cover_asset', 'anthology').get(
        book_id=book_id, is_valid=True, anthology__in=get_visible_anthology_queryset(request))


def _book_for_owner(request, book_id):
    return Book.objects.select_related('asset', 'cover_asset', 'anthology').get(
        book_id=book_id, is_valid=True, anthology__in=get_owned_anthology_queryset(request))


def _asset_path(asset):
    return os.path.join(settings.MEDIA_ROOT, asset.file_path)


class BookListView(APIView):
    def get(self, request, coll_id):
        anthology = get_visible_anthology_queryset(request).filter(coll_id=coll_id, type='book').first()
        if not anthology:
            return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        user_id = get_current_user_identifier(request)
        books = Book.objects.filter(anthology=anthology, is_valid=True).select_related('asset', 'cover_asset')
        result = []
        for book in books:
            progress = BookReadingProgress.objects.filter(book=book, user_id=user_id).first()
            result.append({
                'bookId': book.book_id, 'title': book.title, 'author': book.author, 'format': book.book_format,
                'size': book.asset.file_size, 'formattedSize': book.asset.formatted_size,
                'coverUrl': f'/api/anthology/book/{book.book_id}/cover', 'localState': book.local_state,
                'remoteAvailable': book.remote_available, 'createdAt': book.created_at,
                'progress': progress.progress if progress else 0, 'lastReadAt': progress.last_read_at if progress else None,
                'canRead': book.book_format != 'mobi',
            })
        return success_result(result)


class BookUploadView(APIView):
    def post(self, request, coll_id):
        anthology = get_owned_anthology_queryset(request).filter(coll_id=coll_id, type='book').first()
        upload = request.FILES.get('file')
        if not anthology or not upload:
            return error_result(ErrorCode.UPLOAD_RESOURCE_NOT_FOUND)
        ext = os.path.splitext(upload.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS or upload.size > MAX_BOOK_SIZE:
            return error_result(ErrorCode.UPLOAD_RESOURCE_MORE_THAN_MAX_SIZE)
        digest = hashlib.md5()
        for chunk in upload.chunks(): digest.update(chunk)
        file_hash = digest.hexdigest()
        user_id = get_current_user_identifier(request)
        existing = Asset.objects.filter(file_hash=file_hash, uploader=user_id, is_valid=True).first()
        if existing:
            asset = existing
        else:
            file_id = uuid.uuid4().hex[:16]
            rel_path = os.path.join('books', file_id + ext)
            abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            with open(abs_path, 'wb') as out:
                for chunk in upload.chunks(): out.write(chunk)
            asset = Asset.objects.create(id=file_id, name=upload.name, original_name=upload.name,
                file_type='document', file_size=upload.size, file_path=rel_path, file_extension=ext,
                mime_type=mimetypes.guess_type(upload.name)[0] or 'application/octet-stream', uploader=user_id,
                file_hash=file_hash, source_type='other', metadata={'book': True})
        local_file_exists = os.path.isfile(_asset_path(asset))
        synced_book = Book.objects.filter(
            asset=asset,
            is_valid=True,
            remote_available=True,
            remote_hash=asset.file_hash,
        ).first()
        # Reusing a released Asset must not create a misleading local entry: the body is
        # absent locally but can be restored from the verified WebDAV copy.
        if not local_file_exists and not synced_book:
            return error_result(ErrorCode.RESOURCE_NOT_FOUND, message='重复资源的本地文件与云端副本均不可用')

        title = request.data.get('title') or os.path.splitext(upload.name)[0]
        book = Book.objects.create(anthology=anthology, asset=asset, title=title[:255],
            author=(request.data.get('author') or '')[:255], book_format=ALLOWED_EXTENSIONS[ext],
            local_state='local' if local_file_exists else 'cloud_only',
            remote_available=bool(synced_book), remote_hash=asset.file_hash if synced_book else '')
        anthology.update_stats()
        return success_result({'bookId': book.book_id})


class BookFileView(APIView):
    def get(self, request, book_id):
        try: book = _book_for_read(request, book_id)
        except Book.DoesNotExist: return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        path = _asset_path(book.asset)
        if not os.path.isfile(path):
            return error_result(ErrorCode.RESOURCE_NOT_FOUND, message='图书仅在云端，请先恢复本地副本')
        return FileResponse(open(path, 'rb'), content_type=book.asset.mime_type, as_attachment=book.book_format == 'mobi', filename=book.asset.original_name)


class BookCoverView(APIView):
    def get(self, request, book_id):
        try: book = _book_for_read(request, book_id)
        except Book.DoesNotExist: raise Http404
        if book.cover_asset and os.path.isfile(_asset_path(book.cover_asset)):
            return FileResponse(open(_asset_path(book.cover_asset), 'rb'), content_type=book.cover_asset.mime_type)
        # A deliberately lightweight fallback cover, rendered by the frontend when no cover bytes exist.
        raise Http404


class BookProgressView(APIView):
    def get(self, request, book_id):
        try: book = _book_for_read(request, book_id)
        except Book.DoesNotExist: return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        progress = BookReadingProgress.objects.filter(book=book, user_id=get_current_user_identifier(request)).first()
        return success_result({'location': progress.location if progress else '', 'progress': progress.progress if progress else 0})

    def put(self, request, book_id):
        try: book = _book_for_read(request, book_id)
        except Book.DoesNotExist: return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        raw_progress = float(request.data.get('progress', 0))
        progress, _ = BookReadingProgress.objects.update_or_create(book=book, user_id=get_current_user_identifier(request),
            defaults={'location': str(request.data.get('location', ''))[:5000], 'progress': max(0, min(100, raw_progress))})
        return success_result({'progress': progress.progress, 'location': progress.location})


class BookReleaseView(APIView):
    def post(self, request, book_id):
        try: book = _book_for_owner(request, book_id)
        except Book.DoesNotExist: return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        if not book.remote_available or book.remote_hash != book.asset.file_hash:
            return error_result(ErrorCode.WEBDEV_ERROR, message='该书尚未完成安全同步，不能释放本地副本')
        try: os.remove(_asset_path(book.asset))
        except FileNotFoundError: pass
        book.local_state = 'cloud_only'; book.save(update_fields=['local_state', 'updated_at'])
        return success_result({'localState': book.local_state})


class BookRestoreView(APIView):
    def post(self, request, book_id):
        try: book = _book_for_read(request, book_id)
        except Book.DoesNotExist: return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        if book.local_state == 'local' and os.path.isfile(_asset_path(book.asset)):
            return success_result({'localState': 'local'})
        if not book.remote_available:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG, message='云端副本不可用')
        from system_settings.models import SystemSetting
        from utils.webdav import WebDavClient
        config = (SystemSetting.objects.filter(key='system_webdav_config').first() or type('X', (), {'value': {}})()).value or {}
        if not config.get('enabled'): return error_result(ErrorCode.WEBDEV_NOT_CONFIG)
        from utils.sync_manager import SyncManager
        client = WebDavClient(config['url'], config['username'], config['password'])
        manager = SyncManager(client, config.get('remote_path') or config.get('remotePath') or '/o-doc-sync/')
        path = _asset_path(book.asset)
        target_dir = os.path.dirname(path)
        os.makedirs(target_dir, exist_ok=True)
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix='.book-restore-', dir=target_dir, delete=False) as temp_file:
                temp_path = temp_file.name
            if not client.download_file(f'{manager.media_dir}/{book.asset.file_path}', temp_path):
                return error_result(ErrorCode.WEBDEV_DOWNLOAD_FAIL)

            digest = hashlib.md5()
            with open(temp_path, 'rb') as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    digest.update(chunk)
            if digest.hexdigest() != book.asset.file_hash:
                return error_result(ErrorCode.WEBDEV_DOWNLOAD_FAIL, message='云端文件校验失败')

            os.replace(temp_path, path)
            temp_path = None
            book.local_state = 'local'; book.save(update_fields=['local_state', 'updated_at'])
            return success_result({'localState': 'local'})
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)


class BookDeleteView(APIView):
    def delete(self, request, book_id):
        try: book = _book_for_owner(request, book_id)
        except Book.DoesNotExist: return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        book.is_valid = False; book.save(update_fields=['is_valid', 'updated_at']); book.anthology.update_stats()
        return success_result()

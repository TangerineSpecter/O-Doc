import hashlib
import mimetypes
import os
import uuid
import posixpath
import zipfile
from xml.etree import ElementTree

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.views import APIView

from assets.models import Asset
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, error_result
from utils.error_codes import ErrorCode
from utils.sync_manager import SyncError
from .models import Anthology, Book, BookReadingProgress
from .views import get_visible_anthology_queryset, get_owned_anthology_queryset

ALLOWED_EXTENSIONS = {'.pdf': 'pdf', '.txt': 'txt', '.epub': 'epub', '.mobi': 'mobi'}
MAX_BOOK_SIZE = 500 * 1024 * 1024
MAX_EPUB_METADATA_SIZE = 2 * 1024 * 1024
MAX_EPUB_COVER_SIZE = 20 * 1024 * 1024
MAX_PDF_COVER_EDGE = 1600


def _book_for_read(request, book_id):
    return Book.objects.select_related('asset', 'cover_asset', 'anthology').get(
        book_id=book_id, is_valid=True, anthology__in=get_visible_anthology_queryset(request))


def _book_for_owner(request, book_id):
    return Book.objects.select_related('asset', 'cover_asset', 'anthology').get(
        book_id=book_id, is_valid=True, anthology__in=get_owned_anthology_queryset(request))


def _asset_path(asset):
    return os.path.join(settings.MEDIA_ROOT, asset.file_path)


def _soft_delete_orphaned_book_asset(asset):
    """仅回收未被有效图书使用、且明确由书架创建的 Asset。"""
    if not asset:
        return
    metadata = asset.metadata if isinstance(asset.metadata, dict) else {}
    if not (metadata.get('book') or metadata.get('book_cover')):
        return
    if asset.linked_article_id:
        return
    if Book.objects.filter(asset=asset, is_valid=True).exists():
        return
    if Book.objects.filter(cover_asset=asset, is_valid=True).exists():
        return
    asset.is_valid = False
    asset.save(update_fields=['is_valid'])


def _read_epub_member(archive, path, max_size):
    """Read a small EPUB member without allowing a compressed entry to exhaust memory."""
    info = archive.getinfo(path)
    if info.file_size > max_size:
        return None
    with archive.open(info) as source:
        data = source.read(max_size + 1)
    return data if len(data) <= max_size else None


def _epub_metadata_and_cover(path):
    """Read the OPF package in an EPUB archive and return its title, author and cover bytes."""
    if not zipfile.is_zipfile(path):
        return '', '', None, ''
    try:
        with zipfile.ZipFile(path) as archive:
            container_bytes = _read_epub_member(archive, 'META-INF/container.xml', MAX_EPUB_METADATA_SIZE)
            if not container_bytes:
                return '', '', None, ''
            container = ElementTree.fromstring(container_bytes)
            rootfile = container.find('.//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile')
            if rootfile is None or not rootfile.get('full-path'):
                return '', '', None, ''
            opf_path = rootfile.get('full-path')
            opf_bytes = _read_epub_member(archive, opf_path, MAX_EPUB_METADATA_SIZE)
            if not opf_bytes:
                return '', '', None, ''
            package = ElementTree.fromstring(opf_bytes)
            metadata = package.find('{http://www.idpf.org/2007/opf}metadata')
            manifest = package.find('{http://www.idpf.org/2007/opf}manifest')
            if metadata is None or manifest is None:
                return '', '', None, ''

            title_node = metadata.find('{http://purl.org/dc/elements/1.1/}title')
            creator_node = metadata.find('{http://purl.org/dc/elements/1.1/}creator')
            title = (title_node.text or '').strip() if title_node is not None else ''
            author = (creator_node.text or '').strip() if creator_node is not None else ''

            cover_id = ''
            for item in manifest.findall('{http://www.idpf.org/2007/opf}item'):
                if 'cover-image' in (item.get('properties') or '').split():
                    cover_id = item.get('id') or ''
                    break
            if not cover_id:
                for meta in metadata.findall('{http://www.idpf.org/2007/opf}meta'):
                    if meta.get('name') == 'cover':
                        cover_id = meta.get('content') or ''
                        break
            cover_item = next((item for item in manifest.findall('{http://www.idpf.org/2007/opf}item') if item.get('id') == cover_id), None)
            if cover_item is None or not cover_item.get('href'):
                return title, author, None, ''
            cover_path = posixpath.normpath(posixpath.join(posixpath.dirname(opf_path), cover_item.get('href')))
            cover_bytes = _read_epub_member(archive, cover_path, MAX_EPUB_COVER_SIZE)
            return title, author, cover_bytes, cover_item.get('media-type') or ''
    except (ElementTree.ParseError, KeyError, OSError, zipfile.BadZipFile):
        return '', '', None, ''


def _clean_pdf_metadata(value):
    """Normalize PDF metadata, which often contains nulls or non-string values."""
    return str(value or '').replace('\x00', '').strip()


def _pdf_metadata_and_cover(path, include_cover=True):
    """Read PDF document metadata and render its first page as a bookshelf cover."""
    try:
        import fitz
        with fitz.open(path) as document:
            metadata = document.metadata or {}
            title = _clean_pdf_metadata(metadata.get('title'))
            author = _clean_pdf_metadata(metadata.get('author'))
            if not include_cover or document.page_count < 1:
                return title, author, None, ''
            page = document.load_page(0)
            page_rect = page.rect
            longest_edge = max(float(page_rect.width), float(page_rect.height), 1)
            scale = max(0.5, min(2.0, MAX_PDF_COVER_EDGE / longest_edge))
            pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
            return title, author, pixmap.tobytes('png'), 'image/png'
    except (ImportError, OSError, RuntimeError, ValueError):
        return '', '', None, ''


def _persist_book_cover(book, cover_bytes, cover_mime):
    if not cover_bytes or book.cover_asset:
        return False
    extension = mimetypes.guess_extension(cover_mime) or '.jpg'
    cover_id = uuid.uuid4().hex[:16]
    rel_path = os.path.join('book_covers', cover_id + extension)
    abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, 'wb') as output:
        output.write(cover_bytes)
    book.cover_asset = Asset.objects.create(
        id=cover_id, name=os.path.basename(rel_path), original_name=os.path.basename(rel_path),
        file_type='image', file_size=len(cover_bytes), file_path=rel_path, file_extension=extension,
        mime_type=cover_mime or 'image/jpeg', uploader=book.asset.uploader,
        file_hash=hashlib.md5(cover_bytes).hexdigest(), source_type='other',
        metadata={'book_cover': True, 'source_format': book.book_format},
    )
    return True


def _extract_epub_details(book):
    """Persist metadata and cover available inside a local EPUB; harmless for older imports."""
    if book.book_format != 'epub' or not os.path.isfile(_asset_path(book.asset)):
        return
    title, author, cover_bytes, cover_mime = _epub_metadata_and_cover(_asset_path(book.asset))
    changed = []
    if title and (not book.title or book.title == os.path.splitext(book.asset.original_name)[0]):
        book.title = title[:255]
        changed.append('title')
    if author and not book.author:
        book.author = author[:255]
        changed.append('author')
    if _persist_book_cover(book, cover_bytes, cover_mime):
        changed.append('cover_asset')
    if changed:
        book.save(update_fields=[*changed, 'updated_at'])


def _extract_pdf_details(book, include_cover=True):
    """Persist metadata and a first-page cover for a local PDF."""
    if book.book_format != 'pdf' or not os.path.isfile(_asset_path(book.asset)):
        return
    title, author, cover_bytes, cover_mime = _pdf_metadata_and_cover(
        _asset_path(book.asset), include_cover=include_cover)
    changed = []
    default_title = os.path.splitext(book.asset.original_name)[0]
    if title and (not book.title or book.title == default_title):
        book.title = title[:255]
        changed.append('title')
    if author and not book.author:
        book.author = author[:255]
        changed.append('author')
    if _persist_book_cover(book, cover_bytes, cover_mime):
        changed.append('cover_asset')
    if changed:
        book.save(update_fields=[*changed, 'updated_at'])


class BookListView(APIView):
    def get(self, request, coll_id):
        anthology = get_visible_anthology_queryset(request).filter(coll_id=coll_id, type='book').first()
        if not anthology:
            return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        user_id = get_current_user_identifier(request)
        books = Book.objects.filter(anthology=anthology, is_valid=True).select_related('asset', 'cover_asset')
        result = []
        for book in books:
            # Backfill metadata for PDFs imported before metadata extraction was supported.
            if book.book_format == 'pdf' and (
                    not book.author or book.title == os.path.splitext(book.asset.original_name)[0]):
                _extract_pdf_details(book, include_cover=False)
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
        if book.book_format == 'epub':
            _extract_epub_details(book)
        elif book.book_format == 'pdf':
            _extract_pdf_details(book)
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
        # Covers were not extracted by early versions; recover them lazily on first display.
        if not book.cover_asset:
            if book.book_format == 'epub':
                _extract_epub_details(book)
            elif book.book_format == 'pdf':
                _extract_pdf_details(book)
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
            return error_result(ErrorCode.WEBDEV_ERROR, message='该书尚未备份到同步与备份的远端，不能释放本地副本')
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
        from utils.remote_storage import create_sync_manager
        config = (SystemSetting.objects.filter(key='system_webdav_config').first() or type('X', (), {'value': {}})()).value or {}
        if not config.get('enabled'): return error_result(ErrorCode.WEBDEV_NOT_CONFIG)
        try:
            manager = create_sync_manager(config)
        except Exception:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG)
        try:
            manager.restore_v2_media_file(book.asset.file_path, expected_hash=book.asset.file_hash)
            book.local_state = 'local'; book.save(update_fields=['local_state', 'updated_at'])
            return success_result({'localState': 'local'})
        except SyncError as exc:
            return error_result(ErrorCode.WEBDEV_DOWNLOAD_FAIL, message=str(exc))


class BookRepairUploadView(APIView):
    """用用户选择的本地文件修复书架正文，等待下一次同步补传至云端。"""
    def post(self, request, book_id):
        try: book = _book_for_owner(request, book_id)
        except Book.DoesNotExist: return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        upload = request.FILES.get('file')
        if not upload:
            return error_result(ErrorCode.UPLOAD_RESOURCE_NOT_FOUND, message='请选择要补传的图书文件')
        extension = os.path.splitext(upload.name)[1].lower()
        if ALLOWED_EXTENSIONS.get(extension) != book.book_format or upload.size > MAX_BOOK_SIZE:
            return error_result(ErrorCode.UPLOAD_RESOURCE_MORE_THAN_MAX_SIZE,
                                message=f'请选择与本书一致的 {book.book_format.upper()} 文件，且不超过 500 MB')

        asset_id = uuid.uuid4().hex[:16]
        rel_path = os.path.join('books', asset_id + extension)
        target_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        temp_path = target_path + '.uploading'
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        digest = hashlib.md5()
        try:
            with open(temp_path, 'wb') as output:
                for chunk in upload.chunks():
                    digest.update(chunk)
                    output.write(chunk)
            os.replace(temp_path, target_path)
            asset = Asset.objects.create(
                id=asset_id, name=upload.name[:255], original_name=upload.name[:255],
                file_type='document', file_size=upload.size, file_path=rel_path,
                file_extension=extension, mime_type=mimetypes.guess_type(upload.name)[0] or 'application/octet-stream',
                uploader=get_current_user_identifier(request), file_hash=digest.hexdigest(),
                source_type='other', metadata={'book': True},
            )
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        previous_asset = book.asset
        book.asset = asset
        book.local_state = 'local'
        # 重新选择的本地文件必须进入下一份同步快照，不能沿用失效的远端标记。
        book.remote_available = False
        book.remote_hash = ''
        book.save(update_fields=['asset', 'local_state', 'remote_available', 'remote_hash', 'updated_at'])
        # 旧正文已确认丢失时不再作为有效资源参与后续媒体校验；若另一本书
        # 仍复用它则保留，避免影响共享资源。
        _soft_delete_orphaned_book_asset(previous_asset)
        if book.book_format == 'epub':
            _extract_epub_details(book)
        elif book.book_format == 'pdf':
            _extract_pdf_details(book)
        return success_result({'localState': 'local', 'remoteAvailable': False})


class BookDeleteView(APIView):
    def delete(self, request, book_id):
        try: book = _book_for_owner(request, book_id)
        except Book.DoesNotExist: return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        body_asset = book.asset
        cover_asset = book.cover_asset
        book.is_valid = False; book.save(update_fields=['is_valid', 'updated_at']); book.anthology.update_stats()
        _soft_delete_orphaned_book_asset(body_asset)
        _soft_delete_orphaned_book_asset(cover_asset)
        return success_result()

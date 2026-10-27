"""Extract report files without trusting archive paths or compressed sizes."""
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
import zipfile

from .parser import MAX_HTML_BYTES, ReportError, parse_report

MAX_ZIP_BYTES = 30 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 100
MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024


@dataclass(frozen=True)
class ImportBundle:
    html_name: str
    html: bytes
    report: dict
    image_name: str = ''
    image: bytes = b''


def _safe_path(name):
    name = name.replace('\\', '/')
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or not path.name or ':' in path.parts[0]:
        raise ReportError('ZIP 中包含不安全的文件路径')
    return path


def _read_limited(archive, info, maximum):
    if info.file_size > maximum:
        raise ReportError('ZIP 中的文件超过允许大小')
    with archive.open(info) as stream:
        data = stream.read(maximum + 1)
    if len(data) > maximum:
        raise ReportError('ZIP 中的文件超过允许大小')
    return data


def read_zip(data):
    if len(data) > MAX_ZIP_BYTES:
        raise ReportError('ZIP 文件超过 30 MB')
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            entries = [info for info in archive.infolist() if not info.is_dir()]
            if len(entries) > MAX_ARCHIVE_ENTRIES or sum(item.file_size for item in entries) > MAX_UNCOMPRESSED_BYTES:
                raise ReportError('ZIP 文件数量或解压后大小超过上限')
            paths = [(info, _safe_path(info.filename)) for info in entries]
            reports = [(info, path) for info, path in paths if path.suffix.lower() in ('.htm', '.html') and not path.name.startswith('._')]
            if len(reports) != 1:
                raise ReportError('ZIP 中需要且只能包含一份 HTML 报告')
            info, report_path = reports[0]
            html = _read_limited(archive, info, MAX_HTML_BYTES)
            report = parse_report(html)
            # Never fetch or follow image references. Only match a local archive
            # member in the report's directory, and never resolve traversal.
            image_info, image_path = None, None
            for reference in report['image_references']:
                try:
                    ref = _safe_path(reference)
                except ReportError:
                    continue
                if len(ref.parts) != 1 or ref.suffix.lower() not in ('.gif', '.png', '.jpg', '.jpeg', '.webp'):
                    continue
                matches = [(item, path) for item, path in paths if path == report_path.parent / ref]
                if len(matches) == 1:
                    image_info, image_path = matches[0]
                    break
            image = _read_limited(archive, image_info, MAX_IMAGE_BYTES) if image_info else b''
            return ImportBundle(report_path.name, html, report, image_path.name if image_path else '', image)
    except (zipfile.BadZipFile, RuntimeError, OSError) as exc:
        raise ReportError('ZIP 文件无法读取') from exc

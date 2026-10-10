"""Transactional installation and immutable historical catalogs."""
import hashlib
import json
import logging
from django.db import transaction
from .catalog import Catalog, bundled
from .models import CombatCatalog
from ..farm_gate import guarded


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


@guarded
@transaction.atomic
def install():
    try:
        content, _ = bundled()
    except (ValueError, OSError, KeyError):
        if CombatCatalog.objects.exists():
            logging.getLogger(__name__).exception('战斗内容包校验失败，保留已有版本')
            return current()
        raise
    fingerprint = digest(content.tables)
    old = CombatCatalog.objects.filter(pk=content.version).first()
    if old and (old.digest != fingerprint or old.tables != content.tables):
        logging.getLogger(__name__).error('拒绝覆盖不可变战斗目录 %s，保留已安装有效版本；请发布新版本',content.version)
        return current()
    CombatCatalog.objects.get_or_create(pk=content.version, defaults={'digest': fingerprint, 'tables': content.tables})
    return content


def current(version=None):
    row = CombatCatalog.objects.filter(pk=version).first() if version else CombatCatalog.objects.order_by('-created_at', '-id').first()
    if not row:
        if version:
            raise ValueError('探索引用的目录版本缺失')
        return install()
    if digest(row.tables) != row.digest:
        raise ValueError('战斗目录数据损坏')
    return Catalog(row.tables, row.pk)

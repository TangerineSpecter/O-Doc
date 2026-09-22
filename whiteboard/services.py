from datetime import datetime

from django.conf import settings
from django.utils import timezone


MAX_TITLE_LENGTH = 120
MAX_DOCUMENTS_PER_IMPORT = 200
MAX_NODES_PER_BOARD = 5000
MAX_EDGES_PER_BOARD = 10000


def normalize_timestamp(value):
    if not isinstance(value, (int, float)) or value <= 0:
        return None
    if settings.USE_TZ:
        return datetime.fromtimestamp(value / 1000, tz=timezone.get_current_timezone())
    return datetime.fromtimestamp(value / 1000)


def normalize_document_payload(document):
    if not isinstance(document, dict):
        raise ValueError('白板数据格式错误')

    title = str(document.get('title') or '').strip() or '未命名白板'
    nodes = document.get('nodes', [])
    edges = document.get('edges', [])
    view_offset = document.get('viewOffset', document.get('view_offset', {'x': 80, 'y': 80}))
    scale = document.get('scale', 1)

    if not isinstance(nodes, list) or len(nodes) > MAX_NODES_PER_BOARD:
        raise ValueError(f'节点数量不能超过 {MAX_NODES_PER_BOARD}')
    if not isinstance(edges, list) or len(edges) > MAX_EDGES_PER_BOARD:
        raise ValueError(f'连线数量不能超过 {MAX_EDGES_PER_BOARD}')
    if not isinstance(view_offset, dict):
        raise ValueError('画布视图位置格式错误')
    if not isinstance(scale, (int, float)) or not 0.1 <= scale <= 4:
        raise ValueError('画布缩放比例必须在 0.1 到 4 之间')

    return {
        'title': title[:MAX_TITLE_LENGTH],
        'description': str(document.get('description') or '').strip(),
        'nodes': nodes,
        'edges': edges,
        'view_offset': {
            'x': view_offset.get('x', 80),
            'y': view_offset.get('y', 80),
        },
        'scale': float(scale),
        'insights': document.get('insights'),
    }

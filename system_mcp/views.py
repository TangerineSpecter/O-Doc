import json
from hmac import compare_digest

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from anthology.models import Anthology
from article.annotation_service import (
    AnnotationError,
    add_comment,
    create_annotation_with_comment,
    get_agent_identity,
    locate_unique_text,
    serialize_annotation,
    serialize_comment,
)
from article.models import Article, ArticleAnnotation, ArticleAnnotationComment
from memos.models import Memo
from system_settings.models import Agent, SystemSetting


PROTOCOL_VERSION = '2025-06-18'
SYSTEM_MCP_CONFIG_KEY = 'system_mcp_config'


def _text_result(payload):
    return {
        'content': [{
            'type': 'text',
            'text': json.dumps(payload, ensure_ascii=False),
        }],
        'structuredContent': payload,
    }


def _article_to_dict(article, include_content=True):
    data = {
        'article_id': article.article_id,
        'title': article.title,
        'coll_id': article.coll_id,
        'parent_id': article.parent_id,
        'author': article.author,
        'permission': article.permission,
        'sort': article.sort,
        'source_url': article.source_url,
        'word_count': article.word_count,
        'read_time': article.read_time,
        'read_count': article.read_count,
        'is_rag_synced': article.is_rag_synced,
        'post_summary': article.post_summary,
        'agent_post_creator_id': article.agent_post_creator_id,
        'agent_post_creator_name': article.agent_post_creator_name,
        'agent_post_creator_avatar': article.agent_post_creator_avatar,
        'created_at': article.created_at.isoformat() if article.created_at else None,
        'updated_at': article.updated_at.isoformat() if article.updated_at else None,
    }
    if include_content:
        data['content'] = article.content
    return data


def _anthology_to_dict(anthology):
    return {
        'coll_id': anthology.coll_id,
        'title': anthology.title,
        'description': anthology.description,
        'icon_id': anthology.icon_id,
        'type': anthology.type,
        'permission': anthology.permission,
        'is_top': anthology.is_top,
        'count': anthology.count,
        'rag_not_synced_count': anthology.rag_not_synced_count,
        'sort': anthology.sort,
        'created_at': anthology.created_at.isoformat() if anthology.created_at else None,
        'updated_at': anthology.updated_at.isoformat() if anthology.updated_at else None,
    }


def _memo_to_dict(memo):
    return {
        'memo_id': memo.memo_id,
        'content': memo.content,
        'tag': memo.tag,
        'is_pinned': memo.is_pinned,
        'created_at': memo.created_at.isoformat() if memo.created_at else None,
        'updated_at': memo.updated_at.isoformat() if memo.updated_at else None,
    }


def _refresh_anthology(coll_id):
    if not coll_id:
        return
    anthology = Anthology.objects.filter(coll_id=coll_id, type__in=['article', 'agent'], is_valid=True).first()
    if anthology:
        anthology.update_stats()


def _build_summary(content, summary=''):
    summary = str(summary or '').strip()
    if summary:
        return summary[:300]
    compact = ' '.join(
        str(content or '')
        .replace('#', ' ')
        .replace('*', ' ')
        .replace('`', ' ')
        .replace('>', ' ')
        .split()
    )
    return compact[:140]


TOOLS = [
    {
        'name': 'insert_memo',
        'description': '插入一条闪念备忘 Memos。兼容旧版名称，推荐新接入使用 create_memo。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'content': {'type': 'string', 'description': '备忘内容，最多 2000 字。'},
                'tag': {'type': 'string', 'description': '可选标签。'},
                'is_pinned': {'type': 'boolean', 'description': '是否置顶。'},
            },
            'required': ['content'],
        },
    },
    {
        'name': 'create_memo',
        'description': '创建一条闪念 Memo。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'content': {'type': 'string', 'description': '备忘内容，最多 2000 字。'},
                'tag': {'type': 'string', 'description': '可选标签。'},
                'is_pinned': {'type': 'boolean', 'description': '是否置顶。'},
            },
            'required': ['content'],
        },
    },
    {
        'name': 'list_memos',
        'description': '查询闪念 Memo 列表，可按关键词或标签过滤。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'keyword': {'type': 'string', 'description': '可选内容或标签关键词。'},
                'tag': {'type': 'string', 'description': '可选标签，支持匹配同名标签或子标签。'},
                'limit': {'type': 'integer', 'description': '返回数量，默认 50，最大 200。'},
            },
        },
    },
    {
        'name': 'get_memo',
        'description': '查询单条闪念 Memo 详情。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'memo_id': {'type': 'string', 'description': '闪念 Memo ID。'},
            },
            'required': ['memo_id'],
        },
    },
    {
        'name': 'update_memo',
        'description': '更新闪念 Memo，支持内容、标签和置顶状态。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'memo_id': {'type': 'string', 'description': '闪念 Memo ID。'},
                'content': {'type': 'string', 'description': '新内容，最多 2000 字。'},
                'tag': {'type': 'string', 'description': '新标签，空字符串表示清空。'},
                'is_pinned': {'type': 'boolean', 'description': '是否置顶。'},
            },
            'required': ['memo_id'],
        },
    },
    {
        'name': 'delete_memo',
        'description': '删除闪念 Memo。执行逻辑删除，不再出现在列表中。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'memo_id': {'type': 'string', 'description': '闪念 Memo ID。'},
            },
            'required': ['memo_id'],
        },
    },
    {
        'name': 'create_article',
        'description': '创建一篇 Markdown 文章。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'title': {'type': 'string', 'description': '文章标题。'},
                'content': {'type': 'string', 'description': '文章内容，Markdown 格式。'},
                'coll_id': {'type': 'string', 'description': '所属文章文集 ID。'},
                'parent_id': {'type': 'string', 'description': '可选父级文章 ID。'},
                'permission': {'type': 'string', 'enum': ['public', 'private'], 'description': '文章权限。'},
                'sort': {'type': 'integer', 'description': '排序值，越小越靠前。'},
                'source_url': {'type': 'string', 'description': '可选文章来源 URL。'},
            },
            'required': ['title', 'content', 'coll_id'],
        },
    },
    {
        'name': 'list_articles',
        'description': '查询文章列表，可按文集或关键词过滤。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'coll_id': {'type': 'string', 'description': '可选文集 ID。'},
                'keyword': {'type': 'string', 'description': '可选标题关键词。'},
                'limit': {'type': 'integer', 'description': '返回数量，默认 50，最大 200。'},
                'include_content': {'type': 'boolean', 'description': '是否包含正文，默认 false。'},
            },
        },
    },
    {
        'name': 'get_article',
        'description': '查询文章详情。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'article_id': {'type': 'string', 'description': '文章 ID。'},
            },
            'required': ['article_id'],
        },
    },
    {
        'name': 'get_random_article',
        'description': '随机获取一篇文章。可指定文集；不指定时从当前账号全局随机一篇。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'coll_id': {'type': 'string', 'description': '可选文集 ID。'},
                'include_content': {'type': 'boolean', 'description': '是否包含正文，默认 true。'},
            },
        },
    },
    {
        'name': 'update_article',
        'description': '编辑文章，支持标题、正文、文集、父级、权限、排序等字段。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'article_id': {'type': 'string', 'description': '文章 ID。'},
                'title': {'type': 'string', 'description': '新标题。'},
                'content': {'type': 'string', 'description': '新正文。'},
                'coll_id': {'type': 'string', 'description': '新所属文集 ID。'},
                'parent_id': {'type': 'string', 'description': '新父级文章 ID，空字符串表示清空。'},
                'permission': {'type': 'string', 'enum': ['public', 'private'], 'description': '文章权限。'},
                'sort': {'type': 'integer', 'description': '排序值。'},
                'source_url': {'type': 'string', 'description': '文章来源 URL。'},
            },
            'required': ['article_id'],
        },
    },
    {
        'name': 'delete_article',
        'description': '删除文章。执行逻辑删除，不再出现在列表中。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'article_id': {'type': 'string', 'description': '文章 ID。'},
            },
            'required': ['article_id'],
        },
    },
    {
        'name': 'list_anthologies',
        'description': '查询文集列表。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'type': {'type': 'string', 'enum': ['article', 'image', 'agent'], 'description': '文集类型。'},
                'keyword': {'type': 'string', 'description': '可选标题关键词。'},
                'limit': {'type': 'integer', 'description': '返回数量，默认 50，最大 200。'},
            },
        },
    },
    {
        'name': 'get_anthology',
        'description': '查询单个文集详情。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'coll_id': {'type': 'string', 'description': '文集 ID。'},
            },
            'required': ['coll_id'],
        },
    },
    {
        'name': 'create_anthology',
        'description': '创建文集。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'title': {'type': 'string', 'description': '文集名称，最多 20 字。'},
                'description': {'type': 'string', 'description': '文集简介，最多 100 字。'},
                'icon_id': {'type': 'string', 'description': '图标 ID。'},
                'type': {'type': 'string', 'enum': ['article', 'image', 'agent'], 'description': '文集类型，默认 article。'},
                'permission': {'type': 'string', 'enum': ['public', 'private'], 'description': '访问权限。'},
                'is_top': {'type': 'boolean', 'description': '是否置顶。'},
                'sort': {'type': 'integer', 'description': '排序值。'},
            },
            'required': ['title'],
        },
    },
    {
        'name': 'update_anthology',
        'description': '编辑文集。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'coll_id': {'type': 'string', 'description': '文集 ID。'},
                'title': {'type': 'string', 'description': '文集名称。'},
                'description': {'type': 'string', 'description': '文集简介。'},
                'icon_id': {'type': 'string', 'description': '图标 ID。'},
                'permission': {'type': 'string', 'enum': ['public', 'private'], 'description': '访问权限。'},
                'is_top': {'type': 'boolean', 'description': '是否置顶。'},
                'sort': {'type': 'integer', 'description': '排序值。'},
            },
            'required': ['coll_id'],
        },
    },
    {
        'name': 'delete_anthology',
        'description': '删除文集。执行逻辑删除，不再出现在列表中。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'coll_id': {'type': 'string', 'description': '文集 ID。'},
            },
            'required': ['coll_id'],
        },
    },
    {
        'name': 'create_agent_post',
        'description': '在 Agent 文集中创建一条卡片帖子。用于 Agent 通过 MCP 发布标题、摘要和正文；账号端只展示和删除帖子。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'title': {'type': 'string', 'description': '帖子标题。'},
                'content': {'type': 'string', 'description': '帖子正文，Markdown 格式。'},
                'summary': {'type': 'string', 'description': '帖子摘要，最多 300 字；不传则从正文自动截取。'},
                'coll_id': {'type': 'string', 'description': '所属 Agent 文集 ID。'},
                'agent_id': {'type': 'string', 'description': '可选 Agent 配置 ID，传入后服务端读取名称和头像。'},
                'agent_name': {'type': 'string', 'description': '可选发帖 Agent 名称。'},
                'agent_avatar': {'type': 'string', 'description': '可选发帖 Agent 头像 URL、资源路径或 Emoji。'},
                'permission': {'type': 'string', 'enum': ['public', 'private'], 'description': '帖子权限。'},
                'sort': {'type': 'integer', 'description': '排序值。'},
                'source_url': {'type': 'string', 'description': '可选来源 URL。'},
            },
            'required': ['title', 'content', 'coll_id'],
        },
    },
    {
        'name': 'create_article_annotation',
        'description': '为文章指定原文创建划线批注，并添加一条 Agent 评论。selected_text 必须从文章正文渲染后的纯文本中逐字复制一段连续原文，且唯一出现。服务端会兼容常见内联标记（如 ==、++、%%、[[ ]]）、空白折叠、全角/半角、Unicode 连字符/引号差异。不支持 fenced 代码块、图片、HTML 标签等会被纯文本化时移除的内容；链接只匹配展示文字，行内代码只匹配去掉反引号后的文字。不要传翻译、总结、改写、补写、省略或替换标点后的文本。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'article_id': {'type': 'string', 'description': '文章 ID。'},
                'selected_text': {'type': 'string', 'description': '需要划线批注的连续原文。必须逐字复制自 article.content 渲染后的纯文本，并且只出现一次。服务端会兼容常见内联标记、空白折叠、全角/半角、Unicode 连字符/引号差异；不要选择 fenced 代码块、图片、HTML 标签等会被移除的内容；标题/列表/引用需去掉 Markdown 标记，链接取展示文字，行内代码取去掉反引号后的文字；不要传总结、翻译、改写、截断拼接或标点变化后的文本。'},
                'comment': {'type': 'string', 'description': '评论内容，最多 2000 字。'},
            },
            'required': ['article_id', 'selected_text', 'comment'],
        },
    },
    {
        'name': 'list_article_annotations',
        'description': '查询一篇文章下的划线批注和评论。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'article_id': {'type': 'string', 'description': '文章 ID。'},
            },
            'required': ['article_id'],
        },
    },
    {
        'name': 'add_article_annotation_comment',
        'description': '向已有文章划线批注追加一条 Agent 评论。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'annotation_id': {'type': 'string', 'description': '批注 ID。'},
                'comment': {'type': 'string', 'description': '评论内容，最多 2000 字。'},
            },
            'required': ['annotation_id', 'comment'],
        },
    },
    {
        'name': 'delete_article_annotation_comment',
        'description': '删除一条 Agent/系统创建的文章批注评论。执行逻辑删除。',
        'inputSchema': {
            'type': 'object',
            'properties': {
                'comment_id': {'type': 'string', 'description': '批注评论 ID。'},
            },
            'required': ['comment_id'],
        },
    },
]

MEMO_TOOL_NAMES = {'insert_memo', 'create_memo', 'list_memos', 'get_memo', 'update_memo', 'delete_memo'}
ARTICLE_TOOL_NAMES = {'create_article', 'list_articles', 'get_article', 'get_random_article', 'update_article', 'delete_article', 'create_agent_post'}
ANTHOLOGY_TOOL_NAMES = {'create_anthology', 'list_anthologies', 'get_anthology', 'update_anthology', 'delete_anthology'}
VISIBLE_TOOL_NAMES = {tool['name'] for tool in TOOLS} - {'insert_memo'}
VISIBLE_MEMO_TOOL_NAMES = MEMO_TOOL_NAMES - {'insert_memo'}
VISIBLE_ARTICLE_TOOL_NAMES = ARTICLE_TOOL_NAMES
VISIBLE_ANTHOLOGY_TOOL_NAMES = ANTHOLOGY_TOOL_NAMES
VISIBLE_COMMENT_TOOL_NAMES = {'create_article_annotation', 'list_article_annotations', 'add_article_annotation_comment', 'delete_article_annotation_comment'}


class ODocSystemMCPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    tool_scope = 'system'
    agent_context = None

    def post(self, request):
        auth_error = self._auth_error(request)
        if auth_error:
            return auth_error

        payload = request.data if isinstance(request.data, dict) else {}
        method = payload.get('method')
        request_id = payload.get('id')

        if method == 'initialize':
            return self._result(request_id, {
                'protocolVersion': PROTOCOL_VERSION,
                'capabilities': {'tools': {'listChanged': False}},
                'serverInfo': {'name': 'O-Doc System MCP', 'version': '1.0.0'},
            })

        if method == 'notifications/initialized':
            return JsonResponse({}, status=202)

        if method == 'tools/list':
            return self._result(request_id, {'tools': self._available_tools()})

        if method == 'tools/call':
            params = payload.get('params') or {}
            name = params.get('name')
            arguments = params.get('arguments') or {}
            try:
                if not self._is_tool_available(name):
                    raise ValueError(f'当前 MCP 不提供 Tool：{name}')
                result = self._call_tool(name, arguments)
                return self._result(request_id, _text_result(result))
            except Exception as exc:
                return self._error(request_id, -32000, str(exc))

        return self._error(request_id, -32601, f'未知 MCP 方法：{method}')

    def _available_tools(self):
        if self.tool_scope == 'memos':
            return [tool for tool in TOOLS if tool['name'] in VISIBLE_MEMO_TOOL_NAMES]
        if self.tool_scope == 'articles':
            return [tool for tool in TOOLS if tool['name'] in VISIBLE_ARTICLE_TOOL_NAMES]
        if self.tool_scope == 'anthologies':
            return [tool for tool in TOOLS if tool['name'] in VISIBLE_ANTHOLOGY_TOOL_NAMES]
        if self.tool_scope == 'comments':
            return [tool for tool in TOOLS if tool['name'] in VISIBLE_COMMENT_TOOL_NAMES]
        return [tool for tool in TOOLS if tool['name'] in VISIBLE_TOOL_NAMES]

    def _is_tool_available(self, name):
        if name == 'insert_memo':
            return self.tool_scope in {'system', 'memos'}
        return any(tool['name'] == name for tool in self._available_tools())

    @classmethod
    def _auth_error(cls, request):
        setting = SystemSetting.objects.filter(key=SYSTEM_MCP_CONFIG_KEY).first()
        config = setting.value if setting else {}
        if not config.get('enabled', False):
            return JsonResponse({'error': '系统 MCP 未启用'}, status=403)
        api_key = str(config.get('apiKey') or '')
        if not api_key:
            return JsonResponse({'error': '系统 MCP 密钥未配置'}, status=401)

        provided_key = cls._extract_api_key(request)
        if not provided_key or not compare_digest(provided_key, api_key):
            return JsonResponse({'error': '系统 MCP 密钥无效'}, status=401)
        return None

    @staticmethod
    def _extract_api_key(request):
        auth_header = request.headers.get('Authorization', '').strip()
        if auth_header.lower().startswith('bearer '):
            return auth_header[7:].strip()
        return (
            request.headers.get('X-O-Doc-MCP-Key', '').strip()
            or request.headers.get('X-MCP-Key', '').strip()
        )

    @staticmethod
    def _result(request_id, result):
        return JsonResponse({
            'jsonrpc': '2.0',
            'id': request_id,
            'result': result,
        }, json_dumps_params={'ensure_ascii': False})

    @staticmethod
    def _error(request_id, code, message):
        return JsonResponse({
            'jsonrpc': '2.0',
            'id': request_id,
            'error': {'code': code, 'message': message},
        }, status=400, json_dumps_params={'ensure_ascii': False})

    def _call_tool(self, name, arguments):
        if name in {'insert_memo', 'create_memo'}:
            return self._create_memo(arguments)
        if name == 'list_memos':
            return self._list_memos(arguments)
        if name == 'get_memo':
            return self._get_memo(arguments)
        if name == 'update_memo':
            return self._update_memo(arguments)
        if name == 'delete_memo':
            return self._delete_memo(arguments)
        if name == 'create_article':
            return self._create_article(arguments)
        if name == 'create_agent_post':
            return self._create_agent_post(arguments)
        if name == 'list_articles':
            return self._list_articles(arguments)
        if name == 'get_article':
            return self._get_article(arguments)
        if name == 'get_random_article':
            return self._get_random_article(arguments)
        if name == 'update_article':
            return self._update_article(arguments)
        if name == 'delete_article':
            return self._delete_article(arguments)
        if name == 'list_anthologies':
            return self._list_anthologies(arguments)
        if name == 'get_anthology':
            return self._get_anthology(arguments)
        if name == 'create_anthology':
            return self._create_anthology(arguments)
        if name == 'update_anthology':
            return self._update_anthology(arguments)
        if name == 'delete_anthology':
            return self._delete_anthology(arguments)
        if name == 'create_article_annotation':
            return self._create_article_annotation(arguments)
        if name == 'list_article_annotations':
            return self._list_article_annotations(arguments)
        if name == 'add_article_annotation_comment':
            return self._add_article_annotation_comment(arguments)
        if name == 'delete_article_annotation_comment':
            return self._delete_article_annotation_comment(arguments)
        raise ValueError(f'未知 Tool：{name}')

    @staticmethod
    def _create_memo(arguments):
        content = str(arguments.get('content') or '').strip()
        if not content:
            raise ValueError('content 不能为空')
        if len(content) > 2000:
            raise ValueError('content 不能超过 2000 字')
        memo = Memo.objects.create(
            content=content,
            tag=str(arguments.get('tag') or '').strip(),
            is_pinned=bool(arguments.get('is_pinned', False)),
            user_id='admin',
        )
        return {'memo': _memo_to_dict(memo)}

    @staticmethod
    def _memo_queryset():
        return Memo.objects.filter(is_valid=True, user_id='admin')

    @classmethod
    def _list_memos(cls, arguments):
        limit = min(max(int(arguments.get('limit') or 50), 1), 200)
        queryset = cls._memo_queryset().order_by('-is_pinned', '-created_at')
        keyword = str(arguments.get('keyword') or '').strip()
        tag = str(arguments.get('tag') or '').strip()
        if keyword:
            queryset = queryset.filter(Q(content__icontains=keyword) | Q(tag__icontains=keyword))
        if tag:
            queryset = queryset.filter(Q(tag=tag) | Q(tag__startswith=f'{tag}/'))
        memos = [_memo_to_dict(memo) for memo in queryset[:limit]]
        return {'memos': memos, 'count': len(memos)}

    @classmethod
    def _get_memo(cls, arguments):
        memo_id = str(arguments.get('memo_id') or '').strip()
        if not memo_id:
            raise ValueError('memo_id 不能为空')
        memo = get_object_or_404(cls._memo_queryset(), memo_id=memo_id)
        return {'memo': _memo_to_dict(memo)}

    @classmethod
    def _update_memo(cls, arguments):
        memo_id = str(arguments.get('memo_id') or '').strip()
        if not memo_id:
            raise ValueError('memo_id 不能为空')
        memo = get_object_or_404(cls._memo_queryset(), memo_id=memo_id)
        if 'content' in arguments:
            content = str(arguments.get('content') or '').strip()
            if not content:
                raise ValueError('content 不能为空')
            if len(content) > 2000:
                raise ValueError('content 不能超过 2000 字')
            memo.content = content
        if 'tag' in arguments:
            memo.tag = str(arguments.get('tag') or '').strip()
        if 'is_pinned' in arguments:
            memo.is_pinned = bool(arguments.get('is_pinned'))
        memo.save()
        return {'memo': _memo_to_dict(memo)}

    @classmethod
    def _delete_memo(cls, arguments):
        memo_id = str(arguments.get('memo_id') or '').strip()
        if not memo_id:
            raise ValueError('memo_id 不能为空')
        memo = get_object_or_404(cls._memo_queryset(), memo_id=memo_id)
        memo.is_valid = False
        memo.save(update_fields=['is_valid', 'updated_at'])
        return {'memo_id': memo_id, 'deleted': True}

    @staticmethod
    def _validate_article_collection(coll_id):
        if not coll_id:
            raise ValueError('coll_id 不能为空')
        return get_object_or_404(Anthology, coll_id=coll_id, type='article', is_valid=True)

    @staticmethod
    def _validate_agent_collection(coll_id):
        if not coll_id:
            raise ValueError('coll_id 不能为空')
        return get_object_or_404(Anthology, coll_id=coll_id, type='agent', is_valid=True)

    @staticmethod
    def _validate_parent(parent_id):
        if parent_id in (None, ''):
            return None
        return get_object_or_404(Article, article_id=parent_id, is_valid=True)

    def _create_article(self, arguments):
        title = str(arguments.get('title') or '').strip()
        content = str(arguments.get('content') or '')
        coll_id = str(arguments.get('coll_id') or '').strip()
        if not title:
            raise ValueError('title 不能为空')
        if not content.strip():
            raise ValueError('content 不能为空')
        self._validate_article_collection(coll_id)
        parent = self._validate_parent(arguments.get('parent_id'))
        permission = arguments.get('permission') or 'public'
        if permission not in {'public', 'private'}:
            raise ValueError('permission 只能是 public 或 private')
        try:
            with transaction.atomic():
                article = Article.objects.create(
                    title=title,
                    content=content,
                    coll_id=coll_id,
                    parent=parent,
                    author='admin',
                    permission=permission,
                    sort=int(arguments.get('sort') or 0),
                    source_url=str(arguments.get('source_url') or '').strip() or None,
                    is_rag_synced=False,
                )
                _refresh_anthology(coll_id)
        except IntegrityError:
            raise ValueError('同一文集下文章标题已存在')
        return {'article': _article_to_dict(article)}

    def _resolve_agent_post_identity(self, arguments):
        if self.agent_context:
            return get_agent_identity(self.agent_context)

        agent_id = str(arguments.get('agent_id') or '').strip()
        if agent_id:
            agent = Agent.objects.filter(id=agent_id).first()
            if agent:
                return get_agent_identity(agent)

        name = str(arguments.get('agent_name') or '').strip() or 'Agent'
        avatar = str(arguments.get('agent_avatar') or '').strip()
        return {
            'creator_type': 'agent',
            'creator_id': f'agent:{agent_id or name}',
            'creator_name': name,
            'creator_avatar': avatar,
        }

    def _create_agent_post(self, arguments):
        title = str(arguments.get('title') or '').strip()
        content = str(arguments.get('content') or '')
        coll_id = str(arguments.get('coll_id') or '').strip()
        if not title:
            raise ValueError('title 不能为空')
        if not content.strip():
            raise ValueError('content 不能为空')
        anthology = self._validate_agent_collection(coll_id)
        permission = arguments.get('permission') or 'public'
        if permission not in {'public', 'private'}:
            raise ValueError('permission 只能是 public 或 private')
        identity = self._resolve_agent_post_identity(arguments)
        try:
            with transaction.atomic():
                article = Article.objects.create(
                    title=title,
                    content=content,
                    coll_id=coll_id,
                    author=anthology.user_id,
                    permission=permission,
                    sort=int(arguments.get('sort') or 0),
                    source_url=str(arguments.get('source_url') or '').strip() or None,
                    post_summary=_build_summary(content, arguments.get('summary')),
                    agent_post_creator_id=identity['creator_id'],
                    agent_post_creator_name=identity['creator_name'],
                    agent_post_creator_avatar=identity['creator_avatar'],
                    is_rag_synced=False,
                )
                _refresh_anthology(coll_id)
        except IntegrityError:
            raise ValueError('同一文集下帖子标题已存在')
        return {'post': _article_to_dict(article)}

    @staticmethod
    def _list_articles(arguments):
        limit = min(max(int(arguments.get('limit') or 50), 1), 200)
        queryset = Article.objects.filter(is_valid=True, author='admin').order_by('sort', '-updated_at')
        coll_id = str(arguments.get('coll_id') or '').strip()
        keyword = str(arguments.get('keyword') or '').strip()
        if coll_id:
            queryset = queryset.filter(coll_id=coll_id)
        if keyword:
            queryset = queryset.filter(title__icontains=keyword)
        include_content = bool(arguments.get('include_content', False))
        articles = [_article_to_dict(article, include_content=include_content) for article in queryset[:limit]]
        return {'articles': articles, 'count': len(articles)}

    @staticmethod
    def _get_article(arguments):
        article_id = str(arguments.get('article_id') or '').strip()
        if not article_id:
            raise ValueError('article_id 不能为空')
        article = get_object_or_404(Article, article_id=article_id, author='admin', is_valid=True)
        return {'article': _article_to_dict(article)}

    @staticmethod
    def _get_random_article(arguments):
        queryset = Article.objects.filter(is_valid=True, author='admin')
        coll_id = str(arguments.get('coll_id') or '').strip()
        if coll_id:
            get_object_or_404(Anthology, coll_id=coll_id, type='article', user_id='admin', is_valid=True)
            queryset = queryset.filter(coll_id=coll_id)
        article = queryset.order_by('?').first()
        if not article:
            raise ValueError('未找到可随机获取的文章')
        include_content = bool(arguments.get('include_content', True))
        return {'article': _article_to_dict(article, include_content=include_content)}

    def _update_article(self, arguments):
        article_id = str(arguments.get('article_id') or '').strip()
        if not article_id:
            raise ValueError('article_id 不能为空')
        article = get_object_or_404(Article, article_id=article_id, author='admin', is_valid=True)
        old_coll_id = article.coll_id

        if 'title' in arguments:
            title = str(arguments.get('title') or '').strip()
            if not title:
                raise ValueError('title 不能为空')
            article.title = title
        if 'content' in arguments:
            content = str(arguments.get('content') or '')
            if not content.strip():
                raise ValueError('content 不能为空')
            article.content = content
            article.is_rag_synced = False
        if 'coll_id' in arguments:
            coll_id = str(arguments.get('coll_id') or '').strip()
            self._validate_article_collection(coll_id)
            article.coll_id = coll_id
        if 'parent_id' in arguments:
            parent = self._validate_parent(arguments.get('parent_id'))
            if parent and parent.article_id == article.article_id:
                raise ValueError('父级文章不能是当前文章自身')
            article.parent = parent
        if 'permission' in arguments:
            permission = arguments.get('permission') or 'public'
            if permission not in {'public', 'private'}:
                raise ValueError('permission 只能是 public 或 private')
            article.permission = permission
        if 'sort' in arguments:
            article.sort = int(arguments.get('sort') or 0)
        if 'source_url' in arguments:
            article.source_url = str(arguments.get('source_url') or '').strip() or None

        try:
            with transaction.atomic():
                article.save()
                _refresh_anthology(article.coll_id)
                if old_coll_id != article.coll_id:
                    _refresh_anthology(old_coll_id)
        except IntegrityError:
            raise ValueError('同一文集下文章标题已存在')
        return {'article': _article_to_dict(article)}

    @staticmethod
    def _delete_article(arguments):
        article_id = str(arguments.get('article_id') or '').strip()
        if not article_id:
            raise ValueError('article_id 不能为空')
        article = get_object_or_404(Article, article_id=article_id, author='admin', is_valid=True)
        if Article.objects.filter(parent=article, is_valid=True).exists():
            raise ValueError('文章下仍有子文章，不能删除')
        coll_id = article.coll_id
        article.is_valid = False
        article.save(update_fields=['is_valid', 'updated_at'])
        _refresh_anthology(coll_id)
        return {'article_id': article_id, 'deleted': True}

    @staticmethod
    def _list_anthologies(arguments):
        limit = min(max(int(arguments.get('limit') or 50), 1), 200)
        queryset = Anthology.objects.filter(is_valid=True, user_id='admin').order_by('-is_top', 'sort', '-updated_at')
        coll_type = str(arguments.get('type') or '').strip()
        keyword = str(arguments.get('keyword') or '').strip()
        if coll_type:
            if coll_type not in {'article', 'image', 'agent'}:
                raise ValueError('type 只能是 article、image 或 agent')
            queryset = queryset.filter(type=coll_type)
        if keyword:
            queryset = queryset.filter(title__icontains=keyword)
        anthologies = [_anthology_to_dict(anthology) for anthology in queryset[:limit]]
        return {'anthologies': anthologies, 'count': len(anthologies)}

    @staticmethod
    def _get_anthology(arguments):
        coll_id = str(arguments.get('coll_id') or '').strip()
        if not coll_id:
            raise ValueError('coll_id 不能为空')
        anthology = get_object_or_404(Anthology, coll_id=coll_id, user_id='admin', is_valid=True)
        return {'anthology': _anthology_to_dict(anthology)}

    @staticmethod
    def _create_anthology(arguments):
        title = str(arguments.get('title') or '').strip()
        if not title:
            raise ValueError('title 不能为空')
        if len(title) > 20:
            raise ValueError('title 不能超过 20 字')
        description = str(arguments.get('description') or '暂无简介').strip() or '暂无简介'
        if len(description) > 100:
            raise ValueError('description 不能超过 100 字')
        coll_type = arguments.get('type') or 'article'
        if coll_type not in {'article', 'image', 'agent'}:
            raise ValueError('type 只能是 article、image 或 agent')
        permission = arguments.get('permission') or 'public'
        if permission not in {'public', 'private'}:
            raise ValueError('permission 只能是 public 或 private')
        try:
            anthology = Anthology.objects.create(
                title=title,
                description=description,
                icon_id=str(arguments.get('icon_id') or 'book').strip() or 'book',
                type=coll_type,
                permission=permission,
                is_top=bool(arguments.get('is_top', False)),
                sort=int(arguments.get('sort') or 0),
                user_id='admin',
            )
        except IntegrityError:
            raise ValueError('同类型下文集名称不能重复')
        return {'anthology': _anthology_to_dict(anthology)}

    @staticmethod
    def _delete_anthology(arguments):
        coll_id = str(arguments.get('coll_id') or '').strip()
        if not coll_id:
            raise ValueError('coll_id 不能为空')
        anthology = get_object_or_404(Anthology, coll_id=coll_id, user_id='admin', is_valid=True)
        anthology.is_valid = False
        anthology.save(update_fields=['is_valid', 'updated_at'])
        return {'coll_id': coll_id, 'deleted': True}

    @staticmethod
    def _update_anthology(arguments):
        coll_id = str(arguments.get('coll_id') or '').strip()
        if not coll_id:
            raise ValueError('coll_id 不能为空')
        anthology = get_object_or_404(Anthology, coll_id=coll_id, user_id='admin', is_valid=True)
        if 'title' in arguments:
            title = str(arguments.get('title') or '').strip()
            if not title:
                raise ValueError('title 不能为空')
            if len(title) > 20:
                raise ValueError('title 不能超过 20 字')
            anthology.title = title
        if 'description' in arguments:
            description = str(arguments.get('description') or '').strip()
            if len(description) > 100:
                raise ValueError('description 不能超过 100 字')
            anthology.description = description or '暂无简介'
        if 'icon_id' in arguments:
            anthology.icon_id = str(arguments.get('icon_id') or 'book').strip() or 'book'
        if 'permission' in arguments:
            permission = arguments.get('permission') or 'public'
            if permission not in {'public', 'private'}:
                raise ValueError('permission 只能是 public 或 private')
            anthology.permission = permission
        if 'is_top' in arguments:
            anthology.is_top = bool(arguments.get('is_top'))
        if 'sort' in arguments:
            anthology.sort = int(arguments.get('sort') or 0)
        try:
            anthology.save()
        except IntegrityError:
            raise ValueError('同类型下文集名称不能重复')
        return {'anthology': _anthology_to_dict(anthology)}

    def _get_annotation_agent_identity(self):
        return get_agent_identity(self.agent_context)

    def _create_article_annotation(self, arguments):
        article_id = str(arguments.get('article_id') or '').strip()
        selected_text = str(arguments.get('selected_text') or '').strip()
        comment = str(arguments.get('comment') or '').strip()
        if not article_id:
            raise ValueError('article_id 不能为空')
        article = get_object_or_404(Article, article_id=article_id, author='admin', is_valid=True)
        try:
            anchor = locate_unique_text(article, selected_text)
            if not anchor:
                raise AnnotationError('未找到选中文本')
            annotation = create_annotation_with_comment(
                article,
                anchor,
                comment,
                self._get_annotation_agent_identity(),
            )
            return {'annotation': serialize_annotation(annotation)}
        except AnnotationError as exc:
            raise ValueError(str(exc))

    @staticmethod
    def _list_article_annotations(arguments):
        article_id = str(arguments.get('article_id') or '').strip()
        if not article_id:
            raise ValueError('article_id 不能为空')
        article = get_object_or_404(Article, article_id=article_id, author='admin', is_valid=True)
        annotations = ArticleAnnotation.objects.filter(article=article, is_valid=True).prefetch_related('comments')
        data = [serialize_annotation(annotation) for annotation in annotations]
        return {'annotations': data, 'count': len(data)}

    def _add_article_annotation_comment(self, arguments):
        annotation_id = str(arguments.get('annotation_id') or '').strip()
        if not annotation_id:
            raise ValueError('annotation_id 不能为空')
        annotation = get_object_or_404(
            ArticleAnnotation,
            annotation_id=annotation_id,
            article__author='admin',
            is_valid=True,
        )
        try:
            comment = add_comment(
                annotation,
                arguments.get('comment'),
                self._get_annotation_agent_identity(),
            )
            return {'comment': serialize_comment(comment)}
        except AnnotationError as exc:
            raise ValueError(str(exc))

    @staticmethod
    def _delete_article_annotation_comment(arguments):
        comment_id = str(arguments.get('comment_id') or '').strip()
        if not comment_id:
            raise ValueError('comment_id 不能为空')
        comment = get_object_or_404(
            ArticleAnnotationComment,
            comment_id=comment_id,
            annotation__article__author='admin',
            is_valid=True,
        )
        comment.is_valid = False
        comment.save(update_fields=['is_valid', 'updated_at'])
        return {'comment_id': comment_id, 'deleted': True}

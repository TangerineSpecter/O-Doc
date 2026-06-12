from django.test import TestCase
from django.contrib.auth import get_user_model

from anthology.models import Anthology
from article.models import Article
from message.models import Notification
from system_settings.models import Agent, MCPServer
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools

User = get_user_model()


class BuiltinSystemMCPTests(TestCase):
    def test_builtin_article_mcp_exposes_random_and_delete_tools(self):
        server = MCPServer.objects.create(
            name='文章 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/articles/',
            source='system',
            enabled=True,
            tools=[],
        )

        tools, error_msg = fetch_mcp_tools(server)

        self.assertIsNone(error_msg)
        tool_names = {tool['name'] for tool in tools}
        self.assertIn('get_random_article', tool_names)
        self.assertIn('delete_article', tool_names)
        self.assertNotIn('create_anthology', tool_names)

    def test_builtin_anthology_mcp_can_crud_anthology(self):
        server = MCPServer.objects.create(
            name='文集 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/anthologies/',
            source='system',
            enabled=True,
            tools=[],
        )

        result, error_msg = call_mcp_tool(server, 'create_anthology', {'title': 'MCP 文集'})
        self.assertIsNone(error_msg)
        coll_id = result['anthology']['coll_id']

        result, error_msg = call_mcp_tool(server, 'get_anthology', {'coll_id': coll_id})
        self.assertIsNone(error_msg)
        self.assertEqual(result['anthology']['title'], 'MCP 文集')

        result, error_msg = call_mcp_tool(server, 'update_anthology', {'coll_id': coll_id, 'title': 'MCP 文集改'})
        self.assertIsNone(error_msg)
        self.assertEqual(result['anthology']['title'], 'MCP 文集改')

        result, error_msg = call_mcp_tool(server, 'delete_anthology', {'coll_id': coll_id})
        self.assertIsNone(error_msg)
        self.assertTrue(result['deleted'])
        self.assertFalse(Anthology.objects.get(coll_id=coll_id).is_valid)

    def test_builtin_article_mcp_random_can_filter_by_anthology(self):
        target_coll = Anthology.objects.create(coll_id='coll_mcp_target', title='目标文集', user_id='admin')
        other_coll = Anthology.objects.create(coll_id='coll_mcp_other', title='其他文集', user_id='admin')
        target_article = Article.objects.create(
            article_id='art_mcp_target',
            title='目标文章',
            content='target content',
            coll_id=target_coll.coll_id,
            author='admin',
        )
        Article.objects.create(
            article_id='art_mcp_other',
            title='其他文章',
            content='other content',
            coll_id=other_coll.coll_id,
            author='admin',
        )
        server = MCPServer.objects.create(
            name='文章 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/articles/',
            source='system',
            enabled=True,
            tools=[],
        )

        result, error_msg = call_mcp_tool(server, 'get_random_article', {'coll_id': target_coll.coll_id})

        self.assertIsNone(error_msg)
        self.assertEqual(result['article']['article_id'], target_article.article_id)

    def test_builtin_comment_mcp_uses_agent_avatar_and_notifies_article_author(self):
        User.objects.create_user(username='admin', password='password')
        anthology = Anthology.objects.create(coll_id='coll_comment_notify', title='评论通知文集', user_id='admin')
        article = Article.objects.create(
            article_id='art_comment_notify',
            title='评论通知文章',
            content='这是一段可以被唯一划线评论的正文。',
            coll_id=anthology.coll_id,
            author='admin',
        )
        server = MCPServer.objects.create(
            name='评论 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/comments/',
            source='system',
            enabled=True,
            tools=[],
        )

        agent = Agent.objects.create(name='哈哈', avatar='https://example.com/haha.png')
        result, error_msg = call_mcp_tool(server, 'create_article_annotation', {
            'article_id': article.article_id,
            'selected_text': '可以被唯一划线评论',
            'comment': '这是一条来自 Agent 的评论',
        }, agent=agent)

        self.assertIsNone(error_msg)
        comment = result['annotation']['comments'][0]
        self.assertEqual(comment['creator_avatar'], 'https://example.com/haha.png')
        notification = Notification.objects.get(user__username='admin')
        self.assertEqual(notification.title, '哈哈 评论了《评论通知文章》')
        self.assertEqual(notification.link, f'/article/{anthology.coll_id}/{article.article_id}')

    def test_builtin_comment_mcp_without_agent_context_uses_visitor(self):
        User.objects.create_user(username='admin', password='password')
        anthology = Anthology.objects.create(coll_id='coll_comment_visitor', title='访客评论文集', user_id='admin')
        article = Article.objects.create(
            article_id='art_comment_visitor',
            title='访客评论文章',
            content='这是一段可以被访客划线评论的正文。',
            coll_id=anthology.coll_id,
            author='admin',
        )
        server = MCPServer.objects.create(
            name='评论 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/comments/',
            source='system',
            enabled=True,
            tools=[],
        )

        result, error_msg = call_mcp_tool(server, 'create_article_annotation', {
            'article_id': article.article_id,
            'selected_text': '可以被访客划线评论',
            'comment': '这是一条没有 Agent 上下文的评论',
        })

        self.assertIsNone(error_msg)
        comment = result['annotation']['comments'][0]
        self.assertEqual(comment['creator_name'], '访客')
        self.assertEqual(comment['creator_avatar'], '')

    def test_builtin_comment_mcp_can_match_rendered_highlight_text(self):
        User.objects.create_user(username='admin', password='password')
        anthology = Anthology.objects.create(coll_id='coll_comment_mark', title='高亮评论文集', user_id='admin')
        article = Article.objects.create(
            article_id='art_comment_mark',
            title='高亮评论文章',
            content='`cc-switch` 是一款便捷的可视化工具，支持==快速切换 Claude Code 的 API 配置==。',
            coll_id=anthology.coll_id,
            author='admin',
        )
        server = MCPServer.objects.create(
            name='评论 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/comments/',
            source='system',
            enabled=True,
            tools=[],
        )

        result, error_msg = call_mcp_tool(server, 'create_article_annotation', {
            'article_id': article.article_id,
            'selected_text': 'cc-switch 是一款便捷的可视化工具，支持快速切换 Claude Code 的 API 配置。',
            'comment': '这是一条命中高亮文本的评论',
        })

        self.assertIsNone(error_msg)
        self.assertEqual(
            result['annotation']['selected_text'],
            'cc-switch 是一款便捷的可视化工具，支持快速切换 Claude Code 的 API 配置。',
        )

    def test_builtin_comment_mcp_fuzzy_matches_unknown_inline_markup(self):
        User.objects.create_user(username='admin', password='password')
        anthology = Anthology.objects.create(coll_id='coll_comment_fuzzy', title='兼容评论文集', user_id='admin')
        article = Article.objects.create(
            article_id='art_comment_fuzzy',
            title='兼容评论文章',
            content='[[cc-switch]] 是一款便捷的可视化工具，支持%%快速切换 Claude Code 的 API 配置%%。',
            coll_id=anthology.coll_id,
            author='admin',
        )
        server = MCPServer.objects.create(
            name='评论 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/comments/',
            source='system',
            enabled=True,
            tools=[],
        )

        result, error_msg = call_mcp_tool(server, 'create_article_annotation', {
            'article_id': article.article_id,
            'selected_text': 'cc-switch 是一款便捷的可视化工具，支持快速切换 Claude Code 的 API 配置。',
            'comment': '这是一条通过兼容定位命中的评论',
        })

        self.assertIsNone(error_msg)
        self.assertEqual(
            result['annotation']['selected_text'],
            'cc-switch 是一款便捷的可视化工具，支持快速切换 Claude Code 的 API 配置。',
        )

    def test_builtin_comment_mcp_fuzzy_match_still_requires_unique_text(self):
        User.objects.create_user(username='admin', password='password')
        anthology = Anthology.objects.create(coll_id='coll_comment_fuzzy_unique', title='不唯一评论文集', user_id='admin')
        article = Article.objects.create(
            article_id='art_comment_fuzzy_unique',
            title='不唯一评论文章',
            content=(
                '[[cc-switch]] 是一款便捷的可视化工具，支持%%快速切换 Claude Code 的 API 配置%%。\n'
                '[[cc-switch]] 是一款便捷的可视化工具，支持%%快速切换 Claude Code 的 API 配置%%。'
            ),
            coll_id=anthology.coll_id,
            author='admin',
        )
        server = MCPServer.objects.create(
            name='评论 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/comments/',
            source='system',
            enabled=True,
            tools=[],
        )

        _, error_msg = call_mcp_tool(server, 'create_article_annotation', {
            'article_id': article.article_id,
            'selected_text': 'cc-switch 是一款便捷的可视化工具，支持快速切换 Claude Code 的 API 配置。',
            'comment': '这条评论不应该命中多处文本',
        })

        self.assertIn('文本不唯一', error_msg)

    def test_builtin_comment_mcp_rejects_non_admin_article(self):
        anthology = Anthology.objects.create(coll_id='coll_comment_other', title='其他用户文集', user_id='other-user')
        article = Article.objects.create(
            article_id='art_comment_other',
            title='其他用户文章',
            content='这是一段不应该被系统 MCP 评论的正文。',
            coll_id=anthology.coll_id,
            author='other-user',
        )
        server = MCPServer.objects.create(
            name='评论 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/comments/',
            source='system',
            enabled=True,
            tools=[],
        )

        result, error_msg = call_mcp_tool(server, 'create_article_annotation', {
            'article_id': article.article_id,
            'selected_text': '不应该被系统 MCP 评论',
            'comment': '越权评论',
        })

        self.assertIsNone(result)
        self.assertIn('No Article matches', error_msg)

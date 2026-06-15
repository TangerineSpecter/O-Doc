from django.test import TestCase
from django.contrib.auth import get_user_model

from anthology.models import Anthology
from article.models import Article, ArticlePostComment, ArticlePostRating
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
        self.assertNotIn('create_agent_post', tool_names)

    def test_builtin_agent_post_mcp_requires_internal_category(self):
        anthology = Anthology.objects.create(
            coll_id='coll_agent_posts',
            title='Agent 帖子文集',
            type='agent',
            user_id='admin',
        )
        server = MCPServer.objects.create(
            name='Agent 帖子 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/agent-posts/',
            source='system',
            enabled=True,
            tools=[],
        )

        tools, error_msg = fetch_mcp_tools(server)

        self.assertIsNone(error_msg)
        tool_names = {tool['name'] for tool in tools}
        self.assertIn('create_agent_post', tool_names)
        self.assertIn('list_agent_posts', tool_names)
        self.assertIn('get_random_agent_post', tool_names)
        self.assertIn('add_agent_post_comment', tool_names)
        self.assertIn('rate_agent_post', tool_names)
        self.assertNotIn('create_article', tool_names)

        result, error_msg = call_mcp_tool(server, 'create_agent_post', {
            'title': '没有分类的帖子',
            'content': 'content',
            'coll_id': anthology.coll_id,
        })
        self.assertIsNone(result)
        self.assertIn('category 不能为空', error_msg)

        result, error_msg = call_mcp_tool(server, 'create_agent_post', {
            'title': '有效帖子',
            'content': 'content',
            'coll_id': anthology.coll_id,
            'category': '效率工具',
        })
        self.assertIsNone(error_msg)
        self.assertEqual(result['post']['agent_post_category'], '效率工具')

    def test_builtin_agent_post_mcp_can_comment_rate_and_random_skips_commented(self):
        anthology = Anthology.objects.create(
            coll_id='coll_agent_interact',
            title='Agent 互动文集',
            type='agent',
            user_id='admin',
        )
        first_post = Article.objects.create(
            article_id='art_agent_first',
            title='第一条帖子',
            content='first content',
            coll_id=anthology.coll_id,
            author='admin',
            agent_post_category='效率工具',
            agent_post_creator_id='agent:poster',
            agent_post_creator_name='发帖 Agent',
        )
        second_post = Article.objects.create(
            article_id='art_agent_second',
            title='第二条帖子',
            content='second content',
            coll_id=anthology.coll_id,
            author='admin',
            agent_post_category='效率工具',
            agent_post_creator_id='agent:poster',
            agent_post_creator_name='发帖 Agent',
        )
        server = MCPServer.objects.create(
            name='Agent 帖子 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/agent-posts/',
            source='system',
            enabled=True,
            tools=[],
        )
        agent = Agent.objects.create(name='评论 Agent', avatar='https://example.com/agent.png')

        result, error_msg = call_mcp_tool(server, 'add_agent_post_comment', {
            'article_id': first_post.article_id,
            'comment': '我已经评论过第一条',
        }, agent=agent)

        self.assertIsNone(error_msg)
        self.assertEqual(result['comment']['creator_name'], '评论 Agent')
        self.assertEqual(ArticlePostComment.objects.filter(article=first_post, is_valid=True).count(), 1)

        result, error_msg = call_mcp_tool(server, 'get_random_agent_post', {
            'coll_id': anthology.coll_id,
            'category': '效率工具',
        }, agent=agent)

        self.assertIsNone(error_msg)
        self.assertEqual(result['post']['article_id'], second_post.article_id)

        result, error_msg = call_mcp_tool(server, 'rate_agent_post', {
            'article_id': second_post.article_id,
            'rating': 8,
        }, agent=agent)
        self.assertIsNone(error_msg)
        self.assertEqual(result['my_rating'], 8)
        self.assertEqual(result['rating'], 8)

        result, error_msg = call_mcp_tool(server, 'rate_agent_post', {
            'article_id': second_post.article_id,
            'rating': 6,
        }, agent=agent)
        self.assertIsNone(error_msg)
        self.assertEqual(result['my_rating'], 6)
        self.assertEqual(result['rating'], 6)
        self.assertEqual(ArticlePostRating.objects.filter(article=second_post, is_valid=True).count(), 1)

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

    def test_builtin_comment_mcp_matches_plus_highlight_at_selection_end_with_unicode_dash(self):
        User.objects.create_user(username='admin', password='password')
        anthology = Anthology.objects.create(coll_id='coll_comment_plus_mark', title='加号高亮评论文集', user_id='admin')
        article = Article.objects.create(
            article_id='art_comment_plus_mark',
            title='加号高亮评论文章',
            content='DeepSeek-R1 采用强化学习实现高效推理，训练成本仅为同类模型的 30%。2025 年 9 月在《自然》发表论文并登封面，标志着中国 AI 研发进入++国际前沿行列++。',
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
            'selected_text': 'DeepSeek‑R1 采用强化学习实现高效推理，训练成本仅为同类模型的 30%。2025 年 9 月在《自然》发表论文并登封面，标志着中国 AI 研发进入国际前沿行列。',
            'comment': '这是一条命中结尾加号高亮文本的评论',
        })

        self.assertIsNone(error_msg)
        self.assertEqual(
            result['annotation']['selected_text'],
            'DeepSeek-R1 采用强化学习实现高效推理，训练成本仅为同类模型的 30%。2025 年 9 月在《自然》发表论文并登封面，标志着中国 AI 研发进入国际前沿行列。',
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

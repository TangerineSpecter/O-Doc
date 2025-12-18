import threading

import requests
from django.db import transaction, models
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from article.models import Article
from article.serializers import ArticleSerializer, ArticleTreeSerializer
from system_settings.models import SystemSetting, AIModel
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from utils.web_parser import parse_web_content
from message.models import Notification
from django.contrib.auth import get_user_model

User = get_user_model()

# AI 润色后台任务函数
def background_polish_task(article_id):
    global source_url
    try:
        # 1. 获取文章
        # 重新查询数据库以获取最新状态
        from article.models import Article
        article = Article.objects.get(article_id=article_id)
        article.is_polishing = True
        article.save()
        source_url = article.source_url

        # 2. 获取 AI 配置 (复用 ai_assistant 的逻辑)
        config_obj = SystemSetting.objects.get(key='system_ai_config')
        config = config_obj.value
        model_id = config.get('default_chat_model_id')

        if not model_id:
            print("AI Polishing Error: No default model configured.")
            article.is_polishing = False
            article.save()
            return

        ai_model = AIModel.objects.get(id=model_id)
        provider = ai_model.provider

        # 3. 构造 Prompt
        prompt = f"""
请作为一位专业的资深编辑，对以下技术文章进行润色。
要求：
1. 优化排版（合理使用标题、列表、代码块、加粗等Markdown语法）。
2. 修正错别字和语病，使行文更加流畅专业。
3. **严禁**改变文章原意和核心代码逻辑。
4. 只返回润色后的 Markdown 内容，不要包含任何“好的”、“如下所示”等废话。

待润色内容：
{article.content[:8000]} 
"""
        # 注意：截取前8000字符防止超长，实际生产可根据模型上下文调整

        # 4. 调用 AI 接口 (同步请求)
        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json"
        }
        base_url = provider.base_url.rstrip('/')
        api_url = f"{base_url}/chat/completions"

        payload = {
            "model": ai_model.name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False  # 后台任务不需要流式
        }

        response = requests.post(api_url, headers=headers, json=payload, timeout=120)

        if response.status_code == 200:
            result = response.json()
            polished_content = result['choices'][0]['message']['content']

            # 5. 更新文章
            admin_user = User.objects.filter(username='admin').first()
            article.content = polished_content
            print(f"Article {article_id} polished successfully.")
            Notification.objects.create(
                user=admin_user,
                title=f"《{article.title}》润色完成",
                content=f"您提交的链接：{source_url} 已成功保存到知识库。",
                type="success",
                link=f"/article/{article.coll_id}/{article.article_id}"
            )
        else:
            print(f"AI API Error: {response.text}")

    except Exception as e:
        print(f"Polishing Task Exception: {e}")
        Notification.objects.create(
            user=admin_user,
            title="网页解析失败",
            content=f"链接 {source_url} 解析出错: {str(e)}",
            type="error"
        )

    finally:
        # 无论成功失败，都要关闭状态
        # 需要重新获取 article 对象或者确保当前对象是最新的，这里简单处理
        try:
            from article.models import Article
            a = Article.objects.get(article_id=article_id)
            a.is_polishing = False
            a.save()
        except:
            pass


class ArticleCreateView(APIView):
    """
    创建文章视图
    """

    def post(self, request):
        # 使用事务包装所有数据库操作，确保原子性
        with transaction.atomic():
            serializer = ArticleSerializer(data=request.data, context={'request': request})
            serializer.is_valid(raise_exception=True)

            article = serializer.save()

            # 更新文集文章数量
            from anthology.models import Anthology
            Anthology.objects.filter(coll_id=article.coll_id).update(count=models.F('count') + 1)

            return success_result(data=ArticleSerializer(article).data)


class ArticleDetailView(APIView):
    """
    文章详情视图
    """

    def get(self, request, article_id):
        try:
            # 查找文章
            article = get_object_or_404(Article, article_id=article_id)

            # 更新阅读次数
            article.read_count += 1
            article.save()

            # 序列化响应数据
            response_data = ArticleSerializer(article).data

            return success_result(response_data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleUpdateView(APIView):
    """
    更新文章视图
    """

    def put(self, request, article_id):
        # 查找文章
        article = get_object_or_404(Article, article_id=article_id)
        old_coll_id = article.coll_id

        # 使用序列化器验证请求数据并更新文章
        serializer = ArticleSerializer(article, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # 保存更新
        article = serializer.save()

        # 如果文集ID发生变化，更新两个文集的文章数量
        from anthology.models import Anthology
        if old_coll_id != article.coll_id:
            # 减少旧文集的文章数量
            Anthology.objects.filter(coll_id=old_coll_id).update(count=models.F('count') - 1)
            # 增加新文集的文章数量
            Anthology.objects.filter(coll_id=article.coll_id).update(count=models.F('count') + 1)

        # 序列化响应数据
        response_data = ArticleSerializer(article).data

        return success_result(response_data)


class ArticleDeleteView(APIView):
    """
    删除文章视图（软删除）
    """

    def delete(self, request, article_id):
        try:
            # 查找文章
            article = get_object_or_404(Article, article_id=article_id)

            # 检查是否存在子文章
            has_children = Article.objects.filter(parent=article, is_valid=True).exists()
            if has_children:
                return error_result(ErrorCode.ARTICLE_HAVE_CHILDREN)

            # 软删除：更新is_valid为False
            article.is_valid = False
            article.save()

            # 更新文集文章数量
            from anthology.models import Anthology
            Anthology.objects.filter(coll_id=article.coll_id).update(count=models.F('count') - 1)

            return success_result(data=None)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleListView(APIView):
    """
    文章列表视图，支持多条件查询
    - 支持文集ID查询
    - 支持标签ID查询
    - 支持分类ID查询
    - 支持关键词查询（标题模糊检索）
    """

    def get(self, request):
        try:
            # 获取查询参数
            coll_id = request.GET.get('coll_id')
            tag_id = request.GET.get('tag_id')
            category_id = request.GET.get('category_id')
            keyword = request.GET.get('keyword')

            # 构建查询集
            articles = Article.objects.filter(is_valid=True).order_by('sort', '-updated_at')

            # 文集ID过滤
            if coll_id:
                articles = articles.filter(coll_id=coll_id)

            # 标签ID过滤
            if tag_id:
                articles = articles.filter(tags__tag_id=tag_id)

            # 分类ID过滤
            if category_id:
                articles = articles.filter(category__category_id=category_id)

            # 关键词过滤（标题模糊检索）
            if keyword:
                articles = articles.filter(title__icontains=keyword)

            # 序列化响应数据
            serializer = ArticleSerializer(articles, many=True)

            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleTreeListView(APIView):
    """
    树形结构文章列表视图，按文集ID返回树形结构的文章列表
    - coll_id：文集ID，必传参数
    """

    def get(self, request):
        try:
            # 获取查询参数
            coll_id = request.GET.get('coll_id')

            # 验证文集ID是否存在
            if not coll_id:
                return error_result(error=ErrorCode.PARAMETER_ERROR, data="文集ID不能为空")

            # 构建查询集：只获取文集下的主文章（parent为空），并按sort和更新时间排序
            root_articles = Article.objects.filter(
                is_valid=True,
                coll_id=coll_id,
                parent__isnull=True
            ).order_by('sort', '-updated_at')

            # 使用树形序列化器序列化响应数据
            serializer = ArticleTreeSerializer(root_articles, many=True)

            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class ArticleSaveWebView(APIView):
    """
    保存网页为文章
    """

    def post(self, request):
        url = request.data.get('url')
        coll_id = request.data.get('coll_id')
        need_polishing = request.data.get('need_polishing', False)

        if not url or not coll_id:
            return error_result()

        try:
            # 1. 解析网页
            title, content = parse_web_content(url)

            # 2. 保存文章 (事务内)
            with transaction.atomic():
                article = Article.objects.create(
                    title=title,
                    content=content,
                    coll_id=coll_id,
                    source_url=url,
                    is_polishing=need_polishing,  # 如果需要润色，先标记为 True
                    author=request.user.username if request.user.is_authenticated else 'admin'
                )

                # 更新文集计数
                from anthology.models import Anthology
                Anthology.objects.filter(coll_id=coll_id).update(count=models.F('count') + 1)

            # 3. 如果需要润色，启动异步线程
            if need_polishing:
                thread = threading.Thread(target=background_polish_task, args=(article.article_id,))
                thread.daemon = True  # 设置为守护线程
                thread.start()

            return success_result(data=ArticleSerializer(article).data)

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))

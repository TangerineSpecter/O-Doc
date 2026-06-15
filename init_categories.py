# init_categories.py
import os

import django

# 设置 Django 环境
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "o_doc.settings")
django.setup()

from categories.models import Category
from article.models import Article
from anthology.models import Anthology


def init_uncategorized_category():
    print("=" * 60)
    print("正在初始化【未分类】分类...")

    # 定义未分类的属性
    cat_id = 'uncategorized'
    defaults = {
        'name': '未分类',
        'description': '未关联分类的文章',
        'user_id': 'admin',
        'theme_id': 'slate',  # 对应前端 slate 主题 (灰色)
        'icon_key': 'Box',  # 对应前端 Box 图标
        'sort': 0,
        'is_valid': True
    }

    # 1. 创建或获取分类
    category, created = Category.objects.get_or_create(
        category_id=cat_id,
        defaults=defaults
    )

    if created:
        print(f"\033[92m [✔] 分类【{defaults['name']}】创建成功！ \033[0m")
    else:
        print(f" [!] 分类【{defaults['name']}】已存在，正在检查并更新属性...")
        needs_save = False
        for key, value in defaults.items():
            if getattr(category, key) != value:
                setattr(category, key, value)
                needs_save = True
        if needs_save:
            category.save()
            print(f"\033[92m [✔] 分类属性已更新！ \033[0m")
        else:
            print(" [-] 分类属性无需更新。")

    # 2. 迁移旧的未分类文章 (将 category=NULL 的文章关联到此分类)
    print("-" * 60)
    print("正在检查并迁移悬空文章...")

    article_coll_ids = Anthology.objects.filter(
        user_id='admin',
        type='article',
        is_valid=True
    ).values_list('coll_id', flat=True)

    articles_to_update = Article.objects.filter(
        author='admin',
        is_valid=True,
        coll_id__in=article_coll_ids,
        category__isnull=True
    )

    count = articles_to_update.count()

    if count > 0:
        rows_updated = articles_to_update.update(category=category)
        print(f"\033[92m [✔] 成功将 {rows_updated} 篇未分类文章迁移至新分类。 \033[0m")
    else:
        print(" [-] 暂无需要迁移的文章。")

    # Agent 帖子使用 agent_post_category 作为文集内筛选分类，不应挂到文章分类管理里。
    agent_coll_ids = Anthology.objects.filter(
        user_id='admin',
        type='agent',
        is_valid=True
    ).values_list('coll_id', flat=True)
    agent_posts_to_cleanup = Article.objects.filter(
        author='admin',
        is_valid=True,
        coll_id__in=agent_coll_ids,
        category__isnull=False
    )
    cleanup_count = agent_posts_to_cleanup.count()
    if cleanup_count > 0:
        agent_posts_to_cleanup.update(category=None)
        print(f"\033[92m [✔] 已清理 {cleanup_count} 条 Agent 帖子的文章分类关联。 \033[0m")

    print("=" * 60)


if __name__ == '__main__':
    init_uncategorized_category()
